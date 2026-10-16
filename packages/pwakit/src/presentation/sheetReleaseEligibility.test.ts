// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { canReleaseSheetOnCompositor } from './sheetReleaseMotion.ts'
import { setGlassShapeTrack } from '../glass/shapeTrackRegistry.ts'

const layer = document.createElement('div')
afterEach(() => {
  layer.replaceChildren()
  vi.restoreAllMocks()
})
function sheet(nested = false) {
  layer.innerHTML = `<div class="satin-presentation-surface"><p>Content</p>${nested ? '<div data-satin-glass-region-id="toolbar">Done</div>' : ''}</div>`
  return layer.firstElementChild as HTMLElement
}

it('only hands off the constant-layout downward tail', () => {
  sheet()
  expect(canReleaseSheetOnCompositor(layer, 400, 500, 1)).toBe(true)
  expect(canReleaseSheetOnCompositor(layer, 501, 500, 1)).toBe(false)
  expect(canReleaseSheetOnCompositor(layer, 400, 500, -1)).toBe(false)
})

it('allows static nested glass but rejects an independent contour track', () => {
  const surface = sheet(true)
  vi.spyOn(surface, 'getAnimations').mockReturnValue([])
  expect(canReleaseSheetOnCompositor(layer, 400, 500, 1)).toBe(true)
  const glass = surface.querySelector<HTMLElement>('[data-satin-glass-region-id]')!
  setGlassShapeTrack(glass, {
    epoch: 0,
    duration: 700,
    frames: [
      { x: 0, y: 0, width: 100, height: 44 },
      { x: 0, y: 0, width: 200, height: 44 },
    ],
  })
  expect(canReleaseSheetOnCompositor(layer, 400, 500, 1)).toBe(false)
  setGlassShapeTrack(glass, undefined)
})

it('rejects a moving sibling source behind nested glass', () => {
  const surface = sheet(true)
  vi.spyOn(surface, 'getAnimations').mockReturnValue([
    {
      playState: 'running',
      effect: {
        getKeyframes: () => [{ transform: 'translateY(0px)' }, { transform: 'translateY(40px)' }],
      },
    } as unknown as Animation,
  ])
  expect(canReleaseSheetOnCompositor(layer, 400, 500, 1)).toBe(false)
})
