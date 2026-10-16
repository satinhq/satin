import { expect, it, vi } from 'vitest'
import { GLASS_RENDERER_PROTOCOL } from '../rendererContract.ts'
import { Glass, type GlassRegion } from '../regions.ts'
import type { SurfaceRenderSpec } from '../renderSpecs.ts'
import type { LayerDevice } from './layers.ts'
import { RegionScene } from './regionScene.ts'

// The press light of interactive glass (fields, buttons, Glass.interactive() surfaces) is the
// menu's touch light at the finger, not a flat white over the whole shape (owner, Oct 12:
// "it lights up the entire text box, so I can't even see the placeholder text").

const layer = { id: 'fixed', depth: 0, attachment: { kind: 'fixed' as const } }
const presenterOf = (regionIds: string[]) => ({
  descriptor: {
    id: 'slot',
    role: 'material',
    regionIds,
    layerId: 'fixed',
    origin: { x: 0, y: 180 },
    width: 320,
    height: 90,
    resolution: 1,
  },
  raster: { spec: {}, updateSpec: vi.fn(), draw: vi.fn() },
})

async function pressedScene(
  regions: GlassRegion[],
  contact: { x: number; y: number },
  foreground?: { width: number; height: number },
) {
  const scene = new RegionScene({} as LayerDevice)
  await scene.request({
    type: 'initialize',
    protocol: GLASS_RENDERER_PROTOCOL,
    appearance: 'dark',
    reducedMotion: false,
  })
  await scene.request({
    type: 'scene',
    snapshot: { revision: 1, layers: [layer], regions, scrolls: [] },
  })
  const presenter = presenterOf(regions.map(region => region.id))
  ;(scene as unknown as { presenters: Map<string, unknown> }).presenters.set('slot', presenter)
  if (foreground)
    (scene as unknown as { sources: Map<string, unknown> }).sources.set(
      `foreground:${regions[0]!.id}`,
      { descriptor: foreground },
    )
  const epoch = performance.timeOrigin + performance.now()
  await scene.request({
    type: 'interaction',
    interaction: { regionId: regions[0]!.id, phase: 'pressed', epoch, contact },
  })
  // Present the held press 120 ms in, when the light has risen.
  const internal = scene as unknown as {
    motions: Map<string, object>
    presentMotion(id: string, state: object, at: number): void
  }
  presenter.raster.updateSpec.mockClear()
  internal.presentMotion(regions[0]!.id, internal.motions.get(regions[0]!.id)!, epoch + 120)
  return presenter.raster.updateSpec.mock.calls.at(-1)![0] as SurfaceRenderSpec
}

it('a pressed interactive surface lights at the finger, not across the whole shape', async () => {
  const field: GlassRegion = {
    id: 'field',
    layer,
    frame: { x: 20, y: 200, width: 280, height: 44 },
    shape: 'capsule',
    material: Glass.regular.interactive().material,
  }
  const held = await pressedScene([field], { x: 40, y: 22 })
  // Frame-local CSS px: the finger 40 pt from the field's leading edge.
  expect(held.touchLight).toMatchObject({ x: 40, y: 22 })
  expect(held.touchLight!.intensity).toBeGreaterThan(0)
  // Native's held floor across the shape is a ~0.033 white mix; the light is local.
  expect(held.tint![3]).toBeLessThan(0.04)
})

it("a pressed field member's light stays inside that member", async () => {
  const members: GlassRegion[] = [
    { id: 'field', frame: { x: 76, y: 200, width: 224, height: 44 } },
    { id: 'plus', frame: { x: 20, y: 200, width: 48, height: 44 } },
  ].map(member => ({
    ...member,
    layer,
    shape: 'capsule' as const,
    container: { id: 'composer', spacing: 8 },
    material: Glass.regular.interactive().material,
  }))
  const held = await pressedScene(members, { x: 12, y: 22 })
  // No light on the shared material (it would spill onto the plus button 8 pt away).
  expect(held.touchLight).toBeUndefined()
  expect(held.memberHighlight).toMatchObject({ member: 0 })
  const light = held.memberHighlight!.light!
  expect(light.intensity).toBeGreaterThan(0)
  // At the finger: 12 pt into the field member (presenter x 76), at its vertical centre.
  expect(light.x + held.frameX).toBeCloseTo(88)
  expect(light.y + held.frameY).toBeCloseTo(42)
})

// The owner's smudge recording (Oct 13): a finger on the mini player while the tab bar
// collapses. The bottom accessory's run (a held-still canvas) and the press both draw the
// accessory. The press drew the run's whole envelope at the committed row without its ink (an
// empty capsule running past the Search circle) until the run's next frame drew over it.
it('a press during the accessory run draws on the run’s pose: its width, ink and travel', async () => {
  const epoch = performance.timeOrigin + performance.now()
  const track = {
    epoch,
    duration: 1000,
    widths: [400, 260],
    offsets: [
      { x: -70, y: -63 },
      { x: 0, y: 0 },
    ],
    envelope: 400,
    held: true,
    slices: [{ x: 10, y: 4, width: 40, height: 40, anchor: 0, clip: 0 }],
  }
  const accessory: GlassRegion = {
    id: 'player',
    layer,
    // The run's envelope width at the committed (compact) row, as the page reports it.
    frame: { x: 90, y: 200, width: 400, height: 48 },
    shape: 'capsule',
    material: Glass.regular.interactive().material,
    accessoryViewportTrack: track,
    accessoryTrack: track,
  }
  const held = await pressedScene([accessory], { x: 40, y: 24 }, { width: 420, height: 60 })
  // About 12% into the run: about 383 pt wide (grown 4 pt by the press), not the 400 pt envelope.
  expect(held.shape.first.halfWidth * 2).toBeGreaterThan(370)
  expect(held.shape.first.halfWidth * 2).toBeLessThan(395)
  expect(held.ink?.layers).toHaveLength(1)
  // Still about 62 pt left of the committed row, where the run presents it.
  expect(held.frameX).toBeLessThan(60)
})
