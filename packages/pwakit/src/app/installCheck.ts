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
    onPass?.()
    return
  }
  guide.hidden = true
  status.hidden = false
  status.style.removeProperty('display')
  status.replaceChildren()
  status.setAttribute('role', 'alert')
  status.dataset.error = 'true'
  const style = document.createElement('style')
  style.textContent = `
    #satin-install-check[data-error] {
      position: fixed;
      inset: 0;
      z-index: 20002;
      display: grid;
      place-items: center;
      overflow: auto;
      padding: 32px;
      box-sizing: border-box;
      background: #f2f2f7;
      color: #1c1c1e;
      color-scheme: light dark;
      font: 17px/1.45 -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
      text-align: center;
    }
    #satin-install-check button { font: inherit; border: 0; background: transparent; color: #007aff; min-height: 44px; cursor: pointer; }
    #satin-install-check .install-error-content { width: min(100%, 560px); }
    #satin-install-check h2 { font-size: 24px; margin: 0 0 12px; }
    #satin-install-check p { opacity: 1; margin: 12px 0; }
    #satin-install-check .install-error-detail {
      font-size: 13px;
      color: #6c6c70;
      overflow-wrap: anywhere;
    }
    #satin-install-check ul { list-style: none; padding: 0; margin: 24px 0 0; }
    #satin-install-check li { margin: 8px 0; font-size: 13px; overflow-wrap: anywhere; }
    @media (prefers-color-scheme: dark) {
      #satin-install-check[data-error] { background: #000; color: #fff; }
      #satin-install-check .install-error-detail { color: #aeaeb2; }
    }
  `
  document.head.append(style)
  const content = document.createElement('div')
  content.className = 'install-error-content'
  const title = document.createElement('h2')
  const unverified =
    !wrongBase && failures.length > 0 && failures.every(failure => failure.transient)
  title.textContent = standalone
    ? 'Wrong Home Screen icon'
    : unverified
      ? 'Could not verify this app'
      : 'This app is misconfigured'
  const explanation = document.createElement('p')
  const action = document.createElement('p')
  content.append(title, explanation, action)
  status.append(content)
  for (const failure of failures) {
    console.error('[Satin deployment]', failure.reason, failure.url, failure.fix)
  }
  if (standalone) {
    explanation.textContent = 'This icon opens the install page instead of the app.'
    action.textContent = 'Delete this icon, then reinstall from Safari.'
    const detail = document.createElement('p')
    detail.className = 'install-error-detail'
    detail.textContent = location.href
    content.append(detail)
    return
  }
  if (unverified) {
    explanation.textContent = 'The connection may be slow or offline.'
    action.textContent = 'Try again when your connection is ready.'
    const retry = document.createElement('button')
    retry.textContent = 'Retry'
    retry.addEventListener('click', () => {
      void installPageCheck(expected, check, 30_000, onPass)
    })
    content.append(retry)
    return
  }
  explanation.textContent = wrongBase
    ? `Built for ${expected.base} but served at ${servedBase}.`
    : 'Required app files are missing or do not match this build.'
  action.textContent = wrongBase
    ? `Serve this build at ${expected.base}, or rebuild with Vite base ${servedBase}.`
    : failures[0]!.fix
  const checks = document.createElement('ul')
  checks.setAttribute('aria-label', 'Failed checks')
  for (const failure of failures) {
    const row = document.createElement('li')
    const url = new URL(failure.url, location.href)
    const address = url.origin === location.origin ? url.pathname + url.search : url.href
    row.textContent = `${failure.check ?? 'Configuration'} → ${address} → ${failure.status ?? failure.reason}`
    checks.append(row)
  }
  content.append(checks)
}
