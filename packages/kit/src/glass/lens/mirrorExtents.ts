import { changesMirrorSource } from './mirrorInvalidation.ts'
import { GLASS_SOURCE_DAMAGE_EVENT } from '../sourceDamage.ts'

/** Bounded mirror scans.
 *
 * A windowed capture (a long list) keeps only elements whose own box reaches its window, but a
 * whole-tree scan still read one rectangle per element: on a 1,200-message thread (~22,000
 * elements) that read was half of the main thread while a reply streamed. A subtree can be skipped
 * when no element in it reaches the window. Whether that holds is known from the last scan: each
 * element records how far its subtree's boxes reach beyond its own box ("extent", relative to the
 * element, so it survives the element moving). A later scan reads the element's box once and
 * skips the subtree when box plus extent misses the window.
 *
 * Skipping is a superset filter: every visited element is still judged by its own box exactly as
 * before, so a bounded scan returns the same nodes as a whole-tree scan whenever the recorded
 * extents are current. They are dropped when they may not be:
 * - a DOM change inside the subtree (children, text, attributes) drops the extents of its target
 *   and every ancestor;
 * - an attribute change can restyle descendants (selectors, inheritance), so it also drops every
 *   extent recorded inside its target before the change (a generation stamp);
 * - a nested scroller's scroll, an image load, and a running animation or transition do the same
 *   for their element;
 * - an element whose own size changed, or a host whose width changed, is measured again.
 *
 * Layout that moves without any of these (`position: fixed` content inside a scroller, `:hover`
 * styles) is not tracked; MIRROR_EXTENT_SLACK keeps small movements in the window. The audit hook
 * (`globalThis.__SATIN_MIRROR_AUDIT__`) compares every bounded scan with a whole-tree scan. */

/** Extra reach (points) a recorded extent is given before its subtree is skipped. */
export const MIRROR_EXTENT_SLACK = 32

type Extent = {
  /** How far the subtree's boxes reach above the element's own top (points, >= 0). */
  above: number
  /** How far they reach below its own bottom (points, >= 0). */
  below: number
  width: number
  height: number
  generation: number
}

/** Framework flags no style reads (the presentation hold, its glass receipts and its motion flag):
 * a whole measurement survives them (mirrorReuse.ts). `data-satin-source-ready` is a navigation
 * readiness flag (NavigatorHost.tsx). */
const UNSTYLED_FLAGS = new Set([
  'data-satin-glass-hold',
  'data-satin-glass-source',
  'data-satin-glass-show',
  'data-satin-glass-presented',
  'data-satin-glass-presented-show',
  'data-satin-presentation-moving',
  'data-satin-source-ready',
  'inert',
])
/** Attribute records of a batch whose attribute ends the batch with the value it had before it: a
 * value written again, or React's radio-group detach on every controlled input update (`name` set
 * to '' and back). */
export function rewrittenAttributes(records: readonly MutationRecord[]) {
  const before = new Map<Node, Map<string, string | null>>()
  for (const record of records) {
    if (record.type !== 'attributes') continue
    const values = before.get(record.target) ?? new Map<string, string | null>()
    before.set(record.target, values)
    if (!values.has(record.attributeName!)) values.set(record.attributeName!, record.oldValue)
  }
  return new Set(
    records.filter(
      record =>
        record.type === 'attributes' &&
        before.get(record.target)!.get(record.attributeName!) ===
          (record.target as Element).getAttribute(record.attributeName!),
    ),
  )
}
export const isUnstyledFlag = (record: Pick<MutationRecord, 'type' | 'attributeName'>) =>
  record.type === 'attributes' && UNSTYLED_FLAGS.has(record.attributeName ?? '')

/** The terminal inset is non-inherited and owned by ScrollSurface. It can resize
 * the scroller, but cannot restyle each message. The walk still checks each cached
 * subtree's width and height before reusing its relative extent. Other style
 * changes retain the conservative descendant invalidation. */
