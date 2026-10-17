import { afterEach, expect, it, vi } from 'vitest'
import {
  NAVIGATION_CHROME_CURVES,
  chromeCurveOpacity,
  createAnimatedTransitionController,
} from './motion.ts'
import type { TransitionBinding } from './types.ts'

// iOS 27 bar chrome (native-nav-chrome reference, medians of six cases; times from the start of
// the page's motion). While a back swipe is held, the outgoing bar items and the back control stay
// fully shown and the incoming items hidden, at every position (up to finger p = .95). When the
// page is sent to its end (tap push, back-button pop, completing release) the changes are
// time-based: the outgoing items are gone within ~100 ms, the back control (popping to a root)
// within ~170 ms, and the incoming items fade in on the reference presentation-layer curves: a push's
// back control and destination items 0.56 at 100 ms, settled at 240 ms; a pop's revealed items
// 0.52 at 117 ms, settled at 267 ms.
class FakeStyle {
  opacity = ''
  scale = ''
  filter = ''
  transform = ''
  clipPath = ''
  boxShadow = ''
  setProperty() {}
  removeProperty(property: string) {
    ;(this as unknown as Record<string, string>)[property] = ''
  }
}

type FakeAnimation = {
  element: HTMLElement
  frames: Keyframe[]
  options: KeyframeAnimationOptions
  cancel: ReturnType<typeof vi.fn>
  onfinish: (() => void) | null
  pause: ReturnType<typeof vi.fn>
  play: ReturnType<typeof vi.fn>
  ready: Promise<void>
  currentTime: number | null
  startTime: number | null
  playState: string
}

afterEach(() => vi.unstubAllGlobals())

function setup() {
  vi.stubGlobal('document', { timeline: { currentTime: 0 } })
  vi.stubGlobal('window', {
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame: vi.fn(),
    cancelAnimationFrame: vi.fn(),
  })
  vi.stubGlobal('getComputedStyle', (element: HTMLElement) => element.style)
  const animations: FakeAnimation[] = []
  const element = () => {
    const created = {
      style: new FakeStyle(),
      querySelector: () => null,
      querySelectorAll: () => [],
      getBoundingClientRect: () => ({ left: 0, top: 0, right: 440, bottom: 800 }),
    } as unknown as HTMLElement
    created.animate = vi.fn((frames: Keyframe[], options: KeyframeAnimationOptions) => {
      const animation: FakeAnimation = {
        element: created,
        frames,
        options,
        cancel: vi.fn(),
        onfinish: null,
        pause: vi.fn(),
        play: vi.fn(),
        ready: Promise.resolve(),
        currentTime: null,
        startTime: null,
        playState: 'running',
      }
      animations.push(animation)
      return animation as unknown as Animation
    }) as never
    return created
  }
  const binding = (direction: 'push' | 'pop', backFrom: boolean, backTo: boolean) =>
    ({
      direction,
      primary: element(),
      secondary: element(),
      primaryToolbar: [element()],
      secondaryToolbar: [element()],
      backButtonVisual: element(),
      backButtonFromVisible: backFrom,
      backButtonToVisible: backTo,
      width: 440,
    }) satisfies TransitionBinding
  const of = (target: HTMLElement) => animations.filter(animation => animation.element === target)
  return { animations, binding, element, of }
}

it('follows the measured native curves', () => {
  const curves = NAVIGATION_CHROME_CURVES
  // Leaving items and the back control popping to a root (reference native presentation layers:
  // a pop's leaving items .72 @ 100, gone at 283; a push's the same curve 17 ms earlier).
  for (const curve of [curves.backLeave, curves.popToolbarLeave]) {
    expect(chromeCurveOpacity(curve, 33)).toBe(1)
    expect(chromeCurveOpacity(curve, 100)).toBeCloseTo(0.72, 2)
    expect(chromeCurveOpacity(curve, 167)).toBeCloseTo(0.32, 2)
    expect(chromeCurveOpacity(curve, 283)).toBe(0)
  }
  expect(chromeCurveOpacity(curves.pushToolbarLeave, 100)).toBeCloseTo(0.63, 2)
  expect(chromeCurveOpacity(curves.pushToolbarLeave, 267)).toBe(0)
  // Back control and destination items arriving in a push (reference native presentation layers:
  // light .06 @ 17, .58 @ 100, .95 @ 200; dark .03, .54, .94).
  for (const curve of [curves.backAppear, curves.pushToolbarAppear]) {
    expect(chromeCurveOpacity(curve, 17)).toBeCloseTo(0.05, 2)
    expect(chromeCurveOpacity(curve, 100)).toBeCloseTo(0.56, 2)
    expect(chromeCurveOpacity(curve, 200)).toBeCloseTo(0.95, 2)
    expect(chromeCurveOpacity(curve, 240)).toBe(1)
  }
  // A pop's revealed items (reference native presentation layers): .09 @ 50, .52 @ 117, .99 @ 250.
  expect(chromeCurveOpacity(curves.popToolbarAppear, 50)).toBeCloseTo(0.09, 2)
  expect(chromeCurveOpacity(curves.popToolbarAppear, 117)).toBeCloseTo(0.52, 2)
  expect(chromeCurveOpacity(curves.popToolbarAppear, 267)).toBe(1)
})

