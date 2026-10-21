import { appDefinitionForBase } from '../public/definition.ts'
import { inlinePolicySources } from './inlineCSP.ts'
import { bundledLicenseNotices, renderNotices } from '../acknowledgements/bundledNotices.ts'
import { serveStaticFile } from '../server.ts'
import { mediaTypes } from './mediaTypes.ts'
import { extname } from 'node:path'
import { imageAssets } from '../image/vite.ts'
import { generateAppIcons, generateStartupImage } from './icons.ts'
import { generateWebClipProfile } from './mdm.ts'
import { launchScreenMarkup, prelaunchCSS } from './launchScreen.ts'
import { startupImages } from './startup.ts'
import { access, readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { installPage, installRouteForBase } from './install.ts'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import { defineSatinApp, type AppDefinition } from './definition.ts'
import { appManifestFiles, appManifestStem, generateAppHead, type AppFixture } from './head.ts'
import { satinAppShell } from '../sw/vite.ts'
import { validateBuiltDeployment } from './deploymentBuild.ts'
import { deploymentExpectation } from './deployment.ts'
import { gateAppScripts } from './platformScripts.ts'
import { devMenuBuild } from '../dev-menu/build.ts'
import { createBuildInfo } from './buildInfoBuild.ts'
import { frameworkStylesheet, includedStyles } from './styles.ts'

/** Build options for `satinApp`: a custom install page, strict glass, the development menu and a
 * media probe. */
export interface SatinAppOptions {
  /** Output-relative bundled probe for remote-only media. Default: first emitted media
   * file. Proves this deployment server only, never the remote source or playback. */
  readonly mediaProbe?: string
  /** Keep renderer failures loud and forbid fallback, including explicit URL selection.
   * Set explicitly here or with SATIN_STRICT_GLASS=1. Development still surfaces renderer failures. */
  readonly strictGlass?: boolean
  /** Development builds enable the menu automatically. Explicitly opt a test build in. */
  readonly devMenu?: boolean | { readonly statusUrl?: string; readonly version?: string }
  /**
   * The app's own install page instead of Satin's: a module whose default export is a React
   * component, e.g. `'./src/Install.tsx'` (relative to the Vite root). Satin still owns the
   * page around it (head, platform gate, deployment check) and loads the component only after
   * the deployment check passes; `@satinhq/kit/install` gives it the device, browser and app.
   */
  readonly installPage?: string
}

export function platformBuildWarning(app: AppDefinition, production: boolean) {
  if (!production || app.platforms !== 'all') return undefined
  return (
    `[Satin PLATFORM GATE DISABLED] ${app.name}: platforms: 'all' allows unsupported ` +
    'desktop, Chromium and Gecko browsers to execute your app. ' +
    "Satin only supports iPhone/iPad WebKit. Restore platforms: 'ios' before shipping."
  )
}

/** Generates the app shell and loads framework CSS once, before app styles.
 * The stylesheet participates in Vite CSS HMR and builds; pre-launch paints independently. */
export function satinApp(app: AppDefinition, options: SatinAppOptions = {}): Plugin[] {
  return satinAppFixtures([{ app, query: {} }], options)
}

const CUSTOM_INSTALL_ID = 'virtual:satin-install-page'

/** Multi-install lab fixture only. Production apps use satinApp(app). */
export function satinAppFixtures(
  input: readonly AppFixture[],
  options: SatinAppOptions = {},
): Plugin[] {
  if (!input.length || Object.keys(input.at(-1)!.query).length)
    throw new Error('Satin fixtures need a final default definition.')
  if (options.installPage && input.length !== 1)
    throw new Error('A custom install page needs exactly one Satin app definition.')
  let root = process.cwd()
  let customInstallRef: string | undefined
  let customInstallUrl: string | undefined
  const fixtures = input.map(f => ({
    query: f.query,
    display: f.display,
    app: defineSatinApp(f.app),
  }))
  let base = '/'
  let production = false
  let building = false
  let outputWritten = false
  let buildInfo: ReturnType<typeof createBuildInfo> | undefined
  let output = ''
  let publicDirectory = ''
  const covers = new Map<string, string>()
  const generatedIcons = new Map<string, Buffer>()
  const startupIcons = new Map<string, Buffer>()
  let files: Record<string, string> = {}
  let startup: (ReturnType<typeof startupImages>[number] & { appId: string })[] = []
  const startupScripts = new Map<string, string>()
  const generatedStartup = new Map<string, Promise<Buffer>>()
  const startupAsset = (image: (typeof startup)[number]) => {
    let asset = generatedStartup.get(image.file)
    if (!asset) {
      asset = generateStartupImage(
        startupIcons.get(image.appId)!,
        image.width,
        image.height,
        image.ratio,
        image.color,
      )
      generatedStartup.set(image.file, asset)
    }
    return asset
  }
  return [
    {
      name: 'satin:app-definition',
      buildStart() {
        outputWritten = false
        customInstallUrl = undefined
        // The custom install page is its own chunk inside the app scope; the page Satin
        // writes at the install route loads it after the deployment check passes.
        customInstallRef =
          building && options.installPage
            ? this.emitFile({ type: 'chunk', id: CUSTOM_INSTALL_ID, name: 'satin-install' })
            : undefined
      },
      resolveId(id) {
        return id === CUSTOM_INSTALL_ID && options.installPage ? '\0' + CUSTOM_INSTALL_ID : null
      },
      load(id) {
        if (id !== '\0' + CUSTOM_INSTALL_ID || !options.installPage) return null
        const page = JSON.stringify(resolve(root, options.installPage))
        return [
          "import { createElement } from 'react'",
          "import { createRoot } from 'react-dom/client'",
          `import Page from ${page}`,
          "createRoot(document.getElementById('satin-install-guide'), { onUncaughtError: error => window.__SATIN_PRELAUNCH__.error(String(error), 'Install Page Failed') }).render(createElement(Page))",
        ].join('\n')
      },
      writeBundle() {
        outputWritten = true
      },
      renderError() {
        outputWritten = false
      },
      config(config, environment) {
        buildInfo = createBuildInfo(environment.command)
        // WebKit routes a dedicated worker's initial request by its own URL.
        // A page controlled at /app/ cannot serve a /assets/ worker offline.
        // Put the bundle graph in the shared app scope, including worker chunks.
        const requestedBase = config.base || '/'
        const viteBase = requestedBase.endsWith('/') ? requestedBase : requestedBase + '/'
        fixtures.forEach((fixture, index) => {
          fixture.app = appDefinitionForBase(input[index]!.app, viteBase)
        })
        files = Object.assign(
          {},
          ...fixtures.map(({ app, display }) =>
            Object.fromEntries(
              Object.entries(appManifestFiles(app, appManifestStem(app))).map(([name, source]) => [
                name,
                display ? JSON.stringify({ ...JSON.parse(source), display }, null, 2) : source,
              ]),
            ),
          ),
        ) as Record<string, string>
        startup = fixtures.flatMap(({ app }) =>
          startupImages(
            appManifestStem(app),
            app.appearance.background,
            app.appearance.darkLaunch === 'match-light'
              ? app.appearance.background
              : app.appearance.darkLaunch.background,
          ).map(image => ({ ...image, appId: app.id })),
        )
        const scope = fixtures[0]!.app.scope
        if (fixtures.some(({ app }) => app.scope !== scope))
          throw new Error('Satin fixtures must share a service-worker scope for bundled workers.')
        const assets = config.build?.assetsDir ?? 'assets'
        const prefix = scope.slice(viteBase.length)
        const assetsDir = prefix && !assets.startsWith(prefix) ? prefix + assets : assets
        // Test builds can switch the menu on without editing the app: SATIN_DEV_MENU=1
        // (optional SATIN_DEV_MENU_STATUS_URL for the status page row).
        const devMenu =
          options.devMenu ??
          (process.env.SATIN_DEV_MENU === '1'
            ? { statusUrl: process.env.SATIN_DEV_MENU_STATUS_URL || undefined }
            : undefined)
        const enabled = environment.command === 'serve' || Boolean(devMenu)
        return {
          // The bundled renderer includes its shader compiler. Keep a finite budget above
          // the measured 1.8 MB runtime, while still warning about application growth.
          build: { assetsDir, chunkSizeWarningLimit: config.build?.chunkSizeWarningLimit ?? 2000 },
          define: {
            'import.meta.env.SATIN_BUILD_INFO': JSON.stringify(buildInfo),
            'import.meta.env.SATIN_STRICT_GLASS': JSON.stringify(
              (environment.command === 'build' && Boolean(devMenu)) ||
                options.strictGlass === true ||
                process.env.SATIN_STRICT_GLASS === '1',
            ),
            // Opt-in while document scrolling and installed status-strip sampling are qualified.
            'import.meta.env.SATIN_FLOW_SHELL': JSON.stringify(
              process.env.SATIN_FLOW_SHELL === '1',
            ),
            'import.meta.env.SATIN_DEV_MENU': JSON.stringify(enabled),
            'import.meta.env.SATIN_DEV_MENU_CONFIG': enabled
              ? JSON.stringify(devMenuBuild(config.root ?? process.cwd(), devMenu))
              : 'undefined',
          },
        }
      },
      async configResolved(config) {
        publicDirectory = config.publicDir
        root = config.root
        output = resolve(config.root, config.build.outDir)
        base = config.base
        // Vite resolves the deployment base after this plugin is created.
        // Build install-script paths here so subpath installs fetch real assets.
        startupScripts.clear()
        for (const { app } of fixtures) {
          const images = startup
            .filter(image => image.appId === app.id)
            .map(image => ({ href: base + image.file, media: image.media }))
          startupScripts.set(
            app.scope.slice(base.length) + appManifestStem(app) + '-startup.js',
            `for(const image of ${JSON.stringify(images)}){const link=document.createElement('link');link.rel='apple-touch-startup-image';link.href=image.href;link.media=image.media;document.head.appendChild(link)}`,
          )
        }
        building = config.command === 'build'
        production = config.command === 'build' && config.isProduction
        for (const { app } of fixtures) {
          const warning = platformBuildWarning(
            app,
            building && (config.isProduction || config.mode === 'production'),
          )
          if (warning) config.logger.warn(warning)
          // Validate projected public routes without changing the shared definition.
          defineSatinApp({ ...app, installRoute: installRouteForBase(app, base) })
          if (
            app.orientations.fallback === 'letterbox' ||
            app.orientations.ipad?.fallback === 'letterbox'
          )
            throw new Error(
              'Invalid Satin app definition at orientations.fallback: letterbox is not qualified; use rotation-overlay.',
            )
          if (app.scope !== base && base !== '/')
            throw new Error('Invalid Satin app definition at scope: must equal Vite base.')
          if (app.iconSource) {
            if (!app.iconSource.startsWith(base))
              throw new Error('App icon source must stay inside Vite base')
            const images = await generateAppIcons(
              await readFile(resolve(config.publicDir, app.iconSource.slice(base.length))),
            )
            for (const icon of app.icons)
              generatedIcons.set(icon.src.slice(base.length), images.get(parseInt(icon.sizes))!)
          }
          for (const [index, icon] of app.icons.entries()) {
            if (!icon.src.startsWith(base))
              throw new Error(
                `Invalid Satin app definition at icons[${index}].src: must stay inside scope.`,
              )
            if (generatedIcons.has(icon.src.slice(base.length))) continue
            try {
              await access(resolve(config.publicDir, icon.src.slice(base.length)))
            } catch {
              throw new Error(
                `Invalid Satin app definition at icons[${index}].src: missing public file ${icon.src}`,
              )
            }
          }
          const launchIcon =
            app.launchScreen?.icon ??
            app.icons.find(i => i.type === 'image/png')?.src ??
            app.icons[0]!.src
          const iconBytes =
            generatedIcons.get(launchIcon.slice(base.length)) ??
            (await readFile(resolve(config.publicDir, launchIcon.slice(base.length))))
          startupIcons.set(app.id, iconBytes)
          const mime = app.icons.find(i => i.src === launchIcon)?.type ?? 'image/png'
          const inlineIcon = `data:${mime};base64,${iconBytes.toString('base64')}`
          // Even inline images enter WebKit's image loader asynchronously. Start
          // it in the head so the body cover's first paint already has its icon.
          covers.set(
            app.id,
            launchScreenMarkup({
              ...app,
              launchScreen: {
                ...app.launchScreen,
                icon: inlineIcon,
              },
            }),
          )
        }
      },
      transformIndexHtml: {
        order: 'pre',
        handler(html) {
          const tags =
            html.replace(/<!--[\s\S]*?-->/g, '').match(/<(?:link|meta|title)\b[^>]*>/gi) ?? []
          const hasOwnedHead = tags.some(tag => {
            const attributes = Object.fromEntries(
              [...tag.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(a => [
                a[1]!.toLowerCase(),
                (a[2] ?? a[3] ?? a[4])!.toLowerCase(),
              ]),
            )
            return (
              /^<title\b/i.test(tag) ||
              ['manifest', 'apple-touch-icon', 'apple-touch-startup-image'].includes(
                attributes.rel ?? '',
              ) ||
              /^(theme-color|viewport|color-scheme|apple-mobile-web-app.*)$/.test(
                attributes.name ?? '',
              )
            )
          })
          if (hasOwnedHead) {
            throw new Error(
              'Satin app definition owns index.html manifest, title, icons and appearance fields. Remove hand-written head configuration.',
            )
          }
          // The install page (served in dev through Vite for a custom page) owns its head.
          if (html.includes('data-satin-install-page')) return html
          const head = /<head\b[^>]*>(?:\s*<meta\s+charset\s*=\s*[^>]+>)?/i
          if (!head.test(html))
            throw new Error('Satin app definition requires an index.html head element.')
          return html.replace(
            head,
            opening =>
              `${opening}\n${generateAppHead(fixtures, base, production, !building, covers, building ? buildInfo?.appBuildId : undefined)}\n${frameworkStylesheet(base)}`,
          )
        },
      },
      async closeBundle() {
        if (!building || !outputWritten || fixtures.length !== 1) return
        const app = fixtures[0]!.app
        if (app.mdm) {
          const icon = app.icons.find(i => i.type === 'image/png')
          if (!icon) throw new Error('MDM export requires a PNG icon.')
          await writeFile(
            resolve(output, 'install.mobileconfig'),
            generateWebClipProfile(
              app,
              generatedIcons.get(icon.src.slice(base.length)) ??
                (await readFile(resolve(publicDirectory, icon.src.slice(base.length)))),
            ),
          )
        }
        await mkdir(resolve(output, app.scope.slice(base.length)), { recursive: true })
        await writeFile(
          resolve(output, app.scope.slice(base.length), 'unsupported.html'),
          installPage(app, 'gate', base),
        )
        await mkdir(resolve(output, installRouteForBase(app, base).slice(base.length)), {
          recursive: true,
        })
        await writeFile(
          resolve(output, installRouteForBase(app, base).slice(base.length), 'index.html'),
          installPage(app, 'install', base, {
            customPage: customInstallUrl,
            cover: covers.get(app.id),
          }),
        )
        if (app.scope !== base) {
          const html = await readFile(resolve(output, 'index.html'), 'utf8')
          await writeFile(resolve(output, app.scope.slice(base.length), 'index.html'), html)
          await writeFile(resolve(output, 'index.html'), installPage(app, 'landing', base))
        }
      },
      async generateBundle(_options, bundle) {
        const moduleIds = Object.values(bundle).flatMap(item =>
          item.type === 'chunk' ? Object.keys(item.modules) : [],
        )
        const notices = await bundledLicenseNotices(moduleIds)
        const noticePrefix = fixtures[0]!.app.scope.slice(base.length)
        this.emitFile({
          type: 'asset',
          fileName: noticePrefix + 'NOTICE.txt',
          source: renderNotices(notices),
        })
        this.emitFile({
          type: 'asset',
          fileName: noticePrefix + 'licenses.json',
          source: JSON.stringify(notices),
        })
        const acknowledgementSource =
          'window.__SATIN_ACKNOWLEDGEMENTS__=' +
          JSON.stringify(notices).replaceAll('<', '\\u003c') +
          ';'
        this.emitFile({
          type: 'asset',
          fileName: noticePrefix + 'acknowledgements.js',
          source: acknowledgementSource,
        })

        if (customInstallRef) customInstallUrl = base + this.getFileName(customInstallRef)
        for (const item of Object.values(bundle)) {
          if (
            /\.m?js$/.test(item.fileName) &&
            !`${base}${item.fileName}`.startsWith(fixtures[0]!.app.scope)
          )
            throw new Error(
              `Satin bundled scripts must stay inside app scope for offline workers: ${base}${item.fileName}. Remove output filename overrides that escape the scope.`,
            )
        }
        for (const [fileName, source] of generatedIcons)
          this.emitFile({ type: 'asset', fileName, source })
        for (const [fileName, source] of startupScripts)
          this.emitFile({ type: 'asset', fileName, source })
        for (const image of startup)
          this.emitFile({
            type: 'asset',
            fileName: image.file,
            source: await startupAsset(image),
          })
        for (const [fileName, source] of Object.entries(files))
          this.emitFile({ type: 'asset', fileName, source })
      },
      configurePreviewServer(server) {
        server.middlewares.use((req, res, next) => {
          const path = new URL(req.url ?? '/', 'http://localhost').pathname
          const install = installRouteForBase(fixtures[0]!.app, base)
          const builtInstall = path === install || path === install + '/'
          if (!path.startsWith(base) || (!builtInstall && !mediaTypes[extname(path).toLowerCase()]))
            return next()
          const original = req.url
          req.url = '/' + path.slice(base.length)
          void serveStaticFile(req, res, output).finally(() => {
            req.url = original
          })
        })
      },
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const path = (req.url ?? '').split('?')[0]!
          const app = fixtures[0]!.app
          const installRoute = installRouteForBase(app, base)
          if (
            fixtures.length === 1 &&
            (path === installRoute ||
              path === installRoute + '/' ||
              path === app.scope + 'unsupported.html' ||
              (app.scope !== base && path === base))
          ) {
            const kind =
              path === base ? 'landing' : path.endsWith('unsupported.html') ? 'gate' : 'install'
            const customPage =
              kind === 'install' && options.installPage
                ? base + '@id/__x00__' + CUSTOM_INSTALL_ID
                : undefined
            let html = installPage(app, kind, base, { customPage, cover: covers.get(app.id) })
            // In dev the custom page is served through Vite (its client and React's refresh).
            if (customPage) html = await server.transformIndexHtml(path, html)
            res.setHeader('Content-Type', 'text/html')
            res.end(html)
            return
          }
          const startupScript = startupScripts.get(path.slice(base.length))
          if (startupScript) {
            res.setHeader('Content-Type', 'text/javascript')
            res.end(startupScript)
            return
          }
          const launchImage = startup.find(image => base + image.file === path)
          if (launchImage) {
            try {
              const image = await startupAsset(launchImage)
              res.setHeader('Content-Type', 'image/png')
              res.end(image)
            } catch (error) {
              next(error)
            }
            return
          }
          const icon = generatedIcons.get((req.url ?? '').split('?')[0]!.slice(base.length))
          if (icon) {
            res.setHeader('Content-Type', 'image/png')
            res.end(icon)
            return
          }
          const file = files[(req.url ?? '').split('?')[0]!.slice(base.length)]
          if (!file) return next()
          res.setHeader('Content-Type', 'application/manifest+json')
          res.end(file)
        })
      },
    },
    includedStyles(),
    {
      name: 'satin:platform-script-gate',
      transformIndexHtml: {
        order: 'post',
        handler(html) {
          const notices = building
            ? html.replace(
                '</head>',
                `<script data-satin-launch-optional src="${fixtures[0]!.app.scope}acknowledgements.js"></script></head>`,
              )
            : html
          return gateAppScripts(notices)
        },
      },
    },
    imageAssets(),
    satinAppShell({
      mediaProbe: options.mediaProbe,
      get publicRoutes() {
        return fixtures.flatMap(({ app }) => [
          installRouteForBase(app, base),
          app.scope + 'unsupported.html',
          ...(app.scope === base ? [] : [base]),
        ])
      },
      get shellFile() {
        return fixtures.length === 1
          ? fixtures[0]!.app.scope.slice(base.length) + 'index.html'
          : 'index.html'
      },
      get shellUrl() {
        return fixtures.length === 1 ? fixtures[0]!.app.scope : '/'
      },
      get additionalPrecache() {
        return [
          ...new Set(
            fixtures.flatMap(f => [
              ...f.app.appShell.additionalPrecache,
              f.app.scope.slice(base.length) + 'NOTICE.txt',
              f.app.scope.slice(base.length) + 'licenses.json',
              ...f.app.icons.map(icon => icon.src.slice(base.length)),
            ]),
          ),
        ]
      },
    }),
    {
      name: 'satin:deployment-guard',
      enforce: 'post',
      closeBundle: {
        sequential: true,
        async handler() {
          if (!building || !outputWritten || fixtures.length !== 1) return
          for (const { app } of fixtures) {
            await validateBuiltDeployment(output, deploymentExpectation(app, base))
          }
          const policies: Record<string, ReturnType<typeof inlinePolicySources>> = {}
          // Enumerate final output, including platform gates and custom HTML entries.
          const collectPolicies = async (directory: string, prefix = '') => {
            for (const entry of await readdir(directory, { withFileTypes: true })) {
              const relative = prefix + entry.name
              if (entry.isDirectory())
                await collectPolicies(resolve(directory, entry.name), relative + '/')
              else if (/\.html$/i.test(entry.name)) {
                const path = base + (entry.name === 'index.html' ? prefix : relative)
                policies[path] = inlinePolicySources(
                  await readFile(resolve(directory, entry.name), 'utf8'),
                  prelaunchCSS,
                )
              }
            }
          }
          await collectPolicies(output)
          await writeFile(
            resolve(output, 'satin-csp.json'),
            JSON.stringify({ version: 1, policies }, null, 2),
          )
          console.info(`Deploy dist/ at ${base}, then run satin check <url>`)
        },
      },
    },
  ]
}
