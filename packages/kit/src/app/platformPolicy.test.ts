import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { defineSatinApp } from './definition.ts'
import { generateAppHead } from './head.ts'
import { installPage } from './install.ts'
import { resolvePlatformGate } from './platformPolicy.ts'
import { platformBuildWarning } from './vite.ts'

const app = defineSatinApp({
  id: '/platform-proof',
  name: 'Platform proof',
  shortName: 'Platform proof',
  description: 'Platform gate test',
  scope: '/app/',
  startRoute: '/app/',
  icons: [{ src: '/icon.png', sizes: '512x512', type: 'image/png' }],
  appearance: { background: '#ffffff', darkLaunch: 'match-light' },
  orientations: { supported: ['portrait', 'landscape'], fallback: 'none' },
  connectivity: 'local',

  capabilities: [],
  updateActivation: 'cold-launch',
  appShell: { additionalPrecache: [] },
})

describe('platform gate integration policy', () => {
  it.each([
    ['ios', true, false, 'release', false, 'install'],
    ['ios', true, true, 'release', false, 'run'],
    ['ios', true, false, 'preview', false, 'run'],
    ['ios', true, false, 'release', true, 'run'],
    ['ios', false, true, 'preview', true, 'unsupported'],
    ['all', false, false, 'release', false, 'run'],
  ] as const)(
    'decides startup for %s ios=%s standalone=%s profile=%s server=%s',
    (platforms, ios, standalone, profile, devServer, expected) => {
      expect(resolvePlatformGate(platforms, ios, standalone, profile, devServer)).toBe(expected)
    },
  )

  it('warns only production builds whose gate has been disabled', () => {
    const unrestricted = defineSatinApp({ ...app, platforms: 'all' })
    expect(platformBuildWarning(app, true)).toBeUndefined()
    expect(platformBuildWarning(unrestricted, false)).toBeUndefined()
    expect(platformBuildWarning(unrestricted, true)).toContain('PLATFORM GATE DISABLED')
    expect(platformBuildWarning(unrestricted, true)).toContain(
      'Chromium and Gecko browsers to execute your app',
    )
  })

  it('redirects a spoofed iPhone before installing a watchdog or worker', () => {
    const redirect: string[] = []
    const window: Record<string, unknown> = {}
    const viewport = { content: '' }
    const script = generateAppHead([{ app, query: {} }], '/', true).match(
      /<script id="satin-platform-gate">([\s\S]*?)<\/script>/,
    )![1]!
    runInNewContext(script, {
      window,
      navigator: {
        userAgent: 'Mozilla iPhone AppleWebKit/537.36',
        platform: 'iPhone',
        maxTouchPoints: 5,
      },
      CSS: { supports: () => false },
      innerWidth: 440,
      innerHeight: 894,
      performance: { mark() {} },
      URLSearchParams,
      location: { search: '', replace: (url: string) => redirect.push(url) },
      document: {
        querySelector: () => viewport,
        documentElement: { dataset: {} },
      },
      // Later launch setup would need timers and service-worker APIs, deliberately absent.
    })
    expect(window.__SATIN_PLATFORM_BLOCKED__).toBe(true)
    expect(redirect).toEqual([app.scope + 'unsupported.html'])
    expect(window.__SATIN_WORKER_LOOKUP__).toBeUndefined()
  })

  it('tells blocked users to open the app on their iPhone or iPad', () => {
    const page = installPage(app, 'gate', '/')
    expect(page).toContain('This app is designed for iPhone and iPad')
    expect(page).toContain('<h1 class="ix-title">This app is designed for iPhone and iPad</h1>')
  })

  it('keeps the starter instructions aligned with the supported test environment', () => {
    const read = (path: string) =>
      readFileSync(new URL('../../../../' + path, import.meta.url), 'utf8')
    const instructions = read('templates/basic/AGENTS.md')
    expect(instructions).toContain('Never change `platforms`')
    expect(instructions).toContain('Never test the app in a non-WebKit browser')
    for (const path of ['templates/basic/README.md', 'docs/getting-started.md']) {
      const text = read(path)
      expect(text).toContain('iOS Simulator')
      expect(text).not.toContain("platforms: 'all'")
      expect(text).not.toContain('allow other browsers for development')
    }
  })
})
