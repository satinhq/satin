// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defineSatinApp } from './definition.ts'
import { generateAppHead } from './head.ts'

const app = defineSatinApp({
  platforms: 'all',
  id: '/watchdog-test',
  name: 'Watchdog test',
  shortName: 'Watchdog',
  description: 'Generated head message delivery regression',
  scope: '/',
  startRoute: '/',
  icons: [{ src: '/icon.png', sizes: '512x512', type: 'image/png' }],
  appearance: { background: '#ffffff', darkLaunch: 'match-light' },
  orientations: { supported: ['portrait', 'landscape'], fallback: 'none' },
  connectivity: 'local',

  capabilities: [],
  updateActivation: 'cold-launch',
  appShell: { additionalPrecache: [] },
})

let workers: EventTarget

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now())
  vi.spyOn(performance, 'getEntriesByType').mockReturnValue([])
  vi.spyOn(console, 'error').mockImplementation(() => {})
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  workers = Object.assign(new EventTarget(), {
    getRegistration: vi.fn(async () => undefined),
    register: vi.fn(async () => ({ installing: { postMessage: vi.fn() } })),
  })
  vi.stubGlobal('navigator', {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    serviceWorker: workers,
  })
  delete window.__SATIN_APPEARANCE__
  document.head.innerHTML = generateAppHead([{ app, query: {} }], '/')
  document.body.innerHTML = '<div id="satin-launch-screen"></div>'
  const scripts = document.head.querySelectorAll('script:not([type])')
  expect(scripts.length).toBeGreaterThan(0)
  // Execute the production head, including its serialized watchdog and real worker listener.
  for (const script of scripts) {
    expect(script.textContent).toBeTruthy()
    new Function(script.textContent!)()
  }
})

