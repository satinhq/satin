import { afterEach, expect, it, vi } from 'vitest'
import { PageFrameHost, WorkerFrameClock, workerAnimationFrameClock } from './frameClock.ts'
import { evaluateTrack } from './cadence.ts'
import type { Envelope } from '../worker/protocol.ts'

afterEach(() => vi.unstubAllGlobals())
it('samples a retained track on worker frames without waiting for a page reply', () => {
  let callback!: FrameRequestCallback
  const cancel = vi.fn()
  vi.stubGlobal('performance', { timeOrigin: 5000 })
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
    callback = fn
    return 17
  })
  vi.stubGlobal('cancelAnimationFrame', cancel)
  const track = { epoch: 5100, duration: 850, from: 0, to: 1, samples: [0, 0.7, 1] }
  const poses: number[] = []
  // The page is stalled for this entire window; only the worker's callback runs.
  for (const timestamp of [200, 217, 233, 250, 267, 283]) {
    workerAnimationFrameClock.request(at => poses.push(evaluateTrack(track, at)))
    callback(timestamp)
  }
  expect(poses).toEqual([200, 217, 233, 250, 267, 283].map(t => evaluateTrack(track, 5000 + t)))
  expect(poses.every((pose, i) => i === 0 || pose > poses[i - 1])).toBe(true)
  workerAnimationFrameClock.cancel(workerAnimationFrameClock.request(vi.fn()))
  expect(cancel).toHaveBeenCalledExactlyOnceWith(17)
})
it('samples the worker at the page frame epoch, not worker delivery time', () => {
  let callback!: FrameRequestCallback
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
    callback = fn
    return 17
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  const replies: Envelope[] = []
  const host = new PageFrameHost()
  const worker = new WorkerFrameClock(message =>
    host.receive(message, reply => replies.push(reply)),
  )
  const sample = vi.fn()
  worker.request(sample)
  callback(100)
  expect(sample).not.toHaveBeenCalled()
  const frame = replies[0].request
  if (frame.type !== 'page-frame') throw Error('Expected page frame')
  worker.receive(frame)
  expect(sample).toHaveBeenCalledExactlyOnceWith(performance.timeOrigin + 100)
  worker.receive(frame)
  expect(sample).toHaveBeenCalledTimes(1)
})
it('rejects cancelled frames already in transit and cancels pending page callbacks', () => {
  const cancel = vi.fn()
  vi.stubGlobal('requestAnimationFrame', () => 17)
  vi.stubGlobal('cancelAnimationFrame', cancel)
  const host = new PageFrameHost()
  const worker = new WorkerFrameClock(message => host.receive(message, vi.fn()))
  const old = vi.fn(),
    current = vi.fn()
  const token = worker.request(old)
  worker.cancel(token)
  expect(cancel).toHaveBeenCalledWith(17)
  const next = worker.request(current)
  worker.receive({ token, at: 100 })
  expect(old).not.toHaveBeenCalled()
  expect(current).not.toHaveBeenCalled()
  worker.receive({ token: next, at: 120 })
  expect(current).toHaveBeenCalledExactlyOnceWith(120)
})
