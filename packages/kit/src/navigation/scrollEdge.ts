/** Scroll distance over which the edge material reaches full strength once
 * content first meets its lower boundary. Unmeasured against native motion. */
export const SCROLL_EDGE_RAMP_PX = 8

/** 0 while nothing sits under the edge; 1 once content is RAMP px underneath. */
export function scrollEdgeStrength(edgeBottom: number, contentTop: number | undefined): number {
  if (contentTop === undefined) return 0
  return Math.min(1, Math.max(0, (edgeBottom - contentTop) / SCROLL_EDGE_RAMP_PX))
}

export function firstContentTop(
  scroller: HTMLElement,
  scrollTop = scroller.scrollTop,
  rect = (element: Element) => element.getBoundingClientRect(),
): number | undefined {
  // Floating iPad tabs overlap the resting title's geometry. That overlap is
  // not scrolling and must not turn on the edge blur at the initial offset.
  if (scrollTop <= 0) return undefined
  for (const child of scroller.children) {
    // The pinned drawer and its edge marker are chrome, not scrolling content.
    if (child.matches('[data-satin-search], [data-satin-search-edge]')) continue
    const box = rect(child)
    if (box.height > 0 || box.width > 0) return box.top
  }
  return undefined
}

/** A pinned search drawer joins the navigation treatment 4 pt above its field.
 * Keep the high chrome layer above that boundary; extending it across the field
 * would blur the field's foreground. The adjacent search layer owns the tail. */
export function searchHeaderEdge(
  scroller: HTMLElement,
  scrollTop = scroller.scrollTop,
  rect = (element: Element) => element.getBoundingClientRect(),
) {
  if (scrollTop <= 0 || scroller.hasAttribute('data-satin-search-presented')) return
  const drawer = scroller.querySelector<HTMLElement>(':scope > [data-satin-search]')
  const marker = drawer?.nextElementSibling
  if (!drawer || !(marker instanceof HTMLElement) || !marker.hasAttribute('data-satin-search-edge'))
    return
  for (let content = marker.nextElementSibling; content; content = content.nextElementSibling) {
    const box = rect(content)
    if (box.height <= 0 || box.width <= 0) continue
    const drawerBox = rect(drawer)
    const strength = scrollEdgeStrength(drawerBox.bottom, box.top)
    if (strength === 0) return
    return { marker, top: drawerBox.top - 4, strength }
  }
}

/* The section header of a plain List that is pinned at the top of its scroll view, and its
 * distance below the scroll view's top edge. Native grows the bar's edge effect over a pinned
 * header as one hard-edged material (iOS 27 native reference rough-edges, pinned 116-156 pt), so the header
 * then owns the whole material. A header is pinned when its section's top has scrolled above it.
 * Searchable lists are excluded: their drawer draws the edge material under its pinned headers. */
export function pinnedSectionHeader(
  scroller: HTMLElement,
  rect = (element: Element) => element.getBoundingClientRect(),
): { header: HTMLElement; reach: number } | undefined {
  if (!scroller.matches("[data-satin-list='plain']:not([data-satin-searchable])")) return
  const scrollerTop = rect(scroller).top
  for (const header of scroller.querySelectorAll<HTMLElement>(
    "[data-satin-list-section] > [data-satin-section-header='true']",
  )) {
    const box = rect(header)
    if (box.bottom <= scrollerTop) continue
    const sectionTop = rect(header.parentElement!).top
    if (box.top - sectionTop > 0.5) return { header, reach: box.top - scrollerTop }
    // Headers below an unpinned one sit lower still.
    return
  }
  return
}
