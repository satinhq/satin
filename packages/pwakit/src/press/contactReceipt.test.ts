// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { WorkerMinimize } from '../glass/webgpu/minimize.ts'
import type { RuntimeOptions } from '../glass/renderSpecs.ts'
import {
  ownPhysicalContact,
  consumePhysicalContact,
  retirePhysicalContact,
  PRESS_CONTACT_CLICK_WINDOW_MS,
  MENU_CONTACT_CLICK_WINDOW_MS,
  TOGGLE_CONTACT_CLICK_WINDOW_MS,
} from './contactReceipt.ts'

afterEach(() => vi.useRealTimers())
function click(target: EventTarget, detail = 1, pointerId = 99) {
  const event = Object.assign(new Event('click', { cancelable: true }), { detail, pointerId })
  target.dispatchEvent(event)
  return event
}
it.each([
  PRESS_CONTACT_CLICK_WINDOW_MS,
  MENU_CONTACT_CLICK_WINDOW_MS,
  TOGGLE_CONTACT_CLICK_WINDOW_MS,
])('preserves the named %i ms deadline and consumes once', budget => {
  vi.useFakeTimers()
  const target = new EventTarget()
  ownPhysicalContact(target, {}, budget, { now: 100 })
  expect(consumePhysicalContact(target, 100 + budget, 1)).toBe(true)
  expect(consumePhysicalContact(target, 100 + budget, 1)).toBe(false)
  ownPhysicalContact(target, {}, budget, { now: 100 })
  expect(consumePhysicalContact(target, 101 + budget, 1)).toBe(false)
})
it('owns retargeted mouse clicks after unmount or modal opening', () => {
  const target = new EventTarget()
  const unmountedOwner = {}
  ownPhysicalContact(target, unmountedOwner, 750)
  expect(click(target, 0).defaultPrevented).toBe(false)
  expect(click(target, 1, 0).defaultPrevented).toBe(true)
  expect(click(target).defaultPrevented).toBe(false)
})
it('does not block another document', () => {
  const target = new EventTarget()
  const other = new EventTarget()
  ownPhysicalContact(target, {}, 750)
  expect(click(other).defaultPrevented).toBe(false)
  expect(click(target).defaultPrevented).toBe(true)
})
it('replacement cancels the old timer and cancellation respects the owner', () => {
  vi.useFakeTimers()
  const target = new EventTarget()
  const oldOwner = {}
  const owner = {}
  ownPhysicalContact(target, oldOwner, 350)
  vi.advanceTimersByTime(300)
  ownPhysicalContact(target, owner, 1000)
  retirePhysicalContact(target, oldOwner)
  vi.advanceTimersByTime(100)
  expect(click(target).defaultPrevented).toBe(true)
  ownPhysicalContact(target, owner, 1000)
  retirePhysicalContact(target, owner)
  expect(click(target).defaultPrevented).toBe(false)
})
it('expires a held menu only after its explicit release or cancel budget', () => {
  vi.useFakeTimers()
  const target = new EventTarget()
  const owner = {}
  const consumed = vi.fn()
  ownPhysicalContact(target, owner, Infinity)
  vi.advanceTimersByTime(10000)
  ownPhysicalContact(target, owner, 750, { consumed })
  vi.advanceTimersByTime(749)
  expect(click(target).defaultPrevented).toBe(true)
  expect(consumed).toHaveBeenCalledOnce()
  ownPhysicalContact(target, owner, 750)
  vi.advanceTimersByTime(750)
  expect(click(target).defaultPrevented).toBe(false)
})
it('prevents touchend only when the contact owner explicitly requests it', () => {
  const target = new EventTarget()
  ownPhysicalContact(target, {}, 750)
  const ordinary = new Event('touchend', { cancelable: true })
  target.dispatchEvent(ordinary)
  expect(ordinary.defaultPrevented).toBe(false)
  ownPhysicalContact(target, {}, 750, { suppressTouchEnd: true })
  const owned = new Event('touchend', { cancelable: true })
  target.dispatchEvent(owned)
  expect(owned.defaultPrevented).toBe(true)
  retirePhysicalContact(target)
})

it('restores the compact bar once without clicking the row revealed underneath', () => {
  const dock = document.createElement('div')
  const row = document.createElement('button')
  document.body.append(dock, row)
  const activate = vi.fn()
  row.addEventListener('click', activate)
  const restore = vi.fn(() => button.remove())
  new WorkerMinimize(
    {
      geometry: { dockX: 0, dockY: 0 },
      elements: { chrome: { dock } },
    } as unknown as RuntimeOptions,
    restore,
    { begin() {}, move() {}, end() {} },
  )
  const button = document.querySelector<HTMLButtonElement>('[aria-label="Show tab bar"]')!
  button.hidden = false
  button.setPointerCapture = () => {}
  button.hasPointerCapture = () => false
  for (const type of ['pointerdown', 'pointerup'])
    button.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 4,
        isPrimary: true,
        button: 0,
      }),
    )
  row.dispatchEvent(
    new PointerEvent('click', { bubbles: true, cancelable: true, detail: 1, pointerId: 4 }),
  )
  expect(restore).toHaveBeenCalledTimes(1)
  expect(activate).not.toHaveBeenCalled()
  dock.remove()
  row.remove()
  retirePhysicalContact(document)
})
