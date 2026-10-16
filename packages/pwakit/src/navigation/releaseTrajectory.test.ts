import { describe, expect, it } from 'vitest'
import {
  NAVIGATION_RELEASE_SAMPLE_RATE_HZ,
  NAVIGATION_RELEASE_SPRING_DAMPING,
  NAVIGATION_RELEASE_SPRING_MASS,
  NAVIGATION_RELEASE_SPRING_STIFFNESS,
  createNavigationReleaseTrajectory,
  normalizeNavigationReleaseVelocity,
} from './releaseTrajectory.ts'

describe('iOS 27 interactive release trajectory', () => {
  it('retains the fitted native Settings spring and 240 Hz curve sampling', () => {
    expect(NAVIGATION_RELEASE_SPRING_MASS).toBe(1)
    expect(NAVIGATION_RELEASE_SPRING_STIFFNESS).toBeCloseTo(438.649084, 5)
    expect(NAVIGATION_RELEASE_SPRING_DAMPING).toBeCloseTo(35.604717, 5)
    expect(NAVIGATION_RELEASE_SAMPLE_RATE_HZ).toBe(240)
  })

  it('normalizes velocity by signed remaining distance like UIKit', () => {
    expect(normalizeNavigationReleaseVelocity(402, 0.25, 1, 402)).toBeCloseTo(4 / 3)
    expect(normalizeNavigationReleaseVelocity(100, 0.25, 0, 400)).toBe(-1)
    expect(normalizeNavigationReleaseVelocity(100, 1, 1, 402)).toBe(0)
  })

  it('encodes the exact release tangent in a compositor linear easing', () => {
    const from = 0.25
    const target = 1
    const width = 402
    const velocity = 600
    const trajectory = createNavigationReleaseTrajectory(from, target, velocity, width)
    const [start, tangent] = trajectory.samples
    const distance = (target - from) * width
    const tangentVelocity =
      (distance * (tangent!.value - start!.value)) /
      (((tangent!.offset - start!.offset) * trajectory.durationMs) / 1_000)

    expect(trajectory.cssEasing.startsWith('linear(')).toBe(true)
    expect(tangentVelocity).toBeCloseTo(velocity, 6)
    expect(trajectory.samples.at(-1)).toEqual({ offset: 1, value: 1 })
  })

  it('rejects non-finite input and clamps implausible release velocity', () => {
    expect(normalizeNavigationReleaseVelocity(Number.NaN, 0.25, 1, 402)).toBe(0)
    expect(normalizeNavigationReleaseVelocity(500, 0.25, 1, Number.NaN)).toBe(0)
    expect(normalizeNavigationReleaseVelocity(1_000_000, 0.5, 1, 402)).toBeCloseTo(10_000 / 201)
    const trajectory = createNavigationReleaseTrajectory(0.25, 1, Number.NaN, 402)
    expect(trajectory.initialVelocity).toBe(0)
    expect(trajectory.cssEasing.includes('NaN')).toBe(false)
  })

  it('continues forward before a cancellation spring reverses it', () => {
    const trajectory = createNavigationReleaseTrajectory(0.12, 0, 100, 402)
    expect(trajectory.initialVelocity).toBeLessThan(0)
    expect(trajectory.samples[1]!.value).toBeLessThan(0)
    expect(trajectory.samples.some(sample => sample.value > 0)).toBe(true)
    expect(trajectory.samples.at(-1)).toEqual({ offset: 1, value: 1 })
  })

  it('ends a completing pop at its first edge arrival without a return tail', () => {
    const trajectory = createNavigationReleaseTrajectory(0.3, 1, 1_600, 402)
    expect(trajectory.initialVelocity).toBeCloseTo(1_600 / (0.7 * 402))
    expect(Math.max(...trajectory.samples.map(sample => sample.value))).toBe(1)
    expect(trajectory.durationMs).toBeLessThan(250)
    expect(trajectory.samples.at(-1)).toEqual({ offset: 1, value: 1 })
  })

  it('keeps extreme and near-endpoint trajectories finite', () => {
    for (const progress of [0.001, 0.3, 0.9, 0.9999]) {
      for (const velocity of [-10_000, -1_600, 0, 1_600, 10_000]) {
        for (const target of [0, 1]) {
          const curve = createNavigationReleaseTrajectory(progress, target, velocity, 402)
          expect(curve.samples.every(sample => Number.isFinite(sample.value))).toBe(true)
          expect(curve.durationMs).toBeLessThanOrEqual(1_005)
          if (target === 1)
            expect(Math.max(...curve.samples.map(sample => sample.value))).toBeLessThanOrEqual(1)
        }
      }
    }
  })
})
