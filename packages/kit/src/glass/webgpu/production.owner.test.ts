// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { ProductionGlassRuntime } from './production.ts'
import { TabMotion } from '../lens/tabMotion.ts'
import { WebGPUClient } from './client.ts'

// The real shared ProductionGlassRuntime.create(): ownership across StrictMode's setup → cleanup → setup
// while initialization is pending (initialization, mount, bind and teardown stubbed).
type Runtime = Record<string, unknown> & {
  attached: boolean
  navigationActive: boolean
  lastScrollAt: number
  prepareProgress: number
  regionIds: Map<string, string>
  menuTracks: Map<string, unknown>
  schedulePrepare: () => void
  track: (id: string, specs: unknown[], duration: number) => void
  setMenuEnabled: (enabled: boolean) => void
  dispose: (owner?: unknown) => void
}
function options(onPresentationError = vi.fn()) {
  const div = () => document.createElement('div')
  const band = document.createElement('canvas')
  document.body.append(band)
  return {
    menuEnabled: true,
    appearance: 'light',
    geometry: {},
    onPresentationError,
    elements: {
      band: { canvas: band },
      menu: { items: div(), itemsClip: div(), shadow: div(), shadowPlate: div(), trigger: div() },
    },
  }
}
afterEach(() => {
  document.body.replaceChildren()
})

it('does not defer a held tab source behind destination layout scroll events', () => {
  vi.useFakeTimers()
  const frame = vi.fn(() => 1)
  vi.stubGlobal('requestAnimationFrame', frame)
  const runtime = Object.create(ProductionGlassRuntime.prototype)
  Object.assign(runtime, {
    attached: true,
    contentInstall: 11,
    lastScrollAt: performance.now(),
    options: { elements: { scroller: document.createElement('div') } },
  })
  try {
    runtime.schedulePrepare()
    expect(frame).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  } finally {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  }
})

it('StrictMode setup → cleanup → setup while initialization is pending leaves the second caller a live runtime', async () => {
  const proto = ProductionGlassRuntime.prototype as unknown as Record<string, unknown>
  const saved = Object.fromEntries(
    ['initialize', 'prepare', 'mount', 'bind', 'teardown'].map(k => [k, proto[k]]),
  )
  const savedResume = WebGPUClient.prototype.resume,
    savedPark = WebGPUClient.prototype.park
  let open!: () => void
  const initialized = new Promise<void>(resolve => {
    open = resolve
  })
  Object.assign(proto, {
    async initialize(this: Runtime) {
      await initialized
      this.attached = true
    },
    async prepare() {},
    mount() {},
    bind() {},
    teardown(this: Runtime) {
      this.attached = false
    },
  })
  WebGPUClient.prototype.resume = () => {}
  WebGPUClient.prototype.park = async () => {}
  ;(ProductionGlassRuntime as unknown as { shared?: unknown }).shared = undefined
  try {
    // GlassPresentation's effect: the cancelled call releases for its own options.
    const first = options(),
      second = options()
    let cancelled = false,
      bound: Runtime | undefined
    const one = ProductionGlassRuntime.create(first as never).then(r => {
      if (cancelled) (r as unknown as Runtime).dispose(first)
    })
    cancelled = true
    const two = ProductionGlassRuntime.create(second as never).then(r => {
      bound = r as unknown as Runtime
    })
    open()
    await Promise.all([one, two])
    expect(bound).toBeDefined()
    expect(bound!.attached).toBe(true)
  } finally {
    Object.assign(proto, saved)
    WebGPUClient.prototype.resume = savedResume
    WebGPUClient.prototype.park = savedPark
    ;(ProductionGlassRuntime as unknown as { shared?: unknown }).shared = undefined
  }
})

it('subscribes to current appearance and dispatches glass before preparing captures', () => {
  let current = 'light'
  let listener: (() => void) | undefined
  const calls: string[] = []
  const unsubscribe = vi.fn()
  const runtime = Object.create(ProductionGlassRuntime.prototype)
  Object.assign(runtime, {
    revision: 7,
    options: {
      appearance: 'light',
      currentAppearance: () => current,
      subscribeAppearance: (callback: () => void) => {
        listener = callback
        return unsubscribe
      },
    },
    appRegions: { setAppearance: (value: string) => calls.push(value) },
    fire: (request: { type: string }) => calls.push(request.type),
    dropRetained: () => calls.push('drop'),
    schedulePrepare: () => calls.push('prepare'),
  })
  runtime.bindAppearance()
  current = 'dark'
  listener?.()
  expect(runtime.options.appearance).toBe('dark')
  expect(runtime.revision).toBe(8)
  expect(calls).toEqual(['appearance-begin', 'dark', 'drop', 'prepare'])
  runtime.unbindAppearance()
  expect(unsubscribe).toHaveBeenCalledOnce()
})

