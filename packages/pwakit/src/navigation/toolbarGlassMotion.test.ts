// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { ToolbarGlassMotion, toolbarShapeFrames, toolbarTrackValue } from './toolbarGlassMotion.ts'
import { NAVIGATION_CHROME_CURVES, chromeDissolve } from './chromeCurves.ts'
import { glassShapeTrack } from '../glass/shapeTrackRegistry.ts'
import { shapeTrackFrame } from '../glass/shapeTrack.ts'
import { menuTriggerReturnGeometry } from '../glass/menuTriggerGeometry.ts'
import { sampleNavigationCurve } from './motionTokens.ts'

vi.mock('./toolbarMotionOwner.ts', () => ({
  toolbarMotionAnimation: (element: HTMLElement | undefined, property: string) =>
    element
      ?.getAnimations?.()
      .find(animation =>
        (animation.effect as KeyframeEffect)
          .getKeyframes()
          .some(frame => frame[property] !== undefined),
      ),
}))
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('returns a menu to the current aperture rather than the stationary canvas envelope', () => {
  const { owner, source, motion, input } = setup()
  const header = document.createElement('header')
  header.setAttribute('data-satin-navigation-chrome', 'true')
  owner.setAttribute('data-satin-toolbar-glass', 'trailing')
  owner.setAttribute('data-satin-toolbar-glass-item', '0')
  owner.style.borderRadius = '22px'
  input.slot.setAttribute('data-satin-navigation-toolbar-slot', 'trailing')
  const anchor = document.createElement('span')
  const button = document.createElement('button')
  button.setAttribute('data-satin-glass-slot-content', 'true')
  anchor.append(button)
  input.slot.append(anchor)
  header.append(owner, input.slot)
  document.body.append(header)
  vi.spyOn(owner, 'getBoundingClientRect').mockImplementation(
    () =>
      new DOMRect(
        parseFloat(owner.style.left),
        parseFloat(owner.style.top),
        parseFloat(owner.style.width),
        parseFloat(owner.style.height),
      ),
  )
  try {
    motion.update(input)
    source.currentTime = 120
    const track = glassShapeTrack(owner)!
    const aperture = shapeTrackFrame(track, track.epoch + 120)
    const returned = menuTriggerReturnGeometry(
      anchor,
      { x: 0, y: 0, width: 440, height: 956 },
      track.epoch + 120,
    )!
    expect(returned.width - aperture.width).toBe(0)
  } finally {
    motion.clear()
    header.remove()
  }
})

const from = { x: 360, y: 66, width: 40, height: 44 }
const to = { x: 280, y: 66, width: 120, height: 44 }

it.each(Object.entries(NAVIGATION_CHROME_CURVES))(
  '%s preserves every half-millisecond of the old geometry curve',
  (_, curve) => {
    const duration = curve.at(-1)![0]
    const knots = curve.map(([time, value]) => ({ offset: time / duration, value }))
    const track = {
      epoch: 0,
      duration,
      frames: toolbarShapeFrames(from, to, knots, duration, true, 0),
    }
    let maxError = 0
    for (let time = 0; time <= duration; time += 0.5) {
      const right = curve.findIndex(([at]) => at >= time)
      const a = curve[Math.max(0, right - 1)]!
      const b = curve[right]!
      const progress = a === b ? a[1] : a[1] + ((b[1] - a[1]) * (time - a[0])) / (b[0] - a[0])
      const actual = shapeTrackFrame(track, time)
      for (const key of ['x', 'y', 'width', 'height'] as const)
        maxError = Math.max(
          maxError,
          Math.abs(actual[key] - (from[key] + (to[key] - from[key]) * progress)),
        )
    }
    expect(maxError).toBeLessThan(0.000001)
  },
)

it('keeps a merged run centred while its members scale, without scaling its padding', () => {
  const opacity = [
    { offset: 0, value: 0 },
    { offset: 1, value: 1 },
  ]
  const scale = [
    { offset: 0, value: 1.2 },
    { offset: 1, value: 1 },
  ]
  const frames = toolbarShapeFrames(from, to, opacity, 240, false, 4, scale)
  expect(frames[0]!.width).toBeCloseTo(142.4)
  expect(frames[0]!.x + frames[0]!.width / 2).toBe(340)
  expect(frames.at(-1)).toEqual(to)
})

