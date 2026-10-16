import { describe, expect, it } from 'vitest'
import {
  ACCESSORY_PROFILES,
  accessoryRunDuration,
  RESTING_ACCESSORY_VELOCITY,
  sampleAccessory,
  type AccessoryRun,
} from './tabAccessoryMotion.ts'

// Native edges relative to the 398 pt bottom chrome (iPhone 17 Pro Max): expanded row above the
// bar, inline row beside the 48 pt circle.
const EXPANDED = { left: 0, right: 0, bottom: 62 + 56 - 48 }
const INLINE = { left: 68, right: 7, bottom: 7 }

describe('bottom accessory motion', () => {
  it('collapses with native axis order and settles on the inline row', () => {
    const run: AccessoryRun = {
      from: EXPANDED,
      to: INLINE,
      velocity: RESTING_ACCESSORY_VELOCITY,
      profile: ACCESSORY_PROFILES.collapse,
    }
    // Native slides toward the circle first; the drop into the bar's row starts 53 ms later.
    const early = sampleAccessory(run, 40).value
    expect(early.left).toBeGreaterThan(EXPANDED.left + 5)
    expect(early.bottom).toBe(EXPANDED.bottom)
    // An ease-out spring: no instant flip, a small overshoot, then the exact target.
    const peak = Math.max(...[150, 200, 250, 300].map(ms => sampleAccessory(run, ms).value.left))
    expect(peak).toBeGreaterThan(INLINE.left)
    expect(peak).toBeLessThan(INLINE.left + 5)
    const end = sampleAccessory(run, accessoryRunDuration(run)).value
    expect(end.left).toBeCloseTo(INLINE.left, 1)
    expect(end.bottom).toBeCloseTo(INLINE.bottom, 1)
  })

  it('reverses mid-collapse from the presented position and velocity', () => {
    const collapse: AccessoryRun = {
      from: EXPANDED,
      to: INLINE,
      velocity: RESTING_ACCESSORY_VELOCITY,
      profile: ACCESSORY_PROFILES.collapse,
    }
    const presented = sampleAccessory(collapse, 120)
    const restore: AccessoryRun = {
      from: presented.value,
      to: EXPANDED,
      velocity: presented.velocity,
      profile: ACCESSORY_PROFILES.restore,
    }
    const first = sampleAccessory(restore, 0)
    expect(first.value).toEqual(presented.value)
    expect(first.velocity.left).toBeCloseTo(presented.velocity.left, 6)
    // Still moving toward the circle for a moment: momentum is kept, not reset to an endpoint.
    expect(sampleAccessory(restore, 8).value.left).toBeGreaterThan(presented.value.left)
    const end = sampleAccessory(restore, accessoryRunDuration(restore)).value
    expect(end.left).toBeCloseTo(EXPANDED.left, 1)
    expect(end.bottom).toBeCloseTo(EXPANDED.bottom, 1)
  })
})
