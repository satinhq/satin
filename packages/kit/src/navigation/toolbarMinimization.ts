/** When the navigation bar minimizes: `onScrollDown`, `onScrollUp` or `never`. */
export type ToolbarMinimizationBehavior = 'onScrollDown' | 'onScrollUp' | 'never'
/** What brings back a minimized bar: `automatic`, or only reaching the scroll edge
 * (`atScrollEdge`). */
export type ToolbarMinimizationRestoration = 'automatic' | 'atScrollEdge'
/** Whether the content inset shrinks when the bar minimizes. */
export type ToolbarMinimizationSafeAreaAdjustment = 'automatic' | 'enabled' | 'disabled'

/* Settled policy from the iOS 27 music-scroll native reference. Motion fitting remains pending. */
export function nextToolbarMinimization(
  minimized: boolean,
  previousOffset: number,
  offset: number,
  behavior: ToolbarMinimizationBehavior,
  restoration: ToolbarMinimizationRestoration = 'automatic',
) {
  if (behavior === 'never' || offset <= 0) return false
  const direction = offset - previousOffset
  if (direction === 0) return minimized
  const minimizing = behavior === 'onScrollDown' ? direction > 0 : direction < 0
  if (minimizing) return true
  return restoration === 'atScrollEdge' ? minimized : false
}

/** Bind only an elected primary. Compensate released inset so its content does not jump. */
export function observeToolbarMinimization(
  scroller: HTMLElement,
  behavior: ToolbarMinimizationBehavior,
  restoration: ToolbarMinimizationRestoration | undefined,
  adjustment: ToolbarMinimizationSafeAreaAdjustment | undefined,
) {
  let previousOffset = Math.max(0, scroller.scrollTop)
  let minimized = false
  let collapsed = false
  let minimumOffset = 0
  const notify = () =>
    scroller.dispatchEvent(new CustomEvent('satin:toolbar-minimization', { bubbles: true }))
  const update = () => {
    const offset = Math.max(0, scroller.scrollTop)
    // Rubber-band movement is not a direction reversal in the content.
    if (scroller.scrollTop < 0) return
    const next = nextToolbarMinimization(minimized, previousOffset, offset, behavior, restoration)
    if (next && !minimized && offset <= minimumOffset) {
      previousOffset = offset
      return
    }
    const nextCollapsed = offset > 0 && (collapsed || next)
    previousOffset = offset
    if (next === minimized && nextCollapsed === collapsed) return
    // A generated large title is part of the released inset too. Anchor ordinary content,
    // not padding alone, so removing that row does not add a second scroll displacement.
    const content =
      scroller.querySelector<HTMLElement>(':scope > [data-satin-scroll-content]') ?? scroller
    const anchor = content.querySelector<HTMLElement>(
      ':scope > :not([data-satin-scroll-title]):not([data-satin-list-title]):not([data-satin-refresh])',
    )
    const oldOrigin =
      anchor?.getBoundingClientRect().top ?? parseFloat(getComputedStyle(scroller).paddingTop)
    const previousMinimized = minimized
    const previousCollapsed = collapsed
    minimized = next
    collapsed = nextCollapsed
    scroller.dataset.satinToolbarMinimized = String(minimized)
    scroller.dataset.satinToolbarCollapsed = String(collapsed)
    scroller.dataset.satinToolbarInsetAdjustment =
      adjustment === 'disabled' ? 'disabled' : 'enabled'
    const newOrigin =
      anchor?.getBoundingClientRect().top ?? parseFloat(getComputedStyle(scroller).paddingTop)
    const displacement = newOrigin - oldOrigin
    if (next && !previousMinimized && offset + displacement <= 0) {
      // WebKit cannot hold a negative scroll offset. Wait until the released row can fit
      // without clamping content back to the top. Native's partial motion is still debt.
      minimumOffset = Math.max(0, -displacement)
      minimized = previousMinimized
      collapsed = previousCollapsed
      scroller.dataset.satinToolbarMinimized = String(minimized)
      scroller.dataset.satinToolbarCollapsed = String(collapsed)
      return
    }
    if (!minimized) minimumOffset = 0
    // At the top, retain offset zero so the large title returns. Else keep the visible content anchored.
    if (offset > 0 && Number.isFinite(oldOrigin) && Number.isFinite(newOrigin)) {
      scroller.scrollTop = Math.max(0, offset + displacement)
      previousOffset = Math.max(0, scroller.scrollTop)
    }
    notify()
  }
  scroller.addEventListener('scroll', update, { passive: true })
  return () => {
    scroller.removeEventListener('scroll', update)
    delete scroller.dataset.satinToolbarMinimized
    delete scroller.dataset.satinToolbarCollapsed
    delete scroller.dataset.satinToolbarInsetAdjustment
    notify()
  }
}
