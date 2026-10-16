import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  ADAPTIVE_LAYOUT_SPIKE_POLICY,
  createLayoutClassState,
  reduceLayoutClass,
} from './layoutClass.ts'

type NativeSample = { width: number; native: 'compact' | 'regular'; t: number }
const evidence = new URL('../../../../fixtures/layout-traces/', import.meta.url)
function nativeTrace(name: string): NativeSample[] {
  return JSON.parse(readFileSync(new URL(name, evidence), 'utf8')).samples
}

describe('Phase reference fit recorded iPad traces', () => {
  it('exposes the 720 px expansion delay against settled native Settings evidence', () => {
    const samples = nativeTrace('settings-paused-threshold-width-trace.json')
    let state = createLayoutClassState(
      { width: samples[0]!.width, height: 1000 },
      ADAPTIVE_LAYOUT_SPIKE_POLICY,
    )
    const disagreements: NativeSample[] = []
    for (const sample of samples) {
      state = reduceLayoutClass(
        state,
        { width: sample.width, height: 1000 },
        ADAPTIVE_LAYOUT_SPIKE_POLICY,
      ).state
      if (state.layoutClass.horizontal !== sample.native) disagreements.push(sample)
    }
    // Native has visibly expanded and remained expanded at 673 pt, well below 720.
    expect(disagreements.some(sample => sample.width === 673 && sample.native === 'regular')).toBe(
      true,
    )
  })

  it('replays exported web layout metrics without substituting the visual viewport', () => {
    const index = JSON.parse(
      readFileSync(new URL('trace-files.json', evidence), 'utf8'),
    ) as string[]
    let observedWindowedStandalone = false
    const viewportPresence = new Set<boolean>()
    const segmentSyntax = new Set<boolean>()
    for (const filename of index) {
      const trace = JSON.parse(readFileSync(new URL(filename, evidence), 'utf8'))
      expect(trace.dropped).toBe(0)
      const samples = trace.samples as {
        innerWidth: number
        innerHeight: number
        sequence: number
        metrics: { standalone: boolean }
        segments: { viewportPresent: boolean; syntaxAccepted: boolean }
      }[]
      expect(samples.length).toBeGreaterThan(0)
      let state = createLayoutClassState({
        width: samples[0]!.innerWidth,
        height: samples[0]!.innerHeight,
      })
      for (const sample of samples) {
        state = reduceLayoutClass(state, {
          width: sample.innerWidth,
          height: sample.innerHeight,
        }).state
        if (sample.metrics.standalone && sample.innerWidth < 680) observedWindowedStandalone = true
        viewportPresence.add(sample.segments.viewportPresent)
        segmentSyntax.add(sample.segments.syntaxAccepted)
      }
      expect(state.metrics).toEqual({
        width: samples.at(-1)!.innerWidth,
        height: samples.at(-1)!.innerHeight,
      })
    }
    expect([...viewportPresence]).toEqual([false])
    expect([...segmentSyntax]).toEqual([false])
    expect(observedWindowedStandalone).toBe(true)
  }, 30000)
})
