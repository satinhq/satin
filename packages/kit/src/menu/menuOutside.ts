import { ownMenuCompatibilityClick } from '../press/contactReceipt.ts'

const frameHolds = new WeakMap<Document, number>()
/** Keep WebView-owned catchers active through menu preparation and the close morph. */
export function holdEmbeddedFrameInput(document: Document) {
  frameHolds.set(document, (frameHolds.get(document) ?? 0) + 1)
  document.documentElement.setAttribute('data-satin-menu-shown', '')
  let released = false
  return () => {
    if (released) return
    released = true
    const remaining = (frameHolds.get(document) ?? 1) - 1
    if (remaining) frameHolds.set(document, remaining)
    else {
      frameHolds.delete(document)
      document.documentElement.removeAttribute('data-satin-menu-shown')
    }
  }
}

function isFrameCatcher(target: EventTarget | null) {
  return (
    typeof Element !== 'undefined' &&
    target instanceof Element &&
    target.hasAttribute('data-satin-webview-catcher')
  )
}
/** The open menu owns outside taps, but never cancels native pan defaults. */
export function bindMenuOutside({
  target = document,
  contains,
  isOpen,
  isShown = isOpen,
  dismiss,
  back = () => false,
}: {
  target?: EventTarget
  contains: (node: EventTarget | null) => boolean
  isOpen: () => boolean
  isShown?: () => boolean
  dismiss: () => void
  /** Escape first leaves an open submenu; it reports whether there was one. */
  back?: () => boolean
}) {
  let pointer: { id: number; x: number; y: number; moved: boolean; frame: boolean } | undefined
  const down = (event: Event) => {
    const e = event as PointerEvent
    if (!e.isPrimary || e.button !== 0) return
    const frame = isFrameCatcher(e.target)
    if (!(frame ? isShown() : isOpen()) || contains(e.target)) return
    pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, frame }
    if (frame) e.preventDefault()
    // Prevent underlying controls from acquiring a press. Do not preventDefault:
    // scrolling remains owned by WebKit and the declared ScrollSurface.
    e.stopPropagation()
  }
  const move = (event: Event) => {
    const e = event as PointerEvent
    if (pointer?.id === e.pointerId)
      pointer.moved ||= Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y) > 10
  }
  const up = (event: Event) => {
    const e = event as PointerEvent
    if (pointer?.id !== e.pointerId) return
    move(e)
    const tap = !pointer.moved || pointer.frame
    pointer = undefined
    e.stopPropagation()
    ownMenuCompatibilityClick(target, e.pointerId)
    if (tap) dismiss()
  }
  const cancel = (event: Event) => {
    if (pointer?.id === (event as PointerEvent).pointerId) pointer = undefined
  }
  const key = (event: Event) => {
    const e = event as KeyboardEvent
    if (isOpen() && e.key === 'Escape') {
      e.preventDefault()
      if (!back()) dismiss()
    }
  }
  const wheel = (event: Event) => {
    if (!isShown() || !isFrameCatcher(event.target) || contains(event.target)) return
    event.preventDefault()
    event.stopPropagation()
    if (isOpen()) dismiss()
  }
  const handlers = {
    pointerdown: down,
    pointermove: move,
    pointerup: up,
    pointercancel: cancel,
    keydown: key,
    wheel,
  }
  for (const [type, handler] of Object.entries(handlers))
    target.addEventListener(type, handler, { capture: true, passive: false })
  return () => {
    for (const [type, handler] of Object.entries(handlers))
      target.removeEventListener(type, handler, { capture: true })
  }
}
