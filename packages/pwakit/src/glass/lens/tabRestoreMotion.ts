import interrupted from './tabInterruptedRestoreSamples.json'
import interruptedDecay from './tabInterruptedDecaySamples.json'
import samples from './tabRestoreSamples.json'

export type RestorePath = keyof typeof samples
export type TabMorphFrame = { progress: number; heightProgress: number; fade: number }

/* Tap/top outline channels were remeasured on iOS 27 in measured-reference.
 * Other paths and the ink channel retain the measured-reference measurements.
 * Native tap contact enlargement is normalized to the 48pt compact source;
 * outline agreement alone does not establish optical or presentation parity.
 */
export function restoreSample(path: RestorePath, milliseconds: number): TabMorphFrame {
  return sampleCurve(samples[path].samples, milliseconds)
}
function sampleCurve(curve: number[][], milliseconds: number): TabMorphFrame {
  if (milliseconds <= 0) return { progress: 0, heightProgress: 0, fade: 0 }
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1],
      b = curve[i]
    if (milliseconds > b[0]) continue
    const t = (milliseconds - a[0]) / (b[0] - a[0])
    return {
      progress: a[1] + (b[1] - a[1]) * t,
      heightProgress: a[2] + (b[2] - a[2]) * t,
      fade: a[3] + (b[3] - a[3]) * t,
    }
  }
  return { progress: 1, heightProgress: 1, fade: 1 }
}
export function restoreDuration(path: RestorePath) {
  return samples[path].durationMs
}
export function retargetRestore(from: TabMorphFrame, sample: TabMorphFrame): TabMorphFrame {
  return {
    progress: from.progress * (1 - sample.progress),
    heightProgress: from.heightProgress * (1 - sample.heightProgress),
    fade: from.fade * (1 - sample.fade),
  }
}

export function restoreDelay(path: RestorePath) {
  return samples[path].delayMs
}

/** A restore can interrupt collapse before its first painted frame. Cancelling
 * that pending excursion would keep the bar completely still. Preserve the
 * recorded early-interruption excursion, offset from current presentation.
 */
export function interruptedRestoreSample(milliseconds: number, from: TabMorphFrame): TabMorphFrame {
  let value = [0, 0, 0]
  for (let i = 1; i < interrupted.length && milliseconds > 0; i++) {
    const a = interrupted[i - 1],
      b = interrupted[i]
    if (milliseconds > b[0]) continue
    const t = (milliseconds - a[0]) / (b[0] - a[0])
    value = [1, 2, 3].map(k => a[k] + (b[k] - a[k]) * t)
    break
  }
  const decay = sampleCurve(interruptedDecay.samples, milliseconds)
  return {
    progress: from.progress * (1 - decay.progress) + Math.max(0, 1 - from.progress) * value[0],
    heightProgress:
      from.heightProgress * (1 - decay.heightProgress) +
      Math.max(0, 1 - from.heightProgress) * value[1],
    fade: from.fade * (1 - decay.fade) + Math.max(0, 1 - from.fade) * value[2],
  }
}
export const INTERRUPTED_RESTORE_DURATION = interrupted.at(-1)![0]

/** Backing storage includes the largest measured restore overshoot. */
export const TAB_RESTORE_OVERSHOOT = Math.max(
  0,
  ...Object.values(samples).flatMap(path => path.samples.flatMap(row => [row[1] - 1, row[2] - 1])),
)
