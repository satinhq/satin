import { afterEach, describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { runInNewContext } from 'node:vm'
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { build, createLogger } from 'vite'
import { defineSatinApp } from './definition.ts'
import { appManifestFiles, appManifestStem, generateAppHead } from './head.ts'
import { installPage } from './install.ts'
import { satinApp } from './vite.ts'
const iconBytes = await sharp({
  create: { width: 512, height: 512, channels: 4, background: '#0066ff' },
})
  .png()
  .toBuffer()

function headScripts(head: string) {
  return [...head.matchAll(/<script id="satin-(?:platform-gate|head-init)">([\s\S]*?)<\/script>/g)]
    .map(match => match[1])
    .join('\n')
}

const app = defineSatinApp({
  platforms: 'all',
  id: '/test',
  name: 'Test </script> app',
  shortName: 'Test',
  description: 'Test definition',
  scope: '/',
  startRoute: '/',
  icons: [{ src: '/brand.png', sizes: '512x512', type: 'image/png' }],
  appearance: {
    background: '#abcdef',
    darkLaunch: { background: '#123456' },
  },
  orientations: { supported: ['portrait', 'landscape'], fallback: 'none' },
  connectivity: 'local',

  capabilities: [],
  updateActivation: 'cold-launch',
  appShell: { additionalPrecache: [] },
})
const dirs: string[] = []
afterEach(async () => {
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})
function selectedManifest(html: string, navigator: Record<string, unknown>, runtime = false) {
  const elements = new Map<string, Record<string, string>>()
  const manifest = html.match(/<link[^>]*rel="manifest"[^>]*>/)?.[0] ?? ''
  elements.set('satin-manifest', { href: manifest.match(/href="([^"]+)"/)?.[1] ?? '' })
  const document = {
    querySelector: (selector: string) =>
      selector === 'link[rel="manifest"]' ? elements.get('satin-manifest') : {},
    hidden: false,
    addEventListener() {},
    createElement: () => ({}),
    head: { appendChild() {} },
    documentElement: { dataset: {}, style: { setProperty() {} } },
    getElementById(id: string) {
      if (!elements.has(id)) elements.set(id, {})
      return elements.get(id)!
    },
  }
  const scripts = runtime
    ? headScripts(html)
    : [...html.split('</head>')[0]!.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
        .map(match => match[1])
        .join('\n')
  runInNewContext(scripts, {
    document,
    navigator,
    screen: { width: 1194, height: 834 },
    innerWidth: 1194,
    innerHeight: 802,
    performance: { mark() {}, now: () => 0 },
    window: { addEventListener() {}, __SATIN_PRELAUNCH__: { version: 1, appearance() {} } },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    setTimeout: () => 1,
    clearTimeout() {},
    setInterval: () => 1,
    clearInterval() {},
    addEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    getComputedStyle: () => ({ getPropertyValue: () => 'light' }),
    location: { search: '', href: 'https://satin.test/' },
    URLSearchParams,
    URL,
  })
  return elements.get('satin-manifest')!.href!
}

describe('definition build integration', () => {
  it('installs and launches the same per-idiom manifest without changing phone defaults', () => {
    const definition = defineSatinApp({
      ...app,
      orientations: {
        supported: ['portrait'],
        fallback: 'responsive',
        ipad: { supported: ['portrait', 'landscape'], fallback: 'none' },
      },
    })
    const stem = appManifestStem(definition)
    const files = appManifestFiles(definition, stem)
    for (const family of ['iPhone', 'iPad']) {
      const signals = { userAgent: family, platform: family, maxTouchPoints: 5 }
      const expected = `/${stem}${family === 'iPad' ? '-ipad' : ''}.webmanifest`
      const install = selectedManifest(installPage(definition, 'install'), signals)
      expect(install).toBe(expected)
      expect(
        selectedManifest(generateAppHead([{ app: definition, query: {} }], '/'), signals, true),
      ).toBe(install)
      expect(JSON.parse(files[install.slice(1)]!)).toMatchObject({
        id: definition.id,
        start_url: definition.startRoute,
        scope: definition.scope,
        orientation: family === 'iPad' ? 'any' : 'portrait',
      })
    }
  })

  it('preserves subpath identity and explicit orientations on desktop-class iPad installation', () => {
    const definition = defineSatinApp({
      ...app,
      id: '/nested/identity',
      scope: '/nested/app/',
      startRoute: '/nested/app/?entry=home',
      orientations: {
        supported: ['landscape'],
        fallback: 'responsive',
        ipad: { supported: ['portrait'], fallback: 'responsive' },
      },
    })
    const signals = {
      userAgent: 'Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Safari/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 5,
    }
    const stem = appManifestStem(definition)
    const expected = `/nested/${stem}-ipad.webmanifest`
    for (const kind of ['landing', 'install', 'gate'] as const) {
      expect(selectedManifest(installPage(definition, kind, '/nested/'), signals)).toBe(expected)
    }
    expect(
      selectedManifest(
        installPage(definition, 'install', '/nested/', {
          customPage: '/nested/custom.js',
        }),
        signals,
      ),
    ).toBe(expected)
    expect(
      selectedManifest(
        generateAppHead([{ app: definition, query: {} }], '/nested/'),
        signals,
        true,
      ),
    ).toBe(expected)
    const files = appManifestFiles(definition, stem)
    expect(JSON.parse(files[`${stem}-ipad.webmanifest`]!)).toMatchObject({
      id: definition.id,
      start_url: definition.startRoute,
      scope: definition.scope,
      orientation: 'portrait',
    })
    expect(JSON.parse(files[`${stem}.webmanifest`]!).orientation).toBe('landscape')
  })

  it('declares the default status bar before executing head scripts', () => {
    const head = generateAppHead([{ app, query: {} }], '/')
    const declarativeHead = head.slice(
      head.indexOf('</script>') + '</script>'.length,
      head.indexOf('<script id="satin-head-init"'),
    )
    expect(declarativeHead).toContain(
      'name="apple-mobile-web-app-status-bar-style" content="default"',
    )
    expect(declarativeHead).toContain('viewport-fit=cover')
  })

  it.each([
    [true, undefined],
    [true, { active: {} }],
    [true, { waiting: {} }],
    [false, undefined],
    [false, { active: {} }],
  ])('preregisters only a missing production worker (%j, %j)', async (production, existing) => {
    const calls: unknown[][] = []
    let lookups = 0
    const document = {
      querySelector: () => ({}),
      hidden: false,
      title: '',
      addEventListener() {},
      createElement: () => ({}),
      head: { appendChild() {} },
      documentElement: { dataset: {}, style: { backgroundColor: '', setProperty() {} } },
      getElementById: () => ({}),
    }
    runInNewContext(
      headScripts(generateAppHead([{ app, query: {} }], '/', production as boolean)),
      {
        screen: { width: 440, height: 956 },
        innerWidth: 440,
        innerHeight: 894,
        performance: { mark() {}, now: () => 0 },
        window: { addEventListener() {}, __SATIN_PRELAUNCH__: { version: 1, appearance() {} } },
        setTimeout,
        clearTimeout,
        setInterval: () => 1,
        clearInterval() {},
        document,
        addEventListener() {},
        URLSearchParams,
        sessionStorage: {
          getItem() {
            return null
          },
          setItem() {},
          removeItem() {},
        },
        URL,
        location: { search: '', href: 'https://satin.test/' },
        matchMedia: () => ({ matches: false, addEventListener() {} }),
        getComputedStyle: () => ({ getPropertyValue: () => 'light' }),
        navigator: {
          serviceWorker: {
            addEventListener() {},
            getRegistration: async () => {
              lookups++
              return existing
                ? {
                    ...existing,
                    scope: 'https://satin.test/',
                    ...Object.fromEntries(
                      Object.entries(existing).map(([key, value]) => [
                        key,
                        {
                          ...(value as object),
                          scriptURL: 'https://satin.test/sw.js',
                          postMessage() {},
                        },
                      ]),
                    ),
                  }
                : undefined
            },
            register: async (...args: unknown[]) => {
              calls.push(args)
              return {}
            },
          },
        },
      },
    )
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(lookups).toBe(production ? 1 : 0)
    expect(calls).toEqual(
      existing || !production
        ? []
        : [['https://satin.test/sw.js', { scope: app.scope, updateViaCache: 'none' }]],
    )
  })

  it('applies generated appearance before React, including matching dark manifest and escaped names', () => {
    const head = generateAppHead([{ app, query: {} }], '/')
    expect(head).not.toContain('Test </script>')
    expect(head).toContain('maximum-scale=1, user-scalable=no')
    expect(head).toContain('data-satin-launch')
    const elements = new Map<string, Record<string, string>>()
    const lifecycle = new Map<string, () => void>()
    const timeouts: (() => void)[] = []
    const addLifecycle = (name: string, callback: () => void) => {
      const previous = lifecycle.get(name)
      lifecycle.set(name, () => {
        previous?.()
        callback()
      })
    }
    const appended: Array<{ textContent?: string }> = []
    const properties: Record<string, string> = {}
    const callbacks: FrameRequestCallback[] = []
    let now = 0
    const document = {
      querySelector: () => ({}),
      hidden: false,
      addEventListener: addLifecycle,
      title: '',
      createElement: () => ({}),
      head: {
        appendChild(element: { textContent?: string }) {
          appended.push(element)
        },
      },
      documentElement: {
        dataset: {} as Record<string, string>,
        style: {
          backgroundColor: '',
          setProperty(key: string, value: string) {
            properties[key] = value
          },
        },
      },
      getElementById(id: string) {
        if (!elements.has(id)) elements.set(id, {})
        return elements.get(id)!
      },
    }
    let change!: () => void
    const media = {
      matches: false,
      addEventListener(_name: string, cb: () => void) {
        change = cb
      },
    }
    runInNewContext(headScripts(head), {
      screen: { width: 440, height: 956 },
      innerWidth: 440,
      innerHeight: 894,
      navigator: { userAgent: 'iPhone', platform: 'iPhone', maxTouchPoints: 5 },
      performance: { mark: () => {}, now: () => now },
      sessionStorage: {
        getItem() {
          return null
        },
        setItem() {},
        removeItem() {},
      },
      requestAnimationFrame: (cb: FrameRequestCallback) => {
        callbacks.push(cb)
        return callbacks.length
      },
      cancelAnimationFrame() {},
      window: { addEventListener() {}, __SATIN_PRELAUNCH__: { version: 1, appearance() {} } },
      setTimeout: (callback: () => void) => {
        timeouts.push(callback)
        return timeouts.length
      },
      clearTimeout() {},
      setInterval: () => 1,
      clearInterval() {},
      addEventListener: (name: string, callback: () => void) => lifecycle.set(name, callback),
      document,
      URLSearchParams,
      URL,
      location: { search: '', href: 'https://satin.test/' },
      matchMedia: () => media,
      getComputedStyle: () => ({ getPropertyValue: () => (media.matches ? 'dark' : 'light') }),
    })
    expect(document.documentElement.style.backgroundColor).toBe('#abcdef')
    expect(head).toContain('--satin-launch-background:#abcdef')
    expect(head).toContain('@media(prefers-color-scheme:dark)')
    expect(document.documentElement.dataset.satinAppearanceSession).toBe('false')
    media.matches = true
    change()
    now += 750
    timeouts.shift()!()
    expect(document.documentElement.style.backgroundColor).toBe('#123456')
    expect(document.documentElement.dataset.satinAppearancePending).toBe('false')
    expect(elements.get('satin-theme-color')?.content).toBe('#123456')
    expect(callbacks).toHaveLength(0)
    expect(properties['--satin-launch-background']).toBe('#123456')
    expect(head).not.toContain('name="theme-color" media=')
    now = 1000
    document.hidden = true
    lifecycle.get('visibilitychange')!()
    media.matches = false
    change()
    document.hidden = false
    lifecycle.get('pageshow')!()
    expect(document.documentElement.style.backgroundColor).toBe('#123456')
    media.matches = true
    lifecycle.get('visibilitychange')!()
    expect(document.documentElement.style.backgroundColor).toBe('#123456')
    expect(properties['--satin-background']).toBe('#123456')
    expect(properties['--satin-launch-background']).toBe('#123456')
    expect(elements.get('satin-theme-color')?.content).toBe('#123456')
    expect(elements.get('satin-manifest')?.href).toBe('/satin-app-_2Ftest.webmanifest')
    expect(
      JSON.parse(appManifestFiles(app, 'satin-app-_2Ftest')['satin-app-_2Ftest-dark.webmanifest']!)
        .color_scheme_dark.background_color,
    ).toBe('#123456')
  })
  it('keeps manifest identity stable when fixtures are reordered', () => {
    const other = defineSatinApp({ ...app, id: '/other' })
    const original = generateAppHead(
      [
        { app, query: { specimen: 'app' } },
        { app: other, query: {} },
      ],
      '/',
    )
    const reordered = generateAppHead(
      [
        { app: other, query: { specimen: 'other' } },
        { app, query: {} },
      ],
      '/',
    )
    expect(original).toContain('satin-app-_2Ftest')
    expect(reordered).toContain('satin-app-_2Ftest')
    expect(original).not.toContain('satin-app-0')
  })
  it('emits precached manifests and arbitrary icon names, rejects duplicate head and missing icons', async () => {
    const parent = process.env.SATIN_SCRATCH_ROOT ?? join(process.cwd(), 'node_modules/.cache')
    await mkdir(parent, { recursive: true })
    const root = await mkdtemp(join(parent, 'app-build-'))
    dirs.push(root)
    await mkdir(join(root, 'public'))
    await writeFile(join(root, 'public/brand.png'), iconBytes)
    await writeFile(join(root, 'index.html'), '<html><head></head><body>shell</body></html>')
    const run = () =>
      build({
        configFile: false,
        root,
        logLevel: 'silent',
        plugins: satinApp(app),
      })
    await run()
    const html = await readFile(join(root, 'dist/index.html'), 'utf8')
    expect(html).toContain('__SATIN_DEFINITION__')
    const sw = await readFile(join(root, 'dist/sw.js'), 'utf8')
    expect(sw).toContain('/brand.png')
    expect(sw).toContain('/satin-app-_2Ftest-dark.webmanifest')
    await writeFile(
      join(root, 'index.html'),
      '<html><head><meta name="theme-color" content="red"></head></html>',
    )
    await expect(run()).rejects.toThrow('owns index.html')
    await rm(join(root, 'public/brand.png'))
    await expect(run()).rejects.toThrow('icons[0].src')
  }, 30_000)
})

it('emits an isolated app scope, public install flow and a managed WebClip', async () => {
  const root = await mkdtemp(join(process.env.SATIN_SCRATCH_ROOT ?? tmpdir(), 'install-build-'))
  dirs.push(root)
  await mkdir(join(root, 'public'))
  await writeFile(join(root, 'public/brand.png'), iconBytes)
  await writeFile(
    join(root, 'index.html'),
    '<html><head></head><body><div id="root"></div></body></html>',
  )
  const scoped = defineSatinApp({
    ...app,
    scope: '/app/',
    startRoute: '/app/',
    platforms: 'ios',
    mdm: { origin: 'https://example.test' },
  })
  await build({ root, configFile: false, logLevel: 'silent', plugins: satinApp(scoped) })
  const landing = await readFile(join(root, 'dist/index.html'), 'utf8')
  const install = await readFile(join(root, 'dist/install/index.html'), 'utf8')
  const shell = await readFile(join(root, 'dist/app/index.html'), 'utf8')
  expect(landing).toContain('Add to Home Screen')
  expect(landing).not.toContain('satin-launch-screen')
  expect(install).not.toContain('location.replace')
  expect(install).toContain('data-install-design="home-screen"')
  expect(install.match(/<ol class="ix-steps" role="list">/g)).toHaveLength(2)
  expect(install).toContain('data:image/png;base64,')
  expect(install).toContain('satin-prelaunch-install')
  for (const page of [landing, install]) {
    expect(page).toContain('name="apple-mobile-web-app-capable" content="yes"')
    expect(page).toContain('name="apple-mobile-web-app-status-bar-style" content="default"')
    expect(page).toContain('satin-install-status')
  }
  expect(shell).toContain('satin-launch-screen')
  expect(shell).toContain('data:image/png;base64,')
  expect(await readFile(join(root, 'dist/app/unsupported.html'), 'utf8')).toContain(
    'This app is designed for iPhone and iPad',
  )
  const worker = await readFile(join(root, 'dist/app/sw.js'), 'utf8')
  expect(worker).toContain('const SHELL_URL = "/app/"')
  expect(JSON.parse(await readFile(join(root, 'dist/app/satin-version.json'), 'utf8')).format).toBe(
    1,
  )
  const profile = await readFile(join(root, 'dist/install.mobileconfig'), 'utf8')
  expect(profile).toContain('<key>FullScreen</key><true/>')
  expect(profile).toContain('https://example.test/app/')
  expect(profile).not.toContain('UIWebClipStatusBarStyle')
})

it.each(['/', '/app/', '/app'])(
  'keeps the emitted worker graph in the app scope with Vite base %s',
  async base => {
    const root = await mkdtemp(join(process.env.SATIN_SCRATCH_ROOT ?? tmpdir(), 'worker-scope-'))
    dirs.push(root)
    await mkdir(join(root, 'public'))
    await writeFile(join(root, 'public/brand.png'), iconBytes)
    await writeFile(
      join(root, 'index.html'),
      '<html><head></head><body><script type="module" src="/main.js"></script></body></html>',
    )
    await writeFile(
      join(root, 'main.js'),
      'new Worker(new URL("./probe.worker.js", import.meta.url), {type:"module"})',
    )
    await writeFile(join(root, 'probe.worker.js'), 'self.postMessage("worker-ready")')
    const publicBase = base.endsWith('/') ? base : base + '/'
    const scoped = defineSatinApp({
      ...app,
      scope: '/app/',
      startRoute: '/app/',
      icons: [{ ...app.icons[0]!, src: publicBase + 'brand.png' }],
    })
    await build({ root, base, configFile: false, logLevel: 'silent', plugins: satinApp(scoped) })
    const names = await readdir(join(root, 'dist'))
    const manifest = JSON.parse(
      await readFile(
        join(
          root,
          'dist',
          names.find(name => /^precache-manifest\..*\.json$/.test(name))!,
        ),
        'utf8',
      ),
    )
    const scripts = manifest.entries.filter((entry: { url: string }) => entry.url.endsWith('.js'))
    expect(scripts.length).toBeGreaterThanOrEqual(2)
    expect(scripts.every((entry: { url: string }) => entry.url.startsWith('/app/'))).toBe(true)
    expect(scripts.some((entry: { url: string }) => entry.url.includes('probe.worker'))).toBe(true)
    const startupUrl = scoped.scope + appManifestStem(scoped) + '-startup.js'
    const startupScript = await readFile(
      join(root, 'dist', startupUrl.slice(publicBase.length)),
      'utf8',
    )
    const images: { href: string }[] = []
    runInNewContext(startupScript, {
      document: {
        createElement: () => ({}),
        head: { appendChild: (image: { href: string }) => images.push(image) },
      },
    })
    expect(images.length).toBeGreaterThan(0)
    for (const image of images) {
      expect(image.href.startsWith(publicBase)).toBe(true)
      expect(
        await readFile(join(root, 'dist', image.href.slice(publicBase.length))),
      ).not.toHaveLength(0)
    }
  },
)

it('rejects output overrides that put bundled scripts outside the worker scope', async () => {
  const root = await mkdtemp(
    join(process.env.SATIN_SCRATCH_ROOT ?? tmpdir(), 'worker-scope-escape-'),
  )
  dirs.push(root)
  await mkdir(join(root, 'public'))
  await writeFile(join(root, 'public/brand.png'), iconBytes)
  await writeFile(
    join(root, 'index.html'),
    '<html><head></head><body><script type="module" src="/main.js"></script></body></html>',
  )
  await writeFile(join(root, 'main.js'), 'console.log("outside scope")')
  const scoped = defineSatinApp({ ...app, scope: '/app/', startRoute: '/app/' })
  await expect(
    build({
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: satinApp(scoped),
      build: { rollupOptions: { output: { entryFileNames: 'escaped-[hash].js' } } },
    }),
  ).rejects.toThrow('must stay inside app scope')
})

it('gates Vite module entries and warns when a production app disables the gate', async () => {
  const parent = process.env.SATIN_SCRATCH_ROOT ?? join(process.cwd(), 'node_modules/.cache')
  await mkdir(parent, { recursive: true })
  const root = await mkdtemp(join(parent, 'platform-build-'))
  dirs.push(root)
  await mkdir(join(root, 'public'))
  await writeFile(join(root, 'public/brand.png'), iconBytes)
  await writeFile(join(root, 'entry.js'), 'window.appStarted = true')
  await writeFile(
    join(root, 'index.html'),
    '<html><head></head><body><script type="module" src="/entry.js"></script></body></html>',
  )
  const warnings: string[] = []
  const logger = createLogger('silent')
  logger.warn = message => warnings.push(message)
  await build({ configFile: false, root, customLogger: logger, plugins: satinApp(app) })
  const html = await readFile(join(root, 'dist/index.html'), 'utf8')
  expect(html).toContain('data-satin-script-loader')
  expect(html).toContain('window.__SATIN_PLATFORM_BLOCKED__ === false')
  expect(html).not.toMatch(/<script[^>]+type="module"[^>]+src=/)
  expect(html).toMatch(/\/assets\/[^\s]+\.js/)
  expect(warnings.some(message => message.includes('PLATFORM GATE DISABLED'))).toBe(true)
})
