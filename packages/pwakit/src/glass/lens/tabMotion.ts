import geometryAttack from './tabGeometryAttack.json'
import { TAB_MOTION_FIT, type TabMotionOptics } from './tabMotionFit.ts'
import { TAB_BAR_LOCAL_CENTRES, tabSelectionCapsule } from './tabSelectionMaterial.ts'
import { springStep } from './liquidMotion.ts'
import { TabShapeResponse } from './tabShapeResponse.ts'
import { LensPress } from './lensPress.ts'
import { releaseValue } from './tabRelease.ts'

// Native 07n2 flat-video diagnostic fit. Its failed acceptance and the
// containment/material deviations are documented in the phase notes.
export const TAB_MOTION = Object.freeze({
  stiffness: 411.90968753,
  damping: 39.42175016,
  settleSeconds: 0.65,
  pressSeconds: 0.2,
  releaseSeconds: 0.3,
  followSeconds: 0.025,
})
export const TAB_INTERACTIVE_MOTION = Object.freeze({
  ...TAB_MOTION,
  stiffness: 186.57,
  damping: 25.13,
  followSeconds: 0.08956192678895082,
})
export type TabHeldGeometry = Readonly<{
  widthDelta: number
  height: number
  edgeShift: number
  edgeOverflow?: number
  /** Smallest presented pill height. The phone bars keep 44 pt; the iPad top bar rests at 36 pt. */
  minHeight?: number
}>
export type TabFrame = { centre: number; width: number; height: number }
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x))
const smooth = (x: number) => {
  const t = clamp(x, 0, 1)
  return t * t * (3 - 2 * t)
}
// Width samples at native frames 49,52,56,60,64,68,74. Subtract the
// resting 98 pt width so the inherited 96 pt SDF endpoint stays exact.
const widthKnots = [
  [0, 0],
  [0.05, 5.8],
  [7 / 60, 12.23],
  [11 / 60, 26.79],
  [0.25, 33.19],
  [19 / 60, 14.74],
  [25 / 60, 0],
] as const
function stretchAt(t: number) {
  for (let i = 1; i < widthKnots.length; i++) {
    const left = widthKnots[i - 1],
      right = widthKnots[i]
    if (t <= right[0])
      return left[1] + (right[1] - left[1]) * clamp((t - left[0]) / (right[0] - left[0]), 0, 1)
  }
  return 0
}
// 12y fitting-only native presentation trace; event-relative milliseconds.
function nativeTabAttack(at: number) {
  if (at <= 0) return 0
  for (let i = 1; i < geometryAttack.length; i++)
    if (at <= geometryAttack[i][0]) {
      const a = geometryAttack[i - 1],
        b = geometryAttack[i]
      return clamp(a[1] + ((b[1] - a[1]) * (at - a[0])) / (b[0] - a[0]), 0, 1)
    }
  return 1
}
const rest = (
  index: number,
  centres: readonly number[],
  width: number,
  height: number,
): TabFrame => ({ centre: centres[index], width, height })
export function nearestTab(x: number, centres: readonly number[] = TAB_BAR_LOCAL_CENTRES) {
  return centres.reduce(
    (best, centre, index) => (Math.abs(centre - x) < Math.abs(centres[best] - x) ? index : best),
    0,
  )
}

