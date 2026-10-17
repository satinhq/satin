// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest'
import { installKeyboardAdapter } from './adapter.ts'

const disposals: (() => void)[] = []
afterEach(() => {
  disposals.splice(0).forEach(dispose => dispose())
  document.body.replaceChildren()
})

function tap(target: Element) {
  target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 40, clientY: 40 }))
  target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 40, clientY: 40 }))
}

function fixture() {
  const root = document.createElement('div')
  root.innerHTML = `
    <p>Transcript</p>
    <form><textarea></textarea><button type="button">Send</button></form>
    <a href="#top"><span>Link</span></a>
    <div role="button" tabindex="0">Role button</div>`
  document.body.append(root)
  disposals.push(installKeyboardAdapter(root))
  const editor = root.querySelector('textarea')!
  editor.focus()
  return { root, editor }
}

// System controls keep the first responder when a button is tapped. A hand-rolled composer
// whose Send sits outside a bottom inset must not lose its keyboard on every Send (iPad, Oct 12).
it('keeps the keyboard when a control is tapped', () => {
  const { root, editor } = fixture()
  for (const control of [
    root.querySelector('button')!,
    root.querySelector('a span')!,
    root.querySelector('[role="button"]')!,
  ]) {
    tap(control)
    expect(document.activeElement).toBe(editor)
  }
})

it('still dismisses the keyboard when plain content is tapped', () => {
  const { root, editor } = fixture()
  tap(root.querySelector('p')!)
  expect(document.activeElement).not.toBe(editor)
})
