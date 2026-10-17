import { describe, it, expect, vi } from 'vitest'
import { createReachabilityController, type ReachabilityEnvironment } from './controller.ts'
import type { ReachabilityProfile } from './model.ts'
import { defineApp } from '../public/definition.ts'
const server: ReachabilityProfile = {
  connectivity: 'server',
  reachability: {
    probe: { url: '/health', method: 'HEAD', timeoutMs: 10 },
    defaultRoutePolicy: 'local-first',
    routes: { remote: 'requires-server' },
    surfaces: { localFirst: 'none', requiresServer: 'full-screen' },
  },
}
const settle = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}
it('reports app-server request outcomes without mistaking HTTP or abort errors for an outage', async () => {
  const { env, events } = environment()
  const declared = defineApp({
    id: 'offline-regression',
    name: 'Offline regression',
    icons: { source: '/icon.png' },
    connectivity: 'server',
    reachability: server.reachability,
  })
  expect(declared.connectivity).toBe('server')
  const controller = createReachabilityController(declared, 'remote', env)
  controller.start()
  await settle()
  await expect(controller.fetch('/data')).resolves.toHaveProperty('status', 503)
  expect(controller.getSnapshot()).toMatchObject({ status: 'reachable' })
  vi.mocked(env.fetch).mockRejectedValueOnce(new DOMException('Cancelled', 'AbortError'))
  await expect(controller.fetch('/data')).rejects.toHaveProperty('name', 'AbortError')
  expect(controller.getSnapshot()).toMatchObject({ status: 'reachable' })
  vi.mocked(env.fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'))
  await expect(controller.fetch('/data')).rejects.toThrow('Failed to fetch')
  expect(controller.getSnapshot()).toMatchObject({
    status: 'server-unreachable',
    presentedSurface: { reason: 'server-unreachable', surface: 'full-screen' },
  })
  // Cached bytes cannot recover an outage; the uncached probe is independent.
  let finishProbe!: (response: Response) => void
  vi.mocked(env.fetch)
    .mockResolvedValueOnce(new Response())
    .mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finishProbe = resolve
        }),
    )
  await controller.fetch('/cached', { cache: 'force-cache' })
  expect(controller.getSnapshot().status).not.toBe('reachable')
  finishProbe(new Response())
  await settle()
  expect(controller.getSnapshot().status).toBe('reachable')
  // Caller cancellation is defined by the effective signal, including Request.
  const reason = new Error('screen disappeared')
  const abort = new AbortController()
  abort.abort(reason)
  vi.mocked(env.fetch).mockRejectedValueOnce(reason)
  await expect(
    controller.fetch(new Request('http://satin.local/data', { signal: abort.signal })),
  ).rejects.toBe(reason)
  expect(controller.getSnapshot().status).toBe('reachable')
  const custom = new Error('route disposed')
  const customAbort = new AbortController()
  customAbort.abort(custom)
  vi.mocked(env.fetch).mockRejectedValueOnce(custom)
  await expect(controller.fetch('/data', { signal: customAbort.signal })).rejects.toBe(custom)
  expect(controller.getSnapshot().status).toBe('reachable')
  // Explicit null removes the Request's aborted signal; real transport errors still count.
  vi.mocked(env.fetch).mockRejectedValueOnce(new TypeError('uncancelled transport failed'))
  await expect(
    controller.fetch(new Request('http://satin.local/data', { signal: abort.signal }), {
      signal: null,
    }),
  ).rejects.toThrow('uncancelled transport failed')
  expect(controller.getSnapshot().status).toBe('server-unreachable')
  controller.recheck()
  await settle()
  let finishData!: (response: Response) => void
  vi.mocked(env.fetch).mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finishData = resolve
      }),
  )
  const stale = controller.fetch('/cached', { cache: 'force-cache' })
  events.get('offline')!()
  finishData(new Response())
  await stale
  expect(controller.getSnapshot()).toMatchObject({
    navigatorOnline: false,
    status: 'device-offline',
  })
  controller.reportFetchOutcome('response')
  expect(controller.getSnapshot().status).toBe('device-offline')
  // An observation from before offline cannot overwrite a newer successful probe.
  events.get('online')!()
  await settle()
  let failOld!: (error: Error) => void
  vi.mocked(env.fetch).mockImplementationOnce(
    () =>
      new Promise((_, reject) => {
        failOld = reject
      }),
  )
  const oldRequest = controller.fetch('/old').catch(error => error)
  events.get('offline')!()
  events.get('online')!()
  await settle()
  failOld(new Error('old transport failure'))
  await oldRequest
  expect(controller.getSnapshot().status).toBe('reachable')
  controller.dispose()
})
function environment() {
  const events = new Map<string, () => void>()
  const env: ReachabilityEnvironment = {
    online: vi.fn(() => true),
    fetch: vi.fn(async () => new Response(null, { status: 503 })),
    listen: vi.fn((name, cb) => {
      events.set(name, cb)
      return () => {
        events.delete(name)
      }
    }),
  }
  return { env, events }
}
describe('reachability browser adapter', () => {
  it('does no work for local profiles, including listeners and navigator reads', () => {
    const { env } = environment()
    const c = createReachabilityController({ connectivity: 'local' }, '', env)
    c.start()
    c.recheck()
    c.setRoute('remote')
    c.reportFetchOutcome('network-failure')
    c.dispose()
    expect(env.fetch).not.toHaveBeenCalled()
    expect(env.listen).not.toHaveBeenCalled()
    expect(env.online).not.toHaveBeenCalled()
    expect(c.getSnapshot().status).toBe('local')
  })
  it('treats HTTP errors as reachable, never polls, and reacts only at boundaries', async () => {
    const { env, events } = environment()
    const c = createReachabilityController(server, '', env)
    expect(env.fetch).not.toHaveBeenCalled()
    c.start()
    await settle()
    expect(c.getSnapshot().status).toBe('reachable')
    expect(env.fetch).toHaveBeenCalledTimes(1)
    expect(env.fetch).toHaveBeenCalledWith(
      '/health',
      expect.objectContaining({
        method: 'HEAD',
        cache: 'no-store',
        redirect: 'error',
      }),
    )
    c.reportFetchOutcome('network-failure')
    c.setRoute('remote')
    expect(c.getSnapshot()).toMatchObject({
      status: 'server-unreachable',
      presentedSurface: { surface: 'full-screen' },
    })
    expect(env.fetch).toHaveBeenCalledTimes(1)
    events.get('resume')!()
    await settle()
    expect(c.getSnapshot().status).toBe('reachable')
    c.dispose()
    expect(events.size).toBe(0)
  })
  it('retains an in-flight probe across route changes, rejects late results after offline', async () => {
    const { env, events } = environment()
    let answer!: (r: Response) => void
    env.fetch = vi.fn(
      () =>
        new Promise<Response>(resolve => {
          answer = resolve
        }),
    )
    const c = createReachabilityController(server, '', env)
    c.start()
    c.setRoute('remote')
    events.get('offline')!()
    answer(new Response())
    await settle()
    expect(c.getSnapshot().status).toBe('device-offline')
    c.dispose()
  })
  it('aborts at timeout and settles failure; lifecycle aborts do not publish', async () => {
    vi.useFakeTimers()
    const { env } = environment()
    env.fetch = vi.fn(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) =>
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
        ),
    )
    const c = createReachabilityController(server, 'remote', env)
    c.start()
    await vi.advanceTimersByTimeAsync(11)
    expect(c.getSnapshot().status).toBe('server-unreachable')
    c.recheck()
    c.dispose()
    await settle()
    expect(c.getSnapshot().status).toBe('server-unreachable')
    vi.useRealTimers()
  })
})
