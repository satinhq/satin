import { afterEach, describe, it, expect, vi } from 'vitest'
import { LayerDevice } from './layers.ts'
import { glassFailureCode } from './errorCode.ts'
function fixture() {
  const devices: {
    destroy: ReturnType<typeof vi.fn>
    lost: Promise<{ reason: string }>
    addEventListener: ReturnType<typeof vi.fn>
  }[] = []
  const requestDevice = vi.fn(async () => {
    let lose!: (v: { reason: string }) => void
    const lost = new Promise<{ reason: string }>(resolve => {
      lose = resolve
    })
    const device = {
      pushErrorScope: vi.fn(),
      popErrorScope: vi.fn(async () => null),
      lost,
      destroy: vi.fn(() => lose({ reason: 'destroyed' })),
      addEventListener: vi.fn(),
    }
    devices.push(device)
    return device
  })
  vi.stubGlobal('navigator', { gpu: { requestAdapter: vi.fn(async () => ({ requestDevice })) } })
  vi.stubGlobal('GPUTextureUsage', { RENDER_ATTACHMENT: 16, COPY_SRC: 1 })
  const canvas = () => {
    const context = { configure: vi.fn(), unconfigure: vi.fn() }
    return {
      context,
      value: {
        width: 100,
        height: 200,
        getContext: vi.fn(() => context),
      } as unknown as OffscreenCanvas,
    }
  }
  return { devices, requestDevice, canvas }
}
afterEach(() => vi.unstubAllGlobals())
describe('page device and glass layers', () => {
  it('distinguishes unavailable device requirements from a real acquisition failure', async () => {
    const fixtureState = fixture()
    vi.stubGlobal('navigator', {
      gpu: {
        requestAdapter: async () => ({
          limits: { maxTextureDimension2D: 16384 },
          requestDevice: fixtureState.requestDevice,
        }),
      },
    })
    fixtureState.requestDevice.mockRejectedValueOnce(
      new DOMException(
        'Required maxTextureDimension2D exceeds the supported limit',
        'OperationError',
      ),
    )
    const acquire = () =>
      new LayerDevice().attach(
        { id: 'chrome', depth: 10, attachment: { kind: 'fixed' } },
        fixtureState.canvas().value,
      )
    const unavailable = await acquire().catch((error: unknown) => error)
    expect(glassFailureCode('worker startup', unavailable)).toBe('gpu-unavailable')
    vi.stubGlobal('navigator', {
      gpu: {
        requestAdapter: async () => ({
          features: new Set(['timestamp-query']),
          requestDevice: fixtureState.requestDevice,
        }),
      },
    })
    fixtureState.requestDevice.mockRejectedValueOnce(new TypeError('Feature not supported'))
    const missingFeature = await acquire().catch((error: unknown) => error)
    expect(glassFailureCode('worker startup', missingFeature)).toBe('gpu-unavailable')
    fixtureState.requestDevice.mockRejectedValueOnce(
      new DOMException('GPU allocation failed: memory limit reached', 'OperationError'),
    )
    const failure = await acquire().catch((error: unknown) => error)
    expect(glassFailureCode('device acquisition', failure)).toBe('device-request')
  })
  it('shares one device across concurrent canvas attachments and detaches without replacement', async () => {
    const f = fixture(),
      owner = new LayerDevice(),
      a = f.canvas(),
      b = f.canvas()
    await Promise.all([
      owner.attach({ id: 'chrome', depth: 10, attachment: { kind: 'fixed' } }, a.value),
      owner.attach(
        { id: 'card', depth: 0, attachment: { kind: 'scroll', scrollId: 'feed' } },
        b.value,
      ),
    ])
    expect(f.requestDevice).toHaveBeenCalledTimes(1)
    expect(a.context.configure.mock.calls[0][0].device).toBe(
      b.context.configure.mock.calls[0][0].device,
    )
    expect(owner.report()).toMatchObject({
      activeCanvases: 2,
      deviceRequests: 1,
      presentationBackingBytes: 160000,
    })
    owner.detach('card')
    expect(b.context.unconfigure).toHaveBeenCalledTimes(1)
    expect(owner.report().activeCanvases).toBe(1)
  })
  it('allows multiple canonical presenters in one layer, while rejecting duplicate presenter identity', async () => {
    const f = fixture(),
      owner = new LayerDevice(),
      layer = { id: 'shared', depth: 0, attachment: { kind: 'fixed' as const } }
    const presenter = {
      id: 'first',
      layerId: 'shared',
      regionIds: ['a'],
      origin: { x: 0, y: 0 },
      width: 100,
      height: 200,
      resolution: 1,
    }
    const first = owner.attach(layer, f.canvas().value, presenter)
    await expect(owner.attach(layer, f.canvas().value, presenter)).rejects.toThrow(
      'already attached',
    )
    await Promise.all([
      first,
      owner.attach(layer, f.canvas().value, { ...presenter, id: 'second', regionIds: ['b'] }),
    ])
    expect(owner.report()).toMatchObject({ deviceRequests: 1, activeCanvases: 2, layers: [layer] })
  })
  it('replaces only a lost device and reconfigures every retained canvas', async () => {
    const f = fixture(),
      owner = new LayerDevice(),
      a = f.canvas(),
      b = f.canvas(),
      listener = vi.fn()
    await owner.attach({ id: 'a', depth: 0, attachment: { kind: 'fixed' } }, a.value)
    await owner.attach({ id: 'b', depth: 1, attachment: { kind: 'fixed' } }, b.value)
    owner.subscribe(listener)
    owner.loseForTest()
    await vi.waitFor(() => expect(owner.report().restores).toBe(1))
    expect(f.requestDevice).toHaveBeenCalledTimes(2)
    expect(a.context.configure).toHaveBeenCalledTimes(2)
    expect(b.context.configure).toHaveBeenCalledTimes(2)
    expect(listener.mock.calls[0][0]).toBeUndefined()
    expect(listener.mock.calls[1][0]).toBe(f.devices[1])
  })
})

