import { describe, expect, it } from 'vitest'
import {
  NAVIGATION_CURRENT_SEGMENT_WEIGHT,
  NAVIGATION_PREVIOUS_SEGMENT_WEIGHT,
  createReleaseVelocityTracker,
} from './releaseVelocity.ts'

describe('interactive release velocity', () => {
  it('uses the two most recent movement segments instead of gesture lifetime', () => {
    const tracker = createReleaseVelocityTracker()
    tracker.record(0, 0)
    tracker.record(10, 400)
    tracker.record(20, 900)
    tracker.record(40, 950)
    expect(tracker.record(60, 1_000)).toBeCloseTo(400, 6)
    expect(NAVIGATION_CURRENT_SEGMENT_WEIGHT).toBe(0.2)
    expect(NAVIGATION_PREVIOUS_SEGMENT_WEIGHT).toBe(0.8)
  })

  it('replays the measured native accelerating release segment', () => {
    const tracker = createReleaseVelocityTracker()
    tracker.record(111.66666666666666, 0)
    tracker.record(146.66666666666666, 24.20866664)
    expect(tracker.record(186.33333333333331, 48.37354164)).toBeCloseTo(1484.91078, 3)
  })

  it('uses the final segment when delivery is sparser than the window', () => {
    const tracker = createReleaseVelocityTracker()
    tracker.record(320, 1_000)
    expect(tracker.record(400, 1_250)).toBeCloseTo(320, 6)
  })

  it('does not treat a repeated touchend coordinate as a stationary movement', () => {
    const tracker = createReleaseVelocityTracker()
    tracker.record(0, 0)
    tracker.record(40, 50)
    tracker.record(80, 100)
    expect(tracker.release(115)).toBeCloseTo(800, 6)
    expect(tracker.release(400)).toBeCloseTo(800, 6)
  })
})
