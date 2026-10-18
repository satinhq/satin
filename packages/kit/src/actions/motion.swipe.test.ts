// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import {
  advanceCommittedSwipe,
  settleSwipe,
  swipeRelease,
  swipeClose,
  swipeReleasePosition,
} from './motion.ts'
import { updateRowCorners } from './rowScrub.ts'
import releaseCalibration from './swipe-release-calibration.json'
afterEach(() => vi.unstubAllGlobals())
it('resizes the released row clip without restarting its translation or clock', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  class Effect {
    frames: Keyframe[] = []
    setKeyframes(frames: Keyframe[]) {
      this.frames = frames
    }
  }
  vi.stubGlobal('KeyframeEffect', Effect)
  const effect = new Effect()
  const animation = {
    effect,
    currentTime: 270,
    playState: 'running',
    finished: new Promise(() => {}),
  } as unknown as Animation
  const row = document.createElement('div')
  row.getAnimations = () => []
  row.animate = frames => {
    effect.setKeyframes(frames as Keyframe[])
    return animation
  }
  updateRowCorners(row, 400, 52)
  settleSwipe(row, -120, -160, 0)
  const translations = effect.frames.map(frame => frame.transform)
  const oldClip = effect.frames.at(-1)?.clipPath
  updateRowCorners(row, 400, 100)
  expect(effect.frames.at(-1)?.clipPath).not.toBe(oldClip)
  expect(effect.frames.at(-1)?.clipPath).toContain(' 100')
  expect(effect.frames.map(frame => frame.transform)).toEqual(translations)
  expect(animation.currentTime).toBe(270)
})
it('keeps the pill attached to the row through every rubber-band spring sample', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  const row = document.createElement('div')
  const pill = document.createElement('button')
  const end = document.createElement('span')
  end.dataset.satinSwipeFill = 'end'
  pill.append(end)
  const rowAnimate = vi.fn()
  const pillAnimate = vi.fn()
  row.getAnimations = () => []
  pill.getAnimations = () => []
  row.animate = rowAnimate
  end.animate = pillAnimate
  settleSwipe(row, -129, -80, 0, pill, 80)
  const rowFrames = rowAnimate.mock.calls[0]![0] as Keyframe[]
  const pillFrames = pillAnimate.mock.calls[0]![0] as Keyframe[]
  // Full swipe is disabled for this release: the pill scales with the tray;
  // its end must not stretch independently of the other actions.
  expect(pillFrames.every(frame => frame.transform === 'translate3d(0px,0,0)')).toBe(true)
  expect(pillFrames.map(frame => frame.offset)).toEqual(rowFrames.map(frame => frame.offset))
  expect(pillFrames.every(frame => !('width' in frame) && !('height' in frame))).toBe(true)
  expect(pillAnimate.mock.calls[0]![1]).toEqual(rowAnimate.mock.calls[0]![1])
})

it('evaluates the historical physical iPad opening and overdamped closing fits', () => {
  // Counter-retimed native A, row translation in points, 300 ms after fit onset.
  // Retain this solver regression; current runtime poles use the newer r23/r28
  // repeated, same-fixture calibration below rather than these historical fits.
  const historicalOpen = { stiffness: 121.34922937441745, damping: 20.028579580094434 }
  const historicalClose = { stiffness: 111.42158149810808, damping: 21.893283929309167 }
  expect(
    Math.abs(swipeReleasePosition(181.8667, 287.2889, 252.7117, 0.3, historicalOpen) - 276.44),
  ).toBeLessThan(2)

  expect(swipeReleasePosition(96.5333, 0, -422.8257, 0.3, historicalClose)).toBeGreaterThan(11.62)
  expect(swipeReleasePosition(96.5333, 0, -422.8257, 0.3, historicalClose)).toBeLessThan(13.62)
  expect(swipeReleasePosition(96.5333, 0, -422.8257, 0.75, historicalClose)).toBeGreaterThanOrEqual(
    0,
  )
})

it('fits every repeated native row-release calibration sample within one point', () => {
  for (const curve of releaseCalibration.cases) {
    const fit = curve.target === 20 ? swipeClose : swipeRelease
    // Free initial coefficients identify poles, not delivered release velocity.
    // Runtime timing and input carry still require the physical pixel gate.
    for (const [seconds, position] of curve.samples) {
      const predicted = swipeReleasePosition(
        curve.extrapolatedFrom,
        curve.target,
        curve.extrapolatedVelocity,
        seconds!,
        fit,
      )
      expect(Math.abs(predicted - position!)).toBeLessThanOrEqual(1)
    }
  }
})

