import type { ReadingAnchor, ScrollSnapshotOffset } from './types.ts'

export const SCROLL_POSITION_IDLE = 'satin:scroll-position-idle'

export function readingPositionActive(surface: Partial<HTMLElement>) {
  if (
    surface.closest?.(
      '[data-satin-covered="true"], [data-satin-render-suspended="true"], [data-satin-transition-active="true"]',
    )
  )
    return false
  const screen = surface.closest?.('[data-satin-screen-container]') as HTMLElement | null
  return !screen || !screen.dataset.satinTransition || screen.dataset.satinTransition === 'settled'
}

export function scrollTopInset(surface: HTMLElement) {
  return surface.dataset.satinPrimary === 'true'
    ? Number.parseFloat(getComputedStyle(surface).paddingTop) || 0
    : 0
}

export function refreshTranslation(content: HTMLElement) {
  const transform = getComputedStyle(content).transform
  if (transform.startsWith('matrix3d('))
    return Number.parseFloat(transform.slice(9).split(',')[13] ?? '0') || 0
  if (transform.startsWith('matrix('))
    return Number.parseFloat(transform.slice(7).split(',')[5] ?? '0') || 0
  return Number.parseFloat(transform.match(/translateY\(([-.\d]+)px\)/)?.[1] ?? '0') || 0
}

