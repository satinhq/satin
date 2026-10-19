/** The axis along which a scroll surface accepts scrolling. */
export type ScrollAxis = 'horizontal' | 'vertical'

/** The scroll position in points along the physical x and y axes. */
export type ScrollOffset = Readonly<{
  x: number
  y: number
}>

/** A saved scroll position. `atEnd` marks a bottom-anchored view that was following its
 * bottom when it was saved: restoring it returns to the bottom, wherever that now is. An
 * absolute offset would land in the middle of a thread whose layout changed meanwhile. */
export type ScrollSnapshotOffset = ScrollOffset & Readonly<{ atEnd?: true }>

export type ScrollSnapshot = ReadonlyMap<string, ScrollSnapshotOffset>

/** Options for `scrollToTop`: whether to animate. */
export type ScrollToTopOptions = Readonly<{
  animated?: boolean
}>
