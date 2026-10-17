import { tabGlyphContextStyle } from './tabGlyphColours.ts'
import selectionRecipes from './selectionParameters.json'
import { describe, expect, it } from 'vitest'
import { stableTabSelection, tabSelectionCapsule } from './tabSelectionMaterial.ts'

describe('resting tab selection material', () => {
  it('keeps the measured contour correction finite and narrower than one point', () => {
    for (const appearance of ['light', 'dark'] as const) {
      const contour = selectionRecipes[appearance].contour
      expect(contour.width).toBeGreaterThan(0)
      expect(contour.width).toBeLessThan(1)
      expect(Number.isFinite(contour.center)).toBe(true)
      expect(contour.angular).toHaveLength(4)
      expect(contour.angular.every(Number.isFinite)).toBe(true)
    }
  })

  it('calibrates the SDF to the measured 98 by 54 visible capsule at each native tab centre', () => {
    expect(
      [0, 1, 2, 3].map(index => ({
        ...stableTabSelection('light'),
        capsule: tabSelectionCapsule(index),
      })),
    ).toMatchObject([
      {
        blurSigmaCssPx: 4.5,
        capsule: { centerX: 53, centerY: 31, halfHeight: 26, halfWidth: 48, radius: 26 },
      },
      { blurSigmaCssPx: 4.5, capsule: { centerX: 138 } },
      { blurSigmaCssPx: 4.5, capsule: { centerX: 223 } },
      { blurSigmaCssPx: 4.5, capsule: { centerX: 308 } },
    ])
  })

  it('uses fresh native vibrancy colours instead of constant provisional glyph colours', () => {
    expect(tabGlyphContextStyle('light', [0, 0, 0])).toMatchObject({
      '--tab-selected-icon': 'rgb(35.624 86.575 194.858)',
      '--tab-unselected-icon': 'rgb(0.000 0.000 0.000)',
    })
    expect(tabGlyphContextStyle('dark', [10 / 255, 132 / 255, 1])).toMatchObject({
      '--tab-selected-icon': 'rgb(126.272 250.412 253.082)',
      '--tab-unselected-icon': 'rgb(241.943 254.490 254.738)',
    })
  })
})

it('preserves explicit app tint across appearance and sampled backdrops', () => {
  for (const appearance of ['light', 'dark'] as const) {
    for (const backdrop of [
      [0, 0, 0],
      [1, 1, 1],
      [0.1, 0.5, 1],
    ]) {
      const defaults = tabGlyphContextStyle(appearance, backdrop)
      const tinted = tabGlyphContextStyle(appearance, backdrop, '#d9480f')
      expect(tinted['--tab-selected-icon']).toBe('#d9480f')
      expect(tinted['--tab-selected-label']).toBe('#d9480f')
      expect(tinted['--tab-unselected-icon']).toBe(defaults['--tab-unselected-icon'])
      expect(tinted['--tab-unselected-label']).toBe(defaults['--tab-unselected-label'])
    }
  }
})
