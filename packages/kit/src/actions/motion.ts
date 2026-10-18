import { hideSwipeFace, swipeGeometryAnimations } from './swipeFace.ts'
import type { SwipeResponse } from './swipeResponse.ts'
import { animateElement, timelineStart } from '../motion/animate.ts'
import { swipeContentTrack, resizeRowCornerAnimation } from './rowScrub.ts'
import {
  swipeActionTracks,
  presentedTakeover,
  presentedPillResponse,
  retainPillRelease,
} from './rowScrub.ts'
/** Stock List on physical iPad, swipe-parity r23/r28, 2026-10-17.
 * Joint fit to the row's presentation-layer release curves (open and close),
 * 50..650ms after lift: RMS 0.294pt, maximum 0.796pt. Mass is normalized to 1.
 * See the implementation contract for sources and calibration limits.
 * Pill scale has a different, underdamped response; this is only the row fit. */
export const swipeRelease = {
  stiffness: 165.37927124507326,
  damping: 26.3065709683783,
  duration: 766.667,
} as const
export const swipeClose = {
  stiffness: swipeRelease.stiffness,
  damping: swipeRelease.damping,
  duration: 750,
  /** Zero-velocity tap close begins 35.39 / 37.16ms after delivered up in r28/r23.
   * The same onset fits row, signed capsule scale and opacity independently. */
  onset: 36.275,
} as const
/** Below one point per 60 Hz frame, a lifted finger counts as held still. */
const HELD_RELEASE_VELOCITY = 60
export { swipeReleasePosition } from './swipeSpring.ts'
import { swipeReleasePosition, swipePillScale } from './swipeSpring.ts'
export function settleSwipe(
  element: HTMLElement,
  from: number,
  to: number,
  velocity: number,
  primary?: HTMLElement,
  openWidth = 0,
  fromRest = false,
  width = 0,
  allowsFullSwipe = false,
  release?: { time: number; kind: 'tap' | 'drag' | 'commit' },
) {
  const caughtTakeover = primary ? presentedTakeover(primary, from) : 0
  // A full swipe whose action keeps the row returns it from the takeover pose.
  // Native (iPad o1 leading commit, presentation layer) holds the pose until
  // the same measured onset as a tap-close, then returns the row on the close
  // spring while the expanded button collapses with it (see collapsing()).
  const committedReturn = release?.kind === 'commit' && to === 0 && caughtTakeover > 0
  // A tap dismisses a fully settled tray. Native keeps the capsule centers fixed,
  // but scale crosses zero while alpha eases out without oscillating (r28).
  const closingRestingTray =
    fromRest && to === 0 && caughtTakeover === 0 && Math.abs(Math.abs(from) - openWidth) < 0.001
  // The measured onset belongs to a tap on a fully open tray. A caught or
  // dragged tray must not jump to scale 1 or inherit an unmeasured input delay.
  const tapClose = closingRestingTray && release?.kind === 'tap'
  // A finger lifted from a held row: native starts the release 2 frames after
  // lift-off too (iPad o1 slow two-line drag, released open from -115pt; Satin
  // previously led by 33ms, up to 9pt). Moving releases are unmeasured and start now.
  const heldRelease = release?.kind === 'drag' && Math.abs(velocity) < HELD_RELEASE_VELOCITY
  const releaseStart =
    release && (tapClose || heldRelease || committedReturn)
      ? release.time + swipeClose.onset
      : undefined
  const contentFrame = swipeContentTrack(element)
  const tracks = primary
    ? swipeActionTracks(
        primary,
        primary.parentElement?.children.length ?? Math.round((openWidth - 10) / 70),
        width,
        allowsFullSwipe,
      )
    : []
  const caughtPills = new Map(
    tracks.map(track => [track.element, presentedPillResponse(track.element)]),
  )
  swipeGeometryAnimations(element).forEach(animation => animation.cancel())
  Object.assign(element.style, contentFrame(to, to === 0 ? 0 : 1))
  for (const track of tracks) {
    track.element.getAnimations?.().forEach(animation => animation.cancel())
    Object.assign(track.element.style, track.frame(to, to, 1))
  }
  if (
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    typeof element.animate !== 'function'
  )
    return
  const fit = to === 0 ? swipeClose : swipeRelease
  const positions = Array.from({ length: 43 }, (_, index) =>
    index === 42
      ? to
      : swipeReleasePosition(from, to, velocity, ((index / 42) * fit.duration) / 1000, fit),
  )
  const settleProgress = (index: number) =>
    Math.max(
      0,
      Math.min(1, swipeReleasePosition(0, 1, 0, ((index / 42) * fit.duration) / 1000, fit)),
    )
  const timing = {
    duration: fit.duration,
    easing: 'linear',
    ...(releaseStart !== undefined ? { fill: 'backwards' as const } : {}),
  }
  const startTime = releaseStart !== undefined ? timelineStart(releaseStart) : undefined
  const contentFrames = () =>
    positions.map((position, index) => ({
      offset: index / 42,
      ...contentFrame(
        position,
        fromRest
          ? to === 0
            ? 1 - settleProgress(index)
            : 1
          : to === 0
            ? 0
            : settleProgress(index),
      ),
    }))
  const animation = animateElement(element, contentFrames(), timing)
  if (animation && startTime !== undefined) animation.startTime = startTime
  // The face returns to rest on the close spring, timed from the release like
  // native's tap-close and drag-back (r116: both fade within one frame of each other).
  const host = element.closest<HTMLElement>('[data-satin-row-actions]')
  if (to === 0 && host) hideSwipeFace(host, release?.time ?? performance.now())
  resizeRowCornerAnimation(element, animation, contentFrames)
  if (committedReturn) {
    returnCommittedPills({
      tracks,
      caughtPills,
      from,
      positions,
      takeover: caughtTakeover,
      timing,
      releaseStart: releaseStart!,
      duration: fit.duration,
    })
    return animation
  }
  for (const track of tracks) {
    const caughtPill = caughtPills.get(track.element)
    if (track.element.matches('[data-satin-swipe-action]') && (closingRestingTray || caughtPill)) {
      retainPillRelease(
        track.element,
        closingRestingTray ? { position: 1, velocity: 0 } : caughtPill!,
        to === 0 ? 0 : 1,
        releaseStart ?? performance.now(),
        fit.duration,
      )
    }
    const actionAnimation = animateElement(
      track.element,
      positions.map((position, index) => {
        // A committed pill starts expanded. Treating it as a resting tray here
        // discards that pose and flashes the secondary actions on release.
        const frame = track.frame(
          position,
          position,
          fromRest && caughtTakeover === 0 ? 1 : settleProgress(index),
          caughtTakeover,
        )
        const caughtPill = caughtPills.get(track.element)
        if (!closingRestingTray && caughtPill) {
          const target = to === 0 ? 0 : 1
          const seconds = ((index / 42) * fit.duration) / 1000
          const scale =
            index === 42
              ? target
              : swipeReleasePosition(
                  caughtPill.position,
                  target,
                  caughtPill.velocity,
                  seconds,
                  swipePillScale,
                )
          return {
            offset: index / 42,
            ...frame,
            transform: String(frame.transform).replace(/scale\([^)]*\)/, `scale(${scale})`),
          }
        }
        if (!closingRestingTray || !track.element.matches('[data-satin-swipe-action]'))
          return { offset: index / 42, ...frame }
        const seconds = ((index / 42) * fit.duration) / 1000
        const scale = index === 42 ? 0 : swipeReleasePosition(1, 0, 0, seconds, swipePillScale)
        return {
          offset: index / 42,
          ...frame,
          transform: String(frame.transform).replace(/scale\([^)]*\)/, `scale(${scale})`),
          opacity: 1 - settleProgress(index),
        }
      }),
      timing,
    )
    if (actionAnimation && startTime !== undefined) actionAnimation.startTime = startTime
  }
  return animation
}

