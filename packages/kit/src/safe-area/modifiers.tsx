import { startsScreenContent } from '../scroll/screenGeometry.ts'
import { SafeAreaInset, type SafeAreaInsetProps } from './SafeAreaInset.tsx'
import {
  ContentMarginsContext,
  IgnoresSafeAreaContext,
  NO_LENGTHS,
  SafeAreaPaddingContext,
  type Edge,
  type EdgeLengths,
  type Lengths,
} from './context.ts'
import { useContext, useLayoutEffect, useRef, type HTMLAttributes, type ReactNode } from 'react'

export type { Edge, EdgeLengths } from './context.ts'

/** A logical edge, an axis pair or all edges. */
export type EdgeSetMember = Edge | 'horizontal' | 'vertical' | 'all'
/** One edge group or a list of them. */
export type EdgeSet = EdgeSetMember | readonly EdgeSetMember[]

/** Default padding used when no length is supplied. */
const SYSTEM_PADDING_PX = 16

function edgesOf(set: EdgeSet): ReadonlySet<Edge> {
  const edges = new Set<Edge>()
  for (const member of typeof set === 'string' ? [set] : set) {
    if (member === 'all' || member === 'vertical') edges.add('top').add('bottom')
    if (member === 'all' || member === 'horizontal') edges.add('leading').add('trailing')
    if (member !== 'all' && member !== 'vertical' && member !== 'horizontal') edges.add(member)
  }
  return edges
}

function lengthsOf(
  edges: EdgeSet | undefined,
  length: number | undefined,
  insets: EdgeLengths | undefined,
): Lengths {
  if (insets) return { ...NO_LENGTHS, ...insets }
  const set = edgesOf(edges ?? 'all')
  const amount = length ?? SYSTEM_PADDING_PX
  return {
    top: set.has('top') ? amount : 0,
    bottom: set.has('bottom') ? amount : 0,
    leading: set.has('leading') ? amount : 0,
    trailing: set.has('trailing') ? amount : 0,
  }
}

/** The children and plain div attributes every layout wrapper takes. */
export type LayoutModifierProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> &
  Readonly<{ children?: ReactNode }>

/** Which edges to pad, and by how much. */
export type SafeAreaPaddingProps = LayoutModifierProps &
  Readonly<{
    /** Edges to pad. Defaults to all edges. */
    edges?: EdgeSet
    /** Points. Defaults to the system padding, 16 pt. */
    length?: number
    /** A length per edge. Overrides `edges` and `length`. */
    insets?: EdgeLengths
  }>

/** Grows the safe area of the content inside it. Scroll views keep their frame and inset their
 * content; other content is padded. Nested padding adds up. */
export function SafeAreaPadding({
  edges,
  length,
  insets,
  children,
  ...props
}: SafeAreaPaddingProps) {
  const parent = useContext(SafeAreaPaddingContext)
  const own = lengthsOf(edges, length, insets)
  const total: Lengths = {
    top: parent.top + own.top,
    bottom: parent.bottom + own.bottom,
    leading: parent.leading + own.leading,
    trailing: parent.trailing + own.trailing,
  }
  return (
    <div
      {...props}
      style={{
        ...props.style,
        ['--satin-padding-top' as string]: `${own.top}px`,
        ['--satin-padding-bottom' as string]: `${own.bottom}px`,
        ['--satin-padding-leading' as string]: `${own.leading}px`,
        ['--satin-padding-trailing' as string]: `${own.trailing}px`,
      }}
      data-satin-safe-area-padding="true"
    >
      <SafeAreaPaddingContext value={total}>{children}</SafeAreaPaddingContext>
    </div>
  )
}

/** Which edges get a margin, how much, and whether it applies to content or indicators. */
export type ContentMarginsProps = LayoutModifierProps &
  Readonly<{
    edges?: EdgeSet
    /** Points. */
    length: number
    /**
     * What the margin applies to. `scrollContent` (and `automatic`) margins the content;
     * `scrollIndicators` only moves the indicator, which Satin draws in the screen frame and does
     * not inset, so it has no effect yet.
     */
    placement?: 'automatic' | 'scrollContent' | 'scrollIndicators'
  }>

/** Sets content margins for every scroll view inside it. A `List` takes a horizontal margin as its
 * layout margin. The innermost value for each edge wins. */
export function ContentMargins({
  edges = 'all',
  length,
  placement = 'automatic',
  children,
  ...props
}: ContentMarginsProps) {
  const parent = useContext(ContentMarginsContext)
  const set = edgesOf(edges)
  const margins: Record<string, number> = { ...parent }
  if (placement !== 'scrollIndicators') for (const edge of set) margins[edge] = length
  return (
    <div {...props} data-satin-content-margins="true">
      <ContentMarginsContext value={margins}>{children}</ContentMarginsContext>
    </div>
  )
}

/** A `SafeAreaInset` limited to the top or bottom edge, with no spacing. */
export type SafeAreaBarProps = Omit<SafeAreaInsetProps, 'edge' | 'spacing'> &
  Readonly<{ edge: 'top' | 'bottom' }>

/** A bar on the top or bottom edge that content scrolls under. It is a `SafeAreaInset` with no
 * spacing and its own scroll-edge blur. */
export function SafeAreaBar({ edge, ...props }: SafeAreaBarProps) {
  return <SafeAreaInset {...props} edge={edge} spacing={0} data-satin-safe-area-bar={edge} />
}

/** Which safe-area regions and edges the content ignores. */
export type IgnoresSafeAreaProps = LayoutModifierProps &
  Readonly<{
    /** `container` (the bars and screen edges), `keyboard`, or `all`, the default. */
    regions?: 'all' | 'container' | 'keyboard'
    /** Defaults to all edges. */
    edges?: EdgeSet
  }>

/** Lets content extend through the safe area on the chosen edges, for full-bleed backgrounds and
 * media. The container edges and keyboard avoidance can be ignored separately. */
export function IgnoresSafeArea({
  regions = 'all',
  edges = 'all',
  children,
  ...props
}: IgnoresSafeAreaProps) {
  const parent = useContext(IgnoresSafeAreaContext)
  const set = edgesOf(edges)
  const container = regions === 'keyboard' ? new Set<Edge>() : set
  const keyboard = regions !== 'container' && set.has('bottom')
  const element = useRef<HTMLDivElement>(null)
  // Only a view that reaches the safe edge extends past it.
  useLayoutEffect(() => {
    const node = element.current
    if (!node) return
    const position = getComputedStyle(node).position
    // An out-of-flow view (a full-screen background) has no slot to keep: it only grows upward.
    const overlay = position === 'absolute' || position === 'fixed'
    node.dataset.satinTouchesTop = String(
      container.has('top') && (overlay || startsScreenContent(node)),
    )
    node.dataset.satinIgnoresOverlay = String(overlay)
  })
  return (
    <div
      {...props}
      ref={element}
      data-satin-safe-area-modifier="ignores"
      data-satin-ignores-safe-area-edges={[...container].join(' ') || undefined}
    >
      <IgnoresSafeAreaContext
        value={{
          container: new Set([...parent.container, ...container]),
          keyboard: parent.keyboard || keyboard,
        }}
      >
        {children}
      </IgnoresSafeAreaContext>
    </div>
  )
}
