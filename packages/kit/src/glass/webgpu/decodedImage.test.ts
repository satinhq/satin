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

it('retires cancelled speculative artwork but preserves a decode adopted by a destination', async () => {
  vi.resetModules()
  const images: { src: string; resolve: () => void }[] = []
  vi.stubGlobal(
    'Image',
    class {
      src = ''
      resolve!: () => void
      constructor() {
        images.push(this)
      }
      decode() {
        return new Promise<void>(resolve => {
          this.resolve = resolve
        })
      }
      removeAttribute(name: string) {
        if (name === 'src') this.src = ''
      }
    },
  )
  const { decodedGlassImage } = await import('./decodedImage.ts')
  const abandoned = new AbortController()
  const first = decodedGlassImage('cancelled-art', {}, abandoned.signal)
  const cancelled = expect(first).rejects.toMatchObject({ name: 'AbortError' })
  abandoned.abort()
  await cancelled
  expect(images[0]!.src).toBe('')
  images[0]!.resolve()
  await Promise.resolve()
  const accepted = new AbortController()
  const prefetch = decodedGlassImage('destination-art', {}, accepted.signal)
  const destination = decodedGlassImage('destination-art')
  const released = expect(prefetch).rejects.toMatchObject({ name: 'AbortError' })
  accepted.abort()
  await released
  expect(images[1]!.src).toBe('destination-art')
  images[1]!.resolve()
  expect(await destination).toBe(images[1])
  expect(images).toHaveLength(2)
})
