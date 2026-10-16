import { createMediaStore } from '../media/controller.ts'
import { mayApplyBackgroundUpdate } from './backgroundUpdate.ts'
import { afterEach, expect, it, vi } from 'vitest'
import {
  COLD_LAUNCH_UPDATE_BUDGET_MS,
  consumeJustUpdated,
  prepareColdLaunchUpdate,
} from './coldLaunchUpdate.ts'
import {
  APP_SHELL_APPLY_BACKGROUND_UPDATE,
  APP_SHELL_APPLY_COLD_UPDATE,
  APP_SHELL_BUILD_ID_REQUEST,
  APP_SHELL_BUILD_ID_RESPONSE,
  APP_SHELL_COLD_UPDATE_DENIED,
} from '../sw/protocol.ts'

class Worker extends EventTarget {
  state: ServiceWorkerState
  readonly buildId: string
  readonly postMessage = vi.fn((message: { type: string }, transfer?: MessagePort[]) => {
    if (message.type === APP_SHELL_BUILD_ID_REQUEST)
      transfer?.[0]?.postMessage({ type: APP_SHELL_BUILD_ID_RESPONSE, buildId: this.buildId })
    if (
      message.type === APP_SHELL_APPLY_COLD_UPDATE ||
      message.type === APP_SHELL_APPLY_BACKGROUND_UPDATE
    )
      this.apply?.()
  })
  apply?: () => void
  constructor(state: ServiceWorkerState, buildId = 'build-b') {
    super()
    this.state = state
    this.buildId = buildId
  }
}

function fixture() {
  const active = new Worker('activated', 'build-a')
  const registration = Object.assign(new EventTarget(), {
    active,
    installing: null as Worker | null,
    waiting: null as Worker | null,
    update: vi.fn(async () => {}),
  })
  const workers = Object.assign(new EventTarget(), {
    controller: active as Worker,
    getRegistration: vi.fn(async () => registration),
  })
  vi.stubGlobal('navigator', { onLine: true, serviceWorker: workers })
  vi.stubGlobal('window', { location: { reload: vi.fn() } })
  const values = new Map<string, string>()
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  })
  return { active, registration, workers }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('opens the current build when a check finds no update', async () => {
  const { registration } = fixture()
  const progress = vi.fn()
  expect(await prepareColdLaunchUpdate('/app/', progress)).toBe('current')
  expect(registration.update).toHaveBeenCalledOnce()
})

it('does not reload a first installation without an old controlling worker', async () => {
  const { registration, workers } = fixture()
  Object.defineProperty(workers, 'controller', { value: null })
  registration.waiting = new Worker('installed')
  expect(await prepareColdLaunchUpdate('/app/', vi.fn())).toBe('current')
  expect(workers.getRegistration).not.toHaveBeenCalled()
  expect(registration.update).not.toHaveBeenCalled()
  expect(registration.waiting.postMessage).not.toHaveBeenCalled()
  expect(window.location.reload).not.toHaveBeenCalled()
  expect(consumeJustUpdated('/app/')).toBeNull()
})

it('activates an already installed waiting worker offline without a network check', async () => {
  const { registration, workers } = fixture()
  const next = new Worker('installed')
  registration.waiting = next
  next.apply = () => {
    workers.controller = next
    navigator.serviceWorker.dispatchEvent(new Event('controllerchange'))
  }
  vi.stubGlobal('navigator', { onLine: false, serviceWorker: navigator.serviceWorker })
  expect(await prepareColdLaunchUpdate('/app/', vi.fn())).toBe('reloading')
  expect(registration.update).not.toHaveBeenCalled()
})

it('bounds an unanswered check and leaves a later update waiting', async () => {
  vi.useFakeTimers()
  const { registration } = fixture()
  registration.update.mockImplementation(() => new Promise(() => {}))
  const pending = prepareColdLaunchUpdate('/app/', vi.fn())
  await vi.advanceTimersByTimeAsync(COLD_LAUNCH_UPDATE_BUDGET_MS + 1)
  expect(await pending).toBe('current')
  registration.installing = new Worker('installing')
  registration.dispatchEvent(new Event('updatefound'))
  expect(registration.installing.postMessage).not.toHaveBeenCalled()
})

