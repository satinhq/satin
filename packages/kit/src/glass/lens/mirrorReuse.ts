import { imageCaptureRevision } from '../../image/resource.ts'
import { reportGlassError } from '../errors.ts'
import { isUnstyledFlag, mirrorRevision, rewrittenAttributes } from './mirrorExtents.ts'
import type { MirrorCaptureRange, MirrorLayout } from './Scene.tsx'

/** Reusing a whole mirror measurement.
 *
 * A presentation's planes are measured while it is held for its first glass and again after its
 * entrance (every preparation measures every plane). A measurement reads a box and a computed style
 * per element, so a host whose mirror cannot have changed returns its previous measurement. The
 * measurement is host-relative; its inputs are:
 * - the host's subtree: mirrorRevision (DOM changes other than unstyled framework flags: the hold,
 *   its glass receipts, the motion flag, `inert`), a nested scroll, an
 *   image load, source damage, an animation or transition inside it, a new host width);
 * - the host: its size, scroll offset, scroll height and the window measured, and focus inside it;
 * - its ancestors: every attribute change except those flags and a style change of motion alone
 *   (a travelling sheet's layer moves its content as one; a scale changes the host's size);
 * - the document: viewport size, resolution, colour scheme and contrast, the host's font size
 *   (Dynamic Type), font loads, image capture registrations and the stylesheet count.
 * Not tracked, as for bounded scans (mirrorExtents.ts): `:hover`/`:active` styles and CSSOM rule
 * edits. The audit hook (`globalThis.__SATIN_MIRROR_AUDIT__`) measures every reuse again and
 * reports a difference as a GlassError. */

type Kept = {
  inputs: string
  revision: number
  active: Element | null
  ancestors: readonly Element[]
  layout: MirrorLayout
  /** An ancestor attribute changed since the measurement (what changed, for the audit). */
  changed: string | false
  watch: MutationObserver
}
const kept = new Map<HTMLElement, Kept>()

let fontRevision = 0
let fontsWatched = false
function watchFonts() {
  if (fontsWatched || typeof document === 'undefined' || !document.fonts) return
  fontsWatched = true
  document.fonts.addEventListener('loadingdone', () => fontRevision++)
}

/** Style properties that move or fade a subtree as one, without changing any box inside it. */
const MOTION = ['transform', 'translate', 'opacity', 'will-change']
let scratch: HTMLElement | undefined
function withoutMotion(style: string | null) {
  scratch ??= document.createElement('div')
  // Parse through CSSOM: setAttribute would violate hash-only style-src even
  // on this detached scratch element.
  scratch.style.cssText = style ?? ''
  for (const property of MOTION) scratch.style.removeProperty(property)
  return scratch.style.cssText
}
/** What changed on an ancestor in this batch of records, if anything a descendant could show. */
function ancestorChanged(records: readonly MutationRecord[]): string | false {
  const rewritten = rewrittenAttributes(records)
  for (const record of records) {
    const change = !rewritten.has(record) && ancestorRecordChanged(record)
    if (change) return change
  }
  return false
}
function ancestorRecordChanged(record: MutationRecord): string | false {
  if (isUnstyledFlag(record)) return false
  const target = record.target as Element
  const now = target.getAttribute(record.attributeName!)
  if (record.attributeName === 'style' && withoutMotion(record.oldValue) === withoutMotion(now))
    return false
  return `${target.tagName.toLowerCase()}[${record.attributeName}] ${record.oldValue ?? ''} -> ${now ?? ''}`.slice(
    0,
    160,
  )
}

const ancestorsOf = (host: HTMLElement) => {
  const chain: Element[] = []
  for (let node = host.parentElement; node; node = node.parentElement) chain.push(node)
  return chain
}
const focusIn = (host: HTMLElement) => {
  const active = host.ownerDocument.activeElement
  return active && host.contains(active) ? active : null
}

/** Everything outside the subtree's DOM that a measurement of `host` reads. */
export function mirrorInputs(
  host: HTMLElement,
  capture: 'viewport' | 'plane',
  range: MirrorCaptureRange | undefined,
) {
  watchFonts()
  const rect = host.getBoundingClientRect()
  const media = (query: string) => matchMedia?.(query).matches ?? false
  return JSON.stringify([
    capture,
    range?.top,
    range?.bottom,
    range?.bands,
    rect.width,
    rect.height,
    host.scrollTop,
    host.scrollLeft,
    host.scrollHeight,
    innerWidth,
    innerHeight,
    devicePixelRatio,
    media('(prefers-color-scheme: dark)'),
    media('(prefers-contrast: more)'),
    getComputedStyle(host).fontSize,
    fontRevision,
    imageCaptureRevision(),
    document.styleSheets.length,
  ])
}

