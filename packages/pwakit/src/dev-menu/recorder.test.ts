import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'

it('stops all new contact, record and track collection until re-enabled', () => {
  const events = new Map<string, (event: unknown) => void>()
  const context = {
    document: {
      currentScript: null,
      querySelector: () => null,
      elementFromPoint: () => null,
      addEventListener: vi.fn(),
    },
    location: { href: 'https://app.test/app/' },
    navigator: { userAgent: 'test', standalone: true },
    innerWidth: 440,
    innerHeight: 956,
    devicePixelRatio: 2,
    screen: { width: 440, height: 956 },
    performance: { now: () => 100, timeOrigin: 1 },
    addEventListener: (type: string, listener: (event: unknown) => void) =>
      events.set(type, listener),
    requestAnimationFrame: vi.fn().mockReturnValue(1),
    cancelAnimationFrame: vi.fn(),
    setTimeout: vi.fn().mockReturnValue(1),
    clearTimeout: vi.fn(),
    Element: class {},
    HTMLElement: class {},
  }
  runInNewContext(
    readFileSync(new URL('../../../../scripts/test-support/recorder.js', import.meta.url), 'utf8'),
    context,
  )
  const trace = (
    context as typeof context & {
      __SATIN_SWIPE_TRACE__: {
        setEnabled(enabled: boolean): void
        status(): { enabled: boolean; sessions: number }
        record(value: unknown): void
        tracks(phase: string, tracks: unknown[]): void
      }
    }
  ).__SATIN_SWIPE_TRACE__
  expect(trace.status().enabled).toBe(true)
  trace.setEnabled(false)
  events.get('touchstart')!({ type: 'touchstart', touches: [], changedTouches: [], timeStamp: 1 })
  trace.record({ sample: true })
  trace.tracks('start', [])
  expect(trace.status()).toMatchObject({ enabled: false, sessions: 0 })
  trace.setEnabled(true)
  events.get('touchstart')!({
    type: 'touchstart',
    touches: [{ identifier: 1 }],
    changedTouches: [{ identifier: 1 }],
    timeStamp: 2,
  })
  expect(trace.status()).toMatchObject({ enabled: true, sessions: 1 })
})
