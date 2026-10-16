import vm from 'node:vm'
import { vi } from 'vitest'
import { renderServiceWorker } from '../src/sw/renderServiceWorker.ts'
export function cacheStorage() {
  const stores = new Map<string, Map<string, Response>>()
  return {
    stores,
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map())
      const entries = stores.get(name)!
      const key = (value: any) => (typeof value === 'string' ? value : value.url)
      return {
        put: async (input: any, response: Response) => {
          entries.set(key(input), response.clone())
        },
        match: async (input: any) => entries.get(key(input))?.clone(),
        delete: async (input: any) => entries.delete(key(input)),
        keys: async () => [...entries.keys()].map(url => ({ url })),
      }
    },
  }
}
export function worker(caches = cacheStorage()) {
  const handlers = new Map<string, Function[]>()
  const clients = { matchAll: vi.fn(async (): Promise<any[]> => []), openWindow: vi.fn() }
  const registration = { showNotification: vi.fn().mockResolvedValue(undefined) }
  const navigator = { setAppBadge: vi.fn(), clearAppBadge: vi.fn() }
  vm.runInNewContext(
    renderServiceWorker({
      manifest: {
        buildId: 'x',
        cacheName: 'x',
        cachePrefix: 'shell-',
        format: 1,
        shellUrl: '/app/',
        entries: [],
      },
    }),
    {
      URL,
      Response,
      caches,
      self: {
        location: { origin: 'https://app.test' },
        clients,
        registration,
        navigator,
        addEventListener: (type: string, handler: Function) =>
          handlers.set(type, [...(handlers.get(type) ?? []), handler]),
      },
    },
  )
  const dispatch = async (type: string, event: Record<string, unknown>) => {
    const pending: Promise<void>[] = []
    for (const handler of handlers.get(type) ?? [])
      handler({ ...event, waitUntil: (p: Promise<void>) => pending.push(p) })
    await Promise.all(pending)
  }
  return { dispatch, clients, registration, navigator, caches }
}
