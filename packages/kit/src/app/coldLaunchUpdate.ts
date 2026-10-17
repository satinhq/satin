import type { DownloadProgress } from './launchScreen.ts'
import {
  APP_SHELL_APPLY_BACKGROUND_UPDATE,
  APP_SHELL_APPLY_COLD_UPDATE,
  APP_SHELL_BUILD_ID_REQUEST,
  APP_SHELL_BUILD_ID_RESPONSE,
  APP_SHELL_COLD_UPDATE_DENIED,
  APP_SHELL_VERSION_FILE,
} from '../sw/protocol.ts'

export const COLD_LAUNCH_UPDATE_BUDGET_MS = 800
const ACTIVATION_BUDGET_MS = 3_000
const UPDATED_KEY = 'satin:just-updated:v1:'
// The notification is consumable; permission to reload is not. A new process
// gets a fresh document, while the reload successor burns this document latch.
const launchFuses = new WeakMap<object, Set<string>>()
// WebKit can defer a hidden reload. Until navigation commits, this document
// must retain its successor's marker and refuse another replacement request.
const pendingReloads = new WeakMap<object, Set<string>>()
function reloadUpdatedDocument(scope: string) {
  let scopes = pendingReloads.get(window)
  if (!scopes) {
    scopes = new Set<string>()
    pendingReloads.set(window, scopes)
  }
  scopes.add(scope)
  window.location.reload()
}
// A claim can finish after the app returns to foreground. Keep the document's
// original bundle identity so its next suspension can complete that reload.
const documentWorkers = new WeakMap<
  object,
  Map<
    string,
    {
      readonly worker: ServiceWorker
      readonly buildId: Promise<string | null>
    }
  >
>()
function launchFuse() {
  let scopes = launchFuses.get(window)
  if (!scopes) {
    scopes = new Set<string>()
    launchFuses.set(window, scopes)
  }
  return scopes
}

/** The previous and current build identifiers after an app update. */
export interface JustUpdated {
  readonly previous: string | null
  readonly current: string | null
}

function readBuildId(worker: ServiceWorker | null): Promise<string | null> {
  if (!worker) return Promise.resolve(null)
  return new Promise(resolve => {
    const channel = new MessageChannel()
    let finished = false
    const finish = (id: string | null) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      channel.port1.close()
      resolve(id)
    }
    const timer = setTimeout(() => finish(null), 200)
    channel.port1.onmessage = event => {
      const data = event.data
      if (data?.type === APP_SHELL_BUILD_ID_RESPONSE && typeof data.buildId === 'string')
        finish(data.buildId)
    }
    try {
      worker.postMessage({ type: APP_SHELL_BUILD_ID_REQUEST }, [channel.port2])
    } catch {
      finish(null)
    }
  })
}

function persistUpdated(scope: string, updated: JustUpdated): boolean {
  try {
    // New documents own the ring. Older deployed clients omit ringStart after
    // completing their old-document ring; the successor preserves that full arc.
    sessionStorage.setItem(
      UPDATED_KEY + scope,
      JSON.stringify({ at: Date.now(), ...updated, ringStart: 0 }),
    )
    return Boolean(sessionStorage.getItem(UPDATED_KEY + scope))
  } catch {
    return false
  }
}

export function consumeJustUpdated(scope: string): JustUpdated | null {
  try {
    const key = UPDATED_KEY + scope
    const raw = sessionStorage.getItem(key)
    sessionStorage.removeItem(key)
    if (!raw) return null
    const value: unknown = JSON.parse(raw)
    if (
      typeof value !== 'object' ||
      !value ||
      !('at' in value) ||
      typeof value.at !== 'number' ||
      !Number.isFinite(value.at)
    )
      return null
    if (!('previous' in value) || !('current' in value)) return null
    if (value.previous !== null && typeof value.previous !== 'string') return null
    if (value.current !== null && typeof value.current !== 'string') return null
    launchFuse().add(scope)
    return { previous: value.previous, current: value.current }
  } catch {
    return null
  }
}

