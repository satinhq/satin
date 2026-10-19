import { visibleInterval } from '../lifecycle/visibleInterval.ts'
import {
  initialAppShellActivationState,
  updateAppShellActivationState,
  type AppShellActivationState,
} from './activationState.ts'
import {
  APP_SHELL_APPLY_UPDATE,
  APP_SHELL_BUILD_ID_REQUEST,
  APP_SHELL_BUILD_ID_RESPONSE,
} from './protocol.ts'
import { checkAppShellUpdate } from './updateCheck.ts'

const DEFAULT_MESSAGE_TIMEOUT_MS = 1_500
const DEFAULT_ACTIVATION_TIMEOUT_MS = 10_000

export interface AppShellBuildState {
  readonly applying: boolean
  readonly current: string | null
  readonly waiting: string | null
}

export interface RegisterAppShellOptions {
  readonly updateProfile?: 'release' | 'preview' | 'hot-reload' | 'dev'
  readonly updateActivation?: 'cold-launch' | 'cold-launch-or-explicit'
  readonly activationTimeoutMs?: number
  readonly messageTimeoutMs?: number
  readonly onStateChange?: (state: AppShellBuildState) => void
  readonly scope?: string
  readonly serviceWorkerUrl?: string
}

export interface SatinAppShellRegistration {
  readonly current: string | null
  readonly registration: ServiceWorkerRegistration
  readonly state: AppShellBuildState
  readonly waiting: string | null
  applyUpdate(): Promise<boolean>
  dispose(): void
  refresh(): Promise<AppShellBuildState>
  subscribe(listener: (state: AppShellBuildState) => void): () => void
}

function publicState(state: AppShellActivationState): AppShellBuildState {
  return {
    applying: state.phase === 'applying',
    current: state.current,
    waiting: state.waiting,
  }
}

function equalState(left: AppShellBuildState, right: AppShellBuildState) {
  return (
    left.applying === right.applying &&
    left.current === right.current &&
    left.waiting === right.waiting
  )
}

async function readWorkerBuildId(worker: ServiceWorker | null, timeoutMs: number) {
  if (!worker) return null

  return new Promise<string | null>(resolve => {
    const channel = new MessageChannel()
    let settled = false
    const finish = (buildId: string | null) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      channel.port1.close()
      resolve(buildId)
    }
    const timeout = window.setTimeout(() => {
      finish(null)
    }, timeoutMs)

    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      const message = event.data
      if (
        typeof message !== 'object' ||
        message === null ||
        !('type' in message) ||
        message.type !== APP_SHELL_BUILD_ID_RESPONSE ||
        !('buildId' in message) ||
        typeof message.buildId !== 'string'
      ) {
        return
      }

      finish(message.buildId)
    }

    try {
      worker.postMessage({ type: APP_SHELL_BUILD_ID_REQUEST }, [channel.port2])
    } catch {
      finish(null)
    }
  })
}

class AppShellRegistrationController implements SatinAppShellRegistration {
  readonly registration: ServiceWorkerRegistration
  private activationResolver: ((result: boolean) => void) | undefined
  private activationTimeout: number | undefined
  private readonly activationTimeoutMs: number
  private readonly updateProfile: 'release' | 'preview' | 'hot-reload' | 'dev'
  private readonly allowExplicitUpdate: boolean
  private disposed = false
  private readonly listenerCleanup = new Set<() => void>()
  private readonly listeners = new Set<(state: AppShellBuildState) => void>()
  private readonly messageTimeoutMs: number
  private refreshSequence = 0
  private reloadForExplicitUpdate = false
  private readonly watchedWorkers = new WeakSet<ServiceWorker>()
  private retryUpdate: () => void = () => {}
  private activationState = initialAppShellActivationState
  private snapshot = publicState(initialAppShellActivationState)

  constructor(registration: ServiceWorkerRegistration, options: RegisterAppShellOptions) {
    this.registration = registration
    this.updateProfile = options.updateProfile ?? 'release'
    this.allowExplicitUpdate =
      this.updateProfile !== 'release' || options.updateActivation === 'cold-launch-or-explicit'
    this.activationTimeoutMs = options.activationTimeoutMs ?? DEFAULT_ACTIVATION_TIMEOUT_MS
    this.messageTimeoutMs = options.messageTimeoutMs ?? DEFAULT_MESSAGE_TIMEOUT_MS

    const controllerChange = () => void this.handleControllerChange()
    navigator.serviceWorker.addEventListener('controllerchange', controllerChange)
    this.listenerCleanup.add(() =>
      navigator.serviceWorker.removeEventListener('controllerchange', controllerChange),
    )

    const updateFound = () => this.watchWorker(this.registration.installing)
    registration.addEventListener('updatefound', updateFound)
    this.listenerCleanup.add(() => registration.removeEventListener('updatefound', updateFound))
    this.watchWorker(registration.installing)
    this.watchWorker(registration.waiting)
    // Registration discovers bundles; the release root owns automatic apply
    // boundaries. Failed checks retry without showing launch/update progress.
    let retry: number | undefined
    const checkUpdate = () => {
      if (retry !== undefined) window.clearTimeout(retry)
      retry = undefined
      if (this.disposed || document.hidden) return
      void checkAppShellUpdate(registration).then(
        () => {
          if (registration.installing) this.retryUpdate()
        },
        () => this.retryUpdate(),
      )
    }
    this.retryUpdate = () => {
      if (!this.disposed && !document.hidden && retry === undefined)
        retry = window.setTimeout(checkUpdate, 30_000)
    }
    this.listenerCleanup.add(() => {
      if (retry !== undefined) window.clearTimeout(retry)
    })
    window.addEventListener('online', checkUpdate)
    this.listenerCleanup.add(() => window.removeEventListener('online', checkUpdate))
    const visibilityChanged = () => {
      if (document.hidden) {
        if (retry !== undefined) window.clearTimeout(retry)
        retry = undefined
      } else checkUpdate()
    }
    document.addEventListener('visibilitychange', visibilityChanged)
    this.listenerCleanup.add(() =>
      document.removeEventListener('visibilitychange', visibilityChanged),
    )
    checkUpdate()
    if (this.updateProfile !== 'release') {
      this.listenerCleanup.add(visibleInterval(checkUpdate, 30_000))
    }
  }

