import { DESTINATION_IMAGE_BUDGET_MS, registerImageCapture } from '../image/resource.ts'
import rapidRelease from './rapidRelease.fixture.json'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  NAVIGATION_DIM_OPACITY,
  NAVIGATION_DURATION_MS,
  NAVIGATION_EASING_CSS,
  NAVIGATION_EDGE_SHADOW_OPACITY,
  NAVIGATION_HORIZONTAL_INTENT_PX,
  NAVIGATION_PARALLAX_FRACTION,
  NAVIGATION_POSITION_THRESHOLD,
  NAVIGATION_VELOCITY_THRESHOLD_PX_PER_SECOND,
  NATIVE_SCRUB_REARM_COMMIT_MS,
  createAnimatedTransitionController,
  furtherAlong,
  nativeScrubSourceLiveAt,
  rearmNativeScrubSource,
  releaseNativeScrubClamp,
  retireNativeScrubSource,
  sampleNavigationCurve,
  shouldCompleteInteractivePop,
} from './motion.ts'

/** A native scrub source fake with attributes and its horizontal overflow policy. */
function scrubSourceFake() {
  const attributes = new Map<string, string>()
  return {
    style: { overflowX: 'scroll', touchAction: 'auto' } as unknown as CSSStyleDeclaration,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    setAttribute: (name: string, value: string) => void attributes.set(name, value),
    removeAttribute: (name: string) => void attributes.delete(name),
    getAttribute: (name: string) => attributes.get(name) ?? null,
  }
}
/** Before reset or after restoration, the source keeps its original overflow policy. */
function expectRetired(source: HTMLElement, retired: boolean) {
  expect(source.getAttribute('data-satin-scrub-retired')).toBe(retired ? 'true' : null)
  expect(source.style.overflowX).toBe('scroll')
  expect(source.style.touchAction).toBe('auto')
  expect(source.addEventListener).toHaveBeenCalledWith('scroll', expect.any(Function), {
    passive: true,
  })
}

beforeEach(() => vi.stubGlobal('getComputedStyle', (element: HTMLElement) => element.style))

class FakeStyle {
  readonly values = new Map<string, string>()
  boxShadow = ''
  opacity = ''
  transform = ''
  clipPath = ''

  setProperty(property: string, value: string) {
    this.values.set(property, value)
  }

  removeProperty(property: string) {
    const value = this.values.get(property) ?? ''
    this.values.delete(property)
    if (property === 'box-shadow') this.boxShadow = ''
    if (property === 'opacity') this.opacity = ''
    if (property === 'transform') this.transform = ''
    if (property === 'clip-path') this.clipPath = ''
    return value
  }

  getPropertyValue(property: string) {
    return this.values.get(property) ?? ''
  }
}

function fakeElement() {
  return {
    style: new FakeStyle(),
    querySelector: () => null,
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 402, bottom: 800 }),
  } as unknown as HTMLElement
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it('preserves position-first completion for legacy controllers', () => {
  expect(shouldCompleteInteractivePop(0.8, -318)).toBe(true)
  expect(shouldCompleteInteractivePop(0.8, -316)).toBe(true)
})

