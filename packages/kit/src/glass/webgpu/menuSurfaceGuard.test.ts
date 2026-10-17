// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MenuSurfaceGuard, type MenuSurfaceStage } from './menuSurfaceGuard.ts'

let visibility: DocumentVisibilityState = 'visible'
const setVisibility = (state: DocumentVisibilityState) => {
  visibility = state
  document.dispatchEvent(new Event('visibilitychange'))
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] })
  visibility = 'visible'
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
})
afterEach(() => {
  vi.useRealTimers()
})

const make = (stage: MenuSurfaceStage = 'prepare') => {
  const fail = vi.fn()
  return { fail, guard: new MenuSurfaceGuard(10_000, () => stage, fail) }
}

it('disabled is an error at once', () => {
  const { fail, guard } = make()
  guard.disabled()
  expect(String(fail.mock.calls[0][0])).toMatch(/not enabled/)
})

it('the budget is 10 s of visible time from the first held run, naming the pending stage', () => {
  const { fail, guard } = make('install-ack')
  guard.start()
  vi.advanceTimersByTime(5000)
  guard.start()
  vi.advanceTimersByTime(4999)
  expect(fail).not.toHaveBeenCalled()
  vi.advanceTimersByTime(1)
  expect(fail).toHaveBeenCalledTimes(1)
  expect(String(fail.mock.calls[0][0])).toMatch(/10 s of visible time \(pending: install-ack\)/)
  expect(guard.pending).toBe(false)
})

it('hidden time does not count; cancel ends the wait', () => {
  const { fail, guard } = make()
  guard.start()
  vi.advanceTimersByTime(6000)
  setVisibility('hidden')
  vi.advanceTimersByTime(60_000)
  setVisibility('visible')
  vi.advanceTimersByTime(3999)
  expect(fail).not.toHaveBeenCalled()
  guard.cancel()
  vi.advanceTimersByTime(60_000)
  expect(fail).not.toHaveBeenCalled()
})