afterEach(() => {
  window.dispatchEvent(new Event('satin-launch-revealed'))
  vi.unstubAllGlobals()
  localStorage.clear()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function deliverProgress(loaded: number, scriptURL = new URL('/sw.js', location.href).href) {
  workers.dispatchEvent(
    new MessageEvent('message', {
      data: { type: 'SATIN_DOWNLOAD_PROGRESS', loaded, total: 100, downloading: true },
      source: { scriptURL } as unknown as ServiceWorker,
    }),
  )
}

it('keeps delayed bootstrap covered while real worker messages advance', () => {
  for (let loaded = 1; loaded <= 4; loaded++) {
    vi.advanceTimersByTime(9_000)
    deliverProgress(loaded)
    expect(document.getElementById('satin-launch-error')).toBeNull()
    expect(document.getElementById('satin-launch-screen')?.hidden).toBe(false)
  }
  window.dispatchEvent(new Event('satin-launch-revealed'))
  vi.advanceTimersByTime(20_000)
  expect(document.getElementById('satin-launch-error')).toBeNull()
  // Readiness starts retirement; only the launch runtime may finish hiding the cover.
  expect(document.getElementById('satin-launch-screen')?.hidden).toBe(false)
})

it('removes the stalled overlay when real worker delivery resumes before bootstrap', () => {
  vi.advanceTimersByTime(9_000)
  deliverProgress(1)
  vi.advanceTimersByTime(10_000)
  expect(document.getElementById('satin-launch-error')?.textContent).toContain(
    'stopped making progress',
  )
  expect(document.getElementById('satin-launch-screen')?.hidden).toBe(true)
  deliverProgress(2)
  expect(document.getElementById('satin-launch-error')).toBeNull()
  expect(document.getElementById('satin-launch-screen')?.hidden).toBe(false)
  vi.advanceTimersByTime(9_000)
  expect(document.getElementById('satin-launch-error')).toBeNull()
  window.dispatchEvent(new Event('satin-launch-revealed'))
  expect(document.getElementById('satin-launch-screen')?.hidden).toBe(false)
})

it('does not count another app worker or repeated bytes as resumed progress', () => {
  deliverProgress(1)
  vi.advanceTimersByTime(10_000)
  expect(document.getElementById('satin-launch-error')).not.toBeNull()
  deliverProgress(2, new URL('/other/sw.js', location.href).href)
  deliverProgress(1)
  expect(document.getElementById('satin-launch-error')).not.toBeNull()
  deliverProgress(2)
  expect(document.getElementById('satin-launch-error')).toBeNull()
})

it('supersedes failed installation diagnostics only on a successful build installation', () => {
  localStorage.clear()
  window.dispatchEvent(new Event('satin-launch-revealed'))
  // Model completed runtime retirement before a background replacement fails.
  document.getElementById('satin-launch-screen')!.hidden = true
  const deliver = (data: unknown) =>
    workers.dispatchEvent(
      new MessageEvent('message', {
        data,
        source: { scriptURL: new URL('/sw.js', location.href).href } as unknown as ServiceWorker,
      }),
    )
  const failure = {
    type: 'SATIN_INSTALL_FAILURE',
    buildId: 'broken',
    url: '/secondary.js',
    reason: 'HTTP 404',
    networkFailure: false,
  }
  deliver(failure)
  expect(console.error).toHaveBeenCalledWith('[Satin installation]', '/secondary.js', 'HTTP 404')
  expect(document.getElementById('satin-launch-error')).toBeNull()
  expect(document.getElementById('satin-launch-screen')?.hidden).toBe(true)
  expect(JSON.parse(localStorage.getItem('satin-install-failure:/')!)).toMatchObject(failure)
  deliver({
    type: 'SATIN_DOWNLOAD_PROGRESS',
    buildId: 'broken',
    loaded: 100,
    total: 100,
    downloading: false,
  })
  expect(localStorage.getItem('satin-install-failure:/')).not.toBeNull()
  deliver({ type: 'SATIN_INSTALL_SUCCESS', buildId: 'repaired' })
  expect(localStorage.getItem('satin-install-failure:/')).toBeNull()
  expect(JSON.parse(localStorage.getItem('satin-install-failure:/:build:broken')!)).toMatchObject(
    failure,
  )
  expect(JSON.parse(localStorage.getItem('satin-install-success:/')!)).toEqual({
    buildId: 'repaired',
    recordedAt: expect.any(Number),
  })
  localStorage.clear()
})

it('clears stale failure before a quota failure writing installation success', () => {
  localStorage.setItem(
    'satin-install-failure:/',
    JSON.stringify({
      buildId: 'broken',
      url: '/failed.js',
      reason: 'HTTP 404',
      networkFailure: false,
    }),
  )
  localStorage.setItem('satin-install-success:/', JSON.stringify({ buildId: 'older' }))
  const storage = localStorage
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.getItem(key),
    removeItem: (key: string) => storage.removeItem(key),
    setItem: () => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    },
  })
  workers.dispatchEvent(
    new MessageEvent('message', {
      data: { type: 'SATIN_INSTALL_SUCCESS', buildId: 'repaired' },
      source: { scriptURL: new URL('/sw.js', location.href).href } as unknown as ServiceWorker,
    }),
  )
  expect(localStorage.getItem('satin-install-failure:/')).toBeNull()
})

it('orders success and a later failure within the same clock tick', () => {
  const deliver = (data: unknown) =>
    workers.dispatchEvent(
      new MessageEvent('message', {
        data,
        source: { scriptURL: new URL('/sw.js', location.href).href } as unknown as ServiceWorker,
      }),
    )
  deliver({ type: 'SATIN_INSTALL_SUCCESS', buildId: 'build' })
  deliver({
    type: 'SATIN_INSTALL_FAILURE',
    buildId: 'build',
    url: '/failed.js',
    reason: 'HTTP 404',
    networkFailure: false,
  })
  const success = JSON.parse(localStorage.getItem('satin-install-success:/')!)
  const failure = JSON.parse(localStorage.getItem('satin-install-failure:/')!)
  expect(failure.recordedAt).toBeGreaterThan(success.recordedAt)
  localStorage.clear()
})

it('paints first-install bytes before modules load, but not an update behind a controlling worker', () => {
  const progress = vi.fn()
  const host = window as unknown as { __SATIN_LAUNCH_SCREEN__: { progress: typeof progress } }
  const previous = host.__SATIN_LAUNCH_SCREEN__
  host.__SATIN_LAUNCH_SCREEN__ = { progress }
  try {
    deliverProgress(25)
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ loaded: 25, total: 100 }))
    Object.assign(workers, { controller: { scriptURL: new URL('/sw.js', location.href).href } })
    deliverProgress(50)
    expect(progress).toHaveBeenCalledTimes(1)
  } finally {
    host.__SATIN_LAUNCH_SCREEN__ = previous
  }
})
