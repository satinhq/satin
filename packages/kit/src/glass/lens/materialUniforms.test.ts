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
    it(`${appearance}: passes about six times the bar's detail, with the bar's face, rim and tint`, () => {
      // reference (owner, Oct 12): content scrolled under the pinned field read as a smear. Native's
      // field keeps 24% (dark) / 14% (light) of a title's contrast; bar glass kept 7% / 4%.
      const bar = materialUniformValues('bar', appearance),
        field = materialUniformValues('searchField', appearance)
      expect(detail(bar)).toBeCloseTo(0.05, 3)
      expect(detail(field)).toBeGreaterThan(0.25)
      expect(detail(field)).toBeLessThan(0.33)
      // A uniform interior blur, and nothing else differs from bar glass.
      const interior = field.uMaterialBlurDifferences![0]
      expect(interior).toBe(SEARCH_FIELD_RECIPE[appearance].diffusion)
      for (const [key, value] of Object.entries(bar))
        if (key !== 'uMaterialBlurFill' && key !== 'uMaterialBlurDifferences')
          expect(field[key], key).toEqual(value)
    })
  }
})
