import { useContext, useLayoutEffect, useRef, useState } from 'react'
import { ScreenChromeContext, type Slots } from '../public/screenChrome.tsx'

type TitlePlacement = 'subtitle' | 'largeTitle' | 'largeSubtitle'

/** Title content keeps its screen's React context through the toolbar portal. Each destination
 * owns its registration, so the inline bar and the expanded scroll row can mount independently. */
export function NavigationTitleSlot({
  entryKey,
  placement,
  fallback,
}: {
  entryKey: string
  placement: TitlePlacement
  fallback?: string
}) {
  const store = useContext(ScreenChromeContext)
  const [element, setElement] = useState<HTMLDivElement | null>(null)
  const [occupied, setOccupied] = useState(false)
  useLayoutEffect(() => {
    if (!store || !element) return
    store.setSlots(entryKey, { [placement]: element } as Slots, placement)
    const title = element.parentElement?.querySelector<HTMLElement>(':scope > strong')
    const update = () => {
      const present = element.childElementCount > 0
      setOccupied(present)
      if (placement === 'subtitle') {
        // Measure intrinsic children, not the fixed bar that currently contains them.
        const height = present
          ? element.getBoundingClientRect().height + (title?.getBoundingClientRect().height ?? 0)
          : 0
        store.setInlineTitleHeight(entryKey, height)
      }
    }
    const resize = placement === 'subtitle' ? new ResizeObserver(update) : undefined
    resize?.observe(element)
    if (title) resize?.observe(title)
    const observer = new MutationObserver(update)
    observer.observe(element, { childList: true })
    update()
    return () => {
      observer.disconnect()
      resize?.disconnect()
      if (placement === 'subtitle') store.setInlineTitleHeight(entryKey, 0)
      store.setSlots(entryKey, undefined, placement)
    }
  }, [store, entryKey, placement, element])
  return (
    <>
      {!occupied && fallback && (
        <span
          data-satin-title-fallback={placement}
          data-satin-navigation-subtitle={
            placement === 'subtitle' ? 'true' : placement === 'largeSubtitle' ? 'large' : undefined
          }
        >
          {fallback}
        </span>
      )}
      <div ref={setElement} data-satin-navigation-title-slot={placement} />
    </>
  )
}

/** Out-of-line titles live in the primary scroller's flow. Their children therefore reserve
 * their actual height and disappear behind the inline bar without a second height policy. */
export function ExpandedNavigationTitle({
  entryKey,
  title,
  subtitle,
  list = false,
  stationary = false,
}: {
  entryKey: string
  title?: string
  subtitle?: string
  list?: boolean
  stationary?: boolean
}) {
  const titleRef = useRef<HTMLHeadingElement>(null)
  useLayoutEffect(() => {
    const heading = titleRef.current
    const layer = heading?.parentElement
    if (!stationary || !heading || !layer) return
    const measure = () => {
      layer.style.setProperty(
        '--satin-expanded-title-height',
        `${heading.getBoundingClientRect().height}px`,
      )
    }
    const resize = new ResizeObserver(measure)
    resize.observe(heading)
    measure()
    return () => {
      resize.disconnect()
      layer.style.removeProperty('--satin-expanded-title-height')
    }
  }, [stationary])
  return (
    <h1
      ref={titleRef}
      data-satin-screen-title={stationary || undefined}
      data-satin-list-title={list || undefined}
      data-satin-scroll-title={(!list && !stationary) || undefined}
    >
      <NavigationTitleSlot entryKey={entryKey} placement="largeTitle" fallback={title} />
      <NavigationTitleSlot entryKey={entryKey} placement="largeSubtitle" fallback={subtitle} />
    </h1>
  )
}