export class TabMotion {
  private parameters: Readonly<Record<keyof typeof TAB_MOTION, number>>
  private heldGeometry?: TabHeldGeometry
  constructor(
    parameters: Readonly<Record<keyof typeof TAB_MOTION, number>> = TAB_MOTION,
    heldGeometry?: TabHeldGeometry,
  ) {
    this.parameters = parameters
    this.heldGeometry = heldGeometry
  }
  private centres: readonly number[] = TAB_BAR_LOCAL_CENTRES
  private restWidth = 96
  private restHeight = 52
  private centerY = 31
  private dockWidth = 360
  /** Per-tab resting pill widths when items are sized by their labels (the iPad top bar). */
  private widths?: readonly number[]
  private configured = false
  private retarget?: { at: number; centre: number; velocity: number }
  configure(
    centres: readonly number[] = TAB_BAR_LOCAL_CENTRES,
    width = 96,
    height = 52,
    dockWidth = 360,
    options?: {
      selected: number
      centerY?: number
      parameters?: Readonly<Record<keyof typeof TAB_MOTION, number>>
      heldGeometry?: TabHeldGeometry
      widths?: readonly number[]
    },
  ) {
    const selected = clamp(Math.round(options?.selected ?? this.selected), 0, centres.length - 1)
    const centerY = options?.centerY ?? 31
    const geometryChanged = !(
      this.centres.join(',') === centres.join(',') &&
      this.restWidth === width &&
      this.restHeight === height &&
      this.centerY === centerY &&
      this.dockWidth === dockWidth &&
      this.widths?.join(',') === options?.widths?.join(',')
    )
    const parameters = options ? (options.parameters ?? TAB_MOTION) : this.parameters
    const optionsChanged =
      Object.keys(TAB_MOTION).some(
        key =>
          parameters[key as keyof typeof TAB_MOTION] !==
          this.parameters[key as keyof typeof TAB_MOTION],
      ) ||
      (options !== undefined &&
        JSON.stringify(options.heldGeometry) !== JSON.stringify(this.heldGeometry))
    this.parameters = parameters
    if (options) this.heldGeometry = options.heldGeometry
    this.centres = [...centres]
    this.restWidth = width
    this.restHeight = height
    this.centerY = centerY
    this.dockWidth = dockWidth
    this.widths = options?.widths ? [...options.widths] : undefined
    if (!this.configured || (selected !== this.selected && selected !== this.transition?.target)) {
      this.reset(selected)
    } else if (geometryChanged || optionsChanged) {
      if (!this.active) this.reset(selected)
      else if (this.transition) {
        // Continue from the last sampled position and derivative. Changing the endpoint of
        // the original analytic spring would move the capsule immediately on the next sample.
        this.transition.target = clamp(this.transition.target, 0, centres.length - 1)
        this.retarget = {
          at: this.lastAt || this.transition.at,
          centre: this.frame.centre,
          velocity: this.velocity.centre,
        }
        this.heldSettled = false
      }
    }
    this.configured = true
  }
  private rest(index: number) {
    return rest(index, this.centres, this.widthAt(index), this.restHeight)
  }
  private widthAt(index: number) {
    return this.widths?.[index] ?? this.restWidth
  }
  /** Resting width under a point of the bar, interpolated between neighbouring tabs so a
   * dragged lens changes width continuously between unequal items. */
  private widthAtX(x: number) {
    if (!this.widths) return this.restWidth
    const last = this.centres.length - 1
    if (x <= this.centres[0]) return this.widthAt(0)
    if (x >= this.centres[last]) return this.widthAt(last)
    const right = this.centres.findIndex(centre => centre >= x)
    const left = right - 1
    const span = (x - this.centres[left]) / (this.centres[right] - this.centres[left])
    return this.widthAt(left) + (this.widthAt(right) - this.widthAt(left)) * span
  }
  nearest(x: number) {
    return nearestTab(x, this.centres)
  }
  lensMix = 0
  private lensRelease = 0
  selected = 0
  frame = this.rest(0)
  active = false
  private heldSettled = false
  get needsFrame() {
    return this.active && !this.heldSettled
  }
  private pointer?: {
    startX: number
    x: number
    target: number
    down: number
    dragged: boolean
    start: TabFrame
    startLens: number
  }
  private transition?: {
    start: TabFrame
    target: number
    at: number
    releasedAt: number
    releaseWidth?: number
    releaseOnly?: boolean
  }
  private release?: {
    at: number
    start: TabFrame
    velocity: TabFrame
    centre: boolean
    shapeGain: number
  }
  private velocity: TabFrame = { centre: 0, width: 0, height: 0 }
  private lastAt = 0
  private lensPress = new LensPress()
  private shape = new TabShapeResponse()
  private strain = 0
  private unshaped = this.rest(0)
  private baseFrame(): TabFrame {
    return { ...this.unshaped, centre: this.frame.centre }
  }

  reset(index: number) {
    this.lensPress.reset()
    this.heldSettled = false
    this.lensMix = 0
    this.release = undefined
    this.retarget = undefined
    this.velocity = { centre: 0, width: 0, height: 0 }
    this.shape.reset()
    this.strain = 0
    this.selected = clamp(Math.round(index), 0, this.centres.length - 1)
    this.frame = this.rest(this.selected)
    this.unshaped = { ...this.frame }
    this.pointer = undefined
    this.transition = undefined
    this.active = false
    this.lastAt = 0
  }

