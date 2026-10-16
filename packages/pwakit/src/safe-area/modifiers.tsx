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
/** `Edge.Set`: one member or several. */
export type EdgeSet = EdgeSetMember | readonly EdgeSetMember[]

/** SwiftUI's default padding amount (`padding()` and `safeAreaPadding()` with no length). */
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

/** The content and standard DOM attributes of a layout modifier wrapper. */
export type LayoutModifierProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> &
  Readonly<{ children?: ReactNode }>

/** Which edges to pad, and by how much. */
export type SafeAreaPaddingProps = LayoutModifierProps &
  Readonly<{
    /** Edges to pad. Defaults to all edges, as `safeAreaPadding()`. */
    edges?: EdgeSet
    /** Points. Defaults to the system padding, 16 pt. */
    length?: number
    /** `safeAreaPadding(_ insets: EdgeInsets)`; overrides `edges` and `length`. */
    insets?: EdgeLengths
  }>

/** Adds to the content safe area. Scroll views keep their frame and inset content; other content is padded. Nested padding adds up. */
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
     * `ContentMarginPlacement`. `scrollContent` (and `automatic`) margins the content;
     * `scrollIndicators` only moves the indicator, which Satin draws in the screen frame and does
     * not inset, so it has no effect yet.
     */
    placement?: 'automatic' | 'scrollContent' | 'scrollIndicators'
  }>

/** Sets margins for descendant scroll views. Lists use horizontal layout margins; the innermost value for each edge wins. */
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

/** Places a top or bottom safe-area inset with no spacing and its own scroll-edge material. */
export function SafeAreaBar({ edge, ...props }: SafeAreaBarProps) {
  return <SafeAreaInset {...props} edge={edge} spacing={0} data-satin-safe-area-bar={edge} />
}

/** Which safe-area regions and edges the content ignores. */
export type IgnoresSafeAreaProps = LayoutModifierProps &
  Readonly<{
    /** `SafeAreaRegions`. Defaults to `'all'`. */
    regions?: 'all' | 'container' | 'keyboard'
    /** Defaults to all edges. */
    edges?: EdgeSet
  }>

/** Extends content through selected safe-area edges. Container edges and keyboard avoidance can be controlled independently. */
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
  // Only a view that reaches the safe edge extends past it, as SwiftUI's does.
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
