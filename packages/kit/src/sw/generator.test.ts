import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { generateAppShell } from './generator.ts'

const temporaryDirectories: string[] = []

async function outputDirectory() {
  const directory = await mkdtemp(join(tmpdir(), 'satin-app-shell-'))
  temporaryDirectories.push(directory)
  await mkdir(join(directory, 'assets'), { recursive: true })
  await mkdir(join(directory, 'comparisons'), { recursive: true })
  return directory
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(directory => rm(directory, { force: true, recursive: true })),
  )
})

describe('app-shell generator', () => {
  it('emits diagnostic cache timing only when the build explicitly requests it', async () => {
    const outDir = await outputDirectory()
    await writeFile(join(outDir, 'index.html'), '<main>shell</main>')
    const production = await generateAppShell({ outDir })
    expect(await readFile(production.serviceWorkerFile, 'utf8')).not.toContain('x-sw-match-ms')

    const diagnostic = await generateAppShell({ outDir, diagnosticTimingHeaders: true })
    expect(await readFile(diagnostic.serviceWorkerFile, 'utf8')).toContain('x-sw-match-ms')
    expect(diagnostic.manifest.buildId).toBe(production.manifest.buildId)
  })

  it('derives a deterministic manifest from actual Vite output categories', async () => {
    const outDir = await outputDirectory()
    await Promise.all([
      writeFile(join(outDir, 'index.html'), '<script src="/assets/index-a1b2c3d4.js"></script>'),
      writeFile(join(outDir, 'assets/index-a1b2c3d4.js'), 'export const build = 1'),
      writeFile(join(outDir, 'assets/index-b2c3d4e5.css'), 'body { color: black; }'),
      writeFile(join(outDir, 'assets/scene-c3d4e5f6.png'), 'bundled image'),
      writeFile(join(outDir, 'manifest.webmanifest'), '{"name":"Specimen"}'),
      writeFile(join(outDir, 'apple-touch-icon.png'), 'icon'),
      writeFile(join(outDir, 'glass-landscape.svg'), '<svg/>'),
      writeFile(join(outDir, 'runtime-response.json'), '{"private":true}'),
      writeFile(join(outDir, 'comparisons/evidence.mp4'), 'large evidence'),
    ])

    const first = await generateAppShell({
      additionalPrecache: ['glass-landscape.svg'],
      base: '/lab/',
      bundleFiles: new Set([
        'assets/index-a1b2c3d4.js',
        'assets/index-b2c3d4e5.css',
        'assets/scene-c3d4e5f6.png',
        'index.html',
      ]),
      outDir,
    })
    const second = await generateAppShell({
      additionalPrecache: ['glass-landscape.svg'],
      base: '/lab/',
      bundleFiles: new Set([
        'assets/index-a1b2c3d4.js',
        'assets/index-b2c3d4e5.css',
        'assets/scene-c3d4e5f6.png',
        'index.html',
      ]),
      outDir,
    })

    expect(second.manifest).toEqual(first.manifest)
    expect(first.manifest.shellUrl).toBe('/lab/')
    expect(first.manifest.entries.map(entry => entry.url)).toEqual([
      '/lab/',
      '/lab/apple-touch-icon.png',
      '/lab/assets/index-a1b2c3d4.js',
      '/lab/assets/index-b2c3d4e5.css',
      '/lab/assets/scene-c3d4e5f6.png',
      '/lab/glass-landscape.svg',
      '/lab/manifest.webmanifest',
    ])
    expect(first.manifest.entries.find(entry => entry.url.endsWith('.js'))?.revision).toBeNull()
    expect(
      first.manifest.entries.find(entry => entry.url.endsWith('.webmanifest'))?.revision,
    ).toMatch(/^[a-f0-9]{64}$/u)
    expect(first.manifest.entries.some(entry => entry.url.includes('runtime-response'))).toBe(false)
    expect(first.manifest.entries.some(entry => entry.url.includes('comparisons'))).toBe(false)

    const serialized = JSON.parse(await readFile(first.manifestFile, 'utf8')) as {
      buildId: string
    }
    expect(serialized.buildId).toBe(first.manifest.buildId)
    expect(JSON.parse(await readFile(join(outDir, 'satin-version.json'), 'utf8'))).toEqual({
      format: 1,
      buildId: first.manifest.buildId,
    })
    expect(first.manifest.entries.some(entry => entry.url.endsWith('satin-version.json'))).toBe(
      false,
    )
    expect(await readFile(first.serviceWorkerFile, 'utf8')).toContain(
      `const BUILD_ID = "${first.manifest.buildId}"`,
    )
  })

  it('changes the build ID when unhashed shell content changes', async () => {
    const outDir = await outputDirectory()
    await writeFile(join(outDir, 'index.html'), '<main>first</main>')
    const first = await generateAppShell({ outDir })

    await writeFile(join(outDir, 'index.html'), '<main>second</main>')
    const second = await generateAppShell({ outDir })

    expect(second.manifest.buildId).not.toBe(first.manifest.buildId)
  })

  it('fails the build when an explicitly required app-screen asset is missing', async () => {
    const outDir = await outputDirectory()
    await writeFile(join(outDir, 'index.html'), '<main>shell</main>')

    await expect(
      generateAppShell({
        additionalPrecache: ['missing-screen.svg'],
        outDir,
      }),
    ).rejects.toThrow('missing-screen.svg')
  })
})