it('keeps the outgoing chrome and hides the incoming items at every held position', () => {
  const { binding } = setup()
  const controller = createAnimatedTransitionController(
    { cancel: vi.fn(), finish: vi.fn() },
    { interactive: true, operation: 'pop' },
  )
  const pop = binding('pop', true, false)
  controller.bind!(pop)
  for (const progress of [0.1, 0.5, 0.9, 0.95]) {
    controller.setProgress?.(progress)
    expect(pop.backButtonVisual.style.opacity).toBe('1')
    expect(pop.primaryToolbar[0]!.style.opacity).toBe('1')
    expect(pop.secondaryToolbar[0]!.style.opacity).toBe('0')
  }
})

it('runs time-based chrome curves in a back-button pop, independent of the page duration', () => {
  const { binding, of } = setup()
  const controller = createAnimatedTransitionController(
    { cancel: vi.fn(), finish: vi.fn() },
    { interactive: false, operation: 'pop' },
  )
  const pop = binding('pop', true, false)
  controller.bind!(pop)
  controller.start?.()
  const [back] = of(pop.backButtonVisual)
  const [outgoing] = of(pop.primaryToolbar[0]!)
  const [incoming] = of(pop.secondaryToolbar[0]!)
  expect(back?.options.duration).toBe(283)
  expect(outgoing?.options.duration).toBe(283)
  expect(incoming?.options.duration).toBe(267)
  expect(back?.frames.at(0)).toMatchObject({ offset: 0, opacity: 1 })
  expect(back?.frames.at(-1)).toMatchObject({ offset: 1, opacity: 0 })
  expect(incoming?.frames.at(-1)).toMatchObject({ offset: 1, opacity: 1 })
  expect(of(pop.primary)[0]?.options.duration).toBe(352)
})

it('dissolves leaving and arriving items as native does: scale and blur follow opacity', () => {
  const { binding, element, of } = setup()
  const controller = createAnimatedTransitionController(
    { cancel: vi.fn(), finish: vi.fn() },
    { interactive: false, operation: 'pop' },
  )
  const pop = binding('pop', true, false)
  // Bottom bars: each slot spans the screen, with its glass items near the edges.
  const fill = (slot: HTMLElement) => {
    const items = [element(), element()].map(item => Object.assign(item, { closest: () => null }))
    Object.assign(slot, {
      dataset: { satinNavigationToolbarSlot: 'bottom' },
      querySelectorAll: (selector: string) =>
        selector === '[data-satin-glass-slot-content]' ? items : [],
    })
    return items
  }
  const outgoingItems = fill(pop.primaryToolbar[0]!)
  const incomingItems = fill(pop.secondaryToolbar[0]!)
  controller.bind!(pop)
  controller.start?.()
  const [back] = of(pop.backButtonVisual)
  const [outgoing] = of(pop.primaryToolbar[0]!)
  const [incoming] = of(pop.secondaryToolbar[0]!)
  // Native at opacity a: scale 1 + 0.2 (1 - a), blur 10 (1 - a) pt.
  const at100 = outgoing!.frames.find(frame => frame.offset === 100 / 283)
  expect(at100).toMatchObject({ opacity: 0.72, filter: 'blur(2.8px)' })
  expect(back?.frames.at(-1)).toMatchObject({ opacity: 0, scale: '1.2', filter: 'blur(10px)' })
  expect(incoming?.frames.at(0)).toMatchObject({ opacity: 0, filter: 'blur(10px)' })
  // A shown item keeps no filter or scale (menus inside it stay positioned by the viewport).
  expect(incoming?.frames.at(-1)).toMatchObject({ opacity: 1, filter: 'none' })
  // Each item scales about its own centre. Scaled as a whole, a bar spanning the screen would
  // carry its edge items out toward the edges (a bottom plus moved 17 pt at the crossover).
  for (const frame of [...outgoing!.frames, ...incoming!.frames])
    expect(frame.scale).toBeUndefined()
  for (const item of outgoingItems) {
    const [scale] = of(item)
    expect(Number(scale!.frames.find(frame => frame.offset === 100 / 283)!.scale)).toBeCloseTo(
      1.056,
      3,
    )
    expect(scale!.frames.at(-1)).toMatchObject({ scale: '1.2' })
  }
  for (const item of incomingItems) {
    const [scale] = of(item)
    expect(scale!.frames.at(0)).toMatchObject({ scale: '1.2' })
    expect(scale!.frames.at(-1)).toMatchObject({ scale: 'none' })
    expect(scale!.frames.at(-1)!.opacity).toBeUndefined()
  }
})

