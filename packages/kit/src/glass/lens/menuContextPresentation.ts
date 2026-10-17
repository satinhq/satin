import opacity from './menuContextOpacity.json'
import { keyed } from './menuField.ts'
import type { MenuMorphDirection } from './menuMorphMotion.ts'

/** Native context dismissal, menu-close/r3 counter-valid iPad fit of the dim's remaining
 * contrast: (1 - phase) ** power after a delay. Shared by the dim, the lift and the menu body. */
const dismissal = {
  light: { delay: 24.3, duration: 250.3, power: 2.318 },
  dark: { delay: 1.9, duration: 236.6, power: 2.128 },
}
export const CONTEXT_DISMISSAL_MS = Math.max(
  dismissal.light.delay + dismissal.light.duration,
  dismissal.dark.delay + dismissal.dark.duration,
)
/** Remaining fraction (1 → 0) of an open context presentation `ms` after dismissal began. */
export function contextDismissal(appearance: 'light' | 'dark', ms: number) {
  const fit = dismissal[appearance]
  const phase = Math.min(1, Math.max(0, (ms - fit.delay) / fit.duration))
  return (1 - phase) ** fit.power
}

/** Preserve every measured opacity knot, including the start of the fade.
 * Uniform samples alone round off these corners between adjacent keyframes. */
export function contextOpacityFrames(
  direction: MenuMorphDirection,
  duration: number,
  appearance: 'light' | 'dark',
): Keyframe[] {
  const fit = dismissal[appearance]
  const knots =
    direction === 'open'
      ? opacity[appearance].map(([time]) => time!)
      : [fit.delay, fit.delay + fit.duration]
  const count = Math.max(1, Math.ceil(duration / (1000 / 240)))
  const times = new Set([
    ...Array.from({ length: count + 1 }, (_, index) => (duration * index) / count),
    ...knots.filter(time => time >= 0 && time <= duration),
    // The native contour contrast can change sharply within a 15 ms knot
    // interval. Resolve that fitted cubic independently of display cadence.
    ...knots.flatMap((time, index) =>
      index === 0
        ? []
        : Array.from(
            { length: 32 },
            (_, sample) => knots[index - 1]! + ((time - knots[index - 1]!) * sample) / 32,
          ).filter(time => time >= 0 && time <= duration),
    ),
  ])
  return [...times]
    .sort((left, right) => left - right)
    .map(ms => ({
      offset: ms / duration,
      opacity: menuContextPresentation(direction, ms, false, appearance).opacity,
    }))
}

/** Native reference appearance-specific context contour contrast, relative to settled contrast, on the
 * recognition clock. Early unresolved frames are transparent; the solid preview
 * remains page content. Context has no glass trigger to restore on dismissal. */
export function menuContextPresentation(
  direction: MenuMorphDirection,
  ms: number,
  settled: boolean,
  appearance: 'light' | 'dark' = 'dark',
) {
  // The body shrinks and fades with the dim (menu-close/r3): it never lingers as a blank pill.
  if (direction === 'close')
    return { opacity: contextDismissal(appearance, ms), rounding: 0, radiusProgress: 1 }
  if (settled) return { opacity: 1, rounding: 0, radiusProgress: 1 }
  return {
    opacity: keyed(
      opacity[appearance].map(([time, value]) => [time!, value!] as const),
      ms,
    ),
    radiusProgress: keyed(
      [
        [0, 0],
        [173, 0],
        [202, 0.59],
        [221, 0.71],
        [236, 0.82],
        [254, 0.82],
        [266, 0.88],
        [282, 1],
        [316, 1.03],
        [450, 1],
      ],
      ms,
    ),
    rounding: 0,
  }
}
