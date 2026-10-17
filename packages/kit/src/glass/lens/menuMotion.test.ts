import { describe, expect, it } from 'vitest'
import {
  MENU_BUTTON,
  MENU_CADENCE,
  MENU_ENVELOPE,
  MENU_MOTION_DURATIONS,
  MENU_PANEL,
  sampleMenuMotion,
  blendMenuFrames,
  menuRetargetTime,
} from './menuMotion.ts'

function absolute(shape: NonNullable<ReturnType<typeof sampleMenuMotion>['shape']['second']>) {
  return {
    centerX: MENU_ENVELOPE.frameX + shape.centerX,
    centerY: MENU_ENVELOPE.frameY + shape.centerY,
    height: shape.halfHeight * 2,
    width: shape.halfWidth * 2,
  }
}

describe('measured-reference native-fit menu motion', () => {
  it('applies measured raster registration and settles at the exact panel', () => {
    const start = absolute(sampleMenuMotion('open', 0, 'light', false).shape.second!)
    const end = absolute(
      sampleMenuMotion('open', MENU_MOTION_DURATIONS.open, 'light', false).shape.second!,
    )

    expect(start).toEqual({
      centerX: 360,
      centerY: 160,
      height: 67,
      width: 65,
    })
    expect(end.centerX).toBeCloseTo(MENU_PANEL.centerX, 6)
    expect(end.centerY).toBeCloseTo(MENU_PANEL.centerY, 6)
    expect(end.width).toBeCloseTo(MENU_PANEL.width, 6)
    expect(end.height).toBeCloseTo(MENU_PANEL.height, 6)
    const reducedClose = absolute(sampleMenuMotion('close', 0, 'light', true).shape.second!)
    expect(reducedClose).toEqual({
      centerX: MENU_BUTTON.centerX,
      centerY: MENU_BUTTON.centerY,
      height: MENU_BUTTON.diameter,
      width: MENU_BUTTON.diameter,
    })
    const fittedClose = absolute(
      sampleMenuMotion('close', MENU_MOTION_DURATIONS.close, 'light', false).shape.second!,
    )
    expect(fittedClose).toEqual(reducedClose)
  })

  it('uses the measured asymmetric opening and closing durations', () => {
    expect(MENU_MOTION_DURATIONS.open).toBeGreaterThan(MENU_MOTION_DURATIONS.close)
    expect(MENU_MOTION_DURATIONS.open).toBeCloseTo(0.48, 5)
    expect(MENU_MOTION_DURATIONS.close).toBeCloseTo(0.4, 5)
    expect(MENU_CADENCE.closeSettleSeconds).toBe(0)
  })

  it('jumps to the requested endpoint under Reduced Motion', () => {
    expect(sampleMenuMotion('open', 0, 'dark', true).openProgress).toBeCloseTo(1, 6)
    expect(sampleMenuMotion('close', 0, 'dark', true).openProgress).toBeCloseTo(0, 6)
  })

  it('uses one lens without a stationary trigger shoulder', () => {
    const middle = sampleMenuMotion('open', MENU_MOTION_DURATIONS.open / 2, 'light', false).shape
    expect(middle.second).toBeDefined()
    expect(middle.blendRadius).toBe(0)
    expect(middle.first).toEqual(middle.second)
  })
  it('returns continuously to the circle without a final geometry or material snap', () => {
    const duration = MENU_MOTION_DURATIONS.close
    const before = sampleMenuMotion('close', duration - 0.0001, 'light', false)
    const end = sampleMenuMotion('close', duration, 'light', false)
    const a = absolute(before.shape.second!),
      b = absolute(end.shape.second!)
    for (const key of ['centerX', 'centerY', 'width', 'height'] as const) {
      expect(Math.abs(a[key] - b[key])).toBeLessThan(0.002)
    }
    expect(Math.abs(before.materialMix - end.materialMix)).toBeLessThan(0.001)
    expect(sampleMenuMotion('close', 0.12, 'light', false).materialMix).toBeGreaterThan(0)
    expect(end.menuTintMix).toBe(0)
  })

  it('returns the glyph inside the material-bearing circle before the remnant is gone', () => {
    const frame = sampleMenuMotion('close', 0.18, 'light', false)
    expect(frame.triggerOpacity).toBeGreaterThan(0.5)
    expect(frame.returningTrigger!.mix).toBeGreaterThan(0.8)
    expect(frame.shape.first.halfHeight).toBeGreaterThan(frame.returningTrigger!.radius)
    expect(frame.shape.second!.centerX).toBe(frame.returningTrigger!.centerX)
    expect(frame.shape.second!.centerY).toBe(frame.returningTrigger!.centerY)
  })

  it('has no endpoint glyph transform, material, or geometry handoff', () => {
    for (const appearance of ['light', 'dark'] as const) {
      const near = sampleMenuMotion(
        'close',
        MENU_MOTION_DURATIONS.close - 0.0001,
        appearance,
        false,
      )
      const end = sampleMenuMotion('close', MENU_MOTION_DURATIONS.close, appearance, false)
      const reduced = sampleMenuMotion('close', 0, appearance, true)
      expect(end).toEqual(reduced)
      expect(near.triggerOpacity).toBe(1)
      expect(near.returningTrigger!.radius).toBeCloseTo(MENU_BUTTON.diameter / 2, 4)
      expect(near.returningTrigger!.centerY).toBeCloseTo(
        MENU_BUTTON.centerY - MENU_ENVELOPE.frameY,
        4,
      )
      expect(near.menuTintMix).toBeLessThan(0.000001)
    }
  })

  it('retargets an interruption without jumping to a full panel or closed button', () => {
    const current = sampleMenuMotion('open', 0.06, 'light', false)
    const offset = menuRetargetTime(current, 'close', 'light')
    expect(offset).toBeGreaterThan(0)
    const target = sampleMenuMotion('close', offset, 'light', false)
    expect(blendMenuFrames(current, target, 0)).toEqual(current)
    expect(blendMenuFrames(current, target, 1)).toEqual(target)
  })
})
