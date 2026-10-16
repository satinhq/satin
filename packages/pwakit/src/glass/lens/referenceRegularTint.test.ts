import { describe, expect, it } from 'vitest'
import {
  applyReferenceRegularTint,
  REFERENCE_REGULAR_TINT_PRESETS,
  referenceRegularTintAt,
} from './referenceRegularTint.ts'

const samples = [
  { input: [0, 0, 0], light: [19, 19, 19], dark: [19, 19, 19] },
  { input: [32, 32, 32], light: [28, 28, 28], dark: [28, 28, 28] },
  { input: [10, 132, 255], light: [149, 206, 255], dark: [24, 93, 163] },
  { input: [216, 216, 216], light: [244, 244, 244], dark: [107, 107, 107] },
  { input: [255, 255, 255], light: [253, 253, 253], dark: [253, 253, 253] },
] as const

describe('measured-reference adaptive regular tint', () => {
  for (const appearance of ['light', 'dark'] as const) {
    it(`fits all five isolated native ${appearance} backdrops within the six-level gate`, () => {
      for (const sample of samples) {
        const actual = applyReferenceRegularTint(
          sample.input,
          REFERENCE_REGULAR_TINT_PRESETS[appearance],
        )
        sample[appearance].forEach((expected, channel) =>
          expect(Math.abs(actual[channel] - expected)).toBeLessThanOrEqual(6),
        )
      }
    })
  }

  it('interpolates without a discontinuity at any luminance knot', () => {
    for (const preset of Object.values(REFERENCE_REGULAR_TINT_PRESETS)) {
      for (const knot of preset.luminances.slice(1, -1)) {
        const before = referenceRegularTintAt(knot - 0.00001, preset)
        const after = referenceRegularTintAt(knot + 0.00001, preset)
        expect(Math.abs(before.gain - after.gain)).toBeLessThan(0.001)
        expect(Math.abs(before.whiteMix - after.whiteMix)).toBeLessThan(0.001)
      }
    }
  })
})
