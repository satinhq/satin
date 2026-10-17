import { describe, expect, it, vi } from 'vitest'
import { TabCompactGesture } from './tabCompactGesture.ts'
import { retargetRestore, restoreSample, interruptedRestoreSample } from './tabRestoreMotion.ts'

describe('compact pointer ownership', () => {
  const setup = () => {
    const actions = { restore: vi.fn(), begin: vi.fn(), move: vi.fn(), end: vi.fn() }
    return { actions, gesture: new TabCompactGesture(actions) }
  }
  it('keeps a stationary native hold compact and restores on release', () => {
    const { actions, gesture } = setup()
    gesture.down(1, 31)
    gesture.move(1, 31)
    expect(actions.restore).not.toHaveBeenCalled()
    gesture.up(1, 31)
    expect(actions.restore).toHaveBeenCalledWith(false)
    expect(actions.end).not.toHaveBeenCalled()
  })
  it('transfers a single contact to pill drag and releases outside without cancelling selection', () => {
    const { actions, gesture } = setup()
    expect(gesture.down(1, 31)).toBe(true)
    expect(gesture.down(2, 200)).toBe(false)
    gesture.move(2, 300)
    gesture.move(1, 60)
    gesture.move(1, 223)
    expect(actions.restore).toHaveBeenCalledExactlyOnceWith(true)
    expect(actions.begin).toHaveBeenCalledExactlyOnceWith(31)
    gesture.up(1, 223)
    expect(actions.end).toHaveBeenCalledExactlyOnceWith(false)
    gesture.cancel()
    expect(actions.end).toHaveBeenCalledTimes(1)
  })
  it('cancels capture loss exactly once and never activates a cancelled short contact', () => {
    const { actions, gesture } = setup()
    gesture.down(1, 31)
    gesture.cancel()
    expect(actions.restore).not.toHaveBeenCalled()
    gesture.down(2, 31)
    gesture.move(2, 223)
    gesture.cancel()
    gesture.cancel()
    expect(actions.end).toHaveBeenCalledExactlyOnceWith(true)
  })
})

it('retargets opacity from the presented opacity, independently of geometry', () => {
  const from = { progress: 0.7, heightProgress: 0.6, fade: 0.9 }
  expect(retargetRestore(from, restoreSample('tap', 0))).toEqual(from)
  expect(retargetRestore(from, restoreSample('tap', 5000))).toEqual({
    progress: 0,
    heightProgress: 0,
    fade: 0,
  })
  const middle = retargetRestore(from, { progress: 0.5, heightProgress: 0.25, fade: 0.75 })
  expect(middle).toEqual({ progress: 0.35, heightProgress: 0.44999999999999996, fade: 0.225 })
})

it('preserves the measured excursion when restoration interrupts an unpainted collapse', () => {
  const from = { progress: 0, heightProgress: 0, fade: 0 }
  expect(interruptedRestoreSample(0, from)).toEqual(from)
  expect(interruptedRestoreSample(95, from).progress).toBeGreaterThan(0.4)
  expect(interruptedRestoreSample(1200, from)).toEqual(from)
  const current = { progress: 0.2, heightProgress: 0.1, fade: 0.3 }
  expect(interruptedRestoreSample(0, current)).toEqual(current)
})

it('retains the main interruption trajectory independently of the new tap fit', () => {
  const value = interruptedRestoreSample(100, { progress: 0.5, heightProgress: 0.5, fade: 0.5 })
  expect(value.progress).toBeCloseTo(0.4088127042742277, 10)
  expect(value.heightProgress).toBeCloseTo(0.4047100215555126, 10)
  expect(value.fade).toBeCloseTo(0.3354532882777053, 10)
})