it('keeps the old ring hidden and lets the successor confirm an update found in budget', async () => {
  const { registration, workers } = fixture()
  const next = new Worker('installing')
  registration.update.mockImplementation(() => new Promise(() => {}))
  const progress = vi.fn()
  const pending = prepareColdLaunchUpdate('/app/', progress)
  await vi.waitFor(() => expect(registration.update).toHaveBeenCalledOnce())
  registration.installing = next
  registration.dispatchEvent(new Event('updatefound'))
  workers.dispatchEvent(
    Object.assign(new Event('message'), {
      source: next,
      data: { type: 'SATIN_DOWNLOAD_PROGRESS', loaded: 40, total: 100, downloading: true },
    }),
  )
  // An optional download may time out or be denied. Its bytes cannot promise
  // that this document is being replaced until the worker has claimed it.
  expect(progress).not.toHaveBeenCalled()
  next.apply = () => {
    workers.controller = next
    workers.dispatchEvent(new Event('controllerchange'))
  }
  next.state = 'installed'
  registration.installing = null
  registration.waiting = next
  next.dispatchEvent(new Event('statechange'))
  expect(await pending).toBe('reloading')
  expect(progress).not.toHaveBeenCalled()
  expect(JSON.parse(sessionStorage.getItem('satin:just-updated:v1:/app/')!)).toMatchObject({
    ringStart: 0,
  })
  expect(window.location.reload).toHaveBeenCalledOnce()
  expect(consumeJustUpdated('/app/')).toEqual({ previous: 'build-a', current: 'build-b' })
  expect(consumeJustUpdated('/app/')).toBeNull()
})

it('preserves update confirmation when the old document runs again before reload commits', async () => {
  const { registration, workers } = fixture()
  const next = new Worker('installed')
  registration.waiting = next
  next.apply = () => {
    workers.controller = next
    registration.waiting = null
    workers.dispatchEvent(new Event('controllerchange'))
  }
  expect(await prepareColdLaunchUpdate('/app/', vi.fn(), { background: true })).toBe('reloading')
  // WebKit may defer the requested navigation until resume. Events in this
  // document must neither consume the successor's confirmation nor reload twice.
  await prepareColdLaunchUpdate('/app/', vi.fn(), { foreground: true, canActivate: () => false })
  expect(consumeJustUpdated('/app/')).toEqual({ previous: 'build-a', current: 'build-b' })
  await prepareColdLaunchUpdate('/app/', vi.fn(), { foreground: true })
  expect(window.location.reload).toHaveBeenCalledOnce()
})

it('activates a previously waiting build before reveal', async () => {
  const { registration, workers } = fixture()
  const next = new Worker('installed')
  registration.waiting = next
  next.apply = () => {
    workers.controller = next
    workers.dispatchEvent(new Event('controllerchange'))
  }
  expect(await prepareColdLaunchUpdate('/app/', vi.fn())).toBe('reloading')
  expect(registration.update).not.toHaveBeenCalled()
})

it('falls back when an installing download fails', async () => {
  const { registration } = fixture()
  const next = new Worker('installing')
  registration.installing = next
  const pending = prepareColdLaunchUpdate('/app/', vi.fn())
  next.state = 'redundant'
  registration.installing = null
  next.dispatchEvent(new Event('statechange'))
  expect(await pending).toBe('current')
  expect(window.location.reload).not.toHaveBeenCalled()
})

it('keeps the current build when another scoped client blocks cold activation', async () => {
  const { registration, workers } = fixture()
  const next = new Worker('installed')
  registration.waiting = next
  next.apply = () =>
    workers.dispatchEvent(
      Object.assign(new Event('message'), {
        source: next,
        data: { type: APP_SHELL_COLD_UPDATE_DENIED },
      }),
    )
  expect(await prepareColdLaunchUpdate('/app/', vi.fn())).toBe('current')
  expect(window.location.reload).not.toHaveBeenCalled()
})

it('leaves a waiting build alone if the suspended app becomes active before activation', async () => {
  const { registration } = fixture()
  const next = new Worker('installed')
  registration.waiting = next
  expect(
    await prepareColdLaunchUpdate('/app/', vi.fn(), { background: true, canActivate: () => false }),
  ).toBe('current')
  expect(next.postMessage).not.toHaveBeenCalledWith(
    expect.objectContaining({ type: APP_SHELL_APPLY_BACKGROUND_UPDATE }),
  )
  expect(window.location.reload).not.toHaveBeenCalled()
})

it('does not let repeated unchanged byte samples keep a stalled download covered', async () => {
  vi.useFakeTimers()
  const { registration, workers } = fixture()
  const next = new Worker('installing')
  registration.installing = next
  const pending = prepareColdLaunchUpdate('/app/', vi.fn())
  await vi.advanceTimersByTimeAsync(1)
  const sample = () =>
    workers.dispatchEvent(
      Object.assign(new Event('message'), {
        source: next,
        data: { type: 'SATIN_DOWNLOAD_PROGRESS', loaded: 40, total: 100, downloading: true },
      }),
    )
  sample()
  for (let i = 0; i < 6; i++) {
    await vi.advanceTimersByTimeAsync(1000)
    sample()
  }
  expect(await pending).toBe('current')
  expect(window.location.reload).not.toHaveBeenCalled()
})

