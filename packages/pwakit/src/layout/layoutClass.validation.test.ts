import { describe, expect, it } from 'vitest'
import {
  ADAPTIVE_LAYOUT_SPIKE_POLICY,
  createLayoutClassState,
  reduceLayoutClass,
  type LayoutClassAxisPolicy,
} from './layoutClass.ts'

describe('layout viewport validation', () => {
  const validMetrics = { width: 400, height: 800 }

  for (const operation of ['initial classification', 'live resize'] as const) {
    it.each([
      { label: 'negative', height: -1 },
      { label: 'infinite', height: Number.POSITIVE_INFINITY },
      { label: 'unknown', height: Number.NaN },
    ])(`rejects a $label viewport height during ${operation}`, ({ height }) => {
      const invalidMetrics = { ...validMetrics, height }
      const classify = () =>
        operation === 'initial classification'
          ? createLayoutClassState(invalidMetrics)
          : reduceLayoutClass(createLayoutClassState(validMetrics), invalidMetrics)

      expect(classify).toThrow('metrics.height must be a finite, non-negative number')
    })

    it.each<{ label: string; vertical: LayoutClassAxisPolicy }>([
      { label: 'negative', vertical: { compactMaximum: -1, regularMinimum: 520 } },
      {
        label: 'infinite',
        vertical: { compactMaximum: 480, regularMinimum: Number.POSITIVE_INFINITY },
      },
      { label: 'reversed', vertical: { compactMaximum: 521, regularMinimum: 520 } },
    ])(`rejects a $label vertical policy during ${operation}`, ({ vertical }) => {
      const policy = { ...ADAPTIVE_LAYOUT_SPIKE_POLICY, vertical }
      const classify = () =>
        operation === 'initial classification'
          ? createLayoutClassState(validMetrics, policy)
          : reduceLayoutClass(createLayoutClassState(validMetrics), validMetrics, policy)

      expect(classify).toThrow(/policy\.vertical/)
    })
  }

  it('uses each custom axis policy independently while preserving its resize deadband', () => {
    const policy = {
      horizontal: { compactMaximum: 300, regularMinimum: 400 },
      vertical: { compactMaximum: 200, regularMinimum: 250 },
    }
    let state = createLayoutClassState({ width: 399, height: 250 }, policy)
    expect(state.layoutClass).toEqual({ horizontal: 'compact', vertical: 'regular' })

    state = reduceLayoutClass(state, { width: 400, height: 201 }, policy).state
    expect(state.layoutClass).toEqual({ horizontal: 'regular', vertical: 'regular' })

    state = reduceLayoutClass(state, { width: 301, height: 200 }, policy).state
    expect(state.layoutClass).toEqual({ horizontal: 'regular', vertical: 'compact' })

    state = reduceLayoutClass(state, { width: 300, height: 249 }, policy).state
    expect(state.layoutClass).toEqual({ horizontal: 'compact', vertical: 'compact' })
  })
})
