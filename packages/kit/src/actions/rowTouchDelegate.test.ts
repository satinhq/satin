// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { listenForRowTouches } from './rowTouchDelegate.ts'

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

function list(rowCount: number) {
  const surface = document.createElement('div')
  const content = document.createElement('div')
  content.dataset.satinScrollContent = 'true'
  surface.append(content)
  const rows = Array.from({ length: rowCount }, () => {
    const row = document.createElement('div')
    row.dataset.satinRowActions = 'true'
    row.append(document.createElement('span'))
    content.append(row)
    return row
  })
  document.body.append(surface)
  return { surface, content, rows }
}

const touchMove = () => new Event('touchmove', { bubbles: true, cancelable: true })

it('gives a long list one cancelable touch target, and still routes each touch to its row', () => {
  const { surface, content, rows } = list(1200)
  const registered = vi.spyOn(EventTarget.prototype, 'addEventListener')
  const received = rows.map(() => vi.fn((event: TouchEvent) => event.stopPropagation()))
  const stop = rows.map((row, index) => listenForRowTouches(row, received[index]!))

  // WebKit rebuilds one synchronous touch region per target in every layout or compositing
  // update. A row each made that rebuild scale with the transcript.
  const moveTargets = registered.mock.calls.flatMap(([type], index) =>
    type === 'touchmove' ? [registered.mock.contexts[index]] : [],
  )
  expect(moveTargets).toEqual([content])

  const beyond = vi.fn()
  surface.addEventListener('touchmove', beyond)
  rows[7]!.firstElementChild!.dispatchEvent(touchMove())
  expect(received.filter(listener => listener.mock.calls.length)).toEqual([received[7]])
  // The row's stopPropagation still keeps its moves from the scroll view and navigation.
  expect(beyond).not.toHaveBeenCalled()

  for (const release of stop) release()
  rows[7]!.dispatchEvent(touchMove())
  expect(received[7]).toHaveBeenCalledTimes(1)
})

it('listens on the row itself when it is not in a scroll view', () => {
  const row = document.createElement('div')
  row.dataset.satinRowActions = 'true'
  document.body.append(row)
  const listener = vi.fn()
  const release = listenForRowTouches(row, listener)
  row.dispatchEvent(touchMove())
  expect(listener).toHaveBeenCalledTimes(1)
  release()
  row.dispatchEvent(touchMove())
  expect(listener).toHaveBeenCalledTimes(1)
})
