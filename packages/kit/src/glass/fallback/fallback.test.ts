// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { fallbackGlassRequested } from './selection.ts'
import { FallbackGlassRuntime } from './runtime.ts'
import { FallbackMaterial } from './material.ts'
import { TabMotion, TAB_INTERACTIVE_MOTION } from '../lens/tabMotion.ts'
import { createRenderSpecs, type RuntimeGeometry } from '../renderSpecs.ts'
import { FallbackRegions } from './regions.ts'
import { holdPresentationForGlass } from '../../presentation/glassReady.ts'
import { GlassRegionRegistry } from '../regionRegistry.ts'
import { FallbackCanvasOwnership } from './canvasOwnership.ts'
import { setGlassShapeTrack } from '../shapeTrackRegistry.ts'

afterEach(() => {
  delete document.documentElement.dataset.satinGlass
  window.history.replaceState(null, '', '/')
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

it('requires explicit selection even when WebGPU is unavailable, and allows a URL kill switch', () => {
  // Explicit fallback is a separate mode; internal strict builds forbid it.
  vi.stubEnv('SATIN_STRICT_GLASS', '')
  expect(fallbackGlassRequested()).toBe(false)
  document.documentElement.dataset.satinGlass = 'fallback'
  expect(fallbackGlassRequested()).toBe(true)
  window.history.replaceState(null, '', '/?glass=webgpu')
  expect(fallbackGlassRequested()).toBe(false)
  window.history.replaceState(null, '', '/?glass=fallback')
  expect(fallbackGlassRequested()).toBe(true)
})

it('paints registered sheet corners without a GPU and removes material with its owner', () => {
  const host = document.createElement('div')
  document.body.append(host)
  Object.defineProperties(host, { offsetWidth: { value: 320 }, offsetHeight: { value: 400 } })
  const canvas = document.createElement('canvas')
  host.append(canvas)
  const registry = new GlassRegionRegistry()
  const unregister = registry.register({
    id: 'sheet',
    element: host,
    canvas,
    descriptor: {
      id: 'sheet',
      shape: { kind: 'roundedRectangle', cornerRadius: 30, bottomCornerRadius: 12 },
      material: { variant: 'regular', interactive: false, treatment: 'sheet' },
    },
  })
  const fallback = new FallbackRegions(registry, 'light')
  expect(canvas.style.visibility).toBe('hidden')
  const material = host.querySelector<HTMLElement>('[data-satin-fallback-material] > div')!
  expect(material.style.width).toBe('320px')
  expect(material.style.borderRadius).toBe('30px 30px 12px 12px')
  const light = material.style.background
  fallback.setAppearance('dark')
  expect(material.style.background).not.toBe(light)
  unregister()
  fallback.refresh()
  expect(canvas.style.visibility).toBe('')
  expect(host.querySelector('[data-satin-fallback-material]')).toBeNull()
  fallback.dispose()
})

it('paints a popover pointer in the same material aperture above or below its body', () => {
  const host = document.createElement('div')
  document.body.append(host)
  Object.defineProperties(host, { offsetWidth: { value: 240 }, offsetHeight: { value: 100 } })
  host.style.setProperty('--satin-popover-arrow', 'top 120')
  const canvas = document.createElement('canvas')
  host.append(canvas)
  const registry = new GlassRegionRegistry()
  registry.register({
    id: 'popover',
    element: host,
    canvas,
    descriptor: {
      id: 'popover',
      shape: { kind: 'roundedRectangle', cornerRadius: 30 },
      material: { variant: 'regular', interactive: false, treatment: 'confirmation' },
    },
  })
  const fallback = new FallbackRegions(registry, 'light')
  const material = host.querySelector<HTMLElement>('[data-satin-fallback-material] > div')!
  expect(material.style.height).toBe('114px')
  expect(material.style.transform).toBe('translate3d(0px,-14px,0)')
  expect(material.style.clipPath).toContain('L 120 0')
  expect(material.style.background).toMatch(/rgba?\(/)
  expect(material.querySelector('path')?.getAttribute('d')).toContain('L 120 0')
  host.style.setProperty('--satin-popover-arrow', 'bottom 80')
  fallback.refresh()
  expect(material.style.transform).toBe('translate3d(0px,0px,0)')
  expect(material.style.clipPath).toContain('L 80 114')
  expect(host.querySelectorAll('[data-satin-fallback-material] > div')).toHaveLength(1)
  host.style.removeProperty('--satin-popover-arrow')
  fallback.refresh()
  expect(material.style.height).toBe('100px')
  expect(material.style.clipPath).toBe('none')
  expect(material.querySelector('svg')).toBeNull()
  fallback.dispose()
})

it('releases a held presentation only after CSS material commits for that show', async () => {
  const panel = document.createElement('div')
  panel.dataset.satinGlassRegionId = 'menu'
  Object.defineProperties(panel, { offsetWidth: { value: 200 }, offsetHeight: { value: 100 } })
  const canvas = document.createElement('canvas')
  canvas.dataset.satinGlassRegionCanvas = 'true'
  panel.append(canvas)
  document.body.append(panel)
  const registry = new GlassRegionRegistry()
  const unregister = registry.register({
    id: 'menu',
    element: panel,
    canvas,
    descriptor: {
      id: 'menu',
      shape: 'capsule',
      material: { variant: 'regular', interactive: false },
    },
  })
  const fallback = new FallbackRegions(registry, 'light')
  const ready = vi.fn()
  const release = holdPresentationForGlass(panel, null, [], registry.invalidate, ready)
  expect(ready).not.toHaveBeenCalled()
  await vi.waitFor(() => expect(panel.hasAttribute('data-satin-glass-hold')).toBe(false))
  expect(ready).toHaveBeenCalledOnce()
  release()
  unregister()
  fallback.dispose()
})

it('joins the original aperture timeline when GPU demotes during toolbar travel', () => {
  const host = document.createElement('div')
  document.body.append(host)
  Object.defineProperties(host, { offsetWidth: { value: 120 }, offsetHeight: { value: 44 } })
  const canvas = document.createElement('canvas')
  host.append(canvas)
  const registry = new GlassRegionRegistry()
  registry.register({
    id: 'toolbar',
    element: host,
    canvas,
    descriptor: {
      id: 'toolbar',
      shape: 'capsule',
      material: { variant: 'regular', interactive: false },
    },
  })
  const play = vi.spyOn(FallbackMaterial.prototype, 'play').mockResolvedValue(undefined)
  const epoch = performance.timeOrigin + performance.now() - 120
  setGlassShapeTrack(host, {
    epoch,
    duration: 240,
    frames: [
      { x: 80, y: 0, width: 40, height: 44 },
      { x: 0, y: 0, width: 120, height: 44 },
    ],
    radii: [7, 20],
  })
  const fallback = new FallbackRegions(registry, 'light')
  expect(play).toHaveBeenCalledOnce()
  const [specs, duration, start] = play.mock.calls[0]!
  expect(duration).toBe(240)
  expect(start).toBeCloseTo(epoch - performance.timeOrigin, 4)
  expect(specs[0]!.shape.first.halfWidth).toBe(20)
  expect(specs[0]!.shape.first.radius).toBe(7)
  expect(specs[1]!.shape.first.halfWidth).toBe(60)
  expect(specs[1]!.shape.first.radius).toBe(20)
  fallback.refresh()
  expect(play).toHaveBeenCalledOnce()
  fallback.dispose()
})

it('moves the held tab lens with the finger and returns a cancelled drag to the committed tab', () => {
  const host = document.createElement('div')
  document.body.append(host)
  const geometry: RuntimeGeometry = {
    bottomInset: 0,
    circleSize: 48,
    circleY: 0,
    dockHeight: 62,
    dockRadius: 31,
    dockWidth: 300,
    dockX: 0,
    dockY: 0,
    height: 800,
    leftX: 0,
    physicalTopInset: 0,
    rightX: 0,
    surfaceMode: 'chrome',
    width: 400,
    tabBarCentres: [50, 150, 250],
    tabBarSelectedIndex: 0,
    tabBarPillWidth: 94,
    tabBarPillHeight: 54,
    tabBarPillCenterY: 31,
  }
  const tab = new TabMotion(TAB_INTERACTIVE_MOTION)
  tab.configure([50, 150, 250], 94, 54, 300)
  const thumb = new FallbackMaterial(host)
  const runtime = Object.create(FallbackGlassRuntime.prototype) as FallbackGlassRuntime
  Object.assign(runtime, {
    tab,
    thumb,
    options: { geometry, appearance: 'light' },
    minimizeDom: { inkTransformed: false },
    dockSpec: () => createRenderSpecs(geometry, 'light').find(spec => spec.id === 'dock')!,
  })
  let now = 100
  let next: FrameRequestCallback | undefined
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    next = callback
    return 1
  })
  const advance = (frames: number) => {
    for (let index = 0; index < frames; index++) {
      now += 1000 / 60
      const callback = next
      next = undefined
      callback?.(now)
    }
  }
  const center = () => {
    const part = host.querySelector<HTMLElement>('[data-satin-fallback-material] > div')!
    return (
      Number(/translate3d\(([^p]+)/.exec(part.style.transform)![1]) +
      parseFloat(part.style.width) / 2
    )
  }
  runtime.tabPointerDown(50, 0)
  advance(12)
  const held = center()
  runtime.tabPointerMove(210)
  advance(12)
  expect(center()).toBeGreaterThan(held + 100)
  runtime.tabPointerUp(true)
  advance(90)
  expect(center()).toBeCloseTo(50, 0)
  thumb.dispose()
})

it.each([0, -30_000, 30_000])(
  'keeps material on the ink document timeline after a %s ms clock shift',
  drift => {
    vi.spyOn(performance, 'now').mockReturnValue(40_000)
    vi.spyOn(document, 'timeline', 'get').mockReturnValue({
      currentTime: 40_000 + drift,
    } as DocumentTimeline)
    const animations: Animation[] = []
    const tracks: Keyframe[][] = []
    vi.spyOn(Element.prototype, 'animate').mockImplementation((_frames, _options) => {
      tracks.push(_frames as Keyframe[])
      const animation = {
        startTime: null,
        finished: new Promise(() => {}),
        cancel: vi.fn(),
      } as unknown as Animation
      animations.push(animation)
      return animation
    })
    const host = document.createElement('div')
    document.body.append(host)
    const material = new FallbackMaterial(host)
    const spec = {
      frameX: 0,
      frameY: 0,
      shape: {
        first: { centerX: 150, centerY: 31, halfWidth: 150, halfHeight: 31, radius: 31 },
      },
    } as import('../renderSpecs.ts').SurfaceRenderSpec
    const compact = {
      ...spec,
      shape: {
        ...spec.shape,
        first: {
          centerX: 31,
          centerY: 31,
          halfWidth: 24,
          halfHeight: 24,
          radius: 24,
        },
      },
    }
    void material.play([spec, compact], 894, 39_900, 'dark')
    expect(animations[0]!.startTime).toBe(39_900 + drift)
    expect(tracks[0]!.map(frame => frame.width)).toEqual(['300px', '48px'])
    void material.play([compact, spec], 600, 40_000, 'dark')
    expect(animations[0]!.cancel).toHaveBeenCalledOnce()
    expect(animations[1]!.startTime).toBe(40_000 + drift)
    expect(tracks[1]!.map(frame => frame.width)).toEqual(['48px', '300px'])
    material.dispose()
  },
)

it('takes chrome canvas ownership and reprojects a running collapse when geometry changes', async () => {
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { ready: Promise.resolve() },
  })
  class Effect {
    frames: Keyframe[]
    constructor(frames: Keyframe[]) {
      this.frames = frames
    }
    setKeyframes(frames: Keyframe[]) {
      this.frames = frames
    }
  }
  vi.stubGlobal('KeyframeEffect', Effect)
  vi.spyOn(Element.prototype, 'animate').mockImplementation(
    frames =>
      ({
        effect: new Effect(frames as Keyframe[]),
        cancel() {},
        finished: new Promise(() => {}),
        startTime: 0,
      }) as unknown as Animation,
  )
  const shell = document.createElement('main')
  shell.dataset.satinLiquid = 'consumer'
  const dock = document.createElement('div')
  dock.innerHTML =
    '<div class="satin-lens-tab-ink-clip"></div><div class="satin-lens-tab-ink-plane"></div><button role="tab"><small>Home</small></button>'
  const canvas = document.createElement('canvas')
  const rimCanvas = document.createElement('canvas')
  const lift = document.createElement('canvas')
  lift.dataset.satinGlassLift = 'chrome'
  lift.style.visibility = 'visible'
  const appCanvas = document.createElement('canvas')
  const scroller = document.createElement('div')
  Object.defineProperties(scroller, { scrollHeight: { value: 2000 }, clientHeight: { value: 800 } })
  shell.append(dock, canvas, rimCanvas, lift, appCanvas, scroller)
  document.body.append(shell)
  const geometry: RuntimeGeometry = {
    bottomInset: 0,
    circleSize: 48,
    circleY: 0,
    dockHeight: 62,
    dockRadius: 31,
    dockWidth: 300,
    dockX: 0,
    dockY: 700,
    height: 800,
    leftX: 0,
    physicalTopInset: 0,
    rightX: 0,
    surfaceMode: 'chrome',
    width: 400,
    tabBarCentres: [50, 150, 250],
    tabBarSelectedIndex: 0,
    tabBarPillWidth: 94,
    tabBarPillHeight: 54,
    tabBarPillCenterY: 31,
  }
  const play = vi.spyOn(FallbackMaterial.prototype, 'play').mockResolvedValue(undefined)
  const runtime = await FallbackGlassRuntime.create({
    geometry,
    appearance: 'dark',
    elements: { chrome: { dock }, band: { canvas, rimCanvas }, scroller, contentHost: scroller },
  } as unknown as import('../renderSpecs.ts').RuntimeOptions)
  expect([canvas, rimCanvas, lift].map(el => el.style.visibility)).toEqual([
    'hidden',
    'hidden',
    'hidden',
  ])
  expect(appCanvas.style.visibility).toBe('')
  scroller.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1 }))
  scroller.scrollTop = 100
  scroller.dispatchEvent(new Event('scroll'))
  expect(play).toHaveBeenCalledTimes(2)
  const start = play.mock.calls[0]![2]
  runtime.updateGeometry({ dockWidth: 360, tabBarCentres: [60, 180, 300] })
  expect(play).toHaveBeenCalledTimes(4)
  const [frames, , retargetStart] = play.mock.calls[2]!
  expect(retargetStart).toBe(start)
  expect(frames.at(-1)!.shape.first.halfWidth * 2).toBeCloseTo(48)
  expect(frames[1]!.shape.first.halfWidth * 2).toBeCloseTo(360)
  runtime.dispose()
  expect([canvas, rimCanvas, lift].map(el => el.style.visibility)).toEqual(['', '', 'visible'])
})