it('fades the destination items in after the page arrives on a completing release', () => {
  const { binding, of } = setup()
  const finish = vi.fn()
  const controller = createAnimatedTransitionController(
    { cancel: vi.fn(), finish },
    { interactive: true, operation: 'pop' },
  )
  const pop = binding('pop', true, false)
  controller.bind!(pop)
  controller.setProgress?.(0.5)
  controller.completeInteractive!(0, 0.5)
  const page = of(pop.primary).at(-1)!
  const [incoming] = of(pop.secondaryToolbar[0]!)
  expect(Number(page.options.duration)).toBeLessThan(340)
  expect(incoming?.options.duration).toBe(267)
  // The page arrives: the transition completes, the incoming items keep fading in.
  page.onfinish?.()
  expect(finish).toHaveBeenCalledTimes(1)
  expect(page.cancel).toHaveBeenCalled()
  expect(incoming?.cancel).not.toHaveBeenCalled()
  // The next transition that takes those items over ends the tail first.
  const next = createAnimatedTransitionController(
    { cancel: vi.fn(), finish: vi.fn() },
    { interactive: true, operation: 'pop' },
  )
  next.bind!({ ...binding('pop', true, true), primaryToolbar: pop.secondaryToolbar })
  expect(incoming?.cancel).toHaveBeenCalledTimes(1)
})

it('changes no chrome on a cancelled release', () => {
  const { binding, of } = setup()
  const controller = createAnimatedTransitionController(
    { cancel: vi.fn(), finish: vi.fn() },
    { interactive: true, operation: 'pop' },
  )
  const pop = binding('pop', true, false)
  controller.bind!(pop)
  controller.setProgress?.(0.3)
  controller.cancelInteractive!(0, 0.3)
  expect(of(pop.backButtonVisual)).toHaveLength(0)
  expect(of(pop.primaryToolbar[0]!)).toHaveLength(0)
  expect(of(pop.secondaryToolbar[0]!)).toHaveLength(0)
  expect(pop.backButtonVisual.style.opacity).toBe('1')
  expect(pop.primaryToolbar[0]!.style.opacity).toBe('1')
  expect(pop.secondaryToolbar[0]!.style.opacity).toBe('0')
})

it('runs the push curves: destination items and back control fade in late', () => {
  const { binding, of } = setup()
  const controller = createAnimatedTransitionController(
    { cancel: vi.fn(), finish: vi.fn() },
    { interactive: false, operation: 'push' },
  )
  const push = binding('push', false, true)
  controller.bind!(push)
  controller.start?.()
  expect(of(push.backButtonVisual)[0]?.options.duration).toBe(240)
  expect(of(push.primaryToolbar[0]!)[0]?.options.duration).toBe(240)
  expect(of(push.secondaryToolbar[0]!)[0]?.options.duration).toBe(267)
})

