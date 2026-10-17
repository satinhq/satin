/** The axis along which a scroll surface accepts scrolling. */
export type ScrollAxis = 'horizontal' | 'vertical'

/** The scroll position in points along the physical x and y axes. */
export type ScrollOffset = Readonly<{
  x: number
  y: number
}>

export type ScrollSnapshot = ReadonlyMap<string, ScrollOffset>

/** Options for `scrollToTop`: whether to animate. */
export type ScrollToTopOptions = Readonly<{
  animated?: boolean
}>
