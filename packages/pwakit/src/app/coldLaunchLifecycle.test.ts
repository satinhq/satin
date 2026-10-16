import vm from 'node:vm'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { prepareColdLaunchUpdate } from './coldLaunchUpdate.ts'
import { watchBackgroundUpdates } from './backgroundUpdate.ts'
import { renderServiceWorker } from '../sw/renderServiceWorker.ts'
import { APP_SHELL_BUILD_ID_REQUEST, APP_SHELL_BUILD_ID_RESPONSE } from '../sw/protocol.ts'

interface LifecycleWorker extends EventTarget {
  state: string
  postMessage(data: unknown, ports?: MessagePort[]): void
}

// Execute the shipped worker program. The host supplies lifecycle transitions,
// CacheStorage and WindowClients, including the activating state missing from
// the old unit test's direct installed -> controllerchange shortcut.
function lifecycle({
  discoveryDelayMs = 0,
  versionHint = false,
  claimDelayMs = 0,
}: { discoveryDelayMs?: number; versionHint?: boolean; claimDelayMs?: number } = {}) {
  const stored = new Map<string, Map<string, Response>>()
  stored.set(
    ':satin:app-shell:v2:https%3A%2F%2Fsatin.test%2F:test-a',
    new Map([
      ['/', new Response('old shell')],
      ['/assets/worker-a.js', new Response('old worker')],
    ]),
  )
  const network = new Map([
    ['/', 'build-b'],
    ['/assets/worker-b.js', 'self.postMessage("b")'],
  ])
  class RequestAtOrigin extends Request {
    constructor(input: string | URL | Request, init?: RequestInit) {
      super(typeof input === 'string' ? new URL(input, 'https://satin.test') : input, init)
    }
  }
  const active: LifecycleWorker = Object.assign(new EventTarget(), {
    state: 'activated',
    postMessage: (data: { type?: string }, ports: MessagePort[] = []) => {
      if (data.type === APP_SHELL_BUILD_ID_REQUEST)
        ports[0]?.postMessage({ type: APP_SHELL_BUILD_ID_RESPONSE, buildId: 'a' })
    },
  })
  const workers = Object.assign(new EventTarget(), {
    controller: active,
    getRegistration: async () => registration,
  })
  const registration = Object.assign(new EventTarget(), {
    active,
    waiting: null as typeof next | null,
    installing: null as typeof next | null,
    update: async () => {},
  })
  const listeners = new Map<string, (event: Record<string, unknown>) => void>()
  const dispatch = async (type: string, data: Record<string, unknown> = {}) => {
    const work: Promise<unknown>[] = []
    listeners.get(type)?.({
      ports: [],
      ...data,
      waitUntil: (promise: Promise<unknown>) => work.push(promise),
    })
    await Promise.all(work)
  }
  const next: LifecycleWorker = Object.assign(new EventTarget(), {
    state: 'installing',
    postMessage: (data: unknown, ports: MessagePort[] = []) => {
      void dispatch('message', { data, source: client, ports })
    },
  })
  const client = {
    id: 'launch',
    url: 'https://satin.test/',
    visibilityState: 'visible',
    postMessage: (data: unknown) =>
      workers.dispatchEvent(
        Object.assign(new Event('message'), { data: structuredClone(data), source: next }),
      ),
  }
  let activation: Promise<unknown> | undefined
  const cacheStorage = {
    keys: async () => [...stored.keys()],
    delete: async (name: string) => stored.delete(name),
    open: async (name: string) => {
      const cache = stored.get(name) ?? new Map<string, Response>()
      stored.set(name, cache)
      return {
        keys: async () =>
          [...cache.keys()].map(path => new Request(new URL(path, 'https://satin.test'))),
        delete: async (request: Request) => cache.delete(new URL(request.url).pathname),
        put: async (request: Request, response: Response) => {
          cache.set(new URL(request.url).pathname, response)
        },
      }
    },
    match: async (key: string, { cacheName }: { cacheName: string }) =>
      stored.get(cacheName)?.get(key)?.clone(),
  }
  vm.runInNewContext(
    renderServiceWorker({
      manifest: {
        buildId: 'b',
        cacheName: 'test-b',
        cachePrefix: 'test-',
        shellUrl: '/',
        format: 1,
        entries: [...network].map(([url, text]) => ({
          url,
          bytes: new TextEncoder().encode(text).length,
          revision: null,
        })),
      },
    }),
    {
      Request: RequestAtOrigin,
      Response,
      Blob,
      AbortController,
      setTimeout,
      clearTimeout,
      URL,
      Set,
      caches: cacheStorage,
      fetch: async (request: Request) =>
        new Response(network.get(new URL(request.url).pathname) ?? '', {
          status: network.has(new URL(request.url).pathname) ? 200 : 404,
          headers: { 'content-type': 'text/javascript' },
        }),
      self: {
        location: { origin: 'https://satin.test' },
        registration: { scope: 'https://satin.test/' },
        addEventListener: (type: string, listener: (event: Record<string, unknown>) => void) =>
          listeners.set(type, listener),
        clients: {
          matchAll: async () => [client],
          claim: async () => {
            if (claimDelayMs) await new Promise(resolve => setTimeout(resolve, claimDelayMs))
            workers.controller = next
            workers.dispatchEvent(new Event('controllerchange'))
          },
        },
        skipWaiting: async () => {
          registration.waiting = null
          registration.active = next
          next.state = 'activating'
          next.dispatchEvent(new Event('statechange'))
          activation = dispatch('activate').then(() => {
            next.state = 'activated'
            next.dispatchEvent(new Event('statechange'))
          })
        },
      },
    },
  )
  registration.update = async () => {
    if (discoveryDelayMs) await new Promise(resolve => setTimeout(resolve, discoveryDelayMs))
    registration.installing = next
    registration.dispatchEvent(new Event('updatefound'))
    // update() resolves when the installing worker is assigned, not when its
    // waitUntil() work completes. Installation is a separate browser job.
    void dispatch('install').then(
      () => {
        registration.installing = null
        registration.waiting = next
        next.state = 'installed'
        next.dispatchEvent(new Event('statechange'))
      },
      () => {
        registration.installing = null
        next.state = 'redundant'
        next.dispatchEvent(new Event('statechange'))
      },
    )
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      versionHint ? Response.json({ format: 1, buildId: 'b' }) : new Response('', { status: 404 }),
    ),
  )
  vi.stubGlobal('navigator', { onLine: true, serviceWorker: workers })
  vi.stubGlobal('window', { location: { reload: vi.fn() } })
  const session = new Map<string, string>()
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => session.get(key) ?? null,
    setItem: (key: string, value: string) => session.set(key, value),
    removeItem: (key: string) => session.delete(key),
  })
  const asset = async (path: string) => {
    let response!: Promise<Response>
    listeners.get('fetch')?.({
      clientId: client.id,
      request: {
        url: new URL(path, 'https://satin.test').href,
        method: 'GET',
        destination: 'worker',
        mode: 'cors',
      },
      respondWith: (pending: Promise<Response>) => {
        response = pending
      },
    })
    return (await response).text()
  }
  return {
    registration,
    workers,
    next,
    stored,
    network,
    client,
    asset,
    activation: () => activation,
  }
}

