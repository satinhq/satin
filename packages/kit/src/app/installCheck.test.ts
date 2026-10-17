import { setupPrelaunch, prelaunchDOM } from './prelaunch.test-helper.ts'
// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { installPageCheck } from './installCheck.ts'
import { runInNewContext } from 'node:vm'
import { defineApp } from '../public/definition.ts'
import { installPage } from './install.ts'
import { appManifestFiles, appManifestStem } from './head.ts'
import type { checkDeployment, DeploymentExpectation } from './deployment.ts'

const expected: DeploymentExpectation = {
  base: '/',
  id: '/app',
  start_url: '/app/',
  scope: '/app/',
  installRoute: '/install',
  manifests: ['/app.webmanifest', '/app-dark.webmanifest'],
  icons: ['/icon.png'],
  launchColors: { light: '#ffffff', dark: '#ffffff' },
}
beforeEach(() => {
  setupPrelaunch()
  vi.stubGlobal('location', {
    origin: 'https://test.example',
    href: 'https://test.example/install',
    pathname: '/install',
  })
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  document.head.innerHTML = '<link rel="manifest" href="https://test.example/app.webmanifest">'
  document.body.innerHTML =
    '<section id="satin-install-check" hidden></section><section id="satin-install-guide">Guide</section>'
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
it('accepts the generated selected manifest on phone and both iPad identities, in either appearance and base', async () => {
  for (const base of ['/', '/nested/']) {
    const app = defineApp({
      id: base + 'install-contract',
      name: 'Install contract',
      icons: [{ src: base + 'icon.png', sizes: '512x512', type: 'image/png' }],
      advanced: { scope: base + 'app/', startRoute: base + 'app/', installRoute: '/install' },
    })
    const html = installPage(app, 'install', base)
    const metadata = JSON.parse(
      html.match(/<script id="satin-deployment" type="application\/json">([^<]+)<\/script>/)![1]!,
    )
    for (const identity of [
      { userAgent: 'iPhone', platform: 'iPhone', maxTouchPoints: 5 },
      { userAgent: 'iPad', platform: 'iPad', maxTouchPoints: 5 },
      { userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: 5 },
    ]) {
      for (const dark of [false, true]) {
        document.head.innerHTML =
          '<base href="https://test.example">' + html.match(/<head>([\s\S]*?)<\/head>/)![1]!
        document.body.innerHTML =
          '<section id="satin-install-check" hidden></section><section id="satin-install-guide" hidden>Guide</section>'
        vi.stubGlobal('location', {
          origin: 'https://test.example',
          href: 'https://test.example' + base + 'install',
          pathname: base + 'install',
        })
        vi.stubGlobal('matchMedia', (query: string) => ({
          matches: query.includes('dark') && dark,
          addEventListener() {},
        }))
        const scripts = [...document.head.querySelectorAll('script:not([type="application/json"])')]
        for (const script of scripts)
          runInNewContext(script.textContent!, {
            document,
            navigator: identity,
            matchMedia,
            innerWidth: 1194,
            innerHeight: 802,
          })
        const selected = new URL(
          document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!.href,
        ).pathname
        // happy-dom keeps its document URL independent of the stubbed Location.
        document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!.href =
          location.origin + selected
        expect(
          appManifestFiles(app, appManifestStem(app))[selected.slice(base.length)],
        ).toBeDefined()
        await installPageCheck(metadata[0], async () => [])
        expect(document.getElementById('satin-install-check')!.textContent).not.toContain(
          'misconfigured',
        )
        expect(document.getElementById('satin-install-guide')!.hidden).toBe(false)
      }
    }
  }
})
it('leaves the guide as it is after successful validation', async () => {
  const check = vi.fn(async () => [])
  await installPageCheck(expected, check)
  expect(document.getElementById('satin-install-guide')!.hidden).toBe(false)
  expect(document.getElementById('satin-install-check')!.hidden).toBe(true)
})
it('shows nothing while a slow check runs, and keeps the guide when it passes', async () => {
  vi.useFakeTimers()
  let finishValidation!: (failures: []) => void
  const check = vi.fn(
    () =>
      new Promise<[]>(resolve => {
        finishValidation = resolve
      }),
  )
  const pending = installPageCheck(expected, check)
  const status = document.getElementById('satin-install-check')!
  expect(document.getElementById('satin-install-guide')!.hidden).toBe(false)
  expect(status.hidden).toBe(true)
  expect(status.textContent).toBe('')
  expect(status.children).toHaveLength(0)
  finishValidation([])
  await pending
  expect(document.getElementById('satin-install-guide')!.hidden).toBe(false)
  expect(vi.getTimerCount()).toBe(0)
})
it('replaces the guide with the failure when the deployment is broken', async () => {
  await installPageCheck(
    expected,
    vi.fn(async () => [
      {
        reason: 'Manifest HTTP 404',
        url: 'https://test.example/app.webmanifest',
        fix: 'Rebuild with matching base.',
      },
    ]),
  )
  expect(document.getElementById('satin-install-guide')!.hidden).toBe(true)
  expect(prelaunchDOM.getElementById('satin-launch-error')!.textContent).toContain(
    'Manifest HTTP 404',
  )
})
it('detects a root build served below a subpath', async () => {
  vi.stubGlobal('location', {
    origin: 'https://test.example',
    href: 'https://test.example/fixed/install',
    pathname: '/fixed/install',
  })
  await installPageCheck(
    expected,
    vi.fn(async () => []),
  )
  expect(prelaunchDOM.getElementById('satin-launch-error')!.textContent).toContain(
    'Built for / but served at /fixed/.',
  )
})
it('explains why a standalone install-page icon must be replaced', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  await installPageCheck(
    expected,
    vi.fn(async () => []),
  )
  expect(prelaunchDOM.getElementById('satin-launch-error')!.textContent).toContain(
    'Reinstall from Safari',
  )
  expect(document.getElementById('satin-install-guide')!.hidden).toBe(true)
})

it('rejects a manifest link on another origin', async () => {
  document.querySelector('link')!.href = 'https://other.example/app.webmanifest'
  await installPageCheck(
    expected,
    vi.fn(async () => []),
  )
  expect(document.getElementById('satin-install-guide')!.hidden).toBe(true)
  expect(prelaunchDOM.getElementById('satin-launch-error')!.textContent).toContain('Manifest link')
})

it('states one base fix for several failed checks', async () => {
  vi.stubGlobal('location', {
    origin: 'https://test.example',
    href: 'https://test.example/fixed/install',
    pathname: '/fixed/install',
  })
  await installPageCheck(
    expected,
    vi.fn(async () => [
      {
        reason: 'Manifest check failed: HTTP 404',
        check: 'Manifest',
        status: 'HTTP 404',
        url: 'https://test.example/app.webmanifest',
        fix: 'Repeated fix',
      },
      {
        reason: 'image check failed: HTTP 404',
        check: 'Icon',
        status: 'HTTP 404',
        url: 'https://test.example/icon.png',
        fix: 'Repeated fix',
      },
    ]),
  )
  const status = prelaunchDOM.getElementById('satin-launch-error')!
  expect(status.textContent).not.toContain('Repeated fix')
  expect(status.textContent!.match(/rebuild/g)).toHaveLength(1)
  expect(status.querySelector('.detail')!.textContent!.split('\n')).toHaveLength(2)
  expect(status.querySelector('.detail')!.textContent).toContain(
    'Manifest → /app.webmanifest → HTTP 404',
  )
})

it('keeps standalone recovery to one explanation and one action', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  await installPageCheck(
    expected,
    vi.fn(async () => [
      {
        reason: 'Manifest HTTP 404',
        url: 'https://test.example/app.webmanifest',
        fix: 'Deploy again',
      },
    ]),
  )
  const status = prelaunchDOM.getElementById('satin-launch-error')!
  expect(status.querySelectorAll('p')).toHaveLength(2)
  expect(status.textContent!.match(/Reinstall from Safari/g)).toHaveLength(1)
  expect(status.querySelectorAll('li')).toHaveLength(0)
  expect(status.querySelector('.detail')!.textContent).toBe(location.href)
})

