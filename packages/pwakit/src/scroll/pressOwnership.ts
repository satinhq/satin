import { cancelOnNativeScroll } from './nativeScroll.ts'
import { armPointerClickSuppression } from '../press/activation.ts'
import { cancelPointerPressForOwnedGesture } from '../press/gestureArbitration.ts'
import type { ScrollAxis } from './types.ts'

// Native Settings, iOS 26.5: 9 pt out-and-back selects; 10 pt cancels.
// This is a scroll recognizer threshold, not the plain button retention region.
export const SCROLL_PRESS_SLOP_PX = 10

/** Observe native pan intent without capturing, preventing, or emulating scroll. */
export function installScrollPressOwnership(element: HTMLElement, axis: ScrollAxis) {
  const contacts = new Map<number, { x: number; y: number; cancelled: boolean }>()
  const cancel = (id: number, contact: { cancelled: boolean }) => {
    if (contact.cancelled) return
    contact.cancelled = true
    cancelPointerPressForOwnedGesture(id)
  }
  const down = (event: PointerEvent) => {
    if (event.pointerType === 'mouse') return
    contacts.set(event.pointerId, { x: event.clientX, y: event.clientY, cancelled: false })
  }
  const move = (event: PointerEvent) => {
    const contact = contacts.get(event.pointerId)
    if (!contact) return
    const x = Math.abs(event.clientX - contact.x),
      y = Math.abs(event.clientY - contact.y)
    const along = axis === 'vertical' ? y : x,
      across = axis === 'vertical' ? x : y
    if (along >= SCROLL_PRESS_SLOP_PX && along >= across) cancel(event.pointerId, contact)
  }
  const up = (event: PointerEvent) => {
    // The final sample can cross the threshold without an intervening move.
    move(event)
    if (contacts.get(event.pointerId)?.cancelled) {
      // Refresh at UP: a user can hold a cancelled pan longer than the receipt.
      armPointerClickSuppression(performance.now())
    }
    contacts.delete(event.pointerId)
  }
  const cancelled = (event: PointerEvent) => {
    const contact = contacts.get(event.pointerId)
    if (contact) cancel(event.pointerId, contact)
    contacts.delete(event.pointerId)
  }
  const scroll = () => {
    for (const [id, contact] of contacts) cancel(id, contact)
  }
  const options = { capture: true, passive: true }
  element.addEventListener('pointerdown', down, options)
  element.addEventListener('pointermove', move, options)
  element.addEventListener('pointerup', up, options)
  element.addEventListener('pointercancel', cancelled, options)
  const releaseScroll = cancelOnNativeScroll(element, scroll)
  return () => {
    for (const [id, contact] of contacts) cancel(id, contact)
    contacts.clear()
    element.removeEventListener('pointerdown', down, options)
    element.removeEventListener('pointermove', move, options)
    element.removeEventListener('pointerup', up, options)
    element.removeEventListener('pointercancel', cancelled, options)
    releaseScroll()
  }
}
