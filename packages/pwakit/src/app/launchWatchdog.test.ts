// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { reportGlassError } from '../glass/errors.ts'
import { installLaunchWatchdog } from './launchWatchdog.ts'

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now())
  document.body.innerHTML = '<div id="satin-launch-screen"></div>'
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
})
afterEach(() => {
  window.dispatchEvent(new Event('satin-launch-revealed'))
  vi.useRealTimers()
  vi.restoreAllMocks()
})
it('exposes a stall before React and records the last reached stage', () => {
  vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
    { name: 'satin-content-prepared' } as PerformanceEntry,
  ])
  installLaunchWatchdog(10_000)
  vi.advanceTimersByTime(10_000)
  expect(document.getElementById('satin-launch-error')?.textContent).toContain(
    'satin-content-prepared',
  )
  expect(document.getElementById('satin-launch-screen')?.hidden).toBe(true)
  expect(document.querySelector('button')?.textContent).toBe('Retry')
})
it('shows a stalled document failure even before its body arrives', () => {
  const body = document.body
  body.remove()
  try {
    installLaunchWatchdog(10_000)
    vi.advanceTimersByTime(10_000)
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      'Launch stopped making progress. Please retry.',
    )
    expect(document.querySelector('button')?.textContent).toBe('Retry')
  } finally {
    document.getElementById('satin-launch-error')?.remove()
    document.documentElement.append(body)
  }
})
it('does not spend the budget while hidden or download bytes advance', () => {
  installLaunchWatchdog(10_000)
  Object.defineProperty(document, 'hidden', { configurable: true, value: true })
  vi.advanceTimersByTime(30_000)
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  document.dispatchEvent(new Event('visibilitychange'))
  for (let loaded = 1; loaded <= 4; loaded++) {
    vi.advanceTimersByTime(9_000)
    window.dispatchEvent(new CustomEvent('satin-launch-progress', { detail: { loaded } }))
  }
  expect(document.getElementById('satin-launch-error')).toBeNull()
  vi.advanceTimersByTime(10_000)
  expect(document.getElementById('satin-launch-error')).not.toBeNull()
})
it('makes a glass readiness timeout visible immediately', () => {
  installLaunchWatchdog(10_000)
  window.dispatchEvent(
    new CustomEvent('satin-glass-error', {
      detail: { code: 'readiness-timeout', message: 'No frame' },
    }),
  )
  expect(document.getElementById('satin-launch-error')?.textContent).toContain('readiness-timeout')
})
it('does not replace a revealed app', () => {
  installLaunchWatchdog(10_000)
  window.dispatchEvent(new Event('satin-launch-revealed'))
  vi.advanceTimersByTime(30_000)
  expect(document.getElementById('satin-launch-error')).toBeNull()
})

it('exposes the production glass readiness timeout immediately', () => {
  installLaunchWatchdog(10_000)
  reportGlassError('readiness-timeout', new Error('GPU readiness stalled'), 'SatinRoot')
  expect(document.getElementById('satin-launch-error')?.textContent).toContain('readiness-timeout')
  expect(document.getElementById('satin-launch-screen')?.hidden).toBe(true)
})

it('shows the reset-specific failure before modules load', () => {
  installLaunchWatchdog(10_000)
  window.dispatchEvent(
    new CustomEvent('satin-worker-lookup-error', {
      detail: 'Service worker reset did not finish. Please retry.',
    }),
  )
  expect(document.getElementById('satin-launch-error')?.textContent).toContain(
    'Service worker reset did not finish. Please retry.',
  )
})

it.each([false, true])(
  'distinguishes first-install failure from a failed update (cached=%s)',
  cached => {
    // WebKit and the specification hold a client's worker messages until DOMContentLoaded unless
    // startMessages() is called. A stalled bootstrap module never lets that event fire.
    const listeners: ((event: MessageEvent) => void)[] = []
    const order: string[] = []
    const serviceWorker = {
      controller: cached ? { scriptURL: new URL('/app/sw.js', location.href).href } : null,
      addEventListener: vi.fn((type: string, listener: (event: MessageEvent) => void) => {
        if (type === 'message') listeners.push(listener)
        order.push('listen')
      }),
      startMessages: vi.fn(() => order.push('start')),
    }
    vi.stubGlobal('navigator', { serviceWorker })
    Object.assign(window, { __SATIN_DEFINITION__: { scope: '/app/' } })
    installLaunchWatchdog(10_000)
    expect(serviceWorker.startMessages).toHaveBeenCalledOnce()
    expect(order).toEqual(['listen', 'start'])
    // The stalled resource is named instead of the generic watchdog text.
    listeners[0]!({
      source: { scriptURL: new URL('/app/sw.js', location.href).href },
      data: {
        type: 'SATIN_INSTALL_FAILURE',
        buildId: 'b1',
        url: '/app/assets/index-abc.js',
        reason: 'No download bytes received for 8 s',
        networkFailure: true,
        stalled: true,
      },
    } as unknown as MessageEvent)
    const text = document.getElementById('satin-launch-error')?.textContent
    if (cached) {
      expect(document.getElementById('satin-launch-error')).toBeNull()
      expect(document.getElementById('satin-launch-screen')?.hidden).toBe(false)
      expect(localStorage.getItem('satin-install-failure:/app/')).toContain('b1')
    } else {
      expect(text).toContain('/app/assets/index-abc.js')
      expect(text).toContain('The server stopped responding')
      expect(text).not.toContain('Launch stopped making progress')
    }
    vi.unstubAllGlobals()
  },
)

it('still installs when the browser has no startMessages', () => {
  vi.stubGlobal('navigator', { serviceWorker: { addEventListener: vi.fn() } })
  expect(() => installLaunchWatchdog(10_000)).not.toThrow()
  vi.unstubAllGlobals()
})

it('counts response headers as progress while the body is still pending', () => {
  installLaunchWatchdog(10_000)
  vi.advanceTimersByTime(9000)
  window.dispatchEvent(
    new CustomEvent('satin-launch-progress', { detail: { loaded: 0, activity: 1 } }),
  )
  vi.advanceTimersByTime(9000)
  expect(document.getElementById('satin-launch-error')).toBeNull()
})

it('requests a one-shot reset only when the watchdog Retry is pressed', () => {
  sessionStorage.clear()
  Object.assign(window, { __SATIN_DEFINITION__: { scope: '/app/' } })
  installLaunchWatchdog(10_000)
  expect(sessionStorage.getItem('satin-install-reset:/app/')).toBeNull()
  vi.advanceTimersByTime(10_000)
  document.querySelector<HTMLButtonElement>('button')!.click()
  expect(sessionStorage.getItem('satin-install-reset:/app/')).toBe('1')
})

it('counts headers again after an in-app preparation restart', () => {
  installLaunchWatchdog(10_000)
  const report = (detail: { loaded: number; activity: number } | null) => {
    window.dispatchEvent(new CustomEvent('satin-launch-progress', { detail }))
  }
  report({ loaded: 0, activity: 5 })
  report(null)
  vi.advanceTimersByTime(9000)
  report({ loaded: 0, activity: 1 })
  vi.advanceTimersByTime(9000)
  expect(document.getElementById('satin-launch-error')).toBeNull()
})
