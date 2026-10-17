import { forwardRef, type HTMLAttributes } from 'react'
import { ScrollSurface } from '../scroll/ScrollSurface.tsx'
import type { ScrollDismissesKeyboardMode } from '../keyboard/adapter.ts'
import type { TaskAction } from '../tasks/useTask.ts'
import type {
  ScrollAnchor,
  ScrollPositionBinding,
  VerticalScrollGeometry,
} from '../scroll/position.ts'
import type {
  ScrollEdgeEffectHidden,
  ScrollEdgeEffectStyleSelection,
} from '../scroll/edgePolicy.ts'
import type { ScrollOffset, ScrollToTopOptions } from '../scroll/types.ts'

/** A scroll view's ref handle: its current offset, `scrollTo` a target and `scrollToTop`. */
export interface ScrollViewHandle {
  readonly offset: ScrollOffset
  /** Position a vertical ScrollTarget. Horizontal target positioning is unsupported. */
  scrollTo(id: string, anchor?: ScrollAnchor): boolean
  scrollToTop(options?: ScrollToTopOptions): void
}
/** A scroll view's id, axis, refresh action, keyboard dismissal, edge material and position
 * options. Targets, refresh and geometry work only on the vertical axis. */
export type ScrollViewProps = Omit<HTMLAttributes<HTMLDivElement>, 'id'> & {
  id: string
  chain?: boolean
  primary?: boolean
  scrollDismissesKeyboard?: ScrollDismissesKeyboardMode
  scrollEdgeEffectHidden?: ScrollEdgeEffectHidden
  scrollEdgeEffectStyle?: ScrollEdgeEffectStyleSelection
} & (
    | {
        axis?: 'vertical'
        refreshable?: TaskAction
        defaultScrollAnchor?: 'top' | 'bottom'
        maintainVisibleContentPosition?: boolean
        scrollPosition?: ScrollPositionBinding
        onScrollGeometryChange?: (geometry: VerticalScrollGeometry) => void
      }
    | {
        axis: 'horizontal'
        refreshable?: never
        defaultScrollAnchor?: never
        maintainVisibleContentPosition?: never
        scrollPosition?: never
        onScrollGeometryChange?: never
      }
  )
/** A scrolling region, vertical by default. Inside a screen its `id` keys scroll restoration, so
 * keep it stable. `refreshable` adds pull to refresh, and a ref handle scrolls to a
 * `ScrollTarget`. */
export const ScrollView = forwardRef<ScrollViewHandle, ScrollViewProps>(
  function ScrollView(props, ref) {
    return <ScrollSurface {...props} ref={ref} />
  },
)
