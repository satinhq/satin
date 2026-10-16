/** The box a screen's (or a sheet's) content is laid out in. */
const SCREEN_CONTENT_BOUNDARY = '[data-satin-navigation-motion-layer], .satin-sheet-content-scale'

/** Content before the element in flow: a visible box that is not positioned out of flow. */
function occupiesFlow(element: Element) {
  if (!(element instanceof HTMLElement) || element.offsetHeight === 0) return false
  // The screen's own static large title stands in the bar's title row, never in the content.
  if (element.hasAttribute('data-satin-screen-title')) return false
  const position = getComputedStyle(element).position
  return position !== 'absolute' && position !== 'fixed'
}

/**
 * Whether a scroll view starts its screen's content, as a SwiftUI scroll view that reaches the
 * top safe-area edge does. Only such a scroll view extends under the navigation bar and takes the
 * bar's content inset; one placed below other content keeps its own frame, like a Form under a
 * header in a VStack.
 */
export function startsScreenContent(element: Element) {
  const boundary = element.closest(SCREEN_CONTENT_BOUNDARY)
  for (let node: Element | null = element; node && node !== boundary; node = node.parentElement) {
    for (
      let sibling = node.previousElementSibling;
      sibling;
      sibling = sibling.previousElementSibling
    ) {
      if (occupiesFlow(sibling)) return false
    }
  }
  return true
}

/** The widest List frame that keeps compact (16 pt) layout margins; wider frames use 20 pt. */
const COMPACT_LIST_MAX_WIDTH_PX = 402

/*
 * Marks a List's layout margins from its own width (styles.css `data-satin-list-margins`), less
 * the horizontal safe-area padding it lays its cards out inside (iOS 27 native reference `padding-list`: a
 * 440 pt List with 40 pt safe-area padding each side keeps the compact 16 pt margin).
 */
export function observeListLayoutMargins(list: HTMLElement, safeAreaPadding = 0) {
  const apply = (frame: number) => {
    const width = frame - safeAreaPadding
    const margins = width > COMPACT_LIST_MAX_WIDTH_PX ? 'wide' : 'compact'
    if (list.dataset.satinListMargins !== margins) list.dataset.satinListMargins = margins
  }
  apply(list.getBoundingClientRect().width)
  const observer = new ResizeObserver(entries => {
    const size = entries.at(-1)?.borderBoxSize?.[0]
    apply(size ? size.inlineSize : list.getBoundingClientRect().width)
  })
  observer.observe(list)
  return () => observer.disconnect()
}
