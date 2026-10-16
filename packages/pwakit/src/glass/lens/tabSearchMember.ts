import type { CapsuleShape } from '../renderSpecs.ts'

/**
 * The trailing Search member of a minimizing tab bar (`Tab(role: .search)` on iPhone).
 *
 * Native reference: stock SwiftUI on iOS 27.0, iPhone 17 Pro Max (search-tab-split, Simulator
 * tracks at 60 Hz) and the owner's Apple Music recording on a physical iPhone. On collapse the
 * bar's trailing end separates into its own capsule within one or two frames: at the split it
 * spans x = 339–413 of the 21–419 bar, full height. It then narrows from its leading edge into
 * the 48 pt circle at x = 364–412 while the rest of the bar retracts into the leading shortcut.
 * Expansion runs the other way: the circle widens back towards the bar and the growing bar
 * merges with it. One glass field draws both members, so the parting and the merge are the
 * field's smooth union, not a crossfade.
 */

/** Width of the trailing piece that separates from the bar (native: 419 − 339 pt). */
export const SEARCH_SPLIT_WIDTH = 80
/** Diameter of the minimized Search circle. */
export const SEARCH_CIRCLE_SIZE = 48

/**
 * The Search member's leading edge is a damped spring (mass 1). Fitted to the leading edge of
 * the separated capsule in three dark collapse recordings (b, a, Library selected):
 * stiffness 960, damping 52 (damping ratio 0.84), starting 12 ms after the bar's first painted
 * change; RMS 0.05 of the 25 pt travel. Expansion reuses the same spring from the bar's onset.
 */
const SEARCH_STIFFNESS = 960
const SEARCH_DAMPING = 52
export const SEARCH_SPLIT_DELAY_MS = 12
/** After this the spring is within 0.1% of its target; return the target exactly. */
const SEARCH_SETTLE_MS = 400

/** Normalized step response of the fitted spring: 0 at the start, 1 at rest. */
function springStep(milliseconds: number) {
  if (milliseconds <= 0) return 0
  if (milliseconds >= SEARCH_SETTLE_MS) return 1
  const seconds = milliseconds / 1000
  const natural = Math.sqrt(SEARCH_STIFFNESS)
  const ratio = SEARCH_DAMPING / (2 * natural)
  const damped = natural * Math.sqrt(1 - ratio * ratio)
  const decay = Math.exp(-ratio * natural * seconds)
  return (
    1 -
    decay * (Math.cos(damped * seconds) + ((ratio * natural) / damped) * Math.sin(damped * seconds))
  )
}

/**
 * How far the Search member has gone from the bar's trailing end (0) to the circle (1),
 * `milliseconds` after its motion starts, beginning at the presented value `from`.
 */
export function searchMemberProgress(from: number, to: number, milliseconds: number) {
  return from + (to - from) * springStep(milliseconds)
}

export type SearchMemberGeometry = {
  /** Width and height of the tab bar's own frame (the expanded bar). */
  dockWidth: number
  dockHeight: number
  /** Compact members' inset from the bar's edges; negative for a centred intrinsic platter. */
  inset: number
}

/**
 * The Search member in the tab bar's frame. `progress` is the member's own spring; the height
 * and trailing inset follow the bar's height channel so the two members part at the same height
 * and keep concentric trailing caps.
 */
export function searchMemberShape(
  progress: number,
  heightProgress: number,
  { dockWidth, dockHeight, inset }: SearchMemberGeometry,
): CapsuleShape {
  // The bar overshoots past its resting size on expansion (heightProgress below 0). It then
  // contains the Search member, which stays within the resting bar instead of bulging out.
  const settled = Math.max(0, heightProgress)
  const right = dockWidth - inset * settled
  const splitLeft = dockWidth - SEARCH_SPLIT_WIDTH
  const circleLeft = dockWidth - inset - SEARCH_CIRCLE_SIZE
  const left = splitLeft + (circleLeft - splitLeft) * progress
  const height = dockHeight + (SEARCH_CIRCLE_SIZE - dockHeight) * settled
  return {
    centerX: (left + right) / 2,
    centerY: dockHeight / 2,
    halfWidth: (right - left) / 2,
    halfHeight: height / 2,
    radius: height / 2,
  }
}

/** Centre of the minimized Search circle in the tab bar's frame. */
export function searchCircleCentre({ dockWidth, inset }: SearchMemberGeometry) {
  return dockWidth - inset - SEARCH_CIRCLE_SIZE / 2
}
