/** `Edge`: a logical edge of a scroll view. */
export type ScrollEdge = 'top' | 'bottom' | 'leading' | 'trailing'
/** One or more scroll edges, or all edges. */
export type ScrollEdgeSelection = ScrollEdge | 'all' | readonly ScrollEdge[]
/** `ScrollEdgeEffectStyle`: the requested edge material treatment. */
export type ScrollEdgeEffectStyle = 'soft' | 'hard' | 'automatic'
/** Whether to hide scroll edge material, optionally for specific edges. */
export type ScrollEdgeEffectHidden = boolean | { hidden: boolean; edges: ScrollEdgeSelection }
/** The scroll edge treatment and the edges to which it applies. */
export type ScrollEdgeEffectStyleSelection =
  ScrollEdgeEffectStyle | { style: ScrollEdgeEffectStyle; edges: ScrollEdgeSelection }

function includesTop(edges: ScrollEdgeSelection) {
  return edges === 'all' || edges === 'top' || (Array.isArray(edges) && edges.includes('top'))
}

/** The navigation engine currently renders only the soft top edge. Other edges have no material. */
export function topScrollEdgePolicy(
  hidden: ScrollEdgeEffectHidden = false,
  selection: ScrollEdgeEffectStyleSelection = 'automatic',
) {
  const style =
    typeof selection === 'string'
      ? selection
      : includesTop(selection.edges)
        ? selection.style
        : 'automatic'
  if (style === 'hard')
    throw new Error('scrollEdgeEffectStyle hard is not supported by the navigation edge renderer.')
  return {
    hidden: typeof hidden === 'boolean' ? hidden : hidden.hidden && includesTop(hidden.edges),
    style,
  }
}
