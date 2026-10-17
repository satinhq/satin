import { describe, expect, it } from 'vitest'
import {
  followFieldTarget,
  sampleFieldAxis,
  sampleFieldMember,
  ZERO_FIELD_VELOCITY,
} from './fieldMotion.ts'

const member = { centerX: 0, centerY: 10, halfWidth: 48, halfHeight: 26, radius: 26 }

describe('field geometry retargeting', () => {
  it('preserves position and velocity when the target changes mid-spring', () => {
    const moving = sampleFieldAxis(0, 100, 0, 120)
    const retargeted = sampleFieldAxis(moving.value, -40, moving.velocity, 0)
    expect(retargeted.value).toBeCloseTo(moving.value, 10)
    expect(retargeted.velocity).toBeCloseTo(moving.velocity, 10)
    const after = sampleFieldAxis(moving.value, -40, moving.velocity, 0.01)
    expect((after.value - moving.value) / 0.00001).toBeCloseTo(moving.velocity, 0)
  })

  it('follows continuous geometry without restarting the running spring', () => {
    const target = { ...member, centerX: 100, halfWidth: 60 }
    const movedTarget = { ...target, centerX: 140, halfWidth: 70 }
    const followed = followFieldTarget(member, target, movedTarget)
    const before = sampleFieldMember(member, target, ZERO_FIELD_VELOCITY, 120)
    const after = sampleFieldMember(followed, movedTarget, ZERO_FIELD_VELOCITY, 120)
    expect(after.value.centerX - before.value.centerX).toBeCloseTo(40, 10)
    expect(after.value.halfWidth - before.value.halfWidth).toBeCloseTo(10, 10)
    expect(after.velocity.centerX).toBeCloseTo(before.velocity.centerX, 10)
    expect(after.velocity.halfWidth).toBeCloseTo(before.velocity.halfWidth, 10)
  })

  it('settles and honors reduced motion', () => {
    const target = { ...member, centerX: 100 }
    expect(sampleFieldMember(member, target, ZERO_FIELD_VELOCITY, 1000)).toEqual({
      value: target,
      velocity: ZERO_FIELD_VELOCITY,
    })
    expect(sampleFieldMember(member, target, ZERO_FIELD_VELOCITY, 10, true).value).toEqual(target)
  })
})
