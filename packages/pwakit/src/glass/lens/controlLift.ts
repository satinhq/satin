import type { InteractivePressProfile } from './interactivePress.ts'
import { TAB_INTERACTIVE_MOTION, type TabHeldGeometry } from './tabMotion.ts'
import { SCOPE_THUMB } from './scopeSegments.ts'
export { SCOPE_THUMB } from './scopeSegments.ts'
/**
 * The held glass lens of a Toggle or Slider thumb. Measured 2026-10-09 on stock SwiftUI controls
 * (iPhone 17 Pro Max Simulator, iOS 27.0, dark; counter-retimed idb contacts; `pooled-response-models.json`): a stationary hold keeps the 37 × 24 pt
 * white thumb for about 333 ms, then the thumb becomes a clear lens that springs to its held size.
 * Release restores the size with a slower spring. Mass is 1; width and height share one response.
 * These are equivalent curve fits from one capture per control, not Apple's constants.
 */
export const CONTROL_LIFT = {
  /** Stationary contact before the lens lifts (±one 60 Hz refresh). */
  activationMs: 333,
  rest: { width: 37, height: 24 },
  toggle: {
    held: { width: 58.17, height: 39 },
    press: { stiffness: 1058.46, damping: 36.5068 },
    release: { stiffness: 213.65, damping: 21.7567 },
  },
  /** Continuous, stepped and tick-mark Sliders share one response and an approximate size. */
  slider: {
    held: { width: 58, height: 37.3 },
    press: { stiffness: 753.52, damping: 32.114 },
    release: { stiffness: 168.73, damping: 18.7196 },
  },
  /** A short Toggle tap moves the white thumb end to end (22 pt) with this spring and no lift. */
  tap: { stiffness: 974.23, damping: 86.2111 },
} as const
export type ControlLiftKind = 'toggle' | 'slider'
/** The lift springs start at activation: the page owns the hold delay. */
export function controlLiftProfile(kind: ControlLiftKind): InteractivePressProfile {
  return { delayMs: 0, press: CONTROL_LIFT[kind].press, release: CONTROL_LIFT[kind].release }
}
/** The thumb position spring (0 = off end, 1 = on end) after a tap or a released drag. */
export const CONTROL_THUMB_POSITION: InteractivePressProfile = {
  delayMs: 0,
  press: CONTROL_LIFT.tap,
  release: CONTROL_LIFT.tap,
}
/** Lens size in points at lift `amount` (0 rest, 1 held; the springs overshoot past 1). */
export function controlLensSize(kind: ControlLiftKind, amount: number) {
  const { rest } = CONTROL_LIFT
  const { held } = CONTROL_LIFT[kind]
  return {
    width: rest.width + (held.width - rest.width) * amount,
    height: rest.height + (held.height - rest.height) * amount,
  }
}
/**
 * The search scope bar's selection thumb: the tab bar's selection (TabMotion and the shared lift)
 * with the scope bar's own parameters. The pill is drawn by the glass renderer 4 pt inside the
 * 36 pt bar, 28 pt tall (scope thumb measurement, 2026-10-10: iPad ReplayKit 60 fps, `scope-light-5` /
 * `scope-dark-7`, header-styles two-scope bar, iPadOS 27.0).
 *
 * A press lifts it into a clear lens taller than the bar and a little wider than the pill; the
 * finger can drag the lens along the bar and it snaps to the nearest segment on release; a tap
 * lifts, travels and settles on the same spring. Geometry: `scopeSegments.ts`. Neither pill nor
 * lens passes the bar's ends
 * (the lens's outer edge stops at the bar's). Measured 2026-10-13: iPad ReplayKit
 * hold/drag captures and a four-scope iPhone 17 Pro Max Simulator fixture.
 * Curve fits, not Apple's constants.
 */
/** The tap slide (mass 1, pooled light + dark fit, ζ 0.62, ~8% overshoot). */
export const SCOPE_THUMB_SLIDE = { stiffness: 103.47, damping: 12.656 } as const
/** The scope thumb's TabMotion parameters: the interactive tab's press, follow and release
 * clocks with the scope bar's measured slide. */
export const SCOPE_THUMB_MOTION = Object.freeze({
  ...TAB_INTERACTIVE_MOTION,
  ...SCOPE_THUMB_SLIDE,
})
/** The held lens over the pill: taller than the bar, wider than its segment, centred on it, and
 * never past the bar's ends. */
export const SCOPE_THUMB_HELD: TabHeldGeometry = Object.freeze({
  widthDelta: 30,
  height: SCOPE_THUMB.lensHeight,
  edgeShift: 0,
  edgeOverflow: 0,
  minHeight: SCOPE_THUMB.height,
})
