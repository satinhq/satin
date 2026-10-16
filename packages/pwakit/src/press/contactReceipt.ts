/** Existing release budgets, preserved separately from contact ownership. */
export const PRESS_CONTACT_CLICK_WINDOW_MS = 1_000
export const MENU_CONTACT_CLICK_WINDOW_MS = 750
export const TOGGLE_CONTACT_CLICK_WINDOW_MS = 350

type Gesture = { pointerId?: number; sequence: number; released: boolean }
type ContactReceipt = {
  gesture: Gesture
  owner: object
  deadline: number
  clear: () => void
  suppressTouchEnd?: boolean
  consumed?: () => void
  nativeLabel?: HTMLLabelElement
}
type ContactState = {
  sequence: number
  active: Map<number, Gesture>
  latestByPointer: Map<number, Gesture>
  latest?: Gesture
  receipts: Map<number, ContactReceipt>
  dispose: () => void
}
const states = new WeakMap<EventTarget, ContactState>()
const fallbackTarget = new EventTarget()
export function contactTarget(): EventTarget {
  return typeof document === 'undefined' ? fallbackTarget : document
}
function contactState(target: EventTarget): ContactState {
  const existing = states.get(target)
  if (existing) return existing
  const state: ContactState = {
    sequence: 0,
    active: new Map(),
    latestByPointer: new Map(),
    receipts: new Map(),
    dispose() {
      for (const [type, handler] of Object.entries(handlers))
        target.removeEventListener(type, handler, true)
      states.delete(target)
    },
  }
  const down = (event: Event) => {
    const pointerId = (event as PointerEvent).pointerId
    const gesture = { pointerId, sequence: ++state.sequence, released: false }
    state.active.set(pointerId, gesture)
    state.latestByPointer.set(pointerId, gesture)
    state.latest = gesture
  }
  const up = (event: Event) => {
    const pointerId = (event as PointerEvent).pointerId
    const gesture = state.active.get(pointerId)
    if (gesture) {
      gesture.released = true
      state.latest = gesture
      state.active.delete(pointerId)
      setTimeout(() => {
        if (state.latestByPointer.get(pointerId) === gesture)
          state.latestByPointer.delete(pointerId)
      }, PRESS_CONTACT_CLICK_WINDOW_MS)
    }
  }
  const click = (event: Event) => {
    const pointer = event as PointerEvent
    const receipt = takePhysicalContact(
      target,
      performance.now(),
      pointer.detail,
      pointer.pointerId,
    )
    if (!receipt) return
    // A switch already committed at UP may keep its trusted label default for the tick.
    // Retargeted clicks still lose their default, so another control cannot activate.
    if (!(
      receipt.nativeLabel &&
      event.target instanceof Node &&
      receipt.nativeLabel.contains(event.target)
    ))
      event.preventDefault()
    event.stopImmediatePropagation()
  }
  const touchEnd = (event: Event) => {
    const touches = (event as TouchEvent).changedTouches
    // Legacy EventTarget adapters have no touch list. On WebKit, prevent defaults
    // only while a menu receipt owns an ending contact, never for unrelated roles.
    const ownsEnd = [...state.receipts.values()].some(
      receipt =>
        receipt.suppressTouchEnd &&
        (!touches || (receipt.gesture === state.latest && receipt.gesture.released)),
    )
    if (ownsEnd) event.preventDefault()
  }
  const handlers = {
    pointerdown: down,
    pointerup: up,
    pointercancel: up,
    click,
    touchend: touchEnd,
  }
  for (const [type, handler] of Object.entries(handlers))
    target.addEventListener(type, handler, { capture: true, passive: false })
  states.set(target, state)
  return state
}

/** A receipt belongs to one pointer and one DOWN sequence. Later contacts cannot
 * erase it or spend it. Legacy WebKit mouse clicks have no usable pointer id;
 * those consume released receipts in release order, including after unmount.
 */
