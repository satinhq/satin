// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defineSatinApp } from './definition.ts'
import { installPage } from './install.ts'
import { installPageCheck } from './installCheck.ts'
import { installCustomMount } from './installCustom.ts'

const app = defineSatinApp({
  id: '/reps',
  name: 'Reps <Pro>',
  shortName: 'Reps',
  description: 'Log every set.',
  icons: [{ src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }],
  appearance: {
    tint: '#ff5a1f',
    background: '#f6f3ee',
    darkLaunch: { background: '#0f0e0d' },
  },
  appShell: { additionalPrecache: [] },
  capabilities: [],
  connectivity: 'local',
  orientations: { supported: ['portrait', 'landscape'], fallback: 'none' },
  scope: '/app/',
  startRoute: '/app/',
  installRoute: '/install',

  updateActivation: 'cold-launch',
})
const entry = '/app/assets/satin-install-abc.js'
const expected = {
  base: '/',
  id: '/reps',
  start_url: '/app/',
  scope: '/app/',
  installRoute: '/install',
  manifests: ['/app.webmanifest'],
  icons: ['/icon-512.png'],
}

beforeEach(() => {
  vi.stubGlobal('location', {
    origin: 'https://test.example',
    href: 'https://test.example/install',
    pathname: '/install',
  })
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  document.head.innerHTML = '<link rel="manifest" href="https://test.example/app.webmanifest">'
  document.body.innerHTML =
    '<section id="satin-install-check" hidden></section><div id="satin-install-guide"></div>'
})
afterEach(() => vi.unstubAllGlobals())

const authorScripts = () =>
  [...document.querySelectorAll('script[type="module"]')].map(s => s.getAttribute('src'))

it('wraps a custom page: Satin head, deployment check and context, no default guide', () => {
  const page = installPage(app, 'install', '/', { customPage: entry })
  expect(page).toContain('<body data-satin-install-page data-satin-install-custom>')
  expect(page).toContain('<link rel="manifest" href="/satin-app-_2Freps.webmanifest">')
  expect(page).toContain('<script id="satin-deployment" type="application/json">')
  expect(page).toContain(`<script data-satin-install-check data-satin-install-entry="${entry}">`)
  // The author's page is loaded by the check, through the mount function, once it passes.
  expect(page).toMatch(/\.bind\(null,["`]\/app\/assets\/satin-install-abc\.js["`]\)/)
  expect(page).toContain(
    '<script id="satin-install-context" type="application/json">{"name":"Reps \\u003cPro>","icon":"/icon-512.png","tint":"#ff5a1f","installRoute":"/install"}</script>',
  )
  // The author's code is never in the HTML: it is loaded only after the check passes.
  expect(page).not.toContain(`src="${entry}"`)
  expect(page).not.toContain('class="install-steps"')
  expect(page).not.toContain('ix-steps')
})

it('defines JavaScript-off: Satin’s plain steps, since the custom page cannot run', () => {
  const page = installPage(app, 'install', '/', { customPage: entry })
  expect(page).toMatch(
    /<noscript><main class="satin-install-noscript">.*Add to Home Screen.*<\/main><\/noscript>/,
  )
})

it('leaves the gate and the landing page as Satin’s own', () => {
  expect(installPage(app, 'gate', '/', { customPage: entry })).not.toContain(
    'data-satin-install-custom',
  )
  expect(installPage(app, 'landing', '/', { customPage: entry })).not.toContain(
    'data-satin-install-custom',
  )
})

it('never loads the author page when the deployment check fails', async () => {
  const check = vi.fn(async () => [{ reason: 'Missing', url: '/app/sw.js', fix: 'Deploy it.' }])
  await installPageCheck(expected, check, 4000, installCustomMount.bind(null, entry))
  expect(authorScripts()).toEqual([])
  expect(document.getElementById('satin-install-check')!.dataset.error).toBe('true')
  expect(document.getElementById('satin-install-guide')!.hidden).toBe(true)
})

it('loads the author page once after the check passes, including after a retry', async () => {
  const check = vi
    .fn()
    .mockResolvedValueOnce([
      { reason: 'Offline', url: '/app/sw.js', fix: 'Retry', transient: true },
    ])
    .mockResolvedValue([])
  await installPageCheck(expected, check, 4000, installCustomMount.bind(null, entry))
  expect(authorScripts()).toEqual([])
  document.querySelector<HTMLButtonElement>('#satin-install-check button')!.click()
  await vi.waitFor(() => expect(authorScripts()).toEqual([entry]))
  installCustomMount(entry)
  expect(authorScripts()).toEqual([entry])
})
