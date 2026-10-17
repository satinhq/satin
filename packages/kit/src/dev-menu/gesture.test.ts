import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDevMenuGesture, DEV_MENU_HOLD_MS } from './gesture.ts'

const one = [{ id: 1, x: 100, y: 100 }]
const two = [...one, { id: 2, x: 200, y: 100 }]
beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())
function fixture() {
  const open = vi.fn()
  let blocked = false
  const gesture = createDevMenuGesture({ open, blocked: () => blocked, now: () => Date.now() })
  return {
    gesture,
    open,
    block: () => {
      blocked = true
    },
  }
}
describe('developer menu passive two-finger hold', () => {
  it('opens once only after both fingers remain still for one second', () => {
    const { gesture, open } = fixture()
    gesture.update(two, 'start')
    vi.advanceTimersByTime(DEV_MENU_HOLD_MS - 1)
    expect(open).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(open).toHaveBeenCalledTimes(1)
    gesture.update(two, 'move')
    vi.advanceTimersByTime(2_000)
    expect(open).toHaveBeenCalledTimes(1)
  })
  it.each(['scroll', 'pinch'])('rejects %s and cannot rearm after the fingers return', movement => {
    const { gesture, open } = fixture()
    gesture.update(two, 'start')
    gesture.update(
      two.map((contact, index) => ({
        ...contact,
        y: contact.y + (movement === 'scroll' || index ? 40 : -40),
      })),
      'move',
    )
    gesture.update(two, 'move')
    vi.advanceTimersByTime(2_000)
    expect(open).not.toHaveBeenCalled()
  })
  it.each(['tap', 'cancel', 'third finger', 'selection', 'late second finger', 'one finger moves'])(
    'rejects %s',
    scenario => {
      const { gesture, open, block } = fixture()
      gesture.update(one, 'start')
      if (scenario === 'late second finger') vi.advanceTimersByTime(200)
      if (scenario === 'one finger moves') gesture.update([{ ...one[0]!, y: 130 }], 'move')
      gesture.update(two, 'start')
      if (scenario === 'tap') gesture.update(one, 'end')
      if (scenario === 'cancel') gesture.update(two, 'cancel')
      if (scenario === 'third finger') {
        gesture.update([...two, { id: 3, x: 300, y: 100 }], 'start')
        gesture.update(two, 'end')
      }
      if (scenario === 'selection') block()
      vi.advanceTimersByTime(2_000)
      expect(open).not.toHaveBeenCalled()
    },
  )
  it('resets after all contacts lift and disposes pending work', () => {
    const { gesture, open } = fixture()
    gesture.update(two, 'cancel')
    gesture.update([], 'end')
    gesture.update(two, 'start')
    vi.advanceTimersByTime(DEV_MENU_HOLD_MS)
    expect(open).toHaveBeenCalledTimes(1)
    gesture.update([], 'end')
    gesture.update(two, 'start')
    gesture.dispose()
    vi.advanceTimersByTime(DEV_MENU_HOLD_MS)
    expect(open).toHaveBeenCalledTimes(1)
  })
})