type SwipeTrack = ReturnType<typeof swipeActionTracks>[number]

/** The expanded pill of a committed full swipe follows its returning row back
 * to the resting button (iPad o1 leading commit, native presentation layer):
 * - frame width and centre: linear in the row's progress, same spring as the row;
 * - opacity: equal to the row's progress (0.783 / 0.557 / 0.372 at +102 / +152 / +202ms);
 * - scale: the tap-close capsule spring from the caught scale, about the frame centre
 *   (0.561 / 0.120 measured vs 0.570 / 0.124 fitted, 100 / 200ms after onset). */
function returnCommittedPills(state: {
  tracks: SwipeTrack[]
  caughtPills: Map<HTMLElement, SwipeResponse | undefined>
  from: number
  positions: number[]
  takeover: number
  timing: KeyframeAnimationOptions
  releaseStart: number
  duration: number
}) {
  const last = state.positions.length - 1
  const startTime = timelineStart(state.releaseStart)
  for (const track of state.tracks) {
    const isButton = track.element.matches('[data-satin-swipe-action]')
    const caught = state.caughtPills.get(track.element) ?? { position: 1, velocity: 0 }
    if (isButton) retainPillRelease(track.element, caught, 0, state.releaseStart, state.duration)
    const frames = state.positions.map((position, index) => {
      const seconds = ((index / last) * state.duration) / 1000
      const progress = index === last ? 0 : Math.max(0, Math.min(1, position / state.from))
      const scale =
        index === last
          ? 0
          : swipeReleasePosition(caught.position, 0, caught.velocity, seconds, swipePillScale)
      return {
        offset: index / last,
        ...track.collapsing(state.from, progress, scale, state.takeover),
      }
    })
    const animation = animateElement(track.element, frames, state.timing)
    if (animation) animation.startTime = startTime
  }
}

