import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { renderServiceWorker } from './renderServiceWorker.ts'

// Separate worker globals/registrations share the origin's real cache namespace.
// Install, activate and fetch handlers execute the generated worker, not a model
// of its cleanup policy. Pausing fetch keeps a successor genuinely mid-install.
function originHarness() {
  const storage = new Map<string, Map<string, Response>>()
  const windows: { id: string; url: string; postMessage: () => void }[] = []
  const key = (request: string | Request) =>
    new URL(typeof request === 'string' ? request : request.url, 'https://satin.test').href
  const caches = {
    keys: async () => [...storage.keys()],
    delete: async (name: string) => storage.delete(name),
    match: async (request: string | Request, { cacheName }: { cacheName: string }) =>
      storage.get(cacheName)?.get(key(request))?.clone(),
    open: async (name: string) => {
      if (!storage.has(name)) storage.set(name, new Map())
      const entries = storage.get(name)!
      return {
        put: async (request: Request, response: Response) => {
          entries.set(key(request), response)
        },
        keys: async () => [...entries.keys()].map(url => new Request(url)),
      }
    },
  }
  function worker(
    scope: string,
    buildId: string,
    fetchAsset: (request?: Request) => Promise<Response> = async () =>
      new Response(buildId, { headers: { 'content-type': 'text/javascript' } }),
  ) {
    const listeners = new Map<string, (event: Record<string, unknown>) => void>()
    const registration: { scope: string; installing?: unknown; waiting?: unknown } = {
      scope: `https://satin.test${scope}`,
    }
    vm.runInNewContext(
      renderServiceWorker({
        legacyCacheNames: ['satin-foundation-v10'],
        manifest: {
          buildId,
          cacheName: `satin-app-shell-${buildId}`,
          cachePrefix: 'satin-app-shell-',
          shellUrl: scope,
          format: 1,
          entries: [
            { url: scope, revision: buildId },
            { url: `${scope}assets/${buildId}.js`, revision: null },
          ],
        },
      }),
      {
        URL,
        Response,
        Headers,
        Blob,
        AbortController,
        setTimeout,
        clearTimeout,
        Set,
        performance,
        caches,
        Request: class extends Request {
          constructor(url: string, options?: RequestInit) {
            super(key(url), options)
          }
        },
        fetch: fetchAsset,
        self: {
          registration,
          location: { origin: 'https://satin.test' },
          clients: { matchAll: async () => windows, claim: async () => undefined },
          addEventListener: (type: string, listener: (event: Record<string, unknown>) => void) =>
            listeners.set(type, listener),
        },
      },
    )
    return {
      registration,
      dispatch: async (type: string, event: Record<string, unknown> = {}) => {
        const pending: Promise<unknown>[] = []
        listeners.get(type)!({
          waitUntil: (promise: Promise<unknown>) => pending.push(promise),
          respondWith: (promise: Promise<unknown>) => pending.push(promise),
          ...event,
        })
        await Promise.all(pending)
      },
      asset: async (path: string) => {
        let response!: Promise<Response>
        listeners.get('fetch')!({
          request: {
            url: `https://satin.test${path}`,
            method: 'GET',
            cache: 'default',
            mode: 'cors',
            destination: 'script',
          },
          respondWith: (value: Promise<Response>) => {
            response = value
          },
        })
        return response
      },
    }
  }
  return { storage, windows, caches, worker }
}

