/** Native iOS 27 iPad large-sheet entrance (native-motion r2), one spring for light and dark.
 * Joint fit over 11 counter-retimed clips with the start pinned below the screen: 1.38 pt RMS.
 */
const SHEET_PRESENT_SPRING = [331.98, 36.378] as const

/** A mass-one spring released at rest, sampled into WAAPI translateY keyframes over 0.7 s. */
function springEntranceFrames(distance: number, [stiffness, damping]: readonly number[]) {
  return Array.from({ length: 85 }, (_, index): Keyframe => {
    const remaining = springState(distance, 0, 0, (index / 84) * 0.7, stiffness, damping).position
    return {
      offset: index / 84,
      transform: `translateY(${index === 84 ? 0 : remaining}px)`,
    }
  })
}

export function sheetEntranceFrames(distance: number): Keyframe[] {
  return springEntranceFrames(distance, SHEET_PRESENT_SPRING)
}

/** Native fullScreenCover entrance (r2, 11 clips, start pinned one screen below): power ease-out
 * 1 - (1 - t / 0.963)^11.26, 6.3 pt RMS. It is the same curve in light and dark. */
export const COVER_PRESENT_DURATION = 963
export function coverEntranceFrames(distance: number): Keyframe[] {
  return Array.from({ length: 97 }, (_, index) => ({
    offset: index / 96,
    transform: `translateY(${index === 96 ? 0 : distance * (1 - index / 96) ** 11.257}px)`,
  }))
}

/** Native fullScreenCover dismissal (r2, 11 clips, travel pinned to one screen height): a
 * mass-one spring from rest, 2.7 pt RMS over the visible part. Returns the travelled distance. */
export function coverDismissalOffset(distance: number, seconds: number) {
  return distance - springState(distance, 0, 0, seconds, 330.544, 35.996).position
}

/** Independently fitted native release tails; velocity is in points/second and seeds the spring.
 * Below its smallest detent a released sheet translates at its detent size. `dismiss` and `return`
 * are native-motion r2 fits (iPad, counter-qualified 60 Hz, light and dark together):
 * - `dismiss`: slides off the screen, seeded with the release velocity; 0.77 pt RMS over 10 clips.
 *   It replaces the 12e Simulator flick fit (637.3, 42.4), which no valid recording supports.
 * - `return`: springs back to the detent; 0.23 pt RMS over 11 clips.
 * `expand` and `collapse` remain the 12e phone fits. */
export function sheetReleasePosition(
  from: number,
  to: number,
  velocity: number,
  seconds: number,
  phase: 'dismiss' | 'return' | 'expand' | 'collapse',
) {
  const [stiffness, damping] = {
    dismiss: [305.97, 34.33],
    return: [321.912, 35.09],
    collapse: [326.5080212050766, 36.13545200303523],
    expand: [136.04264454717745, 21.643366602174066],
  }[phase]
  const w = Math.sqrt(stiffness),
    z = damping / (2 * w),
    d = Math.sqrt(1 - z * z)
  const displacement = from - to
  return (
    to +
    Math.exp(-z * w * seconds) *
      (displacement * Math.cos(w * d * seconds) +
        ((velocity + z * w * displacement) / (w * d)) * Math.sin(w * d * seconds))
  )
}

/** Mass-one spring, including critical/overdamped native detent taps. */
function springState(
  from: number,
  to: number,
  velocity: number,
  seconds: number,
  stiffness: number,
  damping: number,
) {
  const t = Math.max(0, seconds),
    x = from - to,
    a = damping / 2,
    discriminant = a * a - stiffness
  let displacement: number, speed: number
  if (Math.abs(discriminant) < 1e-6) {
    const b = velocity + a * x,
      decay = Math.exp(-a * t)
    displacement = decay * (x + b * t)
    speed = decay * (b - a * (x + b * t))
  } else if (discriminant > 0) {
    const root = Math.sqrt(discriminant),
      r1 = -a + root,
      r2 = -a - root
    const c1 = (velocity - r2 * x) / (r1 - r2),
      c2 = x - c1
    displacement = c1 * Math.exp(r1 * t) + c2 * Math.exp(r2 * t)
    speed = r1 * c1 * Math.exp(r1 * t) + r2 * c2 * Math.exp(r2 * t)
  } else {
    const w = Math.sqrt(-discriminant),
      b = (velocity + a * x) / w,
      decay = Math.exp(-a * t)
    displacement = decay * (x * Math.cos(w * t) + b * Math.sin(w * t))
    speed = -a * displacement + decay * w * (-x * Math.sin(w * t) + b * Math.cos(w * t))
  }
  return { position: to + displacement, velocity: speed }
}

