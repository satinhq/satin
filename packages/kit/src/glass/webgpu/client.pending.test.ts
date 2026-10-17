// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { WebGPUClient } from './client.ts'

// A request the worker will never answer must not stay pending: a source preparation and the
// region bridge's queue both wait on worker replies, and they release their capture canvases when
// those settle. A worker error or an undecodable message rejects every pending request (loudly),
// and every later one.

type FakeWorker = {
  onmessage?: (event: { data: unknown }) => void
  onerror?: (event: { message: string }) => void
  onmessageerror?: () => void
  postMessage(message: { id: number; request: { type: string } }): void
  terminate(): void
}
let worker: FakeWorker

async function startClient() {
  vi.stubGlobal(
    'Worker',
    class {
      onmessage?: FakeWorker['onmessage']
      constructor() {
        worker = this as unknown as FakeWorker
      }
      postMessage(message: { id: number; request: { type: string } }) {
        // Only the start-up request is answered; everything else stays unanswered.
        if (message.request.type === 'init')
          queueMicrotask(() => this.onmessage?.({ data: { id: message.id, value: {} } }))
      }
      terminate() {}
    },
  )
  const client = new WebGPUClient()
  const canvas = { transferControlToOffscreen: () => ({}) } as unknown as HTMLCanvasElement
  await client.init(canvas, 3, true, false)
  return client
}

afterEach(() => vi.unstubAllGlobals())

it('a worker error rejects every pending request and every later one', async () => {
  const client = await startClient()
  const images = client.request({ type: 'report' })
  const scene = client.request({ type: 'report' })
  worker.onerror!({ message: 'Glass worker crashed' })
  await expect(images).rejects.toThrow('Glass worker crashed')
  await expect(scene).rejects.toThrow('Glass worker crashed')
  await expect(client.request({ type: 'report' })).rejects.toThrow('Glass worker crashed')
})

it('a message the page cannot decode rejects every pending request', async () => {
  const client = await startClient()
  const pending = client.request({ type: 'report' })
  worker.onmessageerror!()
  await expect(pending).rejects.toThrow('could not be deserialized')
})
