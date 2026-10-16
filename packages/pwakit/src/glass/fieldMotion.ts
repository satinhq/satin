import type { CapsuleShape } from './renderSpecs.ts'

/** A unit-mass spring: stiffness and damping per second squared and per second. */
export type FieldSpring = Readonly<{ stiffness: number; damping: number }>
/** The shared measured field spring (mass 1). Members with their own native fit pass a profile. */
export const FIELD_SPRING: FieldSpring = { stiffness: 186.57, damping: 25.13 }
const axes = ['centerX', 'centerY', 'halfWidth', 'halfHeight', 'radius'] as const
export const FIELD_MOTION_DURATION = 1000
export const ZERO_FIELD_VELOCITY: CapsuleShape = {
  centerX: 0,
  centerY: 0,
  halfWidth: 0,
  halfHeight: 0,
  radius: 0,
}

/** Exact underdamped spring, including the velocity at a retarget boundary (units / second). */
export function sampleFieldAxis(
  from: number,
  to: number,
  velocity: number,
  elapsedMs: number,
  spring: FieldSpring = FIELD_SPRING,
) {
  const decay = spring.damping / 2
  const frequency = Math.sqrt(spring.stiffness - decay * decay)
  const seconds = Math.max(0, elapsedMs) / 1000
  const displacement = from - to
  const sineCoefficient = (velocity + decay * displacement) / frequency
  const cosine = Math.cos(frequency * seconds)
  const sine = Math.sin(frequency * seconds)
  const attenuation = Math.exp(-decay * seconds)
  const residual = displacement * cosine + sineCoefficient * sine
  return {
    value: to + attenuation * residual,
    velocity:
      attenuation *
      (-decay * residual + frequency * (-displacement * sine + sineCoefficient * cosine)),
  }
}

export function sampleFieldMember(
  from: CapsuleShape,
  to: CapsuleShape,
  velocity: CapsuleShape,
  elapsedMs: number,
  reducedMotion = false,
) {
  const value = { ...to }
  const nextVelocity = { ...ZERO_FIELD_VELOCITY }
  if (!reducedMotion && elapsedMs < FIELD_MOTION_DURATION) {
    for (const axis of axes) {
      const sample = sampleFieldAxis(from[axis], to[axis], velocity[axis], elapsedMs)
      value[axis] = sample.value
      nextVelocity[axis] = sample.velocity
    }
  }
  return { value, velocity: nextVelocity }
}

/** Follow a moving layout target without changing the spring's elapsed time or residual. */
export function followFieldTarget(
  from: CapsuleShape,
  oldTarget: CapsuleShape,
  target: CapsuleShape,
) {
  const followed = { ...from }
  for (const axis of axes) followed[axis] += target[axis] - oldTarget[axis]
  return followed
}