/* Sep 27 iOS 27 stock alert + TextField, warmed run 1; run 2 is the holdout.
 * Native centre 492 -> 335.5 pt. See measured-reference notes for captures and residuals.
 */
export function alertKeyboardState(from: number, to: number, velocity: number, seconds: number) {
  return springState(from, to, velocity, seconds, 480.14579454093644, 41.79219798805168)
}

/** Stock grabber taps are distinct from the velocity-bearing drag release fits. */
export function sheetDetentPosition(from: number, to: number, seconds: number) {
  return to > from
    ? springState(from, to, 0, seconds, 316.1544205988269, 35.57406510593182).position
    : springState(from, to, 0, seconds, 346.32375968752916, 37.49481475190611).position
}

/* Native visible scale tails, with the Sep 28 software-keyboard alert opacity fit. The
 * confirmation popover grows from its arrow tip (native reference reference, Oct 10, 60 Hz Simulator recording,
 * fit-only): popover width 0.23 -> 1, RMS 0.006, with the dark-run opacity samples below. */
export function dialogEntranceFrames(kind: 'alert' | 'confirmation'): Keyframe[] {
  const [from, velocity, w, z] =
    kind === 'alert'
      ? [1.1818181818181819, -1.7709405499714581, 20.045876104162325, 0.9515937909832228]
      : [0.23, 0, 20, 0.8]
  const d = Math.sqrt(1 - z * z),
    x = from - 1
  return Array.from({ length: 85 }, (_, index) => {
    const t = (index / 84) * 0.7
    const scale =
      1 +
      Math.exp(-z * w * t) *
        (x * Math.cos(w * d * t) + ((velocity + z * w * x) / (w * d)) * Math.sin(w * d * t))
    return {
      offset: index / 84,
      transform: `scale(${index === 84 ? 1 : scale})`,
      opacity:
        index === 84 ? 1 : kind === 'alert' ? alertEntranceOpacity(t) : confirmationOpacity(t),
    }
  })
}

/** Popover body level over a black list relative to rest (dark run), ms after the first frame. */
const CONFIRMATION_ENTRANCE_OPACITY = [
  [0, 0],
  [17, 0.2],
  [34, 0.36],
  [44, 0.43],
  [62, 0.57],
  [79, 0.64],
  [97, 0.7],
  [112, 0.77],
  [130, 0.86],
  [147, 0.91],
  [164, 0.93],
  [182, 0.95],
  [195, 1],
] as const
function confirmationOpacity(seconds: number) {
  const ms = seconds * 1000
  const next = CONFIRMATION_ENTRANCE_OPACITY.findIndex(([time]) => time >= ms)
  if (next <= 0) return next === 0 ? 0 : 1
  const [t0, v0] = CONFIRMATION_ENTRANCE_OPACITY[next - 1]!,
    [t1, v1] = CONFIRMATION_ENTRANCE_OPACITY[next]!
  return v0 + ((v1 - v0) * (ms - t0)) / (t1 - t0)
}

/* The popover shrinks back into its arrow tip as it fades (native reference reference, video PTS): scale from
 * the light run's width, opacity from the dark run. The first absent frame is at 200-220 ms. */
export const CONFIRMATION_DISMISS_DURATION = 210
export function confirmationDismissalFrames(): Keyframe[] {
  const samples = [
    [0, 1, 1],
    [16, 0.97, 0.93],
    [35, 0.875, 0.83],
    [50, 0.751, 0.7],
    [66, 0.615, 0.64],
    [83, 0.502, 0.54],
    [101, 0.419, 0.41],
    [120, 0.34, 0.29],
    [136, 0.302, 0.2],
    [153, 0.275, 0.13],
    [170, 0.234, 0.09],
    [188, 0.215, 0.06],
    [210, 0.2, 0],
  ] as const
  return samples.map(([time, scale, opacity]) => ({
    offset: time / CONFIRMATION_DISMISS_DURATION,
    transform: `scale(${scale})`,
    opacity,
  }))
}

/** Stock iOS 27 alert title-contrast fit (Sep 28); opening 2 is the holdout.
 * Opacity RMS 0.0274, independently tracked from the scale/keyboard motion.
 */
export function alertEntranceOpacity(seconds: number) {
  return Math.max(
    0,
    Math.min(1, springState(0, 1, 0, seconds, 1396.659532456193, 117.75600163364518).position),
  )
}
/** Native dismissal retains scale 1. Its last visible frame is at 193 ms;
 * the first absent frame brackets removal at 210 ms. Samples use video PTS.
 */
