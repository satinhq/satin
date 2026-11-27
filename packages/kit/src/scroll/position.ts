import { createReadingPosition, refreshTranslation, scrollTopInset } from './readingPosition.ts'
import type { ReadingAnchor } from './types.ts'
import { createInsertionMotion } from './insertionMotion.ts'
import { BOTTOM_INSET_CHANGED } from '../safe-area/bottomInsetGeometry.ts'
import { scrollAfterGlassPrepared } from './scrollJump.ts'
/** Where a scroll target lines up in the viewport: `top`, `center` or `bottom`. */
export type ScrollAnchor = 'top' | 'center' | 'bottom'
/** Vertical scroll geometry: the current viewport and content offset in points. */
export type VerticalScrollGeometry = Readonly<{
  contentOffset: number
  contentHeight: number
  containerHeight: number
  distanceToBottom: number
}>
/** A controlled scroll position: the id of the target in view, its anchor and the callback that
 * receives changes. */
export type ScrollPositionBinding = Readonly<{
  id: string | null
  anchor?: ScrollAnchor
  onChange(id: string | null): void
}>
/** The scroll view's position options: where it starts, whether it keeps visible content in
 * place, a controlled position and a geometry callback. */
export type ScrollPositionOptions = Readonly<{
  defaultScrollAnchor?: 'top' | 'bottom'
  maintainVisibleContentPosition?: boolean
  scrollPosition?: ScrollPositionBinding
  onScrollGeometryChange?: (geometry: VerticalScrollGeometry) => void
}>
export type ScrollTargets = Map<string, HTMLElement>

