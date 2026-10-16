import { afterEach, expect, it, vi } from 'vitest'
import { PageFrameHost, WorkerFrameClock } from './frameClock.ts'
import type { Envelope } from '../worker/protocol.ts'

afterEach(() => vi.unstubAllGlobals())
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
