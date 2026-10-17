import { afterEach, expect, it, vi } from 'vitest'
afterEach(() => vi.unstubAllGlobals())
it('shares pending image decodes and retries a failed decode', async () => {
  vi.resetModules()
  let resolve!: () => void
  const decode = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<void>(r => {
          resolve = r
        }),
    )
    .mockRejectedValueOnce(Error('bad image'))
    .mockResolvedValue(undefined)
  vi.stubGlobal(
    'Image',
    class {
      src = ''
      decode = decode
    },
  )
  const { decodedGlassImage } = await import('./decodedImage.ts')
  const first = decodedGlassImage('first')
  expect(decodedGlassImage('first')).toBe(first)
  expect(decode).toHaveBeenCalledTimes(1)
  resolve()
  await first
  await expect(decodedGlassImage('bad')).rejects.toThrow('bad image')
  await expect(decodedGlassImage('bad')).resolves.toHaveProperty('src', 'bad')
  expect(decode).toHaveBeenCalledTimes(3)
  for (let index = 0; index < 65; index++) await decodedGlassImage(`album-${index}`)
  // Revisiting the first album must keep its decoded pixels after a large library visit.
  expect(await decodedGlassImage('first')).toBe(await first)
})
