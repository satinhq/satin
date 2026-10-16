import sharp from 'sharp'
import { checkMediaDeployment } from './mediaCheck.ts'
import { checkDeployment, type DeploymentExpectation } from './deployment.ts'
import { appManifestPaths } from './manifests.ts'

export async function runDeployCheck(input: string, requestTimeoutMs = 30_000) {
  const url = new URL(input)
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  ) {
    throw new Error(`HTTPS is required: ${url.href}`)
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs)
  let response: Response
  let html: string
  try {
    response = await fetch(url, { signal: controller.signal, cache: 'no-store' })
    html = await response.text()
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        `Page did not finish within ${requestTimeoutMs / 1000} s\n  URL: ${url.href}\n  Fix: Check the server or connection, then try again.`,
      )
    }
    throw new Error(
      `Server could not be reached\n  URL: ${url.href}\n  Fix: Start the server and check the URL and connection, then try again.`,
      { cause: error },
    )
  } finally {
    clearTimeout(timer)
  }
  if (response.status !== 200) throw new Error(`Page HTTP ${response.status}: ${url.href}`)
  if (
    (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase() !== 'text/html'
  )
    throw new Error(`Expected app HTML: ${url.href}`)
  const metadata = html.match(
    /<script id="satin-deployment" type="application\/json">([^<]+)<\/script>/,
  )
  if (!metadata)
    throw new Error(
      `Missing Satin deployment metadata: ${url.href}. Rebuild with the current Satin plugin.`,
    )
  const apps = JSON.parse(metadata[1]!) as DeploymentExpectation[]
  if (!Array.isArray(apps) || !apps.length) throw new Error('Invalid deployment metadata.')
  const finalPage = new URL(response.url || url.href)
  const directoryPath = (pathname: string) =>
    pathname.replace(/\/index\.html$/, '/').replace(/\/$/, '')
  if (
    finalPage.origin !== url.origin ||
    directoryPath(finalPage.pathname) !== directoryPath(url.pathname) ||
    finalPage.search !== url.search
  )
    throw new Error(`Page redirected to ${finalPage.href}`)
  const path = directoryPath(finalPage.pathname)
  for (const app of apps) {
    const manifests = appManifestPaths(app, app.base)
    const actual = Array.isArray(app.manifests) ? app.manifests : []
    const missing = manifests.filter(path => !actual.includes(path))
    const unexpected = actual.filter(path => !manifests.includes(path))
    if (missing.length || unexpected.length || new Set(actual).size !== actual.length) {
      throw new Error(
        `Manifest inventory does not match this build for ${app.id}.\n  Missing: ${missing.join(', ') || 'none'}\n  Unexpected: ${unexpected.join(', ') || 'none'}\n  Fix: Rebuild and deploy the complete dist directory, including every idiom and appearance manifest.`,
      )
    }
    const validPaths = [app.base, app.installRoute, app.scope, app.start_url].map(value =>
      directoryPath(new URL(value, finalPage).pathname),
    )
    if (!validPaths.includes(path))
      throw new Error(
        `Built for ${app.base} but checked at ${url.pathname}. Rebuild with matching Vite base or serve at ${app.base}.`,
      )
  }
  const failures = (
    await Promise.all(
      apps.map(app =>
        checkDeployment(
          app,
          finalPage.href,
          fetch,
          true,
          async bytes => {
            await sharp(bytes, { limitInputPixels: 16_777_216 }).raw().toBuffer()
          },
          requestTimeoutMs,
          async (inventory, entries) => {
            const media = await checkMediaDeployment(
              inventory,
              entries,
              finalPage.href,
              requestTimeoutMs,
              app.base,
            )
            if (!media.failures.length)
              console.log(
                media.applicable
                  ? 'PASS media transport: bytes=0-1 returned matching 206 headers and bytes.'
                  : 'NOT APPLICABLE media transport: no bundled probe. Remote-only media needs satinApp(app, { mediaProbe: "media/probe.m4a" }) with an emitted local probe; the remote source remains unverified.',
              )
            return media.failures
          },
        ),
      ),
    )
  ).flat()
  for (const failure of failures)
    console.error(`FAIL ${failure.reason}\n  URL: ${failure.url}\n  Fix: ${failure.fix}`)
  if (failures.length) return 1
  console.log(
    `PASS ${apps.length} app(s): manifests, install route, start_url, icons, worker and every precache entry.`,
  )
  return 0
}
