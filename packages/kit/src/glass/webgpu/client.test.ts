// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { WebGPUClient } from './client.ts'
import { reportGlassError } from '../errors.ts'
const held = vi.hoisted(() => ({ dark: true }))
vi.mock('../../app/appearance.ts', () => ({ readDarkAppearance: () => held.dark }))
vi.mock('../errorAlert.ts', () => ({ installGlassErrorAlert: vi.fn() }))
vi.mock('../errors.ts', () => ({ reportGlassError: vi.fn(), setGlassAdapterRecovery: vi.fn() }))
afterEach(() => vi.unstubAllGlobals())
it('hides before store callbacks and handles pagehide/pageshow without visibilitychange', async () => {
  const requests: { type: string; visible?: boolean }[] = []
  class Worker {
    onmessage?: (event: { data: unknown }) => void
    postMessage({ id, request }: { id: number; request: { type: string; visible?: boolean } }) {
      requests.push(request)
      queueMicrotask(() => this.onmessage?.({ data: { id, value: {} } }))
    }
  }
  vi.stubGlobal('Worker', Worker)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    queueMicrotask(() => callback(0))
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  const storeHide = () => {
    requests.push({ type: 'store-hide' })
  }
  document.addEventListener('visibilitychange', storeHide)
  const client = new WebGPUClient()
  try {
    await client.init(
      { transferControlToOffscreen: () => ({}) } as HTMLCanvasElement,
      1,
      true,
      true,
    )
    requests.length = 0
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(requests.filter(request => request.type !== 'adapter-visibility').slice(0, 2)).toEqual([
      { type: 'visible', visible: false },
      { type: 'store-hide' },
    ])
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    for (let repeat = 0; repeat < 5; repeat++) client.resume()
    requests.length = 0
    window.dispatchEvent(new Event('pagehide'))
    expect(requests.filter(request => request.type === 'visible')).toHaveLength(1)
    expect(requests.at(-1)).toEqual({ type: 'visible', visible: false })
    window.dispatchEvent(new Event('pageshow'))
    expect(requests.filter(request => request.type === 'retry-adapter')).toHaveLength(1)
    expect(requests.findLast(request => request.type === 'visible')).toMatchObject({
      type: 'visible',
      visible: true,
      appearance: 'dark',
    })
    requests.length = 0
    client.deferResume = true
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('focus'))
    expect(requests.filter(request => request.type === 'retry-adapter')).toHaveLength(2)
  } finally {
    document.removeEventListener('visibilitychange', storeHide)
    delete (document as unknown as { visibilityState?: string }).visibilityState
    requests.length = 0
    await client.park()
    expect(requests.some(request => request.type === 'adapter-visibility')).toBe(false)
    requests.length = 0
    window.dispatchEvent(new Event('pagehide'))
    expect(requests).toEqual([{ type: 'adapter-visibility', visible: false }])
  }
})
it('reads the current store at resume dispatch, including the deferred production path', async () => {
  let pageAppearance: 'dark' | 'light' = 'light'
  const requests: unknown[] = []
  class Worker {
    onmessage?: (event: { data: unknown }) => void
    postMessage({ id, request }: { id: number; request: unknown }) {
      requests.push(request)
      queueMicrotask(() => this.onmessage?.({ data: { id, value: { ready: true } } }))
    }
  }
  vi.stubGlobal('Worker', Worker)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    queueMicrotask(() => callback(0))
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  // Raw WebKit appearance still reports light while the page store has material dark.
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  const client = new WebGPUClient()
  await client.init(
    { transferControlToOffscreen: () => ({}) } as HTMLCanvasElement,
    1,
    true,
    true,
    () => pageAppearance,
  )
  await client.request({ type: 'visible', visible: false })
  pageAppearance = 'dark'
  await client.request({ type: 'visible', visible: true })
  expect(requests.at(-1)).toEqual({
    type: 'visible',
    visible: true,
    appearance: 'dark',
    reducedMotion: false,
  })
  await client.park()
})
it.each([true, false])(
  'seeds initial and replacement workers with held appearance %s',
  async dark => {
    held.dark = dark
    const initialized: unknown[] = []
    class Worker {
      onmessage?: (event: { data: unknown }) => void
      postMessage({ id, request }: { id: number; request: { type: string; appearance?: string } }) {
        if (request.type === 'init') initialized.push(request.appearance)
        queueMicrotask(() => this.onmessage?.({ data: { id, value: { ready: true } } }))
      }
    }
    vi.stubGlobal('Worker', Worker)
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      queueMicrotask(() => callback(0))
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', () => {})
    // The query may disagree with the held page appearance throughout startup.
    vi.stubGlobal('matchMedia', () => ({ matches: !dark }))
    for (let replacement = 0; replacement < 2; replacement++) {
      const client = new WebGPUClient()
      await client.init(
        { transferControlToOffscreen: () => ({}) } as HTMLCanvasElement,
        1,
        true,
        true,
      )
      await client.park()
    }
    expect(initialized).toEqual([dark ? 'dark' : 'light', dark ? 'dark' : 'light'])
  },
)

