import { describe, expect, it } from 'vitest'
import {
  MENU_SHADOW_RESPONSE,
  SEARCH_FIELD_RECIPE,
  materialUniformMix,
  materialUniformValues,
} from './materialUniforms.ts'

describe('bar-to-menu recipe interpolation', () => {
  for (const appearance of ['light', 'dark'] as const) {
    it(`${appearance}: ends on the bar and menu recipes and stays finite between`, () => {
      expect(materialUniformMix(appearance, 0)).toEqual(materialUniformValues('bar', appearance))
      expect(materialUniformMix(appearance, 1)).toEqual(materialUniformValues('menu', appearance))
      const bar = materialUniformValues('bar', appearance),
        menu = materialUniformValues('menu', appearance),
        mid = materialUniformMix(appearance, 0.5)
      for (const [key, value] of Object.entries(mid)) {
        expect(value).toHaveLength((bar[key] as number[]).length)
        value.forEach((v, i) =>
          expect(v).toBeCloseTo(((bar[key] as number[])[i] + (menu[key] as number[])[i]) / 2, 9),
        )
      }
    })
    it(`${appearance}: the menu shadow is the native fit`, () => {
      expect(materialUniformValues('menu', appearance).uMaterialShadowResponse).toEqual([
        ...MENU_SHADOW_RESPONSE[appearance],
      ])
    })
  }
})

describe('search drawer field row', () => {
  /** The share of sharp detail the material passes: what the wide fill does not replace. */
  const detail = (values: Record<string, number[]>) => {
    const [, maxWeight, minWeight, mix] = values.uMaterialBlurFill!
    return (1 - mix!) * (1 - maxWeight! - minWeight!)
  }
  for (const appearance of ['light', 'dark'] as const) {
    it(`${appearance}: preserves the measured field transmission independently of the regular control row`, () => {
      const bar = materialUniformValues('bar', appearance)
      const field = materialUniformValues('searchField', appearance)
      if (appearance === 'dark') {
        // Dark retains its shipped explicit field recipe; toolbar search still uses chrome.
        expect(detail(bar)).toBeLessThan(detail(field))
        expect(detail(field)).toBeCloseTo(0.28832, 5)
      } else {
        // The fitted light arm replaces sharp detail; a constant mixture restores contrast.
        expect(detail(field)).toBe(0)
      }
      // A uniform interior blur, and nothing else differs from bar glass.
      const interior = field.uMaterialBlurDifferences![0]
      expect(interior).toBe(SEARCH_FIELD_RECIPE[appearance].diffusion)
      for (const [key, value] of Object.entries(bar))
        if (key !== 'uMaterialBlurFill' && key !== 'uMaterialBlurDifferences')
          expect(field[key], key).toEqual(value)
    })
  }
})
