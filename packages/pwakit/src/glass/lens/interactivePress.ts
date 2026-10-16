import { MENU_MORPH_DURATION, sampleMenuMorph } from './menuMorphMotion.ts'
import { GLASS_CONTACT_PHYSICS, type GlassContactKind } from '../contactPhysics.ts'
/**
 * The one press response of interactive Liquid Glass (buttons, bar and toolbar buttons, the
 * back button, Glass.interactive() surfaces). Fitted 2026-09-25 to stock SwiftUI on the iOS
 * 27.0 Simulator (ParityReference `--glass-press`, idb presses at human speed: 0.6 s holds and
 * 0.12 s taps, light and dark; glass edges measured on the centre row and column):
 *
 * - Growth: the glass scales uniformly by 1 + G / width. Buttons (`.glass`, `.glassProminent`,
 *   toolbar items, the back button) grow G = 16 pt wide: 80x34 → 96x40, 94x35 → 110x41,
 *   109x48 → 125x54, a 44 pt circle → 60 pt. An interactive glassEffect surface grows G = 4 pt
 *   (a 404 pt card → 408-410 pt; a 160 pt circle → 164 pt).
 * - Press: the highlight answers at touch-down; growth starts ~50 ms later and peaks ~85 ms after
 *   that with a ~6% overshoot (ζ ≈ 0.67).
 * - Release: halves in ~40 ms, crosses rest at ~100 ms, undershoots to ~0.95 of rest at ~180 ms
 *   and settles by ~300 ms (ζ ≈ 0.34, ωn ≈ 18 rad/s).
 */
export const INTERACTIVE_GLASS_PRESS = {
  /** Each kind's growth lives in the contact table (GLASS_CONTACT_PHYSICS). */
  growthPt: {
    button: GLASS_CONTACT_PHYSICS.button.growthPt,
    bar: GLASS_CONTACT_PHYSICS.bar.growthPt,
    menu: GLASS_CONTACT_PHYSICS.menu.growthPt,
    field: GLASS_CONTACT_PHYSICS.field.growthPt,
    surface: GLASS_CONTACT_PHYSICS.surface.growthPt,
    segmented: GLASS_CONTACT_PHYSICS.segmented.growthPt,
  },
  delayMs: 50,
  press: { stiffness: 1600, damping: 53.6 },
  release: { stiffness: 324, damping: 12.24 },
} as const

export type InteractivePressKind = GlassContactKind
/** The timing of one press response: a growth delay and its press and release springs (mass 1). */
export type InteractivePressProfile = Readonly<{
  delayMs: number
  press: Readonly<{ stiffness: number; damping: number }>
  release: Readonly<{ stiffness: number; damping: number }>
}>

/** Uniform scale of a pressed glass shape of `width` points at press `amount` (1 = held). */
export function interactivePressScale(kind: InteractivePressKind, width: number, amount: number) {
  return width > 0 ? 1 + (INTERACTIVE_GLASS_PRESS.growthPt[kind] / width) * amount : 1
}

