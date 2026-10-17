// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prepareOfflineBundle, prepareLaunchContent } from './launch.ts'

beforeEach(() => vi.stubGlobal('location', { href: 'https://example.com/' }))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
describe('offline launch barrier', () => {
  it('looks up the replacement only after the head finishes discarding a stalled first install', async () => {
    let finishReset!: () => void
    vi.stubGlobal(
      '__SATIN_WORKER_LOOKUP__',
      new Promise<void>(resolve => {
        finishReset = resolve
      }),
    )
    const getRegistration = vi.fn(async () => ({
      scope: 'https://example.com/',
      active: { state: 'activated', scriptURL: 'https://example.com/sw.js' },
    }))
    vi.stubGlobal('navigator', { serviceWorker: { getRegistration } })
    const launch = prepareOfflineBundle('/')
    expect(getRegistration).not.toHaveBeenCalled()
    finishReset()
    await expect(launch).resolves.toBe(true)
    expect(getRegistration).toHaveBeenCalledOnce()
  })
  it('explains an offline first registration failure', async () => {
    vi.stubGlobal('navigator', {
      onLine: false,
      serviceWorker: {
        getRegistration: async () => undefined,
        register: async () => {
          throw new TypeError('Load failed')
        },
      },
    })
    await expect(prepareOfflineBundle('/')).rejects.toThrow(
      'Check your connection and try again. Resource: https://example.com/sw.js',
    )
  })
  it('launches connected-only when the origin has no service worker API', async () => {
    vi.stubGlobal('navigator', {})
    const note = vi.spyOn(console, 'info').mockImplementation(() => {})
    try {
      expect(await prepareOfflineBundle('/')).toBe(true)
      expect(note).toHaveBeenCalledWith(expect.stringContaining('connected-only'))
    } finally {
      note.mockRestore()
    }
  })
  it('preserves genuine registration failures when the API is available', async () => {
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistration: async () => undefined,
        register: async () => {
          throw new Error('precache failed')
        },
      },
    })
    await expect(prepareOfflineBundle('/')).rejects.toThrow('precache failed')
  })
  it('opens an installed bundle without registering over the network', async () => {
    const register = vi.fn(() => new Promise(() => {}))
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistration: async () => ({ active: { state: 'activated' } }),
        register,
      },
    })
    await prepareOfflineBundle('/')
    expect(register).not.toHaveBeenCalled()
  })
  it('holds first launch until atomic install has activated', async () => {
    const worker = Object.assign(new EventTarget(), { state: 'installing' })
    const registration = Object.assign(new EventTarget(), {
      installing: worker,
      active: null as typeof worker | null,
      waiting: null,
    })
    vi.stubGlobal('navigator', { serviceWorker: { getRegistration: async () => registration } })
    let ready = false
    const preparation = prepareOfflineBundle('/').then(() => {
      ready = true
    })
    await Promise.resolve()
    expect(ready).toBe(false)
    registration.active = worker
    registration.installing.state = 'activated'
    worker.dispatchEvent(new Event('statechange'))
    await preparation
    expect(ready).toBe(true)
  })
  it('keeps a waiting update for the next process launch without a reload', async () => {
    const waiting = { state: 'installed', postMessage: vi.fn() }
    vi.stubGlobal('navigator', {
      serviceWorker: { getRegistration: async () => ({ active: { state: 'activated' }, waiting }) },
    })
    expect(await prepareOfflineBundle('/')).toBe(true)
    expect(waiting.postMessage).not.toHaveBeenCalled()
  })
  it('fails visibly rather than accepting a partial installation', async () => {
    vi.useFakeTimers()
    const registration = Object.assign(new EventTarget(), {
      installing: null,
      active: null,
      waiting: null,
    })
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistration: async () => registration,
        register: async () => registration,
      },
    })
    const pending = expect(prepareOfflineBundle('/', 50)).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(50)
    await pending
  })
})

describe('initial content preparation', () => {
  it('starts eager image decoding while fonts are pending and waits for both', async () => {
    let finishFonts!: () => void
    let finishImage!: () => void
    const fonts = new Promise<void>(resolve => {
      finishFonts = resolve
    })
    const decoded = new Promise<void>(resolve => {
      finishImage = resolve
    })
    const image = { loading: 'lazy', decode: vi.fn(() => decoded) }
    vi.stubGlobal('document', { fonts: { ready: fonts } })
    const root = {
      querySelector: () => null,
      querySelectorAll: (selector: string) => (selector === 'img' ? [image] : []),
    } as unknown as HTMLElement
    let ready = false
    const pending = prepareLaunchContent(root).then(() => {
      ready = true
    })
    expect(image.loading).toBe('eager')
    expect(image.decode).toHaveBeenCalledOnce()
    finishImage()
    await Promise.resolve()
    expect(ready).toBe(false)
    finishFonts()
    await pending
    expect(ready).toBe(true)
  })
})

