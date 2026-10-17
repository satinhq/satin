import { menuSpring } from '../glass/lens/menuSpring.ts'
import { unitSpring, type Animation } from './animationValue.ts'

/**
 * One value moving to its target on a spring. The spring is linear, so the offset from the
 * target at time t is `displacement · a(t) + velocity · b(t)`, where a is the response to a unit
 * displacement at rest and b the response to a unit initial velocity with no displacement. That
 * form lets an interrupted run hand its exact position and velocity to the next one, including
 * a value that is already at its new target but still moving.
 */
export type SpringChannel = Readonly<{ displacement: number; velocity: number }>

/** Offset from the target and its velocity (per second) `ms` after the run started. */
export function sampleChannel(animation: Animation, channel: SpringChannel, ms: number) {
  const atRest = menuSpring(unitSpring(animation, 0), ms)
  const pushed = menuSpring(unitSpring(animation, 1), ms)
  const kickValue = pushed.value - atRest.value
  const kickVelocity = pushed.velocity - atRest.velocity
  return {
    offset: channel.displacement * atRest.value + channel.velocity * kickValue,
    velocity: channel.displacement * atRest.velocity + channel.velocity * kickVelocity,
  }
}

/** Progress from 0 to 1 of a run that starts at rest: what opacity follows. */
export function sampleProgress(animation: Animation, ms: number) {
  return 1 - menuSpring(unitSpring(animation, 0), ms).value
}

const FRAME_MS = 1000 / 60
const LONGEST_RUN_MS = 3000
/** Below a third of a point the remaining travel is invisible at 3× on a phone. */
const REST_TOLERANCE = 0.3

/**
 * The 60 Hz frame times of a run, up to the frame after every channel has come within
 * REST_TOLERANCE of its target. WAAPI interpolates linearly between these dense samples, which
 * keeps the measured curve instead of approximating it with a cubic-bezier.
 */
export function runFrameTimes(
  animation: Animation,
  channels: readonly SpringChannel[],
  minimumMs = 0,
) {
  let lastMoving = 0
  for (let ms = 0; ms <= LONGEST_RUN_MS; ms += FRAME_MS) {
    const moving = channels.some(
      channel => Math.abs(sampleChannel(animation, channel, ms).offset) > REST_TOLERANCE,
    )
    if (moving) lastMoving = ms
  }
  // Opacity-only runs still need the spring's visible fade time.
  const settleMs = Math.max(lastMoving + FRAME_MS, minimumMs)
  const frames = Math.max(1, Math.ceil(settleMs / FRAME_MS))
  return Array.from({ length: frames + 1 }, (_, frame) => frame * FRAME_MS)
}

/** When a fade from 0 to 1 is within 1% of its end: opacity steps below that are invisible. */
export function fadeSettleMs(animation: Animation) {
  for (let ms = 0; ms <= LONGEST_RUN_MS; ms += FRAME_MS) {
    if (sampleProgress(animation, ms) >= 0.99) return ms
  }
  return LONGEST_RUN_MS
}
