import { useCallback, useLayoutEffect, useRef, type HTMLAttributes } from 'react'
import { boundZoom, pinchZoom, type ZoomPoint, type ZoomTransform } from './geometry.ts'

/** Zoomable's maximum scale and scale callback; Satin owns its pointer handlers. */
export interface ZoomableProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel' | 'onLostPointerCapture'
> {
  /** Maximum content magnification. Page scale always remains one. */
  maxScale?: number
  onScaleChange?: (scale: number) => void
}
/** A bounded image/map viewport. Pinch and pan belong only to this content role.
 * Keyboard + / - zoom about the center; 0 resets. Supply an accessible label. */
export function Zoomable({
  children,
  maxScale = 4,
  onScaleChange,
  style,
  onKeyDown,
  ...props
}: ZoomableProps) {
  if (!Number.isFinite(maxScale) || maxScale < 1)
    throw new Error('Zoomable maxScale must be finite and at least 1.')
  const scaleObserver = useRef(onScaleChange)
  useLayoutEffect(() => {
    scaleObserver.current = onScaleChange
  }, [onScaleChange])
  const hostRef = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const transform = useRef<ZoomTransform>({ scale: 1, x: 0, y: 0 })
  const pointers = useRef(new Map<number, ZoomPoint>())
  const gesture = useRef<{ center: ZoomPoint; distance: number; transform: ZoomTransform } | null>(
    null,
  )
  const sample = () => {
    const points = [...pointers.current.values()]
    if (!points.length) return null
    const a = points[0]!,
      b = points[1] ?? a
    return {
      center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      distance: Math.hypot(a.x - b.x, a.y - b.y),
    }
  }
  const rebase = () => {
    const current = sample()
    gesture.current = current ? { ...current, transform: transform.current } : null
  }
  const paint = useCallback(
    (host: HTMLDivElement, next: ZoomTransform) => {
      const value = boundZoom(next, host.clientWidth, host.clientHeight, maxScale)
      transform.current = value
      if (content.current)
        content.current.style.transform = `translate(${value.x}px, ${value.y}px) scale(${value.scale})`
      host.dataset.satinZoomScale = String(value.scale)
      scaleObserver.current?.(value.scale)
    },
    [maxScale],
  )
  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    const observer = new ResizeObserver(() => {
      paint(host, transform.current)
      pointers.current.clear()
      gesture.current = null
    })
    observer.observe(host)
    return () => observer.disconnect()
  }, [paint])
  return (
    <div
      {...props}
      ref={hostRef}
      aria-keyshortcuts="+ - 0"
      tabIndex={props.tabIndex ?? 0}
      role={props.role ?? 'region'}
      data-satin-role="zoomable"
      data-satin-zoom-scale="1"
      style={{ ...style, touchAction: 'none', overflow: 'hidden' }}
      onPointerDown={event => {
        if (event.pointerType === 'mouse' && event.button !== 0) return
        if (pointers.current.size >= 2) return
        const bounds = event.currentTarget.getBoundingClientRect()
        pointers.current.set(event.pointerId, {
          x: event.clientX - bounds.left,
          y: event.clientY - bounds.top,
        })
        event.currentTarget.setPointerCapture(event.pointerId)
        rebase()
      }}
      onPointerMove={event => {
        if (!pointers.current.has(event.pointerId)) return
        const bounds = event.currentTarget.getBoundingClientRect()
        pointers.current.set(event.pointerId, {
          x: event.clientX - bounds.left,
          y: event.clientY - bounds.top,
        })
        const current = sample(),
          start = gesture.current
        if (!current || !start) return
        const ratio = start.distance > 0 ? current.distance / start.distance : 1
        // Clamp the ratio before anchor calculation, so limits do not make content jump.
        const bounded =
          Math.max(1, Math.min(maxScale, start.transform.scale * ratio)) / start.transform.scale
        paint(
          event.currentTarget,
          pinchZoom(start.transform, start.center, current.center, bounded),
        )
      }}
      onPointerUp={event => {
        pointers.current.delete(event.pointerId)
        rebase()
      }}
      onPointerCancel={event => {
        pointers.current.delete(event.pointerId)
        rebase()
      }}
      onLostPointerCapture={event => {
        pointers.current.delete(event.pointerId)
        rebase()
      }}
      onKeyDown={event => {
        onKeyDown?.(event)
        if (
          event.defaultPrevented ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey ||
          event.nativeEvent.isComposing ||
          !['+', '=', '-', '0'].includes(event.key)
        )
          return
        const target = event.target
        const editor =
          target instanceof Element
            ? target.closest('input, textarea, select, [contenteditable]')
            : null
        if (
          editor &&
          (editor.matches('input, textarea, select') ||
            editor.getAttribute('contenteditable')?.toLowerCase() !== 'false')
        )
          return
        event.preventDefault()
        const host = event.currentTarget
        if (event.key === '0') paint(host, { scale: 1, x: 0, y: 0 })
        else {
          const center = { x: host.clientWidth / 2, y: host.clientHeight / 2 }
          const scale = Math.max(
            1,
            Math.min(maxScale, transform.current.scale * (event.key === '-' ? 1 / 1.25 : 1.25)),
          )
          paint(host, pinchZoom(transform.current, center, center, scale / transform.current.scale))
        }
        rebase()
      }}
    >
      <div ref={content} data-satin-zoom-content="true">
        {children}
      </div>
    </div>
  )
}