describe('measured navigation motion', () => {
  it('retains the measured Settings constants and curve endpoints', () => {
    expect(NAVIGATION_DURATION_MS).toBe(352)
    expect(NAVIGATION_PARALLAX_FRACTION).toBe(0.3)
    expect(NAVIGATION_DIM_OPACITY).toBe(0.1)
    expect(NAVIGATION_EDGE_SHADOW_OPACITY).toBe(0.018)
    expect(NAVIGATION_HORIZONTAL_INTENT_PX).toBe(30)
    expect(NAVIGATION_POSITION_THRESHOLD).toBe(0.425)
    expect(NAVIGATION_VELOCITY_THRESHOLD_PX_PER_SECOND).toBe(317)
    expect(sampleNavigationCurve(0)).toBeCloseTo(0, 6)
    expect(sampleNavigationCurve(1)).toBeCloseTo(1, 6)
    expect(sampleNavigationCurve(0.5)).toBeGreaterThan(0.85)
  })

  it('resolves the measured position and velocity brackets', () => {
    expect(shouldCompleteInteractivePop(168 / 402, 0)).toBe(false)
    expect(shouldCompleteInteractivePop(173 / 402, 0)).toBe(true)
    expect(shouldCompleteInteractivePop(80 / 402, 313.7)).toBe(false)
    expect(shouldCompleteInteractivePop(80 / 402, 320)).toBe(true)
  })

  it('writes direct transforms only while an interactive gesture owns progress', () => {
    vi.stubGlobal('document', {})
    vi.stubGlobal('window', {
      cancelAnimationFrame: vi.fn(),
      matchMedia: () => ({ matches: false }),
      requestAnimationFrame: vi.fn(),
    })
    const primary = fakeElement()
    const secondary = fakeElement()
    const secondaryDim = fakeElement()
    const controller = createAnimatedTransitionController(
      { cancel: vi.fn(), finish: vi.fn() },
      { interactive: true, operation: 'pop' },
    )
    const release = controller.bind!({
      direction: 'pop',
      primary,
      secondary,
      secondaryDim,
      width: 402,
    })

    controller.start?.()
    controller.setProgress?.(0.5)

    expect(primary.style.transform).toBe('translate3d(50%, 0, 0)')
    expect(primary.style.boxShadow).toContain('rgba(0, 0, 0, 0.018)')
    expect(secondary.style.transform).toBe('translate3d(-15%, 0, 0)')
    expect(secondary.style.clipPath).toBe('')
    expect(secondaryDim.style.opacity).toBe('0.05')

    release()
    expect(primary.style.transform).toBe('')
    expect(secondary.style.transform).toBe('')
    expect(secondaryDim.style.opacity).toBe('')
  })

  it.each(['push', 'pop'] as const)(
    'clips a transparent sheet rear to the front edge throughout %s',
    direction => {
      vi.stubGlobal('document', {})
      vi.stubGlobal('window', {
        matchMedia: () => ({ matches: false }),
        cancelAnimationFrame: vi.fn(),
      })
      const primary = fakeElement(),
        secondary = fakeElement(),
        width = 440
      const controller = createAnimatedTransitionController(
        { cancel: vi.fn(), finish: vi.fn() },
        { interactive: true, operation: direction },
      )
      const release = controller.bind!({
        direction,
        primary,
        secondary,
        width,
        occludeSecondary: true,
      })
      controller.start?.()
      for (const progress of [0, 0.2, 0.5, 0.9, 1]) {
        controller.setProgress?.(progress)
        const frontX =
          (Number(primary.style.transform.match(/translate3d\(([-\d.]+)%/)![1]) / 100) * width
        const rearX =
          (Number(secondary.style.transform.match(/translate3d\(([-\d.]+)%/)![1]) / 100) * width
        const clipped = Number(secondary.style.clipPath.match(/inset\(0 ([-\d.]+)%/)![1]) / 100
        // No rear pixels extend beneath the transparent front, even with parallax.
        expect(rearX + width * (1 - clipped)).toBeCloseTo(frontX, 8)
      }
      release()
      expect(secondary.style.clipPath).toBe('')
    },
  )

  it.each([false, true])(
    'keeps sheet occlusion on the same animation clock (scroll driven: %s)',
    scrollDriven => {
      vi.stubGlobal('document', {})
      class Timeline {}
      vi.stubGlobal('window', {
        ScrollTimeline: Timeline,
        matchMedia: () => ({ matches: false }),
        requestAnimationFrame: vi.fn(),
        cancelAnimationFrame: vi.fn(),
      })
      const calls: {
        element: HTMLElement
        frames: Keyframe[]
        options: KeyframeAnimationOptions
      }[] = []
      const element = () => {
        const target = fakeElement()
        target.animate = ((frames: Keyframe[], options: KeyframeAnimationOptions) => {
          calls.push({ element: target, frames, options })
          return {
            cancel: vi.fn(),
            pause: vi.fn(),
            play: vi.fn(),
            ready: Promise.resolve(),
            onfinish: null,
          } as unknown as Animation
        }) as typeof target.animate
        return target
      }
      const primary = element(),
        secondary = element()
      const controller = createAnimatedTransitionController(
        { finish: vi.fn(), cancel: vi.fn() },
        {
          interactive: scrollDriven,
          operation: scrollDriven ? 'pop' : 'push',
        },
      )
      controller.bind!({
        direction: scrollDriven ? 'pop' : 'push',
        primary,
        secondary,
        width: 440,
        occludeSecondary: true,
      })
      controller.start!()
      if (scrollDriven)
        controller.scrubFromScroll!(
          {
            ...scrubSourceFake(),
            scrollLeft: 440,
            clientWidth: 440,
            scrollWidth: 1320,
          } as unknown as HTMLElement,
          440,
          0,
        )
      const front = calls.find(call => call.element === primary)!
      const rear = calls.find(call => call.element === secondary && call.frames[0]?.transform)!
      const clip = calls.find(call => call.frames[0]?.clipPath)!
      expect(clip, 'sheet rear requires an occlusion track').toBeDefined()
      expect(clip.options).toEqual(front.options)
      expect(clip.frames).toHaveLength(front.frames.length)
      for (let i = 0; i < clip.frames.length; i++) {
        const x = (value: unknown) => Number(String(value).match(/translate3d\(([-\d.]+)%/)![1])
        const right = Number(String(clip.frames[i]!.clipPath).match(/inset\(0 ([-\d.]+)%/)![1])
        expect(x(rear.frames[i]!.transform) + 100 - right).toBeCloseTo(
          x(front.frames[i]!.transform),
          8,
        )
        expect(clip.frames[i]!.offset).toEqual(front.frames[i]!.offset)
      }
      if (scrollDriven) expect(clip.options.timeline).toBeInstanceOf(Timeline)
      controller.finish()
    },
  )

  it('scrubs framework title tracks with the screens while keeping the back control in place', () => {
    vi.stubGlobal('document', {})
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: false }),
    })
    const primary = fakeElement()
    const primaryTitle = fakeElement()
    const secondary = fakeElement()
    const secondaryTitle = fakeElement()
    const secondaryDim = fakeElement()
    const backButtonMask = fakeElement()
    const backButtonVisual = fakeElement()
    const controller = createAnimatedTransitionController(
      { cancel: vi.fn(), finish: vi.fn() },
      { interactive: true, operation: 'pop' },
    )
    controller.bind!({
      backButtonMask,
      backButtonFromVisible: true,
      backButtonToVisible: false,
      backButtonVisual,
      direction: 'pop',
      primary,
      primaryTitle,
      secondary,
      secondaryDim,
      secondaryTitle,
      width: 402,
    })

    controller.setProgress?.(0.1)

    expect(primaryTitle.style.transform).toBe('translate3d(10%, 0, 0)')
    expect(secondaryTitle.style.transform).toBe('translate3d(-27%, 0, 0)')
    // iOS 27 keeps the back control in place and fully visible while held (backControl.test.ts);
    // the sliding mask that wiped it is gone.
    expect(backButtonMask.style.transform).toBe('')
    expect(backButtonVisual.style.opacity).toBe('1')
  })

  it('pauses new WAAPI animations until their compositor readiness promises resolve', async () => {
    vi.stubGlobal('document', {})
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: false }),
      requestAnimationFrame: vi.fn(),
      cancelAnimationFrame: vi.fn(),
    })
    const animations: Array<{
      cancel: ReturnType<typeof vi.fn>
      onfinish: (() => void) | null
      pause: ReturnType<typeof vi.fn>
      play: ReturnType<typeof vi.fn>
      ready: Promise<void>
      currentTime: number | null
    }> = []
    const animatedElement = () => {
      const element = fakeElement()
      element.animate = vi.fn(() => {
        const animation = {
          cancel: vi.fn(),
          currentTime: null,
          onfinish: null,
          pause: vi.fn(),
          play: vi.fn(),
          ready: Promise.resolve(),
        }
        animations.push(animation)
        return animation as unknown as Animation
      })
      return element
    }
    const controller = createAnimatedTransitionController(
      { cancel: vi.fn(), finish: vi.fn() },
      { interactive: false, operation: 'push' },
    )

    controller.start?.()
    controller.bind!({
      direction: 'push',
      primary: animatedElement(),
      secondary: animatedElement(),
      secondaryDim: animatedElement(),
      width: 402,
    })

    expect(animations.every(animation => animation.pause.mock.calls.length === 1)).toBe(true)
    expect(animations.every(animation => animation.play.mock.calls.length === 0)).toBe(true)
    await Promise.resolve()
    await Promise.resolve()
    expect(animations.every(animation => animation.play.mock.calls.length === 1)).toBe(true)
    expect(animations.every(animation => animation.currentTime === 0)).toBe(true)
    controller.finish()
    await Promise.resolve()
    await Promise.resolve()
  })

  it('starts an interactive linear release synchronously without the readiness stall', () => {
    vi.stubGlobal('document', {})
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: false }),
    })
    const animations: Array<{
      cancel: ReturnType<typeof vi.fn>
      onfinish: (() => void) | null
      pause: ReturnType<typeof vi.fn>
      play: ReturnType<typeof vi.fn>
      ready: Promise<void>
    }> = []
    const animatedElement = () => {
      const element = fakeElement()
      element.animate = vi.fn(() => {
        const animation = {
          cancel: vi.fn(),
          onfinish: null,
          pause: vi.fn(),
          play: vi.fn(),
          ready: Promise.resolve(),
        }
        animations.push(animation)
        return animation as unknown as Animation
      })
      return element
    }
    const primary = animatedElement()
    const controller = createAnimatedTransitionController(
      { cancel: vi.fn(), finish: vi.fn() },
      { interactive: true, operation: 'pop' },
    )
    controller.bind!({
      direction: 'pop',
      primary,
      secondary: animatedElement(),
      secondaryDim: animatedElement(),
      width: 402,
    })
    controller.setProgress?.(0.25)
    controller.completeInteractive?.(600)

    expect(primary.animate).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ offset: 0, transform: 'translate3d(25%, 0, 0)' }),
        expect.objectContaining({ offset: 1, transform: 'translate3d(100%, 0, 0)' }),
      ]),
      expect.objectContaining({
        easing: 'linear',
        fill: 'both',
      }),
    )
    expect(animations.every(animation => animation.pause.mock.calls.length === 0)).toBe(true)
    expect(animations.every(animation => animation.play.mock.calls.length === 0)).toBe(true)
  })

  it('completes a zero-distance interactive release synchronously without a stalled animation', () => {
    vi.stubGlobal('document', {})
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: false }),
    })
    const primary = fakeElement()
    primary.animate = vi.fn()
    const cancel = vi.fn()
    const controller = createAnimatedTransitionController(
      { cancel, finish: vi.fn() },
      { interactive: true, operation: 'pop' },
    )
    controller.bind!({
      direction: 'pop',
      primary,
      secondary: fakeElement(),
      secondaryDim: fakeElement(),
      width: 402,
    })
    controller.cancelInteractive?.(150)

    expect(primary.animate).not.toHaveBeenCalled()
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('uses WAAPI on transform and opacity without scheduling a motion rAF loop', () => {
    vi.stubGlobal('document', {})
    const requestAnimationFrame = vi.fn()
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: false }),
      requestAnimationFrame,
    })
    const animations: Array<{ cancel: ReturnType<typeof vi.fn>; onfinish: (() => void) | null }> =
      []
    const animatedElement = () => {
      const element = fakeElement()
      element.animate = vi.fn(() => {
        const animation = { cancel: vi.fn(), onfinish: null }
        animations.push(animation)
        return animation as unknown as Animation
      })
      return element
    }
    const primary = animatedElement()
    const secondary = animatedElement()
    const secondaryDim = animatedElement()
    const finish = vi.fn()
    const controller = createAnimatedTransitionController(
      { cancel: vi.fn(), finish },
      { interactive: false, operation: 'push' },
    )

    controller.start?.()
    controller.bind!({
      direction: 'push',
      primary,
      secondary,
      secondaryDim,
      width: 402,
    })

    expect(requestAnimationFrame).not.toHaveBeenCalled()
    expect(primary.animate).toHaveBeenCalledWith(
      [{ transform: 'translate3d(100%, 0, 0)' }, { transform: 'translate3d(0%, 0, 0)' }],
      { duration: 352, easing: NAVIGATION_EASING_CSS, fill: 'both' },
    )
    expect(secondary.animate).toHaveBeenCalledOnce()
    expect(secondaryDim.animate).toHaveBeenCalledOnce()

    animations[0]!.onfinish?.()
    expect(finish).toHaveBeenCalledOnce()
  })

  it('uses an instant non-translating fallback for Reduced Motion', () => {
    vi.stubGlobal('document', {})
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: true }),
    })
    const finish = vi.fn()
    const controller = createAnimatedTransitionController(
      { cancel: vi.fn(), finish },
      { interactive: false, operation: 'push' },
    )

    controller.start?.()

    expect(controller.progress).toBe(1)
    expect(finish).toHaveBeenCalledOnce()
  })
})

