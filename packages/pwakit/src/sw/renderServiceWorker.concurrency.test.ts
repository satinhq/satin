import vm from 'node:vm'
import { afterEach, expect, it, vi } from 'vitest'
import { renderServiceWorker } from './renderServiceWorker.ts'
import type { AppShellPrecacheManifest } from './manifest.ts'

function deferred<Value>() {
  let resolve!: (value: Value) => void
  const promise = new Promise<Value>(complete => {
    resolve = complete
  })
  return { promise, resolve }
}

class ScopedRequest extends Request {
  constructor(input: string | Request, options?: RequestInit) {
    super(typeof input === 'string' ? new URL(input, 'https://satin.test').href : input, options)
  }
}

afterEach(() => vi.useRealTimers())

it('keeps at most six downloads outstanding and waits for every asset and cache write before installation succeeds', async () => {
  vi.useFakeTimers()
  const entries = Array.from({ length: 13 }, (_, index) => ({
    url: `/asset-${index}.js`,
    revision: null,
  }))
  const manifest: AppShellPrecacheManifest = {
    buildId: 'concurrency',
    cacheName: 'satin-app-shell-concurrency',
    cachePrefix: 'satin-app-shell-',
    format: 1,
    shellUrl: '/',
    entries,
  }
  const starts = entries.map(() => deferred<void>())
  const downloads: ReturnType<typeof deferred<Response>>[] = []
  const writes = entries.map(() => deferred<void>())
  const finalWrite = deferred<void>()
  let outstanding = 0
  let peak = 0
  const fetcher = vi.fn(async () => {
    const download = deferred<Response>()
    downloads.push(download)
    outstanding++
    peak = Math.max(peak, outstanding)
    starts[downloads.length - 1]!.resolve()
    try {
      return await download.promise
    } finally {
      outstanding--
    }
  })
  const cache = {
    put: vi.fn(async () => {
      const index = cache.put.mock.calls.length - 1
      writes[index]!.resolve()
      if (index === entries.length - 1) await finalWrite.promise
    }),
  }
  const listeners = new Map<
    string,
    (event: { waitUntil: (promise: Promise<void>) => void }) => void
  >()
  const worker = {
    addEventListener: (
      name: string,
      listener: (event: { waitUntil: (promise: Promise<void>) => void }) => void,
    ) => {
      listeners.set(name, listener)
    },
    location: { origin: 'https://satin.test' },
    registration: { scope: 'https://satin.test/' },
    clients: { matchAll: async () => [], claim: vi.fn() },
    skipWaiting: vi.fn(),
  }
  vm.runInNewContext(renderServiceWorker({ manifest }), {
    self: worker,
    caches: { open: async () => cache, keys: async () => [] },
    fetch: fetcher,
    Request: ScopedRequest,
    Response,
    Headers,
    Blob,
    URL,
    AbortController,
    crypto,
    console,
    setTimeout,
    clearTimeout,
    performance,
  })
  let installation!: Promise<void>
  listeners.get('install')!({
    waitUntil: promise => {
      installation = promise
    },
  })
  let installed = false
  void installation.then(() => {
    installed = true
  })
  await starts[5]!.promise
  expect(fetcher).toHaveBeenCalledTimes(6)
  expect(outstanding).toBe(6)
  expect(cache.put).not.toHaveBeenCalled()
  expect(installed).toBe(false)

  const finishDownload = (index: number) =>
    downloads[index]!.resolve(
      new Response('// asset', { headers: { 'content-type': 'text/javascript' } }),
    )
  for (let next = 6; next < entries.length; next++) {
    finishDownload(next - 6)
    await starts[next]!.promise
    expect(outstanding).toBe(6)
    expect(fetcher).toHaveBeenCalledTimes(next + 1)
    expect(peak).toBe(6)
  }
  for (let index = entries.length - 6; index < entries.length - 1; index++) finishDownload(index)
  await writes[entries.length - 2]!.promise
  expect(installed).toBe(false)
  expect(outstanding).toBe(1)
  finishDownload(entries.length - 1)
  await writes[entries.length - 1]!.promise
  expect(installed).toBe(false)
  finalWrite.resolve()
  await installation
  expect(installed).toBe(true)
  expect(cache.put).toHaveBeenCalledTimes(entries.length)
  expect(peak).toBe(6)
  expect(worker.skipWaiting).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})
