// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { editable } from './adapter.ts'
import { installModalTapFocus } from './modalTapFocus.ts'

// The tapped caret is found by hit-testing a hidden copy of the field's text box (WebKit hides a
// text control's own text node). The copy must sit exactly on the field, lay out its text like the
// field whatever the page's CSS, and never put a password's characters in the DOM.
const CHAR = 10
const PADDING = 8
const disposals: (() => void)[] = []
afterEach(() => {
  disposals.splice(0).forEach(dispose => dispose())
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

type Rect = { left: number; top: number; width: number; height: number }
const asRect = ({ left, top, width, height }: Rect) =>
  ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
  }) as DOMRect

/**
 * Layout: the field at its rect; a fixed-position box at its left/top, offset by the containing
 * block of a `contain: layout` dialog. The hit test returns the character under the point in the
 * box that is really there, or nothing.
 */
function layout(field: HTMLInputElement, fieldRect: Rect, dialogOffset = { x: 0, y: 0 }) {
  const placed = (element: Element): Rect | null => {
    if (element === field) return fieldRect
    const style = (element as HTMLElement).style
    if (style?.getPropertyValue('position') !== 'fixed') return null
    const inDialog = element.parentElement?.tagName === 'DIALOG'
    return {
      left: parseFloat(style.getPropertyValue('left')) + (inDialog ? dialogOffset.x : 0),
      top: parseFloat(style.getPropertyValue('top')) + (inDialog ? dialogOffset.y : 0),
      width: parseFloat(style.getPropertyValue('width')),
      height: parseFloat(style.getPropertyValue('height')),
    }
  }
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return asRect(placed(this) ?? { left: 0, top: 0, width: 0, height: 0 })
  })
  const seen: string[] = []
  const caretDocument = document as Document & { caretRangeFromPoint?: unknown }
  caretDocument.caretRangeFromPoint = (x: number, y: number) => {
    for (const element of document.querySelectorAll('*')) {
      const text = element.firstChild
      const box = placed(element)
      if (element === field || !box || !(text instanceof Text)) continue
      seen.push(text.data)
      if (x < box.left || x > box.left + box.width || y < box.top || y > box.top + box.height)
        continue
      const range = document.createRange()
      range.setStart(text, Math.min(text.length, Math.round((x - box.left - PADDING) / CHAR)))
      return range
    }
    return null
  }
  return seen
}
function tapAt(field: HTMLInputElement, x: number, y: number) {
  field.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y }))
  field.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x, clientY: y }))
}

it('never puts a password in the DOM, and still finds the tapped caret', () => {
  const root = document.createElement('div')
  root.innerHTML = '<input type="password" value="hunter2-secret">'
  document.body.append(root)
  const field = root.querySelector('input')!
  disposals.push(
    installModalTapFocus(
      root,
      editable,
      undefined,
      () => true,
      () => true,
    ),
  )
  const added: string[] = []
  const observer = new MutationObserver(records => {
    for (const record of records)
      for (const node of record.addedNodes) added.push(node.textContent ?? '')
  })
  observer.observe(document.body, { childList: true, subtree: true, characterData: true })
  const seen = layout(field, { left: 20, top: 100, width: 300, height: 40 })
  tapAt(field, 20 + PADDING + 4 * CHAR, 120)
  observer.disconnect()
  expect(document.activeElement).toBe(field)
  expect(field.selectionStart).toBe(4)
  for (const text of [...added, ...seen]) expect(text).not.toContain('hunter2')
  expect(seen.length).toBeGreaterThan(0)
})

it('measures on the field inside a dialog whose contain: layout offsets fixed boxes', () => {
  const root = document.createElement('div')
  root.innerHTML = '<dialog open><input value="Hello world"></dialog>'
  document.body.append(root)
  const field = root.querySelector('input')!
  disposals.push(installModalTapFocus(root, editable))
  // The dialog's box starts at (400, 300): a fixed box inside it is placed from there.
  layout(field, { left: 450, top: 340, width: 300, height: 40 }, { x: 400, y: 300 })
  tapAt(field, 450 + PADDING + 3 * CHAR, 360)
  expect(document.activeElement).toBe(field)
  expect(field.selectionStart).toBe(3)
  expect(root.querySelector('dialog')!.children.length).toBe(1)
})

it('isolates the copy from page styles: its own element, every declaration reset and important', () => {
  const root = document.createElement('div')
  root.innerHTML = '<input value="Hello world">'
  document.body.append(root)
  const field = root.querySelector('input')!
  disposals.push(
    installModalTapFocus(
      root,
      editable,
      undefined,
      () => true,
      () => true,
    ),
  )
  let mirror: Element | null = null
  layout(field, { left: 20, top: 100, width: 300, height: 40 })
  const caretDocument = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null
  }
  const hitTest = caretDocument.caretRangeFromPoint!
  caretDocument.caretRangeFromPoint = (x, y) => {
    mirror = [...document.body.children].find(child => child !== root) ?? null
    return hitTest(x, y)
  }
  tapAt(field, 20 + PADDING + 2 * CHAR, 120)
  expect(mirror).not.toBeNull()
  // A page's `div` or `body > div` rules cannot select it, and nothing inherits into it.
  expect(mirror!.tagName).not.toBe('DIV')
  const style = (mirror as unknown as HTMLElement).style
  expect(style.getPropertyValue('all')).toBe('initial')
  for (const property of ['position', 'left', 'top', 'width', 'white-space', 'font'])
    expect(style.getPropertyPriority(property)).toBe('important')
  expect(field.selectionStart).toBe(2)
  // Removed after the hit test.
  expect(document.body.children.length).toBe(1)
})

// Structure only: happy-dom lays nothing out, so this checks where the caret line is read from
// (a marker after exactly the text before the caret, in a mirror scrolled like the editor) and
// that it is reported relative to the editor. That the line matches WebKit's wrapping is shown by
// the Tall lab runs on the iPhone Simulator (measured-reference notes, rounds 8 and 9).
it('reads the caret line from a marker placed after the text before the caret', async () => {
  const { caretLineAt } = await import('./caretMirror.ts')
  const textarea = document.createElement('textarea')
  textarea.value = 'one\ntwo\nthree'
  document.body.append(textarea)
  let markerBefore = ''
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this === textarea) return asRect({ left: 10, top: 100, width: 200, height: 60 })
    if (this.tagName === 'SATIN-CARET-MARKER') {
      markerBefore = this.previousSibling?.textContent ?? ''
      return asRect({ left: 14, top: 344, width: 0, height: 22 })
    }
    // The mirror itself: placed on the editor, 300 pt lower in its own coordinates.
    return asRect({ left: 10, top: 300, width: 200, height: 60 })
  })
  const line = caretLineAt(textarea, 6)
  expect(markerBefore).toBe('one\ntw')
  expect(line).toEqual({ top: 144, bottom: 166 })
  expect(document.querySelector('satin-caret-mirror')).toBeNull()
})
