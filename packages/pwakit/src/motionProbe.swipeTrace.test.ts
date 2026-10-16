import { afterEach, expect, test, vi } from 'vitest'

type TraceGlobal = { __SATIN_SWIPE_TRACE__?: unknown }

afterEach(() => {
  delete (globalThis as TraceGlobal).__SATIN_SWIPE_TRACE__
  vi.resetModules()
})

test('swipe trace is off by default: records are never built', async () => {
  vi.resetModules()
  const probe = await import('./motionProbe.ts')
  const build = vi.fn(() => ({ kind: 'navigation-release-start' }))
  probe.recordMotionPreparation(build)
  expect(build).not.toHaveBeenCalled()
  expect(probe.swipeTraceEnabled()).toBe(false)
})

test('a sink installed before load receives motion records and navigation tracks', async () => {
  vi.resetModules()
  const record = vi.fn()
  const tracks = vi.fn()
  ;(globalThis as TraceGlobal).__SATIN_SWIPE_TRACE__ = { record, tracks }
  const probe = await import('./motionProbe.ts')
  expect(probe.swipeTraceEnabled()).toBe(true)
  const build = vi.fn(() => ({ kind: 'navigation-release-start', from: 0.4 }))
  probe.recordMotionPreparation(build)
  expect(build).toHaveBeenCalledTimes(1)
  expect(record).toHaveBeenCalledWith({ kind: 'navigation-release-start', from: 0.4 })
  probe.traceNavigationTracks('pop-scrub', [])
  expect(tracks).toHaveBeenCalledWith('pop-scrub', [])
})
