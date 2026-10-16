import { menuSpring, menuSpringSettle, type MenuSpring } from '../glass/lens/menuSpring.ts'

/** A measured spring: SwiftUI's `.interpolatingSpring(stiffness:damping:)` with unit mass, released
 * `delay` ms after the animation starts. */
export type SpringParameters = Readonly<{ stiffness: number; damping: number; delay?: number }>

const FRAME_MS = 1000 / 60

/** The spring as a displacement from its target; `velocity` is normalised (travel per second). */
export function springMotion(parameters: SpringParameters, velocity = 0): MenuSpring {
  const omega = Math.sqrt(parameters.stiffness)
  return {
    delay: parameters.delay ?? 0,
    omega,
    zeta: parameters.damping / (2 * omega),
    velocity,
  }
}

/** Progress from 0 to 1 sampled once per 60 Hz frame until the spring settles. */
export type SpringTrack = Readonly<{ duration: number; progress: readonly number[] }>

export function springTrack(spring: MenuSpring): SpringTrack {
  const duration = Math.max(FRAME_MS, menuSpringSettle(spring))
  const frames = Math.ceil(duration / FRAME_MS)
  const progress: number[] = []
  for (let frame = 0; frame <= frames; frame++) {
    progress.push(frame === frames ? 1 : 1 - menuSpring(spring, frame * FRAME_MS).value)
  }
  return { duration: frames * FRAME_MS, progress }
}

/**
 * Per-frame keyframes for WAAPI. WebKit runs keyframed transform and opacity animations on the
 * compositor; a CSS `linear()` easing can fall back to the main thread (navigation/motion.ts).
 */
export function sampledKeyframes(
  track: SpringTrack,
  frame: (progress: number) => Keyframe,
): Keyframe[] {
  const last = track.progress.length - 1
  return track.progress.map((progress, index) => ({ ...frame(progress), offset: index / last }))
}

/** An existing analytic motion fit sampled on one uniform time grid. Values may be
 * points rather than normalized progress; no spring parameters are changed here. */
export type SampledMotionTrack = Readonly<{ duration: number; values: readonly number[] }>

export function sampledMotionTrack(
  duration: number,
  sample: (milliseconds: number) => number,
  tolerance = 0.2,
): SampledMotionTrack {
  if (!(duration > 0) || !Number.isFinite(duration) || !(tolerance > 0) || !Number.isFinite(tolerance))
    throw Error('Motion tracks require a finite positive duration and tolerance')
  let count = Math.max(1, Math.ceil(duration / (1000 / 120)))
  // GPU and compositor consumers require even offsets. Refine the whole grid,
  // rather than giving them independent adaptive sample positions.
  while (count <= 4096) {
    const values = Array.from({ length: count + 1 }, (_, index) => sample(duration * index / count))
    if (!values.every(Number.isFinite)) throw Error('Motion track contains a non-finite value')
    let accurate = true
    for (let index = 0; accurate && index < count; index++) {
      for (const fraction of [0.25, 0.5, 0.75]) {
        const exact = sample(duration * (index + fraction) / count)
        const linear = values[index]! + (values[index + 1]! - values[index]!) * fraction
        if (!Number.isFinite(exact)) throw Error('Motion track contains a non-finite value')
        if (Math.abs(exact - linear) > tolerance) { accurate = false; break }
      }
    }
    if (accurate) return { duration, values }
    count *= 2
  }
  throw Error('Motion track exceeds its sampling error budget')
}

/** Read the submitted segment, including its velocity, when a run is interrupted. */
export function sampledMotionState(track: SampledMotionTrack, milliseconds: number) {
  const last = track.values.length - 1
  const position = Math.max(0, Math.min(last, milliseconds / track.duration * last))
  const index = Math.min(last - 1, Math.floor(position))
  const from = track.values[index]!, to = track.values[index + 1]!
  return {
    value: from + (to - from) * (position - index),
    velocity: milliseconds < 0 || milliseconds >= track.duration ? 0 : (to - from) * last / track.duration * 1000,
  }
}