it('releases in the touchend task from the further-along of a stale raw touchend and the scroller', () => {
  const frames: FrameRequestCallback[] = []
  class Timeline {
    options: unknown
    constructor(options: unknown) {
      this.options = options
    }
  }
  vi.stubGlobal('document', {})
  vi.stubGlobal('window', {
    ScrollTimeline: Timeline,
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame: (cb: FrameRequestCallback) => {
      frames.push(cb)
      return frames.length
    },
    cancelAnimationFrame: vi.fn(),
  })
  const calls: { frames: Keyframe[]; options: KeyframeAnimationOptions }[] = []
  const primary = fakeElement()
  primary.animate = ((frames: Keyframe[], options: KeyframeAnimationOptions) => {
    calls.push({ frames, options })
    return { cancel: vi.fn(), onfinish: null } as unknown as Animation
  }) as typeof primary.animate
  const controller = createAnimatedTransitionController(
    { finish: vi.fn(), cancel: vi.fn() },
    { interactive: true, operation: 'pop' },
  )
  controller.bind!({ direction: 'pop', primary, width: 400 })
  controller.start!()
  const source = {
    ...scrubSourceFake(),
    scrollLeft: 380,
    clientWidth: 400,
    scrollWidth: 1200,
  } as unknown as HTMLElement
  controller.scrubFromScroll!(source, 400, 12)
  expect(calls[0]!.options.timeline).toBeInstanceOf(Timeline)
  const initialStyle = primary.style.transform
  source.scrollLeft = 300
  expect(controller.progress).toBeCloseTo(0.28)
  expect(primary.style.transform).toBe(initialStyle)
  expect(calls).toHaveLength(1)
  // The scroller (0.28) still moves after the touchend's coordinate (0.3 behind it here: 0.38).
  source.scrollLeft = 260
  controller.completeInteractive!(320, 0.3)
  expect(calls).toHaveLength(2)
  expect(frames).toHaveLength(1)
  expectRetired(source, true)
  expect(source.scrollLeft).toBe(400)
  expect(calls[1]!.options.timeline).toBeUndefined()
  expect(calls[1]!.frames[0]!.transform).toBe(`translate3d(${0.38 * 100}%, 0, 0)`)
  expect(calls[1]!.options.easing).toBe('linear')
  controller.finish()
  expectRetired(source, true)
  frames.shift()!(16)
  frames.shift()!(32)
  expectRetired(source, false)
})

it.each([
  { raw: 0.46, reconciled: 0.48, cancelled: false, target: 100 },
  { raw: 0.48, reconciled: 0.46, cancelled: false, target: 0 },
  { raw: 0.46, reconciled: 0.48, cancelled: true, target: 0 },
])(
  'selects the endpoint from the scroller pose at touchend, preserving explicit cancellation: %j',
  ({ raw, reconciled, cancelled, target }) => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('document', {})
    vi.stubGlobal('window', {
      ScrollTimeline: class {},
      matchMedia: () => ({ matches: false }),
      requestAnimationFrame: (cb: FrameRequestCallback) => {
        frames.push(cb)
        return frames.length
      },
      cancelAnimationFrame: vi.fn(),
    })
    const primary = fakeElement()
    const calls: Keyframe[][] = []
    primary.animate = ((keyframes: Keyframe[]) => {
      calls.push(keyframes)
      return { cancel: vi.fn(), onfinish: null } as unknown as Animation
    }) as typeof primary.animate
    const controller = createAnimatedTransitionController(
      { finish: vi.fn(), cancel: vi.fn() },
      { interactive: true, operation: 'pop' },
    )
    controller.bind!({ direction: 'pop', primary, width: 400 })
    const source = {
      ...scrubSourceFake(),
      scrollLeft: 400,
      clientWidth: 400,
      scrollWidth: 1200,
    } as unknown as HTMLElement
    controller.scrubFromScroll!(source, 400, 0)
    // With no velocity the scroller's own pose (not the touchend coordinate) is the release pose.
    source.scrollLeft = 400 * (1 - reconciled)
    controller.resolveInteractive!(0, raw, cancelled, {
      averageVelocity: 0,
      averageAcceleration: 0,
      edgeFlick: false,
    })
    expect(frames).toHaveLength(1)
    expect(calls[1]!.at(-1)!.transform).toBe(`translate3d(${target}%, 0, 0)`)
    expect(controller.progress).toBeCloseTo(reconciled)
  },
)

