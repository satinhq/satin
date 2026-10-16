// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { poseScrollEdges } from '../glass/webgpu/scrollEdgePose.ts'
import { defineNamespace } from '../motion/matchedGeometry.tsx'
import { navigatorTransitionRuntime, type NavigatorStore } from './store.ts'
import { installZoomDismissDrag } from './zoomDrag.ts'
import { withZoomAtRest, zoomGlassMotion, zoomRestRect } from './zoomGlass.ts'
import type {
  TransitionBinding,
  TransitionController,
  TransitionControllerContext,
} from './types.ts'
import {
  beginZoomDrag,
  registerTransitionSource,
  registerZoomRequest,
  visibleZoomSource,
  withZoomTransitions,
  zoomDragHandleOf,
} from './zoomTransition.ts'

/* happy-dom has no layout or Web Animations. Frames come from data-rect ("x y width height"), and
 * element.animate records its keyframes on a fake run the test can finish. */
type FakeRun = { element: Element; keyframes: Keyframe[]; animation: Animation }
let runs: FakeRun[] = []
const cleanups: (() => void)[] = []

beforeEach(() => {
  runs = []
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const [layoutX = 0, y = 0, width = 0, height = 0] = (this.dataset.rect ?? '')
      .split(' ')
      .map(Number)
    // A translateX in the element's own style moves its rendered frame, as in a browser.
    const parked = /translateX\((-?[\d.]+)px\)/.exec(this.style.transform)
    const x = layoutX + (parked ? Number(parked[1]) : 0)
    return { x, y, width, height, left: x, top: y, right: x + width, bottom: y + height } as DOMRect
  })
  Element.prototype.animate = function (this: Element, keyframes) {
    const animation = {
      onfinish: null as (() => void) | null,
      ready: Promise.resolve(),
      currentTime: 0,
      startTime: 0,
      cancel() {},
      pause() {},
      play: vi.fn(),
    } as unknown as Animation
    runs.push({ element: this, keyframes: keyframes as Keyframe[], animation })
    return animation
  }
})

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

/** A grid screen with a 180 pt album tile (10 pt corners) and the album screen pushed over it. */
function scene(sourceRect = '31 167 180 180') {
  const albums = defineNamespace()
  const rear = element('div', '0 0 440 956', { 'data-satin-screen-key': 'library' })
  const wrapper = element('div', '', {})
  const tile = element('div', sourceRect, {})
  tile.style.borderRadius = '10px'
  wrapper.append(tile)
  rear.append(wrapper)
  const front = element('div', '0 0 440 956', { 'data-satin-screen-key': 'album' })
  const motion = element('div', '0 0 440 956', {})
  front.append(motion)
  const dim = element('div', '0 0 440 956', {})
  document.body.append(rear, front, dim)
  cleanups.push(registerTransitionSource({ namespace: albums, id: 'tidewater', wrapper }))
  const binding: TransitionBinding = {
    direction: 'push',
    primary: motion,
    secondary: rear,
    secondaryDim: dim,
    width: 440,
  }
  const requestZoom = () =>
    cleanups.push(registerZoomRequest('album', { namespace: albums, sourceID: 'tidewater' }))
  return { tile, motion, dim, binding, requestZoom, albums, rear }
}

function element(tag: string, rect: string, attributes: Record<string, string>) {
  const node = document.createElement(tag)
  if (rect) node.dataset.rect = rect
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value)
  return node
}

/** The ordinary slide controller, as a recording stub. */
function slideStub() {
  const calls: string[] = []
  const controller: TransitionController = {
    progress: 0,
    start: () => calls.push('start'),
    bind: () => {
      calls.push('bind')
      return () => undefined
    },
    setProgress: () => calls.push('setProgress'),
    completeInteractive: () => calls.push('completeInteractive'),
    cancelInteractive: () => calls.push('cancelInteractive'),
    finish: () => calls.push('finish'),
    cancel: () => calls.push('cancel'),
  }
  return { calls, factory: () => controller }
}

function createController(context: TransitionControllerContext) {
  const slide = slideStub()
  const completion = { finish: vi.fn(), cancel: vi.fn(), changed: vi.fn() }
  const controller = withZoomTransitions(slide.factory)(completion, context)
  return { controller, completion, slideCalls: slide.calls }
}

/** The keyframes of the first run on `element` that animates `property`. */
const framesOf = (element: Element, property: string) =>
  runs.find(run => run.element === element && run.keyframes[0]?.[property] !== undefined)!.keyframes

