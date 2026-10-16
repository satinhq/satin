import { afterEach, expect, it, vi } from 'vitest'
import { SourcePixels, takeSourcePixels } from './sourcePixels.ts'
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})
const image = () => ({ width: 2, height: 1, close: vi.fn() }) as unknown as ImageBitmap
function fixture() {
  const clone = image(),
    worker = {
      postMessage: vi.fn(),
      terminate: vi.fn(),
      onmessage: null as Worker['onmessage'],
      onerror: null as Worker['onerror'],
      onmessageerror: null as Worker['onmessageerror'],
    }
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => clone),
  )
  const source = new SourcePixels(() => worker)
  const reply = (data: unknown) =>
    worker.onmessage!.call(worker as unknown as Worker, { data } as MessageEvent)
  return { source, worker, clone, reply }
}
it('hands exact worker bytes to their bitmap once, without closing the retained source', async () => {
  const { source, worker, clone, reply } = fixture(),
    a = image(),
    b = image()
  const jobs = [source.prepare(a), source.prepare(b)]
  await Promise.resolve()
  expect(worker.postMessage).toHaveBeenCalledWith({ id: 1, bitmap: clone }, [clone])
  const first = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
    second = new Uint8Array([8, 7, 6, 5, 4, 3, 2, 1])
  reply({ id: 2, width: 2, height: 1, buffer: second.buffer })
  reply({ id: 1, width: 2, height: 1, buffer: first.buffer })
  await Promise.all(jobs)
  expect(takeSourcePixels(a)).toEqual(first)
  expect(takeSourcePixels(b)).toEqual(second)
  expect(takeSourcePixels(a)).toBeUndefined()
  expect(a.close).not.toHaveBeenCalled()
})
it.each([
  { width: 1, height: 1, buffer: new ArrayBuffer(8) },
  { width: 2, height: 1, buffer: new ArrayBuffer(7) },
  { width: 2, height: 1 },
])('rejects invalid staging bytes before publication %j', async data => {
  const { source, reply } = fixture(),
    a = image(),
    job = source.prepare(a)
  await Promise.resolve()
  const rejected = expect(job).rejects.toThrow('invalid pixel dimensions')
  reply({ id: 1, ...data })
  await rejected
  expect(takeSourcePixels(a)).toBeUndefined()
})
it('closes the untransferred clone if admission throws and leaves no timeout', async () => {
  vi.useFakeTimers()
  const { source, worker, clone } = fixture()
  worker.postMessage.mockImplementation(() => {
    throw Error('transport closed')
  })
  await expect(source.prepare(image())).rejects.toThrow('transport closed')
  expect(clone.close).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
})
it('exhausts a bounded restart burst for every pending preparation', async () => {
  vi.useFakeTimers()
  const { source, worker, reply } = fixture()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const a = source.prepare(image()),
    b = source.prepare(image())
  await Promise.resolve()
  const checks = [
    expect(a).rejects.toThrow('device lost'),
    expect(b).rejects.toThrow('device lost'),
  ]
  reply({ id: 0, error: 'device lost' })
  await vi.advanceTimersByTimeAsync(250)
  reply({ id: 0, error: 'device lost' })
  await vi.advanceTimersByTimeAsync(500)
  reply({ id: 0, error: 'device lost' })
  await Promise.all(checks)
  expect(worker.terminate).toHaveBeenCalledTimes(3)
})
it('bounds a missing acknowledgement and rejects rather than falling back', async () => {
  vi.useFakeTimers()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const { source, worker } = fixture(),
    job = source.prepare(image())
  const rejected = expect(job).rejects.toThrow('exceeded 10 seconds')
  await vi.advanceTimersByTimeAsync(30750)
  await rejected
  expect(worker.terminate).toHaveBeenCalledTimes(3)
  expect(vi.getTimerCount()).toBe(0)
})
it('takes the worker bitmap from the capture canvas and never copies the retained snapshot', async () => {
  const { source, worker, clone, reply } = fixture()
  const snapshot = image()
  const canvas = { width: 2, height: 1 } as unknown as HTMLCanvasElement
  const job = source.prepare(snapshot, canvas)
  await Promise.resolve()
  expect(createImageBitmap).toHaveBeenCalledTimes(1)
  expect(createImageBitmap).toHaveBeenCalledWith(canvas)
  expect(worker.postMessage).toHaveBeenCalledWith({ id: 1, bitmap: clone }, [clone])
  const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
  reply({ id: 1, width: 2, height: 1, buffer: bytes.buffer })
  await job
  // The staged bytes belong to the snapshot the renderer keeps, which stays open.
  expect(takeSourcePixels(snapshot)).toEqual(bytes)
  expect(snapshot.close).not.toHaveBeenCalled()
})
