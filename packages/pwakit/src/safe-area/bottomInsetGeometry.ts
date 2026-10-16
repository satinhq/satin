/** Published after a scroll surface receives its new terminal inset. */
export const BOTTOM_INSET_CHANGED = 'satin-bottom-inset-changed'

export type BottomInsetGeometry = Readonly<{
  value: number
  attached(): ReadonlySet<HTMLElement>
  participants(): ReadonlySet<HTMLElement>
  publish(next: number): void
  subscribeParticipants(changed: () => void): () => void
  attach(element: HTMLElement, changed?: () => void, descendants?: BottomInsetGeometry): () => void
}>

/** Deliver an inset only to layout owners, without invalidating every message in a scroll view. */
export function createBottomInsetGeometry(): BottomInsetGeometry {
  let value = 0
  const consumers = new Set<(value: number) => void>()
  const elements = new Set<HTMLElement>()
  const nested = new Set<BottomInsetGeometry>()
  const participantListeners = new Set<() => void>()
  const participantsChanged = () => {
    for (const changed of participantListeners) changed()
  }
  return {
    get value() {
      return value
    },
    /** The elements laid out inside this inset: its scroll views, nested insets and accessories. */
    attached() {
      return elements
    },
    participants() {
      return new Set([
        ...elements,
        ...[...nested].flatMap(geometry => [...geometry.participants()]),
      ])
    },
    subscribeParticipants(changed) {
      participantListeners.add(changed)
      return () => {
        participantListeners.delete(changed)
      }
    },
    publish(next: number) {
      if (!Number.isFinite(next) || next === value) return
      value = next
      for (const consume of consumers) consume(value)
    },
    attach(element, changed, descendants) {
      const property = '--satin-scroll-inset-bottom'
      const previous = element.style.getPropertyValue(property)
      const consume = (inset: number) => {
        const next = `${inset}px`
        if (element.style.getPropertyValue(property) === next) return
        element.style.setProperty(property, next)
        changed?.()
        element.dispatchEvent(new Event(BOTTOM_INSET_CHANGED))
      }
      consumers.add(consume)
      elements.add(element)
      consume(value)
      if (descendants) nested.add(descendants)
      const unsubscribe = descendants?.subscribeParticipants(participantsChanged)
      participantsChanged()
      return () => {
        consumers.delete(consume)
        elements.delete(element)
        unsubscribe?.()
        if (descendants) nested.delete(descendants)
        if (previous) element.style.setProperty(property, previous)
        else element.style.removeProperty(property)
        participantsChanged()
      }
    },
  }
}
