import { afterEach, expect, it, vi } from 'vitest'
import {
  drawGlassBitmapBackdrop,
  prepareGlassBitmapBackdrop,
  registerGlassBitmapBackdrop,
} from './bitmapBackdrop.ts'
afterEach(() => vi.unstubAllGlobals())
it('rejects non-finite fixture dimensions before canvas allocation', () => {
  expect(() =>
    registerGlassBitmapBackdrop('bitmap-invalid', {
      url: '/fixture.png',
      widthPt: Infinity,
      heightPt: 1900,
    }),
  ).toThrow('Invalid')
})
it('shares decoding and retries a failed load without exposing an undecoded source', async () => {
  const decode = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValue(undefined)
  vi.stubGlobal(
    'Image',
    class {
      src = ''
      decode = decode
    },
  )
  registerGlassBitmapBackdrop('bitmap-retry', { url: '/fixture.png', widthPt: 440, heightPt: 1900 })
  const context = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D
  expect(() => drawGlassBitmapBackdrop(context, 'bitmap-retry')).toThrow('not decoded')
  const first = prepareGlassBitmapBackdrop('bitmap-retry')
  expect(prepareGlassBitmapBackdrop('bitmap-retry')).toBe(first)
  await expect(first).rejects.toThrow('network')
  await prepareGlassBitmapBackdrop('bitmap-retry')
  drawGlassBitmapBackdrop(context, 'bitmap-retry')
  expect(decode).toHaveBeenCalledTimes(2)
  expect(context.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 440, 1900)
})
