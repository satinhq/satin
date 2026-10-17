import { expect, it } from 'vitest'
import { sampledMotionState, sampledMotionTrack } from './springTrack.ts'
import { sheetDetentPosition, sheetKeyboardPosition, sheetReleasePosition } from '../presentation/motion.ts'

it.each([[320, 894], [894, 320], [500, 700]])('preserves measured detent and keyboard fits %s -> %s', (from, to) => {
  for (const fit of [sheetDetentPosition, sheetKeyboardPosition]) {
    const track = sampledMotionTrack(700, ms => fit(from, to, ms / 1000))
    expect(track.duration).toBe(700)
    for (let ms = 0; ms <= 700; ms++)
      expect(Math.abs(sampledMotionState(track, ms).value - fit(from, to, ms / 1000))).toBeLessThanOrEqual(0.2)
  }
})

it.each([-4000, -1000, 0, 1000, 4000])('preserves velocity-bearing release fits at %s pt/s', velocity => {
  for (const phase of ['dismiss', 'return', 'expand', 'collapse'] as const) {
    const fit = (ms: number) => sheetReleasePosition(650, 320, velocity, ms / 1000, phase)
    const track = sampledMotionTrack(700, fit)
    for (let ms = 0; ms <= 700; ms++)
      expect(Math.abs(sampledMotionState(track, ms).value - fit(ms))).toBeLessThanOrEqual(0.2)
  }
})

it('returns the submitted segment velocity for an interrupted run', () => {
  const track = { duration: 100, values: [0, 10, 15] }
  expect(sampledMotionState(track, 25)).toEqual({ value: 5, velocity: 200 })
  expect(sampledMotionState(track, 75)).toEqual({ value: 12.5, velocity: 100 })
  expect(sampledMotionState(track, 100)).toEqual({ value: 15, velocity: 0 })
  expect(sampledMotionState(track, -1)).toEqual({ value: 0, velocity: 0 })
})

it('rejects invalid samples and budgets before submitting a track', () => {
  expect(() => sampledMotionTrack(0, () => 0)).toThrow()
  expect(() => sampledMotionTrack(700, () => NaN)).toThrow()
  expect(() => sampledMotionTrack(700, () => 0, Infinity)).toThrow()
})