it.each([
  { previous: 'dark', current: 'dark' },
  { previous: 'light', current: 'dark' },
  { previous: 'dark', current: 'light' },
])(
  'resumes retained $previous chrome immediately in $current without concealment',
  ({ previous, current }) => {
    const canvases = Array.from({ length: 4 }, () => document.createElement('canvas'))
    const setAppearance = vi.fn()
    const fire = vi.fn()
    const planes = new Map([['retained-plane', {}]])
    const glyphs = new Map([['retained-glyph', {}]])
    const source = {}
    const runtime = Object.create(ProductionGlassRuntime.prototype)
    Object.assign(runtime, {
      canvas: canvases[0],
      liftCanvas: canvases[1],
      menuLiftCanvas: canvases[2],
      menuCanvas: canvases[3],
      revision: 0,
      resumeFrame: 0,
      lifecycleCounts: { hidden: 0, visible: 0 },
      options: { appearance: previous, currentAppearance: () => current },
      appRegions: { invalidateSources: vi.fn(), setAppearance },
      glyphs,
      planes,
      installedSource: source,
      dropRetained: vi.fn(),
      schedulePrepare: vi.fn(),
      fire,
    })
    const refreshFrames: FrameRequestCallback[] = []
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      refreshFrames.push(callback)
      return refreshFrames.length
    })
    const expectRetained = () => {
      expect(canvases.map(canvas => canvas.style.visibility)).toEqual(Array(4).fill(''))
      expect(runtime.planes).toBe(planes)
      expect(runtime.glyphs).toBe(glyphs)
      expect(planes.size).toBe(1)
      expect(glyphs.size).toBe(1)
      expect(runtime.installedSource).toBe(source)
    }
    runtime.handleVisibility(new Event('pagehide'))
    expectRetained()
    runtime.setAppearance(current)
    expect(setAppearance).not.toHaveBeenCalled()
    runtime.handleVisibility(new Event('pageshow'))
    expect(fire).toHaveBeenCalledExactlyOnceWith({ type: 'visible', visible: true })
    expect(runtime.schedulePrepare).toHaveBeenCalledTimes(previous === current ? 0 : 1)
    expectRetained()
    // A deferred or failed background refresh cannot hide retained chrome.
    runtime.schedulePrepare.mockImplementation(() => {
      throw Error('background capture failed')
    })
    refreshFrames.shift()!(0)
    expect(() => refreshFrames.shift()!(0)).toThrow('background capture failed')
    expectRetained()
  },
)

it('re-arms an unchanged appearance capture after hide invalidates its worker epoch', () => {
  const fire = vi.fn()
  const runtime = Object.create(ProductionGlassRuntime.prototype)
  Object.assign(runtime, {
    revision: 7,
    resumeFrame: 0,
    lifecycleCounts: { hidden: 0, visible: 0 },
    appearanceInstall: { revision: 7, value: 'dark' },
    options: { appearance: 'dark', currentAppearance: () => 'dark' },
    appRegions: { invalidateSources: vi.fn(), setAppearance: vi.fn() },
    dropRetained: vi.fn(),
    schedulePrepare: vi.fn(),
    fire,
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  )
  runtime.handleVisibility(new Event('pagehide'))
  runtime.handleVisibility(new Event('pageshow'))
  expect(runtime.appearanceInstall).toEqual({ revision: 8, value: 'dark' })
  expect(fire.mock.calls.map(([request]) => request)).toEqual([
    { type: 'appearance-begin', revision: 8 },
    { type: 'visible', visible: true },
  ])
  expect(runtime.appRegions.setAppearance).toHaveBeenCalledExactlyOnceWith('dark')
  vi.unstubAllGlobals()
})

it('starts the first switch from a selection restored while the renderer was initializing', () => {
  const motion = new TabMotion()
  motion.configure([70, 200, 330], 120, 54, 400, { selected: 0 })
  const runtime = Object.create(ProductionGlassRuntime.prototype) as ProductionGlassRuntime
  Object.assign(runtime, {
    options: { geometry: { tabBarSelectedIndex: 0 } },
    fire(request: { event: string; index: number; x: number; at: number }) {
      if (request.event === 'reset') motion.reset(request.index)
      if (request.event === 'down') motion.down(request.x, request.index, request.at)
    },
  })
  // The async renderer became ready after the scene restored Library. Its geometry is unchanged.
  runtime.updateGeometry({ tabBarSelectedIndex: 1 })
  runtime.tabPointerDown(330, 2)
  expect(motion.frame.centre).toBe(200)
})

it('restores the committed tab without carrying an earlier selection lens into expansion', () => {
  const motion = new TabMotion()
  motion.configure([50, 150, 250], 94, 54, 274, { selected: 2 })
  const at = performance.timeOrigin + performance.now()
  motion.select(0, at)
  motion.sample(at + 100, false)
  const runtime = Object.create(ProductionGlassRuntime.prototype) as ProductionGlassRuntime
  Object.assign(runtime, {
    pointer: false,
    options: { geometry: { tabBarSelectedIndex: 2 } },
    currentSpecs: () => [{ id: 'dock' }],
    minimizeDom: {
      start: () => ({ specs: [], duration: 0, at: 0, finished: new Promise(() => {}) }),
    },
    track: () => {},
    tabInput(event: string, index: number, cancelled: boolean) {
      if (event === 'reset' && cancelled) motion.reset(index)
    },
  })
  runtime['minimizeTrack']('restore')
  expect(motion.capsule().centerX).toBe(250)
  expect(motion.lensMix).toBe(0)
})