it('does not reload after the activation budget when claim arrives late', async () => {
  vi.useFakeTimers()
  const { registration, workers } = fixture()
  const next = new Worker('installed')
  registration.waiting = next
  const pending = prepareColdLaunchUpdate('/app/', vi.fn())
  await vi.advanceTimersByTimeAsync(3001)
  expect(await pending).toBe('current')
  registration.waiting = null
  registration.active = next
  workers.controller = next
  workers.dispatchEvent(new Event('controllerchange'))
  await vi.advanceTimersByTimeAsync(201)
  expect(workers.controller).toBe(next)
  expect(registration.active).toBe(next)
  expect(registration.waiting).toBeNull()
  expect(window.location.reload).not.toHaveBeenCalled()
})

it('reloads after claim without starting or completing a ring in the old document', async () => {
  vi.useFakeTimers()
  const { registration, workers } = fixture()
  const completingRing = vi.fn(() => new Promise<boolean>(() => {}))
  Object.assign(window, { __SATIN_LAUNCH_SCREEN__: { complete: completingRing } })
  vi.stubGlobal('document', { getElementById: vi.fn() })
  const next = new Worker('installed')
  registration.waiting = next
  next.apply = () => {
    workers.controller = next
    workers.dispatchEvent(new Event('controllerchange'))
  }
  const progress = vi.fn()
  const pending = prepareColdLaunchUpdate('/app/', progress)
  await vi.advanceTimersByTimeAsync(100)
  expect(completingRing).not.toHaveBeenCalled()
  expect(await pending).toBe('reloading')
  expect(progress).not.toHaveBeenCalled()
  expect(window.location.reload).toHaveBeenCalledOnce()
})

it('follows a replacement download without activating the superseded worker', async () => {
  const { registration, workers } = fixture()
  const b = new Worker('installing', 'b')
  const c = new Worker('installing', 'c')
  registration.installing = b
  const pending = prepareColdLaunchUpdate('/app/', vi.fn())
  await vi.waitFor(() => expect(b.postMessage).toHaveBeenCalled())
  registration.installing = c
  registration.dispatchEvent(new Event('updatefound'))
  b.state = 'redundant'
  b.dispatchEvent(new Event('statechange'))
  c.apply = () => {
    registration.waiting = null
    registration.installing = null
    c.state = 'activating'
    c.dispatchEvent(new Event('statechange'))
    workers.controller = c
    workers.dispatchEvent(new Event('controllerchange'))
  }
  c.state = 'installed'
  registration.installing = null
  registration.waiting = c
  c.dispatchEvent(new Event('statechange'))
  expect(await pending).toBe('reloading')
  expect(b.postMessage).not.toHaveBeenCalledWith(
    expect.objectContaining({ type: APP_SHELL_APPLY_COLD_UPDATE }),
  )
  expect(consumeJustUpdated('/app/')).toEqual({ previous: 'build-a', current: 'c' })
})

it('does not start another check when an already waiting worker moves to active', async () => {
  const { registration, workers } = fixture()
  const next = new Worker('installed')
  registration.waiting = next
  next.apply = () => {
    registration.waiting = null
    next.state = 'activating'
    workers.controller = next
    workers.dispatchEvent(new Event('controllerchange'))
  }
  expect(await prepareColdLaunchUpdate('/app/', vi.fn())).toBe('reloading')
  expect(registration.update).not.toHaveBeenCalled()
})

it('bounds a slow download even when bytes keep arriving and ignores its late install', async () => {
  vi.useFakeTimers()
  const { registration, workers } = fixture()
  const next = new Worker('installing')
  registration.installing = next
  const progress = vi.fn()
  const pending = prepareColdLaunchUpdate('/app/', progress)
  await vi.advanceTimersByTimeAsync(1)
  for (let loaded = 1; loaded <= 8; loaded++) {
    workers.dispatchEvent(
      Object.assign(new Event('message'), {
        source: next,
        data: { type: 'SATIN_DOWNLOAD_PROGRESS', loaded, total: 100, downloading: true },
      }),
    )
    await vi.advanceTimersByTimeAsync(100)
  }
  expect(await pending).toBe('current')
  expect(progress).toHaveBeenLastCalledWith(null)
  expect(progress.mock.calls.every(([sample]) => sample === null)).toBe(true)
  registration.installing = null
  registration.waiting = next
  next.state = 'installed'
  next.dispatchEvent(new Event('statechange'))
  expect(next.postMessage).not.toHaveBeenCalledWith(
    expect.objectContaining({ type: APP_SHELL_APPLY_COLD_UPDATE }),
  )
  expect(window.location.reload).not.toHaveBeenCalled()
})

