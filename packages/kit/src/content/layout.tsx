import {
  Children,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from 'react'
import { TabActivityContext } from '../tabs/context.ts'

/** A width and height in points. */
export interface GeometrySize {
  width: number
  height: number
}
/** A rectangle in points: origin `x` and `y` plus a size. */
export interface GeometryFrame extends GeometrySize {
  x: number
  y: number
}
/** What a `GeometryReader` passes to its children: its size and a way to read its frame. */
export interface GeometryProxy {
  /** The reader's allocated CSS space, in points on the target runtime. */
  size: GeometrySize
  /** Global means layout-viewport coordinates. Pass an element for a named local space. */
  frame(inSpace: 'local' | 'global' | HTMLElement): GeometryFrame
}
/** A `GeometryReader`'s render function, plus plain div attributes. */
export interface GeometryReaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  children(proxy: GeometryProxy): ReactNode
}

/** Fills the space it is offered and calls its children with that size. Its content renders
 * once the first measurement is in. */
export function GeometryReader({ children, style, ...props }: GeometryReaderProps) {
  const host = useRef<HTMLDivElement>(null)
  const active = useContext(TabActivityContext)
  const [size, setSize] = useState<GeometrySize | null>(null)
  useLayoutEffect(() => {
    if (!active) return
    const element = host.current!
    const measure = () => {
      const bounds = element.getBoundingClientRect()
      setSize(previous =>
        previous?.width === bounds.width && previous.height === bounds.height
          ? previous
          : { width: bounds.width, height: bounds.height },
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [active])
  const proxy: GeometryProxy | null = size && {
    size,
    frame(inSpace) {
      const bounds = host.current!.getBoundingClientRect()
      if (inSpace === 'local') return { x: 0, y: 0, width: bounds.width, height: bounds.height }
      const origin = inSpace === 'global' ? { x: 0, y: 0 } : inSpace.getBoundingClientRect()
      return {
        x: bounds.x - origin.x,
        y: bounds.y - origin.y,
        width: bounds.width,
        height: bounds.height,
      }
    },
  }
  return (
    <div
      {...props}
      ref={host}
      data-satin-geometry-reader="true"
      style={{
        position: 'relative',
        flex: '1 1 auto',
        width: '100%',
        height: '100%',
        minWidth: 0,
        minHeight: 0,
        ...style,
      }}
    >
      <div style={{ position: 'absolute', inset: 0 }}>{proxy && children(proxy)}</div>
    </div>
  )
}

/** The axes a `ViewThatFits` candidate must fit along. */
export type ViewThatFitsAxis = 'horizontal' | 'vertical' | 'both'
/** The axes to check, `both` by default, plus plain div attributes. */
export interface ViewThatFitsProps extends HTMLAttributes<HTMLDivElement> {
  in?: ViewThatFitsAxis
}

function idealSize(element: HTMLElement, axis: ViewThatFitsAxis): GeometrySize {
  // CSS has no proposal/ideal-size protocol. Measure without compression, then restore the
  // selected view's real proposal before paint. Never clone or remount a child's React tree.
  const previous = element.style.cssText
  if (axis !== 'vertical') element.style.width = 'max-content'
  if (axis !== 'horizontal') element.style.height = 'max-content'
  element.style.maxWidth = 'none'
  element.style.maxHeight = 'none'
  const bounds = element.getBoundingClientRect()
  element.style.cssText = previous
  return { width: bounds.width, height: bounds.height }
}

/** Shows the first child whose natural size fits the space, or the last child when none fits.
 * It measures again when the space or a child resizes. */
export function ViewThatFits({ in: axis = 'both', children, style, ...props }: ViewThatFitsProps) {
  const host = useRef<HTMLDivElement>(null)
  const parentActive = useContext(TabActivityContext)
  const candidates = Children.toArray(children)
  // Wait for the first fit before activating framework work in any candidate.
  const [selected, setSelected] = useState<number | null>(null)
  useLayoutEffect(() => {
    if (!parentActive) return
    const element = host.current!
    const views = Array.from(
      element.children,
      candidate => candidate.firstElementChild!,
    ) as HTMLElement[]
    const measure = () => {
      const proposal = element.getBoundingClientRect()
      const index = views.findIndex(view => {
        const ideal = idealSize(view, axis)
        return (
          (axis === 'vertical' || ideal.width <= proposal.width) &&
          (axis === 'horizontal' || ideal.height <= proposal.height)
        )
      })
      setSelected(index < 0 ? Math.max(0, views.length - 1) : index)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    views.forEach(view => observer.observe(view))
    document.fonts?.addEventListener('loadingdone', measure)
    return () => {
      observer.disconnect()
      document.fonts?.removeEventListener('loadingdone', measure)
    }
  }, [axis, children, parentActive])
  return (
    <div
      {...props}
      ref={host}
      data-satin-view-that-fits={axis}
      style={{
        position: 'relative',
        display: 'grid',
        placeItems: 'center',
        minWidth: 0,
        minHeight: 0,
        ...style,
      }}
    >
      {candidates.map((child, index) => {
        const active = index === selected
        const candidateStyle: CSSProperties = active
          ? { gridArea: '1 / 1', minWidth: 0, minHeight: 0 }
          : {
              position: 'absolute',
              visibility: 'hidden',
              pointerEvents: 'none',
              inset: 0,
              overflow: 'clip',
            }
        return (
          <div
            key={index}
            data-satin-fit-candidate="true"
            inert={!active}
            aria-hidden={active ? undefined : true}
            style={candidateStyle}
          >
            <div>
              <TabActivityContext value={active && parentActive}>{child}</TabActivityContext>
            </div>
          </div>
        )
      })}
    </div>
  )
}
