import { expect, it } from 'vitest'
import { glassDeviceLimits } from './deviceLimits.ts'

it('asks for the adapter’s full texture side so a long scroll plane fits (80 rows at 3x)', () => {
  const adapter = { limits: { maxTextureDimension2D: 16384 } } as unknown as GPUAdapter
  expect(glassDeviceLimits(adapter)).toEqual({ maxTextureDimension2D: 16384 })
  expect(3500 * 3).toBeLessThanOrEqual(glassDeviceLimits(adapter).maxTextureDimension2D!)
  expect(glassDeviceLimits({} as GPUAdapter)).toEqual({})
})