/** Optional downloads stay silent until a safe document replacement is committed. */
export async function prepareColdLaunchUpdate(
  scope: string,
  onProgress: (progress: DownloadProgress | null) => void,
  options: {
    readonly background?: boolean
    readonly foreground?: boolean
    readonly canActivate?: () => boolean
  } = {},
): Promise<'current' | 'reloading'> {
  const started = performance.now()
  // Diagnostic sessions opt in before the update check begins.
  const tracing =
    (globalThis as { __SATIN_LAUNCH_UPDATE_TRACE__?: boolean }).__SATIN_LAUNCH_UPDATE_TRACE__ ===
    true
  const trace = (reason: string) => {
    if (!tracing) return
    performance.mark('satin-launch-update', {
      detail: {
        reason,
        elapsedMs: performance.now() - started,
        background: Boolean(options.background),
        foreground: Boolean(options.foreground),
      },
    })
  }
  const current = (reason: string) => {
    trace(reason)
    return 'current' as const
  }
  trace('start')
  if (pendingReloads.get(window)?.has(scope)) return 'reloading'
  const resume = options.background || options.foreground
  if (!resume && launchFuse().has(scope)) return current('launch-fuse')
  if (!('serviceWorker' in navigator)) return current('offline-or-unavailable')
  const workers = navigator.serviceWorker
  // The first connected installation has no old controlled document to replace.
  if (!workers.controller) return current('uncontrolled')
  let scopedDocuments = documentWorkers.get(window)
  if (!scopedDocuments) {
    scopedDocuments = new Map()
    documentWorkers.set(window, scopedDocuments)
  }
  let documentWorker = scopedDocuments.get(scope)
  if (!documentWorker) {
    documentWorker = { worker: workers.controller, buildId: readBuildId(workers.controller) }
    scopedDocuments.set(scope, documentWorker)
  }
  if (resume && workers.controller !== documentWorker.worker) {
    if (options.canActivate && !options.canActivate()) return current('activation-no-longer-safe')
    const [previous, currentBuild] = await Promise.all([
      documentWorker.buildId,
      readBuildId(workers.controller),
    ])
    if (options.canActivate && !options.canActivate()) return current('activation-no-longer-safe')
    if (!persistUpdated(scope, { previous, current: currentBuild }))
      return current('reload-fuse-unavailable')
    if (options.canActivate && !options.canActivate()) return current('activation-no-longer-safe')
    trace(options.background ? 'claimed-background-reload' : 'claimed-foreground-reload')
    reloadUpdatedDocument(scope)
    return 'reloading'
  }
  const checkStarted = started
  let lookupReason = 'no-registration'
  let lookupTimer: ReturnType<typeof setTimeout> | undefined
  const registration = await Promise.race([
    workers.getRegistration(scope).catch(() => {
      lookupReason = 'registration-error'
      return undefined
    }),
    new Promise<undefined>(resolve => {
      lookupTimer = setTimeout(() => {
        lookupReason = 'lookup-budget'
        resolve(undefined)
      }, COLD_LAUNCH_UPDATE_BUDGET_MS)
    }),
  ])
  clearTimeout(lookupTimer)
  if (!registration) return current(lookupReason)
  if (!registration.active) return current('no-active-worker')
  if (registration.active.state !== 'activated') return current('active-not-ready')
  if (navigator.onLine === false && !registration.waiting) return current('offline')
  const remainingCheckMs = Math.max(
    0,
    COLD_LAUNCH_UPDATE_BUDGET_MS - (performance.now() - checkStarted),
  )
  if (!registration.waiting && !registration.installing && remainingCheckMs === 0)
    return current('lookup-budget')

  return new Promise(resolve => {
    let finished = false
    let downloading = false
    let discovered = false
    const discovery = new AbortController()
    let activating = false
    let activationTarget: ServiceWorker | null = null
    let observed: ServiceWorker | null = null
    let checkTimer: ReturnType<typeof setTimeout> | undefined
    let activationTimer: ReturnType<typeof setTimeout> | undefined
    const previousId = documentWorker.buildId
    const cleanup = () => {
      clearTimeout(checkTimer)
      clearTimeout(activationTimer)
      discovery.abort()
      registration.removeEventListener('updatefound', inspect)
      observed?.removeEventListener('statechange', inspect)
      workers.removeEventListener('message', receive)
      workers.removeEventListener('controllerchange', changed)
    }
    const finish = (result: 'current' | 'reloading', reason: string) => {
      if (finished) return
      finished = true
      trace(reason)
      cleanup()
      if (result === 'current') {
        if (!resume && activating && workers.controller !== activationTarget)
          launchFuse().delete(scope)
        onProgress(null)
      }
      resolve(result)
    }
    const changed = async () => {
      if (finished) return
      trace('controllerchange')
      const [previous, current] = await Promise.all([previousId, readBuildId(workers.controller)])
      if (finished) return
      if (options.canActivate && !options.canActivate()) {
        finish('current', 'activation-no-longer-safe')
        return
      }
      // Refuse a reload unless its successor can read the fuse. Without storage,
      // claim is still safe, but the current document must remain in place.
      if (!persistUpdated(scope, { previous, current })) {
        finish('current', 'reload-fuse-unavailable')
        return
      }
      // The successor confirms the update. Keep this document's cover unchanged
      // through reload instead of playing a second ring before replacement.
      clearTimeout(activationTimer)
      if (options.canActivate && !options.canActivate()) {
        finish('current', 'activation-no-longer-safe')
        return
      }
      finish('reloading', 'reload')
      reloadUpdatedDocument(scope)
    }
    const activate = async (worker: ServiceWorker) => {
      if (finished || activating) return
      if (!resume && launchFuse().has(scope)) {
        finish('current', 'launch-fuse')
        return
      }
      if (options.canActivate && !options.canActivate()) {
        finish('current', 'activation-no-longer-safe')
        return
      }
      trace('activation-request')
      activating = true
      if (!resume) launchFuse().add(scope)
      activationTarget = worker
      clearTimeout(checkTimer)
      // Keep the cover through the document reload.
      activationTimer = setTimeout(
        () => finish('current', 'activation-budget'),
        ACTIVATION_BUDGET_MS,
      )
      const previousBuildId = await previousId
      if (finished) return
      if (options.canActivate && !options.canActivate()) {
        finish('current', 'activation-no-longer-safe')
        return
      }
      workers.addEventListener('controllerchange', changed)
      try {
        worker.postMessage({
          previousBuildId,
          type: options.background
            ? APP_SHELL_APPLY_BACKGROUND_UPDATE
            : APP_SHELL_APPLY_COLD_UPDATE,
        })
      } catch {
        finish('current', 'post-message-error')
      }
    }
    const receive = (event: MessageEvent) => {
      if (finished) return
      if (event.data?.type === APP_SHELL_COLD_UPDATE_DENIED && event.source === activationTarget) {
        finish('current', 'activation-denied')
        return
      }
    }
    const inspect = () => {
      // Activation empties waiting/installing before clients.claim() changes
      // the controller. Only controllerchange (or its budget) ends this phase.
      if (finished || activating) return
      const waiting = registration.waiting
      if (waiting) {
        void activate(waiting)
        return
      }
      const installing = registration.installing
      if (!installing) {
        if (downloading)
          finish(
            'current',
            observed?.state === 'redundant' ? 'install-redundant' : 'installing-disappeared',
          )
        return
      }
      if (installing.state === 'redundant') {
        finish('current', 'install-redundant')
        return
      }
      if (installing !== observed) {
        observed?.removeEventListener('statechange', inspect)
        observed = installing
        observed.addEventListener('statechange', inspect)
        try {
          observed.postMessage?.({ type: 'SATIN_DOWNLOAD_PROGRESS_REQUEST' })
        } catch {
          finish('current', 'progress-request-error')
          return
        }
      }
      if (!downloading) {
        trace('download-start')
        downloading = true
      }
    }
    workers.addEventListener('message', receive)
    registration.addEventListener('updatefound', inspect)
    checkTimer = setTimeout(() => finish('current', 'check-budget'), remainingCheckMs)
    inspect()
    if (
      navigator.onLine !== false &&
      !downloading &&
      !activating &&
      !registration.waiting &&
      !finished
    ) {
      // WebKit can fetch sw.js immediately but publish installing >1s later.
      // A small generated network-only hint discovers that new build within
      // the same check budget. It never authorizes activation or fabricates
      // byte progress: the real install must still finish successfully.
      void Promise.all([
        previousId,
        fetch(scope + APP_SHELL_VERSION_FILE, { cache: 'no-store', signal: discovery.signal })
          .then(async response => (response.ok ? ((await response.json()) as unknown) : null))
          .catch(() => null),
      ]).then(([currentId, version]) => {
        if (
          finished ||
          activating ||
          downloading ||
          !currentId ||
          !version ||
          typeof version !== 'object' ||
          !('format' in version) ||
          version.format !== 1 ||
          !('buildId' in version) ||
          typeof version.buildId !== 'string' ||
          !version.buildId ||
          version.buildId === currentId
        )
          return
        discovered = true
        trace('version-discovered')
      })
      // WebKit may settle update() after installation. updatefound, not that
      // promise, moves the gate into the download state.
      try {
        void checkAppShellUpdate(registration).then(
          () => {
            if (!finished && !downloading && !activating) {
              inspect()
              if (!downloading && !activating && !discovered) finish('current', 'check-complete')
            }
          },
          () => {
            if (!activating) finish('current', 'check-error')
          },
        )
      } catch {
        finish('current', 'check-error')
      }
    }
  })
}
import { checkAppShellUpdate } from '../sw/updateCheck.ts'
