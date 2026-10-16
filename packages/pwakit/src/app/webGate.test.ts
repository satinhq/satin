import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { defineSatinApp } from './definition.ts'
import { generateAppHead } from './head.ts'

const app = defineSatinApp({
  id: '/web-gate',
  name: 'Web gate',
  shortName: 'Web gate',
  description: 'Web gate fixtures',
  scope: '/app/',
  startRoute: '/app/',
  installRoute: '/get-app',
  icons: [{ src: '/icon.png', sizes: '512x512', type: 'image/png' }],
  appearance: { background: '#ffffff', darkLaunch: 'match-light' },
  orientations: { supported: ['portrait', 'landscape'], fallback: 'none' },
  connectivity: 'local',

  capabilities: [],
  updateActivation: 'cold-launch',
  appShell: { additionalPrecache: [] },
})

const gateCases = [
  { name: 'iPhone Safari tab', target: 'iphone', expected: '/get-app' },
  { name: 'iPad Safari desktop UA', target: 'ipad', expected: '/get-app' },
  { name: 'iPhone installed navigator', standalone: true },
  { name: 'iPhone installed display mode', display: true },
  { name: 'iPad Stage Manager standalone', target: 'ipad', display: true },
  { name: 'first installed launch without a service worker', standalone: true },
  { name: 'SFSafariViewController', api: false, expected: '/get-app' },
  { name: 'other apps WKWebView', api: false, expected: '/get-app' },
  {
    name: 'subpath deployment configured install route',
    base: '/project/',
    expected: '/project/get-app',
  },
  { name: 'deep link from Safari', pathname: '/app/messages/42', expected: '/get-app' },
  { name: 'release review query is no escape', search: '?review=1', expected: '/get-app' },
  { name: 'release preview query is no escape', search: '?preview=1', expected: '/get-app' },
  { name: 'preview profile tab', profile: 'preview' },
  { name: 'Vite development server tab', devServer: true },
  { name: 'release non-production build tab', production: false, expected: '/get-app' },
  { name: 'all platforms Safari tab', platforms: 'all' },
  { name: 'all platforms Android tab', platforms: 'all', target: 'android' },
  { name: 'Android refusal', target: 'android', expected: '/app/unsupported.html' },
  { name: 'Mac Safari refusal', target: 'mac', expected: '/app/unsupported.html' },
  { name: 'desktop Chromium refusal', target: 'chromium', expected: '/app/unsupported.html' },
  { name: 'spoofed iPhone refusal', target: 'spoof', expected: '/app/unsupported.html' },
] as const

describe('web is its own platform', () => {
  it.each(gateCases)('$name', fixture => {
    const test = fixture as {
      base?: string
      target?: string
      standalone?: boolean
      display?: boolean
      api?: boolean
      pathname?: string
      search?: string
      profile?: 'preview'
      devServer?: boolean
      production?: boolean
      platforms?: 'all'
      expected?: string
    }
    const target = test.target ?? 'iphone'
    const ios = ['iphone', 'ipad'].includes(target)
    const navigator = {
      userAgent:
        target === 'ipad' || target === 'mac'
          ? 'Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15'
          : target === 'android'
            ? 'Mozilla Android AppleWebKit/537.36'
            : target === 'chromium'
              ? 'Mozilla Linux AppleWebKit/537.36'
              : 'Mozilla iPhone AppleWebKit/605.1.15',
      platform: target === 'ipad' || target === 'mac' ? 'MacIntel' : ios ? 'iPhone' : 'Linux',
      maxTouchPoints: ios ? 5 : 0,
      ...(ios && test.api !== false ? { standalone: test.standalone ?? false } : {}),
    }
    const window: Record<string, unknown> = {}
    const redirects: string[] = []
    const definition = defineSatinApp({
      ...app,
      updateProfile: test.profile ?? 'release',
      platforms: test.platforms ?? 'ios',
    })
    const html = generateAppHead(
      [{ app: definition, query: {} }],
      test.base ?? '/',
      test.production ?? true,
      test.devServer ?? false,
    )
    const script = html.match(/<script id="satin-platform-gate">([\s\S]*?)<\/script>/)![1]!
    runInNewContext(script, {
      window,
      navigator,
      URLSearchParams,
      CSS: { supports: () => ios },
      matchMedia: () => ({ matches: test.display ?? false }),
      performance: { mark() {} },
      location: {
        search: test.search ?? '',
        pathname: test.pathname ?? '/app/',
        replace: (url: string) => redirects.push(url),
      },
    })
    expect(redirects).toEqual(test.expected ? [test.expected] : [])
    expect(window.__SATIN_PLATFORM_BLOCKED__).toBe(Boolean(test.expected))
    expect(window.__SATIN_WORKER_LOOKUP__).toBeUndefined()
  })
})
