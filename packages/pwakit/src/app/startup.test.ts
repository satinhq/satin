import { expect, it } from 'vitest'
import sharp from 'sharp'
import { startupImages } from './startup.ts'
import { generateStartupImage } from './icons.ts'
it('covers both orientations and appearances of the acceptance devices', () => {
  const images = startupImages('test', '#ffffff', '#ffffff')
  expect(images).toHaveLength(16)
  expect(images[0]).toMatchObject({ width: 1206, height: 2622, color: '#ffffff' })
  expect(images[1]).toMatchObject({ width: 1206, height: 2622, color: '#ffffff' })
  expect(images[2]).toMatchObject({ width: 2622, height: 1206 })
  expect(images.find(image => image.file === 'test-launch-440-portrait-dark.png')).toMatchObject({
    width: 1320,
    height: 2868,
    color: '#ffffff',
    media: expect.stringContaining('(device-width: 440px) and (device-height: 956px)'),
  })
  expect(new Set(images.map(image => image.file)).size).toBe(16)
})

it('does not freeze an appearance-specific launch colour into a WebClip bitmap', () => {
  const images = startupImages('test', '#ffffff', '#000000')
  expect(images).toHaveLength(16)
  expect(images.every(image => image.color === null)).toBe(true)
  expect(images.find(image => image.file === 'test-launch-1024-portrait-light.png')).toMatchObject({
    width: 2048,
    height: 2732,
    ratio: 2,
  })
})

it('keeps native-cover pixels transparent around a centered, rounded app icon', async () => {
  const source = await sharp({
    create: {
      width: 180,
      height: 180,
      channels: 4,
      background: '#0066ff',
    },
  })
    .png()
    .toBuffer()
  for (const background of [null, '#f2efe8']) {
    const png = await generateStartupImage(source, 2048, 2732, 2, background)
    const { data, info } = await sharp(png)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const pixel = (x: number, y: number) => [
      ...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4),
    ]
    expect([info.width, info.height]).toEqual([2048, 2732])
    expect(pixel(1024, 1366)).toEqual([0, 102, 255, 255])
    const outside = background ? [242, 239, 232, 255] : [0, 0, 0, 0]
    expect(pixel(0, 0)).toEqual(outside)
    expect(pixel(956, 1298)).toEqual(outside)
    expect(pixel(1024, 1298)).toEqual([0, 102, 255, 255])
  }
})
