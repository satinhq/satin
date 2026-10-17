import { expect, it } from 'vitest'
import { alertDiffusionUniforms, presentationDiffusionTaps } from './presentationDiffusion.ts'
import { presentationSigma, presentationWeights } from './presentationMaterial.ts'

function impulse(taps: readonly { offset: number; weight: number }[]) {
  const response = new Map<number, number>()
  for (const tap of taps)
    for (const sign of tap.offset === 0 ? [1] : [-1, 1]) {
      const position = sign * tap.offset,
        left = Math.floor(position),
        fraction = position - left
      response.set(left, (response.get(left) ?? 0) + tap.weight * (1 - fraction))
      response.set(left + 1, (response.get(left + 1) ?? 0) + tap.weight * fraction)
    }
  return response
}
it.each(['sheet', 'alert'] as const)(
  'diffuses a %s thin stroke into one smooth lobe instead of separated copies',
  treatment => {
    const sigma = presentationSigma(treatment),
      reach = Math.ceil(3 * sigma)
    const response = impulse(presentationDiffusionTaps(sigma))
    const dense = Array.from({ length: 2 * reach + 1 }, (_, i) =>
      Math.exp(-0.5 * ((i - reach) / sigma) ** 2),
    )
    const total = dense.reduce((a, b) => a + b, 0)
    for (let x = -reach; x <= reach; x++)
      expect(response.get(x)).toBeCloseTo(dense[x + reach]! / total, 12)
    // Reconstruct the previous production tap train. The gaps are the artifact,
    // so this criterion fails if the sparse sigma-spaced kernel is restored.
    const sparse = impulse(
      [...presentationWeights[0], ...presentationWeights[1]]
        .slice(0, 7)
        .map((weight, i) => ({ weight, offset: i * sigma * 0.5 })),
    )
    expect(sparse.get(3) ?? 0).toBe(0)
    expect(response.get(3)).toBeGreaterThan(0.02)
  },
)
it('preserves flat fields and the fitted sigma at fractional surface sizes', () => {
  const taps = presentationDiffusionTaps(presentationSigma('alert'))
  expect(taps[0]!.weight + 2 * taps.slice(1).reduce((sum, t) => sum + t.weight, 0)).toBeCloseTo(
    1,
    14,
  )
  const horizontal = alertDiffusionUniforms(360.25, 280.75, [1, 0], 541, 422, 1.5, Math.log2(1.5))
  expect(horizontal.uSource).toEqual([
    1.5 / 541,
    1.5 / 422,
    (360.25 * 1.5) / 541,
    (280.75 * 1.5) / 422,
  ])
  const vertical = alertDiffusionUniforms(360.25, 280.75, [0, 1], 361, 281)
  expect(vertical.uSource).toEqual([1 / 361, 1 / 281, 1, 1])
})

it('captures enough exterior backdrop for the alert diffusion kernel', async () => {
  const { contextSampleInset } = await import('./contextComposite.ts')
  expect(contextSampleInset('alert')).toBeGreaterThanOrEqual(
    Math.ceil(3 * presentationSigma('alert')),
  )
  expect(contextSampleInset('sheet')).toBe(20)
  // The confirmation popover shares the alert's near-opaque diffusion (reference confirm).
  expect(contextSampleInset('confirmation')).toBe(contextSampleInset('alert'))
})

it.each([2, 3])('prefilters the sheet at DPR %i onto a CSS sampling grid', dpr => {
  const width = 440.25
  const height = 956.25
  const sourceScale = dpr * 0.5
  const sourceWidth = Math.ceil(width * sourceScale)
  const sourceHeight = Math.ceil(height * sourceScale)
  const mip = Math.log2(sourceScale)
  const values = alertDiffusionUniforms(
    width,
    height,
    [1, 0],
    sourceWidth,
    sourceHeight,
    sourceScale,
    mip,
  )
  expect(values.uSource).toEqual([
    sourceScale / sourceWidth,
    sourceScale / sourceHeight,
    (width * sourceScale) / sourceWidth,
    (height * sourceScale) / sourceHeight,
  ])
  const taps = presentationDiffusionTaps(presentationSigma('sheet'))
  const response = impulse(taps)
  const total = [...response.values()].reduce((sum, weight) => sum + weight, 0)
  expect(total).toBeCloseTo(1, 12)
  for (let position = 0; position < 29; position++) {
    expect(response.get(position)).toBeGreaterThan(response.get(position + 1)!)
  }
})
