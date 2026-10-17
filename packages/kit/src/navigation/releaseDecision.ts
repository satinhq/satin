/* iOS 27 navigation-controller statistics, observed in measured-reference. */
export type NavigationReleaseDecision = Readonly<{
  averageVelocity: number
  /** Latest movement segment, in screen widths per second, before averaging. */
  latestVelocity?: number
  averageAcceleration: number
  edgeFlick: boolean
}>

export const NAVIGATION_REVERSE_TOLERANCE_POINTS_PER_SECOND = 300
export const NAVIGATION_PROJECTION_SECONDS = 0.35
export const NAVIGATION_PROJECTED_COMPLETION_POINTS = 187.5
export const NAVIGATION_EDGE_FLICK_NORMALIZED_VELOCITY = 1.5
/** Recorded native controller value; never amplify the visible release tangent. */
export const NAVIGATION_EDGE_FLICK_BOOST = 4.25

/* Forward projection ignores deceleration. Direction comes from the latest finger segment,
 * because the three-sample average can still point forward after the finger reverses. The native
 * round-4 reference cancels backward motion through halfway; beyond halfway it tolerates about
 * 300 points/second backward, measured at progress 0.65–0.8. */
export function projectedNavigationCompletion(
  progress: number,
  width: number,
  decision: NavigationReleaseDecision,
) {
  const latestVelocity = (decision.latestVelocity ?? decision.averageVelocity) * width
  if (latestVelocity < 0) {
    if (progress <= 0.5 || latestVelocity < -NAVIGATION_REVERSE_TOLERANCE_POINTS_PER_SECOND)
      return false
    return progress > Math.min(0.5, NAVIGATION_PROJECTED_COMPLETION_POINTS / width)
  }
  const time = NAVIGATION_PROJECTION_SECONDS
  const acceleration = Math.max(0, decision.averageAcceleration)
  return (
    progress + decision.averageVelocity * time + 0.5 * acceleration * time * time >
    Math.min(0.5, NAVIGATION_PROJECTED_COMPLETION_POINTS / width)
  )
}

/** Three delivered recognizer-equivalent samples; acceleration changes are
 * limited to five screen widths/second squared per accepted sample. */
export function createNavigationReleaseStatistics() {
  let width = 0
  let previousTime = 0
  let skipTime = 0
  let previousPosition = 0
  let previousVelocity = 0
  let latestPosition = 0
  let latestTime = 0
  let latestVelocity = 0
  let previousAcceleration = 0
  let edgeFlick = true
  const velocities: number[] = []
  const accelerations: number[] = []
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
  return {
    begin(position: number, velocity: number, time: number, screenWidth: number) {
      width = screenWidth
      previousTime = skipTime = time
      previousPosition = position
      latestPosition = position
      latestTime = time
      latestVelocity = velocity / width
      previousVelocity = velocity / width
      previousAcceleration = 0
      edgeFlick = true
      velocities.splice(0, velocities.length, previousVelocity)
      accelerations.splice(0, accelerations.length, 0)
    },
    record(position: number, velocity: number, time: number) {
      if (!width) return
      const latestSeconds = (time - latestTime) / 1_000
      if (latestSeconds > 0) {
        if (position !== latestPosition)
          latestVelocity = (position - latestPosition) / latestSeconds / width
        latestPosition = position
        latestTime = time
      }
      const sinceSkip = (time - skipTime) / 1_000
      skipTime = time
      if (sinceSkip < 0.01 && (sinceSkip <= 0.001 || position === previousPosition)) return
      const seconds = (time - previousTime) / 1_000
      if (seconds <= 0) return
      const normalizedVelocity = velocity / width
      const acceleration = Math.max(
        previousAcceleration - 5,
        Math.min(previousAcceleration + 5, (normalizedVelocity - previousVelocity) / seconds),
      )
      velocities.push(normalizedVelocity)
      accelerations.push(acceleration)
      if (velocities.length > 3) {
        velocities.shift()
        accelerations.shift()
      }
      if (Math.abs(mean(velocities)) < NAVIGATION_EDGE_FLICK_NORMALIZED_VELOCITY) edgeFlick = false
      previousPosition = position
      previousVelocity = normalizedVelocity
      previousAcceleration = acceleration
      previousTime = time
    },
    snapshot(): NavigationReleaseDecision {
      return {
        latestVelocity,
        averageVelocity: velocities.length ? mean(velocities) : 0,
        averageAcceleration: accelerations.length ? mean(accelerations) : 0,
        edgeFlick: width > 0 && edgeFlick,
      }
    },
  }
}
