import { ownMenuCompatibilityClick } from '../press/contactReceipt.ts'
/** The open menu owns outside taps, but never cancels native pan defaults. */
export function bindMenuOutside({
  target = document,
  contains,
  isOpen,
  dismiss,
  back = () => false,
}: {
  target?: EventTarget
  contains: (node: EventTarget | null) => boolean
  isOpen: () => boolean
  dismiss: () => void
  /** Escape first leaves an open submenu; it reports whether there was one. */
  back?: () => boolean
}) {
  let pointer: { id: number; x: number; y: number; moved: boolean } | undefined
  const down = (event: Event) => {
    const e = event as PointerEvent
    if (!e.isPrimary || e.button !== 0) return
    if (!isOpen() || contains(e.target)) return
    pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false }
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
    const tap = !pointer.moved
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
  const handlers = {
    pointerdown: down,
    pointermove: move,
    pointerup: up,
    pointercancel: cancel,
    keydown: key,
  }
  for (const [type, handler] of Object.entries(handlers))
    target.addEventListener(type, handler, { capture: true })
  return () => {
    for (const [type, handler] of Object.entries(handlers))
      target.removeEventListener(type, handler, { capture: true })
  }
}
