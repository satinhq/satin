import { describe, expect, it } from 'vitest'
import { advanceNavigationTracking } from './tracking.ts'

describe('native tracking spring', () => {
  it('has the same state whether a frame interval is partitioned or not', () => {
    const start = { position: 30, velocity: 600 }
    const once = advanceNavigationTracking(start, 120, 0.04)
    const partitioned = advanceNavigationTracking(
      advanceNavigationTracking(start, 120, 0.016),
      120,
      0.024,
    )
    expect(partitioned.position).toBeCloseTo(once.position, 10)
    expect(partitioned.velocity).toBeCloseTo(once.velocity, 10)
  })

  it('retargets without changing instantaneous position or velocity', () => {
    const moving = advanceNavigationTracking({ position: 0, velocity: 0 }, 100, 0.02)
    expect(advanceNavigationTracking(moving, 200, 0).position).toBeCloseTo(moving.position)
    expect(advanceNavigationTracking(moving, 200, 0).velocity).toBeCloseTo(moving.velocity)
    const settled = advanceNavigationTracking(moving, 200, 1)
    expect(settled.position).toBeCloseTo(200)
    expect(settled.velocity).toBeCloseTo(0)
  })
})