beforeEach(() => {
  vi.stubGlobal('__SATIN_LAUNCH_UPDATE_TRACE__', true)
})

afterEach(() => {
  vi.unstubAllGlobals()
  performance.clearMarks()
})

it('keeps the launch covered from a real install through activating and claim', async () => {
  const host = lifecycle()
  const progress = vi.fn()
  const result = await prepareColdLaunchUpdate('/', progress)
  await host.activation()
  expect(host.stored.get(':satin:app-shell:v2:https%3A%2F%2Fsatin.test%2F:test-b')?.size).toBe(2)
  expect(progress).not.toHaveBeenCalled()
  expect(result).toBe('reloading')
  expect(window.location.reload).toHaveBeenCalledOnce()
  expect(
    performance
      .getEntriesByName('satin-launch-update')
      .map(mark => (mark as PerformanceMark).detail.reason),
  ).toContain('reload')
})

it('applies an update without performance marks unless diagnostics are explicitly enabled', async () => {
  vi.stubGlobal('__SATIN_LAUNCH_UPDATE_TRACE__', undefined)
  const host = lifecycle()
  const progress = vi.fn()
  expect(await prepareColdLaunchUpdate('/', progress)).toBe('reloading')
  await host.activation()
  expect(progress).not.toHaveBeenCalled()
  expect(window.location.reload).toHaveBeenCalledOnce()
  expect(performance.getEntriesByName('satin-launch-update')).toEqual([])
})

