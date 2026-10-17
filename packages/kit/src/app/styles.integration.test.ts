import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { build, createServer, type HMRPayload } from 'vite'
import { defineSatinApp } from './definition.ts'
import { satinApp } from './vite.ts'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

const stylesheet = fileURLToPath(new URL('../styles.css', import.meta.url))

async function fixture(explicit: boolean, base = '/') {
  const root = await mkdtemp(join(process.env.SATIN_SCRATCH_ROOT ?? tmpdir(), 'satin css -'))
  directories.push(root)
  await mkdir(join(root, 'public'))
  await writeFile(
    join(root, 'public/icon.png'),
    await sharp({
      create: { width: 512, height: 512, channels: 4, background: '#123456' },
    })
      .png()
      .toBuffer(),
  )
  await writeFile(
    join(root, 'index.html'),
    '<html><head></head><body><script type="module" src="/main.js"></script></body></html>',
  )
  // Even an old import after app CSS must not load a second copy.
  await writeFile(
    join(root, 'main.js'),
    `import './app.css';${explicit ? "import '@satinhq/kit/styles.css';" : ''}document.body.dataset.loaded='true'`,
  )
  await writeFile(join(root, 'app.css'), '[data-satin-root="true"] { --app-css-order: 1; }')
  const app = defineSatinApp({
    platforms: 'all',
    id: '/css',
    name: 'CSS test',
    shortName: 'CSS',
    description: 'CSS test',
    scope: base,
    startRoute: base,
    icons: [{ src: base + 'icon.png', sizes: '512x512', type: 'image/png' }],
    appearance: { background: '#ffffff', darkLaunch: { background: '#000000' } },
    orientations: { supported: ['portrait', 'landscape'], fallback: 'none' },
    connectivity: 'local',
    capabilities: [],
    updateActivation: 'cold-launch',
    appShell: { additionalPrecache: [] },
  })
  return { root, app }
}

it.each([
  ['/', false],
  ['/', true],
  ['/nested/', false],
  ['/nested/', true],
] as const)(
  'includes CSS once before app CSS, base %s, explicit import: %s',
  async (base, explicit) => {
    const { root, app } = await fixture(explicit, base)
    await build({
      root,
      base,
      configFile: false,
      logLevel: 'silent',
      plugins: satinApp(app),
      resolve: { alias: { '@satinhq/kit/styles.css': stylesheet } },
      build: { minify: false, cssMinify: false },
    })
    const html = await readFile(join(root, 'dist/index.html'), 'utf8')
    const links = [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)]
    const css = (
      await Promise.all(
        links.map(link => readFile(join(root, 'dist', link[1]!.slice(base.length)), 'utf8')),
      )
    ).join('\n')
    expect(css.split('Native text defaults').length - 1).toBe(1)
    expect(css.indexOf('Native text defaults')).toBeLessThan(css.indexOf('--app-css-order'))
    expect(html.indexOf('rel="stylesheet"')).toBeLessThan(html.indexOf('<body'))
    const sw = await readFile(join(root, 'dist/sw.js'), 'utf8')
    for (const link of links) expect(sw).toContain(link[1])
  },
  30_000,
)

it('uses one blocking dev stylesheet and sends CSS HMR without a legacy style injector', async () => {
  const { root, app } = await fixture(true)
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: satinApp(app),
    resolve: { alias: { '@satinhq/kit/styles.css': stylesheet } },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [root, stylesheet] } },
  })
  try {
    await server.listen()
    const address = server.httpServer!.address() as { port: number }
    const origin = `http://127.0.0.1:${address.port}`
    const html = await (await fetch(origin)).text()
    const links = [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)]
    expect(links).toHaveLength(1)
    expect(html.indexOf('rel="stylesheet"')).toBeLessThan(html.indexOf('<body'))
    const response = await fetch(origin + links[0]![1], { headers: { Accept: 'text/css' } })
    expect(response.headers.get('content-type')).toContain('text/css')
    expect(await response.text()).toContain('Native text defaults')
    const main = await server.transformRequest('/main.js')
    expect(main!.code).toContain('satin:included-styles')
    const legacy = await (await fetch(origin + '/@id/__x00__satin:included-styles')).text()
    expect(legacy).toContain('export {}')
    expect(legacy).not.toContain('updateStyle')
    const sent: HMRPayload[] = []
    vi.spyOn(server.ws, 'send').mockImplementation((payload: HMRPayload | string) => {
      if (typeof payload !== 'string') sent.push(payload)
    })
    server.watcher.emit('change', stylesheet)
    await vi.waitFor(() =>
      expect(
        sent.some(
          payload =>
            payload.type === 'update' &&
            payload.updates.some(
              update =>
                update.type === 'css-update' &&
                update.path.split('?')[0] === links[0]![1]!.split('?')[0],
            ),
        ),
      ).toBe(true),
    )
  } finally {
    await server.close()
  }
}, 30_000)
