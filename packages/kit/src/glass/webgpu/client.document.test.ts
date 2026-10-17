// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Envelope } from '../worker/protocol.ts'
import { WebGPUClient } from './client.ts'
const boundary = vi.hoisted(() => ({ requests: [] as Envelope[], fail: false, stop: vi.fn() }))
vi.mock('./renderer.ts', () => ({
  createWebGPURenderer: (emit: (value: unknown) => void) => ({
    receive: ({ data }: MessageEvent<Envelope>) => {
      boundary.requests.push(data)
      emit({ id: data.id, ...(boundary.fail ? { error: 'device unavailable' } : { value: {} }) })
    },
    stop: boundary.stop,
  }),
}))
vi.mock('../errorAlert.ts', () => ({ installGlassErrorAlert() {} }))
vi.mock('../errors.ts', () => ({ reportGlassError: vi.fn() }))
beforeEach(() => {
  boundary.requests = []
  boundary.fail = false
  boundary.stop.mockClear()
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    queueMicrotask(() => callback(performance.now()))
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.stubGlobal(
    'Worker',
    vi.fn(() => {
      throw Error('Unexpected worker creation')
    }),
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
it('keeps document canvas endpoints local and delegates the shared frame driver to that owner', async () => {
  const canvas = document.createElement('canvas'),
    other = document.createElement('canvas')
  const transfer = vi.fn(() => {
    throw Error('Unexpected canvas transfer')
  })
  Object.defineProperty(canvas, 'transferControlToOffscreen', { value: transfer })
  Object.defineProperty(other, 'transferControlToOffscreen', { value: transfer })
  const client = new WebGPUClient()
  await client.init(canvas, 2, true, true, () => 'light', 'document')
  await client.attachLayer(other, { id: 'test', depth: 1, attachment: { kind: 'fixed' } })
  expect(client.documentOwned).toBe(true)
  expect(boundary.requests.find(({ request }) => request.type === 'init')?.request).toMatchObject({
    canvas,
  })
  expect(
    boundary.requests.find(({ request }) => request.type === 'attach-layer')?.request,
  ).toMatchObject({ canvas: other })
  expect(transfer).not.toHaveBeenCalled()
  expect(Worker).not.toHaveBeenCalled()
})
it('fails initialization without switching to another execution owner', async () => {
  boundary.fail = true
  const client = new WebGPUClient()
  await expect(
    client.init(document.createElement('canvas'), 2, true, true, () => 'light', 'document'),
  ).rejects.toThrow('device unavailable')
  expect(boundary.stop).toHaveBeenCalledOnce()
  expect(Worker).not.toHaveBeenCalled()
  await expect(client.request({ type: 'report' })).rejects.toThrow('device unavailable')
})

it('reports transport admission only after postMessage succeeds, independently of acknowledgement', async () => {
  const client = new WebGPUClient(),
    admitted = vi.fn()
  const transport = { postMessage: vi.fn(() => {}) }
  ;(client as unknown as { transport: typeof transport }).transport = transport
  void client.request({ type: 'report' }, [], admitted)
  expect(admitted).toHaveBeenCalledOnce()
  transport.postMessage.mockImplementation(() => {
    throw Error('clone failed')
  })
  await expect(client.request({ type: 'report' }, [], admitted)).rejects.toThrow('clone failed')
  expect(admitted).toHaveBeenCalledOnce()
})
