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
