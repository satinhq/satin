import { expect, it } from 'vitest'
import { menuPanelPlacement } from './menuPanelPlacement.ts'

it('places the iPad first row over the trigger and the iPhone panel at its top', () => {
  const trigger = { x: 200, y: 100, width: 40, height: 30 }
  const panel = { x: 0, y: 0, width: 224, height: 158 }
  const row = { x: 8, y: 7, width: 208, height: 36 }
  const available = { x: 8, y: 8, width: 424, height: 840 }
  expect(menuPanelPlacement(trigger, panel, row, available)).toEqual({ left: 108, top: 93 })
  expect(menuPanelPlacement(trigger, panel, row, available, true)).toEqual({ left: 108, top: 100 })
})
it('keeps edge anchors and oversized panels inside the available origin', () => {
  const panel = { x: 0, y: 0, width: 250, height: 158 }
  const available = { x: 8, y: 8, width: 240, height: 100 }
  expect(
    menuPanelPlacement({ x: 239, y: 90, width: 40, height: 30 }, panel, undefined, available, true),
  ).toEqual({ left: 8, top: 8 })
})
