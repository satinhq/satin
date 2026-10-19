import { setupPrelaunch, prelaunchDOM } from './prelaunch.test-helper.ts'
// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { reportGlassError } from '../glass/errors.ts'
import { installLaunchWatchdog } from './launchWatchdog.ts'

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now())
  document.body.innerHTML = '<div id="satin-launch-screen"></div>'
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  setupPrelaunch()
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
  expect(prelaunchDOM.getElementById('satin-launch-error')?.textContent).toContain(
    'satin-content-prepared',
  )
  expect(prelaunchDOM.getElementById('satin-launch-screen')?.hidden).toBe(true)
  expect(prelaunchDOM.querySelector('button')?.textContent).toBe('Retry')
})
it('shows a stalled document failure even before its body arrives', () => {
  const body = document.body
  body.remove()
  try {
    installLaunchWatchdog(10_000)
    vi.advanceTimersByTime(10_000)
    expect(prelaunchDOM.querySelector('[role="alert"]')?.textContent).toContain(
      'Launch stopped making progress. Please retry.',
    )
    expect(prelaunchDOM.querySelector('button')?.textContent).toBe('Retry')
  } finally {
    prelaunchDOM.getElementById('satin-launch-error')?.remove()
    document.documentElement.append(body)
  }
})
it('does not spend the budget while hidden or download bytes advance', () => {
  installLaunchWatchdog(10_000)
  Object.defineProperty(document, 'hidden', { configurable: true, value: true })
  document.dispatchEvent(new Event('visibilitychange'))
  vi.advanceTimersByTime(30_000)
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  document.dispatchEvent(new Event('visibilitychange'))
  for (let loaded = 1; loaded <= 4; loaded++) {
    vi.advanceTimersByTime(9_000)
    window.dispatchEvent(new CustomEvent('satin-launch-progress', { detail: { loaded } }))
  }
  expect(prelaunchDOM.getElementById('satin-launch-error')).toBeNull()
  vi.advanceTimersByTime(10_000)
  expect(prelaunchDOM.getElementById('satin-launch-error')).not.toBeNull()
})
it('makes a glass readiness timeout visible immediately', () => {
  installLaunchWatchdog(10_000)
  window.dispatchEvent(
    new CustomEvent('satin-glass-error', {
      detail: { code: 'readiness-timeout', message: 'No frame' },
    }),
  )
  expect(prelaunchDOM.getElementById('satin-launch-error')?.textContent).toContain(
    'readiness-timeout',
  )
})
it('keeps launching when a release app falls back to the CSS material', () => {
  installLaunchWatchdog(10_000)
  window.dispatchEvent(
    new CustomEvent('satin-glass-error', {
      detail: { code: 'gpu-unavailable', message: 'navigator.gpu is undefined', fallback: true },
    }),
  )
  expect(prelaunchDOM.getElementById('satin-launch-error')).toBeNull()
})
it('launches a release build on a device without WebGPU', () => {
  vi.stubEnv('DEV', false)
  vi.stubEnv('MODE', 'production')
  vi.stubEnv('SATIN_STRICT_GLASS', '')
  try {
    installLaunchWatchdog(10_000)
    reportGlassError('gpu-unavailable', new Error('navigator.gpu is undefined'), 'startup')
    expect(prelaunchDOM.getElementById('satin-launch-error')).toBeNull()
  } finally {
    vi.unstubAllEnvs()
  }
})
it('keeps launching while a release renderer recovers from a null adapter', () => {
  vi.stubEnv('DEV', false)
  vi.stubEnv('MODE', 'production')
  vi.stubEnv('SATIN_STRICT_GLASS', '')
  try {
    installLaunchWatchdog(10_000)
    reportGlassError(
      'adapter-unavailable',
      new Error('navigator.gpu.requestAdapter returned null'),
      'startup',
      undefined,
      { recovering: true },
    )
    expect(prelaunchDOM.getElementById('satin-launch-error')).toBeNull()
  } finally {
    vi.unstubAllEnvs()
  }
})
it('does not replace a revealed app', () => {
  installLaunchWatchdog(10_000)
  window.dispatchEvent(new Event('satin-launch-revealed'))
  vi.advanceTimersByTime(30_000)
  expect(prelaunchDOM.getElementById('satin-launch-error')).toBeNull()
})

it('exposes the production glass readiness timeout immediately', () => {
  installLaunchWatchdog(10_000)
  reportGlassError('readiness-timeout', new Error('GPU readiness stalled'), 'SatinRoot')
  expect(prelaunchDOM.getElementById('satin-launch-error')?.textContent).toContain(
    'readiness-timeout',
  )
  expect(prelaunchDOM.getElementById('satin-launch-screen')?.hidden).toBe(true)
})

it('shows the reset-specific failure before modules load', () => {
  installLaunchWatchdog(10_000)
  window.dispatchEvent(
    new CustomEvent('satin-worker-lookup-error', {
      detail: 'Service worker reset did not finish. Please retry.',
    }),
  )
  expect(prelaunchDOM.getElementById('satin-launch-error')?.textContent).toContain(
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
    const text = prelaunchDOM.getElementById('satin-launch-error')?.textContent
    if (cached) {
      expect(prelaunchDOM.getElementById('satin-launch-error')).toBeNull()
      expect(prelaunchDOM.getElementById('satin-launch-screen')?.hidden).toBe(false)
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
  expect(prelaunchDOM.getElementById('satin-launch-error')).toBeNull()
})

it('requests a one-shot reset only when the watchdog Retry is pressed', () => {
  sessionStorage.clear()
  Object.assign(window, { __SATIN_DEFINITION__: { scope: '/app/' } })
  installLaunchWatchdog(10_000)
  expect(sessionStorage.getItem('satin-install-reset:/app/')).toBeNull()
  vi.advanceTimersByTime(10_000)
  prelaunchDOM.querySelector<HTMLButtonElement>('button')!.click()
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
  expect(prelaunchDOM.getElementById('satin-launch-error')).toBeNull()
})

it('preserves the remaining launch deadline across suspension', () => {
  installLaunchWatchdog(10_000)
  vi.advanceTimersByTime(4_125)
  Object.defineProperty(document, 'hidden', { configurable: true, value: true })
  document.dispatchEvent(new Event('visibilitychange'))
  vi.advanceTimersByTime(600_000)
  expect(prelaunchDOM.getElementById('satin-launch-error')).toBeNull()
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  document.dispatchEvent(new Event('visibilitychange'))
  vi.advanceTimersByTime(5_874)
  expect(prelaunchDOM.getElementById('satin-launch-error')).toBeNull()
  vi.advanceTimersByTime(1)
  expect(prelaunchDOM.getElementById('satin-launch-error')?.textContent).toContain(
    'stopped making progress',
  )
})
