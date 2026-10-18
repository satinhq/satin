import { animateElement, timelineStart } from '../motion/animate.ts'
import { swipeReleasePosition } from './swipeSpring.ts'

/**
 * The swiped row's face. A stock List cell fades from its resting colour to the
 * swipe grey after its pan is recognized, and back after a released row starts to
 * close. Both fades run on time: they keep going while the finger holds still, and
 * they do not follow the row's travel.
 *
 * The grey is a layer behind the row's content (`[data-satin-swipe-face-tint]`);
 * this module animates its opacity, which the compositor runs.
 *
 * Constants: native presentation-layer face colour on iPad, sampled every display
 * frame and timed on the input clock (the clock of touch timestamps), so they
 * apply directly to touch event times. Fits and residuals: swipe-face-calibration.json.
 */
export const swipeFaceAppear = {
  /** 10 strokes (slow, partial, flick, fast steps, both edges); peak error 0.03,
   * 0.06 on one slow commit. Critically damped. */
  stiffness: 100.60015092634691,
  damping: 20.114333994350574,
  /** After the input sample that crossed the 25pt pan recognition distance. */
  delayMilliseconds: 23.27,
} as const

export const swipeFaceDisappear = {
  /** Tap-close and drag-back cancel; peak error 0.035. */
  stiffness: 127.97305868627578,
  damping: 20.65775725918,
  /** After the lift-off (or dismissing tap) input sample. */
  delayMilliseconds: 15.58,
} as const

const FACE_ANIMATION_ID = 'satin-swipe-face'
const FRAME_MILLISECONDS = 1000 / 60
/** A fade has settled once it is this close to its target (well below one 8-bit step). */
const SETTLED = 0.001

/** Swipe geometry animations on the row content. The face fade lives on its own
 * layer, so release and catch can cancel geometry without touching it. */
export function swipeGeometryAnimations(element: HTMLElement) {
  return (element.getAnimations?.() ?? []).filter(animation => animation.id !== FACE_ANIMATION_ID)
}

function faceTint(host: HTMLElement) {
  return host.querySelector<HTMLElement>('[data-satin-swipe-face-tint]')
}

/** The tint's presented opacity: 0 at rest, 1 fully swiped. */
function presentedProgress(tint: HTMLElement) {
  const value = Number.parseFloat(getComputedStyle(tint).opacity)
  return Number.isFinite(value) ? value : 0
}

type Spring = { stiffness: number; damping: number; delayMilliseconds: number }

/** Spring samples from `from` to `to`, one per 60 Hz frame, until settled. */
function faceSamples(from: number, to: number, spring: Spring) {
  const samples = [from]
  for (let frame = 1; frame < 600; frame++) {
    const value = swipeReleasePosition(from, to, 0, (frame * FRAME_MILLISECONDS) / 1000, spring)
    samples.push(value)
    if (Math.abs(value - to) < SETTLED) break
  }
  samples[samples.length - 1] = to
  return samples
}

function cancelFade(tint: HTMLElement) {
  tint.getAnimations?.().forEach(animation => {
    if (animation.id === FACE_ANIMATION_ID) animation.cancel()
  })
}

/**
 * Fade the face toward `to` (1 swiped, 0 rest) with `spring`, timed from the input
 * sample at `inputTime` (performance clock). The fade starts from the presented
 * opacity, so a reversal mid-fade continues smoothly.
 */
function fadeFace(host: HTMLElement, to: 0 | 1, inputTime: number, spring: Spring) {
  const tint = faceTint(host)
  host.dataset.satinSwipeFace = to === 1 ? 'swiped' : 'closing'
  if (!tint) return
  const from = presentedProgress(tint)
  cancelFade(tint)
  // The end value is also the inline style, so the fade can finish without a jump.
  tint.style.opacity = String(to)
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  if (reducedMotion || Math.abs(from - to) < SETTLED) return
  const samples = faceSamples(from, to, spring)
  const animation = animateElement(
    tint,
    samples.map(opacity => ({ opacity })),
    // Hold the starting opacity until the native start time.
    { duration: (samples.length - 1) * FRAME_MILLISECONDS, easing: 'linear', fill: 'backwards' },
  )
  animation.id = FACE_ANIMATION_ID
  animation.startTime = timelineStart(inputTime + spring.delayMilliseconds)
  // A reversal or reset cancels this fade, which rejects `finished`; nothing awaits it.
  animation.finished?.catch(() => {})
}

/** Fade the face in for a pan recognized by the input sample at `recognizedAt`. */
export function showSwipeFace(host: HTMLElement, recognizedAt: number) {
  if (host.dataset.satinSwipeFace === 'swiped') return
  fadeFace(host, 1, recognizedAt, swipeFaceAppear)
}

/** Fade the face back to rest after the input sample at `releasedAt` closed the row. */
export function hideSwipeFace(host: HTMLElement, releasedAt: number) {
  if (host.dataset.satinSwipeFace !== 'swiped') return
  fadeFace(host, 0, releasedAt, swipeFaceDisappear)
}

/** Return the face to rest immediately: the row was reset without a close fade. */
export function resetSwipeFace(host: HTMLElement) {
  delete host.dataset.satinSwipeFace
  const tint = faceTint(host)
  if (!tint) return
  cancelFade(tint)
  tint.style.opacity = ''
}
