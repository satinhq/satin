import { expect, it, vi } from 'vitest'
import { defineApp, appDefinitionForBase } from './definition.ts'
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

it('derives deployment paths from Vite base in both config and runtime', () => {
  const input = {
    id: 'mail',
    name: 'Mail',
    icons: { source: '/icon.png' },
    connectivity: 'server' as const,
    reachability: {
      probe: { url: '/__reachability', method: 'HEAD' as const, timeoutMs: 3000 },
      defaultRoutePolicy: 'requires-server' as const,
      routes: {},
      surfaces: { localFirst: 'banner' as const, requiresServer: 'full-screen' as const },
    },
  }
  const configured = appDefinitionForBase(defineApp(input), '/ios/')
  vi.stubEnv('BASE_URL', '/ios/')
  try {
    expect(configured).toEqual(defineApp(input))
  } finally {
    vi.unstubAllEnvs()
  }
  expect(configured.scope).toBe('/ios/')
  expect(configured.startRoute).toBe('/ios/')
  expect(configured.installRoute).toBe('/ios/install')
  expect(configured.iconSource).toBe('/ios/icon.png')
  expect(configured.icons[0]!.src).toBe('/ios/satin-mail-icon-180.png')
  expect(configured.reachability?.probe.url).toBe('/ios/__reachability')
})

it('rejects a navigation route used as an emitted start page before building', () => {
  expect(() =>
    defineApp({
      id: 'mail',
      name: 'Mail',
      icons: { source: '/icon.png' },
      advanced: { scope: '/ios/', startRoute: '/ios/app/' },
    }),
  ).toThrow('app entry is emitted at scope')
})
