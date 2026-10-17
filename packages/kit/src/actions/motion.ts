import { animateElement } from '../motion/animate.ts'
import { swipeContentTrack, resizeRowCornerAnimation } from './rowScrub.ts'
import { swipeActionTracks, presentedTakeover } from './rowScrub.ts'
/** Counter-retimed physical iPad iOS 27 capture, swipe-motion/r3/native-a.
 * 45 opening samples: 1.06pt RMS. 41 closing samples: 0.42pt RMS.
 * These fits do not establish a velocity-only full-swipe threshold. */
export const swipeRelease = {
  stiffness: 121.34922937441745,
  damping: 20.028579580094434,
  duration: 766.667,
} as const
export const swipeClose = {
  stiffness: 111.42158149810808,
  damping: 21.893283929309167,
  duration: 750,
} as const
export { swipeReleasePosition } from './swipeSpring.ts'
import { swipeReleasePosition } from './swipeSpring.ts'
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
) {
  const caughtTakeover = primary ? presentedTakeover(primary, from) : 0
  const contentFrame = swipeContentTrack(element)
  const tracks = primary
    ? swipeActionTracks(
        primary,
        primary.parentElement?.children.length ?? Math.round((openWidth - 10) / 70),
        width,
        allowsFullSwipe,
      )
    : []
  element.getAnimations().forEach(animation => animation.cancel())
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
  const timing = { duration: fit.duration, easing: 'linear' }
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
  resizeRowCornerAnimation(element, animation, contentFrames)
  for (const track of tracks) {
    animateElement(
      track.element,
      positions.map((position, index) => ({
        offset: index / 42,
        // A committed pill starts expanded. Treating it as a resting tray here
        // discards that pose and flashes the secondary actions on release.
        ...track.frame(
          position,
          position,
          fromRest && caughtTakeover === 0 ? 1 : settleProgress(index),
          caughtTakeover,
        ),
      })),
      timing,
    )
  }
  return animation
}

import nativeMotion from './nativeMotion.json'
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