it('shows standalone and insecure errors before waiting for network checks', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  const check = vi.fn(() => new Promise<never>(() => {}))
  await installPageCheck(expected, check)
  expect(check).not.toHaveBeenCalled()
  expect(prelaunchDOM.textContent).toContain('Wrong Home Screen icon')
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  vi.stubGlobal('location', {
    href: 'http://test.example/install',
    origin: 'http://test.example',
    pathname: '/install',
  })
  await installPageCheck(expected, check)
  expect(check).not.toHaveBeenCalled()
  expect(prelaunchDOM.textContent).toContain('trusted HTTPS')
})

it('offers Retry for a slow or offline probe without calling it misconfiguration', async () => {
  const check = vi.fn(async () => [
    { reason: 'Timed out', url: '/app/sw.js', fix: 'Retry', transient: true },
  ])
  await installPageCheck(expected, check)
  expect(prelaunchDOM.textContent).toContain("Can't reach the app right now")
  expect(prelaunchDOM.textContent).not.toContain('misconfigured')
  prelaunchDOM.querySelector('button')!.click()
  await Promise.resolve()
  expect(check).toHaveBeenCalledTimes(2)
  expect((check.mock.calls as unknown[][])[1]?.[5]).toBe(30_000)
})

it('removes the error presentation when Retry succeeds', async () => {
  const check = vi
    .fn<typeof checkDeployment>()
    .mockResolvedValueOnce([
      { reason: 'Offline', url: '/app/sw.js', fix: 'Retry', transient: true },
    ])
    .mockResolvedValueOnce([])
  await installPageCheck(expected, check)
  const status = prelaunchDOM.getElementById('satin-launch-error')!
  expect(status.hidden).toBe(false)
  prelaunchDOM.querySelector<HTMLButtonElement>('button')!.click()
  await vi.waitFor(() => expect(document.getElementById('satin-install-guide')!.hidden).toBe(false))
  expect(status.isConnected).toBe(false)
  expect(getComputedStyle(document.getElementById('satin-install-guide')!).display).not.toBe('none')
  expect(prelaunchDOM.getElementById('satin-launch-error')).toBeNull()
})

