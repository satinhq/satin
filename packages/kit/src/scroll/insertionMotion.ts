import {
  allowsComposerMotion,
  INSERTION_DURATION_MS,
  insertionProgress,
} from '../motion/composerMotion.ts'
import type { KeyboardTranslation } from '../keyboard/translation.ts'

export const SCROLL_INSERTION_MOTION = 'satin-scroll-insertion-motion'
const motions = new WeakMap<HTMLElement, KeyboardTranslation>()
export function insertionMotion(surface: HTMLElement) {
  return motions.get(surface)
}

/** Translate the already-anchored layout from its previous presented position. */
export function createInsertionMotion(surface: HTMLElement, content: HTMLElement) {
  let animation: Animation | undefined
  let first: Element | null = null
  let last: Element | null = null
  let firstTop = 0
  let initialized = false
  let bottomInset = 0
  let restoreClip: string | undefined
  let holding = false
  let replacedContent = false
  const now = () => performance.timeOrigin + performance.now()
  // DOM rects and their normalization must use the same presented frame. A later
  // wall-clock sample can move an explicit bottom target a few points off bottom.
  const offset = () =>
    motions.has(surface)
      ? parseFloat(getComputedStyle(content).translate?.split(' ')[1] ?? '0') || 0
      : 0
  const announce = () => window.dispatchEvent(new Event(SCROLL_INSERTION_MOTION))
  const cancel = () => {
    animation?.cancel()
    animation = undefined
    holding = false
    if (restoreClip !== undefined) {
      surface.style.clipPath = restoreClip
      restoreClip = undefined
    }
    if (motions.delete(surface)) announce()
  }
  const tail = () => {
    let element = content.lastElementChild
    while (element?.lastElementChild) element = element.lastElementChild
    return element
  }
  const reconcile = (pinned: boolean, hold = false) => {
    const releasing = holding && !hold
    const nextInset = parseFloat(getComputedStyle(surface).paddingBottom) || 0
    const resized = initialized && nextInset !== bottomInset
    bottomInset = nextInset
    const nextFirst = content.firstElementChild
    const nextLast = tail()
    // Geometry must subtract the transform sampled by layout, not a later wall-clock
    // spring sample. Mixing those clocks accumulates subpixel drift at each delivery.
    const presented = offset()
    const nextTop = (nextFirst?.getBoundingClientRect().top ?? 0) - presented
    // A subsequent append preserves the previous terminal element before the new
    // one. Empty/placeholder replacement is handled separately as a first insert.
    const appended =
      last &&
      nextLast &&
      last !== nextLast &&
      content.contains(last) &&
      !last.contains(nextLast) &&
      Boolean(last.compareDocumentPosition(nextLast) & Node.DOCUMENT_POSITION_FOLLOWING)
    const replacedTail =
      replacedContent ||
      (initialized && last !== nextLast && Boolean(last) && !content.contains(last))
    replacedContent = false
    const firstInsert = initialized && (!first || !content.contains(first)) && Boolean(nextFirst)
    const distance =
      first === nextFirst
        ? firstTop - nextTop
        : firstInsert
          ? (nextFirst?.getBoundingClientRect().height ?? 0)
          : 0
    initialized = true
    first = nextFirst
    last = nextLast
    firstTop = nextTop
    if (
      !pinned ||
      !(appended || firstInsert || resized || replacedTail || releasing) ||
      (Math.abs(distance) < 0.5 && !releasing) ||
      !allowsComposerMotion(content)
    )
      return
    const from = distance + presented
    cancel()
    // SafeAreaInset intentionally lets ordinary scrolling continue beneath its
    // accessory. Insert presentation must not paint a bubble through the editor.
    restoreClip = surface.style.clipPath
    surface.style.clipPath = `inset(0 0 ${nextInset}px 0)`
    const epoch = now()
    // A requested target may arrive asynchronously after the composer clears.
    // Keep its old visual anchor until that request resolves or input cancels it;
    // the worker receives the same stationary trajectory, with no frame loop.
    holding = hold
    const duration = hold ? 1 : INSERTION_DURATION_MS
    const stops = hold
      ? ([
          [0, from],
          [1, from],
        ] as const)
      : insertionProgress.map(
          (progress, index) =>
            [index / (insertionProgress.length - 1), from * (1 - progress)] as const,
        )
    const run = content.animate(
      stops.map(([progress, y]) => ({ translate: `0 ${y}px`, offset: progress })),
      {
        duration,
        // The document timeline can still be at the previous frame when startTime
        // is assigned below. Retain the starting pose during that before phase,
        // including another inset reconciliation in the same observer delivery.
        fill: 'both',
      },
    )
    run.startTime = epoch - performance.timeOrigin
    void run.finished?.catch(() => {})
    animation = run
    motions.set(surface, {
      epoch,
      duration,
      end: hold ? epoch : epoch + duration,
      offset: 0,
      stops,
    })
    run.onfinish = () => {
      if (animation === run && !hold) cancel()
    }
    announce()
  }
  const contentChanged = (records: MutationRecord[]) => {
    // A bubble can retain a decorative final child while replacing its typing
    // indicator. The terminal leaf's identity alone misses that layout change.
    replacedContent ||= records.some(
      record =>
        last &&
        [...record.removedNodes].some(node => node.nodeType === Node.ELEMENT_NODE) &&
        record.target.contains(last),
    )
  }
  return { reconcile, offset, cancel, contentChanged }
}
