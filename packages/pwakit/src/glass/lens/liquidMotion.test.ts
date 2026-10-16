import { describe, expect, it } from 'vitest'
import { LIQUID_ENVELOPES, LIQUID_SCRIPT, sampleLiquidShape } from './liquidMotion.ts'

function absoluteCenterX(mode: keyof typeof LIQUID_ENVELOPES, centerX: number) {
  return LIQUID_ENVELOPES[mode].frameX + centerX
}

describe('measured-reference native-fit motion', () => {
  it('replays the measured pill endpoints and overshoot inside the SDF', () => {
    const rest = sampleLiquidShape('pill', 0, 'light', false)
    const overshoot = sampleLiquidShape(
      'pill',
      LIQUID_SCRIPT.initialHoldSeconds + 0.331_667,
      'light',
      false,
    )
    const target = sampleLiquidShape(
      'pill',
      LIQUID_SCRIPT.initialHoldSeconds + LIQUID_SCRIPT.morphDurationSeconds,
      'light',
      false,
    )

    expect(absoluteCenterX('pill', rest.first.centerX)).toBeCloseTo(70.5, 3)
    expect(rest.first.halfWidth * 2).toBeCloseTo(91, 3)
    expect(rest.first.halfHeight * 2).toBeCloseTo(63, 3)
    expect(absoluteCenterX('pill', overshoot.first.centerX)).toBeGreaterThan(257)
    expect(absoluteCenterX('pill', target.first.centerX)).toBeCloseTo(242.5, 3)
  })

  it('applies press scale and brightness to shape data without a DOM scale', () => {
    const held = sampleLiquidShape('press', LIQUID_SCRIPT.initialHoldSeconds + 0.8, 'light', false)
    expect((held.first.halfWidth * 2) / 160).toBeCloseTo(1.021_806_85, 3)
    expect(held.whiteMix).toBeCloseTo(0.072_851_45, 3)
  })

  it('adds the one-pixel raster correction to the measured 106 pt bridge', () => {
    const target = sampleLiquidShape(
      'merge',
      LIQUID_SCRIPT.initialHoldSeconds + 1.2,
      'light',
      false,
    )
    const distance = target.second!.centerX - target.first.centerX
    const reconstructedBridge =
      2 * Math.sqrt((60 + target.blendRadius / 4) ** 2 - (distance / 2) ** 2)
    expect(distance).toBeCloseTo(60, 0)
    expect(reconstructedBridge).toBeCloseTo(107, 0)
  })

  it('suppresses the early refractive-rim bridge before the native union appears', () => {
    const onset = sampleLiquidShape(
      'merge',
      LIQUID_SCRIPT.initialHoldSeconds + 0.065,
      'light',
      false,
    )
    const distance = onset.second!.centerX - onset.first.centerX
    expect(60 + onset.blendRadius / 4).toBeLessThan(distance / 2)
  })

  it('jumps to each phase endpoint under Reduced Motion', () => {
    const before = sampleLiquidShape('pill', LIQUID_SCRIPT.initialHoldSeconds - 0.01, 'light', true)
    const after = sampleLiquidShape('pill', LIQUID_SCRIPT.initialHoldSeconds + 0.01, 'light', true)
    expect(absoluteCenterX('pill', before.first.centerX)).toBeCloseTo(70.5, 3)
    expect(absoluteCenterX('pill', after.first.centerX)).toBeCloseTo(242.5, 3)
  })
})
