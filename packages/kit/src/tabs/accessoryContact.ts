import { armPointerClickSuppression } from '../press/activation.ts'
import { cancelPointerPressForOwnedGesture } from '../press/gestureArbitration.ts'

/** The accessory owns contacts that start on its chrome, including the gaps between controls. */
export function installAccessoryContactOwnership(element: HTMLElement) {
  const contacts = new Set<number>()
  const down = (event: PointerEvent) => {
    if (event.isPrimary && event.button === 0) contacts.add(event.pointerId)
  }
  const finish = (event: PointerEvent) => {
    if (!contacts.delete(event.pointerId)) return
    const bounds = element.getBoundingClientRect()
    const inside =
      element.isConnected &&
      event.target instanceof Node &&
      element.contains(event.target) &&
      event.clientX >= bounds.left &&
      event.clientX <= bounds.right &&
      event.clientY >= bounds.top &&
      event.clientY <= bounds.bottom
    if (event.type === 'pointercancel' || !inside) {
      cancelPointerPressForOwnedGesture(event.pointerId)
      // This receipt follows the contact if WebKit retargets its compatibility click
      // to a row after the accessory moved, or the finger left its bounds.
      armPointerClickSuppression(performance.now(), event.pointerId)
    }
  }
  const document = element.ownerDocument
  element.addEventListener('pointerdown', down, true)
  document.addEventListener('pointerup', finish, true)
  document.addEventListener('pointercancel', finish, true)
  return () => {
    element.removeEventListener('pointerdown', down, true)
    document.removeEventListener('pointerup', finish, true)
    document.removeEventListener('pointercancel', finish, true)
    for (const pointerId of contacts) {
      cancelPointerPressForOwnedGesture(pointerId)
      armPointerClickSuppression(performance.now(), pointerId)
    }
    contacts.clear()
  }
}
