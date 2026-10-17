import { describe, expect, it } from 'vitest'
import observations from './nativeRelease.fixture.json'
import pass4Observations from './nativeReleasePass4.fixture.json'
import { createReleaseVelocityTracker } from './releaseVelocity.ts'
import {
  createNavigationReleaseStatistics,
  projectedNavigationCompletion,
} from './releaseDecision.ts'

describe('independent iOS 27 recorded input replay', () => {
  for (const observation of [
    ...observations,
    ...pass4Observations.map(row => ({ ...row, name: `pass4 ${row.name}` })),
  ]) {
    it(observation.name, () => {
      const velocity = createReleaseVelocityTracker()
      const statistics = createNavigationReleaseStatistics()
      let currentVelocity = 0
      for (const event of observation.events) {
        for (const [time, position] of event.samples)
          currentVelocity = velocity.record(position!, time!)
        expect(currentVelocity).toBeCloseTo(event.velocity, 3)
        if (event.state === 1) statistics.begin(event.panX, currentVelocity, event.time, 402)
        else statistics.record(event.panX, currentVelocity, event.time)
        const state = statistics.snapshot()
        expect(state.averageVelocity).toBeCloseTo(event.expected.averageVelocity, 5)
        expect(state.averageAcceleration).toBeCloseTo(event.expected.averageAcceleration, 4)
        expect(state.edgeFlick).toBe(event.expected.isInEdgeFlickPhase)
      }
    })
  }
})

describe('recorded iOS 27 pop decisions (45) against the monotonic release decision', () => {
  // Native cancels four slow drags that stop past the threshold while decelerating; the release
  // decision finishes them (acceleration may only help). Every other recorded decision matches.
  const deviations = new Set([
    'threshold-205',
    'threshold-235',
    'pass4 threshold-245',
    'pass4 threshold-255',
  ])
  for (const observation of [
    ...observations,
    ...pass4Observations.map(row => ({ ...row, name: `pass4 ${row.name}` })),
  ]) {
    it(observation.name, () => {
      const last = observation.events.at(-1)!
      const finish = projectedNavigationCompletion(last.panX / 402, 402, {
        averageVelocity: last.expected.averageVelocity,
        averageAcceleration: last.expected.averageAcceleration,
        edgeFlick: last.expected.isInEdgeFlickPhase,
      })
      if (deviations.has(observation.name)) {
        expect(observation.decision.result).toBe(false)
        expect(finish).toBe(true)
      } else expect(finish).toBe(observation.decision.result)
    })
  }
})
