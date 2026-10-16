// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { measureProductionSource } from './capture.ts'
import { ProductionGlassRuntime } from './production.ts'
import { measurePlane, type PlaneEntry } from './productionPlanes.ts'

vi.mock('./capture.ts', () => ({ measureProductionSource: vi.fn() }))
vi.mock('./backdropLayers.ts', () => ({
  backdropClip: () => [0, 0, 440, 956],
  effectiveBackground: () => [0, 0, 0, 1],
  cssColor: vi.fn(),
}))

afterEach(() => vi.clearAllMocks())

function damagedList(viewport: number, installed = false) {
  const scroller = document.createElement('div')
  const label = document.createTextNode('Changing label 1')
  scroller.append(label)
  Object.defineProperties(scroller, {
    clientHeight: { value: viewport },
    scrollHeight: { value: 10021 },
  })
  scroller.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 440, height: viewport }) as DOMRect
  const previous: PlaneEntry = {
    host: scroller,
    signature: 'previous',
    key: 'backdrop:list:1',
    revision: 1,
    origin: { x: 0, y: 0 },
    width: 440,
    height: 10021,
    resolution: 3,
    appearance: 'light',
    text: '',
  }
  const runtime = Object.create(ProductionGlassRuntime.prototype) as ProductionGlassRuntime
  Object.assign(runtime, {
    resident: { damage: vi.fn(), usable: () => undefined },
    planes: new Map(installed ? [['list', previous]] : []),
    preparingPlaneHosts: new Map([['list', scroller]]),
    damaged: new Set(),
    damageGenerations: new Map(),
    scrollSpeeds: new WeakMap(),
    growPlanes: new Set(),
    options: { appearance: 'light' },
    invalidatePinnedTops: vi.fn(),
  })
  runtime.damageSource(label)
  expect(runtime.damaged.has('list')).toBe(true)
  vi.mocked(measureProductionSource).mockResolvedValue({
    top: 0,
    left: 0,
    layout: { nodes: [], contentHeight: 10021, width: 440, measuredAt: 0, screen: 'root' },
  })
  return {
    scroller,
    measure: () =>
      measurePlane(
        scroller,
        { page: [0, 0, 0], resolution: 3, appearance: 'light' },
        () => 'list',
        false,
        (id, host) => runtime.windowHint(id, host),
      ),
  }
}

it('rejects an oversized null window after mutation damage before source measurement or GPU upload', async () => {
  const list = damagedList(10021)
  await expect(list.measure()).rejects.toThrow(/Glass plane list.*8192.*window=full/)
  expect(measureProductionSource).not.toHaveBeenCalled()
})

it.each([false, true])('bounds a mutated long list with installed=%s', async installed => {
  const list = damagedList(956, installed)
  list.scroller.setAttribute('data-satin-scroll-axis', 'vertical')
  const plane = await list.measure()
  expect(plane?.window).toBeDefined()
  expect(plane!.height * 3).toBeLessThanOrEqual(8192)
  expect(vi.mocked(measureProductionSource).mock.calls.at(-1)?.[3]).toEqual(plane?.window)
})

it('rejects content discovered beyond the declared extent before raster allocation', async () => {
  const scroller = document.createElement('div')
  scroller.getBoundingClientRect = () => ({ left: 0, top: 0, width: 440, height: 956 }) as DOMRect
  vi.mocked(measureProductionSource).mockResolvedValue({
    top: 0,
    left: 0,
    layout: { nodes: [], contentHeight: 10021, width: 440, measuredAt: 0, screen: 'root' },
  })
  await expect(
    measurePlane(scroller, { page: [0, 0, 0], resolution: 3, appearance: 'light' }, () => 'list'),
  ).rejects.toThrow(/Glass plane list.*8192.*window=full/)
  expect(measureProductionSource).toHaveBeenCalledOnce()
})
