import { describe, expect, it } from 'vitest'
import {
  ADAPTIVE_LAYOUT_SPIKE_POLICY,
  createLayoutClassState,
  reduceLayoutClass,
  type LayoutViewportMetrics,
} from './layoutClass.ts'

const metrics = (width: number, height = 800): LayoutViewportMetrics => ({
  height,
  width,
})

describe('layout class reducer', () => {
  it('classifies a new viewport conservatively inside each deadband', () => {
    expect(
      createLayoutClassState(metrics(719, 519), ADAPTIVE_LAYOUT_SPIKE_POLICY).layoutClass,
    ).toEqual({
      horizontal: 'compact',
      vertical: 'compact',
    })
    expect(
      createLayoutClassState(metrics(720, 520), ADAPTIVE_LAYOUT_SPIKE_POLICY).layoutClass,
    ).toEqual({
      horizontal: 'regular',
      vertical: 'regular',
    })
  })

  it('does not thrash while a live resize jitters around the horizontal boundary', () => {
    let state = createLayoutClassState(metrics(640), ADAPTIVE_LAYOUT_SPIKE_POLICY)
    const events = []

    for (const width of [699, 718, 702, 719, 700, 720, 704, 681, 700, 682, 680]) {
      const reduction = reduceLayoutClass(state, metrics(width), ADAPTIVE_LAYOUT_SPIKE_POLICY)
      state = reduction.state
      events.push(...reduction.events)
    }

    expect(
      events.map(event => ({
        current: event.current.horizontal,
        previous: event.previous.horizontal,
        revision: event.revision,
      })),
    ).toEqual([
      { current: 'regular', previous: 'compact', revision: 1 },
      { current: 'compact', previous: 'regular', revision: 2 },
    ])
    expect(state.layoutClass.horizontal).toBe('compact')
  })

  it('applies the same hysteresis rule to vertical class changes', () => {
    let state = createLayoutClassState(metrics(800, 470), ADAPTIVE_LAYOUT_SPIKE_POLICY)

    state = reduceLayoutClass(state, metrics(800, 519), ADAPTIVE_LAYOUT_SPIKE_POLICY).state
    expect(state.layoutClass.vertical).toBe('compact')
    state = reduceLayoutClass(state, metrics(800, 520), ADAPTIVE_LAYOUT_SPIKE_POLICY).state
    expect(state.layoutClass.vertical).toBe('regular')
    state = reduceLayoutClass(state, metrics(800, 481), ADAPTIVE_LAYOUT_SPIKE_POLICY).state
    expect(state.layoutClass.vertical).toBe('regular')
    state = reduceLayoutClass(state, metrics(800, 480), ADAPTIVE_LAYOUT_SPIKE_POLICY).state
    expect(state.layoutClass.vertical).toBe('compact')
  })

  it('emits one atomic event when both axes change in the same sample', () => {
    const state = createLayoutClassState(metrics(640, 470))
    const reduction = reduceLayoutClass(state, metrics(900, 700))

    expect(reduction.events).toEqual([
      {
        changedAxes: ['horizontal', 'vertical'],
        current: { horizontal: 'regular', vertical: 'regular' },
        metrics: { width: 900, height: 700 },
        previous: { horizontal: 'compact', vertical: 'compact' },
        revision: 1,
        type: 'layout-class-changed',
      },
    ])
  })

  it('updates metrics without inventing a class-change event', () => {
    const state = createLayoutClassState(metrics(640))
    const resized = reduceLayoutClass(state, metrics(650))

    expect(resized.events).toEqual([])
    expect(resized.state).not.toBe(state)
    expect(resized.state.metrics.width).toBe(650)
    expect(reduceLayoutClass(resized.state, resized.state.metrics).state).toBe(resized.state)
  })

  it('rejects invalid metrics and invalid hysteresis policies', () => {
    expect(() => createLayoutClassState(metrics(Number.NaN))).toThrow(
      'metrics.width must be a finite, non-negative number',
    )
    expect(() =>
      createLayoutClassState(metrics(400), {
        ...ADAPTIVE_LAYOUT_SPIKE_POLICY,
        horizontal: { compactMaximum: 701, regularMinimum: 700 },
      }),
    ).toThrow('policy.horizontal must have compactMaximum <= regularMinimum')
  })
})

import { ADAPTIVE_LAYOUT_POLICY } from './layoutClass.ts'

describe('measured-reference shipping layout policy', () => {
  it('crosses the measured horizontal bracket without direction-dependent deadband', () => {
    for (const initial of [400, 1000]) {
      let state = createLayoutClassState(metrics(initial), ADAPTIVE_LAYOUT_POLICY)
      for (const width of [667, 668, 667, 668, 1032, 409, 997]) {
        state = reduceLayoutClass(state, metrics(width), ADAPTIVE_LAYOUT_POLICY).state
        expect(state.layoutClass.horizontal).toBe(width >= 668 ? 'regular' : 'compact')
      }
    }
  })
})
