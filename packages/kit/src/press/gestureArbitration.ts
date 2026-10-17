/** The gesture that claimed a touch: the navigation back swipe, or any other pan (a scroll, a
 * sheet's drag, a menu's hold). */
export type OwnedGesture = 'back-swipe' | 'other'

export type OwnedTouchHandoff = Readonly<{ touchIdentifier: number; retired: AbortSignal }>
type CancellationObserver = (owner: OwnedGesture, handoff?: OwnedTouchHandoff) => boolean | void

const pointerPressCancellations = new Map<number, () => void>()
const cancellationObservers = new Map<number, Set<CancellationObserver>>()

/** Resources prepared by a press share its cancellation without replacing its activation owner. */
export function observePointerPressCancellation(pointerId: number, cancel: CancellationObserver) {
  const observers = cancellationObservers.get(pointerId) ?? new Set<CancellationObserver>()
  observers.add(cancel)
  cancellationObservers.set(pointerId, observers)
  return () => {
    observers.delete(cancel)
    if (!observers.size && cancellationObservers.get(pointerId) === observers)
      cancellationObservers.delete(pointerId)
  }
}

export function registerPointerPressCancellation(pointerId: number, cancel: () => void) {
  pointerPressCancellations.set(pointerId, cancel)
  return () => {
    if (pointerPressCancellations.get(pointerId) === cancel) {
      pointerPressCancellations.delete(pointerId)
    }
  }
}

export function cancelPointerPressForOwnedGesture(
  pointerId: number,
  owner: OwnedGesture = 'other',
  handoff?: OwnedTouchHandoff,
) {
  const cancel = pointerPressCancellations.get(pointerId)
  const observers = cancellationObservers.get(pointerId)
  if (!cancel && !observers?.size) return false
  pointerPressCancellations.delete(pointerId)
  cancel?.()
  // An observer may keep the physical contact after activation has yielded. A later owner must
  // still reach it. Existing observers remain one-shot unless they explicitly decline.
  for (const observer of [...(observers ?? [])]) {
    if (observer(owner, handoff) !== false) observers?.delete(observer)
  }
  if (!observers?.size && cancellationObservers.get(pointerId) === observers)
    cancellationObservers.delete(pointerId)
  return true
}