  down(x: number, target: number, now: number) {
    this.retarget = undefined
    if (this.pointer) return false
    this.lensPress.down(now)
    this.heldSettled = false
    if (this.release) {
      this.unshaped = { ...this.frame }
      this.shape.reset()
      this.strain = 0
    }
    this.release = undefined
    this.unshaped = this.baseFrame()
    this.transition =
      target !== this.selected
        ? { start: this.baseFrame(), target, at: now, releasedAt: now }
        : undefined
    this.pointer = {
      startX: x,
      x,
      target,
      down: now,
      dragged: false,
      start: this.baseFrame(),
      startLens: this.lensMix,
    }
    this.lastAt = now
    this.active = true
    return true
  }

  move(x: number) {
    if (!this.pointer) return
    this.heldSettled = false
    this.pointer.x = x
    this.pointer.dragged ||= Math.abs(x - this.pointer.startX) > 3
  }

  releaseTarget() {
    return this.pointer
      ? this.pointer.dragged
        ? this.nearest(this.pointer.x)
        : this.pointer.target
      : undefined
  }

  up(now: number, cancelled = false, committed = this.selected) {
    if (!this.pointer) return
    this.lensPress.up(now)
    this.heldSettled = false
    const pointer = this.pointer
    const target = cancelled
      ? committed
      : pointer.dragged
        ? this.nearest(pointer.x)
        : pointer.target
    this.pointer = undefined
    // Native starts an unselected-tab press on DOWN. UP releases the same
    // trajectory; restarting its spring here loses both position and velocity.
    if (!cancelled && !pointer.dragged && this.transition?.target === target) {
      this.lensRelease = this.lensMix
      this.transition.releasedAt = now
      this.transition.releaseWidth = this.unshaped.width
      this.transition.releaseOnly = this.lensMix === 1
      if (this.transition.releaseOnly) this.beginRelease(now, false)
      return target
    }
    this.select(target, now, true)
    this.beginRelease(now, true)
    return target
  }

  private beginRelease(now: number, centre: boolean) {
    this.release = {
      at: now,
      start: this.baseFrame(),
      velocity: { ...this.velocity },
      centre,
      shapeGain: this.lensMix,
    }
  }

  select(target: number, now: number, releaseOnly = false) {
    this.retarget = undefined
    this.pointer = undefined
    if (this.release) {
      this.unshaped = { ...this.frame }
      this.shape.reset()
      this.strain = 0
    }
    this.release = undefined
    this.unshaped = this.baseFrame()
    this.lensRelease = this.lensMix
    this.transition = {
      start: this.baseFrame(),
      target: clamp(Math.round(target), 0, this.centres.length - 1),
      at: now,
      releasedAt: now,
      releaseOnly,
    }
    this.active = true
  }