it('bounds unresolved optional content decoding without treating the app as failed', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('document', { fonts: { ready: new Promise(() => {}) } })
  const root = {
    querySelector: () => null,
    querySelectorAll: (selector: string) =>
      selector === 'img' ? [{ loading: 'lazy', decode: () => new Promise(() => {}) }] : [],
  } as unknown as HTMLElement
  let ready = false
  const pending = prepareLaunchContent(root).then(() => {
    ready = true
  })
  await vi.advanceTimersByTimeAsync(4_999)
  expect(ready).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  await pending
  expect(ready).toBe(true)
  vi.useRealTimers()
})

describe('connected-only launch', () => {
  it('does not strand a connected browser without service workers', async () => {
    vi.stubGlobal('navigator', { onLine: true })
    expect(await prepareOfflineBundle('/')).toBe(true)
  })
  it('does not promise an offline bundle when service workers are absent', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    await expect(prepareOfflineBundle('/')).rejects.toThrow('Connect to open')
  })
})

it.each(['installing', 'redundant'])(
  'opens the cached offline bundle through a %s update',
  async state => {
    vi.useFakeTimers()
    const next = Object.assign(new EventTarget(), { state, postMessage: vi.fn() })
    const registration = { active: { state: 'activated' }, installing: next }
    vi.stubGlobal('navigator', {
      onLine: false,
      serviceWorker: { getRegistration: async () => registration },
    })
    const progress = vi.fn()
    expect(await prepareOfflineBundle('/app/', 50, progress)).toBe(true)
    await vi.advanceTimersByTimeAsync(100)
    expect(progress).not.toHaveBeenCalled()
    expect(next.postMessage).not.toHaveBeenCalled()
  },
)

it('joins a first registration exposed by WebKit before it has a newest worker', async () => {
  const worker = Object.assign(new EventTarget(), { state: 'installing' })
  const registration = Object.assign(new EventTarget(), {
    installing: null as typeof worker | null,
    active: null as typeof worker | null,
    waiting: null,
    update: vi.fn(() => {
      throw new DOMException('newestWorker is null', 'InvalidStateError')
    }),
  })
  const register = vi.fn(async () => {
    registration.installing = worker
    return registration
  })
  vi.stubGlobal('navigator', {
    serviceWorker: { getRegistration: async () => registration, register },
  })
  let ready = false
  const pending = prepareOfflineBundle('/app/').then(() => {
    ready = true
  })
  await vi.waitFor(() => expect(register).toHaveBeenCalledOnce())
  expect(register).toHaveBeenCalledWith('/app/sw.js', { scope: '/app/', updateViaCache: 'none' })
  expect(ready).toBe(false)
  registration.installing = null
  registration.active = worker
  worker.state = 'activated'
  worker.dispatchEvent(new Event('statechange'))
  await pending
  expect(ready).toBe(true)
  expect(registration.update).not.toHaveBeenCalled()
})

it('reports progress while WebKit keeps the re-registration promise pending', async () => {
  const worker = Object.assign(new EventTarget(), { state: 'installing', postMessage: vi.fn() })
  const registration = Object.assign(new EventTarget(), {
    installing: null as typeof worker | null,
    active: null as typeof worker | null,
    waiting: null,
  })
  const workers = Object.assign(new EventTarget(), {
    getRegistration: async () => registration,
    register: vi.fn(() => new Promise<never>(() => {})),
  })
  const progress = vi.fn()
  vi.stubGlobal('navigator', { serviceWorker: workers })
  const pending = prepareOfflineBundle('/app/', 1000, progress)
  await vi.waitFor(() => expect(workers.register).toHaveBeenCalledOnce())
  registration.installing = worker
  registration.dispatchEvent(new Event('updatefound'))
  workers.dispatchEvent(
    Object.assign(new Event('message'), {
      source: worker,
      data: { type: 'SATIN_DOWNLOAD_PROGRESS', loaded: 40, total: 100, downloading: true },
    }),
  )
  expect(progress).toHaveBeenCalledWith(expect.objectContaining({ loaded: 40, total: 100 }))
  registration.installing = null
  registration.active = worker
  worker.state = 'activated'
  worker.dispatchEvent(new Event('statechange'))
  expect(await pending).toBe(true)
})

it.each([
  { offline: false, networkFailure: false },
  { offline: true, networkFailure: false },
  { offline: false, networkFailure: true },
])(
  'classifies a first-install resource failure per operation: %j',
  async ({ offline, networkFailure }) => {
    const worker = Object.assign(new EventTarget(), { state: 'installing', postMessage: vi.fn() })
    const registration = Object.assign(new EventTarget(), {
      installing: worker,
      waiting: null,
      active: null,
    })
    const workers = Object.assign(new EventTarget(), { getRegistration: async () => registration })
    vi.stubGlobal('navigator', { serviceWorker: workers, onLine: !offline })
    const pending = prepareOfflineBundle('/app/', 1000)
    const rejected = expect(pending).rejects.toThrow(
      networkFailure ? 'Check your connection' : '/secondary.js: HTTP 404',
    )
    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalled())
    workers.dispatchEvent(
      Object.assign(new Event('message'), {
        source: worker,
        data: {
          type: 'SATIN_INSTALL_FAILURE',
          url: '/secondary.js',
          reason: 'HTTP 404',
          networkFailure,
        },
      }),
    )
    await rejected
  },
)