export const ALERT_DISMISS_DURATION = 210
export function alertDismissalFrames(): Keyframe[] {
  const samples = [
    [0, 1],
    [11, 0.987],
    [18, 0.934],
    [35, 0.813],
    [56, 0.675],
    [70, 0.538],
    [85, 0.42],
    [103, 0.307],
    [120, 0.242],
    [135, 0.175],
    [142, 0.143],
    [161, 0.116],
    [175, 0.084],
    [193, 0.058],
    [210, 0],
  ] as const
  return samples.map(([time, opacity]) => ({ offset: time / ALERT_DISMISS_DURATION, opacity }))
}

/** Sep 28 stock medium sheet + software keyboard: grabber 454 -> 65 pt,
 * 120 accepted samples, RMS 1.689 pt. Selection itself remains unchanged.
 */
export function sheetKeyboardPosition(from: number, to: number, seconds: number) {
  // Return-key dismissal: 100 samples, RMS 1.306 pt, same native session.
  return to > from
    ? springState(from, to, 0, seconds, 479.14469035648204, 42.67259323369546).position
    : springState(from, to, 0, seconds, 677.3440899114729, 54.3445148299905).position
}

/** iOS 27 Done dismissal: medium 483 ms, large 494 ms, near-critical mass-one fits. */
export function sheetDismissalPosition(distance: number, seconds: number, large: boolean) {
  if (seconds >= 0.5) return 0
  const stiffness = large ? 431 : 361.5
  const damping = large ? 41.5 : 38
  return Math.max(0, springState(distance, 0, 0, seconds, stiffness, damping).position)
}

/** Submit the measured Done curve once. Ordinary linear interpolation between
 * samples avoids depending on the engine's acceleration of CSS linear(). */
export function presentationDismissalFrames(
  distance: number,
  from: number,
  opacity: number,
  kind: 'sheet' | 'cover',
  large: boolean,
  velocity = 0,
) {
  const transform: Keyframe[] = []
  const dim: Keyframe[] = []
  for (let index = 0; index <= 120; index++) {
    const offset = index / 120
    const remaining =
      velocity === 0
        ? kind === 'cover'
          ? distance - coverDismissalOffset(distance, offset * 0.5)
          : sheetDismissalPosition(distance, offset * 0.5, large)
        : springState(
            distance,
            0,
            -velocity,
            offset * 0.5,
            kind === 'cover' ? 330.544 : large ? 431 : 361.5,
            kind === 'cover' ? 35.996 : large ? 41.5 : 38,
          ).position
    transform.push({ offset, transform: `translateY(${from + distance - remaining}px)` })
    dim.push({ offset, opacity: opacity * Math.max(0, remaining / distance) })
  }
  return { transform, dim }
}

/** Seed the existing sheet spring with the interrupted track's velocity.
 * The cover is a power fit, not a spring: its correction matches initial
 * velocity and vanishes at the original endpoint. Native parity is pending. */
export function presentationReturnFrames(
  from: number,
  opacity: number,
  kind: 'sheet' | 'cover',
  velocity = 0,
) {
  const normalized = kind === 'cover' ? coverEntranceFrames(1) : sheetEntranceFrames(1)
  const transform: Keyframe[] = []
  const dim: Keyframe[] = []
  for (const frame of normalized) {
    const remaining = Number(String(frame.transform).slice(11, -3))
    const phase = Number(frame.offset)
    const seconds = phase * (kind === 'cover' ? COVER_PRESENT_DURATION / 1000 : 0.7)
    const position =
      phase === 1
        ? 0
        : kind === 'sheet'
          ? springState(from, 0, velocity, seconds, ...SHEET_PRESENT_SPRING).position
          : from * remaining +
            (velocity + (from * 11.257) / 0.963) * seconds * (1 - phase) ** 11.257
    transform.push({ offset: frame.offset, transform: `translateY(${position}px)` })
    dim.push({ offset: frame.offset, opacity: 1 - (1 - opacity) * remaining })
  }
  return { transform, dim }
}

/** Velocity of the submitted linear keyframe segment in points/second.
 * This reads the animation timeline, never main-thread callback spacing. */
export function presentationAnimationVelocity(animation?: Animation) {
  const effect = animation?.effect
  if (!effect || !(effect instanceof KeyframeEffect) || typeof animation?.currentTime !== 'number')
    return 0
  const duration = Number(effect.getComputedTiming().duration)
  if (!(duration > 0)) return 0
  const phase = animation.currentTime / duration
  const frames = effect.getKeyframes()
  for (let index = 1; index < frames.length; index++) {
    const before = frames[index - 1]!
    const after = frames[index]!
    if (phase < before.computedOffset || phase >= after.computedOffset) continue
    const start = new DOMMatrixReadOnly(String(before.transform)).m42
    const end = new DOMMatrixReadOnly(String(after.transform)).m42
    return ((end - start) * 1000) / ((after.computedOffset - before.computedOffset) * duration)
  }
  return 0
}