function terminalInsetChanged(record: MutationRecord, target: Element) {
  if (
    record.type !== 'attributes' ||
    record.attributeName !== 'style' ||
    !target.hasAttribute('data-satin-scroll') ||
    record.oldValue === null
  )
    return false
  const before = document.createElement('div').style
  const after = document.createElement('div').style
  before.cssText = record.oldValue
  after.cssText = target.getAttribute('style') ?? ''
  before.removeProperty('--satin-scroll-inset-bottom')
  after.removeProperty('--satin-scroll-inset-bottom')
  return before.cssText === after.cssText
}

class ExtentTracker {
  readonly extents = new WeakMap<Element, Extent>()
  readonly stamps = new WeakMap<Element, number>()
  generation = 0
  /** Counts every change the subtree's mirror could show (mirrorRevision). */
  revision = 0
  /** An animation or transition inside the host ran at the last sync. */
  animating = false
  /** Diagnostics (the mirror audit): the last change counted. */
  lastChange = ''
  hostWidth = -1
  private readonly observer: MutationObserver
  private readonly host: HTMLElement
  constructor(host: HTMLElement) {
    this.host = host
    this.observer = new MutationObserver(records => this.apply(records))
    this.observer.observe(host, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeOldValue: true,
    })
    const touched = (event: Event) => {
      if (!(event.target instanceof Element)) return
      if (diagnosing()) this.lastChange = `${event.type} on ${describe(event.target)}`
      if (event.target !== host) this.drop(event.target, true)
      // The host's own scroll offset is part of a reused measurement's inputs (mirrorReuse.ts).
      else if (event.type !== 'scroll') this.revision++
    }
    host.addEventListener('scroll', touched, { capture: true, passive: true })
    host.addEventListener('load', touched, true)
    host.addEventListener(GLASS_SOURCE_DAMAGE_EVENT, touched, true)
  }
  /** Drop the extents of `element` and its ancestors up to the host; `stamp` also drops every
   * extent recorded inside `element` until now. */
  drop(element: Element, stamp: boolean, revise = true) {
    if (revise) this.revision++
    if (stamp) this.stamps.set(element, ++this.generation)
    for (let node: Element | null = element; node; node = node.parentElement) {
      this.extents.delete(node)
      if (node === this.host) break
    }
  }
  private apply(records: readonly MutationRecord[]) {
    const rewritten = rewrittenAttributes(records)
    for (const record of records) {
      if (!changesMirrorSource(record)) continue
      // Reuse already treats these records as unchanged source. Preserve the
      // matching subtree extents too: stamping an unchanged ancestor turns the
      // next composer update into a full transcript walk.
      if (isUnstyledFlag(record) || rewritten.has(record)) continue
      const target = record.target instanceof Element ? record.target : record.target.parentElement
      if (!target) continue
      this.drop(target, record.type === 'attributes' && !terminalInsetChanged(record, target))
      if (diagnosing())
        this.lastChange =
          `${record.type}:${record.attributeName ?? ''} on ${describe(target)} ${record.oldValue ?? ''} -> ${record.attributeName ? (target.getAttribute(record.attributeName) ?? '') : ''}`.slice(
            0,
            200,
          )
    }
  }
  /** Bring the extents up to date before a scan. */
  sync(width: number) {
    this.apply(this.observer.takeRecords())
    if (width !== this.hostWidth) {
      this.hostWidth = width
      this.clear()
    }
    this.animating = false
    if (typeof document.getAnimations !== 'function') return
    for (const animation of document.getAnimations()) {
      const target = (animation.effect as KeyframeEffect | null)?.target
      if (target && target !== this.host && this.host.contains(target)) {
        this.drop(target, true)
        this.animating = true
        if (diagnosing()) this.lastChange = `animation on ${describe(target)}`
      }
    }
  }
  clear() {
    this.revision++
    this.stamps.set(this.host, ++this.generation)
    this.extents.delete(this.host)
  }
}

const diagnosing = () => '__SATIN_MIRROR_AUDIT__' in globalThis
const describe = (element: Element) =>
  `${element.tagName.toLowerCase()}${element.className && typeof element.className === 'string' ? `.${element.className.trim().split(/\s+/).join('.')}` : ''}`.slice(
    0,
    80,
  )