it('opens offline with no waiting worker without checking the network', async () => {
  const { registration } = fixture()
  vi.stubGlobal('navigator', { onLine: false, serviceWorker: navigator.serviceWorker })
  expect(await prepareColdLaunchUpdate('/app/', vi.fn())).toBe('current')
  expect(registration.update).not.toHaveBeenCalled()
  expect(window.location.reload).not.toHaveBeenCalled()
})

it('burns the launch fuse across the reload even if a second worker is waiting', async () => {
  const { registration, workers } = fixture()
  const next = new Worker('installed', 'build-b')
  registration.waiting = next
  next.apply = () => {
    next.state = 'activated'
    registration.active = next
    workers.controller = next
    workers.dispatchEvent(new Event('controllerchange'))
  }
  expect(await prepareColdLaunchUpdate('/app/', vi.fn())).toBe('reloading')
  // A fresh module is the next document, but sessionStorage survives the reload.
  vi.resetModules()
  const fresh = await import('./coldLaunchUpdate.ts')
  expect(fresh.consumeJustUpdated('/app/')).toEqual({ previous: 'build-a', current: 'build-b' })
  const third = new Worker('installed', 'build-c')
  third.apply = () => {
    third.state = 'activated'
    registration.active = third
    workers.controller = third
    workers.dispatchEvent(new Event('controllerchange'))
  }
  registration.waiting = third
  expect(await fresh.prepareColdLaunchUpdate('/app/', vi.fn())).toBe('current')
  expect(await fresh.prepareColdLaunchUpdate('/app/', vi.fn())).toBe('current')
  expect(third.postMessage).not.toHaveBeenCalled()
  expect(registration.update).not.toHaveBeenCalled()
  expect(window.location.reload).toHaveBeenCalledOnce()
})

it('rechecks suspension after the claiming worker answers its build ID', async () => {
  const { registration, workers } = fixture()
  const next = new Worker('installed')
  registration.waiting = next
  let hidden = true
  let answer: MessagePort | undefined
  next.postMessage.mockImplementation((message, ports) => {
    if (message.type === APP_SHELL_BUILD_ID_REQUEST) answer = ports?.[0]
    if (message.type === APP_SHELL_APPLY_BACKGROUND_UPDATE) {
      next.state = 'activated'
      registration.waiting = null
      registration.active = next
      workers.controller = next
      workers.dispatchEvent(new Event('controllerchange'))
    }
  })
  const pending = prepareColdLaunchUpdate('/app/', vi.fn(), {
    background: true,
    canActivate: () => hidden,
  })
  await vi.waitFor(() => expect(answer).toBeDefined())
  hidden = false
  answer!.postMessage({ type: APP_SHELL_BUILD_ID_RESPONSE, buildId: 'build-b' })
  expect(await pending).toBe('current')
  expect(workers.controller).toBe(next)
  expect(registration.active).toBe(next)
  expect(registration.waiting).toBeNull()
  expect(next.state).toBe('activated')
  expect(window.location.reload).not.toHaveBeenCalled()
  hidden = true
  next.postMessage.mockImplementation((message, ports) => {
    if (message.type === APP_SHELL_BUILD_ID_REQUEST)
      ports?.[0]?.postMessage({ type: APP_SHELL_BUILD_ID_RESPONSE, buildId: 'build-b' })
  })
  expect(
    await prepareColdLaunchUpdate('/app/', vi.fn(), {
      background: true,
      canActivate: () => hidden,
    }),
  ).toBe('reloading')
})

it('keeps the claimed document when a reload fuse cannot be persisted', async () => {
  const { registration, workers } = fixture()
  const next = new Worker('installed')
  registration.waiting = next
  vi.stubGlobal('sessionStorage', {
    getItem: () => null,
    removeItem: vi.fn(),
    setItem: () => {
      throw new Error('Unavailable')
    },
  })
  next.apply = () => {
    registration.waiting = null
    registration.active = next
    workers.controller = next
    workers.dispatchEvent(new Event('controllerchange'))
  }
  expect(await prepareColdLaunchUpdate('/app/', vi.fn())).toBe('current')
  expect(workers.controller).toBe(next)
  expect(window.location.reload).not.toHaveBeenCalled()
})

