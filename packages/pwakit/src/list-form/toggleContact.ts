import {
  CONTROL_LIFT,
  CONTROL_THUMB_POSITION,
  controlLiftProfile,
} from '../glass/lens/controlLift.ts'
import { InteractivePress } from '../glass/lens/interactivePress.ts'
import { SCROLL_PRESS_SLOP_PX } from '../scroll/pressOwnership.ts'

/** The native Toggle thumb travels 22 pt between its ends (63 × 28 pt track, 37 × 24 pt thumb). */
export const TOGGLE_TRAVEL_PT = 22
/** Horizontal movement that turns a contact into a drag. Not a native measurement: small enough
 * that the thumb follows from the first visible movement, large enough to absorb tap jitter. */
const DRAG_SLOP_PX = 4

type Contact = {
  pointerId: number
  x: number
  y: number
  ownsVertical: boolean
  checked: boolean
  from: number
  downAt: number
  dragging: boolean
  /** The thumb passed the middle of its travel during this drag. */
  crossed: boolean
  lastX: number
  lastAt: number
  velocity: number
}

export type ToggleFrame = Readonly<{
  /** Thumb position: 0 at the off end, 1 at the on end. */
  position: number
  /** Lens lift: 0 is the white resting thumb, 1 the held lens (the springs overshoot). */
  lift: number
  /** The side the dragged thumb is on; undefined without a drag. */
  side?: boolean
}>

/**
 * One Toggle contact transaction: pressed (white thumb) → lifted after a stationary hold or as a
 * drag starts → dragging (the thumb follows the finger) → settling. The page owns the logical
 * value and the thumb position; the glass lens follows them. Times are epoch milliseconds.
 */
export class ToggleContact {
  private readonly position = new InteractivePress(CONTROL_THUMB_POSITION)
  private readonly liftSpring = new InteractivePress(controlLiftProfile('toggle'))
  private contact?: Contact
  private lifted = false
  /** Reduce Motion: the thumb jumps to its end and the lens never lifts. */
  reducedMotion = false
  constructor(checked: boolean, at: number) {
    this.position.place(checked ? 1 : 0, 0, at)
  }
  get active() {
    return this.contact !== undefined
  }
  get isLifted() {
    return this.lifted
  }
  get dragging() {
    return !!this.contact?.dragging
  }
  /** The lens is due to lift: the contact has been held for the native activation time, or it
   * became a drag first. (Native evidence covers stationary holds only; lifting a fast drag at once
   * keeps the dragged thumb from sliding as a white pill. Pending a native early-drag capture.) */
  liftDue(at: number) {
    const contact = this.contact
    if (!contact || this.lifted) return false
    return contact.dragging || at - contact.downAt >= CONTROL_LIFT.activationMs - 1
  }
  get needsFrame() {
    return (
      (!!this.contact && !this.lifted) || this.position.needsFrame || this.liftSpring.needsFrame
    )
  }
  /** A value change from outside a contact (tap commit, keyboard, assistive technology, app). */
  setChecked(checked: boolean, at: number, animate: boolean) {
    if (this.contact) return
    if (!animate) this.position.place(checked ? 1 : 0, 0, at)
    else this.settle(checked, 0, at)
  }
  down(
    pointerId: number,
    x: number,
    y: number,
    checked: boolean,
    at: number,
    ownsVertical = false,
  ) {
    this.position.sample(at)
    const from = this.position.amount
    this.position.place(from, 0, at)
    this.contact = {
      pointerId,
      x,
      y,
      ownsVertical,
      checked,
      from,
      downAt: at,
      dragging: false,
      crossed: false,
      lastX: x,
      lastAt: at,
      velocity: 0,
    }
  }
  /** `vertical`: the contact moved vertically first; the page's scroll owns it. */
  move(pointerId: number, x: number, y: number, at: number): 'drag' | 'vertical' | undefined {
    const contact = this.contact
    if (!contact || contact.pointerId !== pointerId) return
    const dx = x - contact.x
    const dy = y - contact.y
    if (!contact.dragging) {
      // The switch and its scroll surface must agree on when tremor becomes a pan.
      if (
        !contact.ownsVertical &&
        Math.abs(dy) >= SCROLL_PRESS_SLOP_PX &&
        Math.abs(dy) >= Math.abs(dx)
      )
        return 'vertical'
      if (Math.abs(dx) <= DRAG_SLOP_PX) return
      contact.dragging = true
    }
    const position = Math.min(1, Math.max(0, contact.from + dx / TOGGLE_TRAVEL_PT))
    if (position >= 0.5 !== contact.from >= 0.5) contact.crossed = true
    const elapsed = (at - contact.lastAt) / 1000
    if (elapsed > 0) {
      const instant = (position - this.position.amount) / elapsed
      // A short exponential average keeps the release velocity from one jittered sample.
      contact.velocity = contact.velocity * 0.4 + instant * 0.6
    }
    contact.lastX = x
    contact.lastAt = at
    this.position.place(position, 0, at)
    return 'drag'
  }
  /** Start the lens lift (the page calls this once the lens can be shown in this frame). */
  lift(at: number) {
    if (!this.contact || this.lifted) return
    this.lifted = true
    this.liftSpring.down(at)
  }
  /**
   * End the contact. Returns the committed value. A drag that crossed the middle commits the side
   * it is released on; any other contact (tap, hold, a drag that stayed on its side) toggles. That
   * rule reproduces every native receipt so far (native control measurements `toggle-value-trials.json`:
   * ±10/±14 pt crossings and same-side 14/35 pt drags all toggled); it is not a measured threshold.
   */
  up(pointerId: number, at: number): { value: boolean; dragged: boolean } | undefined {
    const contact = this.contact
    if (!contact || contact.pointerId !== pointerId) return
    this.contact = undefined
    const value = contact.crossed ? this.position.amount >= 0.5 : !contact.checked
    // Release owns the value and its motion. A compatibility click is optional on WebKit.
    const velocity = contact.dragging && at - contact.lastAt < 50 ? contact.velocity : 0
    this.settle(value, velocity, at)
    this.release(at)
    return { value, dragged: contact.dragging }
  }
  /** The browser took the contact (a vertical scroll) or it was retired: no value change. */
  cancel(at: number) {
    const contact = this.contact
    if (!contact) return
    this.contact = undefined
    this.settle(contact.checked, 0, at)
    this.release(at)
  }
  /** Spring the thumb from where it is (and how fast it moves) to the end of `value`. */
  private settle(value: boolean, velocity: number, at: number) {
    this.position.sample(at)
    if (this.reducedMotion) {
      this.position.place(value ? 1 : 0, 0, at)
      return
    }
    this.position.place(this.position.amount, velocity, at)
    if (value) this.position.down(at)
    else this.position.up(at)
  }
  private release(at: number) {
    if (this.lifted) this.liftSpring.up(at)
    this.lifted = false
  }
  sample(at: number): ToggleFrame {
    const position = this.position.sample(at)
    return {
      position,
      lift: this.liftSpring.sample(at, this.reducedMotion),
      side: this.contact?.dragging ? position >= 0.5 : undefined,
    }
  }
}
