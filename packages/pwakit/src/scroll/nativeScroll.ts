/** One native dispatch per scroll owner, shared by active contacts and geometry observers. */
export type NativeScrollSnapshot = Readonly<{
  event: Event
  top: number
  left: number
  height: number
  contentHeight: number
  rect: (element: Element) => DOMRect
}>
type Listener = (snapshot: NativeScrollSnapshot) => void
const owners = new WeakMap<
  HTMLElement,
  { gestures: Set<Listener>; observers: Set<Listener>; dispose: () => void }
>()

function ownerFor(element: HTMLElement) {
  let owner = owners.get(element)
  if (owner) return owner
  const gestures = new Set<Listener>()
  const observers = new Set<Listener>()
  const scroll = (event: Event) => {
    if (event.target !== element) return
    const rectangles = new Map<Element, DOMRect>()
    let geometry: { top: number; left: number; height: number; contentHeight: number } | undefined
    const read = () =>
      (geometry ??= {
        top: element.scrollTop,
        left: element.scrollLeft,
        height: element.clientHeight,
        contentHeight: element.scrollHeight,
      })
    const snapshot: NativeScrollSnapshot = {
      event,
      get top() {
        return read().top
      },
      get left() {
        return read().left
      },
      get height() {
        return read().height
      },
      get contentHeight() {
        return read().contentHeight
      },
      rect(target) {
        let rect = rectangles.get(target)
        if (!rect) {
          rect = target.getBoundingClientRect()
          rectangles.set(target, rect)
        }
        return rect
      },
    }
    // Cancel active row/press arenas before glass or navigation observes their resulting state.
    for (const listener of [...gestures]) listener(snapshot)
    for (const listener of observers) listener(snapshot)
  }
  element.addEventListener('scroll', scroll, { passive: true })
  owner = { gestures, observers, dispose: () => element.removeEventListener('scroll', scroll) }
  owners.set(element, owner)
  return owner
}

function subscribe(element: HTMLElement, listener: Listener, gesture: boolean) {
  const owner = ownerFor(element)
  const listeners = gesture ? owner.gestures : owner.observers
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (!owner.gestures.size && !owner.observers.size) {
      owner.dispose()
      owners.delete(element)
    }
  }
}
/** Register only while an arena is active, rather than once for every rendered row. */
export function cancelOnNativeScroll(element: HTMLElement, listener: Listener) {
  return subscribe(element, listener, true)
}
export function observeNativeScroll(element: HTMLElement, listener: Listener) {
  return subscribe(element, listener, false)
}
