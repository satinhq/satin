// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { settleSwipe, swipeRelease, swipeClose, swipeReleasePosition } from './motion.ts'
import { updateRowCorners } from './rowScrub.ts'
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

it('follows the physical iPad opening and overdamped closing samples', () => {
  // Counter-retimed native A, row translation in points, 300 ms after fit onset.
  expect(
    Math.abs(swipeReleasePosition(181.8667, 287.2889, 252.7117, 0.3, swipeRelease) - 276.44),
  ).toBeLessThan(2)

  expect(swipeReleasePosition(96.5333, 0, -422.8257, 0.3, swipeClose)).toBeGreaterThan(11.62)
  expect(swipeReleasePosition(96.5333, 0, -422.8257, 0.3, swipeClose)).toBeLessThan(13.62)
  expect(swipeReleasePosition(96.5333, 0, -422.8257, 0.75, swipeClose)).toBeGreaterThanOrEqual(0)
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
