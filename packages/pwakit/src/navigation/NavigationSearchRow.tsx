import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const rows = new WeakMap<HTMLElement, HTMLElement>()
const placements = new WeakMap<HTMLElement, { home: HTMLElement; restore?: () => void }>()
const lifted = new WeakSet<HTMLElement>()

/** React keeps one portal target for the field, including while navigation moves its container. */
export function NavigationSearchRow({ children }: { children: ReactNode }) {
  const homeRef = useRef<HTMLSpanElement>(null)
  const [row] = useState(() => {
    if (typeof document === 'undefined') return null
    const element = document.createElement('div')
    element.setAttribute('data-satin-search-row', '')
    return element
  })
  useLayoutEffect(() => {
    const home = homeRef.current
    if (!home || !row) return
    home.append(row)
    rows.set(home, row)
    const placement = { home, restore: undefined as (() => void) | undefined }
    placements.set(row, placement)
    return () => {
      placement.restore?.()
      placements.delete(row)
      rows.delete(home)
      row.remove()
    }
  }, [row])
  return (
    <span data-satin-search-row-home="" ref={homeRef} style={{ display: 'contents' }}>
      {row ? createPortal(children, row) : <div data-satin-search-row="">{children}</div>}
    </span>
  )
}

export function searchRowIsLifted(row: HTMLElement | undefined) {
  return !!row && lifted.has(row)
}

/** Lift only the portal container. Its field and glass registrations keep their identity. */
export function liftNavigationSearchRow(row: HTMLElement | undefined) {
  if (!row) return
  const placement = placements.get(row)
  if (!placement) return
  const screen = row.closest<HTMLElement>('[data-satin-screen-container]')
  const host = screen?.closest<HTMLElement>('[data-satin-navigator-host]')
  if (!screen || !host) return
  placement.restore?.()
  const rect = row.getBoundingClientRect()
  const screenRect = screen.getBoundingClientRect()
  const hostRect = host.getBoundingClientRect()
  const layer = document.createElement('div')
  layer.setAttribute('data-satin-navigation-search-layer', '')
  // The field leaves the drawer's CSS ancestry, but must keep its material.
  // A pinned field has no grey fill; losing its marker hides the glass as well.
  for (const attribute of [
    'data-satin-search-presented',
    'data-satin-search-pinned',
    'data-satin-search-moving',
  ]) {
    layer.toggleAttribute(attribute, row.closest(`[${attribute}]`) !== null)
  }
  layer.inert = true
  Object.assign(layer.style, {
    position: 'absolute',
    left: `${rect.left - screenRect.left + screen.offsetLeft}px`,
    top: `${rect.top - hostRect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    zIndex: '15001',
    pointerEvents: 'none',
    color: getComputedStyle(row).color,
  })
  // Search variables are set on the drawer and scroller, below the navigator.
  const computed = getComputedStyle(row)
  for (const property of [
    '--satin-search-pin',
    '--satin-search-glass',
    '--satin-search-fill',
    '--satin-search-placeholder',
  ]) {
    layer.style.setProperty(property, computed.getPropertyValue(property))
  }
  host.append(layer)
  layer.append(row)
  lifted.add(row)
  const restore = () => {
    if (placement.restore !== restore) return
    placement.home.append(row)
    layer.remove()
    lifted.delete(row)
    placement.restore = undefined
  }
  placement.restore = restore
  return restore
}

export function navigationSearchRowOf(drawer: HTMLElement) {
  const home = drawer.querySelector<HTMLElement>('[data-satin-search-row-home]')
  return (home && rows.get(home)) ?? drawer.querySelector<HTMLElement>('[data-satin-search-row]')
}
