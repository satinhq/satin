import type { MenuSpring } from '../glass/lens/menuSpring.ts'

const brand: unique symbol = Symbol('satin.animation')

/** An opaque spring timing value for `withAnimation`. Use a named value or `Animation.spring`. */
export type Animation = Readonly<{ [brand]: true }>

// Physics stay internal so yearly native remeasurement does not change the app contract.
type SpringAnimation = Animation & Readonly<{ omega: number; zeta: number }>

/** Duration and bounce options for `Animation.spring`. */
export type SpringOptions = Readonly<{
  /** The perceptual duration in milliseconds. Defaults to 500. */
  durationMs?: number
  /** 0 settles without overshoot. Values are clamped to 0 through 0.99. Defaults to 0. */
  bounce?: number
}>

/**
 * SwiftUI's `spring(duration:bounce:)` mapping, as Apple documents it: the duration is the
 * period of the undamped spring (omega = 2π / duration), and bounce is 1 − damping ratio for
 * bounce ≥ 0. SwiftUI's negative (over-damped) bounces are not offered: the shared spring
 * solver (glass/lens/menuSpring.ts) models damping ratios up to 1.
 */
function spring({ durationMs = 500, bounce = 0 }: SpringOptions = {}): Animation {
  if (!Number.isFinite(durationMs) || !Number.isFinite(bounce)) {
    throw new RangeError('Animation.spring requires finite durationMs and bounce values.')
  }
  const seconds = Math.max(durationMs, 1) / 1000
  const omega = (2 * Math.PI) / seconds
  const zeta = 1 - Math.min(Math.max(bounce, 0), 0.99)
  const animation: SpringAnimation = Object.freeze({ [brand]: true as const, omega, zeta })
  return animation
}

/** SwiftUI's named springs. `default` is the curve `withAnimation` uses with no argument. */
export const Animation: Readonly<{
  spring: (options?: SpringOptions) => Animation
  smooth: Animation
  snappy: Animation
  bouncy: Animation
  default: Animation
}> = Object.freeze({
  spring,
  /** SwiftUI `.smooth`: duration 0.5 s, bounce 0. */
  smooth: spring({ durationMs: 500, bounce: 0 }),
  /** SwiftUI `.snappy`: duration 0.5 s, bounce 0.15. */
  snappy: spring({ durationMs: 500, bounce: 0.15 }),
  /** SwiftUI `.bouncy`: duration 0.5 s, bounce 0.3. */
  bouncy: spring({ durationMs: 500, bounce: 0.3 }),
  /** SwiftUI `.default`. The value is the measured fit recorded in the measured reference
   * (matchedGeometryEffect, October 11); see DEFAULT_ANIMATION_DURATION_MS. */
  get default(): Animation {
    return defaultAnimation
  },
})

/* The perceptual duration of SwiftUI's `.default` animation on iOS 27, which is a critically
 * damped spring. Source: the stock SwiftUI matchedGeometryEffect fixture recorded by the
 * matched-geometry implementation (the measured reference, October 11). */
export const DEFAULT_ANIMATION_DURATION_MS = 500
const defaultAnimation = spring({ durationMs: DEFAULT_ANIMATION_DURATION_MS, bounce: 0 })

/** The spring with a unit displacement and the given initial velocity (units per second). */
export function unitSpring(animation: Animation, velocity: number): MenuSpring {
  const { omega, zeta } = animation as SpringAnimation
  return { delay: 0, omega, zeta, velocity }
}
