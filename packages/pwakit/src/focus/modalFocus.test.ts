// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { openModal, topModal } from '../modal/lifecycle.ts'
it('owns the last opened modal even when DOM order differs', () => {
  const earlier = document.createElement('dialog'),
    later = document.createElement('dialog')
  for (const [dialog, text] of [
    [earlier, 'First'],
    [later, 'Second'],
  ] as const) {
    const heading = document.createElement('h2')
    heading.tabIndex = -1
    heading.dataset.satinModalHeading = 'true'
    heading.textContent = text
    const button = document.createElement('button')
    button.textContent = text
    dialog.append(heading, button)
    document.body.append(dialog)
  }
  const releaseLater = openModal(later),
    releaseEarlier = openModal(earlier)
  expect(topModal(document)).toBe(earlier)
  earlier.querySelector('h2')!.focus()
  earlier.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }),
  )
  expect(document.activeElement).toBe(earlier.querySelector('button'))
  releaseEarlier()
  earlier.remove()
  expect(topModal(document)).toBe(later)
  releaseLater()
  later.remove()
  expect(topModal(document)).toBeUndefined()
})

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function () {
    this.open = false
  }
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    x: 10,
    y: 10,
    left: 10,
    top: 10,
    right: 210,
    bottom: 54,
    width: 200,
    height: 44,
    toJSON() {},
  }))
})
afterEach(() => vi.restoreAllMocks())

it('isolates nested ancestor content and restores the previous modal and author state', () => {
  const outside = document.createElement('main'),
    parent = document.createElement('dialog')
  const heading = document.createElement('h2'),
    child = document.createElement('dialog')
  outside.setAttribute('aria-hidden', 'false')
  parent.append(heading, child)
  document.body.append(outside, parent)
  const closeParent = openModal(parent)
  expect(outside.getAttribute('aria-hidden')).toBe('false')
  const closeChild = openModal(child)
  expect(heading.inert).toBe(true)
  expect(heading.hasAttribute('aria-hidden')).toBe(false)
  expect(child.closest('[aria-hidden="true"]')).toBeNull()
  closeChild()
  child.open = false
  expect(heading.inert).toBeFalsy()
  expect(heading.hasAttribute('aria-hidden')).toBe(false)
  expect(outside.inert).toBe(true)
  closeParent()
  expect(outside.getAttribute('aria-hidden')).toBe('false')
  expect(outside.inert).toBeFalsy()
  outside.remove()
  parent.remove()
})

it('keeps scroll-reachable controls in the Tab sequence and allows focus to scroll', () => {
  const dialog = document.createElement('dialog')
  dialog.innerHTML =
    '<div style="height:100px;overflow:auto"><button id="first">First</button><button id="below">Below fold</button></div>'
  document.body.append(dialog)
  const first = dialog.querySelector<HTMLButtonElement>('#first')!,
    below = dialog.querySelector<HTMLButtonElement>('#below')!
  vi.spyOn(below, 'getBoundingClientRect').mockReturnValue({
    x: 10,
    y: 900,
    left: 10,
    top: 900,
    right: 210,
    bottom: 944,
    width: 200,
    height: 44,
    toJSON() {},
  })
  const focus = vi.spyOn(below, 'focus')
  const release = openModal(dialog)
  first.focus()
  const forward = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
  first.dispatchEvent(forward)
  expect(forward.defaultPrevented).toBe(true)
  expect(document.activeElement).toBe(below)
  first.focus()
  first.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }),
  )
  expect(document.activeElement).toBe(below)
  expect(focus).toHaveBeenCalledWith() // No preventScroll on the wrap destination.
  release()
  dialog.remove()
})

it('leaves a branch that was already inert to its owner while a modal is open', () => {
  // The stack on the iPad: a covered screen (inert by its owner) beside the screen that
  // presents the sheet. The presenting screen is popped while the sheet is still open.
  const covered = document.createElement('section'),
    presenting = document.createElement('section'),
    chrome = document.createElement('nav'),
    dialog = document.createElement('dialog')
  covered.inert = true
  presenting.append(dialog)
  document.body.append(covered, presenting, chrome)
  const release = openModal(dialog)
  expect(chrome.inert).toBe(true)
  expect(covered.inert).toBe(true)
  // Its owner uncovers the screen (the pop), then the sheet's screen goes away with its dialog.
  covered.inert = false
  release()
  presenting.remove()
  expect(covered.inert).toBe(false)
  expect(chrome.inert).toBe(false)
  covered.remove()
  chrome.remove()
})