it('holds a hidden update during a racing play attempt and track handoff, then permits explicit stop', async () => {
  const { registration, workers } = fixture()
  const page = Object.assign(new EventTarget(), { hidden: true })
  vi.stubGlobal('document', page)
  const element = Object.assign(new EventTarget(), {
    src: '',
    currentSrc: '',
    readyState: 0,
    duration: 120,
    currentTime: 0,
    paused: true,
    ended: false,
    seeking: false,
    error: null,
    playbackRate: 1,
    seekable: { length: 1, start: () => 0, end: () => 120 },
    pause(this: EventTarget & { paused: boolean }) {
      this.paused = true
      this.dispatchEvent(new Event('pause'))
    },
    load() {
      this.currentSrc = ''
      this.readyState = 0
    },
    removeAttribute() {
      this.src = ''
    },
    play: () => new Promise<void>(() => {}),
  })
  let mediaActive = false
  const store = createMediaStore(
    () => element as unknown as HTMLAudioElement,
    active => {
      mediaActive = active
    },
  )
  const root = { querySelectorAll: () => [] } as unknown as ParentNode
  const safe = () => mayApplyBackgroundUpdate(root, false, 0, mediaActive)
  const queue = [
    { entryId: 'a', mediaId: 'a', src: 'https://example.test/a.mp3' },
    { entryId: 'b', mediaId: 'b', src: 'https://example.test/b.mp3' },
  ]
  await store.controller.replaceQueue(queue)
  const next = new Worker('installing', 'media-update')
  expect(safe()).toBe(true)
  const update = prepareColdLaunchUpdate('/media-update/', vi.fn(), {
    background: true,
    canActivate: safe,
  })
  await vi.waitFor(() => expect(registration.update).toHaveBeenCalled())
  registration.installing = next
  registration.dispatchEvent(new Event('updatefound'))
  void store.controller.play()
  expect(safe()).toBe(false)
  next.state = 'installed'
  registration.waiting = next
  next.dispatchEvent(new Event('statechange'))
  expect(await update).toBe('current')
  expect(next.postMessage).not.toHaveBeenCalledWith(
    expect.objectContaining({ type: APP_SHELL_APPLY_BACKGROUND_UPDATE }),
  )
  expect(window.location.reload).not.toHaveBeenCalled()
  element.currentSrc = element.src
  element.readyState = 4
  element.paused = false
  element.dispatchEvent(new Event('playing'))
  void store.controller.next()
  expect(safe()).toBe(false)
  vi.useFakeTimers()
  store.controller.stop()
  expect(safe()).toBe(false)
  await vi.advanceTimersByTimeAsync(1000)
  vi.useRealTimers()
  expect(safe()).toBe(true)
  next.apply = () => {
    workers.controller = next
    workers.dispatchEvent(new Event('controllerchange'))
  }
  expect(
    await prepareColdLaunchUpdate('/media-update/', vi.fn(), {
      background: true,
      canActivate: safe,
    }),
  ).toBe('reloading')
  store.dispose()
})

it('retries a denied activation at a later suspension, including on the reload successor', async () => {
  const { registration, workers } = fixture()
  const next = new Worker('installed', 'build-b')
  registration.waiting = next
  next.apply = () =>
    workers.dispatchEvent(
      Object.assign(new Event('message'), {
        source: next,
        data: { type: APP_SHELL_COLD_UPDATE_DENIED },
      }),
    )
  const options = { background: true, canActivate: () => true }
  expect(await prepareColdLaunchUpdate('/app/', vi.fn(), options)).toBe('current')
  next.apply = () => {
    next.state = 'activated'
    registration.active = next
    workers.controller = next
    workers.dispatchEvent(new Event('controllerchange'))
  }
  expect(await prepareColdLaunchUpdate('/app/', vi.fn(), options)).toBe('reloading')
  // The successor suppresses a second cold-launch reload but remains updateable
  // when the user later suspends it after another deployment.
  vi.resetModules()
  const fresh = await import('./coldLaunchUpdate.ts')
  expect(fresh.consumeJustUpdated('/app/')?.current).toBe('build-b')
  const third = new Worker('installed', 'build-c')
  registration.waiting = third
  third.apply = () => {
    registration.active = third
    workers.controller = third
    workers.dispatchEvent(new Event('controllerchange'))
  }
  expect(await fresh.prepareColdLaunchUpdate('/app/', vi.fn(), options)).toBe('reloading')
})
