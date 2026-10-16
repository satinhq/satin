import { expect, it } from 'vitest'
import { TAB_CHROMA_BLUE, TAB_CHROMA_RIM } from './tabChromaRimModel.ts'
import { TAB_MATERIAL_LUMINANCES } from './tabMaterialModel.ts'

it('keeps the chroma correction zero at every native flat calibration', () => {
  const anchors = [
    [0, 0, 0],
    [32, 32, 32],
    [10, 132, 255],
    [216, 216, 216],
    [255, 255, 255],
  ]
  for (const model of Object.values(TAB_CHROMA_RIM))
    for (const [i, anchor] of anchors.entries()) {
      const rgb = anchor.map(v => v / 255),
        y = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
      expect(y).toBeCloseTo(TAB_MATERIAL_LUMINANCES[i], 12)
      const direction = rgb.map(v => v - y),
        c = Math.hypot(...direction),
        p = model.chroma[i]
      const delta = direction.map(
        v => v * (p[0] + p[1] * (c - TAB_CHROMA_BLUE)) + c * (p[2] + p[3] * (c - TAB_CHROMA_BLUE)),
      )
      delta.forEach(v => expect(v).toBeCloseTo(0, 12))
    }
})
it('keeps the rim compact and leaves the bar interior colour transfer unchanged', () => {
  for (const [key, model] of Object.entries(TAB_CHROMA_RIM)) {
    expect(model.rim.width).toBeLessThan(2)
    expect(model.rim.aa + Math.abs(model.rim.center)).toBeLessThan(1)
    if (key.endsWith('-bar')) expect(model.chroma.flat().every(v => v === 0)).toBe(true)
  }
})