it.each(['push', 'replace'] as const)(
  'opens route preparation only after %s playback and revokes it at completion',
  async operation => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: false }),
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        frames.push(callback)
        return frames.length
      },
      cancelAnimationFrame: vi.fn(),
    })
    vi.stubGlobal('document', {})
    vi.stubGlobal('getComputedStyle', () => ({ display: 'block', visibility: 'visible' }))
    const attributes = new Map<string, string>()
    const owner = {
      setAttribute: (key: string, value: string) => attributes.set(key, value),
      removeAttribute: (key: string) => attributes.delete(key),
    }
    const element = fakeElement()
    let decode!: (image: HTMLImageElement) => void
    const hero = {
      getAttribute: () => null,
      hasAttribute: () => false,
      dataset: {},
      style: { visibility: '' },
      parentElement: element,
      getBoundingClientRect: () => ({
        left: 402,
        right: 804,
        top: 50,
        bottom: 452,
        width: 402,
        height: 402,
      }),
    } as unknown as HTMLImageElement
    element.getBoundingClientRect = () =>
      ({ left: 402, right: 804, top: 0, bottom: 800 }) as DOMRect
    element.querySelectorAll = (() => [hero]) as unknown as HTMLElement['querySelectorAll']
    const unregister = registerImageCapture(hero, {
      source: 'album.jpg',
      ready: new Promise(resolve => {
        decode = resolve
      }),
    })
    element.closest = vi.fn(() => owner as unknown as Element)
    vi.spyOn(performance, 'now').mockReturnValue(1300)
    const animation = {
      cancel: vi.fn(),
      pause: vi.fn(),
      play: vi.fn(),
      ready: Promise.resolve(),
      currentTime: null,
      startTime: null,
      onfinish: null,
    }
    element.animate = vi.fn(() => animation as unknown as Animation)
    const controller = createAnimatedTransitionController(
      { finish: vi.fn(), cancel: vi.fn() },
      { interactive: false, operation },
    )
    let admitGlass!: () => void
    const glassReady = new Promise<void>(resolve => {
      admitGlass = resolve
    })
    controller.bind!({ direction: 'push', primary: element, width: 402, glassReady })
    controller.start!()
    expect(attributes.size).toBe(0)
    for (let i = 0; i < 6; i++) await Promise.resolve()
    expect(animation.play).not.toHaveBeenCalled()
    decode(hero)
    for (let i = 0; i < 10; i++) await Promise.resolve()
    expect(animation.play).not.toHaveBeenCalled()
    admitGlass()
    for (let i = 0; i < 10; i++) await Promise.resolve()
    expect(animation.play).toHaveBeenCalledOnce()
    expect(animation.startTime).toBe(1300)
    expect(attributes.size).toBe(0)
    frames.shift()!(16)
    expect(attributes.size).toBe(0)
    frames.shift()!(32)
    expect(attributes.get('data-satin-push-playing')).toBe('true')
    controller.finish()
    unregister()
    expect(attributes.size).toBe(0)
    const cancelled = createAnimatedTransitionController(
      { finish: vi.fn(), cancel: vi.fn() },
      { interactive: false, operation },
    )
    const unregisterCancelled = registerImageCapture(hero, {
      source: 'next-album.jpg',
      ready: new Promise(resolve => {
        decode = resolve
      }),
    })
    let admitCancelled!: () => void
    const cancelledGlass = new Promise<void>(resolve => {
      admitCancelled = resolve
    })
    cancelled.bind!({ direction: 'push', primary: element, width: 402, glassReady: cancelledGlass })
    cancelled.start!()
    cancelled.cancel()
    admitCancelled()
    decode(hero)
    for (let i = 0; i < 10; i++) await Promise.resolve()
    expect(animation.play).toHaveBeenCalledOnce()
    unregisterCancelled()
  },
)

it('keeps bundled artwork behind paused push tracks past the image budget', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  vi.stubGlobal('window', {
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: vi.fn(),
  })
  vi.stubGlobal('document', {})
  vi.stubGlobal('getComputedStyle', () => ({ display: 'block', visibility: 'visible' }))
  vi.spyOn(performance, 'now').mockReturnValue(1300)
  const element = fakeElement()
  const hero = {
    getAttribute: () => null,
    hasAttribute: () => false,
    dataset: {},
    style: { visibility: '' },
    parentElement: element,
    getBoundingClientRect: () => ({
      left: 402,
      right: 804,
      top: 50,
      bottom: 452,
      width: 402,
      height: 402,
    }),
  } as unknown as HTMLImageElement
  element.getBoundingClientRect = () => ({ left: 402, right: 804, top: 0, bottom: 800 }) as DOMRect
  element.querySelectorAll = (() => [hero]) as unknown as HTMLElement['querySelectorAll']
  element.closest = vi.fn(() => null)
  let decode!: (value: HTMLImageElement) => void
  const unregister = registerImageCapture(hero, {
    source: 'album.jpg',
    ready: new Promise(resolve => {
      decode = resolve
    }),
  })
  const animation = {
    cancel: vi.fn(),
    pause: vi.fn(),
    play: vi.fn(),
    ready: Promise.resolve(),
    currentTime: null,
    startTime: null,
    onfinish: null,
  }
  element.animate = vi.fn(() => animation as unknown as Animation)
  const controller = createAnimatedTransitionController(
    { finish: vi.fn(), cancel: vi.fn() },
    { interactive: false, operation: 'push' },
  )
  controller.bind!({ direction: 'push', primary: element, width: 402 })
  controller.start!()
  try {
    await vi.advanceTimersByTimeAsync(DESTINATION_IMAGE_BUDGET_MS - 1)
    expect(animation.play).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2)
    expect(animation.play).not.toHaveBeenCalled()
    decode(hero)
    for (let i = 0; i < 10; i++) await Promise.resolve()
    expect(animation.play).toHaveBeenCalledOnce()
  } finally {
    controller.finish()
    unregister()
    vi.useRealTimers()
  }
})

