import {
  observePointerPressCancellation,
  type OwnedTouchHandoff,
  type OwnedGesture,
} from '../press/gestureArbitration.ts'
import type { GlassInteraction } from './rendererContract.ts'

/**
 * The one contact path of interactive glass in the document.
 *
 * Every interactive glass surface (glass Buttons of every shape, toolbar items and groups, the
 * back/close/sidebar chrome buttons, menu triggers, text fields, app `Glass.interactive()`
 * surfaces) feeds the renderer through a GlassContact: the glass tracks the physical finger from
 * down to up, and the renderer's InteractiveContact turns it into light, growth, follow, squish
 * and release with the kind's row of GLASS_CONTACT_PHYSICS.
 *
 * The control inside the glass (a Pressable) reads the same physical contact: both see the same
 * pointer events, and a gesture that claims the touch (a scroll, a menu's hold) cancels both
 * through the shared press arbitration (`cancelPointerPressForOwnedGesture`). There is no second
 * path that relays the control's press state to the glass.
 *
 * Like pointer capture, the contact follows its pointer after it leaves the glass (document
 * listeners filtered by pointer id). It never calls `setPointerCapture`: an explicit capture keeps
 * WebKit's control recognizer alive after a scroll view has won the pan.
 */
export type GlassContactPhase = GlassInteraction['phase']

/**
 * Why a contact ended: the finger lifted (`up`), the browser cancelled the touch (`cancel`), a
 * gesture claimed it (`gesture`: a scroll, a sheet's pan, the back swipe), or the contact was
 * cleared at once (`clear`: window blur, unmount, a new contact).
 */
export type GlassContactEnd = 'up' | 'cancel' | 'gesture' | 'clear'

export type GlassContactOptions = Readonly<{
  /** Sends one input: `point` is the finger in client px (absent at rest and on a cancel); `end`
   * says why a `releasing`/`rest` input ended the contact. */
  send: (
    phase: GlassContactPhase,
    point: { x: number; y: number } | undefined,
    epoch: number,
    end?: GlassContactEnd,
  ) => void
  /**
   * Whether a gesture that claims this touch ends the contact. By default every claim does: the
   * glass springs back as the control's tap cancels. A glass button that lets the back swipe
   * through stays pressed while the page moves (native); a Toggle or Slider thumb that is already
   * dragging keeps its finger.
   */
  yieldsTo?: (owner: OwnedGesture) => boolean
  /** Thumb controls retain a recognized drag before WebKit cancels pointer delivery.
   * Ordinary glass never claims a native pan. The pointer stream still owns all samples. */
  ownsNativePan?: () => boolean
}>

/** Touches already taken by a glass: the innermost interactive glass owns a contact. */
const claimedEvents = new WeakSet<Event>()

export class GlassContact {
  private readonly options: GlassContactOptions
  private pointerId: number | undefined
  private stopObservingCancellation: (() => void) | undefined
  private listening: Document | undefined
  private handoff: OwnedTouchHandoff | undefined
  private touchTarget: EventTarget | null = null
  private enabledControl: HTMLElement | undefined
  private disabledObserver: MutationObserver | undefined

  constructor(options: GlassContactOptions) {
    this.options = options
  }

  get active() {
    return this.pointerId !== undefined
  }

  /**
   * A pointer went down on the glass. Starts the contact unless a glass nested inside this one
   * already took the touch, or the pointer is not a primary press. Returns whether it started.
   */
  down(event: PointerEvent, document: Document, control?: HTMLElement) {
    if (!event.isPrimary || event.button !== 0 || event.defaultPrevented) return false
    if (control && this.disabled(control)) return false
    if (claimedEvents.has(event)) return false
    claimedEvents.add(event)
    this.end('rest')
    this.pointerId = event.pointerId
    this.listening = document
    this.touchTarget = event.target
    if (this.options.ownsNativePan)
      document.addEventListener('touchmove', this.retainNativePan, {
        capture: true,
        passive: false,
      })
    this.enabledControl = control
    if (control) {
      this.disabledObserver = new MutationObserver(this.checkEnabled)
      this.disabledObserver.observe(control, {
        attributes: true,
        attributeFilter: ['disabled', 'aria-disabled'],
      })
    }
    document.addEventListener('pointermove', this.handleMove, true)
    document.addEventListener('pointerup', this.handleUp, true)
    document.addEventListener('pointercancel', this.handleCancel, true)
    document.defaultView?.addEventListener('blur', this.handleBlur)
    // A scroll or a menu's hold that claims this touch ends the glass's contact with the
    // control's press: the glass springs back rather than vanishing.
    this.stopObservingCancellation = observePointerPressCancellation(
      event.pointerId,
      (owner, handoff) => {
        if (this.options.yieldsTo?.(owner) ?? true) {
          this.end('releasing', undefined, 'gesture')
          return
        }
        if (owner === 'back-swipe' && handoff && !handoff.retired.aborted) {
          this.handoff?.retired.removeEventListener('abort', this.handleRetirement)
          this.handoff = handoff
          document.addEventListener('touchmove', this.handleTouchMove, {
            capture: true,
            passive: true,
          })
          document.addEventListener('touchend', this.handleTouchEnd, true)
          document.addEventListener('touchcancel', this.handleTouchEnd, true)
          handoff.retired.addEventListener('abort', this.handleRetirement, { once: true })
        }
        return false
      },
    )
    this.send('pressed', event)
    return true
  }

