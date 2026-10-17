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

/** The current offset and imperative positioning of a scroll view. */
export interface ScrollViewHandle {
  readonly offset: ScrollOffset
  /** Position a vertical ScrollTarget. Horizontal target positioning is unsupported. */
  scrollTo(id: string, anchor?: ScrollAnchor): boolean
  scrollToTop(options?: ScrollToTopOptions): void
}
/** Scroll policy. Target positioning, refresh and scalar geometry are vertical-only. */
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
/** A scroll surface with framework-owned restoration and native scrolling. */
export const ScrollView = forwardRef<ScrollViewHandle, ScrollViewProps>(
  function ScrollView(props, ref) {
    return <ScrollSurface {...props} ref={ref} />
  },
)