it('reverses takeover from the presented position and velocity without a jump', async () => {
  const { takeoverSample } = await import('./swipeSpring.ts')
  const entering = takeoverSample(0, 1, 0, 0.04)
  expect(entering.position).toBeGreaterThan(0.6)
  expect(entering.position).toBeLessThan(0.8)
  const reversed = takeoverSample(entering.position, 0, entering.velocity, 0)
  expect(reversed.position).toBeCloseTo(entering.position, 10)
  expect(reversed.velocity).toBeCloseTo(entering.velocity, 10)
  expect(takeoverSample(entering.position, 0, entering.velocity, 0.2).position).toBeLessThan(0.001)
})

it('returns a committed surviving row without flashing its secondary action', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  vi.stubGlobal(
    'DOMMatrixReadOnly',
    class {
      a: number
      constructor(transform: string) {
        this.a = Number(transform.match(/matrix\(([^,]+)/)?.[1] ?? 1)
      }
    },
  )
  const host = document.createElement('div')
  host.dataset.satinRowActions = 'true'
  const tray = document.createElement('div')
  tray.dataset.satinSwipeTray = 'leading'
  const primary = document.createElement('button')
  const secondary = document.createElement('button')
  for (const button of [primary, secondary]) {
    button.dataset.satinSwipeAction = 'true'
    button.style.width = '60px'
    button.getAnimations = () => []
    button.animate = vi.fn()
    tray.append(button)
  }
  const middle = document.createElement('span')
  middle.dataset.satinSwipeFill = 'middle'
  middle.style.transform = 'matrix(12.25, 0, 0, 1, 0, 0)'
  const end = document.createElement('span')
  end.dataset.satinSwipeFill = 'end'
  end.dataset.satinSwipeDirection = 'leading'
  end.animate = vi.fn()
  primary.append(middle, end)
  const row = document.createElement('div')
  row.getAnimations = () => []
  row.animate = vi.fn()
  host.append(tray, row)
  document.body.append(host)
  try {
    // At release the primary spans 240pt and completely hides the second pill.
    settleSwipe(row, 260, 0, 0, primary, 150, true, 440, true)
    const secondaryFrames = vi.mocked(secondary.animate).mock.calls[0]![0] as Keyframe[]
    const endFrames = vi.mocked(end.animate).mock.calls[0]![0] as Keyframe[]
    expect(secondaryFrames[0]!.opacity).toBe(0)
    expect(Number(secondaryFrames[1]!.opacity)).toBeLessThan(0.1)
    expect(endFrames[0]!.transform).toBe('translate3d(180px,0,0)')
    expect(endFrames.at(-1)!.transform).toBe('translate3d(0px,0,0)')
  } finally {
    host.remove()
  }
})

