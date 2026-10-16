import { afterEach, expect, it, vi } from 'vitest'
import { onScrollJump, scrollAfterGlassPrepared } from './scrollJump.ts'

afterEach(() => vi.useRealTimers())

it('starts each tap synchronously and never restarts after preparation or a new finger', async () => {
  vi.useFakeTimers()
  const finish: (() => void)[] = []
  const remove = onScrollJump(() => new Promise<void>(resolve => finish.push(resolve)))
  try {
    const element = {}
    const scroll = vi.fn()
    scrollAfterGlassPrepared(element, 0, scroll)
    expect(scroll).toHaveBeenCalledTimes(1)
    scrollAfterGlassPrepared(element, 0, scroll)
    expect(scroll).toHaveBeenCalledTimes(2)
    // The user can touch the scroller now. No deferred callback may restart it.
    for (const resolve of finish) resolve()
    await vi.advanceTimersByTimeAsync(1000)
    expect(scroll).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  } finally {
    remove()
  }
})

it('starts at once even when preparation cannot finish', () => {
  const remove = onScrollJump(() => new Promise<void>(() => {}))
  try {
    const scroll = vi.fn()
    scrollAfterGlassPrepared({}, 0, scroll)
    expect(scroll).toHaveBeenCalledOnce()
  } finally {
    remove()
  }
})

it('starts at once with no preparation and does not repeat after a failed preparation', async () => {
  const scroll = vi.fn()
  scrollAfterGlassPrepared({}, 0, scroll)
  expect(scroll).toHaveBeenCalledTimes(1)
  const remove = onScrollJump(() => Promise.reject(Error('capture failed')))
  try {
    scrollAfterGlassPrepared({}, 0, scroll)
    expect(scroll).toHaveBeenCalledTimes(2)
    await Promise.resolve()
    await Promise.resolve()
    expect(scroll).toHaveBeenCalledTimes(2)
  } finally {
    remove()
  }
})