it.each(['/help/index.html', '/help/', '/help'])(
  'accepts index.html install route opened at %s',
  async pathname => {
    vi.stubGlobal('location', {
      origin: 'https://test.example',
      href: 'https://test.example' + pathname,
      pathname,
    })
    await installPageCheck(
      { ...expected, installRoute: '/help/index.html' },
      vi.fn(async () => []),
    )
    expect(document.getElementById('satin-install-guide')!.hidden).toBe(false)
    expect(prelaunchDOM.textContent).not.toContain('This app is misconfigured')
  },
)

it('shows the guide after Retry when a healthy resource consistently takes five seconds', async () => {
  vi.useFakeTimers()
  const check: typeof checkDeployment = async (
    _expected,
    _page,
    _fetcher,
    _precache,
    _decode,
    timeout = 4000,
  ) => {
    return new Promise(resolve => {
      setTimeout(
        () =>
          resolve(
            timeout < 5000
              ? [
                  {
                    check: 'Icon',
                    url: 'https://test.example/icon.png',
                    reason: 'Request timed out',
                    fix: 'Check the server or connection, then try again.',
                    transient: true,
                  },
                ]
              : [],
          ),
        Math.min(timeout, 5000),
      )
    })
  }
  const initial = installPageCheck(expected, check)
  await vi.advanceTimersByTimeAsync(4001)
  await initial
  expect(document.querySelector('#satin-install-guide')?.hasAttribute('hidden')).toBe(true)
  expect(prelaunchDOM.textContent).not.toContain('misconfigured')
  const retry = prelaunchDOM.querySelector<HTMLButtonElement>('button')!
  retry.click()
  await vi.advanceTimersByTimeAsync(5001)
  expect(document.querySelector('#satin-install-guide')?.hasAttribute('hidden')).toBe(false)
})

it('keeps transient outages calm and retries without duplicate requests', async () => {
  const check = vi
    .fn()
    .mockResolvedValueOnce([
      { reason: 'HTTP 502', url: '/icon.png', fix: 'Check server', transient: true },
    ])
    .mockResolvedValue([])
  await installPageCheck(expected, check)
  expect(prelaunchDOM.textContent).toContain("Can't reach the app right now")
  expect(prelaunchDOM.textContent).not.toContain('misconfigured')
  expect(prelaunchDOM.textContent).not.toContain('Deploy')
  prelaunchDOM.querySelector('button')!.click()
  prelaunchDOM.querySelector('button')!.click()
  await Promise.resolve()
  expect(check).toHaveBeenCalledTimes(2)
  expect(document.getElementById('satin-install-guide')!.hidden).toBe(false)
})
