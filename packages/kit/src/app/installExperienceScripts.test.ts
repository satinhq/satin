import { capturePrelaunch, prelaunchDOM } from './prelaunch.test-helper.ts'
// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defineSatinApp } from './definition.ts'
import { checkDeployment, deploymentExpectation } from './deployment.ts'
import { installPage } from './install.ts'
import { installPageCheck } from './installCheck.ts'

// The generated page minifies its inline scripts. These tests load the page as a browser
// would and run those scripts, so a minifier change that breaks them fails here.

const app = defineSatinApp({
  id: '/reps',
  name: 'Reps',
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

const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1'
const root = document.documentElement

/** Puts the page into the document and runs its inline scripts in order. */
function load(page: string) {
  // Execute classic scripts including the isolated environment, excluding metadata.
  const inline = /<script(?![^>]*\b(?:type|src)=)[^>]*>([\s\S]*?)<\/script>/g
  const scripts = [...page.matchAll(inline)].map(match => match[1]!)
  const withoutScripts = page.replace(inline, '')
  document.head.innerHTML = /<head>([\s\S]*?)<\/head>/.exec(withoutScripts)![1]!
  document.body.innerHTML = /<body[^>]*>([\s\S]*)<\/body>/.exec(withoutScripts)![1]!
  for (const source of scripts) new Function(source)()
  return scripts
}

beforeEach(() => {
  capturePrelaunch()
  vi.stubGlobal('location', {
    origin: 'https://reps.example',
    href: 'https://reps.example/install',
    pathname: '/install',
    search: '',
  })
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {} }))
  // The network is down: every probe fails the same way for both versions of the check.
  vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Load failed')))
  vi.spyOn(console, 'error').mockImplementation(() => {})
  for (const name of Object.keys(root.dataset)) delete root.dataset[name]
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('runs the minified deployment check with the behaviour of the original', async () => {
  const scripts = load(installPage(app, 'install'))
  expect(scripts).toHaveLength(5)
  // Minified: the check's parameter names are gone, its words are not.
  expect(scripts[3]).not.toContain('requestTimeoutMs')
  expect(scripts[3]).toContain('This app is misconfigured')
  await vi.waitFor(() => expect(prelaunchDOM.getElementById('satin-launch-error')).not.toBeNull())
  const minified = prelaunchDOM.getElementById('satin-launch-error')!.innerHTML
  // The test document has no real origin, so the manifest link cannot match the build.
  expect(minified).toContain('This app is misconfigured')
  expect(minified).toContain('Manifest link')
  expect(document.getElementById('satin-install-guide')!.hidden).toBe(true)

  // The same situation through the original, unminified functions.
  document.body.innerHTML =
    '<section id="satin-install-check" hidden></section><section id="satin-install-guide"></section>'
  await installPageCheck(deploymentExpectation(app, '/'), checkDeployment)
  const original = prelaunchDOM.getElementById('satin-launch-error')!
  expect(minified).toBe(original.innerHTML)
})

it('runs the minified experience: gate on a desktop browser, with the QR code drawn', () => {
  load(installPage(app, 'install'))
  expect(root.dataset.env).toBe('gate')
  const code = document.querySelector('[data-qr] svg path')!
  expect(code.getAttribute('d')).toMatch(/^M0 0h1v1h-1z/)
  expect(document.querySelector('[data-address]')!.textContent).toBe('reps.example/install')
})

it('runs the minified experience: Safari starts the steps at once, before any check settles', async () => {
  vi.stubGlobal('navigator', { userAgent: SAFARI_IPHONE, platform: 'iPhone', maxTouchPoints: 5 })
  vi.stubGlobal('innerWidth', 402)
  vi.stubGlobal('innerHeight', 714)
  load(installPage(app, 'install'))
  expect(root.dataset.env).toBe('safari')
  expect(root.dataset.device).toBe('phone')
  await vi.waitFor(() => expect(root.dataset.ready).toBe('true'))
  expect(root.dataset.state).toBe('steps')
  expect(root.dataset.step).toBe('1')
})

it('runs the minified experience: draws the tip and its tail as one path for its size', async () => {
  vi.stubGlobal('navigator', { userAgent: SAFARI_IPHONE, platform: 'iPhone', maxTouchPoints: 5 })
  vi.stubGlobal('innerWidth', 402)
  vi.stubGlobal('innerHeight', 714)
  const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')!
  const height = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')!
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get: () => 240,
  })
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get: () => 42,
  })
  try {
    load(installPage(app, 'install'))
    expect(root.dataset.bar).toBe('compact')
    const d = document.getElementById('ix-shape')!.getAttribute('d')!
    // One closed outline: the panel's corners and, on its bottom edge, the tail at the Page Menu.
    expect(d.match(/M/g)).toHaveLength(1)
    expect(d.startsWith('M17 0L223 0A17 17 0 0 1 240 17')).toBe(true)
    expect(d).toContain('L122 42C115.7 42')
    expect(d).toContain('Q105 53.05')
    expect(d.endsWith('Z')).toBe(true)
  } finally {
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', width)
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', height)
  }
})

it('sets the status bar and viewport from the minified head scripts', () => {
  load(installPage(app, 'install'))
  const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')!
  expect(viewport.content).toMatch(/viewport-fit=(cover|auto)/)
  const status = document.getElementById('satin-install-status') as HTMLMetaElement
  expect(status.content).toBe('default')
})