it.each([
  {
    device: 'narrow iPad',
    userAgent: 'iPad',
    platform: 'iPad',
    touchPoints: 5,
    width: 440,
    height: 956,
    radius: '0px',
  },
  {
    device: 'desktop-agent iPad',
    userAgent: 'Macintosh',
    platform: 'MacIntel',
    touchPoints: 5,
    width: 440,
    height: 956,
    radius: '0px',
  },
  {
    device: 'wide phone',
    userAgent: 'iPhone',
    platform: 'iPhone',
    touchPoints: 5,
    width: 700,
    height: 800,
    radius: '0px',
  },
])(
  "starts a $device pop at the page's resting corners",
  ({ userAgent, platform, touchPoints, width, height, radius }) => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent)
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platform)
    vi.spyOn(navigator, 'maxTouchPoints', 'get').mockReturnValue(touchPoints)
    const { motion, binding, requestZoom, rear } = scene()
    const container = motion.parentElement!
    for (const element of [motion, container, rear]) element.dataset.rect = `0 0 ${width} ${height}`
    requestZoom()
    const { controller } = createController({ interactive: false, operation: 'pop' })
    controller.start?.()
    controller.bind?.({ ...binding, direction: 'pop', width })
    expect(framesOf(container, 'borderRadius')[0]!.borderRadius).toBe(radius)
    controller.finish()
  },
)

/** Real WebKit arbitration is checked separately with installed-PWA HID touches. */
function dismissalTouches() {
  const { motion, requestZoom } = scene()
  requestZoom()
  const navigator = {
    [navigatorTransitionRuntime]: {
      canBeginInteractivePop: () => true,
      beginInteractivePop: () => undefined,
    },
  } as unknown as NavigatorStore
  const screen = motion.parentElement!
  cleanups.push(installZoomDismissDrag(screen, 'album', navigator))
  return (type: string, x: number, y: number) => {
    const event = Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
      touches: [{ clientX: x, clientY: y }],
    })
    motion.dispatchEvent(event)
    return event
  }
}

it('leaves the native-rejected 34 degree diagonal available to WebKit in either direction', () => {
  for (const horizontal of [-300, 300]) {
    document.body.replaceChildren()
    const touch = dismissalTouches()
    touch('touchstart', 512, 120)
    // Decide before the drag threshold, using the same slope as the measured HID path.
    expect(touch('touchmove', 512 + horizontal / 150, 123).defaultPrevented).toBe(false)
    expect(touch('touchmove', 512 + horizontal, 570).defaultPrevented).toBe(false)
  }
})

it('does not reclaim a rejected diagonal when the finger subsequently turns downward', () => {
  const touch = dismissalTouches()
  touch('touchstart', 512, 120)
  touch('touchmove', 514, 123)
  expect(touch('touchmove', 512, 470).defaultPrevented).toBe(false)
})

it('zooms from the activated duplicate and returns to that copy after another activation', () => {
  const { tile, albums, rear, requestZoom } = scene()
  const duplicate = element('div', '231 467 180 180', {})
  const button = document.createElement('button')
  const wrapper = document.createElement('div')
  wrapper.append(duplicate)
  button.append(wrapper)
  rear.append(button)
  cleanups.push(registerTransitionSource({ namespace: albums, id: 'tidewater', wrapper }))
  // A keyboard activation targets the surrounding button, rather than the artwork.
  button.click()
  requestZoom()
  expect(visibleZoomSource('album', rear)).toBe(duplicate)
  tile.click()
  expect(visibleZoomSource('album', rear)).toBe(duplicate)
  duplicate.remove()
  // A disappeared return target must not redirect the animation to its other copy.
  expect(visibleZoomSource('album', rear)).toBeUndefined()
})

