// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerNavigationKeyboard } from './keyboard.ts'
const cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.splice(0).forEach(fn => fn())
  document.body.replaceChildren()
})
function host(parent = document.body, enabled = true, canPop = true) {
  const element = document.createElement('div')
  parent.append(element)
  element.getClientRects = () => [element.getBoundingClientRect()] as unknown as DOMRectList
  const pop = vi.fn()
  cleanup.push(
    registerNavigationKeyboard({
      host: element,
      enabled: () => enabled,
      canPop: () => canPop,
      pop,
    }),
  )
  return { element, pop }
}
function key(options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', {
    key: '[',
    metaKey: true,
    bubbles: true,
    cancelable: true,
    ...options,
  })
  document.dispatchEvent(event)
  return event
}
describe('Command-[ navigation ownership', () => {
  it('pops the active stack once and consumes the shortcut', () => {
    const active = host()
    const hidden = host(document.body, false)
    expect(key().defaultPrevented).toBe(true)
    expect(active.pop).toHaveBeenCalledOnce()
    expect(hidden.pop).not.toHaveBeenCalled()
  })
  it('does not bubble through a nested root to a parent stack', () => {
    const parent = host()
    host(parent.element, true, false)
    key()
    expect(parent.pop).not.toHaveBeenCalled()
  })
  it('uses focus to disambiguate visible branches', () => {
    const a = host()
    const b = host()
    key()
    expect(a.pop).not.toHaveBeenCalled()
    b.element.tabIndex = 0
    b.element.focus()
    key()
    expect(b.pop).toHaveBeenCalledOnce()
    expect(a.pop).not.toHaveBeenCalled()
  })
  it('preserves editable, composing, repeated, and previously handled input', () => {
    const a = host()
    for (const options of [
      { isComposing: true },
      { repeat: true },
      { altKey: true },
      { metaKey: false },
    ])
      key(options)
    const event = new KeyboardEvent('keydown', { key: '[', metaKey: true, cancelable: true })
    event.preventDefault()
    document.dispatchEvent(event)
    const input = document.createElement('input')
    a.element.append(input)
    input.focus()
    key()
    expect(a.pop).not.toHaveBeenCalled()
  })
  it('does not navigate behind modal or menu presentation or inert content', () => {
    const a = host()
    a.element.inert = true
    a.element.setAttribute('inert', '')
    key()
    a.element.removeAttribute('inert')
    const overlay = document.createElement('div')
    document.body.append(overlay)
    overlay.getClientRects = () => [overlay.getBoundingClientRect()] as unknown as DOMRectList
    overlay.setAttribute('aria-modal', 'true')
    key()
    overlay.removeAttribute('aria-modal')
    overlay.setAttribute('role', 'menu')
    key()
    expect(a.pop).not.toHaveBeenCalled()
  })
})

it('routes an unmodified VoiceOver Escape to the focused navigator', () => {
  const active = host()
  expect(key({ key: 'Escape', metaKey: false }).defaultPrevented).toBe(true)
  expect(active.pop).toHaveBeenCalledOnce()
})
it('leaves Escape to a modal even when its navigator can pop', () => {
  const modal = document.createElement('dialog')
  modal.setAttribute('aria-modal', 'true')
  modal.getClientRects = () => [modal.getBoundingClientRect()] as unknown as DOMRectList
  document.body.append(modal)
  const active = host(modal)
  active.element.tabIndex = 0
  active.element.focus()
  expect(key({ key: 'Escape', metaKey: false }).defaultPrevented).toBe(false)
  expect(active.pop).not.toHaveBeenCalled()
})
