import { afterEach, expect, it, vi } from 'vitest'
import { PendingSurfaceInput } from './pendingSurfaceInput.ts'

afterEach(() => {
  vi.useRealTimers()
})
type Input = { phase: 'pressed' | 'dragging' | 'releasing' | 'rest'; at: number; x?: number }
const make = () => {
  const timeouts: number[] = []
  return {
    timeouts,
    pending: new PendingSurfaceInput<Input>(3000, queued => timeouts.push(queued.length)),
  }
}

it('holds a contact in progress and replays its press, then its latest drag', () => {
  const { pending } = make()
  pending.hold({ phase: 'rest', at: 1 })
  expect(pending.size).toBe(0)
  pending.hold({ phase: 'pressed', at: 2 })
  pending.hold({ phase: 'dragging', at: 3, x: 10 })
  pending.hold({ phase: 'dragging', at: 4, x: 12 })
  expect(pending.release()).toEqual([
    { phase: 'pressed', at: 2 },
    { phase: 'dragging', at: 4, x: 12 },
  ])
})

it('a contact that ends before the source arrives is dropped at once, with no later error (review 3)', () => {
  vi.useFakeTimers()
  const { pending, timeouts } = make()
  pending.hold({ phase: 'pressed', at: 1 })
  pending.hold({ phase: 'releasing', at: 2 })
  expect(pending.size).toBe(0)
  pending.hold({ phase: 'pressed', at: 3 })
  pending.hold({ phase: 'rest', at: 4 })
  vi.advanceTimersByTime(10_000)
  expect(timeouts).toEqual([])
  expect(pending.release()).toEqual([])
})

it('many drag samples keep the press and coalesce to the latest position (review 4)', () => {
  const { pending } = make()
  pending.hold({ phase: 'pressed', at: 0 })
  for (let i = 1; i <= 200; i++) pending.hold({ phase: 'dragging', at: i, x: i })
  expect(pending.release()).toEqual([
    { phase: 'pressed', at: 0 },
    { phase: 'dragging', at: 200, x: 200 },
  ])
})

it('fails loudly when a held press never gets its source', () => {
  vi.useFakeTimers()
  const { pending, timeouts } = make()
  pending.hold({ phase: 'pressed', at: 1 })
  pending.hold({ phase: 'dragging', at: 2 })
  vi.advanceTimersByTime(2999)
  expect(timeouts).toEqual([])
  vi.advanceTimersByTime(1)
  expect(timeouts).toEqual([2])
})