  sample(now: number, reduced: boolean) {
    if (reduced) this.lensPress.reset()
    const previousFrame = { ...this.frame }
    const previousBase = { ...this.unshaped }
    const previousAt = this.lastAt
    const previousSelection = this.selected
    const previousCentre = this.unshaped.centre
    const dt = this.lastAt ? Math.max(0, (now - this.lastAt) / 1000) : 0
    this.lastAt = now
    if (this.pointer) {
      const p = this.pointer
      if (reduced) {
        this.lensMix = 0
        this.frame = this.rest(p.dragged ? this.nearest(p.x) : this.selected)
      } else {
        const press =
          this.parameters === TAB_INTERACTIVE_MOTION && this.centres.length > 1
            ? nativeTabAttack(now - p.down)
            : smooth((now - p.down) / (0.23333333333333334 * 1000))
        this.lensMix = p.startLens + (1 - p.startLens) * press
        const edgeShift =
          this.centres.length === 1
            ? 0
            : this.selected === 0
              ? -(this.heldGeometry?.edgeShift ?? 5)
              : this.selected === this.centres.length - 1
                ? (this.heldGeometry?.edgeShift ?? 5)
                : 0
        const target = p.dragged ? p.x : this.centres[this.selected] + edgeShift * press
        const delta = target - this.unshaped.centre
        const centre =
          this.unshaped.centre + delta * (1 - Math.exp(-dt / this.parameters.followSeconds))
        this.frame = {
          centre,
          width:
            p.start.width +
            (this.widthAtX(centre) + (this.heldGeometry?.widthDelta ?? 23) - p.start.width) * press,
          height:
            p.start.height +
            ((this.centres.length === 1
              ? this.restHeight + 21
              : (this.heldGeometry?.height ?? 73)) -
              p.start.height) *
              press,
        }
        if (!p.dragged && this.transition) {
          const t = (now - this.transition.at) / 1000
          const start = this.transition.start
          const travel = this.centres[this.transition.target] - start.centre
          this.frame.centre =
            start.centre +
            travel * springStep(t, this.parameters.stiffness, this.parameters.damping)
          this.frame.width =
            start.width +
            (this.widthAt(this.transition.target) - start.width) * press +
            Math.max(23 * press, stretchAt(t) * Math.min(1, Math.abs(travel) / 170))
        }
      }
    } else if (this.transition) {
      const { start, target, at, releasedAt, releaseWidth, releaseOnly } = this.transition
      const t = (now - at) / 1000
      const sinceRelease = (now - releasedAt) / 1000
      // Quick taps finish the measured DOWN expansion before relaxing. Seed
      // from the last submitted frame and derivative, never from a rest pose.
      if (!this.release && !releaseOnly && t >= 0.23333333333333334) {
        this.beginRelease(previousAt, false)
      }
      if (
        reduced ||
        (t >= this.parameters.settleSeconds &&
          sinceRelease >= this.parameters.settleSeconds &&
          (!this.retarget || (now - this.retarget.at) / 1000 >= this.parameters.settleSeconds))
      ) {
        this.reset(target)
      } else {
        const end = this.rest(target)
        const travel = Math.abs(end.centre - start.centre)
        const progress = springStep(t, this.parameters.stiffness, this.parameters.damping)
        const release = smooth(sinceRelease / this.parameters.releaseSeconds)
        // A quick tap also enters the lens while its selection morph travels.
        this.lensMix =
          target !== this.selected && !releaseOnly
            ? (this.lensRelease +
                (1 - this.lensRelease) * smooth(sinceRelease / 0.11666666666666667)) *
              (1 - smooth((t - Math.max(0.23333333333333334, (releasedAt - at) / 1000)) / 0.3))
            : this.lensRelease * (1 - smooth(sinceRelease / 0.11666666666666667))
        const stretch = !releaseOnly && travel > 3 ? stretchAt(t) * Math.min(1, travel / 170) : 0
        this.frame = {
          centre: start.centre + (end.centre - start.centre) * progress,
          width: Math.max(
            start.width + (end.width - start.width) * release + stretch,
            end.width + ((releaseWidth ?? end.width) - end.width) * (1 - release),
          ),
          height: Math.max(
            start.height + (this.restHeight - start.height) * release,
            this.restHeight + 21 * this.lensMix,
          ),
        }
        if (this.release) {
          const r = this.release,
            seconds = (now - r.at) / 1000
          this.frame.width = releaseValue(r.start.width, r.velocity.width, end.width, seconds)
          this.frame.height = releaseValue(
            r.start.height,
            r.velocity.height,
            this.restHeight,
            seconds,
          )
          if (r.centre)
            this.frame.centre = releaseValue(
              r.start.centre,
              r.velocity.centre,
              end.centre,
              seconds,
              this.parameters.stiffness,
              this.parameters.damping,
            )
        }
      }
    }
    if (this.retarget && this.transition && !this.pointer?.dragged && !reduced) {
      this.frame.centre = releaseValue(
        this.retarget.centre,
        this.retarget.velocity,
        this.centres[this.transition.target],
        (now - this.retarget.at) / 1000,
        this.parameters.stiffness,
        this.parameters.damping,
      )
    }
    // Native press extends outside the resting dock. The notes explicitly
    // resolve the containment conflict in favor of its observed envelope.
    // Resolve position constraints before measuring travel. The unreachable
    // distance to a finger past the end is pressure, not displayed velocity.
    // Keep this trajectory separate from the width-dependent presentation
    // clamp below: strain must not move its own velocity source next frame.
    this.frame.centre = clamp(
      this.frame.centre,
      this.frame.width / 2 - (this.heldGeometry?.edgeOverflow ?? 11),
      this.dockWidth + (this.heldGeometry?.edgeOverflow ?? 11) - this.frame.width / 2,
    )
    this.unshaped = { ...this.frame }
    if (reduced || !this.active) {
      this.shape.reset()
      this.strain = 0
    } else {
      this.strain = this.shape.sample(dt > 0 ? (this.frame.centre - previousCentre) / dt : 0, dt)
      // While held, introduce strain with the press. Release carries the
      // presented dimensions and their velocity independently of material.
      const strain = this.strain * (this.release?.shapeGain ?? this.lensMix)
      this.frame.width += strain
      this.frame.height -= strain
      this.strain = strain
    }
    this.frame.height =
      this.centres.length === 1
        ? clamp(this.frame.height, this.restHeight - 8, this.restHeight + 33)
        : clamp(this.frame.height, this.heldGeometry?.minHeight ?? 44, 85)
    const restWidth = this.widthAtX(this.frame.centre)
    this.frame.width = clamp(this.frame.width, restWidth - 8, restWidth + 54)
    this.frame.centre = clamp(
      this.frame.centre,
      this.frame.width / 2 - (this.heldGeometry?.edgeOverflow ?? 11),
      this.dockWidth + (this.heldGeometry?.edgeOverflow ?? 11) - this.frame.width / 2,
    )
    if (dt > 0 && dt <= 0.1 && this.active) {
      this.velocity = {
        centre: (this.frame.centre - previousFrame.centre) / dt,
        width: (this.unshaped.width - previousBase.width) / dt,
        height: (this.unshaped.height - previousBase.height) / dt,
      }
    } else if (dt > 0.1) this.velocity = { centre: 0, width: 0, height: 0 }
    this.heldSettled =
      !!this.pointer &&
      this.lensMix === 1 &&
      Math.abs(this.velocity.centre) < 0.001 &&
      Math.abs(this.velocity.width) < 0.001 &&
      Math.abs(this.velocity.height) < 0.001 &&
      Math.abs(this.strain) < 0.001
    return previousSelection === this.selected ? undefined : this.selected
  }

