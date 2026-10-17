import framework from '../../package.json' with { type: 'json' }
import sharp from 'sharp'
import { runInNewContext } from 'node:vm'
import { build } from 'vite'
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'
import { createBuildInfo } from './buildInfoBuild.ts'
import { defineApp } from '../public/definition.ts'
import { satinApp } from './vite.ts'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})
it('issues a distinct identity even when the app has no git checkout', () => {
  const first = createBuildInfo('build')
  const second = createBuildInfo('build')
  expect(first.frameworkVersion).toBe(framework.version)
  expect(first.appBuildId).toMatch(/^[a-f0-9]{32}$/)
  expect(second.appBuildId).not.toBe(first.appBuildId)
  expect(Date.parse(first.builtAt!)).toBeGreaterThan(0)
  expect(first.buildKind).toBe('production')
  expect(createBuildInfo('serve').buildKind).toBe('development')
})
it('embeds build metadata in ordinary release builds without the developer menu', async () => {
  const plugin = satinApp(
    defineApp({
      id: '/identity',
      name: 'Identity',
      icons: [{ src: '/icon.png', sizes: '180x180', type: 'image/png' }],
    }),
  )[0]!
  const config = plugin.config as (
    config: object,
    env: object,
  ) => { define: Record<string, string> }
  const values = config({}, { command: 'build' }).define
  expect(values['import.meta.env.SATIN_DEV_MENU']).toBe('false')
  expect(JSON.parse(values['import.meta.env.SATIN_BUILD_INFO']!)).toMatchObject({
    frameworkVersion: framework.version,
    buildKind: 'production',
  })
})
it('labels metadata unavailable when the app bypasses the build plugin', async () => {
  vi.stubEnv('SATIN_BUILD_INFO', undefined)
  const { useBuildInfo } = await import('./buildInfo.ts')
  expect(useBuildInfo()).toMatchObject({
    appBuildId: 'unavailable',
    builtAt: null,
    buildKind: 'unavailable',
  })
})

it('puts the running identity in the built JavaScript rather than a fetched server response', async () => {
  const root = await mkdtemp(join(tmpdir(), 'satin build identity %-'))
  try {
    await mkdir(join(root, 'public'))
    await writeFile(
      join(root, 'public/icon.png'),
      await sharp({ create: { width: 180, height: 180, channels: 4, background: '#0066ff' } })
        .png()
        .toBuffer(),
    )
    await writeFile(
      join(root, 'entry.ts'),
      `import { useBuildInfo } from ${JSON.stringify(fileURLToPath(new URL('./buildInfo.ts', import.meta.url)))}; globalThis.__runningBuildInfo = useBuildInfo()`,
    )
    const plugins = satinApp(
      defineApp({
        id: '/identity',
        name: 'Identity',
        icons: [{ src: '/icon.png', sizes: '180x180', type: 'image/png' }],
      }),
    )
    const output = await build({
      root,
      configFile: false,
      logLevel: 'silent',
      plugins,
      build: { write: false, minify: false, rollupOptions: { input: join(root, 'entry.ts') } },
    })
    const chunks = (Array.isArray(output) ? output : [output])
      .flatMap(bundle => ('output' in bundle ? bundle.output : []))
      .filter(chunk => chunk.type === 'chunk')
    const source = chunks.map(chunk => chunk.code).join('\n')
    const context: Record<string, unknown> = {}
    runInNewContext(source, context)
    expect(context.__runningBuildInfo).toMatchObject({
      frameworkVersion: framework.version,
      buildKind: 'production',
    })
    expect((context.__runningBuildInfo as { appBuildId: string }).appBuildId).toMatch(
      /^[a-f0-9]{32}$/,
    )
    expect(Object.isFrozen(context.__runningBuildInfo)).toBe(true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