import nativeMotion from './nativeMotion.json'
/** Keep the retained departing row and its action parts on one clock. The
 * existing commit envelope is retained here; this fixes frozen pills, not the
 * still-unqualified velocity-dependent commit fit. Native r31 records moving
 * pull-view/button bounds during both slow and fast commits. */
export function advanceCommittedSwipe(
  content: HTMLElement,
  from: number,
  width: number,
  primary?: HTMLElement,
  allowsFullSwipe = true,
) {
  const to = (Math.sign(from) || -1) * width
  const takeover = primary ? presentedTakeover(primary, from) : 0
  const contentFrame = swipeContentTrack(content)
  const tracks = [
    { element: content, frame: (position: number) => contentFrame(position) },
    ...(primary
      ? swipeActionTracks(
          primary,
          primary.parentElement?.children.length ?? 1,
          width,
          allowsFullSwipe,
        ).map(track => ({
          element: track.element,
          frame: (position: number, progress: number) =>
            track.frame(position, position, 0, takeover + (1 - takeover) * progress),
        }))
      : []),
  ]
  const start = timelineStart(performance.now())
  for (const track of tracks) {
    track.element.getAnimations?.().forEach(animation => animation.cancel())
    Object.assign(track.element.style, track.frame(to, 1))
    const animation = animateNative(track.element, 'commitAdvance', progress =>
      track.frame(from + (to - from) * progress, progress),
    )
    if (animation) animation.startTime = start
  }
}

/** PTS-sampled native envelopes. Geometry and image progress are kept distinct:
 * backdrop samples only drive opacity, and row displacement only drives height. */
export function animateNative(
  element: HTMLElement,
  kind: keyof typeof nativeMotion,
  frames: (progress: number) => Keyframe,
) {
  const curve = nativeMotion[kind]
  if (
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    typeof element.animate !== 'function'
  )
    return undefined
  return animateElement(
    element,
    curve.keyframes.map(([offset, progress]) => ({
      offset,
      ...frames(Math.max(0, Math.min(1, progress))),
    })),
    { duration: curve.duration, easing: 'linear', fill: 'forwards' },
  )
}
