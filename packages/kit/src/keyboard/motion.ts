import { menuSpring } from '../glass/lens/menuSpring.ts'

/**
 * The software keyboard's show and hide motion. Measured per frame from the native composer's
 * presentation layer (`ScrollView` + `.safeAreaInset(edge: .bottom)` chat, iOS 27.0
 * Simulator, 4 shows and 4 hides; UIKit reports duration 0.3833 s, curve 7): a spring with mass 1,
 * stiffness 535 and damping 45.5, released at rest, fits every frame of both directions within
 * 0.84 pt of a 313 pt travel. UIKit ends the animation at 383 ms (0.4 pt short of rest).
 */
export const KEYBOARD_SPRING = Object.freeze({ stiffness: 535, damping: 45.5 })
export const KEYBOARD_DURATION_MS = 383

/**
 * How far the system keyboard's animation has progressed when the first frame drawn after WebKit's
 * report reaches the screen. WebKit reports the keyboard's final frame once, with a single
 * `visualViewport` resize, around the time the keyboard starts to move; the page's motion starts
 * this far into the keyboard's curve so the two stay together. Measured on the installed iPad
 * (screen stream with a per-frame counter, 4 shows and 4 hides, glass on and off): the report sits
 * later in a show than in a hide, and the best lead varies by about one frame between cycles
 * (show 24-49 ms, hide 12-31 ms). These are the means.
 */
export const KEYBOARD_SHOW_LEAD_MS = 36
export const KEYBOARD_HIDE_LEAD_MS = 23
/**
 * How far the keyboard's animation has progressed at the visual viewport report's own stamp, which
 * comes before the first frame the page draws. The keyboard carrier anchors its compositor motion to
 * that stamp (safe-area/keyboardCarrier.ts), so it needs these rather than the frame leads above.
 * Measured on iPad's painted frames (Control Center recordings indexed by a compositor refresh
 * counter, chat composer): a carrier started at stamp - 36/23 ms followed the
 * keyboard's curve exactly but a constant 38-46 ms (2 shows) and 60-63 ms (3 hides) behind.
 */
export const KEYBOARD_REPORT_SHOW_LEAD_MS = 78
export const KEYBOARD_REPORT_HIDE_LEAD_MS = 83

const STOPS = 24

/** The keyboard's progress from 0 to 1 at `step` of STOPS evenly spaced points in its duration. */
function keyboardProgress(step: number) {
  if (step >= STOPS) return 1
  const omega = Math.sqrt(KEYBOARD_SPRING.stiffness)
  const spring = {
    delay: 0,
    omega,
    zeta: KEYBOARD_SPRING.damping / (2 * omega),
    velocity: 0,
  }
  return 1 - menuSpring(spring, (step / STOPS) * KEYBOARD_DURATION_MS).value
}

const progressStops = Array.from({ length: STOPS + 1 }, (_, step) => keyboardProgress(step))
const easing = `linear(${progressStops.map(progress => String(Math.round(progress * 10000) / 10000)).join(', ')})`

/** The keyboard spring as a CSS `linear()` easing over KEYBOARD_DURATION_MS (one stop per 16 ms). */
export function keyboardEasing() {
  return easing
}

/**
 * The keyboard's curve as evenly spaced WAAPI keyframes with linear interpolation between them.
 * `translateAt` maps the keyboard's progress (0 to 1) to a vertical translation. WebKit runs
 * keyframed transforms on the compositor, which keeps moving while the page draws nothing: on the
 * installed iPad the page renders one frame after the keyboard report and then none for the
 * keyboard's whole travel (~390 ms). A `linear()` easing could fall back to the main thread.
 *
 * The curve takes KEYBOARD_DURATION_MS of an animation that lasts `totalMs`; the rest holds the
 * end pose, so a main thread that is still stalled when the curve ends finds the compositor
 * holding it (see KEYBOARD_HOLD_MS) rather than a removed animation.
 */
export function keyboardKeyframes(
  translateAt: (progress: number) => number,
  totalMs = KEYBOARD_DURATION_MS,
): Keyframe[] {
  const curveShare = Math.min(1, KEYBOARD_DURATION_MS / totalMs)
  const frames: Keyframe[] = []
  for (let step = 0; step <= STOPS; step++) {
    const translate = Math.round(translateAt(progressStops[step]!) * 100) / 100
    frames.push({ transform: `translateY(${translate}px)`, offset: (step / STOPS) * curveShare })
  }
  if (curveShare < 1) frames.push({ ...frames[frames.length - 1]!, offset: 1 })
  return frames
}

/**
 * How long a carried pose is held on the compositor after the keyboard's curve ends. A finished
 * WAAPI animation is removed from the layer at once, but the page can only commit the matching
 * layout when it draws again: on iPad the page drew nothing for up to 709 ms after a keyboard
 * report, and a run that ended alone showed its old layout for 0.66 s (measured keyboard-carrier implementation).
 */
export const KEYBOARD_HOLD_MS = 1500
