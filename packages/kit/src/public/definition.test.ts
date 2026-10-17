import { expect, it } from 'vitest'
import { defineApp } from './definition.ts'
import { generateAppIcons } from '../app/icons.ts'
import sharp from 'sharp'
it('defaults installation intent and derives icon URLs consistently at build and runtime', async () => {
  const app = defineApp({
    id: 'lift-log',
    name: 'Lift Log',
    icons: { source: '/app/icon-1024.png' },
    appearance: { tint: '#FF9500' },
    advanced: { scope: '/app/' },
  })
  expect(app.appearance).toEqual({
    background: '#f2f2f7',
    tint: '#ff9500',
    darkLaunch: { background: '#000000' },
  })
  expect(app.iconSource).toBe('/app/icon-1024.png')
  expect(app.icons.map(icon => icon.sizes)).toEqual(['180x180', '192x192', '512x512'])
  const images = await generateAppIcons(
    await sharp({ create: { width: 1024, height: 1024, channels: 4, background: '#ff9500' } })
      .png()
      .toBuffer(),
  )
  for (const [size, png] of images) {
    const metadata = await sharp(png).metadata()
    expect(metadata.width).toBe(size)
    expect(metadata.height).toBe(size)
    expect(metadata.format).toBe('png')
  }
  await expect(
    generateAppIcons(
      await sharp({ create: { width: 180, height: 180, channels: 4, background: '#ffffff' } })
        .png()
        .toBuffer(),
    ),
  ).rejects.toThrow('at least 512')
  expect(() =>
    defineApp({ id: 'x', name: 'X', icons: { source: 'https://example.com/icon.png' } }),
  ).toThrow()
})
