import {
  checkDeployment,
  type DeploymentExpectation,
  type DeploymentFailure,
} from './deployment.ts'

// All dependencies are passed in because this runs before any application modules.
export async function installPageCheck(
  expected: DeploymentExpectation,
  check: typeof checkDeployment,
  requestTimeoutMs = 4000,
  // Called once the check passes; a custom install page loads the author's code here.
  onPass?: () => void,
) {
  const environment = (
    window as Window & {
      __SATIN_PRELAUNCH__?: {
        error(reason: string, title?: string, retry?: () => void, detail?: string): void
        recover(): void
      }
    }
  ).__SATIN_PRELAUNCH__!
  const guide = document.getElementById('satin-install-guide')!
  const status = document.getElementById('satin-install-check')!
  const standalone =
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  const pageUrl = new URL(location.href)
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(pageUrl.hostname)
  const insecure = pageUrl.protocol !== 'https:' && !(local && pageUrl.protocol === 'http:')
  const failures: DeploymentFailure[] = standalone
    ? []
    : insecure
      ? [
          {
            reason: 'HTTPS is required for installation and service workers.',
            url: location.href,
            fix: 'Serve the app over trusted HTTPS.',
          },
        ]
      : await check(expected, location.href, fetch, false, undefined, requestTimeoutMs)
  const manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
  if (
    !standalone &&
    !insecure &&
    (!manifestLink ||
      new URL(manifestLink.href).origin !== location.origin ||
      !expected.manifests.includes(new URL(manifestLink.href).pathname))
  ) {
    failures.unshift({
      reason: 'The page manifest link does not match this build.',
      url: manifestLink?.href ?? location.href,
      fix: 'Rebuild and deploy the complete dist directory at the configured Vite base.',
      check: 'Manifest link',
      status: 'Does not match this build',
    })
  }
  const directoryPath = (pathname: string) =>
    pathname.replace(/\/index\.html$/, '/').replace(/\/$/, '')
  const route = directoryPath(location.pathname)
  const installRoute = directoryPath(expected.installRoute)
  const wrongBase = route !== installRoute
  const installSuffix = installRoute.slice(expected.base.length)
  const servedBase = route.endsWith(installSuffix)
    ? route.slice(0, -installSuffix.length)
    : location.pathname
  if (!failures.length && !wrongBase && !standalone) {
    status.removeAttribute('data-error')
    status.removeAttribute('role')
    status.replaceChildren()
    status.hidden = true
    status.style.display = 'none'
    guide.hidden = false
    environment.recover()
    onPass?.()
    return
  }
  guide.hidden = true
  status.hidden = true
  const unverified =
    !wrongBase && failures.length > 0 && failures.every(failure => failure.transient)
  for (const failure of failures)
    console.error('[Satin deployment]', failure.reason, failure.url, failure.fix)
  const title = standalone
    ? 'Wrong Home Screen icon'
    : unverified
      ? "Can't reach the app right now"
      : 'This app is misconfigured'
  const reason = standalone
    ? 'This icon opens the install page instead of the app. Reinstall from Safari.'
    : unverified
      ? 'Check your connection and try again.'
      : wrongBase
        ? `Built for ${expected.base} but served at ${servedBase}. Serve this build at ${expected.base}, or rebuild with Vite base ${servedBase}.`
        : 'Required app files are missing or do not match this build. ' + failures[0]!.fix
  const detail = standalone
    ? location.href
    : unverified
      ? undefined
      : failures
          .map(failure => {
            const url = new URL(failure.url, location.href)
            const address = url.origin === location.origin ? url.pathname + url.search : url.href
            return `${failure.check ?? 'Configuration'} → ${address} → ${failure.status ?? failure.reason}`
          })
          .join('\n')
  let retrying = false
  environment.error(
    reason,
    title,
    () => {
      if (retrying) return
      retrying = true
      void installPageCheck(expected, check, 30_000, onPass).finally(() => {
        retrying = false
      })
    },
    detail,
  )
}
