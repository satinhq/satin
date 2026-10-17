import { GlassBackground } from '../glass/GlassEffect.tsx'
import { useSafeAreaMetrics } from '../safe-area/useSafeAreaMetrics.ts'
import { useLayoutEffect, useState, type RefObject, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Suggestions belong to their field, including when it lives in a split column. */
export function SearchSuggestionsPopover({
  anchor,
  children,
}: {
  anchor: RefObject<HTMLElement | null>
  children: ReactNode
}) {
  const metrics = useSafeAreaMetrics()
  const [frame, setFrame] = useState<{ left: number; top: number; width: number }>()
  useLayoutEffect(() => {
    const element = anchor.current
    if (!element) return
    const update = () => {
      const rect = element.getBoundingClientRect()
      const next = { left: Math.max(8, rect.left - 10), top: rect.bottom + 6, width: rect.width }
      setFrame(previous =>
        previous &&
        previous.left === next.left &&
        previous.top === next.top &&
        previous.width === next.width
          ? previous
          : next,
      )
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    window.addEventListener('resize', update)
    document.addEventListener('scroll', update, true)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
      document.removeEventListener('scroll', update, true)
    }
  }, [anchor])
  if (!frame) return null
  return createPortal(
    <div
      data-satin-search-popover=""
      style={{
        ...frame,
        maxHeight: Math.max(
          0,
          metrics.visualViewport.offsetTop + metrics.visualViewport.height - frame.top - 8,
        ),
        overflowY: 'auto',
      }}
      role="list"
      aria-label="Suggestions"
      onPointerDown={event => event.preventDefault()}
    >
      <GlassBackground shape={{ kind: 'roundedRectangle', cornerRadius: 28 }} />
      {children}
    </div>,
    document.body,
  )
}
