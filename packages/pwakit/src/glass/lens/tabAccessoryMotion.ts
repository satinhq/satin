import { sampleFieldAxis, type FieldSpring } from '../fieldMotion.ts'

/**
 * Motion of the TabView bottom accessory between its expanded row (above the tab bar) and its
 * inline row (beside the minimized tab circle).
 *
 * Native reference: stock SwiftUI `.tabViewBottomAccessory` + `.tabBarMinimizeBehavior(.onScrollDown)`
 * with three Music-style tabs, iPhone 17 Pro Max, iOS 27.0 Simulator, counter-retimed
 * (RMS 2.6 pt collapse, 1.1 pt
 * expand). Each edge follows an underdamped spring (damping ratio about 0.72), and the two axes
 * do not start together: collapsing, the accessory slides toward the circle with the bar and drops
 * into the bar's row 53 ms later; expanding, it rises first and widens back 52 ms after that.
 * Delays count from the first frame the tab bar itself changes shape (native's tap first swells
 * the circle for about 70 ms; Satin's bar track starts at the tap's release, as native's does).
 */
export type AccessoryDirection = 'collapse' | 'restore'

export type AccessoryProfile = Readonly<{
  spring: FieldSpring
  /** When the horizontal edges start, after the tab bar's own motion starts. */
  horizontalDelayMs: number
  /** When the vertical position starts, after the tab bar's own motion starts. */
  verticalDelayMs: number
}>

export const ACCESSORY_PROFILES: Readonly<Record<AccessoryDirection, AccessoryProfile>> = {
  collapse: {
    spring: { stiffness: 202, damping: 20.5 },
    horizontalDelayMs: 0,
    verticalDelayMs: 53,
  },
  restore: {
    spring: { stiffness: 404, damping: 29.3 },
    horizontalDelayMs: 52,
    verticalDelayMs: 0,
  },
}

/** The accessory's edges, in points from the bottom chrome's left, right and bottom edges. */
export type AccessoryBox = Readonly<{ left: number; right: number; bottom: number }>
type Edge = keyof AccessoryBox
const EDGES: readonly Edge[] = ['left', 'right', 'bottom']
export const RESTING_ACCESSORY_VELOCITY: AccessoryBox = { left: 0, right: 0, bottom: 0 }

/** One accessory move: where it started, where it goes, and its velocity at the start. */
export type AccessoryRun = Readonly<{
  from: AccessoryBox
  to: AccessoryBox
  velocity: AccessoryBox
  profile: AccessoryProfile
}>

function edgeDelay(profile: AccessoryProfile, edge: Edge) {
  return edge === 'bottom' ? profile.verticalDelayMs : profile.horizontalDelayMs
}

/** The accessory's presented edges and their velocities (points per second) `elapsedMs` into a run. */
export function sampleAccessory(run: AccessoryRun, elapsedMs: number) {
  const value = { ...run.to }
  const velocity = { ...RESTING_ACCESSORY_VELOCITY }
  for (const edge of EDGES) {
    const delay = edgeDelay(run.profile, edge)
    if (elapsedMs < delay) {
      // A reversal keeps the edge's carried velocity through the delay rather than freezing it.
      const sample = sampleFieldAxis(
        run.from[edge],
        run.from[edge],
        run.velocity[edge],
        elapsedMs,
        run.profile.spring,
      )
      value[edge] = sample.value
      velocity[edge] = sample.velocity
      continue
    }
    const held = sampleFieldAxis(
      run.from[edge],
      run.from[edge],
      run.velocity[edge],
      delay,
      run.profile.spring,
    )
    const sample = sampleFieldAxis(
      held.value,
      run.to[edge],
      held.velocity,
      elapsedMs - delay,
      run.profile.spring,
    )
    value[edge] = sample.value
    velocity[edge] = sample.velocity
  }
  return { value, velocity }
}

const SETTLED_DISTANCE = 0.05
const SETTLED_SPEED = 1
const LONGEST_RUN_MS = 1500

/** The first frame time at which every edge has settled on its target. */
export function accessoryRunDuration(run: AccessoryRun, frameMs = 1000 / 120) {
  for (let elapsed = 0; elapsed < LONGEST_RUN_MS; elapsed += frameMs) {
    const { value, velocity } = sampleAccessory(run, elapsed)
    const settled = EDGES.every(
      edge =>
        Math.abs(value[edge] - run.to[edge]) < SETTLED_DISTANCE &&
        Math.abs(velocity[edge]) < SETTLED_SPEED,
    )
    if (settled && elapsed >= Math.max(edgeDelay(run.profile, 'left'), run.profile.verticalDelayMs))
      return elapsed
  }
  return LONGEST_RUN_MS
}
