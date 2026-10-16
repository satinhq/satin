import { describe, expect, it, vi } from 'vitest'
import {
  createCriticallyDampedScrubFilter,
  createInteractiveScrubFrameLoop,
} from './scrubFrameLoop.ts'

function frameHarness() {
  let nextFrame = 1
  const callbacks = new Map<number, FrameRequestCallback>()
  return {
    cancelFrame: vi.fn((frame: number) => callbacks.delete(frame)),
    flush(time: number) {
      const pending = [...callbacks.values()]
      callbacks.clear()
      for (const callback of pending) callback(time)
    },
    pending() {
      return callbacks.size
    },
    requestFrame: vi.fn((callback: FrameRequestCallback) => {
      const frame = nextFrame
      nextFrame += 1
      callbacks.set(frame, callback)
      return frame
    }),
  }
}

describe('interactive scrub frame loop', () => {
  it('coalesces the newest input into one visual write per frame', () => {
    const frames = frameHarness()
    const applyProgress = vi.fn()
    const metrics = vi.fn()
    const loop = createInteractiveScrubFrameLoop({
      applyProgress,
      cancelFrame: frames.cancelFrame,
      onFrame: metrics,
      requestFrame: frames.requestFrame,
      resolve: vi.fn(),
    })

    loop.record(0.1, 0)
    loop.record(0.2, 8)
    loop.record(0.3, 16)

    expect(frames.pending()).toBe(1)
    expect(applyProgress).not.toHaveBeenCalled()
    frames.flush(16.7)
    expect(applyProgress).toHaveBeenCalledOnce()
    expect(applyProgress).toHaveBeenCalledWith(0.3)
    expect(metrics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventsThisFrame: 3,
        frameCount: 1,
        inputCount: 3,
      }),
    )

    frames.flush(33.4)
    expect(applyProgress).toHaveBeenCalledOnce()
    expect(metrics).toHaveBeenLastCalledWith(
      expect.objectContaining({
        eventsThisFrame: 0,
        frameCount: 2,
      }),
    )
    loop.dispose()
  })

  it('paints the final raw sample before resolving with raw release velocity', () => {
    const frames = frameHarness()
    const calls: string[] = []
    const loop = createInteractiveScrubFrameLoop({
      applyProgress(progress) {
        calls.push(`paint:${progress}`)
      },
      cancelFrame: frames.cancelFrame,
      requestFrame: frames.requestFrame,
      resolve(target, velocity) {
        calls.push(`${target}:${velocity}`)
      },
    })

    loop.record(0.2, 10)
    loop.resolve('complete', 0.42, 379, 20)
    expect(calls).toEqual([])
    frames.flush(24)
    expect(calls).toEqual(['paint:0.42', 'complete:379'])
  })

  it('cancels outstanding work when disposed', () => {
    const frames = frameHarness()
    const applyProgress = vi.fn()
    const loop = createInteractiveScrubFrameLoop({
      applyProgress,
      cancelFrame: frames.cancelFrame,
      requestFrame: frames.requestFrame,
      resolve: vi.fn(),
    })

    loop.record(0.5, 0)
    loop.dispose()
    frames.flush(16)
    expect(frames.cancelFrame).toHaveBeenCalledOnce()
    expect(applyProgress).not.toHaveBeenCalled()
  })
})

describe('critically damped scrub filter candidate', () => {
  it('has no lag for the initial resting sample and preserves raw release velocity', () => {
    const filter = createCriticallyDampedScrubFilter(24)
    expect(filter.sample(0.4, 100, 517)).toEqual({
      progress: 0.4,
      velocityPointsPerSecond: 517,
    })
    expect(filter.sample(0.4, 116, 0)).toEqual({
      progress: 0.4,
      velocityPointsPerSecond: 0,
    })
  })

  it('converges monotonically to a stationary target without overshoot', () => {
    const filter = createCriticallyDampedScrubFilter(24)
    filter.sample(0, 0, 0)
    const samples: number[] = []
    for (let frame = 1; frame <= 30; frame += 1) {
      samples.push(filter.sample(1, frame * 16.67, 0).progress)
    }

    expect(samples.every(sample => sample >= 0 && sample <= 1)).toBe(true)
    expect(samples.every((sample, index) => index === 0 || sample >= samples[index - 1]!)).toBe(
      true,
    )
    expect(samples.at(-1)).toBeCloseTo(1, 6)
  })
})
