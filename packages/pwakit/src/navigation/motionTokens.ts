// The navigation push/pop timing model: measured durations, curve and thresholds, plus the
// sampling helpers that read them. Values come from the native references named beside them.

import {
  NAVIGATION_EDGE_FLICK_BOOST,
  NAVIGATION_EDGE_FLICK_NORMALIZED_VELOCITY,
  NAVIGATION_PROJECTION_SECONDS,
  NAVIGATION_PROJECTED_COMPLETION_POINTS,
} from './releaseDecision.ts'
import {
  NAVIGATION_TRACKING_DAMPING_RATIO,
  NAVIGATION_TRACKING_RESPONSE_SECONDS,
} from './tracking.ts'
import {
  NAVIGATION_RELEASE_SAMPLE_RATE_HZ,
  NAVIGATION_RELEASE_SPRING_DAMPING,
  NAVIGATION_RELEASE_SPRING_MASS,
  NAVIGATION_RELEASE_SPRING_STIFFNESS,
} from './releaseTrajectory.ts'

/** Measured from the iOS 26.5 Settings app on iPhone 17 Pro. */
export const NAVIGATION_DURATION_MS = 352
export const NAVIGATION_EASING = Object.freeze([0.21, 0.71, 0.3, 1] as const)
export const NAVIGATION_EASING_CSS = `cubic-bezier(${NAVIGATION_EASING.join(', ')})`
export const NAVIGATION_PARALLAX_FRACTION = 0.3
export const NAVIGATION_DIM_OPACITY = 0.1
export const NAVIGATION_EDGE_SHADOW_WIDTH_PX = 20
export const NAVIGATION_EDGE_SHADOW_OPACITY = 0.018
/** Legacy non-touch fallback. Installed touch uses releaseDecision statistics. */
export const NAVIGATION_POSITION_THRESHOLD = 0.425
export const NAVIGATION_VELOCITY_THRESHOLD_PX_PER_SECOND = 317
export const NAVIGATION_HORIZONTAL_INTENT_PX = 30
/** Chosen inside UIKit's observed 10-12 point direction-lock window. */
export const NAVIGATION_DIRECTION_LOCK_PX = 10

export const navigationMotionTokens = Object.freeze({
  dimOpacity: NAVIGATION_DIM_OPACITY,
  directionLockPx: NAVIGATION_DIRECTION_LOCK_PX,
  durationMs: NAVIGATION_DURATION_MS,
  easing: NAVIGATION_EASING,
  edgeShadowOpacity: NAVIGATION_EDGE_SHADOW_OPACITY,
  edgeShadowWidthPx: NAVIGATION_EDGE_SHADOW_WIDTH_PX,
  horizontalIntentPx: NAVIGATION_HORIZONTAL_INTENT_PX,
  parallaxFraction: NAVIGATION_PARALLAX_FRACTION,
  positionThreshold: NAVIGATION_POSITION_THRESHOLD,
  releaseSampleRateHz: NAVIGATION_RELEASE_SAMPLE_RATE_HZ,
  releaseSpring: Object.freeze({
    damping: NAVIGATION_RELEASE_SPRING_DAMPING,
    mass: NAVIGATION_RELEASE_SPRING_MASS,
    stiffness: NAVIGATION_RELEASE_SPRING_STIFFNESS,
  }),
  velocityThresholdPxPerSecond: NAVIGATION_VELOCITY_THRESHOLD_PX_PER_SECOND,
  releaseCompletion: 'first edge arrival',
  flickVelocityBoost: 1,
  nativeControllerFlickVelocityBoost: NAVIGATION_EDGE_FLICK_BOOST,
  initialFlickHistoryThresholdWidthsPerSecond: NAVIGATION_EDGE_FLICK_NORMALIZED_VELOCITY,
  touchReleaseProjectionSeconds: NAVIGATION_PROJECTION_SECONDS,
  touchReleaseThresholdPoints: NAVIGATION_PROJECTED_COMPLETION_POINTS,
  // Native reference values. Interactive input uses the fixed scroll mapping;
  // applying the tracking spring in JavaScript regresses compositor continuity.
  trackingResponseSeconds: NAVIGATION_TRACKING_RESPONSE_SECONDS,
  trackingDampingRatio: NAVIGATION_TRACKING_DAMPING_RATIO,
})

export function clampProgress(progress: number) {
  return Math.min(1, Math.max(0, progress))
}

function cubicCoordinate(amount: number, firstControl: number, secondControl: number) {
  const inverse = 1 - amount
  return (
    3 * inverse * inverse * amount * firstControl +
    3 * inverse * amount * amount * secondControl +
    amount * amount * amount
  )
}

export function sampleNavigationCurve(timeProgress: number) {
  const [x1, y1, x2, y2] = NAVIGATION_EASING
  const targetX = clampProgress(timeProgress)
  let lower = 0
  let upper = 1

  for (let iteration = 0; iteration < 28; iteration += 1) {
    const candidate = (lower + upper) / 2
    const x = cubicCoordinate(candidate, x1, x2)
    if (x < targetX) lower = candidate
    else upper = candidate
  }

  return cubicCoordinate((lower + upper) / 2, y1, y2)
}

export function shouldCompleteInteractivePop(progress: number, velocityPointsPerSecond: number) {
  return (
    progress >= NAVIGATION_POSITION_THRESHOLD ||
    velocityPointsPerSecond >= NAVIGATION_VELOCITY_THRESHOLD_PX_PER_SECOND
  )
}