/** Bounded scans need DOM change records (a browser document). */
export const canTrackMirrorExtents = () => typeof MutationObserver !== 'undefined'

const trackers = new WeakMap<HTMLElement, ExtentTracker>()
const trackerFor = (host: HTMLElement) => {
  let tracker = trackers.get(host)
  if (!tracker) {
    tracker = new ExtentTracker(host)
    trackers.set(host, tracker)
  }
  return tracker
}

/** A counter of every change `host`'s mirror could show since the last call: DOM changes in its
 * subtree (unstyled framework flags aside), a nested scroll, an image load, source damage, a running
 * animation or transition inside it, a new host width. Equal counters mean no such change; a
 * reading taken while something inside animates can be outdated as soon as it ends. */
export function mirrorRevision(host: HTMLElement) {
  const tracker = trackerFor(host)
  tracker.sync(host.getBoundingClientRect().width)
  return {
    revision: tracker.revision,
    animating: tracker.animating,
    lastChange: tracker.lastChange,
  }
}

/** Forget every recorded extent of `host` (text size or appearance changed). */
export function dropMirrorExtents(host: HTMLElement) {
  trackers.get(host)?.clear()
}

type Open = {
  element: Element
  top: number
  bottom: number
  /** Largest generation stamp on this element or any ancestor below the host. */
  stamp: number
  rect: DOMRect
}

/** Visit `host` and its descendants in document order, reading each visited element's box once.
 * `visit` returns whether the element's own box reaches the window. A subtree whose recorded
 * extent misses `[top, bottom]` (viewport points, the window's paint margin included) is skipped
 * when `bounded`; otherwise every element is visited, and the extents are recorded either way. */
export function scanMirrorTree(
  host: HTMLElement,
  window: { top: number; bottom: number },
  bounded: boolean,
  visit: (element: HTMLElement, rect: DOMRect) => void,
) {
  const tracker = trackerFor(host)
  const hostRect = host.getBoundingClientRect()
  tracker.sync(hostRect.width)
  const open: Open[] = []
  const close = (entry: Open) => {
    const { element, rect } = entry
    if (rect.width && rect.height)
      tracker.extents.set(element, {
        above: rect.top - entry.top,
        below: entry.bottom - rect.bottom,
        width: rect.width,
        height: rect.height,
        generation: tracker.generation,
      })
    const parent = open.at(-1)
    if (parent) {
      parent.top = Math.min(parent.top, entry.top)
      parent.bottom = Math.max(parent.bottom, entry.bottom)
    }
  }
  const reach = (rect: DOMRect) =>
    rect.width && rect.height
      ? { top: rect.top, bottom: rect.bottom }
      : { top: Infinity, bottom: -Infinity }
  const walk = (element: Element, rect: DOMRect) => {
    const stamp = Math.max(open.at(-1)?.stamp ?? 0, tracker.stamps.get(element) ?? 0)
    visit(element as HTMLElement, rect)
    const own = reach(rect)
    open.push({ element, rect, stamp, ...own })
  }
  walk(host, hostRect)
  for (let next: Element | null = host.firstElementChild; open.length;) {
    if (!next) {
      const done = open.pop()!
      close(done)
      next = open.length ? done.element.nextElementSibling : null
      continue
    }
    const rect = next.getBoundingClientRect()
    const known = bounded ? tracker.extents.get(next) : undefined
    const parentStamp = open.at(-1)!.stamp
    if (
      known &&
      rect.width === known.width &&
      rect.height === known.height &&
      known.generation >= Math.max(parentStamp, tracker.stamps.get(next) ?? 0) &&
      (rect.bottom + known.below + MIRROR_EXTENT_SLACK < window.top ||
        rect.top - known.above - MIRROR_EXTENT_SLACK > window.bottom)
    ) {
      const parent = open.at(-1)!
      parent.top = Math.min(parent.top, rect.top - known.above)
      parent.bottom = Math.max(parent.bottom, rect.bottom + known.below)
      next = next.nextElementSibling
      continue
    }
    walk(next, rect)
    next = next.firstElementChild ?? (close(open.pop()!), next.nextElementSibling)
  }
}
