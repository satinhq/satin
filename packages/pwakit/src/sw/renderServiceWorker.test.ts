import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import {
  APP_SHELL_APPLY_BACKGROUND_UPDATE,
  APP_SHELL_APPLY_COLD_UPDATE,
  APP_SHELL_APPLY_UPDATE,
  APP_SHELL_COLD_UPDATE_DENIED,
  APP_SHELL_BUILD_ID_RESPONSE,
  APP_SHELL_BUILD_ID_REQUEST,
} from './protocol.ts'
import { renderServiceWorker } from './renderServiceWorker.ts'
import type { AppShellPrecacheManifest } from './manifest.ts'

const manifest: AppShellPrecacheManifest = {
  buildId: 'new-build',
  cacheName: 'satin-app-shell-new-build',
  cachePrefix: 'satin-app-shell-',
  entries: [
    { revision: 'shell-revision', url: '/' },
    { revision: null, url: '/assets/index-a1b2c3d4.js' },
  ],
  format: 1,
  shellUrl: '/',
}

const ownedPrefix = ':satin:app-shell:v2:' + encodeURIComponent('https://satin.test/') + ':'
const currentCacheName = ownedPrefix + manifest.cacheName

class TestRequest {
  readonly signal: AbortSignal | undefined
  readonly cache: string | undefined
  readonly method: string
  readonly mode: string
  readonly url: string
  readonly destination: string
  readonly headers: Headers

  constructor(
    input: string,
    options: {
      cache?: string
      method?: string
      mode?: string
      signal?: AbortSignal
      destination?: string
      headers?: Record<string, string>
    } = {},
  ) {
    this.signal = options.signal
    this.cache = options.cache
    this.method = options.method ?? 'GET'
    this.mode = options.mode ?? 'cors'
    this.url = new URL(input, 'https://satin.test').href
    this.destination = options.destination ?? ''
    this.headers = new Headers(options.headers)
  }
}

function workerHarness(
  entries = manifest.entries,
  publicRoutes: readonly string[] = [],
  diagnosticTimingHeaders = false,
) {
  const listeners = new Map<string, (event: Record<string, unknown>) => void>()
  const cache = {
    delete: vi.fn<(request: TestRequest) => Promise<boolean>>(async () => true),
    put: vi.fn<(request: TestRequest, response: Response) => Promise<void>>(async () => undefined),
    addAll: vi.fn<(requests: TestRequest[]) => Promise<void>>(async () => undefined),
    match: vi.fn<(key: string) => Promise<unknown>>(async () => undefined),
    keys: vi.fn(async () => [new TestRequest('/assets/retired-hash.js')]),
  }
  const cacheStorage = {
    match: vi.fn(async (key: string, options: { cacheName: string }) => {
      expect(options.cacheName).toBeTruthy()
      return cache.match(key)
    }),
    delete: vi.fn<(name: string) => Promise<boolean>>(async () => true),
    keys: vi.fn(async () => [
      ownedPrefix + 'satin-app-shell-old-build',
      currentCacheName,
      'satin-app-shell-legacy-build',
      'satin-foundation-v10',
      'application-data',
      'satin-push-inbox-v1:/app/',
    ]),
    open: vi.fn(async () => cache),
  }
  const serviceWorkerGlobal = {
    addEventListener: vi.fn((type: string, listener: (event: Record<string, unknown>) => void) =>
      listeners.set(type, listener),
    ),
    clients: { matchAll: vi.fn(async () => []), claim: vi.fn(async () => undefined) },
    location: { origin: 'https://satin.test' },
    registration: {
      scope: 'https://satin.test/',
      active: {
        postMessage: vi.fn((_data: unknown, ports: MessagePort[]) =>
          ports[0]!.postMessage({ type: APP_SHELL_BUILD_ID_RESPONSE, buildId: 'old-build' }),
        ),
      },
    },
    skipWaiting: vi.fn(async () => undefined),
  }
  const networkFetch = vi.fn<(request: unknown) => Promise<unknown>>(
    async () => new Response('bytes', { headers: { 'content-type': 'text/javascript' } }),
  )

  vm.runInNewContext(
    renderServiceWorker({
      legacyCacheNames: ['satin-foundation-v10', 'satin-push-inbox-v1:/app/'],
      publicRoutes,
      diagnosticTimingHeaders,
      manifest: { ...manifest, entries },
    }),
    {
      setTimeout,
      clearTimeout,
      MessageChannel,
      AbortController,
      Response,
      Headers,
      Blob,
      crypto,
      console,
      performance,
      Request: TestRequest,
      Set,
      URL,
      caches: cacheStorage,
      fetch: networkFetch,
      self: serviceWorkerGlobal,
    },
  )

  return {
    cache,
    cacheStorage,
    listeners,
    networkFetch,
    serviceWorkerGlobal,
  }
}

