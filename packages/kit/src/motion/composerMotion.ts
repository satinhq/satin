import { menuSpring, menuSpringSettle } from '../glass/lens/menuSpring.ts'

export function allowsComposerMotion(element: HTMLElement) {
  return (
    typeof element.animate === 'function' &&
    !element.ownerDocument.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

// iOS 27 Messages three-line send, native older-text frames 24..70, Oct 15.
// The thread rises 46 pt without the outgoing bubble's shape spring. Critically
// damped fit: omega 21.2; RMS .357 pt, maximum .915 pt across 47 original samples.
// Native VFR footage remains diagnostic calibration, not cadence qualification.
const insertionSpring = { delay: 0, omega: 21.2, zeta: 1, velocity: 0 }
export const INSERTION_DURATION_MS = menuSpringSettle(insertionSpring)
const insertionSteps = Math.ceil(INSERTION_DURATION_MS / (1000 / 60))
export const insertionProgress = Array.from({ length: insertionSteps + 1 }, (_, index) =>
  index === insertionSteps
    ? 1
    : 1 - menuSpring(insertionSpring, (index / insertionSteps) * INSERTION_DURATION_MS).value,
)
