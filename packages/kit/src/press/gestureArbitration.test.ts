import { describe, expect, it, vi } from 'vitest'
import {
  cancelPointerPressForOwnedGesture,
  registerPointerPressCancellation,
  observePointerPressCancellation,
} from './gestureArbitration.ts'

describe('owned gesture arbitration', () => {
  it('cancels a Pressable once and removes its pointer registration', () => {
    const cancel = vi.fn()
    registerPointerPressCancellation(7, cancel)

    expect(cancelPointerPressForOwnedGesture(7)).toBe(true)
    expect(cancel).toHaveBeenCalledOnce()
    expect(cancelPointerPressForOwnedGesture(7)).toBe(false)
  })

  it('does not let stale cleanup remove a newer pointer owner', () => {
    const oldCancel = vi.fn()
    const newCancel = vi.fn()
    const releaseOld = registerPointerPressCancellation(4, oldCancel)
    registerPointerPressCancellation(4, newCancel)

    releaseOld()
    expect(cancelPointerPressForOwnedGesture(4)).toBe(true)
    expect(oldCancel).not.toHaveBeenCalled()
    expect(newCancel).toHaveBeenCalledOnce()
  })
})

it('cancels prepared resources together with the activation owner, once', () => {
  const owner = vi.fn(),
    prepared = vi.fn()
  const stop = observePointerPressCancellation(90, prepared)
  registerPointerPressCancellation(90, owner)
  expect(cancelPointerPressForOwnedGesture(90)).toBe(true)
  expect(owner).toHaveBeenCalledOnce()
  expect(prepared).toHaveBeenCalledOnce()
  expect(cancelPointerPressForOwnedGesture(90)).toBe(false)
  stop()
})
it('removing an observer does not remove the live activation owner', () => {
  const owner = vi.fn(),
    stale = vi.fn(),
    current = vi.fn()
  const stop = observePointerPressCancellation(91, stale)
  registerPointerPressCancellation(91, owner)
  observePointerPressCancellation(91, current)
  stop()
  cancelPointerPressForOwnedGesture(91)
  expect(owner).toHaveBeenCalledOnce()
  expect(current).toHaveBeenCalledOnce()
  expect(stale).not.toHaveBeenCalled()
})
