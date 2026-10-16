export type AxisLayoutClass = 'compact' | 'regular'

export type LayoutClass = Readonly<{
  horizontal: AxisLayoutClass
  vertical: AxisLayoutClass
}>

export type LayoutViewportMetrics = Readonly<{
  height: number
  width: number
}>

export type LayoutClassAxisPolicy = Readonly<{
  /** A regular class remains regular until the viewport reaches this value. */
  compactMaximum: number
  /** A compact class remains compact until the viewport reaches this value. */
  regularMinimum: number
}>

export type LayoutClassPolicy = Readonly<{
  horizontal: LayoutClassAxisPolicy
  vertical: LayoutClassAxisPolicy
}>

export type LayoutClassState = Readonly<{
  layoutClass: LayoutClass
  metrics: LayoutViewportMetrics
  revision: number
}>

export type LayoutClassChangeEvent = Readonly<{
  changedAxes: readonly ('horizontal' | 'vertical')[]
  current: LayoutClass
  metrics: LayoutViewportMetrics
  previous: LayoutClass
  revision: number
  type: 'layout-class-changed'
}>

export type LayoutClassReduction = Readonly<{
  events: readonly LayoutClassChangeEvent[]
  state: LayoutClassState
}>

/* measured-reference: Settings' measured 667–668 pt bracket, without an invented deadband.
 * Vertical is a framework policy at 500 px, not a measured UIKit trait.
 * The historical spike remains explicit for evidence replay.
 */
export const ADAPTIVE_LAYOUT_POLICY: LayoutClassPolicy = Object.freeze({
  horizontal: Object.freeze({ compactMaximum: 668, regularMinimum: 668 }),
  vertical: Object.freeze({ compactMaximum: 500, regularMinimum: 500 }),
})

/**
 * Historical spike thresholds, retained only for explicit evidence replay.
 * Production callers use ADAPTIVE_LAYOUT_POLICY.
 */
export const ADAPTIVE_LAYOUT_SPIKE_POLICY: LayoutClassPolicy = Object.freeze({
  horizontal: Object.freeze({
    compactMaximum: 680,
    regularMinimum: 720,
  }),
  vertical: Object.freeze({
    compactMaximum: 480,
    regularMinimum: 520,
  }),
})

const EMPTY_EVENTS: readonly LayoutClassChangeEvent[] = Object.freeze([])

function assertFiniteNonNegative(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite, non-negative number.`)
  }
}

function assertAxisPolicy(policy: LayoutClassAxisPolicy, label: string) {
  assertFiniteNonNegative(policy.compactMaximum, `${label}.compactMaximum`)
  assertFiniteNonNegative(policy.regularMinimum, `${label}.regularMinimum`)
  if (policy.compactMaximum > policy.regularMinimum) {
    throw new Error(`${label} must have compactMaximum <= regularMinimum.`)
  }
}

function assertInputs(metrics: LayoutViewportMetrics, policy: LayoutClassPolicy) {
  assertFiniteNonNegative(metrics.width, 'metrics.width')
  assertFiniteNonNegative(metrics.height, 'metrics.height')
  assertAxisPolicy(policy.horizontal, 'policy.horizontal')
  assertAxisPolicy(policy.vertical, 'policy.vertical')
}

function initialAxisClass(value: number, policy: LayoutClassAxisPolicy): AxisLayoutClass {
  return value >= policy.regularMinimum ? 'regular' : 'compact'
}

function reduceAxisClass(
  current: AxisLayoutClass,
  value: number,
  policy: LayoutClassAxisPolicy,
): AxisLayoutClass {
  if (current === 'compact') {
    return value >= policy.regularMinimum ? 'regular' : 'compact'
  }

  if (policy.compactMaximum === policy.regularMinimum) {
    return initialAxisClass(value, policy)
  }
  return value <= policy.compactMaximum ? 'compact' : 'regular'
}

function metricsEqual(left: LayoutViewportMetrics, right: LayoutViewportMetrics) {
  return left.width === right.width && left.height === right.height
}

export function createLayoutClassState(
  metrics: LayoutViewportMetrics,
  policy: LayoutClassPolicy = ADAPTIVE_LAYOUT_POLICY,
): LayoutClassState {
  assertInputs(metrics, policy)
  return {
    layoutClass: {
      horizontal: initialAxisClass(metrics.width, policy.horizontal),
      vertical: initialAxisClass(metrics.height, policy.vertical),
    },
    metrics,
    revision: 0,
  }
}

export function reduceLayoutClass(
  state: LayoutClassState,
  metrics: LayoutViewportMetrics,
  policy: LayoutClassPolicy = ADAPTIVE_LAYOUT_POLICY,
): LayoutClassReduction {
  assertInputs(metrics, policy)

  const horizontal = reduceAxisClass(state.layoutClass.horizontal, metrics.width, policy.horizontal)
  const vertical = reduceAxisClass(state.layoutClass.vertical, metrics.height, policy.vertical)
  const changedAxes: ('horizontal' | 'vertical')[] = []
  if (horizontal !== state.layoutClass.horizontal) changedAxes.push('horizontal')
  if (vertical !== state.layoutClass.vertical) changedAxes.push('vertical')

  if (changedAxes.length === 0) {
    return {
      events: EMPTY_EVENTS,
      state: metricsEqual(state.metrics, metrics) ? state : { ...state, metrics },
    }
  }

  const layoutClass: LayoutClass = { horizontal, vertical }
  const nextState: LayoutClassState = {
    layoutClass,
    metrics,
    revision: state.revision + 1,
  }
  return {
    events: [
      {
        changedAxes,
        current: layoutClass,
        metrics,
        previous: state.layoutClass,
        revision: nextState.revision,
        type: 'layout-class-changed',
      },
    ],
    state: nextState,
  }
}