it("fades a push destination's slots even before its screen fills them, and skips empty ones", () => {
  const { binding, of } = setup()
  const controller = createAnimatedTransitionController(
    { cancel: vi.fn(), finish: vi.fn() },
    { interactive: false, operation: 'push' },
  )
  const push = binding('push', true, true)
  const empty = (element: HTMLElement) =>
    Object.assign(element, { childElementCount: 0 }) as HTMLElement
  empty(push.primaryToolbar[0]!)
  const emptyOutgoing = empty(binding('push', true, true).primaryToolbar[0]!)
  controller.bind!({ ...push, secondaryToolbar: [...push.secondaryToolbar, emptyOutgoing] })
  controller.start?.()
  expect(of(push.primaryToolbar[0]!)).toHaveLength(1)
  expect(of(push.secondaryToolbar[0]!)).toHaveLength(1)
  expect(of(emptyOutgoing)).toHaveLength(0)
})

it('restarts an interrupted outgoing fade from the opacity currently on screen', () => {
  const { binding, of } = setup()
  const first = createAnimatedTransitionController(
    { cancel: vi.fn(), finish: vi.fn() },
    { interactive: false, operation: 'push' },
  )
  const push = binding('push', false, true)
  first.bind!(push)
  first.start?.()
  const visible = push.primaryToolbar[0]!
  vi.stubGlobal('getComputedStyle', () => ({ opacity: '0.37' }))
  first.finish()
  const deferredCleanup = vi
    .mocked(window.requestAnimationFrame)
    .mock.calls.map(([callback]) => callback)
  const next = createAnimatedTransitionController(
    { cancel: vi.fn(), finish: vi.fn() },
    { interactive: false, operation: 'push' },
  )
  next.bind!({ ...binding('push', true, true), secondaryToolbar: [visible] })
  for (const callback of deferredCleanup) callback(0)
  expect(visible.style.opacity).toBe('0.37')
  next.start?.()
  expect(of(visible).at(-1)?.frames[0]?.opacity).toBeCloseTo(0.37)
  expect(of(visible).at(-1)?.frames.at(-1)?.opacity).toBe(0)
  next.finish()
})

it('settles a forced finish when no successor claims its sampled opacity', () => {
  const { binding } = setup()
  const controller = createAnimatedTransitionController(
    { cancel: vi.fn(), finish: vi.fn() },
    { interactive: false, operation: 'push' },
  )
  const push = binding('push', false, true)
  controller.bind!(push)
  controller.start?.()
  vi.stubGlobal('getComputedStyle', () => ({ opacity: '0.37', filter: 'blur(6.3px)' }))
  controller.finish()
  expect(push.primaryToolbar[0]!.style.opacity).toBe('0.37')
  expect(push.primaryToolbar[0]!.style.filter).toBe('blur(6.3px)')
  for (const [callback] of vi.mocked(window.requestAnimationFrame).mock.calls) callback(0)
  expect(push.primaryToolbar[0]!.style.opacity).toBe('1')
  // A settled item is sharp: its held blur goes with its held opacity.
  expect(push.primaryToolbar[0]!.style.filter).toBe('')
  expect(push.secondaryToolbar[0]!.style.opacity).toBe('0')
})

it('does not wait for chrome readiness before starting the page tracks', async () => {
  const { binding, of } = setup()
  const push = binding('push', false, true)
  for (const element of [...push.primaryToolbar, ...push.secondaryToolbar, push.backButtonVisual]) {
    const animate = element.animate.bind(element)
    element.animate = ((frames: Keyframe[], options: KeyframeAnimationOptions) => {
      const animation = animate(frames, options)
      Object.defineProperty(animation, 'ready', { value: new Promise(() => {}) })
      return animation
    }) as typeof element.animate
  }
  const controller = createAnimatedTransitionController(
    { cancel: vi.fn(), finish: vi.fn() },
    { interactive: false, operation: 'push' },
  )
  controller.bind!(push)
  controller.start?.()
  for (let turn = 0; turn < 5; turn += 1) await Promise.resolve()
  expect(of(push.primary)[0]?.play).toHaveBeenCalledOnce()
  expect(of(push.primaryToolbar[0]!)[0]?.play).toHaveBeenCalledOnce()
  expect(of(push.primary)[0]?.startTime).toBe(of(push.primaryToolbar[0]!)[0]?.startTime)
  controller.finish()
})

