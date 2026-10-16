/* iOS 27 UIPanGestureRecognizer velocityInView:, recorded in measured-reference. */
export const NAVIGATION_PREVIOUS_SEGMENT_WEIGHT = 0.8
export const NAVIGATION_CURRENT_SEGMENT_WEIGHT = 0.2

export type ReleaseVelocityTracker = Readonly<{
  record(position: number, time: number): number
  release(time: number): number
}>

/** Blend two consecutive movement segments, not the whole gesture or an OLS
 * window. UIKit retains this velocity until another movement updates it. */
export function createReleaseVelocityTracker(): ReleaseVelocityTracker {
  let previousPosition: number | undefined
  let previousTime = 0
  let previousSegment: number | undefined
  let velocity = 0
  return Object.freeze({
    release() {
      return velocity
    },
    record(position, time) {
      if (!Number.isFinite(position) || !Number.isFinite(time)) return velocity
      if (previousPosition === undefined) {
        previousPosition = position
        previousTime = time
        return velocity
      }
      const seconds = (time - previousTime) / 1_000
      if (seconds <= 0) return velocity
      const segment = (position - previousPosition) / seconds
      velocity =
        previousSegment === undefined
          ? segment
          : NAVIGATION_CURRENT_SEGMENT_WEIGHT * segment +
            NAVIGATION_PREVIOUS_SEGMENT_WEIGHT * previousSegment
      previousPosition = position
      previousTime = time
      previousSegment = segment
      return velocity
    },
  })
}