it('retires the native source in the effect replacement update before the document clock advances', async () => {
  const frames: FrameRequestCallback[] = []
  class Effect {
    setKeyframes = vi.fn()
    updateTiming = vi.fn()
  }
  vi.stubGlobal('KeyframeEffect', Effect)
  vi.spyOn(performance, 'now').mockReturnValue(1300)
  const timeline = { currentTime: 1234 }
  vi.stubGlobal('document', { timeline })
  vi.stubGlobal('window', {
    matchMedia: () => ({ matches: false }),
    ScrollTimeline: class {},
    requestAnimationFrame: (cb: FrameRequestCallback) => {
      frames.push(cb)
      return frames.length
    },
    cancelAnimationFrame: vi.fn(),
  })
  const animations: any[] = []
  const elements = Array.from({ length: 7 }, () => {
    const element = fakeElement()
    element.animate = vi.fn((_frames: Keyframe[], options: KeyframeAnimationOptions) => {
      const animation = {
        effect: new Effect(),
        cancel: vi.fn(),
        onfinish: null,
        timeline: options.timeline ?? timeline,
        startTime: null,
        ready: Promise.resolve(),
      }
      animations.push(animation)
      return animation as unknown as Animation
    })
    return element
  })
  const controller = createAnimatedTransitionController(
    { finish: vi.fn(), cancel: vi.fn() },
    { interactive: true, operation: 'pop' },
  )
  controller.bind!({
    direction: 'pop',
    primary: elements[0]!,
    primaryTitle: elements[1],
    secondary: elements[2],
    secondaryTitle: elements[3],
    secondaryDim: elements[4],
    backButtonMask: elements[5],
    backButtonVisual: elements[6],
    backButtonFromVisible: true,
    backButtonToVisible: false,
    width: 402,
  })
  const source = {
    ...scrubSourceFake(),
    scrollWidth: 1206,
    clientWidth: 402,
    scrollLeft: 281.4,
  } as unknown as HTMLElement
  controller.scrubFromScroll!(source, 402, 0)
  // The back control (elements[5] mask, elements[6] visual) has no scroll-driven track: it is
  // never wiped, and held positions keep it shown (chromeCurves.test.ts).
  const animated = elements.slice(0, 5)
  const tracks = animated.map(element => vi.mocked(element.animate).mock.calls[0]!)
  expect(
    tracks.every(
      track =>
        (track[1] as KeyframeAnimationOptions).timeline ===
        (tracks[0]![1] as KeyframeAnimationOptions).timeline,
    ),
  ).toBe(true)
  const front = tracks[0]![0] as Keyframe[],
    rear = tracks[2]![0] as Keyframe[]
  expect(rear.map(frame => frame.offset)).toEqual(front.map(frame => frame.offset))
  for (let i = 0; i < front.length; i++) {
    const primary = parseFloat(String(front[i]!.transform).slice('translate3d('.length))
    const secondary = parseFloat(String(rear[i]!.transform).slice('translate3d('.length))
    expect(secondary).toBeCloseTo(0.3 * (primary - 100), 10)
  }
  controller.completeInteractive!(500, 0.2)
  // The release is installed in the touchend task (no reconciliation frame).
  // 5 scroll-driven tracks, then 5 release tracks and the back control's time-based fade.
  expect(animations).toHaveLength(11)
  expectRetired(source, true)
  expect(source.scrollLeft).toBe(402)
  expect(animations.slice(5).every(a => a.timeline === timeline && a.startTime === 1300)).toBe(true)
  expect(parseFloat(elements[0]!.style.transform.slice('translate3d('.length))).toBeCloseTo(30)
  expect(parseFloat(elements[2]!.style.transform.slice('translate3d('.length))).toBeCloseTo(-21)
  expect(Number(elements[4]!.style.opacity)).toBeCloseTo(NAVIGATION_DIM_OPACITY * 0.7)
  for (let i = 0; i < 4; i++) await Promise.resolve()
  // Reset native momentum across a rendering update while the document-timeline
  // release keeps running.
  expect(frames).toHaveLength(1)
  expectRetired(source, true)
  expect(source.scrollLeft).toBe(402)
  frames.shift()!(32)
  expect(source.style.overflowX).toBe('hidden')
  frames.shift()!(48)
  expectRetired(source, false)
  expect(source.scrollLeft).toBe(402)
  expect(animations.slice(5).every(a => a.cancel.mock.calls.length === 0)).toBe(true)
  controller.finish()
  expectRetired(source, false)
  expect(animations.every(a => a.cancel.mock.calls.length === 1)).toBe(true)
})

it.each([0, 1])(
  'disposes retained scrub tracks when the reconciled source reaches %s',
  endpoint => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('document', {})
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: false }),
      ScrollTimeline: class {},
      requestAnimationFrame: (cb: FrameRequestCallback) => {
        frames.push(cb)
        return frames.length
      },
      cancelAnimationFrame: vi.fn(),
    })
    const primary = fakeElement(),
      cancel = vi.fn(),
      finish = vi.fn(),
      cancelTrack = vi.fn()
    primary.animate = vi.fn(() => ({ cancel: cancelTrack, onfinish: null }) as unknown as Animation)
    const controller = createAnimatedTransitionController(
      { finish, cancel },
      { interactive: true, operation: 'pop' },
    )
    controller.bind!({ direction: 'pop', primary, width: 402 })
    controller.scrubFromScroll!(
      {
        ...scrubSourceFake(),
        scrollWidth: 1206,
        clientWidth: 402,
        scrollLeft: (1 - endpoint) * 402,
      } as unknown as HTMLElement,
      402,
      0,
    )
    if (endpoint === 0) controller.cancelInteractive!(0, 0)
    else controller.completeInteractive!(0, 1)
    expect(primary.animate).toHaveBeenCalledOnce()
    expect(cancelTrack).toHaveBeenCalledOnce()
    expect(endpoint === 0 ? cancel : finish).toHaveBeenCalledOnce()
  },
)

it.each([false, true])(
  'releases from established progress when touchend beats native scrub attachment (binding deferred: %s)',
  deferred => {
    vi.stubGlobal('document', {})
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) })
    const primary = fakeElement()
    primary.animate = vi.fn(() => ({ cancel: vi.fn(), onfinish: null }) as unknown as Animation)
    const controller = createAnimatedTransitionController(
      { finish: vi.fn(), cancel: vi.fn() },
      { interactive: true, operation: 'pop' },
    )
    const binding = { direction: 'pop' as const, primary, width: 402 }
    if (!deferred) controller.bind!(binding)
    controller.setProgress!(0.1)
    controller.completeInteractive!(500, 0.3)
    if (deferred) controller.bind!(binding)
    expect(primary.animate).toHaveBeenCalledOnce()
    expect(vi.mocked(primary.animate).mock.calls[0]![0]).toEqual(
      expect.arrayContaining([expect.objectContaining({ transform: 'translate3d(10%, 0, 0)' })]),
    )
  },
)

it('hands off in the touchend task: no frame stands between the lift and the release', () => {
  const frames: FrameRequestCallback[] = []
  const cancel = vi.fn()
  vi.stubGlobal('document', {})
  vi.stubGlobal('window', {
    matchMedia: () => ({ matches: false }),
    ScrollTimeline: class {},
    requestAnimationFrame: (cb: FrameRequestCallback) => {
      frames.push(cb)
      return frames.length
    },
    cancelAnimationFrame: vi.fn(),
  })
  const primary = fakeElement()
  primary.animate = vi.fn(() => ({ cancel: vi.fn(), onfinish: null }) as unknown as Animation)
  const controller = createAnimatedTransitionController(
    { finish: vi.fn(), cancel },
    { interactive: true, operation: 'pop' },
  )
  controller.bind!({ direction: 'pop', primary, width: 402 })
  controller.scrubFromScroll!(
    {
      ...scrubSourceFake(),
      scrollWidth: 1206,
      clientWidth: 402,
      scrollLeft: 220,
    } as unknown as HTMLElement,
    402,
    0,
  )
  controller.completeInteractive!(1500, 0.45)
  // Scroll-driven track, then the release track: both before any rendering update.
  expect(primary.animate).toHaveBeenCalledTimes(2)
  expect(controller.interactionPhase).toBe('completing')
  // Only the retired source's re-arm frame remains.
  expect(frames).toHaveLength(1)
  controller.cancel()
  expect(cancel).toHaveBeenCalledOnce()
})