describe('generated service worker', () => {
  it('precaches without activating itself during install', async () => {
    const harness = workerHarness()
    let installWork: Promise<unknown> | undefined
    harness.listeners.get('install')?.({
      waitUntil: (work: Promise<unknown>) => {
        installWork = work
      },
    })
    await installWork

    expect(harness.cache.put).toHaveBeenCalledTimes(2)
    const requests = harness.networkFetch.mock.calls.map(([request]) => request as TestRequest)
    expect(requests.map(request => request.url)).toEqual([
      'https://satin.test/',
      'https://satin.test/assets/index-a1b2c3d4.js',
    ])
    expect(requests.every(request => request.cache === 'reload')).toBe(true)
    expect(harness.serviceWorkerGlobal.skipWaiting).not.toHaveBeenCalled()
  })

  it('bounds parallel downloads on a large app shell', async () => {
    const entries = Array.from({ length: 20 }, (_, index) => ({
      url: `/assets/chunk-${index}.js`,
      revision: null,
    }))
    const harness = workerHarness(entries)
    let active = 0
    let peak = 0
    harness.networkFetch.mockImplementation(async () => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise(resolve => setTimeout(resolve, 5))
      active -= 1
      return new Response('bytes', { headers: { 'content-type': 'text/javascript' } })
    })
    let work!: Promise<unknown>
    harness.listeners.get('install')?.({
      waitUntil: (pending: Promise<unknown>) => {
        work = pending
      },
    })
    await work
    expect(peak).toBeGreaterThan(1)
    expect(peak).toBeLessThanOrEqual(6)
    expect(harness.cache.put).toHaveBeenCalledTimes(entries.length)
  })

  it('finishes critical assets before artwork and rejects an incomplete install', async () => {
    const harness = workerHarness([...manifest.entries, { url: '/icon.png', revision: 'icon' }])
    harness.networkFetch.mockImplementation(async request => {
      if ((request as TestRequest).url.endsWith('icon.png')) throw new Error('artwork unavailable')
      return new Response('bytes', { headers: { 'content-type': 'text/javascript' } })
    })
    let work!: Promise<unknown>
    harness.listeners.get('install')?.({
      waitUntil: (pending: Promise<unknown>) => {
        work = pending
      },
    })
    await expect(work).rejects.toThrow('artwork unavailable')
    expect(harness.cache.put).toHaveBeenCalledTimes(2)
    expect((harness.networkFetch.mock.calls.at(-1)![0] as TestRequest).url).toBe(
      'https://satin.test/icon.png',
    )
    expect(harness.serviceWorkerGlobal.skipWaiting).not.toHaveBeenCalled()
  })

  it('reports decoded stream bytes and rejects a truncated asset before activation', async () => {
    const harness = workerHarness([{ revision: 'x', url: '/', bytes: 6 }])
    const messages: unknown[] = []
    harness.serviceWorkerGlobal.clients.matchAll.mockResolvedValue([
      { postMessage: (data: unknown) => messages.push(structuredClone(data)) },
    ] as never)
    harness.networkFetch.mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2]))
            controller.enqueue(new Uint8Array([3, 4, 5]))
            controller.close()
          },
        }),
      ),
    )
    let work!: Promise<unknown>
    harness.listeners.get('install')?.({
      waitUntil: (pending: Promise<unknown>) => {
        work = pending
      },
    })
    await expect(work).rejects.toThrow('size mismatch')
    expect(messages).toContainEqual(
      expect.objectContaining({ loaded: 2, total: 6, downloading: true }),
    )
    expect(messages).toContainEqual(
      expect.objectContaining({ loaded: 5, total: 6, downloading: true }),
    )
    expect(harness.cache.put).not.toHaveBeenCalled()
    expect(harness.serviceWorkerGlobal.skipWaiting).not.toHaveBeenCalled()
  })

  it('activates only on protocol message and removes only scope-owned caches', async () => {
    const harness = workerHarness()
    let messageWork: Promise<unknown> | undefined
    harness.listeners.get('message')?.({
      data: { type: APP_SHELL_APPLY_UPDATE },
      ports: [],
      waitUntil: (work: Promise<unknown>) => {
        messageWork = work
      },
    })
    await messageWork
    expect(harness.serviceWorkerGlobal.skipWaiting).toHaveBeenCalledOnce()

    let activationWork: Promise<unknown> | undefined
    harness.listeners.get('activate')?.({
      waitUntil: (work: Promise<unknown>) => {
        activationWork = work
      },
    })
    await activationWork

    expect(harness.cacheStorage.delete.mock.calls.map(([name]) => name)).toEqual([
      ownedPrefix + 'satin-app-shell-old-build',
    ])
    expect(harness.serviceWorkerGlobal.clients.claim).toHaveBeenCalledOnce()
  })

  it('declines automatic activation while another scoped window is running', async () => {
    const harness = workerHarness()
    const source = { id: 'launching', url: 'https://satin.test/', postMessage: vi.fn() }
    harness.serviceWorkerGlobal.clients.matchAll.mockResolvedValue([
      source,
      { id: 'interactive', url: 'https://satin.test/details' },
    ] as never)
    let work!: Promise<unknown>
    harness.listeners.get('message')?.({
      data: { type: APP_SHELL_APPLY_COLD_UPDATE },
      source,
      waitUntil: (pending: Promise<unknown>) => {
        work = pending
      },
    })
    await work
    expect(source.postMessage).toHaveBeenCalledWith({ type: APP_SHELL_COLD_UPDATE_DENIED })
    expect(harness.serviceWorkerGlobal.skipWaiting).not.toHaveBeenCalled()
  })

  it('activates a cold launch when it is the only scoped window', async () => {
    const harness = workerHarness()
    harness.serviceWorkerGlobal.registration.scope = 'https://satin.test/app/'
    const source = { id: 'launching', url: 'https://satin.test/app/', postMessage: vi.fn() }
    harness.serviceWorkerGlobal.clients.matchAll.mockResolvedValue([
      source,
      { id: 'public', url: 'https://satin.test/install' },
    ] as never)
    let work!: Promise<unknown>
    harness.listeners.get('message')?.({
      data: { type: APP_SHELL_APPLY_COLD_UPDATE },
      source,
      waitUntil: (pending: Promise<unknown>) => {
        work = pending
      },
    })
    await work
    expect(harness.serviceWorkerGlobal.skipWaiting).toHaveBeenCalledOnce()
  })

  it('activates a background update only while its sole scoped client is hidden', async () => {
    const harness = workerHarness()
    const source = {
      id: 'suspended',
      url: 'https://satin.test/',
      visibilityState: 'visible',
      postMessage: vi.fn(),
    }
    harness.serviceWorkerGlobal.clients.matchAll.mockResolvedValue([source] as never)
    const send = async () => {
      let work!: Promise<unknown>
      harness.listeners.get('message')?.({
        data: { type: APP_SHELL_APPLY_BACKGROUND_UPDATE, previousBuildId: 'old-build' },
        source,
        waitUntil: (pending: Promise<unknown>) => {
          work = pending
        },
      })
      await work
    }
    await send()
    expect(source.postMessage).toHaveBeenCalledWith({ type: APP_SHELL_COLD_UPDATE_DENIED })
    expect(harness.serviceWorkerGlobal.skipWaiting).not.toHaveBeenCalled()
    source.visibilityState = 'hidden'
    await send()
    expect(harness.serviceWorkerGlobal.skipWaiting).toHaveBeenCalledOnce()
  })

  it('forwards API and other non-precached requests without caching them', async () => {
    const harness = workerHarness()
    for (const path of ['/api/private', '/user-avatar.png']) {
      harness.networkFetch.mockResolvedValue(new Response(path))
      let pending: Promise<Response> | undefined
      harness.listeners.get('fetch')?.({
        request: new TestRequest(path),
        respondWith: (response: Promise<Response>) => {
          pending = response
        },
        waitUntil: vi.fn(),
      })
      expect(pending).toBeDefined()
      expect(await (await pending!).text()).toBe(path)
    }
    expect(harness.cacheStorage.match).not.toHaveBeenCalled()
    expect(harness.cache.put).not.toHaveBeenCalled()
  })

  it('leaves media, ranged and cross-origin requests to the browser', () => {
    const harness = workerHarness()
    const respondWith = vi.fn()
    const requests = [
      new TestRequest('/media/track.m4a', { destination: 'audio' }),
      new TestRequest('/media/clip.mp4', { destination: 'video' }),
      new TestRequest('/media/track.m4a', { headers: { range: 'bytes=0-' } }),
      new TestRequest('https://cdn.example.com/api'),
    ]
    for (const request of requests)
      harness.listeners.get('fetch')?.({ request, respondWith, waitUntil: vi.fn() })
    expect(respondWith).not.toHaveBeenCalled()
  })

  it('serves installed navigation without touching a stalled network', async () => {
    const harness = workerHarness()
    const assetResponse = new Response('precache')
    const shellResponse = new Response('shell')
    harness.cache.match.mockImplementation(async (key: string) => {
      if (key === '/assets/index-a1b2c3d4.js') return assetResponse
      if (key === '/') return shellResponse
      return undefined
    })
    const responses: Promise<unknown>[] = []
    const respondWith = (response: Promise<unknown>) => responses.push(response)

    harness.listeners.get('fetch')?.({
      request: new TestRequest('/assets/index-a1b2c3d4.js'),
      respondWith,
      waitUntil: vi.fn(),
    })
    harness.networkFetch.mockRejectedValueOnce(new Error('offline'))
    harness.listeners.get('fetch')?.({
      request: new TestRequest('/settings', { mode: 'navigate' }),
      respondWith,
      waitUntil: vi.fn(),
    })

    expect(await responses[0]).toBe(assetResponse)
    expect(((await responses[0]) as Response).headers.has('x-sw-boot')).toBe(false)
    expect(((await responses[0]) as Response).headers.has('x-sw-match-ms')).toBe(false)
    expect(await ((await responses[0]) as Response).text()).toBe('precache')
    expect(await responses[1]).toBe(shellResponse)
    expect(harness.cacheStorage.open).not.toHaveBeenCalled()
    expect(harness.networkFetch).not.toHaveBeenCalled()
  })
})

