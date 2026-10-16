// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { focusFromFramework } from '../focus/programmaticFocus.ts'
import { editable } from './adapter.ts'
import { installModalTapFocus } from './modalTapFocus.ts'

// Recorded on the installed iPad (1366 x 1024, iOS 27.0), the alert's text field, real touches
// (scratch evidence kb6/evidence: base1, own1, modes1, modes2):
// - a 450 ms tap: pointerdown 0, focusin 465 (WebKit's mouse press), keyboard 601 with the visual
//   viewport panned 238.5 pt in the same event;
// - a 700 ms press: pointerdown 0, focusin 695 (no mouse press, no click), same 238.5 pt pan;
// - with the mouse press prevented and the editor focused with preventScroll: no pan (0 of 1);
// - with the focus repeated with preventScroll inside the long press's focusin: no pan (0 of 3).
// The assertions on focus({ preventScroll: true }) in this file test the mechanism the device runs
// above measured; happy-dom cannot pan, so they do not show the behaviour themselves.
const SLOW_TAP_MS = 450

const disposals: (() => void)[] = []
let now = 0
afterEach(() => {
  disposals.splice(0).forEach(dispose => dispose())
  document.body.replaceChildren()
  vi.restoreAllMocks()
  now = 0
})

function fixture({ keyboardShowing = () => true }: { keyboardShowing?: () => boolean } = {}) {
  const root = document.createElement('div')
  root.innerHTML = `
    <dialog open>
      <label for="name">Name</label>
      <input id="name" value="Hello world">
      <input id="second" value="Second">
    </dialog>
    <input id="page" value="On the page">`
  document.body.append(root)
  const onTapFocus = vi.fn()
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  disposals.push(installModalTapFocus(root, editable, onTapFocus, keyboardShowing))
  const documentWithCaret = document as Document & { caretRangeFromPoint: () => Range }
  documentWithCaret.caretRangeFromPoint = () => {
    const range = document.createRange()
    // The caret mirror is in the dialog; the tap lands after its third character.
    range.setStart(root.querySelector('dialog > satin-caret-mirror')!.firstChild!, 3)
    range.collapse(true)
    return range
  }
  const field = (id: string) => root.querySelector<HTMLInputElement>('#' + id)!
  return { root, field, onTapFocus, label: root.querySelector('label')! }
}
const pointer = (target: Element, type: string, init: PointerEventInit = {}) =>
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: 20, clientY: 20, ...init }))
function mousePress(target: Element, type = 'mousedown') {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, detail: 1 })
  target.dispatchEvent(event)
  return event
}

it('focuses a slow tap at its mouse press, with preventScroll and the tapped caret', () => {
  const { field, onTapFocus } = fixture()
  const focus = vi.spyOn(field('name'), 'focus')
  pointer(field('name'), 'pointerdown')
  now = SLOW_TAP_MS
  pointer(field('name'), 'pointerup')
  // Too long for the pointer-up path: WebKit's mouse press would focus it next.
  expect(focus).not.toHaveBeenCalled()
  const press = mousePress(field('name'))
  expect(press.defaultPrevented).toBe(true)
  expect(focus).toHaveBeenCalledOnce()
  expect(focus).toHaveBeenCalledWith(expect.objectContaining({ preventScroll: true }))
  expect(document.activeElement).toBe(field('name'))
  expect(field('name').selectionStart).toBe(3)
  expect(onTapFocus).toHaveBeenCalledWith(field('name'))
  // The rest of the same click changes nothing more.
  expect(mousePress(field('name'), 'click').defaultPrevented).toBe(true)
  expect(focus).toHaveBeenCalledOnce()
})

it('focuses a tap that moved at its mouse press', () => {
  const { field } = fixture()
  const focus = vi.spyOn(field('name'), 'focus')
  pointer(field('name'), 'pointerdown')
  pointer(field('name'), 'pointerup', { clientX: 120 })
  expect(focus).not.toHaveBeenCalled()
  expect(mousePress(field('name')).defaultPrevented).toBe(true)
  expect(focus).toHaveBeenCalledWith(expect.objectContaining({ preventScroll: true }))
})

it('leaves a mouse or trackpad press native, pointer-up included', () => {
  const { field } = fixture()
  const focus = vi.spyOn(field('name'), 'focus')
  pointer(field('name'), 'pointerdown', { pointerType: 'mouse' })
  pointer(field('name'), 'pointerup', { pointerType: 'mouse' })
  expect(document.activeElement).not.toBe(field('name'))
  expect(mousePress(field('name')).defaultPrevented).toBe(false)
  expect(mousePress(field('name'), 'click').defaultPrevented).toBe(false)
  expect(focus).not.toHaveBeenCalled()
})

it('focuses the editor of a tapped label with preventScroll', () => {
  const { field, label, onTapFocus } = fixture()
  const focus = vi.spyOn(field('name'), 'focus')
  pointer(label, 'pointerdown')
  pointer(label, 'pointerup')
  const click = mousePress(label, 'click')
  expect(click.defaultPrevented).toBe(true)
  expect(focus).toHaveBeenCalledWith(expect.objectContaining({ preventScroll: true }))
  expect(document.activeElement).toBe(field('name'))
  expect(onTapFocus).toHaveBeenCalledWith(field('name'))
})

it('repeats a focus WebKit made itself with preventScroll, without ending editing', () => {
  const { field } = fixture()
  const focus = vi.spyOn(field('name'), 'focus')
  const blur = vi.spyOn(field('name'), 'blur')
  const focusOut = vi.fn()
  field('name').addEventListener('focusout', focusOut)
  // A long press, the keyboard's next key or the app: no pointer-up or mouse press comes first.
  field('name').focus()
  expect(focus).toHaveBeenCalledTimes(2)
  expect(focus).toHaveBeenLastCalledWith(expect.objectContaining({ preventScroll: true }))
  expect(blur).not.toHaveBeenCalled()
  expect(focusOut).not.toHaveBeenCalled()
  expect(document.activeElement).toBe(field('name'))
})

it('does not repeat a focus the framework made', () => {
  const { field } = fixture()
  const focus = vi.spyOn(field('second'), 'focus')
  focusFromFramework(field('second'), { preventScroll: true })
  expect(focus).toHaveBeenCalledOnce()
})

it('brings the keyboard back to a focused editor whose keyboard has gone', () => {
  let showing = true
  const { field, onTapFocus } = fixture({ keyboardShowing: () => showing })
  field('name').focus()
  const focus = vi.spyOn(field('name'), 'focus')
  // Being edited: the tap is a native caret gesture.
  pointer(field('name'), 'pointerdown')
  pointer(field('name'), 'pointerup')
  expect(focus).not.toHaveBeenCalled()
  expect(mousePress(field('name')).defaultPrevented).toBe(false)
  // Focused, but the keyboard was dismissed: WebKit would start editing again without preventScroll.
  showing = false
  pointer(field('name'), 'pointerdown')
  pointer(field('name'), 'pointerup')
  expect(focus).toHaveBeenCalledWith(expect.objectContaining({ preventScroll: true }))
  expect(onTapFocus).toHaveBeenCalledWith(field('name'))
})

it('with the default scope, leaves editors outside a presentation alone (the adapter owns page editors)', () => {
  const { field } = fixture()
  const focus = vi.spyOn(field('page'), 'focus')
  pointer(field('page'), 'pointerdown')
  now = SLOW_TAP_MS
  pointer(field('page'), 'pointerup')
  expect(mousePress(field('page')).defaultPrevented).toBe(false)
  field('page').focus()
  expect(focus).toHaveBeenCalledOnce()
})
