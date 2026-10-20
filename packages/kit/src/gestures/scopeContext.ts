// EXPERIMENTAL, PRIVATE. The pane gesture scope an ancestor container (the experimental drawer)
// shares with the panes inside it, so that one scope arbitrates every contact in the pane.

import { createContext } from 'react'
import type { GestureScope } from './ownership.ts'

/** What a pane's content publishes to the container that shares its scope. */
export type PaneContent = Readonly<{
  /** The private native horizontal scroller that every contact in the content binds to. */
  source: HTMLElement | null
  /** A content element that may move without moving `source` (a descendant of it). */
  movable: HTMLElement | null
  /** The content has nothing to go back to (a compact stack at its root). */
  atRoot: () => boolean
}>

/** A pane's shared gesture scope and the content published into it. */
export type PaneGestureScope = Readonly<{
  scope: GestureScope
  publishContent(content: PaneContent | null): void
  content(): PaneContent | null
  /** Whether a participant other than the content's own navigator drives `source` now. The
   * navigator's idle clamp must not reset a source another owner is scrubbing. */
  contentSourceBorrowed(): boolean
}>

export const PaneGestureScopeContext = createContext<PaneGestureScope | undefined>(undefined)

/** Development flag for the scoped back swipe: set `globalThis.__SATIN_GESTURE_SCOPE__ = true`
 * before the app mounts. Off by default; the shipping path is `bindTouchArbitration`. */
export function gestureScopeFlagEnabled() {
  return (globalThis as { __SATIN_GESTURE_SCOPE__?: unknown }).__SATIN_GESTURE_SCOPE__ === true
}
