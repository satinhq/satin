import { cancelPointerPressForOwnedGesture } from '../press/gestureArbitration.ts'
import type { MenuContactSample } from './menuContact.ts'

/** Prepare on down; only a stationary hold transfers the contact to the presenter. */
export function bindMenuTriggerHold(
  element: HTMLElement,
  show: (sample: MenuContactSample) => void,
) {
  let pending: MenuContactSample | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const clear = () => {
    clearTimeout(timer)
    pending = undefined
  }
  const down = (event: PointerEvent) => {
    if (!event.isPrimary || event.button !== 0) return
    clear()
    pending = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
    timer = setTimeout(() => {
      if (!pending) return
      const sample = pending
      pending = undefined
      show(sample)
      cancelPointerPressForOwnedGesture(sample.pointerId)
    }, 400)
  }
  const touchStart = (event: TouchEvent) => {
    if (event.touches.length !== 1 || pending?.touchId !== undefined) return
    if (pending) pending.touchId = event.changedTouches[0]!.identifier
  }
  const move = (event: PointerEvent) => {
    if (
      pending?.pointerId === event.pointerId &&
      Math.hypot(event.clientX - pending.x, event.clientY - pending.y) > 10
    )
      clear()
  }
  const end = (event: PointerEvent) => {
    if (pending?.pointerId === event.pointerId) clear()
  }
  element.addEventListener('pointerdown', down, true)
  element.addEventListener('touchstart', touchStart, { passive: true })
  element.ownerDocument.addEventListener('pointermove', move, true)
  element.ownerDocument.addEventListener('pointerup', end, true)
  element.ownerDocument.addEventListener('pointercancel', end, true)
  return () => {
    clear()
    element.removeEventListener('pointerdown', down, true)
    element.removeEventListener('touchstart', touchStart)
    element.ownerDocument.removeEventListener('pointermove', move, true)
    element.ownerDocument.removeEventListener('pointerup', end, true)
    element.ownerDocument.removeEventListener('pointercancel', end, true)
  }
}
