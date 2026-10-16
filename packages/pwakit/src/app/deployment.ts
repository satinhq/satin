import type { AppDefinition } from './definition.ts'
import { appManifestPaths } from './manifests.ts'

export interface DeploymentExpectation {
  base: string
  id: string
  start_url: string
  scope: string
  installRoute: string
  manifests: string[]
  icons: string[]
  /** Absent in builds made before launch-color deployment validation. */
  launchColors?: { light: string; dark: string }
}
export interface DeploymentFailure {
  reason: string
  url: string
  fix: string
  check?: string
  status?: string
  transient?: boolean
}
export function deploymentExpectation(app: AppDefinition, base: string): DeploymentExpectation {
  const route = app.installRoute ?? '/install'
  return {
    base,
    id: app.id,
    start_url: app.startRoute,
    scope: app.scope,
    installRoute: route.startsWith(base) ? route : base + route.slice(1),
    manifests: appManifestPaths(app, base),
    icons: app.icons.map(icon => icon.src),
    launchColors: {
      light: app.appearance.background,
      dark:
        app.appearance.darkLaunch === 'match-light'
          ? app.appearance.background
          : app.appearance.darkLaunch.background,
    },
  }
}

// Self-contained: embedded verbatim in the install page and used by the CLI.
export async function checkDeployment(
  expected: DeploymentExpectation,
  pageUrl: string,
  fetcher: typeof fetch = fetch,
  includePrecache = false,
  decodeImage?: (bytes: Uint8Array, type: string) => Promise<void>,
  requestTimeoutMs = 4000,
  checkMedia?: (
    inventory: Record<string, unknown>,
    entries: readonly { url: string; bytes?: number }[],
  ) => Promise<DeploymentFailure[]>,
): Promise<DeploymentFailure[]> {
  const failures: DeploymentFailure[] = []
  const page = new URL(pageUrl)
  const fix = `Deploy this build at ${expected.base}, or rebuild with Vite base matching the deployment path and app scope.`
  const label = (url: string) => {
    const path = new URL(url, page).pathname
    if (path === expected.manifests[1]) return 'Dark-mode manifest'
    if (expected.manifests.includes(path)) return 'Manifest'
    if (path.endsWith('/sw.js')) return 'Service worker'
    if (path === expected.start_url) return 'App page'
    if (expected.icons.includes(path)) return 'Icon'
    if (path === expected.installRoute) return 'Install page'
    if (path.includes('precache-manifest.')) return 'Precache inventory'
    return 'Resource'
  }
  const fail = (reason: string, url: string, transient = false, remedy = fix) => {
    failures.push({ reason, url, fix: remedy, check: label(url), status: reason, transient })
  }
  const launchColors = expected.launchColors
  if (
    !launchColors ||
    typeof launchColors.light !== 'string' ||
    typeof launchColors.dark !== 'string' ||
    !/^#[\da-f]{6}$/i.test(launchColors.light) ||
    !/^#[\da-f]{6}$/i.test(launchColors.dark)
  ) {
    fail(
      `Missing or invalid launch colors for ${expected.id}.`,
      page.href,
      false,
      'Rebuild and deploy with the current Satin plugin so launch colors can be checked.',
    )
    return failures
  }
  if (
    page.protocol !== 'https:' &&
    !(['localhost', '127.0.0.1', '[::1]'].includes(page.hostname) && page.protocol === 'http:')
  ) {
    fail(
      'HTTPS is required for installation and service workers.',
      page.href,
      false,
      'Serve the app over trusted HTTPS.',
    )
    return failures
  }
  const request = async (path: string, kind: string, allowDirectoryCanonicalization = false) => {
    const url = new URL(path, page).href
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs)
    let definite = false
    try {
      const response = await fetcher(url, {
        signal: controller.signal,
        cache: 'no-store',
        redirect: path === expected.scope + 'sw.js' ? 'manual' : 'follow',
      })
      definite = true
      if (response.status !== 200) throw new Error(`HTTP ${response.status}`)
      const finalUrl = new URL(response.url || url)
      const requestedUrl = new URL(url)
      const directoryPath = (pathname: string) =>
        pathname.replace(/\/index\.html$/, '/').replace(/\/$/, '')
      if (
        finalUrl.origin !== page.origin ||
        (allowDirectoryCanonicalization
          ? directoryPath(finalUrl.pathname) !== directoryPath(requestedUrl.pathname) ||
            finalUrl.search !== requestedUrl.search
          : finalUrl.href !== url)
      ) {
        throw new Error(`unexpected final URL ${finalUrl.href}`)
      }
      const type = (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
      const valid =
        kind === 'json'
          ? /^(application\/(json|manifest\+json))$/.test(type)
          : kind === 'javascript'
            ? /^(text|application)\/(javascript|ecmascript|x-javascript)$/.test(type)
            : kind === 'image'
              ? type.startsWith('image/')
              : kind === 'html'
                ? type === 'text/html'
                : kind === 'css'
                  ? type === 'text/css'
                  : type !== 'text/html' && type.length > 0
      if (!valid) throw new Error(`expected ${kind}, received ${type || 'no Content-Type'}`)
      definite = false
      const bytes = new Uint8Array(await response.arrayBuffer())
      definite = true
      if (kind === 'image' && includePrecache) {
        if (decodeImage) await decodeImage(bytes, type)
        else {
          const image = new Image()
          const objectUrl = URL.createObjectURL(new Blob([bytes], { type }))
          try {
            image.src = objectUrl
            await image.decode()
            if (!image.naturalWidth || !image.naturalHeight) throw new Error('empty image')
          } finally {
            URL.revokeObjectURL(objectUrl)
          }
        }
      }
      return { body: new TextDecoder().decode(bytes), bytes, url: finalUrl.href }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      if (controller.signal.aborted) {
        fail(
          `${label(url)} did not finish within ${requestTimeoutMs / 1000} s`,
          url,
          true,
          'Check the server or connection, then try again.',
        )
      } else {
        fail(
          `${label(url)} check failed: ${reason}`,
          url,
          !definite,
          definite ? fix : 'Check the server or connection, then try again.',
        )
      }
      return null
    } finally {
      clearTimeout(timer)
    }
  }
  const parse = (
    response: { body: string; url: string } | null,
  ): Record<string, unknown> | null => {
    if (!response) return null
    try {
      const value: unknown = JSON.parse(response.body)
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('expected an object')
      return value as Record<string, unknown>
    } catch {
      fail('Invalid JSON.', response.url)
      return null
    }
  }
  const matchesManifestInventory = (body: string) => {
    try {
      const metadata = body.match(
        /<script id="satin-deployment" type="application\/json">([^<]+)<\/script>/,
      )
      const apps = JSON.parse(metadata?.[1] ?? 'null') as DeploymentExpectation[]
      const app = Array.isArray(apps)
        ? apps.find(app => app.id === expected.id && app.scope === expected.scope)
        : undefined
      return (
        Array.isArray(app?.manifests) &&
        app.manifests.length === expected.manifests.length &&
        new Set(app.manifests).size === app.manifests.length &&
        expected.manifests.every(path => app.manifests.includes(path))
      )
    } catch {
      return false
    }
  }
  const workerTask = request(expected.scope + 'sw.js', 'javascript')
  const inventoryTask = (async () => {
    const versionResponse = await request(expected.scope + 'satin-version.json', 'json')
    const version = parse(versionResponse)
    if (!version) return
    if (typeof version.buildId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(version.buildId)) {
      fail('Build version is missing or invalid.', versionResponse!.url)
      return
    }
    const worker = await workerTask
    if (worker) {
      const workerBuildId = worker.body.match(/\bconst\s+BUILD_ID\s*=\s*"([a-zA-Z0-9_-]+)"/)?.[1]
      if (!workerBuildId) {
        fail('Service worker build ID is missing or invalid.', worker.url)
      } else if (workerBuildId !== version.buildId) {
        fail(
          `Service worker is from build ${workerBuildId}, the deployment is build ${version.buildId}: redeploy sw.js / purge the CDN cache for it`,
          worker.url,
          false,
          'Redeploy sw.js / purge the CDN cache for it.',
        )
      }
    }
    const inventoryResponse = await request(
      expected.base + 'precache-manifest.' + version.buildId + '.json',
      'json',
    )
    const inventory = parse(inventoryResponse)
    if (!inventory) return
    if (!Array.isArray(inventory.entries) || !inventory.entries.length) {
      fail('Precache inventory is empty or invalid.', inventoryResponse!.url)
      return
    }
    const entries = inventory.entries as { url: string; bytes?: number; revision?: string | null }[]
    for (const entry of entries) {
      let valid = false
      try {
        const url = new URL(entry.url, page)
        valid =
          typeof entry.url === 'string' &&
          entry.url.startsWith(expected.base) &&
          url.origin === page.origin &&
          url.pathname.startsWith(expected.base) &&
          !url.search &&
          !url.hash &&
          !url.username &&
          !url.password &&
          (entry.bytes === undefined || (Number.isSafeInteger(entry.bytes) && entry.bytes >= 0)) &&
          (entry.revision == null || /^[a-f0-9]{64}$/.test(entry.revision))
      } catch {
        /* Report the inventory rather than requesting an unsafe URL. */
      }
      if (!valid) {
        fail('Precache inventory contains invalid URLs or metadata.', inventoryResponse!.url)
        return
      }
    }
    if (includePrecache && checkMedia) failures.push(...(await checkMedia(inventory, entries)))
    if (!includePrecache) return
    for (let offset = 0; offset < entries.length; offset += 8) {
      await Promise.all(
        entries.slice(offset, offset + 8).map(async entry => {
          const path = new URL(entry.url, page).pathname
          const kind = /\.m?js$/.test(path)
            ? 'javascript'
            : /\.css$/.test(path)
              ? 'css'
              : /\.(json|webmanifest)$/.test(path)
                ? 'json'
                : /\.(png|svg|webp|jpg|jpeg|avif|ico|gif)$/.test(path)
                  ? 'image'
                  : /\.html$/.test(path) || path.endsWith('/')
                    ? 'html'
                    : 'asset'
          const response = await request(entry.url, kind)
          if (!response) return
          if (entry.bytes !== undefined && response.bytes.byteLength !== entry.bytes) {
            fail(
              `Precache size mismatch: expected ${entry.bytes}, received ${response.bytes.byteLength} decoded bytes.`,
              response.url,
            )
          }
          if (entry.revision) {
            const digest = await crypto.subtle.digest('SHA-256', response.bytes)
            const actual = Array.from(new Uint8Array(digest), value =>
              value.toString(16).padStart(2, '0'),
            ).join('')
            if (actual !== entry.revision) fail('Precache SHA-256 mismatch.', response.url)
          }
        }),
      )
    }
  })()
  await Promise.all([
    inventoryTask,
    ...expected.manifests.map(async path => {
      const response = await request(path, 'json')
      const manifest = parse(response)
      if (!manifest || !response) return
      for (const field of ['id', 'start_url', 'scope'] as const) {
        if (manifest[field] !== expected[field])
          fail(
            `Manifest ${field} must be ${expected[field]}; received ${String(manifest[field])}.`,
            response.url,
          )
      }
      const dark = manifest.color_scheme_dark as Record<string, unknown> | undefined
      for (const [appearance, colors] of [
        ['light', manifest],
        ['dark', dark],
      ] as const) {
        for (const field of ['background_color', 'theme_color'] as const) {
          const wanted = launchColors[appearance]
          const actual = colors?.[field]
          if (typeof actual !== 'string' || actual.toLowerCase() !== wanted.toLowerCase()) {
            fail(
              `Manifest ${appearance} ${field} must match the launch color ${wanted}; received ${String(actual)}.`,
              response.url,
              false,
              'Rebuild and deploy the complete app so manifest colors match its declared launch colors.',
            )
          }
        }
      }
      try {
        new URL(String(manifest.start_url), response.url)
      } catch {
        fail('Manifest start_url is not a valid URL.', response.url)
      }
      if (!Array.isArray(manifest.icons) || !manifest.icons.length)
        fail('Manifest has no icons.', response.url)
      else if (
        expected.icons.some(
          icon => !(manifest.icons as { src?: string }[]).some(value => value?.src === icon),
        )
      ) {
        fail('Manifest is missing a required icon.', response.url)
      }
    }),
    ...expected.icons.map(icon => request(icon, 'image')),
    workerTask,
    (async () => {
      const start = await request(expected.start_url, 'html', true)
      if (!start) return
      const metadata = start.body.match(
        /<script id="satin-deployment" type="application\/json">([^<]+)<\/script>/,
      )
      let matching = false
      try {
        const apps = JSON.parse(metadata?.[1] ?? 'null') as DeploymentExpectation[]
        matching =
          Array.isArray(apps) &&
          apps.some(app => app.id === expected.id && app.scope === expected.scope)
      } catch {
        /* The identity check below reports malformed metadata. */
      }
      if (
        start.body.includes('data-satin-install-page') ||
        !start.body.includes('satin-document-head') ||
        !matching
      ) {
        fail('start_url serves the install page or a different app identity.', start.url)
      }
      if (matching && !matchesManifestInventory(start.body)) {
        fail('App page manifest inventory does not match this build.', start.url)
      }
    })(),
    ...(includePrecache
      ? [
          (async () => {
            const install = await request(expected.installRoute, 'html', true)
            if (!install) return
            if (!install.body.includes('data-satin-install-page'))
              fail('Install route does not serve the install page.', install.url)
            if (!matchesManifestInventory(install.body))
              fail('Install page manifest inventory does not match this build.', install.url)
            // A custom install page is still Satin's page around the author's: the check must
            // run before any author code, and the author's bundle must load.
            if (!/<script data-satin-install-check[\s>]/.test(install.body))
              fail(
                'Install page does not run the Satin deployment check.',
                install.url,
                false,
                'Serve the install page Satin builds. A custom page is set with satinApp(app, { installPage }) and Satin wraps it.',
              )
            // `entr[y]`: this source is embedded in install pages, so the pattern must not match
            // its own text there.
            const entry = install.body.match(
              /<script data-satin-install-check data-satin-install-entr[y]="([^"]+)"/,
            )?.[1]
            if (entry) await request(entry, 'javascript')
            const links = install.body.match(/<link\b[^>]*>/gi) ?? []
            const manifestLink = links.find(link => /\brel\s*=\s*["']manifest["']/i.test(link))
            const href = manifestLink?.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1]
            if (
              !href ||
              !expected.manifests.some(
                path => new URL(path, page).href === new URL(href, install.url).href,
              )
            ) {
              fail('Install page links to a missing or different manifest.', install.url)
            }
            if (href) {
              const linked = parse(await request(new URL(href, install.url).href, 'json'))
              if (
                linked &&
                (linked.id !== expected.id ||
                  linked.scope !== expected.scope ||
                  linked.start_url !== expected.start_url)
              ) {
                fail('Install page manifest does not identify this app.', install.url)
              }
            }
          })(),
        ]
      : []),
  ])
  return failures
}
