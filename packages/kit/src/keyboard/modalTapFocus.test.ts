// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { installModalTapFocus } from './modalTapFocus.ts'
import { editable } from './adapter.ts'

const disposals: (() => void)[] = []
afterEach(() => {
  disposals.splice(0).forEach(dispose => dispose())
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

function fixture() {
  const root = document.createElement('div')
  root.innerHTML = '<dialog open><input value="Hello world"><input value="Second"></dialog>'
  document.body.append(root)
  const fields = root.querySelectorAll('input')
  disposals.push(installModalTapFocus(root, editable))
  const documentWithCaret = document as Document & { caretRangeFromPoint: () => Range }
  documentWithCaret.caretRangeFromPoint = () => {
    const range = document.createRange()
    range.setStart(root.querySelector('dialog > satin-caret-mirror')!.firstChild!, 3)
    range.collapse(true)
    return range
  }
  return { root, fields }
}

function tap(field: HTMLInputElement, x = 20) {
  field.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: 20 }))
  field.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x, clientY: 20 }))
}

// Mechanism: the focus call carries preventScroll (the device runs in the measured-reference notes show
// that this stops WebKit's pan; happy-dom cannot pan) and the tapped caret survives.
it('focuses during the activation gesture with preventScroll and preserves the tapped caret', () => {
  const { fields } = fixture()
  const focus = vi.spyOn(fields[0]!, 'focus')
  tap(fields[0]!)
  expect(focus).toHaveBeenCalledWith(expect.objectContaining({ preventScroll: true }))
  expect(fields[0]!.selectionStart).toBe(3)
  expect(document.querySelector('dialog > satin-caret-mirror')).toBeNull()
  const mouse = new MouseEvent('mousedown', { bubbles: true, cancelable: true, detail: 1 })
  fields[0]!.dispatchEvent(mouse)
  expect(mouse.defaultPrevented).toBe(true)
})

it('keeps active-editor taps and drags native, and supports switching editors', () => {
  const { fields } = fixture()
  fields[0]!.focus()
  fields[0]!.setSelectionRange(1, 5)
  const focus = vi.spyOn(fields[0]!, 'focus')
  tap(fields[0]!)
  expect(focus).not.toHaveBeenCalled()
  expect(fields[0]!.selectionEnd).toBe(5)
  const click = new MouseEvent('click', { bubbles: true, cancelable: true, detail: 2 })
  fields[0]!.dispatchEvent(click)
  expect(click.defaultPrevented).toBe(false)
  tap(fields[1]!)
  expect(document.activeElement).toBe(fields[1])
  expect(fields[1]!.selectionStart).toBe(3)
})

it('leaves long presses and moved taps to the mouse-press path, and editors outside a presentation alone', () => {
  const { fields, root } = fixture()
  const focus = vi.spyOn(fields[0]!, 'focus')
  let now = 0
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  const press = () =>
    fields[0]!.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true, detail: 1 }),
    )
  // Too long for a tap: not focused at pointer-up; WebKit's mouse press is owned instead.
  fields[0]!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  now = 400
  fields[0]!.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
  expect(focus).not.toHaveBeenCalled()
  expect(press()).toBe(false)
  expect(document.activeElement).toBe(fields[0])
  fields[0]!.blur()
  // Moved past the slop: the same.
  fields[0]!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  fields[0]!.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 100 }))
  expect(document.activeElement).not.toBe(fields[0])
  expect(press()).toBe(false)
  expect(document.activeElement).toBe(fields[0])
  // With the default scope, an editor outside a presentation is WebKit's (the keyboard adapter
  // passes a scope that owns page editors too).
  const outside = document.createElement('input')
  root.append(outside)
  tap(outside)
  expect(document.activeElement).not.toBe(outside)
  const outsidePress = new MouseEvent('mousedown', { bubbles: true, cancelable: true, detail: 1 })
  outside.dispatchEvent(outsidePress)
  expect(outsidePress.defaultPrevented).toBe(false)
})

/** WebKit's compatibility mouse press: unless prevented, pressing a non-editable element moves
 * focus off the focused editor (happy-dom has no such default, so the test applies it). */
function webkitMousePress(target: Element) {
  const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true, detail: 1 })
  target.dispatchEvent(press)
  if (!press.defaultPrevented && target !== document.activeElement)
    (document.activeElement as HTMLElement | null)?.blur()
  const click = new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })
  target.dispatchEvent(click)
  return { press, click }
}

// Beta.4 device regression (iPad, Chats): focusing the search drawer's field presents search, and
// the field leaves the finger at once. WebKit then sent the tap's mouse press to the content now
// under the finger, which blurred the field, and the empty field dismissed search again.
it("keeps a focusing tap's mouse events off whatever the focus moved under the finger", () => {
  const { root, fields } = fixture()
  const underFinger = document.createElement('button')
  root.querySelector('dialog')!.append(underFinger)
  const pressed = vi.fn()
  underFinger.addEventListener('mousedown', pressed)
  underFinger.addEventListener('click', pressed)
  tap(fields[0]!)
  const { press, click } = webkitMousePress(underFinger)
  expect(press.defaultPrevented).toBe(true)
  expect(click.defaultPrevented).toBe(true)
  expect(pressed).not.toHaveBeenCalled()
  expect(document.activeElement).toBe(fields[0])
  // The next touch is a tap of its own.
  underFinger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  expect(webkitMousePress(underFinger).press.defaultPrevented).toBe(false)
  expect(pressed).toHaveBeenCalledTimes(2)
})

it('owns those mouse events even when the tap placed no caret', () => {
  const { root, fields } = fixture()
  ;(document as Document & { caretRangeFromPoint: () => Range | null }).caretRangeFromPoint = () =>
    null
  const underFinger = document.createElement('div')
  root.querySelector('dialog')!.append(underFinger)
  tap(fields[0]!)
  expect(webkitMousePress(underFinger).press.defaultPrevented).toBe(true)
  expect(document.activeElement).toBe(fields[0])
  // With no caret of the framework's to keep, the tap's own press on the editor stays WebKit's.
  fields[0]!.blur()
  tap(fields[0]!)
  expect(webkitMousePress(fields[0]!).press.defaultPrevented).toBe(false)
})
