// @vitest-environment happy-dom
import { expect, it } from 'vitest'
import { horizontalDragBlocksBack } from './horizontalDrag.ts'

it('reserves interior row contacts in both configurations and uses the pane-relative Back edge', () => {
  const pane = document.createElement('div')
  pane.dataset.satinPane = 'detail'
  pane.getBoundingClientRect = () => ({ left: 320 }) as DOMRect
  pane.innerHTML =
    '<div data-satin-row-swipe="true" data-satin-horizontal-drag="left"><button>Song</button></div>'
  const row = pane.firstElementChild!
  const target = pane.querySelector('button')!
  for (const direction of ['left', 'both']) {
    row.setAttribute('data-satin-horizontal-drag', direction)
    expect(horizontalDragBlocksBack(target, 319)).toBe(true)
    expect(horizontalDragBlocksBack(target, 320)).toBe(false)
    expect(horizontalDragBlocksBack(target, 339)).toBe(false)
    expect(horizontalDragBlocksBack(target, 340)).toBe(true)
    expect(horizontalDragBlocksBack(target, 600)).toBe(true)
  }
})

it('preserves the declared policy of controls nested inside a row', () => {
  const row = document.createElement('div')
  row.dataset.satinRowSwipe = 'true'
  row.dataset.satinHorizontalDrag = 'both'
  row.innerHTML = '<button data-satin-horizontal-drag="both">Slider</button>'
  expect(horizontalDragBlocksBack(row.firstElementChild!, 4)).toBe(true)
})
