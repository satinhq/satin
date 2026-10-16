// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import {
  classifyInstallBrowser,
  classifyInstallDevice,
  copyInstallLink,
  readInstallContext,
  safariVersion,
} from './installContext.ts'

const iphoneSafari =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1'
const ipadDesktop =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Safari/605.1.15'
const instagram =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 400.0'
const chromeIos =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1'
const desktopChrome =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

it('names the device: iPhone, iPad (including desktop-mode iPad), or other', () => {
  expect(classifyInstallDevice(iphoneSafari, 'iPhone', 5)).toBe('iphone')
  expect(classifyInstallDevice(ipadDesktop, 'MacIntel', 5)).toBe('ipad')
  expect(classifyInstallDevice(ipadDesktop, 'MacIntel', 0)).toBe('other')
  expect(classifyInstallDevice(desktopChrome, 'Win32', 0)).toBe('other')
})

it('names the browser: Safari, an in-app browser, or other', () => {
  expect(classifyInstallBrowser(iphoneSafari)).toBe('safari')
  expect(classifyInstallBrowser(instagram)).toBe('in-app')
  expect(classifyInstallBrowser(chromeIos)).toBe('other')
  expect(classifyInstallBrowser(desktopChrome)).toBe('other')
  expect(safariVersion(iphoneSafari)).toBe(27)
  expect(safariVersion(chromeIos)).toBeNull()
})

it('reads the app and reports standalone only from the display mode, never by inference', () => {
  document.body.innerHTML =
    '<script id="satin-install-context" type="application/json">{"name":"Reps","icon":"/icon.png","tint":"#ff5a1f","installRoute":"/install"}</script>'
  vi.stubGlobal('location', {
    href: 'https://reps.example/install',
    origin: 'https://reps.example',
  })
  vi.stubGlobal('navigator', { userAgent: iphoneSafari, platform: 'iPhone', maxTouchPoints: 5 })
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  expect(readInstallContext()).toEqual({
    device: 'iphone',
    browser: 'safari',
    safariVersion: 27,
    standalone: false,
    app: {
      name: 'Reps',
      icon: '/icon.png',
      tint: '#ff5a1f',
      installUrl: 'https://reps.example/install',
    },
  })
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  expect(readInstallContext().standalone).toBe(true)
})

it('copies the install link, and says so with the address when it cannot', async () => {
  document.body.innerHTML =
    '<script id="satin-install-context" type="application/json">{"name":"Reps","icon":"/icon.png","tint":"#ff5a1f","installRoute":"/install"}</script>'
  vi.stubGlobal('location', {
    href: 'https://reps.example/install',
    origin: 'https://reps.example',
  })
  const writeText = vi.fn(async () => {})
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  expect(await copyInstallLink()).toEqual({ copied: true, url: 'https://reps.example/install' })
  expect(writeText).toHaveBeenCalledWith('https://reps.example/install')
  vi.stubGlobal('navigator', {
    clipboard: { writeText: async () => Promise.reject(new Error('no')) },
  })
  expect(await copyInstallLink()).toEqual({ copied: false, url: 'https://reps.example/install' })
  vi.stubGlobal('navigator', {})
  expect(await copyInstallLink()).toEqual({ copied: false, url: 'https://reps.example/install' })
})