it('keeps the source visible until the copied artwork is decoded before a zoom push', async () => {
  const { tile, motion, binding, requestZoom } = scene()
  const image = document.createElement('img')
  image.src = 'https://example.test/artwork.jpg'
  Object.defineProperty(image, 'naturalWidth', { value: 100 })
  Object.defineProperty(image, 'naturalHeight', { value: 100 })
  tile.append(image)
  let decoded!: () => void
  const ready = new Promise<void>(resolve => {
    decoded = resolve
  })
  vi.spyOn(HTMLImageElement.prototype, 'decode').mockImplementation(function (
    this: HTMLImageElement,
  ) {
    return this === image ? Promise.resolve() : ready
  })
  requestZoom()
  const { controller } = createController({ interactive: false, operation: 'push' })
  controller.start?.()
  controller.bind?.(binding)
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(tile.style.visibility).not.toBe('hidden')
  expect(runs[0]!.animation.play).not.toHaveBeenCalled()
  decoded()
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(runs[0]!.animation.play).toHaveBeenCalled()
  expect(tile.style.visibility).toBe('hidden')
  expect(
    motion.parentElement?.querySelector('[data-satin-zoom-source-portal] img')?.getAttribute('src'),
  ).toBe(image.src)
  controller.finish()
})

it('keeps a zoomed button sampling its own page while its window scales and clips', () => {
  const { motion, binding, requestZoom, rear } = scene('131 227 180 180')
  for (const element of [motion, motion.parentElement!, rear])
    element.dataset.rect = '100 60 440 956'
  requestZoom()
  const { controller } = createController({ interactive: false, operation: 'push' })
  controller.start?.()
  controller.bind?.(binding)
  const at = performance.now()
  const projection = zoomGlassMotion(motion)!.read(at).sample(at)
  expect(projection.clip).toEqual([131, 227, 180, 180])
  expect(projection.radius).toBe(10)
  expect(projection.origin).toEqual([100, 60])
  const [edge] = poseScrollEdges(
    [
      {
        rect: [100, 60, 440, 48],
        solid: 60,
        sigma: 12.5,
        tint: [0, 0, 0, 0.4],
        strength: 1,
        navigation: { route: 0, clip: [100, 540], covers: [], origins: [0] },
      },
    ],
    { frontX: 0, rearX: 0, frontDim: 0, rearDim: 0, routes: [{ x: 0, dim: 0, zoom: projection }] },
  )
  expect(edge!.rect[0]).toBe(131)
  expect(edge!.rect[1]).toBe(227)
  expect(edge!.rect[2]).toBeCloseTo(180)
  expect(edge!.rect[3]).toBeCloseTo(48 * projection.scale)
  expect(edge!.solid).toBe(227)
  const container = motion.parentElement!
  container.style.visibility = 'hidden'
  const transform = container.style.transform
  withZoomAtRest(motion, () => {
    expect(container.style.visibility).toBe('visible')
    expect(container.style.transform).toBe('none')
    expect(motion.style.transform).toBe('none')
  })
  expect(container.style.visibility).toBe('hidden')
  expect(container.style.transform).toBe(transform)
  container.style.visibility = ''
  const button = document.createElement('button')
  motion.append(button)
  // What WebKit reports for a 200 x 50 button at page position 20, 300 in this window.
  button.dataset.rect = `${131 + 20 * projection.scale} ${227 + 300 * projection.scale} ${200 * projection.scale} ${50 * projection.scale}`
  const local = zoomRestRect(button)!
  expect(local.x).toBeCloseTo(120)
  expect(local.y).toBeCloseTo(360)
  expect(local.width).toBeCloseTo(200)
  expect(local.height).toBeCloseTo(50)
  runs[0]!.animation.currentTime = 10000
  const settled = zoomGlassMotion(motion)!.read(at).sample(at)
  expect(settled.clip).toEqual([100, 60, 440, 956])
  expect(settled.scale).toBe(1)
  controller.finish()
  expect(zoomRestRect(button)).toBeUndefined()
})

