import sharp from 'sharp'
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { TextEncoder } from 'node:util'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { createContext, runInContext } from 'node:vm'
import { build, createServer } from 'vite'
import { defineSatinApp } from './definition.ts'
import { satinApp } from './vite.ts'
import { appManifestStem, generateAppHead } from './head.ts'
import { gateAppScripts } from './platformScripts.ts'

const require = createRequire(import.meta.url)
type TestWindow = Window & {
  __SATIN_PLATFORM_BLOCKED__?: boolean
  classicStarted?: boolean
}
const { JSDOM, VirtualConsole } = require('jsdom') as {
  JSDOM: new (
    html: string,
    options?: {
      runScripts: 'dangerously'
      url: string
      virtualConsole: InstanceType<typeof VirtualConsole>
      beforeParse(window: TestWindow): void
    },
  ) => { window: TestWindow }
  VirtualConsole: new () => { on(event: string, listener: (error: Error) => void): void }
}
const labRequire = createRequire(new URL('../../package.json', import.meta.url))
const directories: string[] = []
const app = defineSatinApp({
  id: '/script-proof',
  name: 'Script proof',
  shortName: 'Script proof',
  description: 'Platform script integration regression',
  scope: '/',
  startRoute: '/',
  icons: [{ src: '/icon.png', sizes: '512x512', type: 'image/png' }],
  appearance: { background: '#ffffff', darkLaunch: 'match-light' },
  orientations: { supported: ['portrait', 'landscape'], fallback: 'none' },
  connectivity: 'local',

  capabilities: [],
  updateActivation: 'cold-launch',
  appShell: { additionalPrecache: [] },
})

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })),
  )
})

async function fixture() {
  const parent = process.env.SATIN_SCRATCH_ROOT ?? join(process.cwd(), 'node_modules/.cache')
  await mkdir(parent, { recursive: true })
  const root = await mkdtemp(join(parent, 'platform-script-proof-'))
  directories.push(root)
  await mkdir(join(root, 'public'))
  await writeFile(
    join(root, 'public/icon.png'),
    await sharp({ create: { width: 180, height: 180, channels: 4, background: '#0066ff' } })
      .png()
      .toBuffer(),
  )
  await writeFile(join(root, 'entry.js'), 'window.appStarted = true')
  const html =
    '<html><head></head><body><script>window.classicStarted = true</script>' +
    '<script type="module" src="/entry.js"></script></body></html>'
  await writeFile(join(root, 'index.html'), html)
  return { root, html }
}

function executeHead(html: string, ios: boolean, url = 'https://app.test/', standalone = true) {
  const errors: Error[] = []
  const navigation: Error[] = []
  const virtualConsole = new VirtualConsole()
  virtualConsole.on('jsdomError', error => {
    if (error.message.includes('Not implemented: navigation')) navigation.push(error)
    else if (!(error as Error & { type?: string }).type?.includes('css parsing')) errors.push(error)
  })
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url,
    virtualConsole,
    beforeParse(window) {
      Object.defineProperty(window, 'TextEncoder', { value: TextEncoder })
      Object.defineProperties(window.navigator, {
        userAgent: { value: ios ? 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15' : 'Desktop' },
        platform: { value: ios ? 'iPhone' : 'Linux' },
        maxTouchPoints: { value: ios ? 5 : 0 },
        ...(ios ? { standalone: { value: standalone } } : {}),
      })
      Object.defineProperty(window, 'CSS', { value: { supports: () => ios } })
      Object.defineProperties(window, {
        innerWidth: { value: 390 },
        innerHeight: { value: 844 },
      })
      Object.defineProperty(window.performance, 'mark', { value: () => {} })
      window.matchMedia = media =>
        ({
          matches: false,
          media,
          addEventListener() {},
          removeEventListener() {},
        }) as unknown as MediaQueryList
    },
  })
  return { dom, errors, navigation }
}

function expectStartup(html: string, admitted: boolean, ios: boolean, standalone = true) {
  const { dom, errors, navigation } = executeHead(html, ios, 'https://app.test/', standalone)
  try {
    const { document } = dom.window
    expect(errors).toEqual([])
    expect(dom.window.__SATIN_PLATFORM_BLOCKED__).toBe(!admitted)
    expect(dom.window.classicStarted).toBe(admitted ? true : undefined)
    expect(navigation).toHaveLength(admitted ? 0 : 1)
    expect(document.querySelector('script[type="module"][src]') !== null).toBe(admitted)
    expect(document.getElementById('satin-touch-icon')?.getAttribute('href')).toBe(
      admitted ? '/icon.png' : null,
    )
    expect(document.getElementById('satin-manifest')?.getAttribute('href')).toBe(
      admitted ? '/satin-app-_2Fscript-proof.webmanifest' : null,
    )
    expect(document.getElementById('satin-theme-color')?.getAttribute('content')).toBe('#ffffff')
    expect(document.documentElement.dataset.satinViewportFit).toBe(
      admitted ? (ios ? 'auto' : 'cover') : undefined,
    )
  } finally {
    dom.window.close()
  }
}

