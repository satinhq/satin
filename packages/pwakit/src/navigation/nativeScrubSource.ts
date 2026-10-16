// The private horizontal scroller that carries an installed back swipe: retiring it after a
// release and re-arming it for the next contact.

import { recordMotionPreparation } from '../motionProbe.ts'

/**
 * The installed interactive pop reads the finger from a private horizontal
 * scroller. After a release, that scroller is retired (offset clamped and
 * recentred) so native momentum cannot keep moving the page.
 *
 * UIKit binds a contact to a scroll view at touch-down, in the UI process,
 * from the last committed scrolling tree, before the page's touchstart runs.
 * A contact that lands while the source is retired has its offset clamped, so a
 * ScrollTimeline attached for that contact stays at its first pose while the
 * finger travels (owner phone 2026-09-24: repeated fast swipes left the page
 * at 6-19% of the width while the finger reached 42-58%).
 *
 * Retirement disables native scrolling for one committed rendering update,
 * then restores it. Recentering alone leaves UIKit deceleration alive and
 * consumes the next content tap before WebKit can deliver a DOM contact.
 * Contacts that touch down before a re-arm can have reached the scrolling tree
 * are reported as not live, and the host drives them from touch input. Re-arm
 * restores contact eligibility, while the offset clamp remains until the next
 * native scrub takes ownership. This prevents late momentum moving idle content.
 */
type NativeScrubSourceState = {
  frame: number
  rearmedAt: number
  retirement: number
  clamp: () => void
  clampActive: boolean
  overflowX: string
}
/** A retired source clamps its offset while its native deceleration is stopped. */
export const NATIVE_SCRUB_RETIRED_ATTRIBUTE = 'data-satin-scrub-retired'
const nativeScrubSources = new WeakMap<HTMLElement, NativeScrubSourceState>()
let nativeScrubRetirements = 0
/** One display frame at 60 Hz: a re-arm is committed with the next update. */
export const NATIVE_SCRUB_REARM_COMMIT_MS = 17

/** Retires the shared source and schedules its re-arm. Returns the retirement
 * token; only that retirement may be re-armed with it. */
export function retireNativeScrubSource(source: HTMLElement, origin: number) {
  const state = nativeScrubSources.get(source)
  if (state) source.removeEventListener?.('scroll', state.clamp)
  const retiredWidth = source.clientWidth
  const clamp = () => {
    const target =
      retiredWidth > 0 && source.clientWidth > 0
        ? (origin / retiredWidth) * source.clientWidth
        : origin
    if (source.scrollLeft !== target) source.scrollLeft = target
  }
  const next: NativeScrubSourceState = {
    frame: 0,
    rearmedAt: state?.rearmedAt ?? -Infinity,
    retirement: ++nativeScrubRetirements,
    clamp,
    clampActive: true,
    overflowX: state?.frame ? state.overflowX : source.style.overflowX,
  }
  if (state?.frame && typeof window !== 'undefined') window.cancelAnimationFrame(state.frame)
  nativeScrubSources.set(source, next)
  source.setAttribute?.(NATIVE_SCRUB_RETIRED_ATTRIBUTE, 'true')
  source.addEventListener?.('scroll', clamp, { passive: true })
  // Recentre immediately for painted stability. This alone does not end UIKit deceleration.
  source.scrollLeft = origin
  if (typeof window !== 'undefined') {
    next.frame = window.requestAnimationFrame(() => {
      // Run after lift, when UIKit has begun decelerating. Keep overflow disabled
      // through a rendering update so the native scrolling tree drops momentum.
      // Restore the same source: replacing it would lose active touch ownership.
      source.style.overflowX = 'hidden'
      void source.offsetWidth
      next.frame = window.requestAnimationFrame(() => {
        next.frame = 0
        source.style.overflowX = next.overflowX
        rearmNativeScrubSource(source, next.retirement)
      })
    })
  }
  return next.retirement
}

/** Re-arms the source if `retirement` (or, when omitted, any retirement) is
 * still current and its native reset has committed. A superseded retirement
 * never re-arms a newer one. */
export function rearmNativeScrubSource(source: HTMLElement, retirement?: number) {
  const state = nativeScrubSources.get(source)
  if (!state?.retirement || (retirement !== undefined && retirement !== state.retirement))
    return false
  // An endpoint release may complete before the native reset commits. Completion
  // must not cancel that reset and leave the next content tap stopping momentum.
  if (state.frame) return false
  state.retirement = 0
  // Re-arm contact eligibility, but keep offset ownership until another native scrub starts.
  // Momentum can arrive after the re-arm frame; letting it move this sticky ancestor shifts content.
  state.rearmedAt = performance.now()
  source.removeAttribute?.(NATIVE_SCRUB_RETIRED_ATTRIBUTE)
  recordMotionPreparation(() => ({ kind: 'navigation-source-rearmed', at: state.rearmedAt }))
  return true
}

/** A new eligible contact returns offset ownership before its native pan starts. Re-arming alone does not. */
export function releaseNativeScrubClamp(source: HTMLElement) {
  const state = nativeScrubSources.get(source)
  if (!state?.clampActive) return
  source.removeEventListener?.('scroll', state.clamp)
  state.clampActive = false
}

/** Whether a contact that touched down at `time` can be scrolling `source`. */
export function nativeScrubSourceLiveAt(source: HTMLElement | null | undefined, time: number) {
  if (!source || source.getAttribute?.(NATIVE_SCRUB_RETIRED_ATTRIBUTE)) return false
  const state = nativeScrubSources.get(source)
  return !state || (!state.retirement && time >= state.rearmedAt + NATIVE_SCRUB_REARM_COMMIT_MS)
}
