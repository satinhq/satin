import { describe, expect, it } from 'vitest'
import { summarizeScrollAnchorSamples } from './scrollAnchoring.ts'

describe('measured-reference scroll anchoring', () => {
  it('summarizes absolute residuals without hiding direction reversals', () => {
    expect(
      summarizeScrollAnchorSamples([
        { latencyMs: 8, residualCssPx: -2, timestampMs: 1, velocityCssPxPerSecond: 100 },
        { latencyMs: 16, residualCssPx: 1, timestampMs: 2, velocityCssPxPerSecond: -100 },
        { latencyMs: 17, residualCssPx: -8, timestampMs: 3, velocityCssPxPerSecond: 200 },
      ]),
    ).toEqual({
      absoluteMaxCssPx: 8,
      absoluteP50CssPx: 2,
      absoluteP95CssPx: 8,
      latencyP50Ms: 16,
      mode: 'combined',
      sampleCount: 3,
    })
  })
})