it.each([
  {
    label: 'scroller ahead of a stale touchend',
    scrollLeft: 220,
    raw: 0.4,
    velocity: 2000,
    from: 45.27,
  },
  {
    label: 'touchend ahead of a lagging scroller',
    scrollLeft: 300,
    raw: 0.4,
    velocity: 2000,
    from: 40,
  },
  {
    label: 'cancelling: further toward the start',
    scrollLeft: 300,
    raw: 0.2,
    velocity: -800,
    from: 20,
  },
  {
    label: 'no velocity keeps the scroller pose',
    scrollLeft: 300,
    raw: 0.4,
    velocity: 0,
    from: 25.37,
  },
])(
  'starts the release from the further-along pose ($label)',
  ({ scrollLeft, raw, velocity, from }) => {
    vi.stubGlobal('document', {})
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: false }),
      ScrollTimeline: class {},
      requestAnimationFrame: () => 1,
      cancelAnimationFrame: vi.fn(),
    })
    const primary = fakeElement()
    primary.animate = vi.fn(() => ({ cancel: vi.fn(), onfinish: null }) as unknown as Animation)
    const controller = createAnimatedTransitionController(
      { finish: vi.fn(), cancel: vi.fn() },
      { interactive: true, operation: 'pop' },
    )
    controller.bind!({ direction: 'pop', primary, width: 402 })
    const source = {
      ...scrubSourceFake(),
      scrollWidth: 1206,
      clientWidth: 402,
      scrollLeft: 402,
    } as unknown as HTMLElement
    controller.scrubFromScroll!(source, 402, 0)
    source.scrollLeft = scrollLeft
    controller.resolveInteractive!(velocity, raw, false, {
      averageVelocity: velocity / 402000,
      averageAcceleration: 0,
      edgeFlick: false,
    })
    const release = vi.mocked(primary.animate).mock.calls[1]![0] as Keyframe[]
    expect(parseFloat(String(release[0]!.transform).slice('translate3d('.length))).toBeCloseTo(
      from,
      1,
    )
  },
)

it('furtherAlong follows the velocity sign and keeps the pose without velocity', () => {
  expect(furtherAlong(0.5, 0.6, 1)).toBe(0.6)
  expect(furtherAlong(0.5, 0.6, -1)).toBe(0.5)
  expect(furtherAlong(0.5, 0.6, 0)).toBe(0.5)
})

describe('release pose and clock', () => {
  const setup = (computedX?: number) => {
    let now = 5000
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    vi.stubGlobal('document', { timeline: {} })
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: false }),
      ScrollTimeline: class {},
      requestAnimationFrame: () => 1,
      cancelAnimationFrame: vi.fn(),
    })
    if (computedX !== undefined) {
      vi.stubGlobal(
        'DOMMatrixReadOnly',
        class {
          m41 = computedX
        },
      )
      vi.stubGlobal('getComputedStyle', () => ({ transform: 'matrix(1,0,0,1,0,0)' }))
    }
    const animations: { frames: Keyframe[]; animation: { startTime: number | null } }[] = []
    const primary = fakeElement()
    primary.animate = vi.fn((frames: Keyframe[]) => {
      const animation = { cancel: vi.fn(), onfinish: null, startTime: null, effect: {} }
      animations.push({ frames, animation })
      return animation as unknown as Animation
    })
    const controller = createAnimatedTransitionController(
      { finish: vi.fn(), cancel: vi.fn() },
      { interactive: true, operation: 'pop' },
    )
    controller.bind!({ direction: 'pop', primary, width: 400 })
    const source = {
      ...scrubSourceFake(),
      scrollWidth: 2000,
      clientWidth: 400,
      scrollLeft: 800,
    } as unknown as HTMLElement
    controller.scrubFromScroll!(source, 800, 0)
    source.scrollLeft = 680 // the scroller reached 0.3
    const startX = (index: number) =>
      parseFloat(String(animations[index]!.frames[0]!.transform).slice('translate3d('.length))
    return { controller, animations, startX, advance: (ms: number) => (now += ms) }
  }

  it('starts the clock when the release is installed, not at the earlier lift', () => {
    const { controller, animations, advance } = setup()
    advance(21)
    controller.resolveInteractive!(
      2000,
      0.32,
      false,
      { averageVelocity: 5, averageAcceleration: 0, edgeFlick: false },
      4979,
    )
    // The pose is the page now; a lift-time clock would add the delivery delay's travel again.
    expect(animations[1]!.animation.startTime).toBe(5021)
  })

  it('a stale computed transform (0) never pulls a forward release behind the lift', () => {
    const { controller, startX } = setup(0)
    controller.resolveInteractive!(2000, 0.32, false, {
      averageVelocity: 5,
      averageAcceleration: 0,
      edgeFlick: false,
    })
    expect(startX(1)).toBeCloseTo(32, 5)
  })

  it('touchcancel starts the return from the presented pose, not the further lift position', () => {
    const { controller, startX } = setup(120)
    controller.resolveInteractive!(2000, 0.45, true, {
      averageVelocity: 5,
      averageAcceleration: 0,
      edgeFlick: false,
    })
    expect(startX(1)).toBeCloseTo(30, 5)
  })
})

it('ends all compositor tracks together at the edge without overshoot', () => {
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) })
  vi.stubGlobal('document', { timeline: {} })
  const calls: Array<{ frames: Keyframe[]; options: KeyframeAnimationOptions }> = []
  const elements = Array.from({ length: 5 }, () => {
    const element = fakeElement()
    element.animate = vi.fn((frames: Keyframe[], options: KeyframeAnimationOptions) => {
      calls.push({ frames, options })
      return { cancel: vi.fn(), onfinish: null } as unknown as Animation
    }) as typeof element.animate
    return element
  })
  const controller = createAnimatedTransitionController(
    { finish: vi.fn(), cancel: vi.fn() },
    { interactive: true, operation: 'pop' },
  )
  controller.bind!({
    direction: 'pop',
    width: 400,
    primary: elements[0]!,
    primaryTitle: elements[1],
    secondary: elements[2],
    secondaryTitle: elements[3],
    secondaryDim: elements[4],
  })
  controller.setProgress!(0.5)
  controller.completeInteractive!(4000, 0.5)
  const front = calls[0]!.frames.map(f =>
    parseFloat(String(f.transform).slice('translate3d('.length)),
  )
  const rear = calls[2]!.frames.map(f =>
    parseFloat(String(f.transform).slice('translate3d('.length)),
  )
  expect(Math.max(...front)).toBe(100)
  expect(Math.max(...rear)).toBe(0)
  for (const call of calls) {
    expect(call.options.easing).toBe('linear')
    expect(call.frames.map(f => f.offset)).toEqual(calls[0]!.frames.map(f => f.offset))
  }
  for (let i = 0; i < front.length; i++) expect(rear[i]).toBeCloseTo(0.3 * (front[i]! - 100), 10)
})

