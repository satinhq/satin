import { afterEach, expect, it, vi } from 'vitest'
import { beginMotionProbe, installMotionProbe, recordMotionPreparation } from './motionProbe.ts'
let dispose: (() => void) | undefined
afterEach(() => {
  dispose?.()
  dispose = undefined
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
it('owns no idle sampler or upload poll, and parks again after a completed window', async () => {
  vi.useFakeTimers()
  let id = 0
  const queue = new Map<number, FrameRequestCallback>()
  const raf = (callback: FrameRequestCallback) => {
    queue.set(++id, callback)
    return id
  }
  const cancel = (id: number) => {
    queue.delete(id)
  }
  const window = Object.assign(new EventTarget(), {
    requestAnimationFrame: raf,
    setTimeout,
    matchMedia: () => ({ matches: false }),
  })
  const document = Object.assign(new EventTarget(), {
    hidden: false,
    visibilityState: 'visible',
    documentElement: {},
    querySelectorAll: () => [],
    querySelector: () => null,
  })
  class Observer {
    static supportedEntryTypes: string[] = []
    observe() {}
    disconnect() {}
  }
  vi.stubGlobal('window', window)
  vi.stubGlobal('document', document)
  vi.stubGlobal('cancelAnimationFrame', cancel)
  vi.stubGlobal('MutationObserver', Observer)
  vi.stubGlobal('PerformanceObserver', Observer)
  vi.stubGlobal('navigator', { userAgent: 'test' })
  vi.stubGlobal('location', { href: 'https://unit.test' })
  vi.stubGlobal('history', { length: 1 })
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true })),
  )
  const probe = installMotionProbe({
    build: 'idle-test',
    graphicsMode: 'off',
    sampleNavigationFrames: false,
  })
  dispose = probe.dispose
  await vi.advanceTimersByTimeAsync(10_000)
  expect(queue.size).toBe(0)
  expect(vi.getTimerCount()).toBe(0)
  recordMotionPreparation({ kind: 'webgpu-timing', stage: 'first-present-complete' })
  await vi.advanceTimersByTimeAsync(3001)
  expect(fetch).toHaveBeenCalledOnce()
  expect(queue.size).toBe(0)
  expect(vi.getTimerCount()).toBe(0)
  vi.mocked(fetch).mockClear()
  const end = beginMotionProbe('push', 'unit')
  expect(queue.size).toBe(1)
  const callbacks = [...queue.values()]
  queue.clear()
  callbacks.forEach(callback => callback(16))
  expect(queue.size).toBe(1)
  end()
  expect(queue.size).toBe(0)
  await vi.advanceTimersByTimeAsync(3001)
  expect(fetch).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
  expect(queue.size).toBe(0)
  expect(probe.report().sampling.observerCallbacks).toBe(1)
  await vi.advanceTimersByTimeAsync(30_000)
  expect(fetch).toHaveBeenCalledOnce()
  expect(queue.size).toBe(0)
})
