import { expect, it } from 'vitest'
import { contextMenuReturnSeed, contextMenuSeed } from './menuTriggerGeometry.ts'

const tile = { x: 200, y: 600, width: 160, height: 200 }

it('collapses a dismissed context menu onto the side of its source that faces it', () => {
  // A menu below its source (a List row) keeps the measured seed below the source.
  expect(contextMenuReturnSeed(tile, { y: 820, height: 180 })).toEqual(contextMenuSeed(tile))
  // A menu above its source (a grid tile near the bottom of the screen) collapses onto the
  // source's top edge instead of crossing the preview.
  const above = contextMenuReturnSeed(tile, { y: 380, height: 180 })
  expect(above).toEqual({ ...contextMenuSeed(tile), y: tile.y - 2 - 25 })
  // Without a measured panel it keeps the seed below.
  expect(contextMenuReturnSeed(tile)).toEqual(contextMenuSeed(tile))
})
