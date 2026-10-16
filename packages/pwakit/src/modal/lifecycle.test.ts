// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { openModal, orderedTopLayerDialogs, topModal } from './lifecycle.ts'

const releases: (() => void)[] = []
function dialog(documentOwner = document) {
  const node = documentOwner.createElement('dialog')
  node.innerHTML = '<h2 data-satin-modal-heading tabindex="-1">Title</h2><button>Action</button>'
  documentOwner.body.append(node)
  vi.spyOn(node, 'matches').mockImplementation(selector => selector === ':modal' && node.open)
  return node
}
function open(node: HTMLDialogElement) {
  const close = openModal(node)
  releases.push(close)
  return close
}
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function () {
    this.open = false
  }
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 100,
    bottom: 44,
    width: 100,
    height: 44,
    toJSON() {},
  })
})
afterEach(() => {
  for (const close of releases.splice(0).reverse()) close()
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

it('shares focus and glass order for reopened earlier DOM siblings', () => {
  const first = dialog()
  const second = dialog()
  const closeFirst = open(first)
  open(second)
  closeFirst()
  open(first)
  expect(topModal(document)).toBe(first)
  expect(orderedTopLayerDialogs(document)).toEqual([second, first])
  // A queued close event from the previous generation cannot close the new opening.
  first.dispatchEvent(new Event('close'))
  expect(topModal(document)).toBe(first)
})
it('keeps document sessions independent and foreign dialogs in the DOM fallback', () => {
  const other = document.implementation.createHTMLDocument()
  const foreign = dialog()
  foreign.open = true
  const managed = dialog()
  const otherManaged = dialog(other)
  open(managed)
  open(otherManaged)
  expect(topModal(document)).toBe(managed)
  expect(topModal(other)).toBe(otherManaged)
  expect(orderedTopLayerDialogs(document)).toEqual([foreign, managed])
  expect(orderedTopLayerDialogs(other)).toEqual([otherManaged])
})
it('rolls back autofocus and scroll listeners when showModal fails', () => {
  const scroller = document.createElement('section')
  scroller.dataset.satinScrollAxis = 'vertical'
  scroller.scrollTop = 40
  document.body.append(scroller)
  const node = dialog()
  scroller.append(node)
  vi.spyOn(node, 'showModal').mockImplementation(() => {
    throw new Error('failed open')
  })
  expect(() => open(node)).toThrow('failed open')
  expect(topModal(document)).toBeUndefined()
  expect(node.querySelector('[autofocus]')).toBeNull()
  scroller.scrollTop = 80
  scroller.dispatchEvent(new Event('scroll'))
  expect(scroller.scrollTop).toBe(80)
})
it('disposes removal without normal close and restores owner inert state', async () => {
  const outside = document.createElement('main')
  const owned = document.createElement('aside')
  owned.inert = true
  document.body.append(outside, owned)
  const node = dialog()
  const close = open(node)
  expect(outside.inert).toBe(true)
  node.remove()
  await Promise.resolve()
  expect(topModal(document)).toBeUndefined()
  expect(outside.inert).toBe(false)
  expect(owned.inert).toBe(true)
  close()
})
it('keeps the background continuously inert when modal content changes', async () => {
  const outside = document.createElement('main')
  // jsdom lacks the reflected inert property. Model the browser attribute so
  // mutation receipts expose any transient release of background isolation.
  Object.defineProperty(outside, 'inert', {
    get: () => outside.hasAttribute('inert'),
    set: value => (value ? outside.setAttribute('inert', '') : outside.removeAttribute('inert')),
  })
  document.body.append(outside)
  const node = dialog()
  const close = open(node)
  await new Promise(resolve => setTimeout(resolve, 0))
  const changes: MutationRecord[] = []
  const observer = new MutationObserver(records => changes.push(...records))
  observer.observe(outside, {
    attributes: true,
    attributeFilter: ['inert'],
    attributeOldValue: true,
  })
  node.append(document.createElement('span'))
  await new Promise(resolve => setTimeout(resolve, 0))
  observer.disconnect()
  expect(outside.inert).toBe(true)
  expect(changes).toEqual([])
  close()
})

it('restores nested focus when a child closes and never focuses behind a surviving modal', () => {
  const first = dialog()
  const second = dialog()
  const closeFirst = open(first)
  open(second)
  closeFirst()
  expect(second.contains(document.activeElement)).toBe(true)
  const child = dialog()
  second.append(child)
  const button = second.querySelector('button')!
  button.focus()
  const closeChild = open(child)
  expect(button.inert).toBe(true)
  closeChild()
  expect(document.activeElement).toBe(button)
  expect(button.inert).toBe(false)
})
it('handles native close, duplicate disposal and duplicate opening explicitly', () => {
  const node = dialog()
  const close = open(node)
  expect(() => openModal(node)).toThrow('already open')
  node.open = false
  node.dispatchEvent(new Event('close'))
  expect(topModal(document)).toBeUndefined()
  close()
  expect(orderedTopLayerDialogs(document)).toEqual([])
})
it('retains author autofocus and blurs editors before caller motion cancellation', () => {
  const node = dialog()
  const field = document.createElement('input')
  node.append(field)
  node.autofocus = true
  const close = openModal(node, { initialFocus: field })
  releases.push(close)
  const blur = vi.spyOn(field, 'blur')
  const cancel = vi.fn()
  close(cancel)
  expect(blur).toHaveBeenCalledOnce()
  expect(blur.mock.invocationCallOrder[0]).toBeLessThan(cancel.mock.invocationCallOrder[0]!)
  expect(node.autofocus).toBe(true)
})

it('runs caller teardown even after automatic native-close disposal', () => {
  const node = dialog()
  const close = openModal(node)
  releases.push(close)
  node.open = false
  node.dispatchEvent(new Event('close'))
  const teardown = vi.fn()
  close(teardown)
  expect(teardown).toHaveBeenCalledOnce()
  expect(topModal(document)).toBeUndefined()
})

it('retains the anchor scroll surface for a body-portaled context dialog', () => {
  const scroller = document.createElement('section')
  scroller.dataset.satinScrollAxis = 'vertical'
  const anchor = document.createElement('button')
  scroller.append(anchor)
  document.body.append(scroller)
  scroller.scrollTop = 84
  const node = dialog()
  vi.spyOn(node, 'showModal').mockImplementation(() => {
    node.open = true
    scroller.scrollTop = 200
    scroller.dispatchEvent(new Event('scroll'))
  })
  const close = openModal(node, { restoreFocus: anchor })
  releases.push(close)
  expect(scroller.scrollTop).toBe(84)
  close()
  scroller.scrollTop = 200
  scroller.dispatchEvent(new Event('scroll'))
  expect(scroller.scrollTop).toBe(200)
})