it('adds cache timing headers only with the explicit diagnostic build option', async () => {
  const harness = workerHarness(manifest.entries, [], true)
  harness.cache.match.mockResolvedValue(new Response('precache'))
  let pending!: Promise<Response>
  harness.listeners.get('fetch')?.({
    request: new TestRequest('/assets/index-a1b2c3d4.js'),
    respondWith: (response: Promise<Response>) => {
      pending = response
    },
  })
  const response = await pending
  expect(response.headers.get('x-sw-boot')).toMatch(/^\d+$/)
  expect(Number(response.headers.get('x-sw-match-ms'))).toBeGreaterThanOrEqual(0)
  expect(await response.text()).toBe('precache')
})

it('omits diagnostic response reconstruction from production worker source', () => {
  const source = renderServiceWorker({ manifest })
  expect(source).not.toContain('x-sw-boot')
  expect(source).not.toContain('x-sw-match-ms')
  expect(source).not.toContain('new Response(cached.body')
})

it.each([
  '/install',
  '/install/',
  '/install/index.html',
  '/unsupported.html',
  '/app/unsupported.html',
  '/app/install?source=home',
])('forwards public navigation %s without substituting or caching the app shell', async path => {
  const harness = workerHarness(manifest.entries, [
    '/install',
    '/unsupported.html',
    '/app/unsupported.html',
    '/app/install',
  ])
  harness.networkFetch.mockResolvedValue(new Response('Public document', { status: 203 }))
  let pending: Promise<Response> | undefined
  harness.listeners.get('fetch')?.({
    request: new TestRequest(path, { mode: 'navigate' }),
    respondWith: (response: Promise<Response>) => {
      pending = response
    },
  })
  expect(pending).toBeDefined()
  const response = await pending!
  expect(response.status).toBe(203)
  expect(await response.text()).toBe('Public document')
  expect(harness.cacheStorage.match).not.toHaveBeenCalled()
  expect(harness.cache.put).not.toHaveBeenCalled()
})