function setup() {
  const owner = document.createElement('div')
  const slot = document.createElement('div')
  const content = document.createElement('div')
  const duration = 240
  const keyframes = NAVIGATION_CHROME_CURVES.pushToolbarAppear.map(([time, opacity]) => ({
    computedOffset: time / duration,
    ...chromeDissolve(opacity),
  }))
  const source = {
    startTime: 100,
    currentTime: 80,
    playState: 'running',
    playbackRate: 1,
    effect: { getTiming: () => ({ duration }), getKeyframes: () => keyframes },
  }
  Object.assign(slot, { getAnimations: () => [source] })
  Object.assign(content, { getAnimations: () => [] })
  const fade = { cancel: vi.fn(), pause: vi.fn(), startTime: null, currentTime: null }
  const animate = vi.fn(() => fade)
  Object.assign(owner, { animate })
  const motion = new ToolbarGlassMotion(owner)
  const input = { slot, content, from, to, morph: true, padding: 0, hidden: false }
  return { owner, slot, source, fade, animate, motion, input }
}

it('publishes one fixed envelope and shares the original chrome epoch, including late mounts', () => {
  const { owner, source, motion, input } = setup()
  expect(motion.update(input)).toBe(true)
  const track = glassShapeTrack(owner)!
  expect(track.epoch).toBe(performance.timeOrigin + source.startTime)
  expect(owner.style.left).toBe('280px')
  expect(owner.style.width).toBe('120px')
  const initialStyle = owner.getAttribute('style')
  for (let at = 81; at < 240; at++) {
    source.currentTime = at
    motion.update(input)
    expect(glassShapeTrack(owner)).toBe(track)
    expect(owner.getAttribute('style')).toBe(initialStyle)
  }
  motion.clear()
  expect(glassShapeTrack(owner)).toBeUndefined()
})

it('holds paused preparation and adopts its start time without a second clock', () => {
  const { owner, source, motion, input } = setup()
  source.playState = 'paused'
  source.currentTime = 0
  motion.update(input)
  expect(glassShapeTrack(owner)!.epoch).toBe(Number.MAX_VALUE)
  source.playState = 'running'
  source.startTime = 900
  motion.update(input)
  expect(glassShapeTrack(owner)!.epoch).toBe(performance.timeOrigin + 900)
  motion.clear()
})

it('copies one-sided fades and cancels them when the source disappears', () => {
  const { owner, slot, source, fade, animate, motion, input } = setup()
  motion.update({ ...input, morph: false })
  expect(animate).toHaveBeenCalledOnce()
  expect(fade.startTime).toBe(source.startTime)
  motion.update({ ...input, morph: false })
  expect(animate).toHaveBeenCalledOnce()
  Object.assign(slot, { getAnimations: () => [] })
  expect(motion.update(input)).toBe(false)
  expect(fade.cancel).toHaveBeenCalledOnce()
  expect(glassShapeTrack(owner)).toBeUndefined()
})

it('retains an interrupted opacity origin rather than resetting the measured curve', () => {
  const knots = [
    { offset: 0, value: 0.43 },
    { offset: 1, value: 1 },
  ]
  expect(toolbarTrackValue(knots, 0)).toBe(0.43)
  expect(toolbarShapeFrames(from, to, knots, 240, true, 0)[0]!.width).toBeCloseTo(74.4)
})

it('follows the principal pixel translation on the page navigation curve', () => {
  const { owner, source, motion, input, animate } = setup()
  vi.stubGlobal(
    'DOMMatrixReadOnly',
    class {
      m41: number
      m42 = 0
      constructor(transform: string) {
        this.m41 = Number(transform.match(/translate3d\(([-.\d]+)/)?.[1] ?? 0)
      }
    },
  )
  const duration = 352
  source.effect = {
    getTiming: () => ({ duration, easing: 'cubic-bezier(0.21,0.71,0.3,1)' }),
    getKeyframes: () => [
      { computedOffset: 0, transform: 'translate3d(0px, 0, 0)' },
      { computedOffset: 1, transform: 'translate3d(440px, 0, 0)' },
    ],
  } as unknown as typeof source.effect
  source.currentTime = 80
  const position = sampleNavigationCurve(80 / duration) * 440
  motion.update({ ...input, morph: false, to: { ...to, x: to.x + position } })
  const track = glassShapeTrack(owner)!
  expect(animate).not.toHaveBeenCalled()
  for (let time = 0; time <= duration; time += 0.5) {
    const frame = shapeTrackFrame(track, track.epoch + time)
    expect(
      Math.abs(
        parseFloat(owner.style.left) +
          frame.x -
          (to.x + sampleNavigationCurve(time / duration) * 440),
      ),
    ).toBeLessThan(0.01)
    expect(frame.width).toBe(to.width)
  }
  motion.clear()
})
