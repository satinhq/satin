// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  focusFromFramework,
  lastInputWasKeyboard,
  quietUserAgentFocus,
  setFocusVisibleOptionSupportForTesting,
  trackInputModality,
} from './programmaticFocus.ts'

afterEach(() => {
  document.body.replaceChildren()
  setFocusVisibleOptionSupportForTesting(undefined)
})
function button() {
  const element = document.createElement('button')
  element.textContent = 'Target'
  document.body.append(element)
  return element
}
const pointer = () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
const key = (target: Element, init: KeyboardEventInit) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }))

describe('framework focus follows the last input modality', () => {
  it('suppresses the indicator after touch and keeps it for the keyboard when focusVisible is supported', () => {
    setFocusVisibleOptionSupportForTesting(true)
    trackInputModality(document)
    const target = button(),
      focus = vi.spyOn(target, 'focus')
    pointer()
    focusFromFramework(target, { preventScroll: true })
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true, focusVisible: false })
    key(document.body, { key: 'Tab' })
    focusFromFramework(target, { preventScroll: true })
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true, focusVisible: true })
  })

  it('falls back to a scoped attribute that clears on blur or keyboard use', () => {
    setFocusVisibleOptionSupportForTesting(false)
    trackInputModality(document)
    const target = button(),
      other = button()
    pointer()
    focusFromFramework(target)
    expect(document.activeElement).toBe(target)
    expect(target.hasAttribute('data-satin-focus-quiet')).toBe(true)
    other.focus()
    expect(target.hasAttribute('data-satin-focus-quiet')).toBe(false)
    focusFromFramework(target)
    key(target, { key: 'ArrowDown' })
    expect(target.hasAttribute('data-satin-focus-quiet')).toBe(false)
    focusFromFramework(other)
    expect(other.hasAttribute('data-satin-focus-quiet')).toBe(false)
  })

  it('quiets an element the UA already focused as focus-visible after touch', () => {
    setFocusVisibleOptionSupportForTesting(true)
    trackInputModality(document)
    const target = button()
    target.focus()
    vi.spyOn(target, 'matches').mockImplementation(selector => selector === ':focus-visible')
    pointer()
    focusFromFramework(target, { preventScroll: true })
    expect(target.hasAttribute('data-satin-focus-quiet')).toBe(true)
    key(document.body, { key: 'Tab' })
    focusFromFramework(target)
    expect(target.hasAttribute('data-satin-focus-quiet')).toBe(false)
  })

  it('quiets a UA-focused modal descendant after touch but not after keyboard input', () => {
    trackInputModality(document)
    const dialog = document.createElement('div'),
      heading = document.createElement('h2')
    heading.tabIndex = -1
    dialog.append(heading)
    document.body.append(dialog)
    vi.spyOn(heading, 'matches').mockImplementation(selector => selector === ':focus-visible')
    heading.focus()
    pointer()
    quietUserAgentFocus(dialog)
    expect(heading.hasAttribute('data-satin-focus-quiet')).toBe(true)
    heading.blur()
    expect(heading.hasAttribute('data-satin-focus-quiet')).toBe(false)
    heading.focus()
    key(document.body, { key: 'Tab' })
    quietUserAgentFocus(dialog)
    expect(heading.hasAttribute('data-satin-focus-quiet')).toBe(false)
  })

  it('does not treat software-keyboard typing as keyboard navigation', () => {
    trackInputModality(document)
    const field = document.createElement('input')
    document.body.append(field)
    pointer()
    key(field, { key: 'a' })
    expect(lastInputWasKeyboard(document)).toBe(false)
    key(field, { key: 'Tab' })
    expect(lastInputWasKeyboard(document)).toBe(true)
  })
})

it('quiets restored heading focus inside the app without changing focus semantics', () => {
  trackInputModality(document)
  const mount = document.createElement('main')
  mount.setAttribute('data-satin-mount', 'true')
  const heading = document.createElement('h3')
  heading.textContent = 'My Lists'
  heading.tabIndex = -1
  mount.append(heading)
  document.body.append(mount)
  pointer()
  heading.focus()
  expect(document.activeElement).toBe(heading)
  expect(heading.hasAttribute('data-satin-focus-quiet')).toBe(true)
  heading.blur()
  expect(heading.hasAttribute('data-satin-focus-quiet')).toBe(false)
  heading.focus()
  window.dispatchEvent(new Event('focus'))
  expect(heading.hasAttribute('data-satin-focus-quiet')).toBe(true)
  key(heading, { key: 'Tab' })
  expect(heading.hasAttribute('data-satin-focus-quiet')).toBe(false)
  pointer()
  expect(heading.hasAttribute('data-satin-focus-quiet')).toBe(true)
  expect(heading.tabIndex).toBe(-1)
})

it('does not change focus outside framework-owned content', () => {
  trackInputModality(document)
  pointer()
  const outside = button()
  outside.focus()
  window.dispatchEvent(new Event('focus'))
  expect(outside.hasAttribute('data-satin-focus-quiet')).toBe(false)
})

it('quiets visible resume without moving focus, even when the UA emits no focusin', () => {
  trackInputModality(document)
  const mount = document.createElement('main')
  mount.setAttribute('data-satin-mount', 'true')
  const heading = document.createElement('h2')
  heading.tabIndex = -1
  mount.append(heading)
  document.body.append(mount)
  pointer()
  heading.focus()
  heading.removeAttribute('data-satin-focus-quiet')
  const focus = vi.spyOn(heading, 'focus')
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  document.dispatchEvent(new Event('visibilitychange'))
  expect(heading.hasAttribute('data-satin-focus-quiet')).toBe(true)
  expect(document.activeElement).toBe(heading)
  expect(focus).not.toHaveBeenCalled()
  visibility.mockRestore()
})

it('does not carry stale keyboard modality across activation when the return touch happened outside WebKit', () => {
  trackInputModality(document)
  const mount = document.createElement('main')
  mount.setAttribute('data-satin-mount', 'true')
  const heading = document.createElement('h2')
  heading.tabIndex = -1
  mount.append(heading)
  document.body.append(mount)
  key(document.body, { key: 'Tab' })
  focusFromFramework(heading)
  expect(heading.hasAttribute('data-satin-focus-quiet')).toBe(false)
  window.dispatchEvent(new Event('blur'))
  window.dispatchEvent(new Event('focus'))
  expect(document.activeElement).toBe(heading)
  expect(heading.hasAttribute('data-satin-focus-quiet')).toBe(true)
  key(heading, { key: 'Tab' })
  expect(heading.hasAttribute('data-satin-focus-quiet')).toBe(false)
})