it('reserves sampled opacity across forced push finish until the delayed successor binds', () => {
  const { binding, of } = setup()
  const first = createAnimatedTransitionController(
    { cancel: vi.fn(), finish: vi.fn() },
    { interactive: false, operation: 'push' },
  )
  const push = binding('push', false, true)
  first.bind!(push)
  first.start?.()
  const visible = push.primaryToolbar[0]!
  vi.stubGlobal('getComputedStyle', () => ({ opacity: '0.37' }))
  first.finishForPush!()
  for (const [callback] of vi.mocked(window.requestAnimationFrame).mock.calls) callback(0)
  expect(visible.style.opacity).toBe('0.37')
  const next = createAnimatedTransitionController(
    { cancel: vi.fn(), finish: vi.fn() },
    { interactive: false, operation: 'push' },
  )
  next.start?.()
  next.bind!({ ...binding('push', true, true), secondaryToolbar: [visible] })
  expect(of(visible).at(-1)?.frames[0]?.opacity).toBeCloseTo(0.37)
  next.finish()
})

function fakeAnimate() {
  return vi.fn(() => ({
    cancel: vi.fn(),
    pause: vi.fn(),
    play: vi.fn(),
    onfinish: null,
    ready: Promise.resolve(),
    currentTime: null,
    startTime: null,
    playState: 'running',
  })) as never
}

function slot(placement: string, items = 0) {
  const element = {
    style: new FakeStyle(),
    dataset: { satinNavigationToolbarSlot: placement },
    childElementCount: items || 1,
    closest: () => null,
    querySelectorAll: (selector: string) =>
      selector === '[data-satin-glass-slot-content]'
        ? Array.from({ length: items }, () => ({
            style: new FakeStyle(),
            parentElement: { closest: () => null },
          }))
        : [],
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 44, bottom: 44 }),
  } as unknown as HTMLElement
  element.animate = fakeAnimate()
  return element
}

it("shows a pushed screen's principal at once and carries it off with its page on pop (reference native sampler)", () => {
  const { binding, of } = setup()
  const principal = slot('principal')
  const push = { ...binding('push', true, true), primaryToolbar: [principal, slot('trailing')] }
  const controller = createAnimatedTransitionController(
    { cancel: vi.fn(), finish: vi.fn() },
    { interactive: false, operation: 'push' },
  )
  controller.bind!(push)
  controller.start?.()
  expect(principal.style.opacity).toBe('1')
  expect(
    vi
      .mocked(principal.animate)
      .mock.calls.some(([frames]) => 'opacity' in (frames as Keyframe[])[0]!),
  ).toBe(false)
  const popped = slot('principal')
  const pop = { ...binding('pop', true, true), primaryToolbar: [popped] }
  const popper = createAnimatedTransitionController(
    { cancel: vi.fn(), finish: vi.fn() },
    { interactive: false, operation: 'pop' },
  )
  popper.bind!(pop)
  popper.start?.()
  const moves = vi.mocked(popped.animate).mock.calls.map(([frames]) => frames as Keyframe[])
  expect(moves.some(frames => String(frames.at(-1)?.transform).includes('440px'))).toBe(true)
  expect(of(pop.primary).length).toBeGreaterThan(0)
})

/** The keyframe an animation shows `ms` after it starts (its knots sit on the 60 Hz grid). */
function frameAt(animation: { frames: Keyframe[]; options: KeyframeAnimationOptions }, ms: number) {
  const duration = Number(animation.options.duration)
  return animation.frames.reduce((best, frame) =>
    Math.abs(Number(frame.offset) * duration - ms) < Math.abs(Number(best.offset) * duration - ms)
      ? frame
      : best,
  )
}

