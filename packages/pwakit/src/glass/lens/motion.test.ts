import { describe, expect, it } from 'vitest'
import {
  MOTION_SPEC,
  scriptedDragFrames,
  scriptedDragProgress,
  scriptedScrollOffset,
} from './motion.ts'

describe('measured-reference shared scripted motion', () => {
  it('holds during the shared capture delay and reaches the exact flick offset', () => {
    expect(scriptedScrollOffset('flick', MOTION_SPEC.delayMs - 1)).toBe(0)
    expect(scriptedScrollOffset('flick', MOTION_SPEC.delayMs + MOTION_SPEC.durationMs)).toBeCloseTo(
      MOTION_SPEC.flickTravelPt,
      8,
    )
  })

  it('runs the constant mode at exactly 300 points per second', () => {
    expect(MOTION_SPEC.constantVelocityPtPerSecond).toBe(300)
    expect(scriptedScrollOffset('constant', MOTION_SPEC.delayMs + 500)).toBe(150)
  })

  it('clamps both modes after the shared 1.2 second interval', () => {
    expect(scriptedScrollOffset('constant', Number.POSITIVE_INFINITY)).toBe(360)
    expect(scriptedScrollOffset('flick', Number.POSITIVE_INFINITY)).toBeCloseTo(720, 8)
  })

  it('matches the native scripted drag path in physical screen coordinates', () => {
    expect(scriptedDragProgress(MOTION_SPEC.delayMs - 1)).toBe(0)
    expect(scriptedDragProgress(MOTION_SPEC.delayMs + MOTION_SPEC.dragDurationMs / 2)).toBe(0.5)
    expect(scriptedDragProgress(Number.POSITIVE_INFINITY)).toBe(1)
    expect(scriptedDragFrames(0, 62)).toEqual({
      capsule: { height: 120, width: 300, x: 51, y: 542 },
      circle: { height: 160, width: 160, x: 16, y: 92 },
    })
    expect(scriptedDragFrames(1, 62)).toEqual({
      capsule: { height: 120, width: 300, x: 51, y: 102 },
      circle: { height: 160, width: 160, x: 226, y: 492 },
    })
  })
})