it('retargets a destination push from the presented release pose for body, title and dim', () => {
  vi.stubGlobal('document', {})
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false }), cancelAnimationFrame: vi.fn() })
  vi.stubGlobal('getComputedStyle', () => ({
    transform: 'matrix(1, 0, 0, 1, 7.072, 0)',
    opacity: '0.023',
  }))
  const element = () => {
    const el = fakeElement()
    el.animate = vi.fn(() => ({ cancel: vi.fn(), onfinish: null }) as unknown as Animation)
    return el
  }
  const secondary = element(),
    secondaryTitle = element(),
    secondaryDim = element()
  const pop = createAnimatedTransitionController(
    { finish: vi.fn(), cancel: vi.fn() },
    { interactive: true, operation: 'pop' },
  )
  const unbind = pop.bind!({
    direction: 'pop',
    primary: element(),
    secondary,
    secondaryTitle,
    secondaryDim,
    width: 402,
  })
  pop.completeInteractive!(1200, 0.9)
  pop.finishForPush!()
  unbind()
  const push = createAnimatedTransitionController({ finish: vi.fn(), cancel: vi.fn() })
  push.bind!({
    direction: 'push',
    primary: element(),
    secondary,
    secondaryTitle,
    secondaryDim,
    width: 402,
  })
  expect(secondary.style.transform).toBe('matrix(1, 0, 0, 1, 7.072, 0)')
  push.start!()
  for (const el of [secondary, secondaryTitle]) {
    expect(vi.mocked(el.animate).mock.lastCall?.[0]).toEqual([
      { transform: 'matrix(1, 0, 0, 1, 7.072, 0)' },
      { transform: 'translate3d(-30%, 0, 0)' },
    ])
  }
  expect(vi.mocked(secondaryDim.animate).mock.lastCall?.[0]).toEqual([
    { opacity: '0.023' },
    { opacity: 0.1 },
  ])
})

it('constructs automatic effects paused without queuing provisional playback', () => {
  vi.stubGlobal('document', { timeline: {} })
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) })
  const created: Array<{ currentTime: number | null; pauses: number }> = []
  vi.stubGlobal(
    'KeyframeEffect',
    class {
      constructor(..._args: unknown[]) {}
    },
  )
  vi.stubGlobal(
    'Animation',
    class {
      currentTime: number | null = null
      pauses = 0
      constructor(..._args: unknown[]) {
        created.push(this)
      }
      pause() {
        this.pauses++
      }
      cancel() {}
    },
  )
  const primary = fakeElement()
  primary.animate = vi.fn()
  const controller = createAnimatedTransitionController({ finish: vi.fn(), cancel: vi.fn() })
  controller.bind!({ direction: 'push', primary, width: 402 })
  controller.start!()
  expect(primary.animate).not.toHaveBeenCalled()
  expect(created).toHaveLength(1)
  expect(created[0]).toMatchObject({ currentTime: 0, pauses: 1 })
})

it.each(rapidRelease.cases)(
  'replays the unpainted rapid release at $at without skipping the page',
  sample => {
    vi.stubGlobal('document', {})
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) })
    const primary = fakeElement(),
      finish = vi.fn()
    const animation = { cancel: vi.fn(), onfinish: null as (() => void) | null }
    primary.animate = vi.fn(() => animation as unknown as Animation)
    const controller = createAnimatedTransitionController(
      { finish, cancel: vi.fn() },
      { interactive: true, operation: 'pop' },
    )
    controller.bind!({ direction: 'pop', primary, width: sample.width })
    controller.start!()
    controller.resolveInteractive!(sample.velocity, sample.raw, false)
    const [frames, options] = vi.mocked(primary.animate).mock.calls[0] as [
      Keyframe[],
      KeyframeAnimationOptions,
    ]
    expect(frames[0]!.transform).toBe('translate3d(0%, 0, 0)')
    expect(frames.at(-1)!.transform).toBe('translate3d(100%, 0, 0)')
    // The duration must belong to the full visible distance, not the last few
    // percent of an input coordinate that never acquired a native effect.
    expect(Number(options.duration)).toBeGreaterThan((2 * 1000) / 60)
    expect(finish).not.toHaveBeenCalled()
    animation.onfinish!()
    expect(finish).toHaveBeenCalledOnce()
  },
)

it('installs the native release tracks before publishing the interaction phase to subscribers', () => {
  const callbacks: FrameRequestCallback[] = []
  vi.spyOn(performance, 'now').mockReturnValue(1000)
  vi.stubGlobal('document', { timeline: { currentTime: 1000 } })
  vi.stubGlobal('window', {
    ScrollTimeline: class {},
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      callbacks.push(callback)
      return callbacks.length
    },
    cancelAnimationFrame: vi.fn(),
  })
  const primary = fakeElement()
  const tracks: { options: KeyframeAnimationOptions; animation: Animation }[] = []
  primary.animate = vi.fn((_frames: Keyframe[], options: KeyframeAnimationOptions) => {
    const animation = { cancel: vi.fn(), onfinish: null, effect: {} } as unknown as Animation
    tracks.push({ options, animation })
    return animation
  }) as typeof primary.animate
  const published: { documentTracks: number; retired: boolean; seeded: boolean }[] = []
  const source = {
    ...scrubSourceFake(),
    scrollLeft: 240,
    clientWidth: 400,
    scrollWidth: 1200,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as HTMLElement
  const controller = createAnimatedTransitionController(
    {
      finish: vi.fn(),
      cancel: vi.fn(),
      changed() {
        const documentTracks = tracks.filter(track => !track.options.timeline)
        published.push({
          documentTracks: documentTracks.length,
          retired: source.getAttribute('data-satin-scrub-retired') === 'true',
          seeded: documentTracks.every(track => track.animation.startTime === 1000),
        })
      },
    },
    { interactive: true, operation: 'pop' },
  )
  controller.bind!({ direction: 'pop', primary, width: 400 })
  controller.scrubFromScroll!(source, 400, 0)
  controller.completeInteractive!(2000, 0.4)
  expect(controller.interactionPhase).toBe('completing')
  callbacks.shift()!(1000)
  expect(published).toEqual([{ documentTracks: 1, retired: true, seeded: true }])
  controller.finish()
})

it('releases a busy scrub whose source never moved instead of waiting for native deceleration', () => {
  // Owner phone 2026-09-24 (preview-Wm3D3JmI): contacts bound to another
  // scroll view left the source at its origin with adjustment 40 of 440.
  // No momentum can end and no endpoint plateau can be reached from there.
  const frames: FrameRequestCallback[] = []
  let now = 0
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.stubGlobal('document', {})
  vi.stubGlobal('window', {
    ScrollTimeline: class {},
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame: (cb: FrameRequestCallback) => {
      frames.push(cb)
      return frames.length
    },
    cancelAnimationFrame: vi.fn(),
  })
  const primary = fakeElement()
  const calls: Keyframe[][] = []
  primary.animate = vi.fn((keyframes: Keyframe[]) => {
    calls.push(keyframes)
    return { cancel: vi.fn(), onfinish: null } as unknown as Animation
  }) as typeof primary.animate
  const controller = createAnimatedTransitionController(
    { finish: vi.fn(), cancel: vi.fn() },
    { interactive: true, operation: 'pop' },
  )
  controller.bind!({ direction: 'pop', primary, width: 440 })
  const listeners = new Map<string, () => void>()
  const source = {
    ...scrubSourceFake(),
    scrollLeft: 880,
    clientWidth: 440,
    scrollWidth: 2200,
    addEventListener: (event: string, listener: () => void) => {
      listeners.set(event, listener)
    },
    removeEventListener: (event: string) => {
      listeners.delete(event)
    },
  } as unknown as HTMLElement
  controller.scrubFromScroll!(source, 880, 40)
  controller.resolveInteractive!(4358.8, 0.539, false, {
    averageVelocity: 8.3,
    averageAcceleration: 15,
    edgeFlick: true,
  })
  now = 120 // A busy main thread: well past the prompt-transfer window.
  frames.shift()!(now)
  expect(calls).toHaveLength(2)
  expect(calls[1]![0]!.transform).toBe(`translate3d(${(40 / 440) * 100}%, 0, 0)`)
  expect(calls[1]!.at(-1)!.transform).toBe('translate3d(100%, 0, 0)')
  // Release observers are gone; idle offset ownership remains until the next native scrub.
  expect(listeners.size).toBe(1)
  releaseNativeScrubClamp(source)
  expect(listeners.size).toBe(0)
})

