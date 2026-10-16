import { useLayoutEffect, useRef } from 'react'
import { observeNavigationEdge } from './navigationEdge.ts'

/** A moving page keeps its own edge material until the shared bar takes over at rest. */
export function TransitionEdge({ barHidden }: { barHidden: boolean }) {
  const edgeRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const edge = edgeRef.current
    const page = edge?.closest('[data-satin-navigation-motion-layer]')
    if (!edge || !page) return
    let release: (() => void) | undefined
    const update = () => {
      release?.()
      const scroller = page.querySelector<HTMLElement>('[data-satin-primary="true"]')
      // A presented drawer already owns its material inside this same moving page.
      if (scroller?.hasAttribute('data-satin-search-presented')) {
        edge.setAttribute('data-satin-scroll-edge-visible', 'false')
        edge.style.removeProperty('opacity')
        edge.parentElement?.removeAttribute('data-satin-edge-seam')
        return
      }
      release = observeNavigationEdge(edge, scroller, barHidden)
    }
    update()
    page.addEventListener('satin:primary-scroll', update)
    return () => {
      release?.()
      page.removeEventListener('satin:primary-scroll', update)
    }
  }, [barHidden])
  return (
    <div aria-hidden="true" data-satin-navigation-edge-host="true" data-satin-transition-edge="">
      <div ref={edgeRef} data-satin-scroll-edge="true" />
      <div data-satin-scroll-edge-cap="true" />
      <div data-satin-scroll-edge-seam="true" />
    </div>
  )
}