it('retains the old bundle through claim while its old page is alive', async () => {
  const harness = workerHarness()
  harness.serviceWorkerGlobal.clients.matchAll.mockResolvedValue([
    { id: 'old', url: 'https://satin.test/', postMessage: vi.fn() },
  ] as never)
  let work!: Promise<unknown>
  harness.listeners.get('activate')?.({
    waitUntil: (pending: Promise<unknown>) => {
      work = pending
    },
  })
  await work
  expect(harness.cacheStorage.delete).not.toHaveBeenCalled()
  expect(harness.serviceWorkerGlobal.clients.claim).toHaveBeenCalledOnce()
  harness.cacheStorage.match.mockImplementation(async (_key, options) =>
    options.cacheName === 'satin-app-shell-legacy-build' ? new Response('old worker') : undefined,
  )
  let response!: Promise<Response>
  harness.listeners.get('fetch')?.({
    request: { ...new TestRequest('/assets/retired-hash.js'), destination: 'worker' },
    respondWith: (value: Promise<Response>) => {
      response = value
    },
  })
  expect(await (await response).text()).toBe('old worker')
  expect(harness.networkFetch).not.toHaveBeenCalled()
})

it('checks owned retained caches and sends unrelated assets to the network', async () => {
  const harness = workerHarness()
  harness.cacheStorage.match.mockImplementation(async (key, options) =>
    key === '/assets/retired-hash.js' &&
    options.cacheName === ownedPrefix + 'satin-app-shell-old-build'
      ? new Response('old chunk')
      : undefined,
  )
  const request = async (path: string) => {
    let pending!: Promise<Response>
    harness.listeners.get('fetch')?.({
      request: { ...new TestRequest(path), destination: 'script' },
      respondWith: (response: Promise<Response>) => {
        pending = response
      },
    })
    return pending
  }
  expect(await (await request('/assets/retired-hash.js')).text()).toBe('old chunk')
  await request('/assets/new-a.js')
  await request('/assets/new-b.js')
  expect(harness.cacheStorage.keys).toHaveBeenCalledTimes(3)
  expect(harness.cacheStorage.open).not.toHaveBeenCalled()
  expect(harness.networkFetch).toHaveBeenCalledTimes(2)
})