it.each(['network', 'http', 'missing'])(
  'classifies only this attempt after redundant state before a %s failure message',
  async cause => {
    vi.useFakeTimers()
    const worker = Object.assign(new EventTarget(), { state: 'installing', postMessage: vi.fn() })
    const registration = Object.assign(new EventTarget(), {
      installing: worker as typeof worker | null,
      waiting: null,
      active: null,
    })
    const serviceWorker = Object.assign(new EventTarget(), {
      getRegistration: async () => registration,
    })
    vi.stubGlobal('navigator', { onLine: false, serviceWorker })
    vi.stubGlobal('localStorage', {
      getItem: () =>
        JSON.stringify({
          buildId: 'stale',
          url: '/stale.js',
          reason: 'HTTP 404',
          networkFailure: false,
        }),
    })
    const outcome = prepareOfflineBundle('/app/', 1000).then(
      () => null,
      error => error as Error,
    )
    const message =
      cause === 'network'
        ? 'Check your connection and try again. Resource: /current.js'
        : cause === 'http'
          ? '/current.js: HTTP 404. Deploy the complete matching build'
          : 'The offline bundle did not finish installing.'
    await vi.advanceTimersByTimeAsync(0)
    expect(worker.postMessage).toHaveBeenCalled()
    registration.installing = null
    worker.state = 'redundant'
    worker.dispatchEvent(new Event('statechange'))
    await vi.advanceTimersByTimeAsync(50)
    if (cause !== 'missing') {
      serviceWorker.dispatchEvent(
        Object.assign(new Event('message'), {
          source: worker as unknown as ServiceWorker,
          data: {
            type: 'SATIN_INSTALL_FAILURE',
            buildId: 'current',
            url: '/current.js',
            reason: cause === 'network' ? 'fetch failed' : 'HTTP 404',
            networkFailure: cause === 'network',
          },
        }),
      )
    }
    await vi.advanceTimersByTimeAsync(250)
    const error = await outcome
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain(message)
    expect(error?.message).not.toContain('/stale.js')
  },
)

it('bounds a hung registration lookup and preserves the reset-specific error', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('navigator', {
    serviceWorker: { getRegistration: () => new Promise(() => {}) },
  })
  const rejected = expect(prepareOfflineBundle('/')).rejects.toThrow(
    'Service worker reset did not finish. Please retry.',
  )
  await vi.advanceTimersByTimeAsync(3001)
  await rejected
})

it('surfaces a failed head reset after its lookup handshake resolves', async () => {
  vi.stubGlobal('__SATIN_WORKER_LOOKUP__', Promise.resolve())
  vi.stubGlobal(
    '__SATIN_WORKER_LOOKUP_ERROR__',
    new Error('Service worker reset did not finish. Please retry.'),
  )
  const getRegistration = vi.fn()
  vi.stubGlobal('navigator', { serviceWorker: { getRegistration } })
  await expect(prepareOfflineBundle('/')).rejects.toThrow('Service worker reset did not finish')
  expect(getRegistration).not.toHaveBeenCalled()
})

it('names the resource when the worker ends a stalled install', async () => {
  const worker = Object.assign(new EventTarget(), { state: 'installing', postMessage: vi.fn() })
  const registration = Object.assign(new EventTarget(), {
    installing: worker,
    active: null,
    waiting: null,
  })
  const workers = Object.assign(new EventTarget(), { getRegistration: async () => registration })
  vi.stubGlobal('navigator', { serviceWorker: workers })
  const pending = prepareOfflineBundle('/app/')
  const rejected = expect(pending).rejects.toThrow(
    'The server stopped responding. Resource: /secondary.js. Please retry.',
  )
  await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalled())
  workers.dispatchEvent(
    Object.assign(new Event('message'), {
      source: worker,
      data: {
        type: 'SATIN_INSTALL_FAILURE',
        url: '/secondary.js',
        stalled: true,
        networkFailure: true,
      },
    }),
  )
  await rejected
})

it('fails a stuck required first mount at the launch deadline and cancels disposed attempts', async () => {
  vi.useFakeTimers()
  const host = document.createElement('div')
  host.innerHTML = '<img fetchpriority="high" data-satin-content-pending="">'
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { ready: Promise.resolve() },
  })
  const decode = vi.spyOn(HTMLImageElement.prototype, 'decode').mockResolvedValue()
  try {
    const deadline = expect(prepareLaunchContent(host)).rejects.toThrow('Please retry')
    await vi.advanceTimersByTimeAsync(5000)
    await deadline
    const controller = new AbortController()
    const disposed = prepareLaunchContent(host, controller.signal)
    controller.abort()
    await expect(disposed).resolves.toBeUndefined()
    // A hidden non-priority prewarm must not hold a later launch.
    host.innerHTML = '<span hidden><img data-satin-content-pending=""></span>'
    await expect(prepareLaunchContent(host)).resolves.toBeUndefined()
  } finally {
    decode.mockRestore()
  }
})