  /** Ends the contact: `releasing` springs back and fades, `rest` clears at once. */
  end(
    phase: 'releasing' | 'rest',
    event?: Pick<PointerEvent, 'clientX' | 'clientY'>,
    cause: GlassContactEnd = phase === 'rest' ? 'clear' : event ? 'up' : 'cancel',
  ) {
    if (this.pointerId === undefined) return
    this.pointerId = undefined
    this.handoff?.retired.removeEventListener('abort', this.handleRetirement)
    this.handoff = undefined
    this.disabledObserver?.disconnect()
    this.disabledObserver = undefined
    this.enabledControl = undefined
    this.stopObservingCancellation?.()
    this.stopObservingCancellation = undefined
    const document = this.listening
    this.listening = undefined
    document?.removeEventListener('touchmove', this.retainNativePan, true)
    this.touchTarget = null
    document?.removeEventListener('touchmove', this.handleTouchMove, true)
    document?.removeEventListener('touchend', this.handleTouchEnd, true)
    document?.removeEventListener('touchcancel', this.handleTouchEnd, true)
    document?.removeEventListener('pointermove', this.handleMove, true)
    document?.removeEventListener('pointerup', this.handleUp, true)
    document?.removeEventListener('pointercancel', this.handleCancel, true)
    document?.defaultView?.removeEventListener('blur', this.handleBlur)
    this.send(phase, event, cause)
  }

  private send(
    phase: GlassContactPhase,
    event: Pick<PointerEvent, 'clientX' | 'clientY'> | undefined,
    end?: GlassContactEnd,
  ) {
    const point = event ? { x: event.clientX, y: event.clientY } : undefined
    this.options.send(phase, point, performance.timeOrigin + performance.now(), end)
  }

  private readonly handleMove = (event: PointerEvent) => {
    this.checkEnabled()
    if (!this.handoff && event.pointerId === this.pointerId) this.send('dragging', event)
  }

  private readonly handleUp = (event: PointerEvent) => {
    if (event.pointerId === this.pointerId) this.end('releasing', event)
  }

  private readonly handleCancel = (event: PointerEvent) => {
    // A cancel's coordinates are not a finger position (WebKit can report 0, 0).
    if (!this.handoff && event.pointerId === this.pointerId)
      this.end('releasing', undefined, 'cancel')
  }

  private disabled(control: HTMLElement) {
    return control.matches(':disabled') || control.getAttribute('aria-disabled') === 'true'
  }

  private readonly checkEnabled = () => {
    if (this.enabledControl && this.disabled(this.enabledControl)) this.end('rest')
  }

  private readonly retainNativePan = (event: TouchEvent) => {
    // pan-y alone does not keep iOS WebKit's recognizer from cancelling a horizontal
    // control drag. Claim only the matching, single thumb touch once its model owns it.
    // A back-swipe handoff already belongs to WebKit's scrolling tree and stays native.
    if (
      this.active &&
      !this.handoff &&
      event.cancelable &&
      event.touches.length === 1 &&
      event.touches[0]?.target === this.touchTarget &&
      this.options.ownsNativePan?.()
    )
      event.preventDefault()
  }

  private owningTouch(event: TouchEvent) {
    return Array.from(event.changedTouches).find(
      touch => touch.identifier === this.handoff?.touchIdentifier,
    )
  }

  private readonly handleTouchMove = (event: TouchEvent) => {
    this.checkEnabled()
    const touch = this.owningTouch(event)
    if (touch) this.send('dragging', touch)
  }

  private readonly handleTouchEnd = (event: TouchEvent) => {
    const touch = this.owningTouch(event)
    if (touch)
      this.end(
        'releasing',
        event.type === 'touchend' ? touch : undefined,
        event.type === 'touchend' ? 'up' : 'cancel',
      )
  }

  private readonly handleRetirement = () => this.end('releasing', undefined, 'gesture')

  private readonly handleBlur = () => this.end('rest')
}
