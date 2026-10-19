import {
  useContext,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { GlassMaterialContext } from '../glass/context.ts'
import { ToolbarContext } from '../public/toolbar.tsx'
import { ListContext } from '../list-form/listContext.ts'

/** Shared detached control aperture. Search's material remains owned by the tab morph. */
export function TabTrailingSlot({
  children,
  kind,
  style,
  topAnchor,
  inert,
}: {
  children: ReactNode
  kind: 'action' | 'compact-search'
  style?: CSSProperties
  topAnchor?: RefObject<HTMLElement | null>
  inert?: boolean
}) {
  const slot = useRef<HTMLDivElement>(null)
  const chromeLayer = useContext(GlassMaterialContext)?.chromeLayer
  useLayoutEffect(() => {
    const anchor = topAnchor?.current
    const element = slot.current
    if (!anchor || !element || !chromeLayer) return
    const update = () => {
      const frame = anchor.getBoundingClientRect()
      const host = chromeLayer.getBoundingClientRect()
      element.style.left = `${frame.right - host.left + 8}px`
      element.style.top = `${frame.top - host.top}px`
      element.style.width = `${frame.height}px`
      element.style.height = `${frame.height}px`
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(anchor)
    observer.observe(chromeLayer)
    return () => observer.disconnect()
  }, [topAnchor, chromeLayer])
  const content = (
    <div
      ref={slot}
      inert={inert}
      aria-hidden={inert || undefined}
      data-satin-tab-trailing-slot={kind}
      data-satin-tab-trailing-placement={topAnchor ? 'top' : 'bottom'}
      data-satin-tab-compact-search={kind === 'compact-search' ? 'true' : undefined}
      style={style}
    >
      <ListContext value={false}>
        <ToolbarContext value={kind === 'action'}>{children}</ToolbarContext>
      </ListContext>
    </div>
  )
  return topAnchor ? (chromeLayer ? createPortal(content, chromeLayer) : null) : content
}
