import { expect, it, vi } from 'vitest'
import { GLASS_RENDERER_PROTOCOL } from '../rendererContract.ts'
import { regionSpec, RegionScene } from './regionScene.ts'
import { Glass, type GlassRegion } from '../regions.ts'
import type { LayerDevice } from './layers.ts'
import type { SurfaceRenderSpec } from '../renderSpecs.ts'

// The bottom accessory's held run, hidden halfway: the renderer's first resumed frame must pose
// it where the run is now (its end, after time passed while hidden), never at the last pose a
// frame sampled before the hide.
it('poses a retained accessory track at the live clock before the first resumed frame', async () => {
  const owner = { liveDevice: undefined, subscribe: () => () => {} } as unknown as LayerDevice
  const scene = new RegionScene(owner, () => {})
  await scene.request({
    type: 'initialize',
    protocol: GLASS_RENDERER_PROTOCOL,
    appearance: 'dark',
    reducedMotion: false,
  })
  const epoch = performance.timeOrigin + performance.now()
  const track = {
    epoch,
    duration: 100,
    widths: [100, 60],
    offsets: [
      { x: 0, y: 0 },
      { x: 40, y: 20 },
    ],
  }
  const accessory: GlassRegion = {
    id: 'player',
    layer: { id: 'fixed', depth: 0, attachment: { kind: 'fixed' } },
    frame: { x: 30, y: 700, width: 100, height: 48 },
    shape: { kind: 'roundedRectangle', cornerRadius: 24 },
    material: Glass.regular.material,
    accessoryViewportTrack: track,
    accessoryTrack: { ...track, envelope: 100, slices: [], held: true },
  }
  const presenter = {
    id: 'accessory',
    role: 'material' as const,
    regionIds: [accessory.id],
    layerId: 'fixed',
    origin: { x: 10, y: 680 },
    width: 160,
    height: 100,
    resolution: 1,
  }
  const snapshot = { revision: 1, layers: [accessory.layer], regions: [accessory], scrolls: [] }
  let spec: SurfaceRenderSpec = regionSpec(accessory, presenter, snapshot)
  const raster = {
    get spec() {
      return spec
    },
    updateSpec: (next: SurfaceRenderSpec) => (spec = next),
    draw: () => {},
    setVisible: () => {},
    setLift: () => {},
    setViewport: () => {},
    setSourceOrigin: () => {},
  }
  Object.assign(scene, {
    scene: snapshot,
    presenters: new Map([[presenter.id, { descriptor: presenter, raster }]]),
    sources: new Map([[`foreground:${accessory.id}`, { descriptor: { width: 160, height: 100 } }]]),
  })
  const width = () => spec.shape.first.halfWidth * 2
  scene.sample(epoch + 50)
  expect(width()).toBeCloseTo(80)
  await scene.request({ type: 'visibility', visible: false })
  // Hidden for a while: the run ended long ago.
  const clock = vi.spyOn(performance, 'now').mockReturnValue(epoch - performance.timeOrigin + 5000)
  try {
    await scene.prepareResume()
    expect(width()).toBeCloseTo(60)
  } finally {
    clock.mockRestore()
  }
})