it('keeps the current document when the generated install fails halfway', async () => {
  const host = lifecycle()
  host.network.delete('/assets/worker-b.js')
  expect(await prepareColdLaunchUpdate('/', vi.fn())).toBe('current')
  expect(window.location.reload).not.toHaveBeenCalled()
  expect(host.workers.controller.state).toBe('activated')
})

it('leaves a hinted new build waiting when WebKit publishes installing beyond the launch budget', async () => {
  const host = lifecycle({ discoveryDelayMs: 1300, versionHint: true })
  expect(await prepareColdLaunchUpdate('/', vi.fn())).toBe('current')
  await vi.waitFor(() => expect(host.registration.waiting?.state).toBe('installed'), {
    timeout: 2000,
  })
  expect(window.location.reload).not.toHaveBeenCalled()
  expect(fetch).toHaveBeenCalledWith(
    '/satin-version.json',
    expect.objectContaining({ cache: 'no-store' }),
  )
  const reasons = performance
    .getEntriesByName('satin-launch-update')
    .map(mark => (mark as PerformanceMark).detail.reason)
  expect(reasons).toEqual(['start', 'version-discovered', 'check-budget'])
})

it('leaves a late unannounced install waiting after the current app was revealed', async () => {
  const host = lifecycle({ discoveryDelayMs: 1300 })
  expect(await prepareColdLaunchUpdate('/', vi.fn())).toBe('current')
  await vi.waitFor(() => expect(host.registration.waiting?.state).toBe('installed'), {
    timeout: 2000,
  })
  expect(window.location.reload).not.toHaveBeenCalled()
  expect(host.workers.controller).not.toBe(host.next)
})

it('bounds a discovered version whose browser install never starts', async () => {
  const host = lifecycle({ versionHint: true })
  host.registration.update = () => new Promise(() => {})
  expect(await prepareColdLaunchUpdate('/', vi.fn())).toBe('current')
  expect(
    performance
      .getEntriesByName('satin-launch-update')
      .map(mark => (mark as PerformanceMark).detail.reason),
  ).toContain('check-budget')
  expect(window.location.reload).not.toHaveBeenCalled()
}, 10000)

it('installs a real replacement at suspension and applies it on the next offline cold launch', async () => {
  const host = lifecycle()
  const page = Object.assign(new EventTarget(), { hidden: false })
  vi.stubGlobal('document', page)
  vi.stubGlobal('window', Object.assign(new EventTarget(), { location: window.location }))
  const installed = vi.fn()
  const stop = watchBackgroundUpdates('/', installed)
  page.hidden = true
  page.dispatchEvent(new Event('visibilitychange'))
  await vi.waitFor(() => expect(installed).toHaveBeenCalled())
  expect(host.registration.waiting).toBe(host.next)
  expect(host.stored.get(':satin:app-shell:v2:https%3A%2F%2Fsatin.test%2F:test-b')?.size).toBe(2)
  expect(host.workers.controller).not.toBe(host.next)
  expect(window.location.reload).not.toHaveBeenCalled()
  stop()
  page.hidden = false
  vi.stubGlobal('navigator', { onLine: false, serviceWorker: host.workers })
  expect(await prepareColdLaunchUpdate('/', vi.fn())).toBe('reloading')
  await host.activation()
  expect(host.workers.controller).toBe(host.next)
  expect(window.location.reload).toHaveBeenCalledOnce()
})

it('a real late claim leaves the old document working while the next launch owns the new build', async () => {
  const host = lifecycle({ claimDelayMs: 3100 })
  expect(await prepareColdLaunchUpdate('/', vi.fn())).toBe('current')
  await host.activation()
  expect(host.registration.active).toBe(host.next)
  expect(host.registration.waiting).toBeNull()
  expect(host.workers.controller).toBe(host.next)
  expect(host.next.state).toBe('activated')
  expect(await host.asset('/assets/worker-a.js')).toBe('old worker')
  expect(window.location.reload).not.toHaveBeenCalled()
})