describe('platform scripts through Vite', () => {
  it('paints the launch cover and its colors without executing any JavaScript', async () => {
    const { root } = await fixture()
    await build({ configFile: false, root, logLevel: 'silent', plugins: satinApp(app) })
    const html = await readFile(join(root, 'dist/index.html'), 'utf8')
    const dom = new JSDOM(html)
    try {
      const { document } = dom.window
      expect(document.getElementById('satin-launch-screen')).not.toBeNull()
      expect(document.querySelector('.satin-launch-icon img')?.getAttribute('src')).toMatch(
        /^data:image\/png;base64,/,
      )
      expect(document.querySelector('.satin-launch-icon img')?.getAttribute('decoding')).toBe(
        'sync',
      )
      const preload = document.querySelector('link[rel="preload"][as="image"]')
      expect(preload?.getAttribute('href')).toBe(
        document.querySelector('.satin-launch-icon img')?.getAttribute('src'),
      )
      expect(document.head.contains(preload)).toBe(true)
      expect(document.getElementById('satin-launch-progress')?.hasAttribute('hidden')).toBe(true)
      const paint = document.getElementById('satin-launch-paint')
      expect(paint?.textContent).toContain('--satin-launch-background:#ffffff')
      expect(html.indexOf('id="satin-launch-paint"')).toBeLessThan(
        html.indexOf('id="satin-platform-gate"'),
      )
    } finally {
      dom.window.close()
    }
  })

  it('redirects a release Safari tab before classic, module, watchdog or worker startup', async () => {
    const { root } = await fixture()
    await build({ configFile: false, root, logLevel: 'silent', plugins: satinApp(app) })
    const html = await readFile(join(root, 'dist/index.html'), 'utf8')
    const execution = executeHead(html, true, 'https://app.test/app/deep/link?preview=1', false)
    try {
      expect(execution.errors).toEqual([])
      expect(execution.navigation).toHaveLength(1)
      expect(execution.dom.window.__SATIN_PLATFORM_BLOCKED__).toBe(true)
      expect(execution.dom.window.classicStarted).toBeUndefined()
      expect(execution.dom.window.document.querySelectorAll('script[src]')).toHaveLength(0)
      expect(execution.dom.window.document.documentElement.dataset.satinLaunchError).toBeUndefined()
      const install = await readFile(join(root, 'dist/install/index.html'), 'utf8')
      expect(install).not.toContain('satin-platform-gate')
      expect(install).toContain('satin-install-check')
      const refusal = await readFile(join(root, 'dist/unsupported.html'), 'utf8')
      expect(refusal).not.toContain('satin-platform-gate')
      expect(await readFile(join(root, 'dist/icon.png'))).toEqual(
        await readFile(join(root, 'public/icon.png')),
      )
      const assets = await readdir(join(root, 'dist/assets'))
      const entryName = assets.find(name => name.endsWith('.js'))!
      const entry = await readFile(join(root, 'dist/assets', entryName), 'utf8')
      expect(entry).toContain('appStarted')
      expect(entry).not.toContain('satin-platform-gate')
    } finally {
      execution.dom.window.close()
    }
  })

  it.each([true, false])('executes the generated head in production order (ios=%s)', ios => {
    const head = generateAppHead([{ app, query: {} }], '/', true)
    expectStartup(
      gateAppScripts(
        '<html><head>' +
          head +
          '</head><body>' +
          '<script>window.classicStarted = true</script><script type="module" src="/entry.js"></script>' +
          '</body></html>',
      ),
      ios,
      ios,
    )
  })

  it('follows refused navigation to the generated page with a visible iPhone and iPad title', async () => {
    const { root } = await fixture()
    await build({
      configFile: false,
      root,
      logLevel: 'silent',
      build: { modulePreload: false },
      plugins: satinApp(app),
    })
    const html = await readFile(join(root, 'dist/index.html'), 'utf8')
    const execution = executeHead(html, false)
    let refusal: ReturnType<typeof executeHead> | undefined
    try {
      expect(execution.errors).toEqual([])
      expect(execution.navigation).toHaveLength(1)
      const gate = execution.dom.window.document.getElementById('satin-platform-gate')
      expect(gate).not.toBeNull()
      const destinations: string[] = []
      // JSDOM cannot navigate. Execute the emitted admission script with a location
      // recorder, then load its actual destination from the same production build.
      runInContext(
        gate!.textContent!,
        createContext({
          window: execution.dom.window,
          navigator: execution.dom.window.navigator,
          CSS: { supports: () => false },
          performance: { mark() {} },
          URLSearchParams,
          location: {
            search: '',
            replace: (destination: string) => destinations.push(destination),
          },
        }),
      )
      expect(destinations).toEqual([app.scope + 'unsupported.html'])
      const destination = new URL(destinations[0]!, execution.dom.window.location.href)
      const refusalHtml = await readFile(join(root, 'dist', destination.pathname.slice(1)), 'utf8')
      refusal = executeHead(refusalHtml, false, destination.href)
      expect(refusal.errors).toEqual([])
      expect(refusal.navigation).toEqual([])
      const { document } = refusal.dom.window
      const title = 'This app is designed for iPhone and iPad'
      expect(document.title).toBe(title)
      const heading = document.querySelector('main h1')
      expect(heading?.textContent).toBe(title)
      expect(heading?.isConnected).toBe(true)
      for (let element = heading; element; element = element.parentElement) {
        expect(element.hasAttribute('hidden')).toBe(false)
        const style = refusal.dom.window.getComputedStyle(element)
        expect(style.display).not.toBe('none')
        expect(['hidden', 'collapse']).not.toContain(style.visibility)
        expect(style.opacity).not.toBe('0')
      }
    } finally {
      refusal?.dom.window.close()
      execution.dom.window.close()
    }
  })

  it.each([
    ['ios', true],
    ['ios', false],
    ['all', true],
    ['all', false],
  ] as const)(
    'executes the real gate before Vite and React development scripts (%s, ios=%s)',
    async (platforms, ios) => {
      const { root, html } = await fixture()
      const react = (await import(labRequire.resolve('@vitejs/plugin-react'))).default
      const server = await createServer({
        configFile: false,
        root,
        logLevel: 'silent',
        server: { middlewareMode: true, watch: null, ws: false },
        plugins: [react(), ...satinApp(defineSatinApp({ ...app, platforms }))],
      })
      try {
        const transformed = await server.transformIndexHtml('/', html)
        const { document } = new JSDOM(transformed).window
        const scripts = [...document.querySelectorAll('script')]
        const gateIndex = scripts.findIndex(script => script.id === 'satin-platform-gate')
        const loaderIndexes = scripts.flatMap((script, index) =>
          script.hasAttribute('data-satin-script-loader') ? [index] : [],
        )
        expect(transformed).toContain('/@vite/client')
        expect(transformed).toContain('/@react-refresh')
        expect(loaderIndexes.length).toBeGreaterThanOrEqual(3)
        expect(gateIndex).toBeGreaterThanOrEqual(0)
        expect(loaderIndexes.every(index => index > gateIndex)).toBe(true)
        expectStartup(transformed, platforms === 'all' || ios, ios, false)
      } finally {
        await server.close()
      }
    },
  )

  it.each([false, true])(
    'executes the built external entry only when allowed under a late CSP nonce (blocked=%s)',
    async blocked => {
      const { root } = await fixture()
      const nonce = 'late-vite-nonce'
      await build({
        configFile: false,
        root,
        logLevel: 'silent',
        html: { cspNonce: nonce },
        build: { modulePreload: false },
        plugins: satinApp(app),
      })
      const html = await readFile(join(root, 'dist/index.html'), 'utf8')
      expectStartup(html, !blocked, !blocked)
      const { document } = new JSDOM(html).window
      const loaders = [
        ...document.querySelectorAll<HTMLScriptElement>('script[data-satin-script-loader]'),
      ]
      expect(loaders.length).toBeGreaterThan(0)
      const reinsertedScripts: HTMLScriptElement[] = []
      const execution = executeHead(html, !blocked)
      const window: { __SATIN_PLATFORM_BLOCKED__?: boolean; appStarted?: boolean } = {
        __SATIN_PLATFORM_BLOCKED__: execution.dom.window.__SATIN_PLATFORM_BLOCKED__,
      }
      execution.dom.window.close()
      // Node models parser writes and nonce enforcement here. It does not provide
      // installed-WebKit CSP evidence. The real Vite bundle is evaluated below.
      const context = createContext({
        window,
        document: {
          currentScript: null as HTMLScriptElement | null,
          write(markup: string) {
            const parsed = new JSDOM(markup).window.document
            reinsertedScripts.push(...parsed.querySelectorAll<HTMLScriptElement>('script'))
          },
        },
      })
      for (const loader of loaders) {
        expect(loader.nonce).toBe(nonce)
        context.document.currentScript = loader
        runInContext(loader.textContent ?? '', context)
      }
      for (const script of reinsertedScripts) {
        expect(script.nonce).toBe(nonce)
        if (script.type === 'module' && script.hasAttribute('src')) {
          const bundle = await readFile(join(root, 'dist', script.getAttribute('src')!), 'utf8')
          runInContext(bundle, context)
        }
      }
      expect(window.appStarted).toBe(blocked ? undefined : true)
      expect(reinsertedScripts.length).toBe(blocked ? 0 : loaders.length)
    },
  )
})

it('serves the native launch image advertised by the development head', async () => {
  const { root } = await fixture()
  const server = await createServer({
    configFile: false,
    root,
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0, watch: null, ws: false },
    plugins: satinApp(app),
  })
  try {
    await server.listen()
    const origin = server.resolvedUrls!.local[0]!
    const response = await fetch(`${origin}${appManifestStem(app)}-launch-1024-portrait-light.png`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    const metadata = await sharp(Buffer.from(await response.arrayBuffer())).metadata()
    expect([metadata.width, metadata.height, metadata.hasAlpha]).toEqual([2048, 2732, true])
  } finally {
    await server.close()
  }
})
