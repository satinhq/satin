import {
  GLASS_CONTACT_PHYSICS,
  menuPull,
  menuReturn,
  MENU_STRAIN_RESPONSE_MS,
  type GlassContactParameters,
} from '../contactPhysics.ts'
import type { GlassInteraction } from '../rendererContract.ts'
import { MenuTouchLight } from './menuTouchLight.ts'

/**
 * The contact of a pressed interactive glass shape (buttons, bar buttons, menu triggers, fields,
 * Glass.interactive() surfaces), on the menu's physics: one implementation for every kind, whose
 * parameters come from GLASS_CONTACT_PHYSICS.
 *
 * - Light: the menu's touch light (MenuTouchLight), a soft white field centred on the finger
 *   that follows it while dragging and spreads as it fades on release.
 * - Follow: the held shape trails the finger (menuPull per axis, approached with the kind's
 *   response).
 * - Squish: while the finger moves, the menu panel's velocity strain (seconds per axis): the
 *   shape leads along the motion, stretches along it and narrows across it, relaxing with the
 *   panel's 109.8 ms response when the finger stops.
 * - Release: the menu panel's measured return spring (menuReturn) from the presented pose.
 */
const VELOCITY_WINDOW_MS = 100
const VELOCITY_AGE_MS = 60
const RETURN_MS = 850

/** Offset and size change of the pressed shape, in CSS px (added to the resting frame). */
export type GlassContactPose = Readonly<{ x: number; y: number; width: number; height: number }>
export const GLASS_CONTACT_REST: GlassContactPose = Object.freeze({
  x: 0,
  y: 0,
  width: 0,
  height: 0,
})

type Point = { x: number; y: number }

export class InteractiveContact {
  readonly light = new MenuTouchLight()
  private readonly physics: GlassContactParameters
  constructor(physics: GlassContactParameters = GLASS_CONTACT_PHYSICS.surface) {
    this.physics = physics
  }
  private epoch = -Infinity
  private start?: Point
  private current?: Point
  private samples: { at: number; x: number; y: number }[] = []
  private follow: Point = { x: 0, y: 0 }
  private velocity: Point = { x: 0, y: 0 }
  private sampledAt?: number
  private presented: GlassContactPose = GLASS_CONTACT_REST
  private releasedAt?: number
  private releasedPose: GlassContactPose = GLASS_CONTACT_REST

  input(input: GlassInteraction) {
    if (input.epoch < this.epoch) return
    this.epoch = input.epoch
    this.light.input(input)
    if (input.phase === 'rest') {
      this.reset()
      return
    }
    if (input.phase === 'pressed') {
      this.reset()
      if (!input.contact) return
      this.start = { ...input.contact }
      this.current = { ...input.contact }
      this.samples = [{ at: input.epoch, ...input.contact }]
      this.sampledAt = input.epoch
      return
    }
    if (!this.start) return
    if (input.contact) {
      this.current = { ...input.contact }
      this.samples.push({ at: input.epoch, ...input.contact })
      const oldest = input.epoch - VELOCITY_WINDOW_MS * 2
      while (this.samples.length > 2 && this.samples[0].at < oldest) this.samples.shift()
    }
    if (input.phase === 'releasing') {
      this.releasedPose = this.pose(input.epoch)
      this.releasedAt = input.epoch
    }
  }

  needsFrame(at: number) {
    if (this.light.needsFrame(at)) return true
    if (this.releasedAt !== undefined) return at < this.releasedAt + RETURN_MS
    return this.start !== undefined && !isRest(this.presented, this.velocity)
  }

  /** The shape's pose at `at` (epoch ms). Reduce Motion keeps glass at rest; the light answers. */
  pose(at: number, reducedMotion = false): GlassContactPose {
    if (reducedMotion || !this.start || !this.current) return GLASS_CONTACT_REST
    if (this.releasedAt !== undefined) {
      const amount = menuReturn(Math.max(0, at - this.releasedAt))
      return scalePose(this.releasedPose, amount)
    }
    const elapsed = Math.max(0, at - (this.sampledAt ?? at))
    this.sampledAt = Math.max(this.sampledAt ?? at, at)
    const { follow: law, strain, maxOffset, maxSizeChange } = this.physics
    const dx = this.current.x - this.start.x
    const dy = this.current.y - this.start.y
    const follow = 1 - Math.exp(-elapsed / law.responseMs)
    this.follow.x += (menuPull(dx, law.gainX, law.rangePt) - this.follow.x) * follow
    this.follow.y += (menuPull(dy, law.gainY, law.rangePt) - this.follow.y) * follow
    const measured = this.measuredVelocity(at)
    const response = 1 - Math.exp(-elapsed / MENU_STRAIN_RESPONSE_MS)
    this.velocity.x += (measured.x - this.velocity.x) * response
    this.velocity.y += (measured.y - this.velocity.y) * response
    const speedX = Math.abs(this.velocity.x)
    const speedY = Math.abs(this.velocity.y)
    this.presented = {
      x: clamp(this.follow.x + this.velocity.x * strain.leadXSeconds, maxOffset),
      y: clamp(this.follow.y + this.velocity.y * strain.leadYSeconds, maxOffset),
      width: clamp(speedX * strain.stretchSeconds - speedY * strain.narrowSeconds, maxSizeChange),
      height: clamp(speedY * strain.stretchSeconds - speedX * strain.narrowSeconds, maxSizeChange),
    }
    return this.presented
  }

  /** Finger velocity (px/s) over the last 100 ms, fading once the finger stops reporting. */
  private measuredVelocity(at: number): Point {
    const last = this.samples.at(-1)
    if (!last) return { x: 0, y: 0 }
    const first = this.samples.find(sample => sample.at >= last.at - VELOCITY_WINDOW_MS) ?? last
    if (last.at <= first.at) return { x: 0, y: 0 }
    const fade = Math.exp(-Math.max(0, at - last.at) / VELOCITY_AGE_MS)
    const seconds = (last.at - first.at) / 1000
    return {
      x: ((last.x - first.x) / seconds) * fade,
      y: ((last.y - first.y) / seconds) * fade,
    }
  }

  private reset() {
    this.start = undefined
    this.current = undefined
    this.samples = []
    this.follow = { x: 0, y: 0 }
    this.velocity = { x: 0, y: 0 }
    this.sampledAt = undefined
    this.presented = GLASS_CONTACT_REST
    this.releasedAt = undefined
    this.releasedPose = GLASS_CONTACT_REST
  }
}

function clamp(value: number, limit: number) {
  return Math.max(-limit, Math.min(limit, value))
}

function scalePose(pose: GlassContactPose, amount: number): GlassContactPose {
  return {
    x: pose.x * amount,
    y: pose.y * amount,
    width: pose.width * amount,
    height: pose.height * amount,
  }
}

function isRest(pose: GlassContactPose, velocity: Point) {
  const settled = (value: number) => Math.abs(value) < 0.01
  return (
    settled(pose.x) &&
    settled(pose.y) &&
    settled(pose.width) &&
    settled(pose.height) &&
    settled(velocity.x) &&
    settled(velocity.y)
  )
}
