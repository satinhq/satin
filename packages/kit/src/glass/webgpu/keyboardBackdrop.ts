import { keyboardBackdropPose } from '../../safe-area/keyboardCarrierGeometry.ts'
import { sampleKeyboardTranslation, type KeyboardTranslation } from '../../keyboard/translation.ts'
import { insertionMotion } from '../../scroll/insertionMotion.ts'

/** Logical content position when these pixels were captured. Native scroll is separate. */
export type KeyboardBackdropAnchor = { offsetY: number }
export type KeyboardBackdrop = {
  offsetY: number
  motion?: KeyboardTranslation
  clipBottom?: number
}

function contentPose(host: HTMLElement) {
  const keyboard = keyboardBackdropPose(host)
  const insertion = insertionMotion(host)
  if (!insertion) return keyboard
  const at = performance.timeOrigin + performance.now()
  const offsetY = (keyboard?.offsetY ?? 0) + sampleKeyboardTranslation(insertion, at)
  const tracks = [keyboard?.motion, insertion].filter((track): track is KeyboardTranslation =>
    Boolean(track),
  )
  const epoch = Math.min(...tracks.map(track => track.epoch))
  const end = Math.max(...tracks.map(track => track.epoch + track.duration))
  const duration = end - epoch
  // The union of both piecewise-linear tracks is exact at every breakpoint. Glass
  // samples the same combined motion while the keyboard and insertion overlap.
  const times = [
    ...new Set(tracks.flatMap(track => track.stops.map(([t]) => track.epoch + t * track.duration))),
  ].sort((a, b) => a - b)
  const constant = keyboard?.motion ? 0 : (keyboard?.offsetY ?? 0)
  return {
    offsetY,
    motion: {
      epoch,
      duration,
      end: Math.max(...tracks.map(track => track.end)),
      offset: constant,
      stops: times.map(
        time =>
          [
            (time - epoch) / duration,
            tracks.reduce((sum, track) => sum + sampleKeyboardTranslation(track, time), 0),
          ] as const,
      ),
    },
  }
}

export function keyboardBackdropAnchor(host: HTMLElement): KeyboardBackdropAnchor {
  return { offsetY: contentPose(host)?.offsetY ?? 0 }
}

export function keyboardBackdrop(
  host: HTMLElement,
  anchor?: KeyboardBackdropAnchor,
): KeyboardBackdrop | undefined {
  const pose = contentPose(host)
  if (!pose && !anchor) return
  const origin = anchor?.offsetY ?? 0
  return {
    offsetY: (pose?.offsetY ?? 0) - origin,
    motion: pose?.motion && { ...pose.motion, offset: pose.motion.offset - origin },
    clipBottom: insertionMotion(host)
      ? host.getBoundingClientRect().bottom -
        (parseFloat(getComputedStyle(host).paddingBottom) || 0)
      : undefined,
  }
}
