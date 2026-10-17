import { animateElement } from '../motion/animate.ts'
import { isRowMove } from './rowMotion.ts'
import { sampledKeyframes, springMotion, springTrack } from '../motion/springTrack.ts'
import { REORDER_DROP_SHADOW_MS, REORDER_SPRING } from './editMotion.ts'

/**
 * Drag-to-reorder for one `ForEach` in a section, started from a row's reorder handle.
 *
 * The lifted row follows the finger, unscaled, with a soft shadow; the rows it crosses slide out
 * of its way on the measured spring. Releasing settles the row into its slot and reports one move;
 * a cancelled contact puts every row back and reports nothing. Native lets a dragged row cross a
 * `moveDisabled` row (the disabled row only lacks a handle), so every row of the group is a slot.
 */
export type ReorderDrag = Readonly<{ cancel(): void }>

type Slot = { element: HTMLElement; top: number; height: number; shift: number }

/** Distance from the scroll view's edge where a held row starts scrolling it, and the top speed. */
const AUTOSCROLL_EDGE = 60
const AUTOSCROLL_MAX_SPEED = 12

export function startReorderDrag({
  item,
  pointer,
  onCommit,
  onEnd,
}: {
  item: HTMLElement
  pointer: PointerEvent
  /** The dragged row's index and its destination index among the group's rows. */
  onCommit(from: number, to: number): void
  onEnd(): void
}): ReorderDrag {
  const group = item.dataset.satinReorderGroup
  const slots: Slot[] = [...(item.parentElement?.children ?? [])]
    .filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement && element.dataset.satinReorderGroup === group,
    )
    .map(element => {
      element.getAnimations().forEach(animation => animation.cancel())
      element.style.transform = ''
      const rect = element.getBoundingClientRect()
      return { element, top: rect.top, height: rect.height, shift: 0 }
    })
  const from = slots.findIndex(slot => slot.element === item)
  const dragged = slots[from]
  const scroller = item.closest<HTMLElement>('[data-satin-scroll]')
  const startScroll = scroller?.scrollTop ?? 0
  let pointerY = pointer.clientY
  let offset = 0
  let to = from
  let frame = 0
  let finished = false

  item.dataset.satinReorderLifted = 'true'

  const scrolled = () => (scroller?.scrollTop ?? 0) - startScroll

  const place = () => {
    const first = slots[0]
    const last = slots[slots.length - 1]
    const raw = pointerY - pointer.clientY + scrolled()
    offset = Math.min(
      Math.max(raw, first.top - dragged.top),
      last.top + last.height - (dragged.top + dragged.height),
    )
    item.style.transform = `translate3d(0, ${offset}px, 0)`
    to = destinationIndex(slots, from, dragged.top + offset + dragged.height / 2)
    slots.forEach((slot, index) => {
      if (index === from) return
      const shift =
        from < to && index > from && index <= to
          ? -dragged.height
          : to < from && index >= to && index < from
            ? dragged.height
            : 0
      if (shift !== slot.shift) slideTo(slot, shift)
    })
  }

  const autoscroll = () => {
    frame = 0
    if (!scroller || finished) return
    const bounds = scroller.getBoundingClientRect()
    const speed =
      pointerY < bounds.top + AUTOSCROLL_EDGE
        ? -edgeSpeed(bounds.top + AUTOSCROLL_EDGE - pointerY)
        : pointerY > bounds.bottom - AUTOSCROLL_EDGE
          ? edgeSpeed(pointerY - (bounds.bottom - AUTOSCROLL_EDGE))
          : 0
    if (!speed) return
    scroller.scrollTop += speed
    place()
    frame = requestAnimationFrame(autoscroll)
  }

  const move = (event: PointerEvent) => {
    if (event.pointerId !== pointer.pointerId) return
    event.preventDefault()
    pointerY = event.clientY
    place()
    if (!frame) frame = requestAnimationFrame(autoscroll)
  }

  const finish = (commit: boolean) => {
    if (finished) return
    finished = true
    cancelAnimationFrame(frame)
    window.removeEventListener('pointermove', move, true)
    window.removeEventListener('pointerup', release, true)
    window.removeEventListener('pointercancel', cancelContact, true)
    const destination = commit ? to : from
    const target = commit ? slotOffset(slots, from, to) : 0
    if (!commit) slots.forEach((slot, index) => index !== from && slideTo(slot, 0))
    const settle = settleTo(item, offset, target)
    fadeShadow(item)
    void settle.finished.then(
      () => {
        delete item.dataset.satinReorderLifted
        if (destination !== from) onCommit(from, destination)
        else resetSlots(slots)
        onEnd()
      },
      () => {},
    )
  }
  const release = (event: PointerEvent) => {
    if (event.pointerId === pointer.pointerId) finish(true)
  }
  const cancelContact = (event: PointerEvent) => {
    if (event.pointerId === pointer.pointerId) finish(false)
  }

  window.addEventListener('pointermove', move, true)
  window.addEventListener('pointerup', release, true)
  window.addEventListener('pointercancel', cancelContact, true)
  return {
    cancel() {
      if (finished) return
      finish(false)
    },
  }
}

