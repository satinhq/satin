// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import type { ProductionGlassRuntime } from './production.ts'
import { prepareSources } from './productionPrepare.ts'
import { SourcePixels } from './sourcePixels.ts'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** A source staging whose upload worker has failed (its GPU device was lost). */
async function failedStaging() {
  const worker = {
    postMessage: vi.fn(),
    terminate: vi.fn(),
    onmessage: null as Worker['onmessage'],
    onerror: null as Worker['onerror'],
    onmessageerror: null as Worker['onmessageerror'],
  }
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 1, height: 1, close() {} })),
  )
  const staging = new SourcePixels(() => worker)
  const job = staging.prepare({ width: 1, height: 1, close() {} } as unknown as ImageBitmap)
  await Promise.resolve()
  const rejected = expect(job).rejects.toThrow('device lost')
  const fail = () =>
    worker.onmessage!.call(
      worker as unknown as Worker,
      { data: { id: 0, error: 'device lost' } } as MessageEvent,
    )
  fail()
  await vi.advanceTimersByTimeAsync(250)
  fail()
  await vi.advanceTimersByTimeAsync(500)
  fail()
  await rejected
  expect(worker.terminate).toHaveBeenCalledTimes(3)
  return staging
}

it('the bounded retry of a failed preparation replaces a failed upload worker, and reports the failure', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const failed = await failedStaging()
  expect(failed.failed).toBe(true)
  /** The staging each attempt of the preparation finds. */
  const seen: SourcePixels[] = []
  const reported: unknown[] = []
  const runtime = {
    attached: true,
    revision: 0,
    damageGenerations: new Map(),
    preparingPlaneHosts: new Map(),
    navigationRevision: 0,
    navigationActive: false,
    lifecycleHidden: false,
    menuGeneration: 0,
    menuStage: 'prepare',
    serial: Promise.resolve(),
    preparing: undefined,
    prepareAgain: false,
    sourcePixels: failed,
    schedulePrepare() {},
    fail(stage: string, error: unknown) {
      reported.push([stage, String(error)])
    },
    replaceFailedSourcePixels() {
      if (this.sourcePixels.failed) this.sourcePixels = new SourcePixels(() => ({}) as never)
    },
    // Every attempt fails at its first read of the options, as a capture that cannot stage would.
    get options(): never {
      seen.push(this.sourcePixels)
      throw Error('WebGPU source staging failed')
    },
  }
  await expect(prepareSources(runtime as unknown as ProductionGlassRuntime)).rejects.toThrow(
    'WebGPU source staging failed',
  )
  expect(seen).toHaveLength(2)
  expect(seen[0]).toBe(failed)
  // The second attempt runs with a replacement: a lost upload device is not permanent.
  expect(seen[1]).not.toBe(failed)
  expect(seen[1].failed).toBe(false)
  // The original failure stays loud.
  expect(reported).toEqual([
    ['source preparation; rebuilding same WebGPU renderer', 'Error: WebGPU source staging failed'],
  ])
})