it('retries a repeated-loss burst after cooldown instead of disabling recovery for the session', async () => {
  vi.useFakeTimers()
  const f = fixture()
  const owner = new LayerDevice(vi.fn())
  await owner.ready()
  for (let i = 0; i < 4; i++) {
    owner.liveDevice!.destroy()
    await vi.advanceTimersByTimeAsync(0)
  }
  owner.setAdapterVisible(false)
  await vi.advanceTimersByTimeAsync(60_000)
  const requests = f.requestDevice.mock.calls.length
  expect(owner.liveDevice).toBeUndefined()
  owner.setAdapterVisible(true)
  await owner.retryAdapter()
  await vi.advanceTimersByTimeAsync(1000)
  expect(f.requestDevice.mock.calls.length).toBeGreaterThan(requests)
  expect(owner.liveDevice).toBeDefined()
  owner.stop()
  vi.useRealTimers()
})

it('does not reconstruct a device returned while re-backgrounded until foreground returns', async () => {
  const f = fixture()
  const owner = new LayerDevice(vi.fn())
  await owner.ready()
  let deliver!: (device: Awaited<ReturnType<typeof f.requestDevice>>) => void
  const pending = new Promise<Awaited<ReturnType<typeof f.requestDevice>>>(resolve => {
    deliver = resolve
  })
  f.requestDevice.mockReturnValueOnce(pending)
  const restored = vi.fn()
  owner.subscribe(restored)
  owner.liveDevice!.destroy()
  await vi.waitFor(() => expect(f.requestDevice).toHaveBeenCalledTimes(2))
  owner.setAdapterVisible(false)
  deliver(await f.requestDevice())
  await Promise.resolve()
  await Promise.resolve()
  expect(restored.mock.calls.filter(([device]) => device)).toHaveLength(0)
  owner.setAdapterVisible(true)
  await vi.waitFor(() => expect(owner.report().restores).toBe(1))
  owner.stop()
})
