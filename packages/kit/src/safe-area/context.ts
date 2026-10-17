import { createContext } from 'react'

/** A logical edge. `leading` and `trailing` follow the layout direction. */
export type Edge = 'top' | 'bottom' | 'leading' | 'trailing'
/** Optional lengths per logical edge, in points. */
export type EdgeLengths = Readonly<Partial<Record<Edge, number>>>
export type Lengths = Readonly<Record<Edge, number>>

export const NO_LENGTHS: Lengths = { top: 0, bottom: 0, leading: 0, trailing: 0 }

/** Safe-area padding the enclosing modifiers add to the next scroll view's content, per edge. */
export const SafeAreaPaddingContext = createContext<Lengths>(NO_LENGTHS)
/** The content margins in effect for every scroll view below, per edge. */
export const ContentMarginsContext = createContext<EdgeLengths>({})
/** The safe-area regions and edges an enclosing `IgnoresSafeArea` gives up. */
export const IgnoresSafeAreaContext = createContext<{
  container: ReadonlySet<Edge>
  keyboard: boolean
}>({ container: new Set(), keyboard: false })
