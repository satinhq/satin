import { observeNativeScroll, type NativeScrollSnapshot } from '../scroll/nativeScroll.ts'
import {
  firstContentTop,
  pinnedSectionHeader,
  scrollEdgeStrength,
  searchHeaderEdge,
} from './scrollEdge.ts'

/** Observe the material belonging to one page, independent of stack coverage.
 * `statusEdgeOnly`: the page has no bar row of its own (a hidden bar, or a root under floating
 * iPad tabs), so the edge effect covers only the status bar. */
export function observeNavigationEdge(
  edge: HTMLElement,
  scroller: HTMLElement | null,
  statusEdgeOnly: boolean,
) {
  // Content drawn up against the status band (a hidden bar, or a primary that ignores the top
  // safe area) has no top content inset, and native's edge effect then covers only the status
  // bar, never the bar row (iOS 27 native reference hero-toolbar at offsets 0/150/600). The band already
  // covers that strip here, so the edge material stays off and the band keeps its short seam
  // fade at rest and while scrolled (styles.css).
  const ignoresTop = ['top', 'all'].includes(scroller?.dataset.satinIgnoresSafeArea ?? '')
  const underEdge = Boolean(scroller) && (ignoresTop || statusEdgeOnly)
  let edgeHidden = scroller?.dataset.satinScrollEdgeHidden === 'true'
  const applySeam = () =>
    edge.parentElement?.toggleAttribute('data-satin-edge-seam', underEdge && !edgeHidden)
  applySeam()
  let applied = -1
  let pinnedHeader: HTMLElement | undefined
  let pinnedReach = -1
  let searchMarker: HTMLElement | undefined
  let searchStart = -1
  const releaseSearch = () => {
    searchMarker?.removeAttribute('data-satin-search-edge-covered')
    searchMarker = undefined
    searchStart = -1
    edge.removeAttribute('data-satin-scroll-edge-search')
    edge.style.removeProperty('--satin-scroll-edge-search-start')
  }
  const releasePinnedHeader = () => {
    pinnedHeader?.removeAttribute('data-satin-section-header-pinned')
    pinnedHeader = undefined
  }
  const update = (snapshot?: NativeScrollSnapshot) => {
    const rect = (element: Element) => snapshot?.rect(element) ?? element.getBoundingClientRect()
    const live = Boolean(scroller) && !edgeHidden && !underEdge
    const search = live && scroller ? searchHeaderEdge(scroller, snapshot?.top, rect) : undefined
    if (searchMarker !== search?.marker) {
      releaseSearch()
      searchMarker = search?.marker
      searchMarker?.setAttribute('data-satin-search-edge-covered', '')
    }
    if (search && edge.parentElement) {
      const start = search.top - rect(edge.parentElement).top
      if (start !== searchStart) {
        searchStart = start
        edge.style.setProperty('--satin-scroll-edge-search-start', `${start}px`)
        edge.setAttribute('data-satin-scroll-edge-search', '')
      }
    }
    // A hidden pane has no edge geometry to update.
    if (edge.getClientRects().length === 0) return
    // A pinned plain-list header carries the edge material through itself (styles.css).
    const pinned = live && scroller ? pinnedSectionHeader(scroller, rect) : undefined
    if (pinned?.header !== pinnedHeader) {
      releasePinnedHeader()
      pinnedHeader = pinned?.header
      pinnedHeader?.setAttribute('data-satin-section-header-pinned', 'true')
      pinnedReach = -1
    }
    if (pinned && pinned.reach !== pinnedReach) {
      pinnedReach = pinned.reach
      pinned.header.style.setProperty('--satin-pinned-header-reach', `${pinned.reach}px`)
    }
    const strength =
      !live || !scroller || pinned
        ? 0
        : (search?.strength ??
          scrollEdgeStrength(rect(edge).bottom, firstContentTop(scroller, snapshot?.top, rect)))
    if (strength === applied) return
    applied = strength
    edge.style.opacity = strength > 0 && strength < 1 ? String(strength) : ''
    edge.setAttribute('data-satin-scroll-edge-visible', strength > 0 ? 'true' : 'false')
  }
  update()
  if (!scroller) return releasePinnedHeader
  const releaseScroll = observeNativeScroll(scroller, update)
  // Policy changes are rare; keep their reads and seam writes off the scroll path.
  const policy = new MutationObserver(() => {
    const hidden = scroller.dataset.satinScrollEdgeHidden === 'true'
    edgeHidden = hidden
    applySeam()
    update()
  })
  policy.observe(scroller, {
    attributes: true,
    attributeFilter: ['data-satin-scroll-edge-hidden', 'data-satin-search-presented'],
  })
  const resize = new ResizeObserver(() => update())
  resize.observe(scroller)
  if (scroller.firstElementChild) resize.observe(scroller.firstElementChild)
  return () => {
    releaseScroll()
    resize.disconnect()
    policy.disconnect()
    releasePinnedHeader()
    releaseSearch()
  }
}
