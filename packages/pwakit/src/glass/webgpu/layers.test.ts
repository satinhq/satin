import { afterEach, describe, it, expect, vi } from 'vitest'
import { LayerDevice } from './layers.ts'
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
