import { CONTROL_LIFT, controlLiftProfile } from '../glass/lens/controlLift.ts'
import { InteractivePress } from '../glass/lens/interactivePress.ts'

/** Horizontal movement that turns a contact into a drag (the Toggle's slop, not a native value). */
const DRAG_SLOP_PX = 4

type Contact = {
  pointerId: number
  x: number
  y: number
  ownsVertical: boolean
  /** Thumb position when the finger landed (0 at the minimum end, 1 at the maximum end). */
  from: number
  downAt: number
  dragging: boolean
}

export type SliderFrame = Readonly<{
  /** Thumb position: 0 at the minimum end, 1 at the maximum end. */
  position: number
  /** Lens lift: 0 is the white resting thumb, 1 the held lens (the springs overshoot). */
  lift: number
}>

/**
 * One Slider contact transaction: pressed (white thumb) → lifted after the native stationary hold
 * (CONTROL_LIFT.activationMs) or as a drag starts → dragging (the thumb follows the finger,
 * snapped to `snap`'s positions) → the lens restores on release. The thumb stays where it was
 * released: a Slider has no ends to settle to. Times are epoch milliseconds.
 */
export class SliderContact {
  private readonly liftSpring = new InteractivePress(controlLiftProfile('slider'))
  private contact?: Contact
  private lifted = false
  private position: number
  /** Reduce Motion: the lens never lifts. */
  reducedMotion = false
  constructor(position: number) {
    this.position = position
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
  /** Same activation rule as the Toggle: native evidence covers stationary holds only. */
  liftDue(at: number) {
    const contact = this.contact
    if (!contact || this.lifted) return false
    return contact.dragging || at - contact.downAt >= CONTROL_LIFT.activationMs - 1
  }
  get needsFrame() {
    return !!this.contact || this.liftSpring.needsFrame
  }
  /** A value from outside a drag (keyboard, assistive technology, the app). */
  setPosition(position: number) {
    if (!this.contact?.dragging) this.position = position
  }
  down(pointerId: number, x: number, y: number, at: number, ownsVertical = false) {
    this.contact = {
      pointerId,
      x,
      y,
      ownsVertical,
      from: this.position,
      downAt: at,
      dragging: false,
    }
  }
  /**
   * `travel` is the thumb's travel in CSS px; `snap` maps a raw position to a shown one (steps).
   * Returns `vertical` when the contact moved vertically first: the page's scroll owns it.
   */
  move(
    pointerId: number,
    x: number,
    y: number,
    travel: number,
    snap: (position: number) => number,
  ): 'drag' | 'vertical' | undefined {
    const contact = this.contact
    if (!contact || contact.pointerId !== pointerId) return
    const dx = x - contact.x
    const dy = y - contact.y
    if (!contact.dragging) {
      if (!contact.ownsVertical && Math.abs(dy) > DRAG_SLOP_PX && Math.abs(dy) > Math.abs(dx))
        return 'vertical'
      if (Math.abs(dx) <= DRAG_SLOP_PX) return
      contact.dragging = true
    }
    const raw = travel > 0 ? contact.from + dx / travel : contact.from
    this.position = snap(Math.min(1, Math.max(0, raw)))
    return 'drag'
  }
  /** Start the lens lift (the page calls this once the lens can be shown in this frame). */
  lift(at: number) {
    if (!this.contact || this.lifted) return
    this.lifted = true
    this.liftSpring.down(at)
  }
  /** End the contact (release, cancel or a vertical scroll). Returns whether it dragged. */
  end(at: number) {
    const contact = this.contact
    if (!contact) return false
    this.contact = undefined
    if (this.lifted) this.liftSpring.up(at)
    this.lifted = false
    return contact.dragging
  }
  sample(at: number): SliderFrame {
    return { position: this.position, lift: this.liftSpring.sample(at, this.reducedMotion) }
  }
}