it('keeps a retired source unavailable until its momentum reset commits, including superseded releases', () => {
  const frames: FrameRequestCallback[] = []
  let now = 500
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.stubGlobal('window', {
    requestAnimationFrame: (cb: FrameRequestCallback) => {
      frames.push(cb)
      return frames.length
    },
    cancelAnimationFrame: (id: number) => {
      frames[id - 1] = () => {}
    },
  })
  const source = {
    ...scrubSourceFake(),
    scrollLeft: 700,
    clientWidth: 400,
  } as unknown as HTMLElement
  expect(nativeScrubSourceLiveAt(source, now)).toBe(true)
  const first = retireNativeScrubSource(source, 800)
  expectRetired(source, true)
  expect(source.scrollLeft).toBe(800)
  // A contact before re-arm commits is conservatively driven from touch input.
  expect(nativeScrubSourceLiveAt(source, now)).toBe(false)
  const second = retireNativeScrubSource(source, 800)
  expect(rearmNativeScrubSource(source, first)).toBe(false)
  expectRetired(source, true)
  now = 508
  frames.splice(0).forEach(frame => frame(now))
  expect(source.style.overflowX).toBe('hidden')
  expect(nativeScrubSourceLiveAt(source, now)).toBe(false)
  expect(rearmNativeScrubSource(source, second)).toBe(false)
  now = 524
  frames.splice(0).forEach(frame => frame(now))
  expectRetired(source, false)
  expect(rearmNativeScrubSource(source, second)).toBe(false)
  // The re-arm reaches the scrolling tree with the next rendering update.
  expect(nativeScrubSourceLiveAt(source, now + 1)).toBe(false)
  expect(nativeScrubSourceLiveAt(source, now + NATIVE_SCRUB_REARM_COMMIT_MS)).toBe(true)
})

it('clamps a retired source without changing content touch-action, then removes the clamp', () => {
  const source = { ...scrubSourceFake(), scrollLeft: 800 } as unknown as HTMLElement
  const token = retireNativeScrubSource(source, 800)
  const clamp = vi.mocked(source.addEventListener).mock.calls.at(-1)![1] as () => void
  source.scrollLeft = 720
  clamp()
  expect(source.scrollLeft).toBe(800)
  expect(source.style.touchAction).toBe('auto')
  rearmNativeScrubSource(source, token)
  source.scrollLeft = 720
  clamp()
  expect(source.scrollLeft).toBe(800)
  releaseNativeScrubClamp(source)
  expect(source.removeEventListener).toHaveBeenCalledWith('scroll', clamp)
})

it('keeps an idle clamp centred after source geometry changes', () => {
  const source = {
    ...scrubSourceFake(),
    scrollLeft: 800,
    clientWidth: 400,
  } as unknown as HTMLElement
  const token = retireNativeScrubSource(source, 800)
  rearmNativeScrubSource(source, token)
  const clamp = vi.mocked(source.addEventListener).mock.calls.at(-1)![1] as () => void
  Object.defineProperty(source, 'clientWidth', { value: 600 })
  source.scrollLeft = 790
  clamp()
  expect(source.scrollLeft).toBe(1200)
  releaseNativeScrubClamp(source)
})

it('hands the painted rear pose to a second pop without keeping a moving ancestor', () => {
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) })
  vi.stubGlobal('getComputedStyle', () => ({ transform: 'matrix(1,0,0,1,-32,0)' }))
  vi.stubGlobal(
    'DOMMatrixReadOnly',
    class {
      m41 = -32
    },
  )
  const rear = fakeElement()
  const front = fakeElement()
  const first = createAnimatedTransitionController(
    { finish: vi.fn(), cancel: vi.fn() },
    { interactive: true, operation: 'pop' },
  )
  const release = first.bind!({ direction: 'pop', primary: front, secondary: rear, width: 400 })
  first.setProgress!(0.6)
  const inherited = first.yieldForPop!()!
  const child = fakeElement()
  const second = createAnimatedTransitionController(
    { finish: vi.fn(), cancel: vi.fn() },
    { interactive: true, operation: 'pop' },
  )
  second.setProgress!(inherited)
  second.bind!({ direction: 'pop', primary: child, width: 400 })
  expect(child.style.transform).toBe('translate3d(-8%, 0, 0)')
  expect(rear.style.transform).toBe('')
  first.finish()
  release()
  expect(child.style.transform).toBe('translate3d(-8%, 0, 0)')
  expect(rear.style.transform).toBe('')
  second.setProgress!(inherited + 0.1)
  expect(parseFloat(child.style.transform.slice('translate3d('.length))).toBeCloseTo(2)
})

it('writes the instant endpoint underneath the scroll effect before retiring it', () => {
  vi.stubGlobal('window', {
    matchMedia: () => ({ matches: false }),
    ScrollTimeline: class {},
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: vi.fn(),
  })
  const front = fakeElement()
  let revealedPose: string | undefined
  front.animate = (() => ({
    cancel() {
      revealedPose = front.style.transform
    },
    effect: {},
    onfinish: null,
  })) as unknown as typeof front.animate
  const controller = createAnimatedTransitionController(
    { finish: vi.fn(), cancel: vi.fn() },
    { interactive: true, operation: 'pop' },
  )
  controller.bind!({ direction: 'pop', primary: front, width: 400 })
  const source = {
    ...scrubSourceFake(),
    scrollWidth: 2000,
    clientWidth: 400,
    scrollLeft: 800,
  } as unknown as HTMLElement
  controller.scrubFromScroll!(source, 800, 0)
  controller.completeInteractive!(0, 1)
  expect(revealedPose).toBe('translate3d(100%, 0, 0)')
  expect(front.style.transform).toBe('translate3d(100%, 0, 0)')
})

it('regrabs a cancelling page at its current visible position', () => {
  vi.stubGlobal('window', {
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: vi.fn(),
  })
  vi.stubGlobal('document', { timeline: { currentTime: 0 } })
  const front = fakeElement()
  front.animate = (() => ({
    cancel() {},
    effect: {},
    onfinish: null,
  })) as unknown as typeof front.animate
  const controller = createAnimatedTransitionController(
    { finish: vi.fn(), cancel: vi.fn() },
    { interactive: true, operation: 'pop' },
  )
  controller.bind!({ direction: 'pop', primary: front, width: 400 })
  controller.setProgress!(0.4)
  controller.cancelInteractive!(0, 0.4)
  vi.stubGlobal('getComputedStyle', () => ({ transform: 'matrix(1,0,0,1,48,0)' }))
  vi.stubGlobal(
    'DOMMatrixReadOnly',
    class {
      m41 = 48
    },
  )
  controller.resumeInteractive!()
  expect(front.style.transform).toBe('translate3d(12%, 0, 0)')
  controller.setProgress!(0.22)
  expect(front.style.transform).toBe('translate3d(22%, 0, 0)')
})