  capsule() {
    return {
      ...tabSelectionCapsule(this.selected),
      centerX: this.frame.centre,
      centerY: this.centerY,
      halfWidth: this.frame.width / 2,
      halfHeight: this.frame.height / 2,
      radius: this.frame.height / 2,
    }
  }
  optics(): TabMotionOptics {
    if (!this.active)
      return {
        backgroundWarpPt: 0,
        foregroundChroma: 0,
        foregroundScaleX: 0,
        foregroundScaleY: 0,
        foregroundLabelScaleX: 0,
        foregroundLabelScaleY: 0,
        motionMix: 0,
        rimGradient: 0,
        travelWarpPt: 0,
      }
    const scale = TAB_MOTION_FIT.featureScale
    const press = clamp(Math.max(0, this.frame.height - this.restHeight) / scale.heightPt, 0, 1)
    const restWidth = this.widthAtX(this.frame.centre)
    const stretch = clamp(Math.abs(this.frame.width - restWidth) / scale.widthPt, 0, 1)
    const speed = clamp(Math.abs(this.velocity.centre) / scale.speedPtPerSecond, 0, 1)
    const release = clamp(Math.max(0, -this.velocity.height) / scale.releasePtPerSecond, 0, 1)
    const response = (
      fit: Readonly<{ press: number; stretch: number; speed: number; release: number }>,
    ) => fit.press * press + fit.stretch * stretch + fit.speed * speed + fit.release * release
    return {
      lightingLight: this.lensPress.lighting(this.lastAt, 'light'),
      lightingDark: this.lensPress.lighting(this.lastAt, 'dark'),
      lensLight: this.lensPress.sample(this.lastAt, 'light'),
      lensDark: this.lensPress.sample(this.lastAt, 'dark'),
      backgroundWarpPt: response(TAB_MOTION_FIT.backgroundRadialWarpPt),
      foregroundChroma: response(TAB_MOTION_FIT.foregroundChromaRgb),
      foregroundScaleX: response(TAB_MOTION_FIT.foregroundScaleX),
      foregroundScaleY: response(TAB_MOTION_FIT.foregroundScaleY),
      foregroundLabelScaleX: response(TAB_MOTION_FIT.foregroundLabelScaleX),
      foregroundLabelScaleY: response(TAB_MOTION_FIT.foregroundLabelScaleY),
      motionMix: clamp(Math.max(this.lensMix, press, stretch, speed, release), 0, 1),
      rimGradient: response(TAB_MOTION_FIT.rimGradientLumaPerPt),
      travelWarpPt:
        TAB_MOTION_FIT.signedTravelWarpPt *
        clamp(this.velocity.centre / scale.speedPtPerSecond, -1, 1),
    }
  }
}
