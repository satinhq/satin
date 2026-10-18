import { Children, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react'
import { contentFonts, contentTypography } from './typography.ts'

/** The system text styles, sized as iOS draws them at the default text size. */
export type TextStyle =
  | 'largeTitle'
  | 'title'
  | 'title2'
  | 'title3'
  | 'headline'
  | 'subheadline'
  | 'body'
  | 'callout'
  | 'footnote'
  | 'caption'
  | 'caption2'
/** A font weight, from `ultraLight` to `black`. */
export type FontWeight =
  'ultraLight' | 'thin' | 'light' | 'regular' | 'medium' | 'semibold' | 'bold' | 'heavy' | 'black'
/** Where content sits inside a larger frame. Used by `frame` and `ZStack`. */
export type ContentAlignment =
  | 'center'
  | 'leading'
  | 'trailing'
  | 'top'
  | 'bottom'
  | 'topLeading'
  | 'topTrailing'
  | 'bottomLeading'
  | 'bottomTrailing'
/** A fixed size or size bounds for a view, in points, and how its content aligns inside.
 * `'infinity'` fills the available space. */
export interface ContentFrame {
  width?: number
  height?: number
  minWidth?: number
  minHeight?: number
  maxWidth?: number | 'infinity'
  maxHeight?: number | 'infinity'
  alignment?: ContentAlignment
}
/** The `padding` prop. `true` adds the default 16 pt on every edge, a number pads every edge,
 * and an object pads the edges it names. */
export type ContentPadding =
  | boolean
  | number
  | {
      top?: number
      bottom?: number
      leading?: number
      trailing?: number
      horizontal?: number
      vertical?: number
    }
/** The padding, frame and background props shared by text and stacks. Plain HTML attributes,
 * `style` included, still apply. */
export interface ContentProps extends HTMLAttributes<HTMLElement> {
  padding?: ContentPadding
  frame?: ContentFrame
  background?: CSSProperties['background']
  /** A hierarchical label colour, or any CSS colour. */
  foregroundStyle?: 'primary' | 'secondary' | 'tertiary' | CSSProperties['color']
}
const weights: Record<FontWeight, number> = {
  ultraLight: 100,
  thin: 200,
  light: 300,
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  heavy: 800,
  black: 900,
}
function horizontalAlignment(alignment: ContentAlignment = 'center') {
  if (alignment === 'leading' || alignment.endsWith('Leading')) return 'start'
  if (alignment === 'trailing' || alignment.endsWith('Trailing')) return 'end'
  return 'center'
}
function verticalAlignment(alignment: ContentAlignment = 'center') {
  if (alignment.startsWith('top')) return 'start'
  if (alignment.startsWith('bottom')) return 'end'
  return 'center'
}
function contentStyle({ padding, background, foregroundStyle }: ContentProps): CSSProperties {
  const result: CSSProperties = { background }
  if (foregroundStyle) {
    result.color = ['primary', 'secondary', 'tertiary'].includes(foregroundStyle)
      ? `var(--satin-content-${foregroundStyle})`
      : foregroundStyle
  }
  if (typeof padding === 'number' || padding === true)
    result.padding = padding === true ? 16 : padding
  else if (padding && typeof padding === 'object') {
    result.paddingTop = padding.top ?? padding.vertical
    result.paddingBottom = padding.bottom ?? padding.vertical
    result.paddingInlineStart = padding.leading ?? padding.horizontal
    result.paddingInlineEnd = padding.trailing ?? padding.horizontal
  }
  return result
}
function ContentFrameBox({
  frame,
  background,
  style,
  inline = false,
  children,
}: {
  frame: ContentFrame
  background?: CSSProperties['background']
  style?: CSSProperties
  inline?: boolean
  children: ReactNode
}) {
  const Element = inline ? 'span' : 'div'
  return (
    <Element
      data-satin-content="frame"
      data-satin-content-width={
        frame.width === undefined && frame.maxWidth === 'infinity' ? 'fill' : undefined
      }
      data-satin-content-height={
        frame.height !== undefined ? 'fixed' : frame.maxHeight === 'infinity' ? 'fill' : undefined
      }
      style={{
        display: 'inline-grid',
        width: frame.width ?? (frame.maxWidth === 'infinity' ? '100%' : undefined),
        height: frame.height ?? (frame.maxHeight === 'infinity' ? '100%' : undefined),
        minWidth: frame.minWidth,
        minHeight: frame.minHeight,
        maxWidth: frame.maxWidth === 'infinity' ? undefined : frame.maxWidth,
        maxHeight: frame.maxHeight === 'infinity' ? undefined : frame.maxHeight,
        justifyItems: horizontalAlignment(frame.alignment),
        alignItems: verticalAlignment(frame.alignment),
        background,
        ...style,
      }}
    >
      {children}
    </Element>
  )
}
/** Text's font, weight, design, line limit and alignment. */
export interface TextProps extends ContentProps {
  font?: TextStyle
  fontWeight?: FontWeight
  fontDesign?: 'default' | 'rounded' | 'monospaced'
  lineLimit?: number
  multilineTextAlignment?: 'leading' | 'center' | 'trailing'
  truncationMode?: 'tail'
}
/**
 * Inline text in a system text style. Nested Text inherits its enclosing style unless it sets
 * its own. A `lineLimit` truncates with an ellipsis.
 *
 * @example
 * <Text font="headline" lineLimit={1}>{note.title}</Text>
 */
export function Text({
  font,
  fontWeight,
  fontDesign,
  lineLimit,
  multilineTextAlignment,
  truncationMode = 'tail',
  padding,
  frame,
  background,
  foregroundStyle,
  style,
  ...props
}: TextProps) {
  const metrics = contentTypography[font ?? 'body']
  // A clamped multiline Text advances on UIFont leading; single-line exports
  // keep their measured glyph box. Two subheadline lines are 40 pt, not 36.33.
  const textLineHeight =
    lineLimit !== undefined && lineLimit > 1 ? metrics.lineAdvance : metrics.lineHeight
  // System font keywords follow the device's text size. Keep the single-line
  // box proportional to that resolved font, not the nominal Large-category
  // point size. iPad row-height r78: body 16/19.09375, footnote 12/14.3203125.
  const lineBox =
    lineLimit !== undefined && lineLimit > 1
      ? `${textLineHeight}px`
      : `${textLineHeight / metrics.size}em`
  const lineHeight = `round(up, ${lineBox}, var(--satin-device-pixel, 1px))`
  const layout: CSSProperties = {
    ...({ '--satin-text-line-height': lineHeight } as CSSProperties),
    ...contentStyle({ padding, background: frame ? undefined : background, foregroundStyle }),
    ...(font
      ? {
          font: contentFonts[font],
          lineHeight,
        }
      : {}),
    ...(fontWeight ? { fontWeight: weights[fontWeight] } : {}),
    ...(fontDesign
      ? {
          fontFamily: {
            default: '-apple-system',
            rounded: 'ui-rounded',
            monospaced: 'ui-monospace',
          }[fontDesign],
        }
      : {}),
    ...(multilineTextAlignment
      ? {
          textAlign:
            multilineTextAlignment === 'leading'
              ? 'start'
              : multilineTextAlignment === 'trailing'
                ? 'end'
                : 'center',
        }
      : {}),
  }
  if (lineLimit !== undefined) {
    if (!Number.isInteger(lineLimit) || lineLimit < 1)
      throw new RangeError('Text lineLimit must be a positive integer')
    Object.assign(
      layout,
      lineLimit === 1
        ? {
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textOverflow: { tail: 'ellipsis' }[truncationMode],
          }
        : {
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: lineLimit,
            overflow: 'hidden',
          },
    )
  }
  const content = (
    <span
      {...props}
      data-satin-content="text"
      style={{ ...layout, ...(!frame ? style : undefined) }}
    />
  )
  return frame ? (
    <ContentFrameBox inline frame={frame} background={background} style={style}>
      {content}
    </ContentFrameBox>
  ) : (
    content
  )
}
/** VStack's horizontal alignment and spacing in points. */
export interface VStackProps extends ContentProps {
  alignment?: 'leading' | 'center' | 'trailing'
  spacing?: number
}
/** HStack's vertical alignment and spacing in points. */
export interface HStackProps extends ContentProps {
  alignment?: 'top' | 'center' | 'bottom' | 'firstTextBaseline' | 'lastTextBaseline'
  spacing?: number
}
function Stack({
  axis,
  alignment = 'center',
  spacing,
  padding,
  frame,
  background,
  foregroundStyle,
  style,
  ...props
}: ContentProps & {
  axis: 'vertical' | 'horizontal'
  alignment?: VStackProps['alignment'] | HStackProps['alignment']
  spacing?: number
}) {
  const align = (
    {
      leading: 'start',
      trailing: 'end',
      top: 'start',
      bottom: 'end',
      firstTextBaseline: 'baseline',
      lastTextBaseline: 'last baseline',
      center: 'center',
    } as const
  )[alignment]
  const content = (
    <div
      {...props}
      data-satin-content={axis === 'vertical' ? 'vstack' : 'hstack'}
      data-satin-default-spacing={spacing === undefined ? '' : undefined}
      style={{
        display: 'flex',
        flexDirection: axis === 'vertical' ? 'column' : 'row',
        alignItems: align,
        gap: spacing,
        ...contentStyle({ padding, background: frame ? undefined : background, foregroundStyle }),
        ...(!frame ? style : undefined),
      }}
    />
  )
  return frame ? (
    <ContentFrameBox frame={frame} background={background} style={style}>
      {content}
    </ContentFrameBox>
  ) : (
    content
  )
}
/**
 * Arranges its children in a column. Set `spacing` where it matters: wrappers and custom
 * controls do not pass their children's preferred spacing up to the stack.
 *
 * @example
 * <VStack alignment="leading" spacing={4}><Text font="headline">{title}</Text></VStack>
 */
export function VStack(props: VStackProps) {
  return <Stack {...props} axis="vertical" />
}
/** Arranges its children in a row. Add a `Spacer` to push content to the edges. */
export function HStack(props: HStackProps) {
  return <Stack {...props} axis="horizontal" />
}
/** How ZStack aligns its layers. */
export interface ZStackProps extends ContentProps {
  alignment?: ContentAlignment
}
/** Layers its children in one cell, later children on top. Assistive technology reads them in
 * source order. */
export function ZStack({
  alignment = 'center',
  padding,
  frame,
  background,
  foregroundStyle,
  style,
  ...props
}: ZStackProps) {
  const content = (
    <div
      {...props}
      data-satin-content="zstack"
      style={{
        display: 'grid',
        placeItems: `${verticalAlignment(alignment)} ${horizontalAlignment(alignment)}`.replace(
          'center center',
          'center',
        ),
        ...contentStyle({ padding, background: frame ? undefined : background, foregroundStyle }),
        ...(!frame ? style : undefined),
      }}
    />
  )
  return frame ? (
    <ContentFrameBox frame={frame} background={background} style={style}>
      {content}
    </ContentFrameBox>
  ) : (
    content
  )
}
/** Spacer's minimum length in points. */
export interface SpacerProps extends HTMLAttributes<HTMLDivElement> {
  minLength?: number
}
/** Takes up the free space along its parent stack's axis. */
export function Spacer({ minLength, style, ...props }: SpacerProps) {
  return (
    <div
      {...props}
      aria-hidden="true"
      data-satin-content="spacer"
      style={
        {
          ...(minLength === undefined ? {} : { '--satin-spacer-min': `${minLength}px` }),
          ...style,
        } as CSSProperties
      }
    />
  )
}
/** A hairline across its parent stack's axis. It is decorative, so assistive technology skips
 * it. */
export function Divider({ style, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} aria-hidden="true" data-satin-content="divider" style={style} />
}
/** LazyVStack's layout props. Every child mounts eagerly; use List for long data. */
export type LazyVStackProps = VStackProps
/** LazyHStack's layout props. Every child mounts eagerly; use List for long data. */
export type LazyHStackProps = HStackProps
/** Lays out its children like `VStack`. Every child mounts at once and keeps its state, so use
 * `List` for long data. */
export function LazyVStack(props: LazyVStackProps) {
  return <VStack {...props} data-satin-lazy-stack="vertical" />
}
/** Lays out its children like `HStack`. Every child mounts at once and keeps its state. */
export function LazyHStack(props: LazyHStackProps) {
  return <HStack {...props} data-satin-lazy-stack="horizontal" />
}
/** Options every grid track takes. `spacing` is the gap after this track; `alignment` places
 * content within each cell. */
export interface GridItemOptions {
  spacing?: number
  alignment?: ContentAlignment
}
/** A fixed track's size in points. */
export interface FixedGridItemOptions extends GridItemOptions {
  size: number
}
/** Bounds for a flexible track; the minimum defaults to 10 points. */
export interface FlexibleGridItemOptions extends GridItemOptions {
  minimum?: number
  maximum?: number
}
/** Bounds for an adaptive track, which repeats to fit as many columns or rows as the space
 * allows. A grid with an adaptive track can have no other track. */
export interface AdaptiveGridItemOptions extends GridItemOptions {
  minimum: number
  maximum?: number
}
const gridItemBrand: unique symbol = Symbol('satin.gridItem')
const gridItems = new WeakSet<object>()
/** A validated grid track. Make one with `GridItem.fixed`, `.flexible` or `.adaptive`. */
export type GridItemValue = Readonly<
  { [gridItemBrand]: true } & GridItemOptions &
    (
      | { kind: 'fixed'; size: number }
      | { kind: 'flexible' | 'adaptive'; minimum: number; maximum?: number }
    )
>
function validateGridOptions({ spacing, alignment }: GridItemOptions) {
  if (spacing !== undefined && (!Number.isFinite(spacing) || spacing < 0))
    throw new RangeError('GridItem spacing must be a nonnegative finite number')
  if (
    alignment !== undefined &&
    ![
      'center',
      'leading',
      'trailing',
      'top',
      'bottom',
      'topLeading',
      'topTrailing',
      'bottomLeading',
      'bottomTrailing',
    ].includes(alignment)
  )
    throw new RangeError('Invalid GridItem alignment')
}
function boundedGridItem(
  kind: 'flexible' | 'adaptive',
  options: FlexibleGridItemOptions,
): GridItemValue {
  const { minimum = 10, maximum, spacing, alignment } = options
  validateGridOptions(options)
  if (
    !Number.isFinite(minimum) ||
    minimum < 0 ||
    (maximum !== undefined && (!Number.isFinite(maximum) || maximum < minimum))
  )
    throw new RangeError('GridItem needs finite ordered bounds')
  const item: GridItemValue = Object.freeze({
    [gridItemBrand]: true as const,
    kind,
    minimum,
    maximum,
    spacing,
    alignment,
  })
  gridItems.add(item)
  return item
}
/** Makes grid tracks for `LazyVGrid` and `LazyHGrid`: `fixed`, `flexible` or `adaptive`. Each
 * call validates its options and throws a `RangeError` for bad bounds or spacing. */
export const GridItem = Object.freeze({
  fixed(options: number | FixedGridItemOptions): GridItemValue {
    const { size, spacing, alignment } = typeof options === 'number' ? { size: options } : options
    validateGridOptions({ spacing, alignment })
    if (!Number.isFinite(size) || size < 0)
      throw new RangeError('A fixed GridItem needs a nonnegative finite size')
    const item: GridItemValue = Object.freeze({
      [gridItemBrand]: true as const,
      kind: 'fixed',
      size,
      spacing,
      alignment,
    })
    gridItems.add(item)
    return item
  },
  flexible(options: FlexibleGridItemOptions = {}): GridItemValue {
    return boundedGridItem('flexible', options)
  },
  adaptive(options: AdaptiveGridItemOptions): GridItemValue {
    return boundedGridItem('adaptive', options)
  },
})
function gridTracks(items: readonly GridItemValue[]) {
  if (items.some(item => !gridItems.has(item)))
    throw new TypeError('Grid tracks must be constructed with GridItem.')
  if (!items.length) throw new RangeError('A grid needs at least one GridItem')
  if (items.some(item => item.kind === 'adaptive') && items.length !== 1)
    throw new RangeError(
      'An adaptive GridItem must be the only track; mixed adaptive tracks are not yet supported',
    )
  const gap = items[0]!.spacing ?? 8
  // Unequal gaps are explicit empty tracks. This avoids JS measurement and keeps cell
  // proposals, wrapping and reading order in one native CSS grid transaction.
  const unequal = items.slice(0, -1).some(item => (item.spacing ?? 8) !== gap)
  const tracks = items
    .flatMap((item, index) => {
      const track =
        item.kind === 'fixed'
          ? `${item.size}px`
          : `minmax(${item.minimum}px, ${item.maximum === undefined ? '1fr' : `${item.maximum}px`})`
      const value = item.kind === 'adaptive' ? `repeat(auto-fill, ${track})` : track
      return unequal && index < items.length - 1 ? [value, `${item.spacing ?? 8}px`] : [value]
    })
    .join(' ')
  return { tracks, gap: unequal ? 0 : gap, unequal, adaptive: items[0]!.kind === 'adaptive' }
}
/** The grid's columns and the spacing between rows. Each column sets the gap after itself. */
export interface LazyVGridProps extends ContentProps {
  columns: readonly GridItemValue[]
  alignment?: VStackProps['alignment']
  spacing?: number
}
/** The grid's rows and the spacing between columns. Each row sets the gap after itself. */
export interface LazyHGridProps extends ContentProps {
  rows: readonly GridItemValue[]
  alignment?: 'top' | 'center' | 'bottom'
  spacing?: number
}
function LazyGrid({
  axis,
  items,
  alignment = 'center',
  spacing = 8,
  padding,
  frame,
  background,
  foregroundStyle,
  style,
  children,
  ...props
}: ContentProps & {
  axis: 'vertical' | 'horizontal'
  items: readonly GridItemValue[]
  alignment?: 'leading' | 'center' | 'trailing' | 'top' | 'bottom'
  spacing?: number
}) {
  if (!Number.isFinite(spacing) || spacing < 0)
    throw new RangeError('Grid spacing must be a nonnegative finite number')
  const { tracks, gap, unequal, adaptive } = gridTracks(items)
  const vertical = axis === 'vertical'
  const content = (
    <div
      {...props}
      data-satin-content="grid"
      data-satin-grid-axis={axis}
      style={{
        display: 'grid',
        justifyItems: 'stretch',
        alignItems: 'stretch',
        justifyContent: vertical ? horizontalAlignment(alignment) : 'start',
        alignContent: vertical ? 'start' : verticalAlignment(alignment),
        rowGap: vertical ? spacing : gap,
        columnGap: vertical ? gap : spacing,
        ...(vertical
          ? // WebKit can retain automatic row heights from the previous column
            // widths inside a flex parent. Intrinsic rows recalculate from the
            // tallest complete cell, including captions, at the new proposal.
            { gridTemplateColumns: tracks, gridAutoRows: 'max-content' }
          : { gridTemplateRows: tracks, gridAutoFlow: 'column' }),
        ...contentStyle({ padding, background: frame ? undefined : background, foregroundStyle }),
        ...(!frame ? style : undefined),
      }}
    >
      {Children.toArray(children).map((child, index) => {
        const trackIndex = index % items.length
        const item = items[trackIndex]!
        const placement = adaptive ? undefined : String(trackIndex * (unequal ? 2 : 1) + 1)
        return (
          <div
            key={typeof child === 'object' && 'key' in child ? child.key : index}
            data-satin-grid-cell="true"
            style={{
              display: 'grid',
              minWidth: 0,
              minHeight: 0,
              justifyItems: horizontalAlignment(item.alignment),
              alignItems: verticalAlignment(item.alignment),
              ...(vertical ? { gridColumn: placement } : { gridRow: placement }),
            }}
          >
            {child}
          </div>
        )
      })}
    </div>
  )
  return frame ? (
    <ContentFrameBox frame={frame} background={background} style={style}>
      {content}
    </ContentFrameBox>
  ) : (
    content
  )
}
/** A grid with fixed columns that grows downward. Every child renders at once; use `List` for
 * long data. */
export function LazyVGrid({ columns, ...props }: LazyVGridProps) {
  return <LazyGrid {...props} axis="vertical" items={columns} />
}
/** A grid with fixed rows that grows sideways. Every child renders at once; use `List` for long
 * data. */
export function LazyHGrid({ rows, ...props }: LazyHGridProps) {
  return <LazyGrid {...props} axis="horizontal" items={rows} />
}