// reference native (presentation-layer measurements presentation layers, Chats root <-> thread): where a back control
// replaces a leading glass item, the one circle swells to 1.22 x 1.20 at 150 ms (kept round: 1.21)
// and is back at 1 at 300 ms (native's 0.97 undershoot is not modelled); inside it the leaving symbol fades .57 @ 100 ms and the arriving one fades in
// as its complement, each scaled 1 - 0.8 (1 - a) of the circle and blurred 10 (1 - a). A pop runs
// the same 17 ms later.
it('swells the one leading glass circle and shrinks and grows the swapped symbols inside it', () => {
  for (const direction of ['push', 'pop'] as const) {
    const { binding, of } = setup()
    const ink = { style: new FakeStyle() } as unknown as HTMLElement
    ink.animate = fakeAnimate()
    const leading = slot('leading', 1)
    const swap =
      direction === 'push'
        ? { ...binding('push', false, true), secondaryToolbar: [leading] }
        : { ...binding('pop', true, false), secondaryToolbar: [leading] }
    swap.backButtonVisual.querySelector = (() => ink) as never
    const controller = createAnimatedTransitionController(
      { cancel: vi.fn(), finish: vi.fn() },
      { interactive: false, operation: direction },
    )
    controller.bind!(swap)
    controller.start?.()
    const delay = direction === 'push' ? 0 : 17
    const [circle] = of(swap.backButtonVisual)
    expect(circle).toBeDefined()
    expect(frameAt(circle!, 150 + delay).scale).toBe('1.21')
    expect(frameAt(circle!, 300 + delay).scale).toBe('none')
    expect(circle!.options.duration).toBe(300 + delay)
    expect(frameAt(circle!, 0).opacity).toBeUndefined()
    const symbol = (element: HTMLElement) => {
      const [frames, options] = vi.mocked(element.animate).mock.calls[0] as unknown as [
        Keyframe[],
        KeyframeAnimationOptions,
      ]
      return { frames, options }
    }
    const leaving = symbol(direction === 'push' ? leading : ink)
    const arriving = symbol(direction === 'push' ? ink : leading)
    expect(Number(frameAt(leaving, 100 + delay).opacity)).toBeCloseTo(0.57, 2)
    expect(Number(frameAt(arriving, 100 + delay).opacity)).toBeCloseTo(0.43, 2)
    expect(frameAt(leaving, 100 + delay).filter).toBe('blur(4.3px)')
    // The chevron sits inside the circle and takes its swell from it; the leading slot's symbol
    // does not, so it carries the swell itself.
    const own = (opacity: number) => 1 - 0.8 * (1 - opacity)
    const inner = direction === 'push' ? arriving : leaving
    const outer = direction === 'push' ? leaving : arriving
    const innerOpacity = Number(frameAt(inner, 100 + delay).opacity)
    const outerOpacity = Number(frameAt(outer, 100 + delay).opacity)
    expect(Number(frameAt(inner, 100 + delay).scale)).toBeCloseTo(own(innerOpacity), 3)
    expect(String(frameAt(outer, 100 + delay).scale)).toBe(
      String(Number((own(outerOpacity) * 1.15).toFixed(4))),
    )
    // A shown symbol in a circle at rest carries no scale or filter.
    expect(frameAt(arriving, 300 + delay)).toMatchObject({
      scale: 'none',
      filter: 'none',
    })
  }
})

// reference native (presentation-layer measurements, native reference search-push): a root's presented search field stays where it is
// on screen (x within 0.1 pt) when a screen is pushed over it or popped off it, and only fades,
// field and close button as one: in on a pop 0.79 @ 100 ms, out on a push as the complement.
it("keeps a root's presented search field in place and fades it on push and pop", () => {
  for (const direction of ['push', 'pop'] as const) {
    const { binding } = setup()
    const row = { style: new FakeStyle() } as unknown as HTMLElement
    row.animate = fakeAnimate()
    const transition = binding(direction, direction === 'pop', direction === 'push')
    transition.secondary.querySelector = ((selector: string) =>
      selector.includes('[data-satin-search-row]') ? row : null) as never
    const controller = createAnimatedTransitionController(
      { cancel: vi.fn(), finish: vi.fn() },
      { interactive: false, operation: direction },
    )
    controller.bind!(transition)
    controller.start?.()
    const calls = vi.mocked(row.animate).mock.calls as unknown as [
      Keyframe[],
      KeyframeAnimationOptions,
    ][]
    const moves = calls.find(([frames]) => frames.some(frame => frame.transform !== undefined))
    const fade = calls.find(([frames]) => frames.some(frame => frame.opacity !== undefined))
    expect(moves).toBeDefined()
    expect(fade).toBeDefined()
    // Counter-moved by the rear page's whole parallax (the page itself goes the other way).
    const revealed = direction === 'push' ? moves![0].at(-1) : moves![0][0]
    const covered = direction === 'push' ? moves![0][0] : moves![0].at(-1)
    expect(String(covered!.transform)).toMatch(/^translate3d\(0px/)
    expect(String(revealed!.transform)).not.toMatch(/^translate3d\(0px/)
    expect(String(revealed!.transform)).not.toContain('-')
    const at100 = frameAt({ frames: fade![0], options: fade![1] }, 100)
    expect(Number(at100.opacity)).toBeCloseTo(direction === 'pop' ? 0.79 : 0.21, 2)
  }
})
