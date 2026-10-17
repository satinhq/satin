/** The control a presentation grows from when the app names no anchor. Native iOS 27 presents
 * `confirmationDialog` as a popover from the view that asked for it: a swipe action's dialog points
 * at its row, a toolbar button's dialog grows out of the button. Satin's natural structure attaches
 * the dialog at screen level, so the pressed control supplies the attachment point. */
const lastPress = new WeakMap<Document, { target: Element; time: number }>()
const tracked = new WeakSet<Document>()
// A press older than this did not open the dialog (a timer or a data change did).
const PRESS_FRESHNESS_MS = 1500

export function trackPresentationSource(document: Document) {
  if (tracked.has(document) || typeof document.addEventListener !== 'function') return
  tracked.add(document)
  document.addEventListener(
    'pointerdown',
    event => {
      if (event.target instanceof Element)
        lastPress.set(document, { target: event.target, time: event.timeStamp })
    },
    { capture: true, passive: true },
  )
}

export function presentationSource(document: Document, now: number): Element | null {
  const press = lastPress.get(document)
  const pressed = press && now - press.time < PRESS_FRESHNESS_MS ? press.target : null
  const focused = document.activeElement !== document.body ? document.activeElement : null
  const origin = pressed?.isConnected ? pressed : focused
  if (!origin || origin.closest('dialog')) return null
  // A swipe action belongs to its row: the swipe closes, and native points at the row.
  return (
    origin.closest('[data-satin-row-actions]') ??
    origin.closest('button, [role="button"], [data-satin-pressable="true"], a[href]')
  )
}