it('returns a committed takeover pill to its resting button with the row, on the tap-close clock', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  vi.stubGlobal('performance', { now: () => 110 })
  vi.stubGlobal(
    'DOMMatrixReadOnly',
    class {
      a: number
      constructor(transform: string) {
        this.a = Number(transform.match(/matrix\(([^,]+)/)?.[1] ?? 1)
      }
    },
  )
  type Capture = {
    frames: Keyframe[]
    timing: KeyframeAnimationOptions
    animation: { startTime: number | null }
  }
  const captures = new Map<Element, Capture>()
  const record = (element: HTMLElement) => {
    element.getAnimations = () => []
    element.animate = (frames, timing) => {
      const animation = { startTime: null, finished: new Promise<void>(() => {}) }
      captures.set(element, {
        frames: frames as Keyframe[],
        timing: timing as KeyframeAnimationOptions,
        animation,
      })
      return animation as unknown as Animation
    }
  }
  const host = document.createElement('div')
  host.dataset.satinRowActions = 'true'
  const tray = document.createElement('div')
  tray.dataset.satinSwipeTray = 'leading'
  const primary = document.createElement('button')
  const secondary = document.createElement('button')
  for (const button of [primary, secondary]) {
    button.dataset.satinSwipeAction = 'true'
    button.style.width = '60px'
    record(button)
    tray.append(button)
  }
  // Released at 260pt: the primary has grown 180pt and spans the takeover.
  const middle = document.createElement('span')
  middle.dataset.satinSwipeFill = 'middle'
  middle.style.transform = 'matrix(12.25, 0, 0, 1, 0, 0)'
  const end = document.createElement('span')
  end.dataset.satinSwipeFill = 'end'
  end.dataset.satinSwipeDirection = 'leading'
  record(end)
  primary.append(middle, end)
  const row = document.createElement('div')
  record(row)
  host.append(tray, row)
  document.body.append(host)
  try {
    settleSwipe(row, 260, 0, 0, primary, 150, true, 440, true, { time: 100, kind: 'commit' })
    const rowFrames = captures.get(row)!.frames
    const buttonFrames = captures.get(primary)!.frames
    const endFrames = captures.get(end)!.frames
    const number = (text: unknown, pattern: RegExp) => Number(String(text).match(pattern)?.[1])
    for (const element of [row, primary, end, secondary]) {
      // Native holds the takeover pose until the tap-close onset after lift-off.
      expect(captures.get(element)!.animation.startTime).toBeCloseTo(136.275)
      expect(captures.get(element)!.timing.fill).toBe('backwards')
    }
    expect(buttonFrames[0]).toMatchObject({
      opacity: 1,
      transform: 'translate3d(0px,0,0) scale(1)',
    })
    expect(endFrames[0]!.transform).toBe('translate3d(180px,0,0)')
    for (const [index, frame] of buttonFrames.entries()) {
      const progress = number(rowFrames[index]!.transform, /translate3d\(([^p]+)px/) / 260
      const scale = number(frame.transform, /scale\(([^)]+)\)/)
      // The button fades with the row and its frame shrinks back in step with it.
      expect(Number(frame.opacity)).toBeCloseTo(progress, 6)
      expect(number(endFrames[index]!.transform, /translate3d\(([^p]+)px/)).toBeCloseTo(
        180 * progress,
        6,
      )
      // Its capsule scales about the centre of that frame, not the resting button.
      const shift = number(frame.transform, /translate3d\(([^p]+)px/)
      expect(shift).toBeCloseTo(90 * progress * (1 - scale), 6)
    }
    // The tap-close capsule spring (iPad o1: 0.561 at 100ms after onset).
    const tenth = buttonFrames.findIndex(frame => Number(frame.offset) * 750 >= 100)
    expect(number(buttonFrames[tenth]!.transform, /scale\(([^)]+)\)/)).toBeCloseTo(0.57, 1)
    expect(buttonFrames.at(-1)).toMatchObject({ opacity: 0 })
    expect(buttonFrames.at(-1)!.transform).toContain('scale(0)')
    expect(captures.get(secondary)!.frames.every(frame => frame.opacity === 0)).toBe(true)
  } finally {
    host.remove()
  }
})

it('closes a resting capsule with signed scale overshoot and a monotone opacity fade', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  const host = document.createElement('div')
  host.dataset.satinRowActions = 'true'
  host.dataset.satinSwipeLabelLayout = 'inline'
  host.innerHTML =
    '<div data-satin-row-action-content></div><div data-satin-swipe-tray="trailing"><button data-satin-swipe-action style="width:85px"></button><button data-satin-swipe-action style="width:85px"></button></div>'
  document.body.append(host)
  const row = host.firstElementChild as HTMLElement
  const pills = [...host.querySelectorAll<HTMLButtonElement>('button')]
  row.getAnimations = () => []
  row.animate = vi.fn()
  for (const pill of pills) {
    pill.getAnimations = () => []
    pill.animate = vi.fn()
  }
  settleSwipe(row, -200, 0, 0, pills[0], 200, true, 984)
  for (const pill of pills) {
    const frames = vi.mocked(pill.animate).mock.calls[0]![0] as Keyframe[]
    const scales = frames.map(frame =>
      Number(String(frame.transform).match(/scale\(([^)]+)\)/)![1]),
    )
    expect(scales[0]).toBe(1)
    expect(scales.at(-1)).toBe(0)
    // Native r28 capsule scale crosses zero, unlike its opacity and the row.
    expect(Math.min(...scales)).toBeLessThan(-0.03)
    expect(Math.min(...scales)).toBeGreaterThan(-0.06)
    expect(
      frames.every(
        (frame, index) =>
          index === 0 || Number(frame.opacity) <= Number(frames[index - 1]!.opacity),
      ),
    ).toBe(true)
    for (const frame of frames) {
      const translation = Number(String(frame.transform).match(/translate3d\(([^p]+)px/)![1])
      expect(Math.abs(translation)).toBeLessThan(0.000001)
    }
  }
  host.remove()
})

it('starts every tap-close track on the same measured input clock and holds its first pose before onset', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  vi.stubGlobal('performance', { now: () => 110 })
  const row = document.createElement('div'),
    pill = document.createElement('button')
  pill.dataset.satinSwipeAction = 'true'
  const animations: Array<{ startTime: number | null; finished: Promise<void> }> = []
  const options: KeyframeAnimationOptions[] = []
  for (const element of [row, pill]) {
    element.getAnimations = () => []
    element.animate = (_frames, timing) => {
      const animation = { startTime: null, finished: new Promise<void>(() => {}) }
      animations.push(animation)
      options.push(timing as KeyframeAnimationOptions)
      return animation as unknown as Animation
    }
  }
  settleSwipe(row, -80, 0, 0, pill, 80, true, 984, false, { time: 100, kind: 'tap' })
  expect(animations.length).toBe(2)
  for (const animation of animations) expect(animation.startTime).toBeCloseTo(136.275)
  expect(options.every(timing => timing.fill === 'backwards')).toBe(true)
})