it('grows a zoom push out of its source tile and hands the screen back clean', () => {
  const { tile, motion, binding, requestZoom } = scene()
  requestZoom()
  const container = motion.parentElement!
  const { controller, completion, slideCalls } = createController({
    interactive: false,
    operation: 'push',
  })
  // The entering screen arrives parked off screen by its own transform (the slide's first pose).
  motion.style.transform = 'translateX(448px)'
  controller.start?.()
  controller.bind?.(binding)

  // As natively, the screen's width fills the window (180 / 440) and its top is the window's top;
  // the container is lifted until its bottom edge is the window's, the motion layer lowered back.
  const containerFrames = framesOf(container, 'transform')
  expect(containerFrames[0]!.transform).toBe('translate(31px, -44.091px) scale(0.40909)')
  expect(framesOf(motion, 'transform')[0]!.transform).toBe('translateY(516px)')
  expect(containerFrames.at(-1)!.transform).toBe('translate(0px, 0px) scale(1)')
  // The tile's 10 pt corner, in the screen's unscaled points.
  expect(framesOf(container, 'borderRadius')[0]!.borderRadius).toBe('24.444px')
  // Cleanup exposes the resting page. The last animated corner must already match it.
  const corners = framesOf(container, 'borderRadius')
  expect(corners.at(-1)!.borderRadius).toBe('0px')
  expect(Number.parseFloat(String(corners.at(-2)!.borderRadius))).toBeLessThan(0.1)
  // The source is hidden; a copy of it fills the window's top square and fades as the page grows.
  expect(tile.style.visibility).toBe('hidden')
  const ghost = motion.parentElement!.querySelector('[data-satin-zoom-source-portal]')!
    .firstElementChild as HTMLElement
  expect(
    framesOf(ghost, 'opacity')
      .map(frame => frame.opacity)
      .slice(0, 2),
  ).toEqual([1, 1])
  expect(framesOf(ghost, 'opacity').at(-1)!.opacity).toBe(0)
  // The slide controller is never bound, so it moves nothing.
  expect(slideCalls).not.toContain('bind')

  runs[0]!.animation.onfinish?.(new Event('finish') as AnimationPlaybackEvent)
  expect(completion.finish).toHaveBeenCalledOnce()
  expect(container.style.transform).toBe('')
  expect(motion.style.transform).toBe('')
  expect(tile.style.visibility).toBe('')
  expect(ghost.isConnected).toBe(false)
})

it('keeps the ordinary slide when no zoom was asked for or the source is off screen', () => {
  const plain = scene()
  const withoutRequest = createController({ interactive: false, operation: 'push' })
  withoutRequest.controller.start?.()
  withoutRequest.controller.bind?.(plain.binding)
  expect(withoutRequest.slideCalls).toEqual(['start', 'bind'])
  document.body.replaceChildren()

  const scrolledAway = scene('31 -400 180 180')
  scrolledAway.requestZoom()
  const offScreen = createController({ interactive: false, operation: 'push' })
  offScreen.controller.start?.()
  offScreen.controller.bind?.(scrolledAway.binding)
  expect(offScreen.slideCalls).toEqual(['start', 'bind'])
  expect(runs).toEqual([])
})

it('dismisses a far drag into the source and returns a short one to full screen', () => {
  for (const [distance, dismissed] of [
    [150, true],
    [40, false],
  ] as const) {
    runs = []
    document.body.replaceChildren()
    const { motion, binding, requestZoom } = scene()
    const container = motion.parentElement!
    requestZoom()
    beginZoomDrag('album', { x: 220, y: 500 })
    const { controller, completion } = createController({ interactive: true, operation: 'pop' })
    controller.start?.()
    controller.bind?.({ ...binding, direction: 'pop' })
    const handle = zoomDragHandleOf(controller)!
    handle.track({ x: 0, y: distance })
    // The window narrows under the finger.
    expect(container.style.transform).toMatch(/^translate\(.+\) scale\(0\.\d+\)$/)
    handle.release({ x: 0, y: 0 })

    const last = framesOf(container, 'transform').at(-1)!.transform
    expect(last).toBe(
      dismissed ? 'translate(31px, -44.091px) scale(0.40909)' : 'translate(0px, 0px) scale(1)',
    )
    runs[0]!.animation.onfinish?.(new Event('finish') as AnimationPlaybackEvent)
    expect(dismissed ? completion.finish : completion.cancel).toHaveBeenCalledOnce()
  }
})

