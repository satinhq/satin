/** Follow every 60 Hz page frame, or alternate frames on a 120 Hz page.
 * The threshold sits between those cadences so normal timestamp jitter cannot
 * turn a 60 Hz frame into a glass hold. Sampling still uses the exact page time. */
export class ShapeCadence {
  private admittedAt?: number
  admit(at: number) {
    const minimumInterval = (1000 / 60) * 0.75
    if (!Number.isFinite(at)) return false
    if (this.admittedAt !== undefined && at - this.admittedAt < minimumInterval) return false
    this.admittedAt = at
    return true
  }
}

export type Track = {
  epoch: number
  duration: number
  from: number
  to: number
  samples?: readonly number[]
}
/** Samples are the actual normalized compositor keyframe values, not pose messages.
 * Interpolation matches a linear WAAPI keyframe sequence with evenly spaced offsets. */
export function evaluateTrack(track: Track, at: number) {
  const t = Math.max(0, Math.min(1, (at - track.epoch) / Math.max(0.001, track.duration)))
  let progress = t
  if (track.samples) {
    const index = t * (track.samples.length - 1),
      lo = Math.floor(index),
      hi = Math.min(lo + 1, track.samples.length - 1)
    progress = track.samples[lo] + (track.samples[hi] - track.samples[lo]) * (index - lo)
  }
  return track.from + (track.to - track.from) * progress
}
export function validateTrack(track: Track) {
  if (
    ![track.epoch, track.duration, track.from, track.to].every(Number.isFinite) ||
    track.duration <= 0 ||
    (track.samples &&
      (track.samples.length < 2 ||
        track.samples.length > 4096 ||
        !track.samples.every(Number.isFinite)))
  )
    throw Error('Invalid glass timeline')
}