it('hides retained region overlays and container canvases until CSS ownership ends', () => {
  const registry = new GlassRegionRegistry()
  const host = document.createElement('div')
  Object.defineProperties(host, { offsetWidth: { value: 100 }, offsetHeight: { value: 44 } })
  const canvas = document.createElement('canvas')
  const overlay = document.createElement('canvas')
  const container = document.createElement('canvas')
  const unregisterContainer = registry.registerContainer('group', host, container)
  const unregister = registry.register({
    id: 'control',
    element: host,
    canvas,
    overlay,
    descriptor: {
      id: 'control',
      shape: 'capsule',
      material: { variant: 'regular', interactive: false },
    },
  })
  const fallback = new FallbackRegions(registry, 'dark')
  expect([canvas, overlay, container].map(el => el.style.visibility)).toEqual([
    'hidden',
    'hidden',
    'hidden',
  ])
  unregister()
  unregisterContainer()
  fallback.refresh()
  expect([canvas, overlay, container].map(el => el.style.visibility)).toEqual(['', '', ''])
  fallback.dispose()
})

it('restores original canvas visibility after repeated ownership updates', () => {
  const owner = new FallbackCanvasOwnership()
  const canvas = document.createElement('canvas')
  canvas.style.visibility = 'visible'
  owner.update([canvas, canvas])
  owner.update([canvas])
  expect(canvas.style.visibility).toBe('hidden')
  owner.dispose()
  expect(canvas.style.visibility).toBe('visible')
})

it('retains over-capacity app owners for fallback and releases their material on unmount', () => {
  const registry = new GlassRegionRegistry()
  const remove = Array.from({ length: 17 }, (_, index) => {
    const host = document.createElement('div')
    Object.defineProperties(host, { offsetWidth: { value: 44 }, offsetHeight: { value: 44 } })
    const canvas = document.createElement('canvas')
    host.append(canvas)
    document.body.append(host)
    return registry.register({
      id: `button-${index}`,
      element: host,
      canvas,
      descriptor: {
        id: `button-${index}`,
        shape: 'capsule',
        material: { variant: 'regular', interactive: false },
      },
    })
  })
  const fallback = new FallbackRegions(registry, 'light')
  expect(document.querySelectorAll('[data-satin-fallback-material]')).toHaveLength(17)
  remove.forEach(unregister => unregister())
  fallback.refresh()
  expect(registry.size).toBe(0)
  expect(document.querySelectorAll('[data-satin-fallback-material]')).toHaveLength(0)
  fallback.dispose()
})
