import { expect, it } from 'vitest'
import { PadSearchBarMotion, PAD_SEARCH_BAR_TRAVEL } from './padSearchBarMotion.ts'

it('matches the original video onset, including the samples missing from CADisplayLink', () => {
  const motion = new PadSearchBarMotion()
  motion.retarget(1, 0)
  // reference source PTS minus fitted onset 12.42402776 seconds; tracking error <= .215 pt.
  for (const [time, travel] of [
    [8.47224, 0.64],
    [25.15524, 4.69333],
    [41.82224, 11.09333],
    [58.50524, 17.92],
    [75.18924, 24.96],
    [91.85524, 31.36],
    [108.53924, 37.12],
  ]) {
    expect(Math.abs(motion.sample(time).value * PAD_SEARCH_BAR_TRAVEL - travel)).toBeLessThan(0.3)
  }
})
it('retargets a partially hidden bar without a position or velocity jump', () => {
  const motion = new PadSearchBarMotion()
  motion.retarget(1, 0)
  const before = motion.sample(100)
  motion.retarget(0, 100)
  expect(motion.sample(100)).toEqual(before)
  expect(motion.sample(1200).value).toBeCloseTo(0, 5)
  expect(motion.sample(1200).velocity).toBeCloseTo(0, 4)
})
it('uses the measured return rather than reversing activation samples', () => {
  const motion = new PadSearchBarMotion()
  motion.retarget(1, 0)
  motion.retarget(0, 2000)
  // Native reference bar y=-30.435 at 13.418 ms after the fitted return onset.
  expect(Math.abs(64 * (1 - motion.sample(2013.418).value) - 1.565)).toBeLessThan(0.2)
})