/** Reading checkpoints share the position controller's write path. Visible content edits never restore them. */
export function createReadingPosition(
  surface: HTMLElement,
  content: HTMLElement,
  targets: Map<string, HTMLElement>,
  configuration: {
    active(): boolean
    writing(): boolean
    presentationOffset(): number
    hasPendingScroll(): boolean
    followsEnd(): boolean
    write(y: number): void
    beforeCapture(): void
    idle(): void
  },
) {
  let snapshot: ScrollSnapshotOffset | undefined
  let width = surface.clientWidth
  let height = surface.clientHeight
  let lastOffset = surface.scrollTop
  let hidden = surface.ownerDocument.visibilityState === 'hidden'
  let hiddenRequest = false
  let touching = false
  let pointerDown = false
  let touchDown = false
  let scrolling = false
  let version = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let requested: { snapshot: ScrollSnapshotOffset; version: number } | undefined
  const maximum = () => Math.max(0, surface.scrollHeight - surface.clientHeight)
  const active = () => configuration.active() && readingPositionActive(surface)
  const bouncing = () => surface.scrollTop < 0 || surface.scrollTop > maximum()
  const canWrite = (includingHidden = false) =>
    active() && (includingHidden || !hidden) && !touching && !scrolling && !bouncing()
  const eligible = (target: HTMLElement) => {
    if (
      target.closest('[data-satin-scroll]') !== surface &&
      surface.hasAttribute('data-satin-scroll')
    )
      return false
    for (
      let element: HTMLElement | null = target;
      element && element !== surface;
      element = element.parentElement
    ) {
      const position = getComputedStyle(element).position
      if (position === 'sticky' || position === 'fixed') return false
    }
    return target.isConnected
  }
  const capture = (onHide = false) => {
    if (!active() || (!onHide && hidden) || bouncing() || surface.clientHeight === 0)
      return snapshot
    const origin = surface.getBoundingClientRect().top + surface.clientTop + scrollTopInset(surface)
    const presented = configuration.presentationOffset() + refreshTranslation(content)
    let anchor: ReadingAnchor | undefined
    // Sticky and nested targets do not have monotonic document-order viewport positions.
    for (const [id, target] of [...targets].sort((left, right) =>
      left[1].compareDocumentPosition(right[1]) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    )) {
      if (!eligible(target)) continue
      const rect = target.getBoundingClientRect()
      if (
        rect.height > 0 &&
        rect.top + rect.height - presented > origin &&
        rect.top - presented < origin + surface.clientHeight
      ) {
        anchor = { id, top: rect.top - origin - presented }
        break
      }
    }
    const y = surface.scrollTop
    const atEnd = configuration.followsEnd() && Math.abs(maximum() - y) <= 1
    snapshot = Object.freeze({
      x: surface.scrollLeft,
      y,
      ...(atEnd ? { atEnd: true as const } : anchor ? { anchor } : {}),
    })
    lastOffset = y
    return snapshot
  }
  const restore = (anchor: ReadingAnchor) => {
    if (!canWrite()) return 'deferred' as const
    const target = targets.get(anchor.id)
    if (!target || !eligible(target))
      return targets.size ? ('missing' as const) : ('deferred' as const)
    const origin = surface.getBoundingClientRect().top + surface.clientTop + scrollTopInset(surface)
    const presented = configuration.presentationOffset() + refreshTranslation(content)
    const rect = target.getBoundingClientRect()
    if (rect.height <= 0) return 'deferred' as const
    const destination = surface.scrollTop + rect.top - origin - presented - anchor.top
    if (destination < -1 || destination > maximum() + 1) return 'deferred' as const
    configuration.write(destination)
    scheduleIdle()
    return 'restored' as const
  }
  const restoreRequested = () => {
    if (!requested || !canWrite()) return
    const saved = requested
    requested = undefined
    // A queued kit alignment owns the destination; its placeholder is not a resume position.
    if (saved.version !== version || configuration.hasPendingScroll()) return
    if (configuration.followsEnd() || saved.snapshot.atEnd) configuration.write(maximum())
    else if (!saved.snapshot.anchor || restore(saved.snapshot.anchor) !== 'restored')
      configuration.write(saved.snapshot.y)
    lastOffset = surface.scrollTop
  }
  const idle = () => {
    clearTimeout(timer)
    if (touching || bouncing()) return
    scrolling = false
    restoreRequested()
    configuration.beforeCapture()
    capture()
    configuration.idle()
    surface.dispatchEvent(new Event(SCROLL_POSITION_IDLE))
  }
  const scheduleIdle = () => {
    clearTimeout(timer)
    timer = setTimeout(idle, 150)
  }
  const userIntent = () => {
    version++
    requested = undefined
    scrolling = true
    scheduleIdle()
  }
  const onScroll = () => {
    if (configuration.writing()) {
      lastOffset = surface.scrollTop
      return
    }
    if (hidden || surface.ownerDocument.visibilityState === 'hidden') return
    userIntent()
    lastOffset = surface.scrollTop
  }
  const onDown = (event: Event) => {
    if (event.type === 'touchstart') touchDown = true
    else pointerDown = true
    touching = true
    userIntent()
  }
  const onUp = (event: Event) => {
    if (event.type === 'touchend' || event.type === 'touchcancel') touchDown = false
    else pointerDown = false
    // WebKit cancels pointer delivery when it claims a native pan; the touch still owns it.
    touching = touchDown || pointerDown
    scheduleIdle()
  }
  const visibility = () => {
    if (surface.ownerDocument.visibilityState === 'hidden') {
      if (!hiddenRequest) capture(true)
      hidden = true
      return
    }
    if (!hidden) return
    hidden = false
    hiddenRequest = false
    scrolling = false
    touching = false
    pointerDown = false
    touchDown = false
    // Native anchoring may have moved the offset, or a hidden edit may have left it unchanged.
    if (snapshot) requested = { snapshot, version }
    width = surface.clientWidth
    height = surface.clientHeight
    restoreRequested()
    scheduleIdle()
  }
  surface.addEventListener('scroll', onScroll, { passive: true })
  surface.addEventListener('scrollend', idle)
  surface.addEventListener('pointerdown', onDown, { passive: true })
  surface.addEventListener('touchstart', onDown, { passive: true })
  surface.addEventListener('wheel', userIntent, { passive: true })
  surface.addEventListener('keydown', userIntent)
  window.addEventListener('pointerup', onUp, { passive: true })
  window.addEventListener('pointercancel', onUp, { passive: true })
  surface.addEventListener('touchend', onUp, { passive: true })
  surface.addEventListener('touchcancel', onUp, { passive: true })
  surface.ownerDocument.addEventListener('visibilitychange', visibility)
  scheduleIdle()
  return {
    capture,
    discard() {
      // Explicit jumps and restoration invalidate a prior checkpoint without scanning layout.
      snapshot = undefined
      hiddenRequest = false
      requested = undefined
      version++
      lastOffset = surface.scrollTop
      scheduleIdle()
    },
    request(snapshotIntent: ScrollSnapshotOffset) {
      // An explicit kit request replaces the hide-time checkpoint without scanning visible rows.
      snapshot = Object.freeze(snapshotIntent)
      hiddenRequest = surface.ownerDocument.visibilityState === 'hidden'
      requested = undefined
      version++
    },
    canWrite,
    active,
    anchor: () => snapshot?.anchor,
    restore,
    viewportChanged() {
      if (hidden || surface.ownerDocument.visibilityState === 'hidden') return
      const changed = width !== surface.clientWidth || height !== surface.clientHeight
      width = surface.clientWidth
      height = surface.clientHeight
      if (!changed || !active()) return
      if ((touching || scrolling) && snapshot && surface.scrollTop !== snapshot.y) {
        requested = undefined
        return
      }
      // An unreported native scroll is intent unless WebKit merely clamped an out-of-range offset.
      const clamped = lastOffset > maximum() && Math.abs(surface.scrollTop - maximum()) <= 1
      if (!touching && !scrolling && surface.scrollTop !== lastOffset && !clamped) {
        version++
        requested = undefined
        scheduleIdle()
        return
      }
      if (snapshot) requested = { snapshot, version }
      restoreRequested()
    },
    contentChanged() {
      if (hidden || surface.ownerDocument.visibilityState === 'hidden') return
      requested = undefined
      scheduleIdle()
    },
    dispose() {
      clearTimeout(timer)
      surface.removeEventListener('scroll', onScroll)
      surface.removeEventListener('scrollend', idle)
      surface.removeEventListener('pointerdown', onDown)
      surface.removeEventListener('touchstart', onDown)
      surface.removeEventListener('wheel', userIntent)
      surface.removeEventListener('keydown', userIntent)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      surface.removeEventListener('touchend', onUp)
      surface.removeEventListener('touchcancel', onUp)
      surface.ownerDocument.removeEventListener('visibilitychange', visibility)
    },
  }
}