  private watchWorker(worker: ServiceWorker | null) {
    if (!worker || this.watchedWorkers.has(worker)) return
    this.watchedWorkers.add(worker)
    const stateChange = () => {
      if (worker.state === 'redundant') this.retryUpdate()
      void this.refresh()
    }
    worker.addEventListener('statechange', stateChange)
    this.listenerCleanup.add(() => worker.removeEventListener('statechange', stateChange))
  }

  get current() {
    return this.snapshot.current
  }

  get state() {
    return this.snapshot
  }

  get waiting() {
    return this.snapshot.waiting
  }

  private commit(next: AppShellActivationState) {
    this.activationState = next
    const nextSnapshot = publicState(next)
    if (equalState(this.snapshot, nextSnapshot)) return
    this.snapshot = nextSnapshot
    for (const listener of this.listeners) listener(this.snapshot)
  }

  async refresh() {
    const sequence = ++this.refreshSequence
    const [current, waiting] = await Promise.all([
      readWorkerBuildId(this.registration.active, this.messageTimeoutMs),
      readWorkerBuildId(this.registration.waiting, this.messageTimeoutMs),
    ])
    if (this.disposed || sequence !== this.refreshSequence) return this.snapshot

    this.commit(
      updateAppShellActivationState(this.activationState, {
        current,
        type: 'discovered',
        waiting,
      }),
    )
    if (this.updateProfile !== 'release' && this.snapshot.waiting && !this.snapshot.applying)
      void this.applyUpdate()
    return this.snapshot
  }

  subscribe(listener: (state: AppShellBuildState) => void) {
    this.listeners.add(listener)
    listener(this.snapshot)
    return () => this.listeners.delete(listener)
  }

  async applyUpdate() {
    if (this.disposed || !this.allowExplicitUpdate) return false
    const waitingWorker = this.registration.waiting
    const next = updateAppShellActivationState(this.activationState, {
      type: 'apply-requested',
    })
    if (!waitingWorker || next === this.activationState) return false
    this.commit(next)

    const activated = new Promise<boolean>(resolve => {
      this.activationResolver = resolve
      this.activationTimeout = window.setTimeout(() => {
        this.activationResolver = undefined
        this.activationTimeout = undefined
        this.commit(
          updateAppShellActivationState(this.activationState, {
            type: 'activation-failed',
          }),
        )
        void this.refresh()
        resolve(false)
      }, this.activationTimeoutMs)
    })
    this.reloadForExplicitUpdate = true
    try {
      waitingWorker.postMessage({ type: APP_SHELL_APPLY_UPDATE })
    } catch {
      this.reloadForExplicitUpdate = false
      if (this.activationTimeout !== undefined) {
        window.clearTimeout(this.activationTimeout)
        this.activationTimeout = undefined
      }
      this.commit(
        updateAppShellActivationState(this.activationState, {
          type: 'activation-failed',
        }),
      )
      this.activationResolver?.(false)
      this.activationResolver = undefined
    }
    return activated
  }

  private async handleControllerChange() {
    if (this.disposed) return
    const mustReload = this.reloadForExplicitUpdate || this.activationState.phase === 'applying'
    const current = await readWorkerBuildId(
      navigator.serviceWorker.controller ?? this.registration.active,
      this.messageTimeoutMs,
    )
    this.commit(
      updateAppShellActivationState(this.activationState, {
        buildId: current,
        type: 'activated',
      }),
    )

    if (!mustReload) return
    this.reloadForExplicitUpdate = false
    if (this.activationTimeout !== undefined) {
      window.clearTimeout(this.activationTimeout)
      this.activationTimeout = undefined
    }
    this.activationResolver?.(true)
    this.activationResolver = undefined
    window.location.reload()
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.refreshSequence += 1
    if (this.activationTimeout !== undefined) {
      window.clearTimeout(this.activationTimeout)
      this.activationTimeout = undefined
    }
    this.activationResolver?.(false)
    this.activationResolver = undefined
    this.reloadForExplicitUpdate = false
    for (const cleanup of this.listenerCleanup) cleanup()
    this.listenerCleanup.clear()
    this.listeners.clear()
  }
}

export async function registerAppShell(
  options: RegisterAppShellOptions = {},
): Promise<SatinAppShellRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null

  const registration = await navigator.serviceWorker.register(
    options.serviceWorkerUrl ?? '/sw.js',
    {
      scope: options.scope,
      updateViaCache: 'none',
    },
  )
  const controller = new AppShellRegistrationController(registration, options)
  if (options.onStateChange) controller.subscribe(options.onStateChange)
  await controller.refresh()
  return controller
}
