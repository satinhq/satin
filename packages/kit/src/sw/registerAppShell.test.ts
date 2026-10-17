import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  APP_SHELL_APPLY_UPDATE,
  APP_SHELL_BUILD_ID_REQUEST,
  APP_SHELL_BUILD_ID_RESPONSE,
} from './protocol.ts'
import { registerAppShell } from './registerAppShell.ts'

class TestWorker extends EventTarget {
  readonly buildId: string
  onApplyUpdate: (() => void) | undefined
  readonly state = 'installed'

  constructor(buildId: string) {
    super()
    this.buildId = buildId
  }

  postMessage(message: unknown, transfer: readonly MessagePort[] = []) {
    if (
      typeof message === 'object' &&
      message !== null &&
      'type' in message &&
      message.type === APP_SHELL_BUILD_ID_REQUEST
    ) {
      transfer[0]?.postMessage({
        buildId: this.buildId,
        type: APP_SHELL_BUILD_ID_RESPONSE,
      })
      return
    }

    if (
      typeof message === 'object' &&
      message !== null &&
      'type' in message &&
      message.type === APP_SHELL_APPLY_UPDATE
    ) {
      this.onApplyUpdate?.()
    }
  }
}

class TestRegistration extends EventTarget {
  update = vi.fn(async () => {})
  active: TestWorker | null
  installing: TestWorker | null = null
  waiting: TestWorker | null

  constructor(active: TestWorker, waiting: TestWorker) {
    super()
    this.active = active
    this.waiting = waiting
  }
}

class TestServiceWorkerContainer extends EventTarget {
  controller: TestWorker | null
  readonly registration: TestRegistration
  readonly register = vi.fn()

  constructor(registration: TestRegistration) {
    super()
    this.registration = registration
    this.controller = registration.active
    this.register.mockResolvedValue(registration)
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('registerAppShell', () => {
  it('reports a release update without applying or reloading during use', async () => {
    const current = new TestWorker('old-build')
    const waiting = new TestWorker('new-build')
    const registration = new TestRegistration(current, waiting)
    const serviceWorker = new TestServiceWorkerContainer(registration)
    const reload = vi.fn()
    vi.stubGlobal('navigator', { serviceWorker })
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      setInterval: globalThis.setInterval,
      clearInterval: globalThis.clearInterval,
      clearTimeout: globalThis.clearTimeout,
      location: { reload },
      setTimeout: globalThis.setTimeout,
    })

    waiting.onApplyUpdate = () => {
      registration.active = waiting
      registration.waiting = null
      serviceWorker.controller = waiting
      serviceWorker.dispatchEvent(new Event('controllerchange'))
    }

    const appShell = await registerAppShell({
      activationTimeoutMs: 1_000,
      messageTimeoutMs: 100,
    })

    expect(serviceWorker.register).toHaveBeenCalledWith('/sw.js', {
      scope: undefined,
      updateViaCache: 'none',
    })
    expect(appShell?.state).toEqual({
      applying: false,
      current: 'old-build',
      waiting: 'new-build',
    })
    expect(reload).not.toHaveBeenCalled()

    await expect(appShell?.applyUpdate()).resolves.toBe(false)
    expect(registration.update).toHaveBeenCalledOnce()
    expect(registration.active).toBe(current)
    expect(registration.waiting).toBe(waiting)
    expect(reload).not.toHaveBeenCalled()
    appShell?.dispose()
  })
})

it('uses the existing live-update policy for the named preview profile', async () => {
  const current = new TestWorker('old-build')
  const waiting = new TestWorker('new-build')
  const registration = new TestRegistration(current, waiting)
  const serviceWorker = new TestServiceWorkerContainer(registration)
  const reload = vi.fn()
  vi.stubGlobal('navigator', { serviceWorker })
  vi.stubGlobal('window', {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
    clearTimeout: globalThis.clearTimeout,
    setTimeout: globalThis.setTimeout,
    location: { reload },
  })
  waiting.onApplyUpdate = () => {
    registration.active = waiting
    registration.waiting = null
    serviceWorker.controller = waiting
    serviceWorker.dispatchEvent(new Event('controllerchange'))
  }
  const appShell = await registerAppShell({ updateProfile: 'preview', messageTimeoutMs: 100 })
  await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce())
  expect(appShell?.current).toBe('new-build')
  appShell?.dispose()
})

it('keeps explicit activation available in the release compatibility policy', async () => {
  const current = new TestWorker('old-build')
  const waiting = new TestWorker('new-build')
  const registration = new TestRegistration(current, waiting)
  const serviceWorker = new TestServiceWorkerContainer(registration)
  const reload = vi.fn()
  vi.stubGlobal('navigator', { serviceWorker })
  vi.stubGlobal('window', {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    clearTimeout: globalThis.clearTimeout,
    setTimeout: globalThis.setTimeout,
    location: { reload },
  })
  waiting.onApplyUpdate = () => {
    registration.active = waiting
    registration.waiting = null
    serviceWorker.controller = waiting
    serviceWorker.dispatchEvent(new Event('controllerchange'))
  }
  const appShell = await registerAppShell({
    updateProfile: 'release',
    updateActivation: 'cold-launch-or-explicit',
    messageTimeoutMs: 100,
  })
  expect(await appShell?.applyUpdate()).toBe(true)
  expect(reload).toHaveBeenCalledOnce()
  appShell?.dispose()
})

it.each(['installing', 'redundant'] as const)(
  'retries a %s replacement in the background without applying it',
  async state => {
    const current = new TestWorker('usable')
    const replacement = new TestWorker('replacement')
    const registration = new TestRegistration(current, replacement)
    registration.waiting = null
    registration.installing = state === 'installing' ? replacement : null
    const serviceWorker = new TestServiceWorkerContainer(registration)
    let retry: (() => void) | undefined
    const reload = vi.fn()
    vi.stubGlobal('navigator', { serviceWorker })
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      clearTimeout: globalThis.clearTimeout,
      setTimeout: (callback: () => void, delay: number) => {
        if (delay === 30_000) {
          retry = callback
          return 0
        }
        return globalThis.setTimeout(callback, delay)
      },
      location: { reload },
    })
    const appShell = await registerAppShell({ messageTimeoutMs: 100 })
    if (state === 'redundant') {
      registration.installing = replacement
      registration.dispatchEvent(new Event('updatefound'))
      Object.defineProperty(replacement, 'state', { value: 'redundant' })
      registration.installing = null
      replacement.dispatchEvent(new Event('statechange'))
    }
    expect(retry).toBeTypeOf('function')
    retry!()
    await vi.waitFor(() => expect(registration.update).toHaveBeenCalledTimes(2))
    expect(registration.active).toBe(current)
    expect(reload).not.toHaveBeenCalled()
    await appShell?.refresh()
    appShell?.dispose()
  },
)
