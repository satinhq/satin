import { useLayoutEffect, useRef, type RefObject } from 'react'
import type { ScrollSurfaceRegistry } from './registry.ts'
import { installScrollIndicator } from './scrollIndicator.ts'

/** Runs in the frame owner so ancestor refs are attached before its layout effect. */
export function usePrimaryScrollIndicator(
  frame: RefObject<HTMLElement | null>,
  registry: ScrollSurfaceRegistry,
  mode: 'screen' | 'sheet' = 'screen',
  active = true,
) {
  const trackRef = useRef<HTMLSpanElement>(null)
  const thumbRef = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const element = frame.current
    const track = trackRef.current
    const thumb = thumbRef.current
    if (!element || !track || !thumb) return
    let indicated: HTMLElement | undefined
    let releaseIndicator: (() => void) | undefined
    const update = () => {
      const primary = registry.getPrimary()
      if (mode === 'screen') element.dataset.satinScreenScroll = primary ? 'primary' : 'none'
      const scroller =
        active && primary?.axis === 'vertical' && primary.element instanceof HTMLElement
          ? primary.element
          : undefined
      element.dataset.satinScrollIndicatorOwner = scroller ? 'primary' : 'none'
      if (scroller === indicated) return
      releaseIndicator?.()
      indicated = scroller
      // Navigation chrome follows primary replacement; scrolling alone must not rebind it.
      if (mode === 'screen')
        element.dispatchEvent(new CustomEvent('satin:primary-scroll', { bubbles: true }))
      releaseIndicator = scroller
        ? installScrollIndicator(scroller, { frame: element, track, thumb, mode })
        : undefined
    }
    update()
    const unsubscribe = registry.subscribe(update)
    return () => {
      unsubscribe()
      releaseIndicator?.()
    }
  }, [frame, registry, mode, active])
  return (
    <span aria-hidden="true" data-satin-scroll-indicator-track="true" ref={trackRef}>
      <span data-satin-scroll-indicator-thumb="true" ref={thumbRef} />
    </span>
  )
}
