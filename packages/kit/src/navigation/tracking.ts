/* iOS 27 reference model, recorded in measured-reference. It is not applied to the
 * installed compositor scroll mapping: a main-thread correction can rewind it. */
export const NAVIGATION_TRACKING_RESPONSE_SECONDS = 0.08
export const NAVIGATION_TRACKING_DAMPING_RATIO = 0.85
const frequency = (2 * Math.PI) / NAVIGATION_TRACKING_RESPONSE_SECONDS
const decay = frequency * NAVIGATION_TRACKING_DAMPING_RATIO
const damped = Math.sqrt(frequency ** 2 - decay ** 2)

export type TrackingState = Readonly<{ position: number; velocity: number }>

export function advanceNavigationTracking(
  state: TrackingState,
  target: number,
  seconds: number,
): TrackingState {
  const time = Math.max(0, seconds)
  const a = state.position - target
  const b = (state.velocity + decay * a) / damped
  const envelope = Math.exp(-decay * time)
  const cosine = Math.cos(damped * time)
  const sine = Math.sin(damped * time)
  return {
    position: target + envelope * (a * cosine + b * sine),
    velocity: envelope * ((damped * b - decay * a) * cosine + (-damped * a - decay * b) * sine),
  }
}
