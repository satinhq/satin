import { afterEach, expect, it, vi } from 'vitest'
import { MenuLiftInput, type MenuLiftSurface } from './menuLiftInput.ts'
import type { SurfaceInput } from './pendingSurfaceInput.ts'

afterEach(() => {
  vi.useRealTimers()
})
/** MenuLiftInput with fake callbacks (unit level); entry.worker.menuLift.test.ts drives the worker itself. */
function worker() {
  let surface: MenuLiftSurface | undefined
  const applied: string[] = [],
    errors: string[] = []
  const input = new MenuLiftInput({
    surface: () => surface,
    apply: (request: SurfaceInput) => {
      applied.push(request.phase + (request.x === undefined ? '' : '@' + request.x))
    },
    fail: error => {
      errors.push(error.message)
    },
  })
  return {
    input,
    applied,
    errors,
    install: () => {
      surface = { first: { halfWidth: 22, halfHeight: 22 } }
      input.sourceInstalled()
    },
  }
}
const at = (phase: SurfaceInput['phase'], t: number, x?: number) => ({
  id: 'menu-lift',
  phase,
  at: t,
  x,
})

it('a tap before the menu lift source is installed does not throw (12eff menu flow: 7 glass errors)', () => {
  const w = worker()
  expect(() => {
    w.input.input(at('rest', 1))
    w.input.input(at('pressed', 2))
  }).not.toThrow()
  expect(w.applied).toEqual([])
  w.install()
  expect(w.applied).toEqual(['pressed'])
  w.input.input(at('releasing', 3))
  expect(w.applied).toEqual(['pressed', 'releasing'])
  expect(w.errors).toEqual([])
})

it('a press released before the source arrives replays nothing and never errors (review 3)', () => {
  vi.useFakeTimers()
  const w = worker()
  w.input.input(at('pressed', 1))
  w.input.input(at('dragging', 2, 5))
  w.input.input(at('releasing', 3))
  vi.advanceTimersByTime(10_000)
  w.install()
  expect(w.applied).toEqual([])
  expect(w.errors).toEqual([])
})

it('a long held drag before install still lifts: press kept, latest drag replayed (review 4)', () => {
  const w = worker()
  w.input.input(at('pressed', 0))
  for (let i = 1; i <= 100; i++) w.input.input(at('dragging', i, i))
  w.install()
  expect(w.applied).toEqual(['pressed', 'dragging@100'])
})

it('older input is ignored, an unknown surface throws, and a press that never gets its source is loud', () => {
  vi.useFakeTimers()
  const w = worker()
  w.input.input(at('pressed', 10))
  w.input.input(at('releasing', 5))
  expect(w.input.held).toBe(1)
  expect(() => w.input.input({ id: 'other', phase: 'pressed', at: 11 })).toThrow(
    'Unknown interactive glass surface',
  )
  vi.advanceTimersByTime(3000)
  expect(w.errors).toHaveLength(1)
})
