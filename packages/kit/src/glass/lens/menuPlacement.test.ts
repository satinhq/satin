import { describe, expect, it } from 'vitest'
import { sampleMenuMotion, MENU_MOTION_DURATIONS } from './menuMotion.ts'
import { projectToolbarMenu } from './menuPlacement.ts'
import { createRenderSpecs, type RuntimeGeometry } from '../renderSpecs.ts'

describe('toolbar menu placement', () => {
  for (const appearance of ['light', 'dark'] as const) {
    it(`${appearance}: preserves the specimen and open panel, projects the toolbar endpoint once`, () => {
      const closed = sampleMenuMotion('close', 0, appearance, true)
      expect(projectToolbarMenu(closed)).toBe(closed)
      const toolbar = projectToolbarMenu(closed, true)
      expect(toolbar.shape.first.halfWidth * 2).toBe(44)
      expect(toolbar.shape.first.halfHeight * 2).toBe(44)
      expect(projectToolbarMenu(toolbar, true)).toBe(toolbar)
      const open = sampleMenuMotion('open', MENU_MOTION_DURATIONS.open, appearance, false)
      const projectedOpen = projectToolbarMenu(open, true)
      expect(projectedOpen.shape.first.halfWidth).toBe(open.shape.first.halfWidth)
      expect(projectedOpen.shape.first.halfHeight).toBe(open.shape.first.halfHeight)
      expect(projectedOpen.shape.first.centerY).toBe(open.shape.first.centerY + 7)
      expect(toolbar.shape.first.centerX).toBe(closed.shape.first.centerX)
      expect(toolbar.shape.first.centerY).toBe(closed.shape.first.centerY)
    })
  }
  it('moves the raster envelope and leaves all other surfaces unchanged', () => {
    const geometry: RuntimeGeometry = {
      bottomInset: 34,
      circleSize: 58,
      circleY: 58,
      dockHeight: 64,
      dockRadius: 32,
      dockWidth: 360,
      dockX: 21,
      dockY: 700,
      height: 812,
      leftX: 16,
      physicalTopInset: 62,
      rightX: 328,
      surfaceMode: 'chrome',
      width: 402,
    }
    const original = createRenderSpecs(geometry, 'light', 'none', undefined, true)
    const toolbar = createRenderSpecs(
      { ...geometry, menuOffsetX: 0, menuOffsetY: -72, menuToolbar: true },
      'light',
      'none',
      undefined,
      true,
    )
    expect(toolbar.filter(s => s.id !== 'right')).toEqual(original.filter(s => s.id !== 'right'))
    const placed = toolbar.find(s => s.id === 'right')!
    expect(placed.frameX + placed.shape.first.centerX).toBe(364)
    expect(placed.frameY + placed.shape.first.centerY).toBe(22)
  })
})
