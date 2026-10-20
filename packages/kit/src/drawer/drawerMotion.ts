// EXPERIMENTAL, PRIVATE. Geometry, track mappings and provisional constants for the
// experimental sidebar drawer. Every number here is PROVISIONAL: no native sidebar motion has
// been measured yet (owner decision, October 20, 2026).

import type { SpringParameters } from '../motion/springTrack.ts'
import {
  NAVIGATION_DIRECTION_LOCK_PX,
  NAVIGATION_POSITION_THRESHOLD,
  NAVIGATION_VELOCITY_THRESHOLD_PX_PER_SECOND,
} from '../navigation/motionTokens.ts'

/**
 * PROVISIONAL geometry candidates from the sidebar study (320 / 56 / 24 pt). They are prototype
 * choices, not Apple measurements; replace or confirm them from native captures.
 */
export const PROVISIONAL_DRAWER_GEOMETRY = Object.freeze({
  maxWidth: 320,
  dismissalStrip: 56,
  edgeOpenWidth: 24,
  provenance: 'sidebar design candidates; unmeasured',
})

/** PROVISIONAL settle: the shared framework spring as a labelled stand-in. Native sidebar
 * contact, release, friction and rubber band are unmeasured. */
export const PROVISIONAL_DRAWER_SETTLE: SpringParameters = Object.freeze({
  stiffness: 186.57,
  damping: 25.13,
})

/** PROVISIONAL release decision, borrowed from the back swipe's legacy thresholds. */
export const PROVISIONAL_DRAWER_RELEASE = Object.freeze({
  positionFraction: NAVIGATION_POSITION_THRESHOLD,
  velocityPointsPerSecond: NAVIGATION_VELOCITY_THRESHOLD_PX_PER_SECOND,
  provenance: 'back swipe legacy thresholds (0.425, 317 pt/s); sidebar release unmeasured',
})

/** PROVISIONAL claim distance, borrowed from the back swipe's direction lock. */
export const PROVISIONAL_DRAWER_CLAIM_PX = NAVIGATION_DIRECTION_LOCK_PX

export type DrawerMotion = 'overlay' | 'push' | 'reveal'
export type LayoutDirection = 'ltr' | 'rtl'

/** The drawer's width for a pane: leaves a visible dismissal strip. */
export function drawerWidth(paneWidth: number) {
  const { maxWidth, dismissalStrip } = PROVISIONAL_DRAWER_GEOMETRY
  return Math.max(0, Math.min(maxWidth, paneWidth - dismissalStrip))
}

/** Whether `clientX` lies in the leading-edge open region of a pane. */
export function inLeadingEdge(
  clientX: number,
  pane: Readonly<{ left: number; width: number }>,
  direction: LayoutDirection,
) {
  const { edgeOpenWidth } = PROVISIONAL_DRAWER_GEOMETRY
  if (direction === 'rtl') {
    const right = pane.left + pane.width
    return clientX <= right && clientX > right - edgeOpenWidth
  }
  return clientX >= pane.left && clientX < pane.left + edgeOpenWidth
}

/** +1 when physical rightward travel opens the drawer (left-to-right layouts), else -1. */
export function openingSign(direction: LayoutDirection): 1 | -1 {
  return direction === 'rtl' ? -1 : 1
}

export type DrawerTrackValues = Readonly<{
  panel?: string
  content?: string
  scrimTransform?: string
  scrimOpacity: number
}>

/**
 * Geometry mappings, not easing. `x` is the visible displacement, 0...width, in logical points.
 *
 * - overlay: sidebar translation `x - W`, content stationary;
 * - reveal: sidebar stationary behind the content, content translation `x`;
 * - push: sidebar translation `x - W`, content translation `x`.
 *
 * The scrim covers the content (its dismissal strip) and fades with `x / W`. Right-to-left
 * layouts mirror the horizontal translations only.
 */
export function drawerTrackValues(
  motion: DrawerMotion,
  direction: LayoutDirection,
  width: number,
  x: number,
): DrawerTrackValues {
  const side = openingSign(direction)
  const fraction = width > 0 ? x / width : 0
  const sidebarHidden = `translate3d(${side * (x - width)}px, 0, 0)`
  const contentMoved = `translate3d(${side * x}px, 0, 0)`
  if (motion === 'overlay') return { panel: sidebarHidden, scrimOpacity: fraction }
  if (motion === 'reveal')
    return { content: contentMoved, scrimTransform: contentMoved, scrimOpacity: fraction }
  return {
    panel: sidebarHidden,
    content: contentMoved,
    scrimTransform: contentMoved,
    scrimOpacity: fraction,
  }
}

/** The release decision: where a contact that began at `start` settles. */
export function drawerReleaseOpens(
  start: 'closed' | 'open',
  position: number,
  width: number,
  velocity: number,
) {
  const { positionFraction, velocityPointsPerSecond } = PROVISIONAL_DRAWER_RELEASE
  if (velocity >= velocityPointsPerSecond) return true
  if (velocity <= -velocityPointsPerSecond) return false
  const travelled = start === 'closed' ? position : width - position
  const decisive = travelled >= positionFraction * width
  return start === 'closed' ? decisive : !decisive
}