it('starts a release from a held finger at the measured onset, and a moving release at once', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  const row = document.createElement('div')
  const timings: Array<{ startTime: number | null; fill?: FillMode }> = []
  row.getAnimations = () => []
  row.animate = (_frames, timing) => {
    const animation = { startTime: null, fill: (timing as KeyframeAnimationOptions).fill }
    timings.push(animation)
    return animation as unknown as Animation
  }
  // iPad o1 slow two-line: held at -115pt, lifted at 100ms, released open to -80pt.
  settleSwipe(row, -115, -80, 0, undefined, 80, false, 984, false, { time: 100, kind: 'drag' })
  expect(timings[0]!.startTime).toBeCloseTo(136.275)
  expect(timings[0]!.fill).toBe('backwards')
  settleSwipe(row, -115, -80, -400, undefined, 80, false, 984, false, { time: 100, kind: 'drag' })
  expect(timings[1]!.startTime).toBeNull()
})

it('does not reset a partially dragged tray to full capsule scale or add the tap onset', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  const row = document.createElement('div'),
    pill = document.createElement('button')
  pill.dataset.satinSwipeAction = 'true'
  const captures: Array<{ frames: Keyframe[]; timing: KeyframeAnimationOptions }> = []
  for (const element of [row, pill]) {
    element.getAnimations = () => []
    element.animate = (frames, timing) => {
      captures.push({ frames: frames as Keyframe[], timing: timing as KeyframeAnimationOptions })
      return undefined as unknown as Animation
    }
  }
  settleSwipe(row, -40, 0, 0, pill, 80, true, 984)
  expect(captures).toHaveLength(2)
  expect(captures[1]!.frames[0]!.transform).toContain('scale(0.5)')
  expect(captures.every(capture => capture.timing.fill !== 'backwards')).toBe(true)
})

it('advances every departing action part with its row and preserves the caught icon anchor', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  vi.stubGlobal(
    'DOMMatrixReadOnly',
    class {
      a: number
      m41: number
      constructor(transform: string) {
        const values = transform
          .match(/matrix\(([^)]+)\)/)?.[1]
          ?.split(',')
          .map(Number)
        this.a = values?.[0] ?? 1
        this.m41 = values?.[4] ?? 0
      }
    },
  )
  const host = document.createElement('div')
  host.dataset.satinRowActions = 'true'
  host.dataset.satinSwipeLabelLayout = 'inline'
  host.innerHTML =
    '<div data-satin-row-action-content></div><div data-satin-swipe-tray="trailing"><button data-satin-swipe-action data-satin-swipe-role="destructive" style="width:84px"><span data-satin-swipe-fill="middle" style="transform:matrix(6,0,0,1,0,0)"></span><span data-satin-swipe-fill="start" data-satin-swipe-direction="trailing"></span><span data-satin-swipe-label data-satin-swipe-direction="trailing" style="transform:matrix(1,0,0,1,-150,0)"></span></button><button data-satin-swipe-action style="width:84px"></button></div>'
  document.body.append(host)
  const row = host.firstElementChild as HTMLElement
  const primary = host.querySelector<HTMLButtonElement>('button')!
  const parts = [row, ...host.querySelectorAll<HTMLElement>('button, span')]
  const captures = new Map<
    HTMLElement,
    { frames: Keyframe[]; timing: unknown; animation: Animation }
  >()
  for (const part of parts) {
    part.getAnimations = () => []
    part.animate = (frames, timing) => {
      const animation = { startTime: null } as Animation
      captures.set(part, { frames: frames as Keyframe[], timing, animation })
      return animation
    }
  }
  try {
    // Open width 198, growth 200, caught anchor 0.5: release must retain -150.
    advanceCommittedSwipe(row, -398, 984, primary)
    expect(captures.size).toBe(parts.length)
    const rowCapture = captures.get(row)!
    for (const capture of captures.values()) {
      expect(capture.frames.map(f => f.offset)).toEqual(rowCapture.frames.map(f => f.offset))
      expect(capture.timing).toEqual(rowCapture.timing)
      expect(capture.animation.startTime).toBe(rowCapture.animation.startTime)
    }
    const label = primary.querySelector<HTMLElement>('[data-satin-swipe-label]')!
    const start = primary.querySelector<HTMLElement>('[data-satin-swipe-fill="start"]')!
    expect(captures.get(label)!.frames[0]!.transform).toBe('translate3d(-150px,0,0)')
    expect(captures.get(label)!.frames.at(-1)!.transform).toBe('translate3d(-786px,0,0)')
    expect(captures.get(start)!.frames[0]!.transform).not.toBe(
      captures.get(start)!.frames.at(-1)!.transform,
    )
  } finally {
    host.remove()
  }
})
