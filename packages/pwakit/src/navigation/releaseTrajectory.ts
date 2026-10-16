export const NAVIGATION_RELEASE_SPRING_MASS = 1
/** iOS 27 fluid parallax settings; recorded and independently fitted in 11d. */
export const NAVIGATION_RELEASE_SPRING_STIFFNESS = 438.6490844928604
export const NAVIGATION_RELEASE_SPRING_DAMPING = 35.60471674068432
export const NAVIGATION_RELEASE_SAMPLE_RATE_HZ = 240

const MAX_RELEASE_DURATION_MS = 1_000
const INITIAL_TANGENT_DURATION_MS = 1
/**
 * Physical guard, not a measured token: about double the fastest plausible
 * finger flick. Near-equal input timestamps can otherwise produce a huge
 * finite slope, and a NaN sample would poison the linear() easing string.
 */
const MAX_RELEASE_VELOCITY_POINTS_PER_SECOND = 10_000

export type NavigationReleaseSample = Readonly<{
  offset: number
  value: number
}>

export type NavigationReleaseTrajectory = Readonly<{
  /** Compatibility/diagnostic serialization. Satin renders samples as property
   * keyframes because custom linear(...) easing can require the iOS main thread. */
  cssEasing: string
  durationMs: number
  initialVelocity: number
  samples: readonly NavigationReleaseSample[]
}>

function formatNumber(value: number) {
  const bounded = Math.abs(value) < 0.0000005 ? 0 : value
  return Number(bounded.toFixed(6)).toString()
}

/** UIKit's convention: axis velocity divided by signed distance to target. */
export function normalizeNavigationReleaseVelocity(
  velocityPointsPerSecond: number,
  currentProgress: number,
  targetProgress: number,
  width: number,
) {
  const distancePoints = (targetProgress - currentProgress) * width
  if (!Number.isFinite(distancePoints) || distancePoints === 0) return 0
  const velocity = Number.isFinite(velocityPointsPerSecond)
    ? Math.min(
        MAX_RELEASE_VELOCITY_POINTS_PER_SECOND,
        Math.max(-MAX_RELEASE_VELOCITY_POINTS_PER_SECOND, velocityPointsPerSecond),
      )
    : 0
  return velocity / distancePoints
}

function sampleSpring(timeSeconds: number, initialVelocity: number) {
  const target = 1
  const initialDisplacement = -target
  const naturalFrequency = Math.sqrt(
    NAVIGATION_RELEASE_SPRING_STIFFNESS / NAVIGATION_RELEASE_SPRING_MASS,
  )
  const decay = NAVIGATION_RELEASE_SPRING_DAMPING / (2 * NAVIGATION_RELEASE_SPRING_MASS)
  const dampedFrequency = Math.sqrt(Math.max(0, naturalFrequency ** 2 - decay ** 2))

  if (dampedFrequency === 0) {
    return (
      target +
      Math.exp(-decay * timeSeconds) *
        (initialDisplacement + (initialVelocity + decay * initialDisplacement) * timeSeconds)
    )
  }
  return (
    target +
    Math.exp(-decay * timeSeconds) *
      (initialDisplacement * Math.cos(dampedFrequency * timeSeconds) +
        ((initialVelocity + decay * initialDisplacement) / dampedFrequency) *
          Math.sin(dampedFrequency * timeSeconds))
  )
}

function settlingDuration(initialVelocity: number) {
  const stepMs = 1_000 / NAVIGATION_RELEASE_SAMPLE_RATE_HZ
  // Cancellation retains the calibrated reversal and settling behavior.
  for (let timeMs = MAX_RELEASE_DURATION_MS; timeMs >= stepMs; timeMs -= stepMs) {
    if (Math.abs(sampleSpring(timeMs / 1_000, initialVelocity) - 1) > 0.001) return timeMs + stepMs
  }
  return stepMs
}

/** First target crossing of the existing calibrated spring, solved analytically.
 * The outgoing card stops owning presentation once it leaves the viewport;
 * its offscreen spring tail must not bring shadow/dim/title back into view. */
function firstArrivalDuration(initialVelocity: number) {
  const decay = NAVIGATION_RELEASE_SPRING_DAMPING / (2 * NAVIGATION_RELEASE_SPRING_MASS)
  const frequency = Math.sqrt(
    NAVIGATION_RELEASE_SPRING_STIFFNESS / NAVIGATION_RELEASE_SPRING_MASS - decay ** 2,
  )
  return (Math.atan2(frequency, initialVelocity - decay) / frequency) * 1_000
}

export function createNavigationReleaseTrajectory(
  currentProgress: number,
  targetProgress: number,
  velocityPointsPerSecond: number,
  width: number,
): NavigationReleaseTrajectory {
  const initialVelocity = normalizeNavigationReleaseVelocity(
    velocityPointsPerSecond,
    currentProgress,
    targetProgress,
    width,
  )
  const durationMs =
    targetProgress === 1 ? firstArrivalDuration(initialVelocity) : settlingDuration(initialVelocity)
  const stepMs = 1_000 / NAVIGATION_RELEASE_SAMPLE_RATE_HZ
  const timedSamples: Array<{ timeMs: number; value: number }> = [{ timeMs: 0, value: 0 }]

  // Keep the tangent sample inside even a sub-millisecond edge arrival.
  const tangentMs = Math.min(INITIAL_TANGENT_DURATION_MS, durationMs / 2)
  if (tangentMs > 0) {
    timedSamples.push({
      timeMs: tangentMs,
      value: (initialVelocity * tangentMs) / 1_000,
    })
  }
  for (let timeMs = stepMs; timeMs < durationMs; timeMs += stepMs) {
    timedSamples.push({
      timeMs,
      value: sampleSpring(timeMs / 1_000, initialVelocity),
    })
  }
  timedSamples.push({ timeMs: durationMs, value: 1 })

  const samples = timedSamples.map(({ timeMs, value }) => ({
    offset: timeMs / durationMs,
    value,
  }))
  const cssEasing = `linear(${samples
    .map(sample => `${formatNumber(sample.value)} ${formatNumber(sample.offset * 100)}%`)
    .join(', ')})`

  return Object.freeze({
    cssEasing,
    durationMs,
    initialVelocity,
    samples: Object.freeze(samples),
  })
}
