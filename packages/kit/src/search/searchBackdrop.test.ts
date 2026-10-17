// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import {
  beginSearchBackdrop,
  refreshSearchBackdrop,
  endSearchBackdrop,
  searchBackdropAnchor,
  searchBackdropScroll,
} from './searchBackdrop.ts'

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

it('does no search geometry work while a sheet opens over a stationary searchable screen', () => {
  const host = document.createElement('div')
  host.setAttribute('data-satin-searchable', '')
  host.innerHTML = '<div data-satin-search></div><div>Chats</div>'
  document.body.append(host)
  const hostRect = vi.spyOn(host, 'getBoundingClientRect').mockReturnValue({ top: 0 } as DOMRect)
  const contentRect = vi
    .spyOn(host.lastElementChild!, 'getBoundingClientRect')
    .mockImplementation(() => ({ top: 100 - host.scrollTop }) as DOMRect)
  const query = vi.spyOn(host, 'querySelector')
  const sheet = document.createElement('div')
  sheet.setAttribute('data-satin-presentation-moving', '')
  document.body.append(sheet)
  // Source measurement/commit and scroll restoration can run while opening a sheet.
  const anchor = searchBackdropAnchor(host)
  for (let frame = 0; frame < 30; frame++) {
    host.scrollTop = frame
    expect(searchBackdropScroll(host, anchor)).toBe(frame)
  }
  expect(hostRect).not.toHaveBeenCalled()
  expect(contentRect).not.toHaveBeenCalled()
  expect(query).not.toHaveBeenCalled()
})

it('retains the last live origin after dismissal and scrolls it without layout reads', () => {
  const host = document.createElement('div')
  host.setAttribute('data-satin-searchable', '')
  host.innerHTML = '<div data-satin-search></div><div>Chats</div>'
  document.body.append(host)
  host.scrollTop = 140
  let contentTop = 120
  vi.spyOn(host, 'getBoundingClientRect').mockReturnValue({ top: 0 } as DOMRect)
  const rect = vi
    .spyOn(host.lastElementChild!, 'getBoundingClientRect')
    .mockImplementation(() => ({ top: contentTop }) as DOMRect)
  // A capture can be measured before motion and committed after it starts.
  const captured = searchBackdropAnchor(host)
  beginSearchBackdrop(host)
  contentTop = 150
  refreshSearchBackdrop(host)
  expect(260 - searchBackdropScroll(host, captured)).toBe(150)
  contentTop = 174
  endSearchBackdrop(host)
  expect(260 - searchBackdropScroll(host, captured)).toBe(174)
  rect.mockClear()
  host.scrollTop += 20
  contentTop -= 20
  expect(260 - searchBackdropScroll(host, captured)).toBe(154)
  const recaptured = searchBackdropAnchor(host)
  expect(searchBackdropScroll(host, recaptured)).toBe(160)
  // An unrelated sheet can move the host visually; it must not change source origin.
  contentTop += 10
  refreshSearchBackdrop(host)
  expect(searchBackdropScroll(host, recaptured)).toBe(160)
  expect(rect).not.toHaveBeenCalled()
})

it('rebases retargeted motion and excludes intervening idle content changes', () => {
  const host = document.createElement('div')
  host.setAttribute('data-satin-searchable', '')
  host.innerHTML = '<div data-satin-search></div><div>Chats</div>'
  document.body.append(host)
  let top = 100
  vi.spyOn(host, 'getBoundingClientRect').mockReturnValue({ top: 0 } as DOMRect)
  vi.spyOn(host.lastElementChild!, 'getBoundingClientRect').mockImplementation(
    () => ({ top }) as DOMRect,
  )
  const captured = searchBackdropAnchor(host)
  beginSearchBackdrop(host)
  top = 140
  beginSearchBackdrop(host) // Retarget between animation frames.
  top = 115
  endSearchBackdrop(host)
  expect(searchBackdropScroll(host, captured)).toBe(-15)
  top = 200 // Idle layout mutation, recaptured by normal source damage.
  const recaptured = searchBackdropAnchor(host)
  beginSearchBackdrop(host)
  top = 210
  endSearchBackdrop(host)
  expect(searchBackdropScroll(host, recaptured)).toBe(-10)
})