it('does not delete a subsequent deployment while it is installing', async () => {
  const harness = workerHarness()
  Object.assign(harness.serviceWorkerGlobal.registration, { installing: { state: 'installing' } })
  let work!: Promise<unknown>
  harness.listeners.get('activate')?.({
    waitUntil: (pending: Promise<unknown>) => {
      work = pending
    },
  })
  await work
  expect(harness.cacheStorage.delete).not.toHaveBeenCalled()
})

it('retires unused bundles at a later cold navigation with no surviving old window', async () => {
  const harness = workerHarness()
  harness.serviceWorkerGlobal.clients.matchAll.mockResolvedValue([
    { id: 'new', url: 'https://satin.test/' },
  ] as never)
  let work!: Promise<unknown>
  harness.listeners.get('fetch')?.({
    request: new TestRequest('/', { mode: 'navigate' }),
    resultingClientId: 'new',
    respondWith: vi.fn(),
    waitUntil: (pending: Promise<unknown>) => {
      work = pending
    },
  })
  await work
  expect(harness.cacheStorage.delete).toHaveBeenCalledWith(
    ownedPrefix + 'satin-app-shell-old-build',
  )
  expect(harness.cacheStorage.delete).not.toHaveBeenCalledWith(currentCacheName)
})

it('reports a failed secondary resource to clients and leaves the active cache intact', async () => {
  const harness = workerHarness([{ revision: null, url: '/secondary.js', bytes: 8 }])
  const postMessage = vi.fn()
  harness.serviceWorkerGlobal.clients.matchAll.mockResolvedValue([{ postMessage }] as never)
  harness.networkFetch.mockResolvedValue(new Response('missing', { status: 404 }))
  let work!: Promise<unknown>
  harness.listeners.get('install')?.({
    waitUntil: (pending: Promise<unknown>) => {
      work = pending
    },
  })
  await expect(work).rejects.toThrow('HTTP 404')
  expect(postMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'SATIN_INSTALL_FAILURE',
      url: '/secondary.js',
      reason: 'HTTP 404',
      networkFailure: false,
    }),
  )
  expect(harness.cacheStorage.delete).not.toHaveBeenCalled()
  expect(harness.serviceWorkerGlobal.skipWaiting).not.toHaveBeenCalled()
})

it('classifies a rejected secondary fetch as connectivity after a successful shell fetch', async () => {
  const harness = workerHarness([
    { revision: null, url: '/' },
    { revision: null, url: '/secondary.png' },
  ])
  const postMessage = vi.fn()
  harness.serviceWorkerGlobal.clients.matchAll.mockResolvedValue([{ postMessage }] as never)
  harness.networkFetch
    .mockResolvedValueOnce(new Response('shell'))
    .mockRejectedValueOnce(new TypeError('Failed to fetch'))
  let work!: Promise<unknown>
  harness.listeners.get('install')?.({
    waitUntil: (pending: Promise<unknown>) => {
      work = pending
    },
  })
  await expect(work).rejects.toThrow('Failed to fetch')
  expect(postMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'SATIN_INSTALL_FAILURE',
      url: '/secondary.png',
      networkFailure: true,
    }),
  )
})

it('accepts MIME casing and reports successful installation with build identity', async () => {
  const harness = workerHarness([{ revision: null, url: '/secondary.js' }])
  const postMessage = vi.fn()
  harness.serviceWorkerGlobal.clients.matchAll.mockResolvedValue([{ postMessage }] as never)
  harness.networkFetch.mockResolvedValue(
    new Response('asset', { headers: { 'content-type': 'Text/JavaScript; charset=UTF-8' } }),
  )
  let work!: Promise<unknown>
  harness.listeners.get('install')?.({
    waitUntil: (pending: Promise<unknown>) => {
      work = pending
    },
  })
  await work
  expect(postMessage).toHaveBeenCalledWith({ type: 'SATIN_INSTALL_SUCCESS', buildId: 'new-build' })
})

