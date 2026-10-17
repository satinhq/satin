/** WAAPI has no animationstart event. Announce framework-owned motion so glass inside
 * the animated element can follow its compositor geometry without an idle frame loop. */
const listeners = new WeakMap<Element, Set<() => void>>()
const layoutAnimations = new WeakMap<Element, Set<Animation>>()

export function hasLayoutAnimation(scope: Element) {
  const animations = layoutAnimations.get(scope)
  if (!animations) return false
  for (const animation of animations) {
    if (animation.playState === 'running') return true
  }
  return false
}

export function observeAnimations(element: Element, listener: () => void) {
  let callbacks = listeners.get(element)
  if (!callbacks) {
    callbacks = new Set()
    listeners.set(element, callbacks)
  }
  callbacks.add(listener)
  return () => {
    if (!callbacks.delete(listener)) return
    if (!callbacks.size) listeners.delete(element)
  }
}

export function announceAnimation(element: Element) {
  for (const listener of listeners.get(element) ?? []) listener()
}

export function animateElement(
  element: Element,
  frames: Keyframe[] | PropertyIndexedKeyframes | null,
  options?: number | KeyframeAnimationOptions,
) {
  const animation = element.animate(frames, options)
  announceAnimation(element)
  return animation
}

/** Height/width motion can move siblings, so notify the containing layout scope. */
export function animateLayout(
  element: Element,
  frames: Keyframe[] | PropertyIndexedKeyframes | null,
  options?: number | KeyframeAnimationOptions,
) {
  const scope = element.parentElement ?? element
  const animation = element.animate(frames, options)
  let animations = layoutAnimations.get(scope)
  if (!animations) {
    animations = new Set()
    layoutAnimations.set(scope, animations)
  }
  animations.add(animation)
  const complete = () => {
    animations.delete(animation)
    if (!animations.size) layoutAnimations.delete(scope)
    announceAnimation(scope)
  }
  animation.finished?.then(complete, complete)
  announceAnimation(scope)
  return animation
}

/**
 * The document timeline's time minus the performance clock's, in milliseconds. Both start at
 * the document's time origin; the timeline holds the current frame's time, so the two normally
 * differ by less than a frame.
 */
export function timelineOffset() {
  const timeline = Number(document.timeline?.currentTime ?? Number.NaN)
  return Number.isFinite(timeline) ? timeline - performance.now() : 0
}

/** More than any frame can explain: the timeline is not on the performance clock. */
const TIMELINE_DRIFT_MS = 1000

/**
 * `at` (performance clock) as a start time on the document timeline, for animations whose
 * renderer track uses the same `at`. It is `at` itself unless the clocks have come apart by more
 * than a frame. A timeline held back across a suspension would otherwise keep every later run
 * in its before phase (`fill: 'both'` shows the first keyframe), so the run would never finish.
 * That drift has not been measured on a device. The resume readout reports `timelineOffset`.
 */
export function timelineStart(at: number) {
  const offset = timelineOffset()
  return Math.abs(offset) > TIMELINE_DRIFT_MS ? at + offset : at
}
