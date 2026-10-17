export const DEV_MENU_HOLD_MS = 1_000
export const DEV_MENU_MOVEMENT_PX = 8
const JOIN_DEADLINE_MS = 150

export interface Contact {
  readonly id: number
  readonly x: number
  readonly y: number
}

/** Passive observer. A failed contact sequence stays rejected until every finger lifts. */
export function createDevMenuGesture(options: {
  open(): void
  blocked(): boolean
  now?: () => number
}) {
  const now = options.now ?? (() => performance.now())
  let origins = new Map<number, Contact>()
  let firstAt = 0
  let rejected = false
  let fired = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const cancel = () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
    rejected = true
  }
  const update = (contacts: readonly Contact[], phase: 'start' | 'move' | 'end' | 'cancel') => {
    if (contacts.length === 0) {
      cancel()
      origins.clear()
      rejected = false
      fired = false
      return
    }
    if (phase === 'cancel' || phase === 'end' || options.blocked() || contacts.length > 2) cancel()
    if (rejected || fired) return
    if (origins.size === 0) firstAt = now()
    for (const contact of contacts) {
      const origin = origins.get(contact.id)
      if (!origin) {
        if (origins.size && now() - firstAt > JOIN_DEADLINE_MS) {
          cancel()
          return
        }
        origins.set(contact.id, contact)
      } else if (Math.hypot(contact.x - origin.x, contact.y - origin.y) > DEV_MENU_MOVEMENT_PX) {
        cancel()
        return
      }
    }
    if (origins.size !== contacts.length) {
      cancel()
      return
    }
    if (contacts.length === 2 && timer === undefined) {
      timer = setTimeout(() => {
        timer = undefined
        if (rejected || fired) return
        if (options.blocked()) {
          cancel()
          return
        }
        fired = true
        options.open()
      }, DEV_MENU_HOLD_MS)
    }
  }
  return { update, cancel, dispose: cancel }
}

export function installDevMenuGesture(open: () => void, isOpen: () => boolean) {
  const selectionBlocked = () => {
    const selection = document.getSelection()
    const active = document.activeElement
    return (
      isOpen() ||
      document.visibilityState === 'hidden' ||
      Boolean(selection && !selection.isCollapsed) ||
      Boolean(
        active?.closest(
          'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
        ),
      )
    )
  }
  const recognizer = createDevMenuGesture({ open, blocked: selectionBlocked })
  const touch = (event: TouchEvent) => {
    // Exclude selectable/editable roles before native selection can begin.
    if (
      event.type === 'touchstart' &&
      event
        .composedPath()
        .some(
          target =>
            target instanceof Element &&
            target.matches(
              'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [data-satin-role="content"]',
            ),
        )
    )
      recognizer.cancel()
    const phase = event.type.slice(5) as 'start' | 'move' | 'end' | 'cancel'
    recognizer.update(
      Array.from(event.touches, contact => ({
        id: contact.identifier,
        x: contact.clientX,
        y: contact.clientY,
      })),
      phase,
    )
  }
  const cancel = () => recognizer.cancel()
  for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
    document.addEventListener(type, touch as EventListener, { passive: true, capture: true })
  }
  document.addEventListener('selectionchange', cancel)
  document.addEventListener('visibilitychange', cancel)
  document.addEventListener('scroll', cancel, { passive: true, capture: true })
  window.addEventListener('blur', cancel)
  return () => {
    recognizer.dispose()
    for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
      document.removeEventListener(type, touch as EventListener, true)
    }
    document.removeEventListener('selectionchange', cancel)
    document.removeEventListener('visibilitychange', cancel)
    document.removeEventListener('scroll', cancel, true)
    window.removeEventListener('blur', cancel)
  }
}