it.each(['headers', 'body'])(
  'bounds a stalled precache %s and permits a fixed fresh install',
  async phase => {
    vi.useFakeTimers()
    try {
      const harness = workerHarness([{ revision: null, url: '/stalled.js' }])
      const postMessage = vi.fn()
      harness.serviceWorkerGlobal.clients.matchAll.mockResolvedValue([{ postMessage }] as never)
      const cancel = vi.fn()
      const signalListener = vi.fn()
      harness.networkFetch.mockImplementation(async request => {
        signalListener((request as { signal: AbortSignal }).signal)
        if (phase === 'headers') return new Promise(() => {})
        return {
          ok: true,
          headers: new Headers({ 'content-type': 'text/javascript' }),
          body: { getReader: () => ({ read: () => new Promise(() => {}), cancel }) },
        }
      })
      let work!: Promise<unknown>
      harness.listeners.get('install')?.({
        waitUntil: (pending: Promise<unknown>) => {
          work = pending
        },
      })
      // The response may take as long as `satin check` allows; a body may not go silent for 8 s.
      const seconds = phase === 'headers' ? 30 : 8
      const failed = expect(work).rejects.toThrow(`The server stopped responding for ${seconds} s`)
      await vi.advanceTimersByTimeAsync(seconds * 1000 + 1)
      await failed
      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'SATIN_INSTALL_FAILURE',
          url: '/stalled.js',
          networkFailure: true,
        }),
      )
      expect(signalListener.mock.calls[0]![0].aborted).toBe(true)
      if (phase === 'body') expect(cancel).toHaveBeenCalledOnce()
      expect(harness.cacheStorage.delete).not.toHaveBeenCalled()
      expect(harness.serviceWorkerGlobal.skipWaiting).not.toHaveBeenCalled()
      harness.networkFetch.mockResolvedValue(
        new Response('fixed', { headers: { 'content-type': 'text/javascript' } }),
      )
      harness.listeners.get('install')?.({
        waitUntil: (pending: Promise<unknown>) => {
          work = pending
        },
      })
      await work
      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'SATIN_INSTALL_SUCCESS' }),
      )
    } finally {
      vi.useRealTimers()
    }
  },
)

it('reports the first fatal failure and aborts siblings without waiting for their streams', async () => {
  vi.useFakeTimers()
  const entries = Array.from({ length: 9 }, (_, index) => ({
    revision: null,
    url: '/critical-' + index + '.js',
  }))
  const harness = workerHarness(entries)
  const messages: Record<string, unknown>[] = []
  const postMessage = vi.fn(message => messages.push({ ...message }))
  harness.serviceWorkerGlobal.clients.matchAll.mockResolvedValue([{ postMessage }] as never)
  const signals: AbortSignal[] = []
  const cancel = vi.fn(async () => undefined)
  let failDownload!: (response: Response) => void
  harness.networkFetch.mockImplementation(async request => {
    const resource = request as TestRequest
    signals.push(resource.signal!)
    if (resource.url.endsWith('/critical-0.js')) {
      return new Promise(resolve => {
        failDownload = resolve
      })
    }
    return {
      ok: true,
      headers: new Headers({ 'content-type': 'text/javascript' }),
      body: { getReader: () => ({ read: () => new Promise(() => {}), cancel }) },
    }
  })
  let work!: Promise<unknown>
  let rejected = false
  harness.listeners.get('install')?.({
    waitUntil: (pending: Promise<unknown>) => {
      work = pending.catch(() => {
        rejected = true
      })
    },
  })
  try {
    await vi.advanceTimersByTimeAsync(0)
    failDownload(new Response('Missing', { status: 404 }))
    await vi.advanceTimersByTimeAsync(0)
    const failureIndex = messages.findIndex(message => message.type === 'SATIN_INSTALL_FAILURE')
    expect(failureIndex).toBeGreaterThanOrEqual(0)
    expect(messages[failureIndex]).toMatchObject({
      url: '/critical-0.js',
      reason: 'HTTP 404',
      networkFailure: false,
      stalled: false,
    })
    expect(signals.every(signal => signal.aborted)).toBe(true)
    expect(cancel).toHaveBeenCalledTimes(5)
    expect(harness.networkFetch).toHaveBeenCalledTimes(6)
    expect(rejected).toBe(true)
    harness.listeners.get('message')?.({
      data: { type: 'SATIN_DOWNLOAD_PROGRESS_REQUEST' },
      source: { postMessage },
    })
    await vi.advanceTimersByTimeAsync(9_000)
    expect(
      messages.slice(failureIndex + 1).some(message => message.type === 'SATIN_DOWNLOAD_PROGRESS'),
    ).toBe(false)
    expect(harness.cache.put).not.toHaveBeenCalled()
  } finally {
    await vi.advanceTimersByTimeAsync(8_001)
    await work
    vi.useRealTimers()
  }
})