it('rereads appearance when a lost device is restored', async () => {
  held.dark = false
  const requests: unknown[] = []
  let worker: { onmessage?: (event: { data: unknown }) => void } | undefined
  class Worker {
    onmessage?: (event: { data: unknown }) => void
    constructor() {
      worker = this
    }
    postMessage({ id, request }: { id: number; request: unknown }) {
      requests.push(request)
      queueMicrotask(() => this.onmessage?.({ data: { id, value: { ready: true } } }))
    }
  }
  vi.stubGlobal('Worker', Worker)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    queueMicrotask(() => callback(0))
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  const client = new WebGPUClient()
  await client.init({ transferControlToOffscreen: () => ({}) } as HTMLCanvasElement, 1, true, true)
  held.dark = true
  worker?.onmessage?.({ data: { appearanceRefresh: true } })
  await Promise.resolve()
  expect(requests).toContainEqual({
    type: 'canonical',
    request: { type: 'appearance', value: 'dark', reducedMotion: false },
  })
  await client.park()
})

it('reports an unreconstructed settled device at the visible deadline and cancels after recovery', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
  vi.mocked(reportGlassError).mockClear()
  let emit!: (data: unknown) => void
  class Worker {
    onmessage?: (event: { data: unknown }) => void
    constructor() {
      emit = data => this.onmessage?.({ data })
    }
    postMessage({ id }: { id: number }) {
      queueMicrotask(() => emit({ id, value: {} }))
    }
  }
  vi.stubGlobal('Worker', Worker)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    queueMicrotask(() => callback(0))
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  const client = new WebGPUClient()
  try {
    await client.init(
      { transferControlToOffscreen: () => ({}) } as HTMLCanvasElement,
      1,
      true,
      true,
    )
    emit({ adapterRecovery: true })
    await vi.advanceTimersByTimeAsync(9000)
    window.dispatchEvent(new Event('pagehide'))
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
    expect(reportGlassError).not.toHaveBeenCalled()
    window.dispatchEvent(new Event('pageshow'))
    emit({ adapterRecovery: true })
    await vi.advanceTimersByTimeAsync(1000)
    expect(reportGlassError).toHaveBeenCalledWith(
      'readiness-timeout',
      expect.any(String),
      'device recovery',
    )
    emit({ adapterRecovery: false })
    vi.mocked(reportGlassError).mockClear()
    emit({ adapterRecovery: true })
    await vi.advanceTimersByTimeAsync(4000)
    emit({ adapterRecovery: false })
    await vi.advanceTimersByTimeAsync(10000)
    expect(reportGlassError).not.toHaveBeenCalled()
  } finally {
    await client.park()
    delete (document as unknown as { visibilityState?: string }).visibilityState
    vi.useRealTimers()
  }
})

it.each(['error', 'timeout', 'constructor'] as const)(
  'retries a worker startup %s before transferring its canvas',
  async failure => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let created = 0
    class Worker {
      number = ++created
      constructor() {
        if (failure === 'constructor' && this.number === 1) throw Error('script unavailable')
      }
      onmessage?: (event: { data: unknown }) => void
      onerror?: (event: { message: string }) => void
      terminate() {}
      postMessage({ id, request }: { id: number; request: { type: string } }) {
        if (this.number === 1 && request.type === 'capability') {
          if (failure === 'error')
            queueMicrotask(() => this.onerror?.({ message: 'Failed to load worker script' }))
          return
        }
        queueMicrotask(() => this.onmessage?.({ data: { id, value: {} } }))
      }
    }
    vi.stubGlobal('Worker', Worker)
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      queueMicrotask(() => callback(0))
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', () => {})
    const transfer = vi.fn(() => ({}))
    const client = new WebGPUClient()
    try {
      const ready = client.init(
        { transferControlToOffscreen: transfer } as unknown as HTMLCanvasElement,
        1,
        true,
        true,
      )
      await vi.advanceTimersByTimeAsync(3000)
      await ready
      expect(created).toBe(2)
      expect(transfer).toHaveBeenCalledOnce()
    } finally {
      client.close()
      vi.useRealTimers()
    }
  },
)
