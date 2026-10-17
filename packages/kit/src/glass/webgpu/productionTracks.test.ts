import { expect, it } from 'vitest'
import { interpolateValue, sampleNavigation, sampleRegion } from './productionTracks.ts'
import { rasterSetup } from '../worker/fixture.ts'
it('interpolates shape geometry and preserves exact material endpoints', () => {
  const a = rasterSetup('light', 'dock').spec,
    b = { ...a, shape: { ...a.shape, first: { ...a.shape.first, centerX: 80 } } }
  const track = { id: 'chrome', epoch: 1000, duration: 100, specs: [a, b] }
  expect(sampleRegion(track, 1000)).toEqual(a)
  expect(sampleRegion(track, 1100)).toEqual(b)
  expect(sampleRegion(track, 1050).shape.first.centerX).toBe((a.shape.first.centerX + 80) / 2)
  expect(interpolateValue({ enabled: true }, { enabled: false }, 1)).toEqual({ enabled: false })
})
it('evaluates navigation positions and dimming on a shared epoch', () => {
  const first = { frontX: 0, rearX: -132, frontDim: 0, rearDim: 0.12 },
    last = { frontX: 440, rearX: 0, frontDim: 0, rearDim: 0 }
  const track = { epoch: 500, duration: 200, poses: [first, last] }
  expect(sampleNavigation(track, 600)).toEqual({
    frontX: 220,
    rearX: -66,
    frontDim: 0,
    rearDim: 0.06,
  })
  expect(sampleNavigation(track, 10000)).toEqual(last)
})
