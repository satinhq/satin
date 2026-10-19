/**
 * Which swipeable rows keep a live native scroll source.
 *
 * A row's swipe can be driven by its own horizontal scroller (rowScrub.ts), so WebKit's
 * scrolling tree moves the row in step with the finger. WebKit composites every such scroller,
 * with its sticky content, as its own layer tree. On a long list (an installed iPad, 240
 * two- and three-line mail rows) those layers made every frame of a swipe cost ~16 ms more
 * layer flushing on the main thread than a 12-row list: the row moved on one display refresh in
 * four. Rows also appeared late while the list scrolled quickly, because each row entering
 * the screen needed its own layers.
 *
 * Only rows near the visible part of their list keep a live source. The others are dormant
 * (`data-satin-row-source="dormant"`: `overflow-x: hidden`, so no compositing, and vertical-only
 * native panning) and swipe through the touch path, which presents the same motion from touch
 * events. Rows change state only once the list has stopped
 * scrolling, so a fling never builds layers for the rows it passes, and a row that is being
 * swiped, or is open, keeps its source.
 */

/** The list counts as scrolling until this long after its last scroll event. */
const SCROLL_IDLE_MS = 150
/** Rows within this margin of the list's visible part keep a live source. */
const NEAR_MARGIN = '50% 0px'

type ListArming = {
  observer: IntersectionObserver
  near: Map<Element, boolean>
  lastScrollAt: number
  timer: ReturnType<typeof setTimeout> | undefined
  stopScroll: () => void
}
const lists = new Map<Element | null, ListArming>()

/** A row whose swipe is in progress or open keeps the source it has. */
function rowBusy(row: HTMLElement) {
  return row.dataset.satinSwipeActive === 'true' || row.dataset.satinRowSwipeMoving === 'true'
}

function applyArming(list: ListArming) {
  list.timer = undefined
  for (const [row, near] of list.near) {
    const element = row as HTMLElement
    if (rowBusy(element)) continue
    if (near) delete element.dataset.satinRowSource
    else element.dataset.satinRowSource = 'dormant'
  }
}

function scheduleArming(list: ListArming) {
  if (list.timer !== undefined) return
  const wait = Math.max(0, list.lastScrollAt + SCROLL_IDLE_MS - performance.now())
  list.timer = setTimeout(() => {
    list.timer = undefined
    // Still scrolling: wait for the list to come to rest.
    if (performance.now() - list.lastScrollAt < SCROLL_IDLE_MS) scheduleArming(list)
    else applyArming(list)
  }, wait)
}

function listFor(scroller: HTMLElement | null) {
  let list = lists.get(scroller)
  if (list) return list
  const target: EventTarget = scroller ?? window
  const scrolled = () => {
    list!.lastScrollAt = performance.now()
  }
  target.addEventListener('scroll', scrolled, { passive: true })
  list = {
    near: new Map(),
    lastScrollAt: -Infinity,
    timer: undefined,
    stopScroll: () => target.removeEventListener('scroll', scrolled),
    observer: new IntersectionObserver(
      entries => {
        for (const entry of entries) list!.near.set(entry.target, entry.isIntersecting)
        scheduleArming(list!)
      },
      { root: scroller, rootMargin: NEAR_MARGIN },
    ),
  }
  lists.set(scroller, list)
  return list
}

/**
 * Keeps `row`'s native scroll source live while the row is near the visible part of its list,
 * and makes it dormant otherwise. Returns the cleanup.
 */
export function armRowSourceNearViewport(row: HTMLElement) {
  // A new row starts live, as every row did before, so a contact right after it mounts finds its
  // source; the observer's first report makes the far ones dormant.
  if (typeof IntersectionObserver === 'undefined') return () => {}
  const scroller = row.parentElement?.closest<HTMLElement>('[data-satin-scroll]') ?? null
  const list = listFor(scroller)
  list.near.set(row, true)
  list.observer.observe(row)
  return () => {
    list.observer.unobserve(row)
    list.near.delete(row)
    delete row.dataset.satinRowSource
    if (list.near.size) return
    list.observer.disconnect()
    list.stopScroll()
    clearTimeout(list.timer)
    lists.delete(scroller)
  }
}
