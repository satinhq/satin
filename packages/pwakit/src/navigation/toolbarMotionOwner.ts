/** The actual navigation animation owns timing, including paused preparation and tails. */
type Property = 'opacity' | 'scale' | 'transform'
const tracks = new WeakMap<HTMLElement, Map<Property, Animation>>()

export function toolbarMotionAnimation(element: HTMLElement | undefined, property: Property) {
  return element ? tracks.get(element)?.get(property) : undefined
}

export function announceToolbarMotion(element: Element) {
  element.dispatchEvent?.(new Event('satin-toolbar-material', { bubbles: true }))
}

export function registerToolbarMotion(
  element: HTMLElement,
  property: Property,
  animation: Animation,
) {
  let owned = tracks.get(element)
  if (!owned) {
    owned = new Map()
    tracks.set(element, owned)
  }
  owned.set(property, animation)
  const notify = () => {
    if (owned.get(property) === animation) announceToolbarMotion(element)
  }
  const retire = () => {
    if (owned.get(property) !== animation) return
    owned.delete(property)
    announceToolbarMotion(element)
  }
  void animation.ready?.then(notify, () => {})
  // Finished fill owns the endpoint until navigation cancels or replaces it.
  animation.addEventListener?.('finish', notify)
  animation.addEventListener?.('cancel', retire, { once: true })
  notify()
}