it('keeps downloading beyond the idle budget while bytes continue arriving', async () => {
  vi.useFakeTimers()
  try {
    const harness = workerHarness([{ revision: null, url: '/slow.js', bytes: 3 }])
    let deliver!: (value: { done: boolean; value?: Uint8Array }) => void
    harness.networkFetch.mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'text/javascript' }),
      body: {
        getReader: () => ({
          read: () =>
            new Promise(resolve => {
              deliver = resolve
            }),
          cancel: vi.fn(),
        }),
      },
    })
    let work!: Promise<unknown>
    harness.listeners.get('install')?.({
      waitUntil: (pending: Promise<unknown>) => {
        work = pending
      },
    })
    await vi.advanceTimersByTimeAsync(0)
    for (let chunk = 0; chunk < 3; chunk++) {
      await vi.advanceTimersByTimeAsync(7_000)
      deliver({ done: false, value: new Uint8Array([chunk]) })
      await vi.advanceTimersByTimeAsync(0)
    }
    deliver({ done: true })
    await work
    expect(harness.cache.put).toHaveBeenCalledOnce()
    expect(harness.networkFetch).toHaveBeenCalledOnce()
  } finally {
    vi.useRealTimers()
  }
})

it.each([7_000, 9_000])(
  'counts response headers delayed by %i ms as progress before a normal body',
  async headerDelayMs => {
    vi.useFakeTimers()
    try {
      const harness = workerHarness([{ revision: null, url: '/late.js', bytes: 1 }])
      const postMessage = vi.fn()
      harness.serviceWorkerGlobal.clients.matchAll.mockResolvedValue([{ postMessage }] as never)
      harness.networkFetch.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, headerDelayMs))
        return new Response(
          new ReadableStream({
            start(controller) {
              setTimeout(() => {
                controller.enqueue(new Uint8Array([1]))
                controller.close()
              }, 7_000)
            },
          }),
          { headers: { 'content-type': 'text/javascript' } },
        )
      })
      let work!: Promise<unknown>
      harness.listeners.get('install')?.({
        waitUntil: (pending: Promise<unknown>) => {
          work = pending
        },
      })
      await vi.advanceTimersByTimeAsync(headerDelayMs + 1)
      expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ loaded: 0, activity: 1 }))
      await vi.advanceTimersByTimeAsync(7_001)
      await work
      expect(harness.cache.put).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  },
)

it('starts a queued seventh resource idle budget only when a download slot opens', async () => {
  vi.useFakeTimers()
  try {
    const entries = Array.from({ length: 7 }, (_value, index) => ({
      revision: null,
      url: '/file' + index + '.js',
    }))
    const harness = workerHarness(entries)
    harness.networkFetch.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 7000))
      return new Response('ok', { headers: { 'content-type': 'text/javascript' } })
    })
    let work!: Promise<unknown>
    harness.listeners.get('install')?.({
      waitUntil: (pending: Promise<unknown>) => {
        work = pending
      },
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(harness.networkFetch).toHaveBeenCalledTimes(6)
    await vi.advanceTimersByTimeAsync(14001)
    await work
    expect(harness.cache.put).toHaveBeenCalledTimes(7)
  } finally {
    vi.useRealTimers()
  }
})

it('pins overlapping precache paths to the old document through claim and worker restart', async () => {
  const entries = [
    ...manifest.entries,
    { revision: null, url: '/icon.png' },
    { revision: null, url: '/worker.js' },
    { revision: null, url: '/manifest.webmanifest' },
  ]
  const harness = workerHarness(entries)
  const oldCache = ownedPrefix + 'satin-app-shell-old-build'
  const bindings = new Map<string, Response>()
  harness.cache.put.mockImplementation(async (request, response) => {
    bindings.set(request.url, response.clone())
  })
  harness.cacheStorage.match.mockImplementation(async (key, options) => {
    const binding = bindings.get(new URL(key, 'https://satin.test').href)
    if (binding) return binding.clone()
    if (
      ['/icon.png', '/worker.js', '/manifest.webmanifest', '/assets/retired-hash.js'].includes(key)
    )
      return new Response(options.cacheName === oldCache ? 'old bytes' : 'new bytes')
    return undefined
  })
  const source = {
    id: 'old',
    url: 'https://satin.test/',
    visibilityState: 'hidden',
    postMessage: vi.fn(),
  }
  harness.serviceWorkerGlobal.clients.matchAll.mockResolvedValue([source] as never)
  let work!: Promise<unknown>
  harness.listeners.get('message')?.({
    data: { type: APP_SHELL_APPLY_BACKGROUND_UPDATE, previousBuildId: 'old-build' },
    source,
    waitUntil: (pending: Promise<unknown>) => {
      work = pending
    },
  })
  await work
  expect(harness.serviceWorkerGlobal.skipWaiting).toHaveBeenCalledOnce()
  harness.listeners.get('activate')?.({
    waitUntil: (pending: Promise<unknown>) => {
      work = pending
    },
  })
  await work
  expect(harness.serviceWorkerGlobal.clients.claim).toHaveBeenCalledOnce()
  // Execute another worker global to prove CacheStorage, not worker memory, owns the binding.
  const restarted = workerHarness(entries)
  restarted.cacheStorage.match.mockImplementation(harness.cacheStorage.match)
  for (const [path, destination] of [
    ['/icon.png', 'image'],
    ['/worker.js', 'worker'],
    ['/manifest.webmanifest', 'manifest'],
    ['/assets/retired-hash.js', 'script'],
  ]) {
    let response!: Promise<Response>
    restarted.listeners.get('fetch')?.({
      clientId: 'old',
      request: { ...new TestRequest(path!), destination },
      respondWith: (pending: Promise<Response>) => {
        response = pending
      },
    })
    expect(await (await response).text()).toBe('old bytes')
  }
  expect(harness.networkFetch).not.toHaveBeenCalled()
})

