import { expect, it, vi } from 'vitest'
import {
  GLASS_LAUNCH_BUDGET_MS,
  armPreparationBudget,
  armVisibleLaunchBudget,
  glassLaunchTimedOut,
} from './launchReadiness.ts'

it('keeps preparation available after suspension and still fails a visible stall', () => {
  vi.useFakeTimers()
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now())
  let visibility: DocumentVisibilityState = 'visible'
  const doc = Object.defineProperty(new EventTarget(), 'visibilityState', {
    get: () => visibility,
  }) as unknown as Document
  let launch = 'preparing'
  const progressAt = performance.now()
  const dispose = armPreparationBudget(
    () => {
      launch = 'failed'
    },
    () => progressAt,
    doc,
  )
  const advance = (duration: number) => vi.advanceTimersByTime(duration)
  try {
    advance(10_000)
    visibility = 'hidden'
    doc.dispatchEvent(new Event('visibilitychange'))
    advance(35_000)
    expect(launch).toBe('preparing')
    visibility = 'visible'
    doc.dispatchEvent(new Event('visibilitychange'))
    advance(19_000)
    expect(launch).toBe('preparing')
    advance(1000)
    expect(launch).toBe('failed')
    visibility = 'hidden'
    doc.dispatchEvent(new Event('visibilitychange'))
    advance(35_000)
    visibility = 'visible'
    doc.dispatchEvent(new Event('visibilitychange'))
    expect(launch).toBe('failed')
  } finally {
    dispose()
    vi.useRealTimers()
    vi.restoreAllMocks()
  }
})

it('resets the visible preparation budget when a download advances after a hidden launch', () => {
  vi.useFakeTimers()
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now())
  let visibility: DocumentVisibilityState = 'hidden'
  const doc = Object.defineProperty(new EventTarget(), 'visibilityState', {
    get: () => visibility,
  }) as unknown as Document
  let progressAt = performance.now()
  let launch = 'preparing'
  const dispose = armPreparationBudget(
    () => {
      launch = 'failed'
    },
    () => progressAt,
    doc,
  )
  try {
    vi.advanceTimersByTime(35_000)
    visibility = 'visible'
    doc.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(29_000)
    progressAt = performance.now()
    vi.advanceTimersByTime(29_000)
    expect(launch).toBe('preparing')
    vi.advanceTimersByTime(1000)
    expect(launch).toBe('failed')
  } finally {
    dispose()
    vi.useRealTimers()
    vi.restoreAllMocks()
  }
})

it('reveals a prepared app through the baseline when GPU presentation never reports ready', () => {
  expect(glassLaunchTimedOut(true, false, GLASS_LAUNCH_BUDGET_MS - 1)).toBe(false)
  expect(glassLaunchTimedOut(true, false, GLASS_LAUNCH_BUDGET_MS)).toBe(true)
  expect(glassLaunchTimedOut(true, false, 30_000)).toBe(true)
})

it('does not bypass content preparation or replace a ready glass presenter', () => {
  expect(glassLaunchTimedOut(false, false, 30_000)).toBe(false)
  expect(glassLaunchTimedOut(true, true, 30_000)).toBe(false)
})

it('counts only visible time toward the launch budget', () => {
  vi.useFakeTimers()
  let state: DocumentVisibilityState = 'hidden'
  const doc = Object.defineProperty(new EventTarget(), 'visibilityState', {
    get: () => state,
  }) as unknown as Document
  const expire = vi.fn()
  const dispose = armVisibleLaunchBudget(expire, GLASS_LAUNCH_BUDGET_MS, doc)
  vi.advanceTimersByTime(GLASS_LAUNCH_BUDGET_MS * 4)
  expect(expire).not.toHaveBeenCalled()
  state = 'visible'
  doc.dispatchEvent(new Event('visibilitychange'))
  vi.advanceTimersByTime(GLASS_LAUNCH_BUDGET_MS - 1)
  state = 'hidden'
  doc.dispatchEvent(new Event('visibilitychange'))
  vi.advanceTimersByTime(GLASS_LAUNCH_BUDGET_MS)
  expect(expire).not.toHaveBeenCalled()
  state = 'visible'
  doc.dispatchEvent(new Event('visibilitychange'))
  vi.advanceTimersByTime(GLASS_LAUNCH_BUDGET_MS)
  expect(expire).toHaveBeenCalledTimes(1)
  dispose()
  vi.useRealTimers()
})