/** Damped spring toward 1 (held) or 0 (rest). Times are epoch milliseconds. */
export class InteractivePress {
  private readonly profile: InteractivePressProfile
  constructor(profile: InteractivePressProfile = INTERACTIVE_GLASS_PRESS) {
    this.profile = profile
  }
  private x = 0
  private v = 0
  private target = 0
  private startAt = 0
  private sampledAt?: number
  get amount() {
    return this.x
  }
  get needsFrame() {
    return Math.abs(this.target - this.x) > 1e-4 || Math.abs(this.v) > 1e-3
  }
  down(at: number) {
    this.sample(at)
    this.target = 1
    this.startAt = at + this.profile.delayMs
    this.sampledAt ??= at
  }
  up(at: number) {
    // Integrate the press up to the release; a release inside the growth delay never grows.
    if (this.target === 1) this.sample(at)
    this.target = 0
    this.startAt = Math.max(at, this.startAt)
    this.sampledAt ??= at
  }
  /** Continue from a presented value and velocity (amount per second), e.g. a dragged thumb. */
  place(amount: number, velocity: number, at: number) {
    this.x = amount
    this.v = velocity
    this.target = amount
    this.startAt = at
    this.sampledAt = at
  }
  /** A playback copy can sample future keyframes without advancing the live contact. */
  copy() {
    const copy = new InteractivePress(this.profile)
    copy.x = this.x
    copy.v = this.v
    copy.target = this.target
    copy.startAt = this.startAt
    copy.sampledAt = this.sampledAt
    return copy
  }
  reset() {
    this.x = 0
    this.v = 0
    this.target = 0
    this.sampledAt = undefined
  }
  /** Reduce Motion keeps glass at its resting size (the highlight still answers). */
  sample(at: number, reducedMotion = false) {
    if (reducedMotion) {
      this.x = 0
      this.v = 0
      this.sampledAt = at
      return this.x
    }
    const from = this.sampledAt ?? at
    this.sampledAt = at
    if (at <= this.startAt || at <= from) return this.x
    const { stiffness, damping } = this.target === 1 ? this.profile.press : this.profile.release
    let t = Math.max(from, this.startAt)
    // 1 ms semi-implicit Euler steps: stable for both springs, a few hundred flops per frame.
    // A retained contact may be idle for hours. Once settled, no further integration is needed.
    while (t < at && this.needsFrame) {
      const dt = Math.min(1, at - t) / 1000
      this.v += (stiffness * (this.target - this.x) - damping * this.v) * dt
      this.x += this.v * dt
      t += dt * 1000
    }
    if (!this.needsFrame) {
      this.x = this.target
      this.v = 0
    }
    return this.x
  }
}

/** Menu timing comes from the recorded, independently fitted native contour axes. */
export const GLASS_MENU_MORPH = {
  open: { ms: MENU_MORPH_DURATION.open },
  close: { ms: MENU_MORPH_DURATION.close },
} as const

/** Legacy scalar callers use the width axis; the renderer consumes the full pose. */
export function glassMenuMorphProgress(direction: 'open' | 'close', ms: number) {
  const width = sampleMenuMorph(direction, ms).pose.width
  return direction === 'open' ? width : 1 - width
}

/** Linear interpolation of a measured scalar channel; shared by button and menu lighting. */
export function sampleHighlightCurve(
  points: readonly (readonly number[])[],
  ms: number,
  channel = 1,
) {
  if (ms <= points[0][0]) return points[0][channel]
  for (let index = 1; index < points.length; index++) {
    const before = points[index - 1]
    const after = points[index]
    if (ms <= after[0]) {
      return (
        before[channel] +
        ((after[channel] - before[channel]) * (ms - before[0])) / (after[0] - before[0])
      )
    }
  }
  return points.at(-1)![channel]
}
/** The longest whole-shape highlight release of any kind and appearance (ms). */
export const INTERACTIVE_HIGHLIGHT_RELEASE_MS = Math.max(
  ...Object.values(GLASS_CONTACT_PHYSICS).flatMap(physics =>
    physics.light.kind === 'whole'
      ? [physics.light.releaseMs.light, physics.light.releaseMs.dark]
      : [0],
  ),
)

/**
 * White amount over a pressed button-like glass (`whole` light, GLASS_CONTACT_PHYSICS) at `at`,
 * for a press down at `downAt` and released at `upAt` (epoch ms). Surfaces light at the finger
 * instead and answer 0 here.
 */
export function interactiveHighlight(
  kind: GlassContactKind,
  appearance: 'light' | 'dark',
  downAt: number,
  upAt: number | undefined,
  at: number,
) {
  const light = GLASS_CONTACT_PHYSICS[kind].light
  if (light.kind !== 'whole') return 0
  const held = sampleHighlightCurve(light[appearance], (upAt ?? at) - downAt)
  if (upAt === undefined || at <= upAt) return held
  return held * Math.max(0, 1 - (at - upAt) / light.releaseMs[appearance])
}
/** One tint from a material tint followed by a white highlight of amount `white`. */
export function withHighlight(
  tint: readonly [number, number, number, number] | undefined,
  white: number,
): [number, number, number, number] {
  const a1 = tint?.[3] ?? 0,
    a = 1 - (1 - a1) * (1 - white)
  if (a <= 0) return [1, 1, 1, 0]
  const mix = (c: number) => ((tint ? c : 1) * a1 * (1 - white) + white) / a
  return [mix(tint?.[0] ?? 1), mix(tint?.[1] ?? 1), mix(tint?.[2] ?? 1), a]
}