describe('registration cache ownership', () => {
  it('settles uncached session requests with their original body and server response', async () => {
    const origin = originHarness()
    const worker = origin.worker('/app/', 'current', async request => {
      return new Response(await request!.text(), {
        status: 202,
        headers: { 'content-type': request!.headers.get('content-type')! },
      })
    })
    let response: Promise<Response> | undefined
    await worker.dispatch('fetch', {
      request: new Request('https://satin.test/auth/exchange', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ transactionID: 'pending-session' }),
      }),
      respondWith: (value: Promise<Response>) => {
        response = value
      },
    })
    expect(response).toBeDefined()
    const result = await response!
    expect(result.status).toBe(202)
    expect(result.headers.get('content-type')).toBe('application/json')
    expect(await result.json()).toEqual({ transactionID: 'pending-session' })
    expect(origin.storage.size).toBe(0)
  })

  it('serves old assets offline, notices a successor after the first lookup, and never resurrects a pruned cache', async () => {
    const origin = originHarness()
    let offline = false
    const current = origin.worker('/app/', 'current', async () => {
      if (offline) throw new Error('offline')
      return new Response('current', { headers: { 'content-type': 'text/javascript' } })
    })
    const old = origin.worker('/app/', 'old')
    await old.dispatch('install')
    await current.dispatch('install')
    offline = true
    const oldName = [...origin.storage.keys()].find(name => name.endsWith('old'))!
    origin.windows.push({ id: 'old-page', url: 'https://satin.test/app/', postMessage() {} })
    await current.dispatch('activate')
    expect(await (await current.asset('/app/assets/old.js')).text()).toBe('old')
    await expect(current.asset('/app/assets/absent.js')).rejects.toThrow('offline')

    const successor = origin.worker('/app/', 'successor')
    await successor.dispatch('install')
    expect(await (await current.asset('/app/assets/successor.js')).text()).toBe('successor')

    origin.windows.length = 0
    await current.dispatch('fetch', {
      request: { url: 'https://satin.test/app/', mode: 'navigate', method: 'GET' },
      resultingClientId: 'new-page',
    })
    expect(origin.storage.has(oldName)).toBe(false)
    await expect(current.asset('/app/assets/old.js')).rejects.toThrow('offline')
    expect(origin.storage.has(oldName)).toBe(false)
  })

  it('falls through to network if retired-cache lookup rejects', async () => {
    const origin = originHarness()
    const current = origin.worker(
      '/app/',
      'current',
      async () => new Response('network', { headers: { 'content-type': 'text/javascript' } }),
    )
    await current.dispatch('install')
    origin.storage.set(
      ':satin:app-shell:v2:' + encodeURIComponent('https://satin.test/app/') + ':broken',
      new Map(),
    )
    const originalMatch = origin.caches.match
    origin.caches.match = async () => {
      throw new Error('cache storage failed')
    }
    expect(await (await current.asset('/app/assets/other.js')).text()).toBe('network')
    origin.caches.match = originalMatch
  })

  it.each(['activate', 'cold navigation'])(
    '%s preserves another registration and its installing successor',
    async event => {
      const origin = originHarness()
      const appOld = origin.worker('/app/', 'app-old')
      const app = origin.worker('/app/', 'app-current')
      const other = origin.worker('/other/', 'other-live')
      await appOld.dispatch('install')
      await app.dispatch('install')
      await other.dispatch('install')
      // Existing installs contain no trustworthy registration ownership metadata.
      origin.storage.set('satin-app-shell-legacy-other', new Map())
      origin.storage.set('satin-foundation-v10', new Map())
      const otherNames = [...origin.storage.keys()].filter(name => name.includes('other'))
      let release!: () => void
      const barrier = new Promise<void>(resolve => {
        release = resolve
      })
      const successor = origin.worker('/other/', 'other-next', async () => {
        await barrier
        return new Response('next', { headers: { 'content-type': 'text/javascript' } })
      })
      other.registration.installing = successor
      const installing = successor.dispatch('install')
      // install opens the cache synchronously before its first awaited download.
      await Promise.resolve()
      const successorName = [...origin.storage.keys()].find(name => name.endsWith('other-next'))!
      expect(successorName).toBeTruthy()
      origin.windows.push({
        id: 'other-window',
        url: 'https://satin.test/other/',
        postMessage() {},
      })
      if (event === 'activate') await app.dispatch('activate')
      else
        await app.dispatch('fetch', {
          request: { url: 'https://satin.test/app/', mode: 'navigate', method: 'GET' },
          resultingClientId: 'new-app',
        })
      release()
      await installing
      for (const name of [...otherNames, successorName, 'satin-foundation-v10'])
        expect(origin.storage.has(name), name).toBe(true)
      expect([...origin.storage.keys()].some(name => name.endsWith('app-current'))).toBe(true)
      expect([...origin.storage.keys()].some(name => name.endsWith('app-old'))).toBe(false)
      // An old deployed worker's broad prefix cleanup cannot delete new caches.
      expect(successorName.startsWith('satin-app-shell-')).toBe(false)
    },
  )
})
