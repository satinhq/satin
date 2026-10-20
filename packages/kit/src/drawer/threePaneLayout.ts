// EXPERIMENTAL, PRIVATE. Width-adaptive arrangement for a sidebar, a content list and a detail
// pane (owner decision 2, Oct 20): columns adapt to the available width, not orientation.

import { sidebarTokens } from '../settings/tokens.ts'

/**
 * PROVISIONAL content-fit minimums, in points. The sidebar is the existing measured split
 * sidebar width. The content minimum reuses it. The detail minimum is a placeholder chosen
 * inside the bracket that native full-window iPad Mail and Notes stills imply
 * (two columns at 1024 pt, three at 1366 pt): more than 384 and at most 726. It is not a
 * measured native breakpoint; measure resized windows before adopting it.
 */
export const PROVISIONAL_COLUMN_MINIMUMS = Object.freeze({
  sidebar: sidebarTokens.width,
  content: sidebarTokens.width,
  detail: 420,
  separator: 0.5,
})

export type ThreePaneArrangement = 'compact' | 'three-columns' | 'two-columns'

export type ThreePaneLayout = Readonly<{
  arrangement: ThreePaneArrangement
  /** The sidebar is a temporary drawer above the content (not a column). */
  sidebarTemporary: boolean
}>

export function chooseThreePaneLayout(
  availableWidth: number,
  sidebarHidden: boolean,
  minimums = PROVISIONAL_COLUMN_MINIMUMS,
): ThreePaneLayout {
  const twoColumns = minimums.content + minimums.separator + minimums.detail
  const threeColumns = minimums.sidebar + minimums.separator + twoColumns
  if (availableWidth >= threeColumns) {
    // A remembered hide preference keeps the sidebar reachable as a temporary drawer.
    return { arrangement: 'three-columns', sidebarTemporary: sidebarHidden }
  }
  if (availableWidth >= twoColumns) return { arrangement: 'two-columns', sidebarTemporary: true }
  return { arrangement: 'compact', sidebarTemporary: true }
}
