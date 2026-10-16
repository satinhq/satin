const active = new Set<symbol>()
const listeners = new Set<() => void>()
export function hasActivePresentation() {
  return active.size > 0
}
export function subscribePresentationActivity(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function retainPresentation() {
  const id = Symbol('presentation')
  active.add(id)
  let released = false
  return () => {
    if (released) return
    released = true
    active.delete(id)
    for (const listener of listeners) listener()
  }
}
