import { describe, expect, it } from 'vitest'
import {
  createNavigationReleaseStatistics,
  projectedNavigationCompletion,
} from './releaseDecision.ts'

describe('delivered native navigation decision', () => {
  it('distinguishes a terminal hold below and above the observed 10 ms statistics boundary', () => {
    const prepared = () => {
      const statistics = createNavigationReleaseStatistics()
      statistics.begin(0, 500, 0, 402)
      statistics.record(10, 400, 20)
      statistics.record(20, 300, 40)
      statistics.record(30, 200, 60)
      return statistics
    }
    const shortHold = prepared()
    const before = shortHold.snapshot()
    shortHold.record(30, 200, 67)
    expect(shortHold.snapshot()).toEqual(before)
    const longHold = prepared()
    longHold.record(30, 200, 72)
    expect(longHold.snapshot().averageVelocity).toBeCloseTo((300 + 200 + 200) / 3 / 402)
    expect(longHold.snapshot().averageAcceleration).not.toBe(before.averageAcceleration)
  })

  it('finishes a forward drag past the threshold even while it decelerates (native pass4 threshold-245 cancels: documented deviation)', () => {
    expect(
      projectedNavigationCompletion(0.5373134328, 402, {
        averageVelocity: 0.1156635986,
        averageAcceleration: -2.02307873,
        edgeFlick: false,
      }),
    ).toBe(true)
  })
  it.each([
    ['031', 0.8303, 0.815, -15.58, false],
    ['032', 0.8402, 1.183, -27.22, false],
    ['039', 0.8364, 0.871, -14.03, false],
    ['049', 0.6439, 2.119, -15.7, true],
    ['050', 0.7818, 1.723, -19.02, true],
    ['033', 0.8924, 0.339, -3.04, false],
    ['037', 0.947, 1.215, -0.78, false],
  ] as const)(
    "finishes the owner's swipe %s (cancelled on his iPhone before Oct 4 construction update)",
    (_name, progress, averageVelocity, averageAcceleration, edgeFlick) => {
      expect(
        projectedNavigationCompletion(progress, 440, {
          averageVelocity,
          averageAcceleration,
          edgeFlick,
        }),
      ).toBe(true)
    },
  )
  it('is monotonic: more progress, velocity or acceleration never turns a finish into a cancel', () => {
    const steps = (from: number, to: number, count: number) =>
      Array.from({ length: count }, (_, index) => from + ((to - from) * index) / (count - 1))
    for (const progress of steps(0, 1, 21))
      for (const averageVelocity of steps(-3, 3, 25))
        for (const averageAcceleration of steps(-30, 30, 13)) {
          const finish = (p: number, v: number, a: number) =>
            projectedNavigationCompletion(p, 402, {
              averageVelocity: v,
              averageAcceleration: a,
              edgeFlick: false,
            })
          if (!finish(progress, averageVelocity, averageAcceleration)) continue
          expect(finish(Math.min(1, progress + 0.05), averageVelocity, averageAcceleration)).toBe(
            true,
          )
          expect(finish(progress, averageVelocity + 0.25, averageAcceleration)).toBe(true)
          expect(finish(progress, averageVelocity, averageAcceleration + 5)).toBe(true)
        }
    // Deceleration alone never cancels a forward-moving swipe past the threshold.
    for (const averageAcceleration of steps(-40, 0, 9))
      expect(
        projectedNavigationCompletion(0.5, 402, {
          averageVelocity: 0.01,
          averageAcceleration,
          edgeFlick: false,
        }),
      ).toBe(true)
  })
  it('completes an accelerating drag below halfway (native fast)', () => {
    expect(
      projectedNavigationCompletion(0.3449419569, 402, {
        averageVelocity: 3.30125663,
        averageAcceleration: 14.61335987,
        edgeFlick: false,
      }),
    ).toBe(true)
  })
  it('does not re-enter the initial flick phase after a slow beginning', () => {
    const statistics = createNavigationReleaseStatistics()
    statistics.begin(35, 400, 0, 402)
    statistics.record(45, 500, 20)
    statistics.record(80, 2_000, 40)
    statistics.record(140, 3_000, 60)
    expect(statistics.snapshot().edgeFlick).toBe(false)
  })
  it('retains the initial flick phase for consistently fast delivered movement', () => {
    const statistics = createNavigationReleaseStatistics()
    statistics.begin(35, 800, 0, 402)
    statistics.record(65, 1_200, 20)
    statistics.record(100, 1_600, 40)
    expect(statistics.snapshot().edgeFlick).toBe(true)
  })
  it('uses the reconciled position on either side of a stationary boundary', () => {
    const stopped = { averageVelocity: 0, averageAcceleration: 0, edgeFlick: false }
    expect(projectedNavigationCompletion(187 / 402, 402, stopped)).toBe(false)
    expect(projectedNavigationCompletion(188 / 402, 402, stopped)).toBe(true)
  })
})

it('uses the latest finger direction even while the average window is positive', () => {
  const statistics = createNavigationReleaseStatistics()
  statistics.begin(0, 1500, 0, 402)
  statistics.record(60, 1500, 40)
  statistics.record(110, 1250, 80)
  statistics.record(106, 900, 100)
  const decision = statistics.snapshot()
  expect(decision.averageVelocity).toBeGreaterThan(0)
  expect(decision.latestVelocity).toBeCloseTo(-200 / 402)
  for (const progress of [0.1, 0.3, 0.5])
    expect(projectedNavigationCompletion(progress, 402, decision)).toBe(false)
  for (const progress of [0.65, 0.8]) {
    expect(projectedNavigationCompletion(progress, 402, decision)).toBe(true)
    expect(
      projectedNavigationCompletion(progress, 402, { ...decision, latestVelocity: -301 / 402 }),
    ).toBe(false)
  }
  for (const progress of [0, 0.25, 0.5, 0.65, 0.8, 1])
    for (const latestVelocity of [-1200, -301, -300, -1, 1, 300])
      for (const averageAcceleration of [-40, 0, 40]) {
        const result = projectedNavigationCompletion(progress, 402, {
          averageVelocity: 2,
          averageAcceleration,
          edgeFlick: false,
          latestVelocity: latestVelocity / 402,
        })
        if (latestVelocity < 0 && (progress <= 0.5 || latestVelocity < -300))
          expect(result).toBe(false)
        if (latestVelocity > 0 && progress >= 0.5) expect(result).toBe(true)
      }
})

it('updates direction even when a sub-millisecond reversal skips the average window', () => {
  const statistics = createNavigationReleaseStatistics()
  statistics.begin(100, 1200, 100, 402)
  statistics.record(99.9, 1200, 100.5)
  expect(statistics.snapshot().averageVelocity).toBeGreaterThan(0)
  expect(statistics.snapshot().latestVelocity).toBeLessThan(0)
  expect(projectedNavigationCompletion(0.5, 402, statistics.snapshot())).toBe(false)
})

it('measures a reversal from the preceding held sample, not from the start of the hold', () => {
  const statistics = createNavigationReleaseStatistics()
  statistics.begin(100, 1000, 100, 402)
  statistics.record(120, 1000, 120)
  statistics.record(120, 1000, 1120)
  statistics.record(110, 900, 1140)
  expect(statistics.snapshot().latestVelocity).toBeCloseTo(-500 / 402)
  expect(projectedNavigationCompletion(0.8, 402, statistics.snapshot())).toBe(false)
})