/** Clears the transforms a drag left once the list has rendered its new order. */
export function resetReorderTransforms(parent: Element) {
  parent.querySelectorAll<HTMLElement>(':scope > [data-satin-reorder-group]').forEach(element => {
    element
      .getAnimations()
      .filter(animation => !isRowMove(animation))
      .forEach(animation => animation.cancel())
    element.style.transform = ''
  })
}

function resetSlots(slots: Slot[]) {
  for (const slot of slots) {
    slot.element.getAnimations().forEach(animation => animation.cancel())
    slot.element.style.transform = ''
    slot.shift = 0
  }
}

/** The slot whose midpoint the dragged row's centre has crossed. */
function destinationIndex(slots: Slot[], from: number, centre: number) {
  let to = from
  for (let index = from + 1; index < slots.length; index++) {
    if (centre > slots[index].top + slots[index].height / 2) to = index
  }
  for (let index = from - 1; index >= 0; index--) {
    if (centre < slots[index].top + slots[index].height / 2) to = index
  }
  return to
}

/** How far the dragged row moves to sit in slot `to` once the rows between have made room. */
function slotOffset(slots: Slot[], from: number, to: number) {
  if (to > from) return slots[to].top + slots[to].height - (slots[from].top + slots[from].height)
  if (to < from) return slots[to].top - slots[from].top
  return 0
}

function edgeSpeed(depth: number) {
  return Math.min(AUTOSCROLL_MAX_SPEED, (depth / AUTOSCROLL_EDGE) * AUTOSCROLL_MAX_SPEED)
}

/** Moves a crossed row to its new shift from wherever it is now drawn. */
function slideTo(slot: Slot, shift: number) {
  const presented = presentedOffset(slot.element)
  slot.element.getAnimations().forEach(animation => animation.cancel())
  slot.shift = shift
  slot.element.style.transform = shift ? `translate3d(0, ${shift}px, 0)` : ''
  if (presented === shift) return
  const track = springTrack(springMotion(REORDER_SPRING))
  animateElement(
    slot.element,
    sampledKeyframes(track, progress => ({
      transform: `translate3d(0, ${presented + (shift - presented) * progress}px, 0)`,
    })),
    { duration: track.duration },
  )
}

function settleTo(item: HTMLElement, from: number, to: number) {
  const track = springTrack(springMotion(REORDER_SPRING))
  item.style.transform = `translate3d(0, ${to}px, 0)`
  return animateElement(
    item,
    sampledKeyframes(track, progress => ({
      transform: `translate3d(0, ${from + (to - from) * progress}px, 0)`,
    })),
    { duration: track.duration },
  )
}

/** The lifted shadow is a CSS custom property's opacity, so it fades without repainting text. */
function fadeShadow(item: HTMLElement) {
  item.dataset.satinReorderDropping = 'true'
  const animation = animateElement(item, [{ opacity: 1 }, { opacity: 0 }], {
    duration: REORDER_DROP_SHADOW_MS,
    easing: 'ease-out',
    pseudoElement: '::before',
  })
  const done = () => delete item.dataset.satinReorderDropping
  void animation.finished.then(done, done)
}

/** The vertical translation a running animation currently draws. */
function presentedOffset(element: HTMLElement) {
  const transform = getComputedStyle(element).transform
  if (!transform || transform === 'none') return 0
  return new DOMMatrixReadOnly(transform).m42
}