it('prunes stale document bindings without deleting live bindings or build entries', async () => {
  const harness = workerHarness()
  const stale = new TestRequest('/__satin_client__/dead')
  harness.cache.keys.mockResolvedValue([
    stale,
    new TestRequest('/__satin_client__/old'),
    new TestRequest('/assets/retired-hash.js'),
  ])
  const source = {
    id: 'old',
    url: 'https://satin.test/',
    visibilityState: 'hidden',
    postMessage: vi.fn(),
  }
  harness.serviceWorkerGlobal.clients.matchAll.mockResolvedValue([source] as never)
  let work!: Promise<unknown>
  harness.listeners.get('message')?.({
    source,
    data: { type: APP_SHELL_APPLY_BACKGROUND_UPDATE, previousBuildId: 'old-build' },
    waitUntil: (pending: Promise<unknown>) => {
      work = pending
    },
  })
  await work
  expect(harness.cache.delete).toHaveBeenCalledExactlyOnceWith(stale)
  expect(harness.serviceWorkerGlobal.skipWaiting).toHaveBeenCalledOnce()
})

it('preserves old-client protocol compatibility and denies claim if its build cannot be identified', async () => {
  const harness = workerHarness()
  harness.serviceWorkerGlobal.registration.active.postMessage.mockImplementation(() => {})
  const source = {
    id: 'old',
    url: 'https://satin.test/',
    visibilityState: 'hidden',
    postMessage: vi.fn(),
  }
  harness.serviceWorkerGlobal.clients.matchAll.mockResolvedValue([source] as never)
  let work!: Promise<unknown>
  harness.listeners.get('message')?.({
    source,
    data: { type: APP_SHELL_APPLY_COLD_UPDATE },
    waitUntil: (pending: Promise<unknown>) => {
      work = pending
    },
  })
  await work
  expect(source.postMessage).toHaveBeenCalledWith({ type: APP_SHELL_COLD_UPDATE_DENIED })
  expect(harness.serviceWorkerGlobal.skipWaiting).not.toHaveBeenCalled()
})

it('binds an older cold-launch document through the active worker build-ID protocol', async () => {
  const harness = workerHarness()
  const source = { id: 'legacy', url: 'https://satin.test/', postMessage: vi.fn() }
  harness.serviceWorkerGlobal.clients.matchAll.mockResolvedValue([source] as never)
  let work!: Promise<unknown>
  harness.listeners.get('message')?.({
    source,
    data: { type: APP_SHELL_APPLY_COLD_UPDATE },
    waitUntil: (pending: Promise<unknown>) => {
      work = pending
    },
  })
  await work
  expect(harness.serviceWorkerGlobal.registration.active.postMessage).toHaveBeenCalledOnce()
  expect(harness.serviceWorkerGlobal.registration.active.postMessage.mock.calls[0]![0]).toEqual({
    type: APP_SHELL_BUILD_ID_REQUEST,
  })
  expect(
    harness.serviceWorkerGlobal.registration.active.postMessage.mock.calls[0]![1],
  ).toHaveLength(1)
  expect(await harness.cache.put.mock.calls[0]![1].text()).toBe(
    ownedPrefix + 'satin-app-shell-old-build',
  )
  expect(harness.serviceWorkerGlobal.skipWaiting).toHaveBeenCalledOnce()
})

it('defers an unbound legacy suspension rather than guessing its document build after a prior claim', async () => {
  const harness = workerHarness()
  const source = {
    id: 'legacy-old-document',
    url: 'https://satin.test/',
    visibilityState: 'hidden',
    postMessage: vi.fn(),
  }
  harness.serviceWorkerGlobal.clients.matchAll.mockResolvedValue([source] as never)
  let work!: Promise<unknown>
  harness.listeners.get('message')?.({
    source,
    data: { type: APP_SHELL_APPLY_BACKGROUND_UPDATE },
    waitUntil: (pending: Promise<unknown>) => {
      work = pending
    },
  })
  await work
  expect(source.postMessage).toHaveBeenCalledWith({ type: APP_SHELL_COLD_UPDATE_DENIED })
  expect(harness.serviceWorkerGlobal.registration.active.postMessage).not.toHaveBeenCalled()
  expect(harness.serviceWorkerGlobal.skipWaiting).not.toHaveBeenCalled()
})
