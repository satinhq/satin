/** Low-level split composition. Prefer NavigationSplitView for application navigation. */
export { Sidebar, type SidebarProps, type SidebarEntry } from './navigation/Sidebar.tsx'
export { DetailList } from './navigation/DetailList.tsx'
export { useSplitSelection } from './navigation/splitContext.ts'
/** Low-level sidebar artwork. Prefer SymbolImage for application symbols. */
export { SidebarSymbol } from './navigation/SidebarSymbol.tsx'

/** Experimental frame matching only. Ordinary React state changes do not animate. */
export {
  MatchedGeometryEffect,
  type MatchedGeometryEffectProps,
} from './motion/matchedGeometry.tsx'
/** Compatibility exports. New apps import these stable APIs from `@satinhq/kit`. */
export { withAnimation } from './motion/matchedGeometry.tsx'
export { Animation, type SpringOptions } from './motion/animationValue.ts'

export { Transition, type TransitionEdge } from './motion/transition.ts'
export { TransitionView, type TransitionViewProps } from './motion/TransitionView.tsx'
export { GestureView, type GestureViewProps } from './gestures/GestureView.tsx'
export {
  DragGesture,
  LongPressGesture,
  TapGesture,
  MagnifyGesture,
  useGestureState,
  type Gesture,
  type GesturePoint,
  type GestureState,
  type DragGestureOptions,
  type DragGestureValue,
  type LongPressGestureOptions,
  type TapGestureOptions,
  type MagnifyGestureOptions,
  type MagnifyGestureValue,
} from './gestures/gesture.ts'
export { concentricRadius, useDisplayCornerRadius } from './safe-area/displayCorners.ts'
