import { afterEach, expect, it } from 'vitest'
import { lagMark, lagMarks, lagTraceEnabled, setLagTrace } from './lagTrace.ts'
import { glassProfile, traceStage, traceStageStart } from './profile.ts'

// The lag trace is opt-in. Off, nothing is stored, and the stages that exist only for it
// (plane-signature, capture-bitmap, prepare-commit-post, prepare-acknowledge)
// read no clock, build no detail and add no event to the always-on timing ring.

afterEach(() => setLagTrace(false))

it('trace-only stages cost nothing while the trace is off', () => {
  expect(lagTraceEnabled()).toBe(false)
  const before = glassProfile().events.length
  const totals = Object.keys(glassProfile().totals).length
  const started = traceStageStart()
  expect(started).toBe(0)
  let detailBuilt = false
  traceStage('capture-bitmap', started, () => {
    detailBuilt = true
    return '1320x15018'
  })
  expect(detailBuilt).toBe(false)
  expect(glassProfile().events.length).toBe(before)
  expect(Object.keys(glassProfile().totals).length).toBe(totals)
  expect(lagMarks()).toHaveLength(0)
})

it('trace-only stages are timed, with their detail, while the trace is on', () => {
  setLagTrace(true)
  const started = traceStageStart()
  expect(started).toBeGreaterThan(0)
  traceStage('capture-bitmap', started, () => '1320x15018')
  const event = glassProfile().events.at(-1)!
  expect([event.stage, event.detail]).toEqual(['capture-bitmap', '1320x15018'])
})

it('turning the trace off drops its marks', () => {
  setLagTrace(true)
  lagMark({ stage: 'scroll-event', at: 1 })
  expect(lagMarks()).toHaveLength(1)
  setLagTrace(false)
  expect(lagMarks()).toHaveLength(0)
})