it.each(['back', 'edge', 'drag'] as const)(
  'cross-fades the returning %s page independently beneath its foreground source portal',
  gesture => {
    const { tile, motion, binding, requestZoom } = scene('202 600 170 170')
    requestZoom()
    motion.style.opacity = '0.8'
    if (gesture === 'drag') beginZoomDrag('album', { x: 220, y: 350 })
    const { controller } = createController({ interactive: gesture !== 'back', operation: 'pop' })
    controller.start?.()
    controller.bind?.({ ...binding, direction: 'pop' })
    if (gesture === 'drag') {
      zoomDragHandleOf(controller)!.track({ x: 0, y: 350 })
      zoomDragHandleOf(controller)!.release({ x: 0, y: 0 })
    } else if (gesture === 'edge') {
      controller.setProgress?.(0.8)
      controller.completeInteractive?.(0)
    }
    const portal = motion.parentElement!.querySelector<HTMLElement>(
      '[data-satin-zoom-source-portal]',
    )!
    expect(portal).not.toBeNull()
    expect(motion.contains(portal)).toBe(false)
    const ghost = portal.firstElementChild!
    const page = framesOf(motion, 'opacity')
    const source = framesOf(ghost, 'opacity')
    expect(page[0]!.opacity).toBe(0.8)
    expect(page.at(-1)!.opacity).toBe(0)
    expect(source.at(-1)!.opacity).toBe(1)
    // The measured page is still visible when the source has finished fading in.
    // A complementary fade would incorrectly retire the page by 111 ms.
    const sourceOpaque = source.findIndex(frame => frame.opacity === 1)
    expect(Number(page[sourceOpaque]!.opacity)).toBeGreaterThan(0)
    expect(Number(page[sourceOpaque]!.opacity)).toBeLessThan(0.8)
    expect(
      page.every((frame, i) => i === 0 || Number(frame.opacity) <= Number(page[i - 1]!.opacity)),
    ).toBe(true)
    expect(framesOf(portal, 'transform')).toEqual(framesOf(motion, 'transform'))
    expect(framesOf(portal, 'borderRadius')).toEqual(framesOf(motion, 'borderRadius'))
    expect(tile.style.visibility).toBe('hidden')
    runs[0]!.animation.onfinish?.(new Event('finish') as AnimationPlaybackEvent)
    expect(motion.style.opacity).toBe('0.8')
    expect(portal.isConnected).toBe(false)
    expect(tile.style.visibility).toBe('')
  },
)

it('preserves resting page corners through the push and cleanup', () => {
  const { motion, binding, requestZoom } = scene()
  const container = motion.parentElement!
  container.style.setProperty('border-radius', '12px', 'important')
  motion.style.borderRadius = '6px'
  requestZoom()
  const { controller } = createController({ interactive: false, operation: 'push' })
  controller.start?.()
  controller.bind?.(binding)
  for (const box of [container, motion])
    expect(framesOf(box, 'borderRadius').at(-1)!.borderRadius).toBe('12px')
  runs[0]!.animation.onfinish?.(new Event('finish') as AnimationPlaybackEvent)
  expect(container.style.borderRadius).toBe('12px')
  expect(container.style.getPropertyPriority('border-radius')).toBe('important')
  expect(motion.style.borderRadius).toBe('6px')
})

it('restores the page opacity and retires its separate source portal on a cancelled drag', () => {
  const { motion, binding, requestZoom } = scene()
  requestZoom()
  motion.style.opacity = '0.8'
  beginZoomDrag('album', { x: 220, y: 500 })
  const { controller, completion } = createController({ interactive: true, operation: 'pop' })
  controller.start?.()
  controller.bind?.({ ...binding, direction: 'pop' })
  zoomDragHandleOf(controller)!.track({ x: 0, y: 40 })
  zoomDragHandleOf(controller)!.release({ x: 0, y: 0 })
  const corners = framesOf(motion, 'borderRadius')
  expect(corners.at(-1)!.borderRadius).toBe('0px')
  expect(Number.parseFloat(String(corners.at(-2)!.borderRadius))).toBeLessThan(0.1)
  expect(framesOf(motion, 'opacity').every(frame => frame.opacity === 0.8)).toBe(true)
  runs[0]!.animation.onfinish?.(new Event('finish') as AnimationPlaybackEvent)
  expect(completion.cancel).toHaveBeenCalledOnce()
  expect(motion.style.opacity).toBe('0.8')
  expect(motion.parentElement!.querySelector('[data-satin-zoom-source-portal]')).toBeNull()
})

it('hides a completed pop until the navigator retires its outgoing screen, then restores visibility', () => {
  const { motion, binding, requestZoom } = scene()
  requestZoom()
  const { controller, completion } = createController({ interactive: false, operation: 'pop' })
  const container = motion.parentElement!
  completion.finish.mockImplementation(() => {
    expect(container.style.visibility).toBe('hidden')
    expect(motion.parentElement!.querySelector('[data-satin-zoom-source-portal]')).toBeNull()
  })
  controller.start?.()
  const release = controller.bind?.({ ...binding, direction: 'pop' })
  runs[0]!.animation.onfinish?.(new Event('finish') as AnimationPlaybackEvent)
  expect(completion.finish).toHaveBeenCalledOnce()
  expect(container.style.visibility).toBe('hidden')
  release?.()
  expect(container.style.visibility).toBe('')
})