/** Vertical, normal-flow targets. Native scrolling still owns gestures and momentum. */
export function createScrollPositionController(
  surface: HTMLElement,
  content: HTMLElement,
  targets: ScrollTargets,
  options: () => ScrollPositionOptions,
  beforeScroll: () => void,
  active: () => boolean = () => true,
) {
  const insertion = createInsertionMotion(surface, content)
  let initialLayout = true
  let initialLayoutReady = false
  let layoutFrame = 0
  let settingOffset = false
  let pinned = surface.scrollHeight - surface.clientHeight - surface.scrollTop <= 1
  let writtenOffset: number | undefined
  let reading: ReturnType<typeof createReadingPosition>
  let pending: { id: string; anchor?: ScrollAnchor } | undefined
  let requested: string | null | undefined
  let requestedAnchor: ScrollAnchor | undefined
  let reported: string | null = null
  let lastGeometry = ''
  let touching = false
  let insertionPausedForInput = false
  let disposed = false
  let mutationFrame = 0
  let lastOffset = surface.scrollTop
  let lastHeight = surface.scrollHeight
  let lastViewport = surface.clientHeight
  let lastWidth = surface.clientWidth
  // iPadOS can resize a hidden page (its app-switcher snapshots), and WebKit clamps the offset to
  // that layout. The scroll event arrives only on return, once the size is back. An offset that
  // moved while the page was hidden is layout, not the reader's intent.
  let movedWhileHidden = false
  const maximum = () => Math.max(0, surface.scrollHeight - surface.clientHeight)
  const top = (element: HTMLElement) =>
    element.getBoundingClientRect().top -
    surface.getBoundingClientRect().top -
    surface.clientTop -
    insertion.offset() -
    refreshTranslation(content)
  const ownsScroll = () => {
    if (settingOffset) return true
    if (writtenOffset === surface.scrollTop) return true
    writtenOffset = undefined
    return false
  }
  const publish = (adopt = false) => {
    // Hidden layouts belong to app-switcher snapshots, not to the reader or their checkpoint.
    if (!reading.active() || (!adopt && surface.ownerDocument.visibilityState === 'hidden')) return
    if (writtenOffset !== surface.scrollTop) writtenOffset = undefined
    const geometry: VerticalScrollGeometry = {
      contentOffset: surface.scrollTop,
      contentHeight: surface.scrollHeight,
      containerHeight: surface.clientHeight,
      distanceToBottom: Math.max(0, maximum() - surface.scrollTop),
    }
    // A visible, fitting transcript has no older reading position to retain.
    // Hidden app-switcher snapshots must not change the reader's follow intent.
    if (
      surface.ownerDocument.visibilityState === 'visible' &&
      geometry.contentHeight <= geometry.containerHeight
    )
      pinned = true
    const signature = `${geometry.contentOffset}/${geometry.contentHeight}/${geometry.containerHeight}`
    const next = reading.anchor()?.id ?? null
    const geometryChanged = signature !== lastGeometry
    const positionChanged = !pending && next !== reported
    lastGeometry = signature
    if (positionChanged) reported = next
    lastOffset = geometry.contentOffset
    lastHeight = geometry.contentHeight
    lastViewport = geometry.containerHeight
    lastWidth = surface.clientWidth
    // Finish this read batch before calling app callbacks that can write layout.
    if (geometryChanged) options().onScrollGeometryChange?.(geometry)
    if (positionChanged) options().scrollPosition?.onChange(next)
  }
  const setOffset = (offset: number) => {
    if (!reading.canWrite()) return
    const destination = Math.max(0, Math.min(maximum(), offset))
    if (Math.abs(surface.scrollTop - destination) <= 0.01) return
    settingOffset = true
    writtenOffset = destination
    try {
      surface.scrollTop = destination
      lastOffset = surface.scrollTop
    } finally {
      settingOffset = false
    }
  }
  const scrollTo = (id: string, alignment?: ScrollAnchor) => {
    beforeScroll()
    if (!reading.canWrite(true) && surface.ownerDocument.visibilityState !== 'hidden') {
      pending = { id, anchor: alignment }
      return false
    }
    const target = targets.get(id)
    if (!target) {
      if (surface.ownerDocument.visibilityState === 'hidden') {
        pinned = false
        reading.request({ x: surface.scrollLeft, y: surface.scrollTop, anchor: { id, top: 0 } })
      }
      pending = { id, anchor: alignment }
      return false
    }
    pending = undefined
    const targetTop = top(target)
    const height = target.getBoundingClientRect().height
    // Targets align within the content insets, within the owned scroll region: a screen's primary scroll view
    // reaches under the bar and the bottom bars, and its padding is the bar's and the bottom inset
    // chain's content inset. Other scroll views only clear the enclosing bottom insets' accessories.
    const style = getComputedStyle(surface)
    const primary = surface.dataset?.satinPrimary === 'true'
    const topInset = scrollTopInset(surface)
    const bottomInset = Math.max(
      0,
      Number.parseFloat(style.getPropertyValue('--satin-scroll-inset-bottom')) || 0,
      primary ? Number.parseFloat(style.paddingBottom) || 0 : 0,
    )
    const availableHeight = Math.max(0, surface.clientHeight - topInset - bottomInset)
    const visibleTop = targetTop - topInset
    const offset = alignment
      ? visibleTop - (availableHeight - height) * { top: 0, center: 0.5, bottom: 1 }[alignment]
      : visibleTop < 0
        ? visibleTop
        : Math.max(0, visibleTop + height - availableHeight)
    const destination = Math.max(0, Math.min(maximum(), surface.scrollTop + offset))
    if (surface.ownerDocument.visibilityState === 'hidden') {
      pinned = Math.abs(destination - maximum()) <= 1
      pending =
        options().defaultScrollAnchor === 'bottom' && pinned ? undefined : { id, anchor: alignment }
      reading.request({
        x: surface.scrollLeft,
        y: destination,
        ...(options().defaultScrollAnchor === 'bottom' && pinned
          ? { atEnd: true as const }
          : { anchor: { id, top: targetTop + surface.scrollTop - destination - topInset } }),
      })
      return false
    }
    // A send can request its not-yet-delivered terminal row. If already following
    // the bottom, this is the same insertion, not a separate jump that cancels it.
    const followsBottom =
      options().defaultScrollAnchor === 'bottom' &&
      pinned &&
      !touching &&
      alignment === 'bottom' &&
      Math.abs(destination - maximum()) <= 1
    if (!followsBottom) insertion.cancel()
    scrollAfterGlassPrepared(surface, destination, () => setOffset(destination))
    pinned = maximum() - surface.scrollTop <= 1
    // Explicit jumps must also adopt the new baseline. Otherwise the next resize
    // observer replays an already-visible append from the pre-jump row position.
    insertion.reconcile(followsBottom, false, initialLayout)
    if (initialLayoutReady && surface.clientHeight > 0) initialLayout = false
    reading.discard()
    publish(true)
    return true
  }
  const reconcile = () => {
    if (!disposed && reading.active() && surface.ownerDocument.visibilityState === 'hidden') {
      const binding = options().scrollPosition
      if (binding && (binding.id !== requested || binding.anchor !== requestedAnchor)) {
        requested = binding.id
        requestedAnchor = binding.anchor
        if (binding.id !== null) scrollTo(binding.id, binding.anchor)
        else pending = undefined
      }
    }
    if (
      disposed ||
      surface.clientHeight === 0 ||
      surface.ownerDocument.visibilityState === 'hidden' ||
      !reading.active()
    )
      return
    reading.viewportChanged()
    const resized = surface.clientWidth !== lastWidth || surface.clientHeight !== lastViewport
    const clamped = lastOffset > maximum() && Math.abs(surface.scrollTop - maximum()) <= 1
    const layoutMoved = movedWhileHidden || resized || clamped
    // React layout effects can reconcile before MutationObserver's microtask.
    // Consume queued replacements before adopting their new geometry baseline.
    const records = mutations.takeRecords()
    if (records.length) onMutations(records)
    // A native scroll can precede delivery of its scroll event. A token mutation
    // in that interval must adopt the live offset instead of pulling the reader
    // back to the old bottom. Browser clamping after a shrink, or a move while the
    // page was hidden, is not intent.
    if (surface.scrollTop !== lastOffset) {
      if (!layoutMoved) {
        insertion.cancel()
        pinned = maximum() - surface.scrollTop <= 1
        if (!settingOffset) pending = undefined
        reading.discard()
        publish()
      }
    }
    // Initial inset adoption still waits for WebKit to clamp its first layout offset.
    if (initialLayout && (surface.scrollTop < 0 || surface.scrollTop > maximum())) return
    if (surface.scrollTop < 0 || surface.scrollTop > maximum() || !reading.canWrite()) {
      // Rows delivered under a held gesture are already visible, not a later insertion.
      insertion.reconcile(false, false, initialLayout)
      if (initialLayoutReady && surface.clientHeight > 0) initialLayout = false
      publish()
      return
    }
    const binding = options().scrollPosition
    requestedAnchor = binding?.anchor
    if (binding && binding.id !== requested) {
      requested = binding.id
      if (binding.id !== null && binding.id !== reported) {
        beforeScroll()
        pending = { id: binding.id, anchor: binding.anchor }
      }
      if (binding.id === null || binding.id === reported) pending = undefined
    }
    if (pending && targets.has(pending.id)) {
      scrollTo(pending.id, pending.anchor)
      return
    }
    if (options().defaultScrollAnchor === 'bottom' && pinned && !touching) setOffset(maximum())
    else if (options().maintainVisibleContentPosition && reading.anchor()) {
      const anchor = reading.anchor()!
      const target = targets.get(anchor.id)
      if (target) setOffset(surface.scrollTop + top(target) - scrollTopInset(surface) - anchor.top)
    }
    movedWhileHidden = false
    insertion.reconcile(
      options().defaultScrollAnchor === 'bottom' && pinned && !touching,
      pending?.anchor === 'bottom',
      initialLayout,
    )
    if (initialLayoutReady && surface.clientHeight > 0) initialLayout = false
    publish()
  }
  const onScroll = () => {
    if (!reading.active() || surface.ownerDocument.visibilityState === 'hidden') return
    // Resize/clamping can emit a scroll event before ResizeObserver. Preserve the
    // previous reading anchor until layout reconciliation has run.
    if (
      surface.scrollHeight !== lastHeight ||
      surface.clientHeight !== lastViewport ||
      surface.clientWidth !== lastWidth
    ) {
      if (!settingOffset) reconcile()
      return
    }
    if (surface.scrollTop !== lastOffset && movedWhileHidden) {
      if (!settingOffset) reconcile()
      return
    }
    if (surface.scrollTop !== lastOffset) {
      insertion.cancel()
      pinned = maximum() - surface.scrollTop <= 1
      if (!settingOffset) pending = undefined
    }
    // The caller publishes after insertion geometry has adopted the completed offset write.
    if (!settingOffset) publish()
  }
  const onVisibilityChange = () => {
    if (surface.ownerDocument.visibilityState === 'hidden') movedWhileHidden = true
    // Put a following view back on its bottom (or a reader on its anchor) before it paints.
    else reconcile()
  }
  const stopInsertionForInput = () => {
    const travel = insertion.offset()
    if (travel === 0) {
      insertionPausedForInput = false
      return
    }
    if (!reading.canWrite()) {
      insertion.pause()
      insertionPausedForInput = true
      return
    }
    insertionPausedForInput = false
    const shown = surface.scrollTop - travel
    insertion.cancel()
    setOffset(shown)
    pinned = maximum() - surface.scrollTop <= 1
    publish()
  }
  const onPointerDown = () => {
    stopInsertionForInput()
    touching = true
    pending = undefined
  }
  const onPointerUp = () => {
    touching = false
  }
  const onWheel = () => {
    stopInsertionForInput()
    pending = undefined
  }
  // Inset publication can follow this surface's ResizeObserver in the same
  // delivery. Reconcile now so the new padding and its anchor paint together.
  const reconcileSize = () => reconcile()
  reading = createReadingPosition(surface, content, targets, {
    active,
    writing: ownsScroll,
    presentationOffset: () => insertion.offset(),
    hasPendingScroll: () => pending !== undefined,
    followsEnd: () => options().defaultScrollAnchor === 'bottom' && pinned,
    write: setOffset,
    beforeCapture: () => {
      if (insertionPausedForInput) stopInsertionForInput()
    },
    idle: () => {
      reconcile()
      publish()
    },
  })
  surface.addEventListener(BOTTOM_INSET_CHANGED, reconcileSize)
  surface.addEventListener('scroll', onScroll, { passive: true })
  surface.addEventListener('pointerdown', onPointerDown, { passive: true })
  window.addEventListener('pointerup', onPointerUp, { passive: true })
  window.addEventListener('pointercancel', onPointerUp, { passive: true })
  surface.addEventListener('wheel', onWheel, { passive: true })
  surface.ownerDocument.addEventListener('visibilitychange', onVisibilityChange)
  const initialOwners = new Set<Element>([surface])
  for (let owner = surface.parentElement; owner; owner = owner.parentElement) {
    if (owner.dataset.satinSafeAreaInset !== 'bottom') continue
    initialOwners.add(owner)
    const accessory = owner.querySelector(':scope > [data-satin-inset-accessory]')
    if (accessory) initialOwners.add(accessory)
  }
  const resize = new ResizeObserver(entries => {
    if (surface.clientHeight > 0) {
      for (const entry of entries) initialOwners.delete(entry.target)
      if (initialLayout && !initialOwners.size && !layoutFrame)
        layoutFrame = requestAnimationFrame(() => {
          layoutFrame = 0
          if (surface.clientHeight === 0) return
          // Let every inset owner's observer publish before adopting visible layout.
          initialLayoutReady = true
          reconcile()
        })
    }
    reconcile()
  })
  for (const owner of initialOwners) resize.observe(owner)
  resize.observe(surface)
  resize.observe(content)
  const observedTargets = new Set<HTMLElement>()
  const observeTargets = () => {
    const current = new Set(targets.values())
    for (const element of observedTargets) {
      if (!current.has(element)) {
        resize.unobserve(element)
        observedTargets.delete(element)
      }
    }
    for (const element of current) {
      if (!observedTargets.has(element)) {
        resize.observe(element)
        observedTargets.add(element)
      }
    }
  }
  observeTargets()
  const onMutations = (records: MutationRecord[]) => {
    insertion.contentChanged(records)
    reading.contentChanged()
    // Text delivery happens before layout. A token that does not resize a row
    // cannot move any normal-flow target. Changed target sizes are delivered by
    // ResizeObserver after layout, including offsetting grow/shrink pairs whose
    // total content height stays unchanged.
    if (
      !records.some(record =>
        [...record.addedNodes, ...record.removedNodes].some(
          node => node.nodeType === Node.ELEMENT_NODE,
        ),
      )
    )
      return
    // Structural reordering can change positions without changing any sizes.
    if (!mutationFrame)
      mutationFrame = requestAnimationFrame(() => {
        mutationFrame = 0
        observeTargets()
        reconcile()
      })
  }
  const mutations = new MutationObserver(onMutations)
  mutations.observe(content, { childList: true, subtree: true })
  reconcile()
  return {
    reconcile,
    scrollTo,
    adoptRestoredOffset() {
      insertion.cancel()
      pinned = maximum() - surface.scrollTop <= 1
      pending = undefined
      reading.discard()
      publish(true)
    },
    ownsScroll,
    captureReadingPosition() {
      return reading.capture()
    },
    canRestoreReadingPosition() {
      return reading.canWrite()
    },
    readingAnchor() {
      return reading.anchor()
    },
    restoreReadingAnchor(saved: ReadingAnchor) {
      const result = reading.restore(saved)
      if (result === 'restored') {
        pinned = maximum() - surface.scrollTop <= 1
        pending = undefined
        publish()
      }
      return result
    },
    targetsChanged() {},
    /** A bottom-anchored view that is following its bottom, as content arrives and on resize. */
    followsEnd() {
      return options().defaultScrollAnchor === 'bottom' && pinned
    },
    dispose() {
      disposed = true
      reading.dispose()
      insertion.cancel()
      cancelAnimationFrame(mutationFrame)
      cancelAnimationFrame(layoutFrame)
      resize.disconnect()
      mutations.disconnect()
      surface.removeEventListener(BOTTOM_INSET_CHANGED, reconcileSize)
      surface.removeEventListener('scroll', onScroll)
      surface.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      surface.removeEventListener('wheel', onWheel)
      surface.ownerDocument.removeEventListener('visibilitychange', onVisibilityChange)
    },
  }
}
