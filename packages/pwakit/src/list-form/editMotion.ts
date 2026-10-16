import type { SpringParameters } from '../motion/springTrack.ts'

/*
 * Edit mode's row motion, measured from a stock SwiftUI `List` with `onDelete` and `onMove`
 * (iOS 27.0 Simulator, native reference `native list editing fixture native editing fixture`, five Edit/Done toggles, frame counter
 * retimed: 0 skipped refreshes of 922; fits in native measurements).
 *
 * - The content shifts by the controls' width on one critically damped spring in both directions
 *   (response 0.29 s; RMS 0.32 pt entering, 0.43 pt leaving).
 * - The delete and selection controls ride with the content, clipped by the row, and fade with
 *   the same progress (opacity tracked position within 0.02).
 * - The reorder handle slides in from 44 pt beyond its place and fades on the same spring.
 */
export const EDIT_MODE_SPRING: SpringParameters = { stiffness: 474, damping: 43.5 }

/** Width of each leading editing control's column: the delete and selection circles. */
export const EDIT_CONTROL_COLUMN = 40

/** Space the reorder handle takes from the row's trailing content (21 pt handle and its gap). */
export const REORDER_HANDLE_INSET = 32

/** How far the reorder handle travels as it appears. */
export const REORDER_HANDLE_TRAVEL = 44

/**
 * Rows a dragged row crosses move out of its way on this spring (`native editing fixture` held drag, one
 * crossing, 17 refreshes, RMS 0.49 pt). The dropped row settles on it too.
 */
export const REORDER_SPRING: SpringParameters = { stiffness: 332, damping: 30.6 }

/** The lifted row's shadow fades over this long after the drop (33 refreshes). */
export const REORDER_DROP_SHADOW_MS = 550