/** The previous measurement of `host`, when nothing it reads has changed since. */
export function reusedMirrorLayout(
  host: HTMLElement,
  inputs: string,
  revision: number,
  lastChange = '',
) {
  const entry = kept.get(host)
  if (!entry) return
  entry.changed ||= ancestorChanged(entry.watch.takeRecords())
  const ancestors = ancestorsOf(host)
  const miss = entry.changed
    ? `ancestor ${entry.changed}`
    : entry.inputs !== inputs
      ? `inputs ${entry.inputs} -> ${inputs}`
      : entry.revision !== revision
        ? `subtree ${lastChange}`
        : entry.active !== focusIn(host)
          ? 'focus'
          : ancestors.length !== entry.ancestors.length ||
              ancestors.some((node, index) => node !== entry.ancestors[index])
            ? 'moved'
            : undefined
  if (!miss) return entry.layout
  const hook = auditHook()
  if (hook) (hook.misses ??= []).push(`${host.dataset.satinScroll ?? host.tagName}: ${miss}`)
}

/** Keep a fresh measurement of `host`, taken at `inputs` and subtree `revision`. */
export function keepMirrorLayout(
  host: HTMLElement,
  inputs: string,
  revision: number,
  layout: MirrorLayout,
) {
  for (const [other, entry] of kept)
    if (other === host || !other.isConnected) {
      entry.watch.disconnect()
      kept.delete(other)
    }
  const ancestors = ancestorsOf(host)
  const entry: Kept = {
    inputs,
    revision,
    active: focusIn(host),
    ancestors,
    layout,
    changed: false,
    watch: new MutationObserver(records => {
      entry.changed ||= ancestorChanged(records)
    }),
  }
  for (const node of ancestors)
    entry.watch.observe(node, { attributes: true, attributeOldValue: true })
  kept.set(host, entry)
}

/** Measure `host`, or return its previous measurement when nothing it reads has changed. */
export function measureOrReuse(
  host: HTMLElement,
  capture: 'viewport' | 'plane',
  range: MirrorCaptureRange | undefined,
  measure: () => MirrorLayout | undefined,
): { layout: MirrorLayout | undefined; reused: boolean } {
  const { revision, animating, lastChange } = mirrorRevision(host)
  const inputs = mirrorInputs(host, capture, range)
  const previous = reusedMirrorLayout(host, inputs, revision, lastChange)
  if (previous) {
    audit(host, previous, measure)
    return { layout: previous, reused: true }
  }
  const layout = measure()
  // A reading mid-animation is not kept: the animation can end without any other change.
  if (layout && !animating) keepMirrorLayout(host, inputs, revision, layout)
  else forgetMirrorLayout(host)
  return { layout, reused: false }
}

type ReuseAudit = { scans: number; mismatches: string[]; reuses?: number; misses?: string[] }
const auditHook = () =>
  (globalThis as { __SATIN_MIRROR_AUDIT__?: ReuseAudit }).__SATIN_MIRROR_AUDIT__
const content = (layout: MirrorLayout) =>
  JSON.stringify([layout.width, layout.contentHeight, layout.nodes])
function audit(host: HTMLElement, previous: MirrorLayout, measure: () => MirrorLayout | undefined) {
  const hook = auditHook()
  if (!hook) return
  hook.reuses = (hook.reuses ?? 0) + 1
  const fresh = measure()
  if (!fresh || content(fresh) === content(previous)) return
  const detail = `${host.dataset.satinScroll ?? host.tagName}: reused ${previous.nodes.length} nodes, fresh ${fresh.nodes.length}`
  hook.mismatches.push(detail)
  reportGlassError('presentation', Error(detail), 'backdrop capture', 'stale-mirror-reuse')
}

function forgetMirrorLayout(host: HTMLElement) {
  kept.get(host)?.watch.disconnect()
  kept.delete(host)
}

/** Tests: forget every kept measurement. */
export function forgetMirrorLayouts() {
  for (const entry of kept.values()) entry.watch.disconnect()
  kept.clear()
}
