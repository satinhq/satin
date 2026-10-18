/**
 * One cancelable touch listener per list, instead of one per row.
 *
 * A row cancels native scrolling once it owns a swipe or a context hold (`preventDefault` on
 * `touchmove`), so its move, end and cancel listeners cannot be passive. WebKit keeps a
 * synchronous touch region for every element that has such a listener, and rebuilds all of
 * them in each rendering update that changes layout or compositing. With one listener per row,
 * a 1,200-message transcript spent about 30 ms of every such update on that rebuild (iOS-family
 * WebKit, measured October 2026). That includes the update that starts the composer's keyboard
 * motion, so the composer stood still while the keyboard moved. One listener on the rows'
 * scroll content covers the same area with a single target.
 *
 * Touch events keep the target their touch started on, so the row that owns a touch is the
 * closest row around that target. The scroll content is the first element above the rows that
 * the rows' own listeners would have bubbled to, so `stopPropagation` still keeps row-owned
 * moves away from scroll views and navigation.
 */
export type RowTouchListener = (event: TouchEvent) => void

const ROW = '[data-satin-row-actions]'
const CANCELABLE_TOUCH_EVENTS = ['touchmove', 'touchend', 'touchcancel'] as const

type Delegate = {
  rows: Map<Element, RowTouchListener>
  dispatch: (event: Event) => void
}
const delegates = new WeakMap<HTMLElement, Delegate>()

/** The element that listens for this row: its list's scroll content, or the row itself. */
function delegateHost(row: HTMLElement) {
  return row.parentElement?.closest<HTMLElement>('[data-satin-scroll-content]') ?? row
}

function createDelegate(host: HTMLElement): Delegate {
  const rows = new Map<Element, RowTouchListener>()
  const dispatch = (event: Event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const row = target.closest(ROW)
    const listener = row ? rows.get(row) : undefined
    listener?.(event as TouchEvent)
  }
  for (const type of CANCELABLE_TOUCH_EVENTS)
    host.addEventListener(type, dispatch, { passive: false })
  return { rows, dispatch }
}

/** Route `touchmove`, `touchend` and `touchcancel` for touches that start in `row` to `listener`. */
export function listenForRowTouches(row: HTMLElement, listener: RowTouchListener) {
  const host = delegateHost(row)
  let delegate = delegates.get(host)
  if (!delegate) {
    delegate = createDelegate(host)
    delegates.set(host, delegate)
  }
  delegate.rows.set(row, listener)
  return () => {
    const current = delegates.get(host)
    if (!current || current.rows.get(row) !== listener) return
    current.rows.delete(row)
    if (current.rows.size) return
    for (const type of CANCELABLE_TOUCH_EVENTS) host.removeEventListener(type, current.dispatch)
    delegates.delete(host)
  }
}