export function ownPhysicalContact(
  target: EventTarget,
  owner: object,
  windowMs: number,
  options: {
    now?: number
    pointerId?: number
    suppressTouchEnd?: boolean
    consumed?: () => void
    nativeLabel?: HTMLLabelElement
  } = {},
): void {
  const state = contactState(target)
  const pointerId = options.pointerId ?? state.latest?.pointerId
  const previous = [...state.receipts.values()].findLast(
    receipt => receipt.gesture.pointerId === pointerId && receipt.owner === owner,
  )
  const gesture = state.active.get(pointerId!) ??
    (state.latest?.pointerId === pointerId ? state.latest : undefined) ??
    previous?.gesture ?? {
      pointerId,
      sequence: ++state.sequence,
      released: Number.isFinite(windowMs),
    }
  state.latest = gesture
  if (pointerId !== undefined) state.latestByPointer.set(pointerId, gesture)
  if (!gesture.released && pointerId !== undefined) state.active.set(pointerId, gesture)
  state.receipts.get(gesture.sequence)?.clear()
  let timer: ReturnType<typeof setTimeout> | undefined
  const clear = () => {
    clearTimeout(timer)
    state.receipts.delete(gesture.sequence)
    if (pointerId !== undefined && state.latestByPointer.get(pointerId) === gesture)
      state.latestByPointer.delete(pointerId)
  }
  state.receipts.set(gesture.sequence, {
    gesture,
    owner,
    deadline: (options.now ?? performance.now()) + windowMs,
    clear,
    suppressTouchEnd: options.suppressTouchEnd,
    consumed: options.consumed,
    nativeLabel: options.nativeLabel,
  })
  if (Number.isFinite(windowMs)) {
    gesture.released = true
    if (pointerId !== undefined && state.active.get(pointerId) === gesture)
      state.active.delete(pointerId)
    timer = setTimeout(clear, windowMs)
  }
}

/** Adapters can also consume when a development EventTarget does not bubble. */
function takePhysicalContact(
  target: EventTarget,
  now: number,
  detail: number,
  pointerId?: number,
): ContactReceipt | undefined {
  if (detail === 0) return
  const state = states.get(target)
  const candidates = [...(state?.receipts.values() ?? [])]
  const knownGesture = pointerId === undefined ? undefined : state?.latestByPointer.get(pointerId)
  if (knownGesture && !state?.receipts.has(knownGesture.sequence)) return
  for (const receipt of candidates) if (now > receipt.deadline) receipt.clear()
  const receipt = candidates.find(
    receipt =>
      now <= receipt.deadline &&
      (pointerId !== undefined && pointerId !== 0 && pointerId !== -1
        ? receipt.gesture.pointerId === pointerId ||
          receipt.gesture.pointerId === undefined ||
          !knownGesture
        : receipt.gesture.released),
  )
  if (!receipt) return
  receipt.clear()
  receipt.consumed?.()
  return receipt
}

export function consumePhysicalContact(
  target: EventTarget,
  now: number,
  detail: number,
  pointerId?: number,
): boolean {
  return !!takePhysicalContact(target, now, detail, pointerId)
}

/** Explicit cancellation affects only this owner, including all its contacts. */
export function retirePhysicalContact(target: EventTarget, owner?: object): void {
  const state = states.get(target)
  if (!state) return
  for (const receipt of state.receipts.values())
    if (!owner || receipt.owner === owner) receipt.clear()
  if (!owner) state.dispose()
}

const menuOwner = {}
export function ownMenuCompatibilityClick(target: EventTarget, pointerId?: number): void {
  ownPhysicalContact(target, menuOwner, MENU_CONTACT_CLICK_WINDOW_MS, {
    pointerId,
    suppressTouchEnd: true,
  })
}

const pressOwner = {}
export function armPointerClickSuppression(now: number, pointerId?: number): void {
  ownPhysicalContact(contactTarget(), pressOwner, PRESS_CONTACT_CLICK_WINDOW_MS, { now, pointerId })
}
export function consumePointerClickSuppression(now: number, detail = 1): boolean {
  return consumePhysicalContact(contactTarget(), now, detail)
}
export function resetPointerClickSuppression(): void {
  retirePhysicalContact(contactTarget())
}
