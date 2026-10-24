import { contextMenuSeed } from '../menuTriggerGeometry.ts'
import { MenuTouchLight } from '../lens/menuTouchLight.ts'
import { GLASS_RENDERER_PROTOCOL } from '../rendererContract.ts'
import { expect, it, vi } from 'vitest'
import { Backdrop } from './backdrop.ts'
import { FrameGraph } from './frameGraph.ts'
import { uncoveredSourceRows } from './captureBands.ts'
import { WebGPURaster } from './raster.ts'
import {
  fieldRegionSpec,
  regionSpec,
  pressedRegionSpec,
  emergeRegionSpec,
  RegionScene,
} from './regionScene.ts'
import { Glass, type GlassRegion } from '../regions.ts'
import type { LayerDevice } from './layers.ts'
import type { SurfaceRenderSpec } from '../renderSpecs.ts'
import { presentationUniforms } from './presentationMaterial.ts'
import { createSurfaceClipPath } from '../renderSpecs.ts'
import { GLASS_MENU_MORPH } from '../lens/interactivePress.ts'
function installFixedPresenter(scene: RegionScene, raster: unknown, bitmap: ImageBitmap) {
  ;(scene as unknown as { presenters: Map<string, unknown> }).presenters.set('slot', {
    descriptor: {
      id: 'slot',
      role: 'material',
      regionIds: ['card'],
      layerId: 'fixed',
      origin: { x: 10, y: 230 },
      width: 140,
      height: 100,
      resolution: 3,
    },
    raster,
  })
  ;(scene as unknown as { emptyForeground: unknown }).emptyForeground = {
    key: 'region:empty',
    value: bitmap,
    release() {},
  }
}

const rootBackdrop = (revision: number) => ({
  id: 'root-backdrop',
  revision,
  layerId: 'chrome',
  role: 'transmitted-backdrop' as const,
  origin: { x: 0, y: 0 },
  width: 440,
  height: 956,
  resolution: 1,
})

async function initializedScene(...args: ConstructorParameters<typeof RegionScene>) {
  const scene = new RegionScene(...args)
  await scene.request({
    type: 'initialize',
    protocol: GLASS_RENDERER_PROTOCOL,
    appearance: 'light',
    reducedMotion: false,
  })
  return scene
}
const region: GlassRegion = {
  id: 'card',
  layer: { id: 'scroll', depth: 2, attachment: { kind: 'scroll', scrollId: 'list' } },
  frame: { x: 30, y: 250, width: 100, height: 60 },
  shape: { kind: 'roundedRectangle', cornerRadius: 12 },
  material: Glass.regular.material,
}
it('keeps an aperture playing when an older paused scene arrives after its release', async () => {
  const scene = await initializedScene({} as LayerDevice)
  const track = {
    epoch: 100,
    duration: 240,
    frames: [
      { x: 0, y: 0, width: 48, height: 48 },
      { x: 0, y: 0, width: 300, height: 48 },
    ],
  }
  const snapshot = {
    revision: 1,
    layers: [region.layer],
    scrolls: [],
    regions: [{ ...region, shapeTrack: { ...track, epoch: Number.MAX_VALUE } }],
  }
  await scene.request({ type: 'scene', snapshot })
  await scene.request({ type: 'region-shape-track', regionId: region.id, track })
  await scene.request({ type: 'scene', snapshot: { ...snapshot, revision: 2 } })
  expect(scene.diagnostics().scene.regions[0]!.shapeTrack).toEqual(track)
  await scene.request({ type: 'region-shape-track', regionId: region.id, track: undefined })
  await scene.request({ type: 'scene', snapshot: { ...snapshot, revision: 3 } })
  expect(scene.diagnostics().scene.regions[0]!.shapeTrack).toBeUndefined()
})

it('accepts presentation retargets only for the admitted content generation', async () => {
  const scene = await initializedScene({} as LayerDevice)
  const track = {
    epoch: 100,
    duration: 700,
    widths: [100, 100],
    offsets: [
      { x: 0, y: 0 },
      { x: 0, y: 200 },
    ],
  }
  await scene.request({
    type: 'scene',
    snapshot: {
      revision: 1,
      layers: [region.layer],
      scrolls: [],
      regions: [{ ...region, presentationContentEpoch: 7, presentationViewportTrack: track }],
    },
  })
  const next = { ...track, epoch: 500 }
  await scene.request({
    type: 'region-presentation-track',
    regionId: region.id,
    contentEpoch: 6,
    track: next,
  })
  expect(scene.diagnostics().scene.regions[0]!.presentationViewportTrack).toEqual(track)
  await scene.request({
    type: 'region-presentation-track',
    regionId: region.id,
    contentEpoch: 7,
    track: next,
  })
  expect(scene.diagnostics().scene.regions[0]!.presentationViewportTrack).toEqual(next)
})
it('draws the sheet bottom contour independently in the GPU material and DOM aperture', () => {
  const sheet: GlassRegion = {
    ...region,
    layer: { id: 'sheet-layer', depth: 2, attachment: { kind: 'fixed' } },
    frame: { x: 0, y: 0, width: 424, height: 400 },
    shape: { kind: 'roundedRectangle', cornerRadius: 38, bottomCornerRadius: 54 },
    material: Glass.sheet.material,
  }
  const spec = regionSpec(
    sheet,
    {
      id: 'sheet',
      role: 'material',
      layerId: sheet.layer.id,
      regionIds: [sheet.id],
      origin: { x: 0, y: 0 },
      width: 424,
      height: 400,
      resolution: 3,
    },
    { revision: 1, layers: [sheet.layer], regions: [sheet], scrolls: [] },
  )
  expect(spec.shape.first.bottomRadius).toBe(54)
  expect(presentationUniforms(spec, 'light').uBottomCorner).toEqual([54, 1, 0, 0])
  const path = createSurfaceClipPath(spec)
  expect(path).toContain('A 38 38')
  expect(path).toContain('A 54 54')
})
it('does not acknowledge material when a scene has no transmitted backdrop', async () => {
  const scene = await initializedScene({} as LayerDevice)
  await scene.request({
    type: 'attach-presenter',
    presenter: {
      id: 'card-slot',
      role: 'material',
      layerId: 'scroll',
      regionIds: ['card'],
      origin: { x: 0, y: 0 },
      width: 100,
      height: 60,
      resolution: 1,
    },
    canvas: {} as OffscreenCanvas,
  })
  const receipt = await scene.request({
    type: 'scene',
    snapshot: { revision: 1, layers: [region.layer], regions: [region], scrolls: [] },
  })
  expect(receipt).toEqual({ presented: [] })
})
it('projects sampling through scroll coordinates while drawing in the local presenter', () => {
  const scene = {
    revision: 1,
    layers: [region.layer],
    regions: [region],
    scrolls: [
      {
        id: 'list',
        offsetX: 0,
        offsetY: 100,
        viewportX: 10,
        viewportY: 60,
        width: 440,
        height: 800,
      },
    ],
  }
  const spec = regionSpec(
    region,
    {
      id: 'card-slot',
      layerId: 'scroll',
      regionIds: ['card'],
      origin: { x: 40, y: 210 },
      width: 100,
      height: 60,
      resolution: 3,
    },
    scene,
  )
  expect([spec.frameX, spec.frameY, spec.sampleWidth, spec.sampleHeight]).toEqual([0, 0, 140, 100])
  expect(spec.radius).toBe(12)
  expect(region.frame.y).toBe(250)
})
it('rejects unknown layers and accepts container geometry before allocating GPU state', async () => {
  const scene = await initializedScene({} as LayerDevice)
  await expect(
    scene.request({
      type: 'scene',
      snapshot: { revision: 1, layers: [], scrolls: [], regions: [region] },
    }),
  ).rejects.toThrow('Undeclared')
  await expect(
    scene.request({
      type: 'scene',
      snapshot: {
        revision: 1,
        layers: [region.layer],
        scrolls: [],
        regions: [{ ...region, container: { id: 'union', spacing: 20 } }],
      },
    }),
  ).resolves.toEqual({ presented: [] })
  await expect(
    scene.request({
      type: 'interaction',
      interaction: { regionId: 'card', phase: 'pressed', epoch: 0 },
    }),
  ).resolves.toBeUndefined()
})

it('owns interactive epochs, stops a settled hold, and cancels without resurrecting removed regions', async () => {
  const scene = await initializedScene({} as LayerDevice)
  const value = { ...region, material: Glass.regular.interactive().material }
  await scene.request({
    type: 'scene',
    snapshot: { revision: 1, layers: [region.layer], scrolls: [], regions: [value] },
  })
  await scene.request({
    type: 'interaction',
    interaction: { regionId: 'card', phase: 'pressed', epoch: 1000 },
  })
  expect(scene.active).toBe(true)
  for (let at = 1000; at < 2500; at += 1000 / 120) scene.sample(at)
  expect(scene.active).toBe(false)
  await scene.request({
    type: 'interaction',
    interaction: { regionId: 'card', phase: 'releasing', epoch: 2600 },
  })
  expect(scene.active).toBe(true)
  await scene.request({
    type: 'interaction',
    interaction: { regionId: 'card', phase: 'rest', epoch: 2601 },
  })
  expect(scene.active).toBe(false)
  await scene.request({
    type: 'interaction',
    interaction: { regionId: 'card', phase: 'pressed', epoch: 1000 },
  })
  expect(scene.active).toBe(false)
  await scene.request({
    type: 'scene',
    snapshot: { revision: 2, layers: [], scrolls: [], regions: [] },
  })
  await scene.request({
    type: 'interaction',
    interaction: { regionId: 'card', phase: 'pressed', epoch: 3000 },
  })
  expect(scene.active).toBe(false)
})

it('retains the native button material and uses the measured 160 to 164 held aperture', () => {
  const button = {
    ...region,
    layer: { id: 'fixed', depth: 0, attachment: { kind: 'fixed' as const } },
    frame: { x: 140, y: 309, width: 160, height: 160 },
    shape: 'circle' as const,
    material: Glass.regular.interactive().material,
  }
  const spec = regionSpec(
    button,
    {
      id: 'button',
      layerId: region.layer.id,
      regionIds: ['button'],
      origin: { x: 120, y: 289 },
      width: 200,
      height: 200,
      resolution: 3,
    },
    { revision: 1, layers: [region.layer], regions: [button], scrolls: [] },
  )
  expect(pressedRegionSpec(spec, 0)).toBe(spec)
  const held = pressedRegionSpec(spec, 1)
  expect(held.shape.first.halfWidth * 2).toBe(164)
  expect(held.shape.first.halfHeight * 2).toBe(164)
  expect(held.shape.first.centerX).toBe(spec.shape.first.centerX)
  expect(held.variant).toBe('regular')
  expect(held.sampleWidth).toBe(spec.sampleWidth)
  expect(spec.shape.first.halfWidth * 2).toBe(160)
})
it('keeps named presentation optics while accepting the new clear and tinted regions', async () => {
  const scene = await initializedScene({} as LayerDevice)
  const scrolls = [
    { id: 'list', offsetX: 0, offsetY: 0, viewportX: 0, viewportY: 0, width: 440, height: 800 },
  ]
  for (const [revision, glass] of [
    Glass.sheet,
    Glass.expandedSheet,
    Glass.alert,
    Glass.confirmation,
  ].entries()) {
    const presentation = {
      ...region,
      material: glass.material,
      shape: {
        kind: 'roundedRectangle' as const,
        cornerRadius: 36,
        cornerStyle: 'continuous' as const,
      },
    }
    await expect(
      scene.request({
        type: 'scene',
        snapshot: {
          revision: revision + 1,
          layers: [region.layer],
          scrolls: [],
          regions: [presentation],
        },
      }),
    ).resolves.toEqual({ presented: [] })
    expect(
      regionSpec(
        presentation,
        {
          id: 'slot',
          layerId: 'scroll',
          regionIds: ['card'],
          origin: { x: 0, y: 0 },
          width: 100,
          height: 60,
          resolution: 3,
        },
        {
          revision: revision + 1,
          layers: [region.layer],
          scrolls: [
            {
              id: 'list',
              offsetX: 0,
              offsetY: 0,
              viewportX: 0,
              viewportY: 0,
              width: 440,
              height: 800,
            },
          ],
          regions: [presentation],
        },
      ).treatment,
    ).toBe(glass.material.treatment)
  }
  await expect(
    scene.request({
      type: 'scene',
      snapshot: {
        revision: 5,
        layers: [region.layer],
        scrolls: [],
        regions: [
          {
            ...region,
            shape: { kind: 'roundedRectangle', cornerRadius: 36, cornerStyle: 'continuous' },
          },
        ],
      },
    }),
  ).rejects.toThrow('continuous')
  const clear = { ...region, material: Glass.clear.material }
  await expect(
    scene.request({
      type: 'scene',
      snapshot: { revision: 5, layers: [region.layer], scrolls: [], regions: [clear] },
    }),
  ).resolves.toEqual({ presented: [] })
  expect(
    regionSpec(
      clear,
      {
        id: 'slot',
        layerId: 'scroll',
        regionIds: ['card'],
        origin: { x: 0, y: 0 },
        width: 100,
        height: 60,
        resolution: 3,
      },
      { revision: 5, layers: [region.layer], scrolls, regions: [clear] },
    ).variant,
  ).toBe('clear')
  const tinted = { ...region, material: Glass.regular.tint([0.2, 0.3, 0.4, 0.5]).material }
  await expect(
    scene.request({
      type: 'scene',
      snapshot: { revision: 6, layers: [region.layer], scrolls: [], regions: [tinted] },
    }),
  ).resolves.toEqual({ presented: [] })
  expect(
    regionSpec(
      tinted,
      {
        id: 'slot',
        layerId: 'scroll',
        regionIds: ['card'],
        origin: { x: 0, y: 0 },
        width: 100,
        height: 60,
        resolution: 3,
      },
      { revision: 6, layers: [region.layer], scrolls, regions: [tinted] },
    ).tint,
  ).toEqual([0.2, 0.3, 0.4, 0.5])
  await expect(
    scene.request({
      type: 'scene',
      snapshot: {
        revision: 7,
        layers: [region.layer],
        scrolls: [],
        regions: [{ ...region, material: Glass.sheet.interactive().material }],
      },
    }),
  ).rejects.toThrow('named presentation')
})

it('borrows the shared root capture through the frame graph and drops superseded revisions quietly', async () => {
  const owner = { liveDevice: undefined, subscribe: () => () => {} } as unknown as LayerDevice
  const graph = FrameGraph.for(owner),
    scene = await initializedScene(owner)
  const bitmap = (width: number) => ({ width, height: 4, close: vi.fn() }) as unknown as ImageBitmap
  const descriptor = (revision: number) => ({
    id: 'root-backdrop',
    revision,
    layerId: 'chrome',
    role: 'transmitted-backdrop' as const,
    origin: { x: 0, y: 0 },
    width: 8,
    height: 4,
    resolution: 1,
  })
  const first = bitmap(8),
    chrome = graph.image('production:2:front', first)
  await scene.shareSource(descriptor(2), first, 'production:2:front')
  expect(scene.sharedRevision).toBe(2)
  const stale = bitmap(8)
  await expect(
    scene.shareSource(descriptor(1), stale, 'production:1:front'),
  ).resolves.toBeUndefined()
  expect(scene.sharedRevision).toBe(2)
  expect(graph.report().images).toBe(1)
  // The chrome's lease ends first; the region lease keeps the shared capture alive.
  chrome.release()
  expect(first.close).not.toHaveBeenCalled()
  await scene.request({ type: 'release-source', id: 'root-backdrop' })
  expect(first.close).toHaveBeenCalledTimes(1)
  expect(graph.report().retainedBitmapBytes).toBe(0)
  expect(scene.sharedRevision).toBeUndefined()
})

it('hiding a deferred resized scene does not apply its new envelope to the old presenter', async () => {
  const scene = await initializedScene({} as LayerDevice),
    value = { ...region, material: Glass.regular.interactive().material }
  await scene.request({
    type: 'scene',
    snapshot: { revision: 1, layers: [region.layer], scrolls: [], regions: [value] },
  })
  await scene.request({
    type: 'interaction',
    interaction: { regionId: 'card', phase: 'pressed', epoch: 1000 },
  })
  const updateSpec = vi.fn(() => {
      throw Error('old presenter has the old envelope')
    }),
    setVisible = vi.fn()
  const presenter = {
    descriptor: {
      id: 'slot',
      role: 'material',
      regionIds: ['card'],
      layerId: 'scroll',
      origin: { x: 10, y: 230 },
      width: 140,
      height: 100,
      resolution: 3,
    },
    raster: { spec: { sampleWidth: 140, sampleHeight: 100 }, updateSpec, setVisible },
  }
  ;(scene as unknown as { presenters: Map<string, unknown> }).presenters.set('slot', presenter)
  await scene.request({
    type: 'transaction',
    requests: [
      {
        type: 'scene',
        snapshot: {
          revision: 2,
          layers: [region.layer],
          scrolls: [],
          regions: [{ ...value, frame: { ...value.frame, width: 200 } }],
        },
      },
      { type: 'visibility', visible: false },
    ],
  })
  expect(updateSpec).not.toHaveBeenCalled()
  expect(setVisible).toHaveBeenCalledWith(false)
  expect(scene.active).toBe(false)
})

it('moves a fixed region backdrop in the next frame instead of reinstalling and fencing per scroll', async () => {
  const owner = { liveDevice: undefined, subscribe: () => () => {} } as unknown as LayerDevice
  const scene = await initializedScene(owner),
    fixed = { ...region, layer: { id: 'fixed', depth: 0, attachment: { kind: 'fixed' as const } } }
  const bitmap = { width: 440, height: 956, close: vi.fn() } as unknown as ImageBitmap
  FrameGraph.for(owner).image('production:1:front', bitmap)
  const calls: string[] = [],
    raster = {
      spec: { sampleWidth: 140, sampleHeight: 100 },
      setCovered: () => {},
      clear: () => {},
      draw: () => calls.push('draw'),
      installRetained: () => calls.push('install'),
      settled: async () => {
        calls.push('fence')
      },
      setSourceOrigin: (o: { y: number }) => calls.push('origin:' + o.y),
      setViewportOrigin: () => {},
      backdropStale: () => false,
    }
  installFixedPresenter(scene, raster, bitmap)
  await scene.shareSource(
    {
      id: 'root-backdrop',
      revision: 1,
      layerId: 'chrome',
      role: 'transmitted-backdrop',
      origin: { x: 0, y: 0 },
      width: 440,
      height: 956,
      resolution: 1,
    },
    bitmap,
    'production:1:front',
  )
  const snapshot = (offsetY: number, revision: number) => ({
    revision,
    layers: [fixed.layer],
    regions: [fixed],
    scrolls: [
      {
        id: 'webgpu-source-root',
        offsetX: 0,
        offsetY,
        viewportX: 0,
        viewportY: 0,
        width: 440,
        height: 956,
      },
    ],
  })
  await scene.request({ type: 'scene', snapshot: snapshot(0, 1) })
  calls.length = 0
  await scene.request({ type: 'scene', snapshot: snapshot(40, 2) })
  await scene.request({ type: 'scene', snapshot: snapshot(80, 3) })
  expect(calls).toEqual(['origin:270', 'origin:310'])
  expect(scene.active).toBe(true)
  scene.sample(0)
  expect(calls).toEqual(['origin:270', 'origin:310', 'draw'])
  expect(scene.active).toBe(false)
})

it("draws a submenu platter in the menu's material over the menu's dim", () => {
  const presenter = {
    id: 'menu',
    layerId: 'menu-layer',
    regionIds: ['platter'],
    origin: { x: 0, y: 0 },
    width: 250,
    height: 300,
    resolution: 3,
  }
  const scene = { revision: 1, layers: [], scrolls: [], regions: [] }
  const fixed: GlassRegion = {
    ...region,
    layer: { id: 'menu-layer', depth: 1000, attachment: { kind: 'fixed' } },
  }
  const platter = regionSpec({ ...fixed, inMenuPanel: true }, presenter, scene)
  // Native (iOS 27.0 Simulator, context menu > React over a Chats thread): the child platter is
  // the menu's frosted material and sees the dimmed page; the bar recipe let a sent bubble behind
  // the dim shine through it undimmed and nearly unblurred.
  expect(platter.backdropMenuOverlay).toBe(true)
  expect(platter.materialProfile).toBe('menu')
  // Glass outside a menu keeps the bar recipe and does not sample a menu's dim.
  const outside = regionSpec(fixed, presenter, scene)
  expect(outside.backdropMenuOverlay).toBe(false)
  expect(outside.materialProfile).toBe('chrome')
})

it('draws the root menu in the same frosted material as its submenus, through its whole morph', () => {
  const presenter = {
    id: 'menu',
    layerId: 'fixed',
    regionIds: ['panel'],
    origin: { x: 20, y: 220 },
    width: 380,
    height: 240,
    resolution: 3,
  }
  const scene = { revision: 1, layers: [], scrolls: [], regions: [] }
  const panel: GlassRegion = {
    ...region,
    layer: { id: 'fixed', depth: 0, attachment: { kind: 'fixed' } },
    frame: { x: 200, y: 300, width: 180, height: 140 },
    shape: { kind: 'roundedRectangle', cornerRadius: 24 },
    emerge: { from: { x: 40, y: 240, width: 44, height: 44, radius: 22 } },
  }
  const field = (direction: 'open' | 'close', ms: number) => ({
    direction,
    ms,
    pressHighlight: 0,
    settled: false,
  })
  const morph = (emerging: GlassRegion, direction: 'open' | 'close', ms: number) =>
    emergeRegionSpec(
      regionSpec(emerging, presenter, scene),
      emerging,
      presenter,
      0.5,
      { rounding: 0 },
      undefined,
      field(direction, ms),
    )
  // Native (iOS 27.0, context menu over a Chats thread): the root menu is as frosted as its React
  // submenu; with the bar recipe the page's text read through the root above the frosted child.
  expect(regionSpec(panel, presenter, scene).materialProfile).toBe('menu')
  // A glass button's morph starts on the button's own bar glass and becomes the menu material on
  // native's measured curve; the close returns to the bar glass the button rests in.
  expect(morph(panel, 'open', 0).recipeMix).toBe(0)
  expect(morph(panel, 'open', 75).recipeMix).toBeCloseTo(0.52)
  expect(morph(panel, 'open', 174).recipeMix).toBe(1)
  expect(morph(panel, 'close', 0).recipeMix).toBe(1)
  expect(morph(panel, 'close', 162).recipeMix).toBe(0)
  // A context menu has no glass to start from: it is frosted from its first visible frame.
  const context = { ...panel, emerge: { ...panel.emerge!, sourceKind: 'context' as const } }
  expect(morph(context, 'open', 0).recipeMix).toBe(1)
  expect(morph(context, 'close', 200).recipeMix).toBe(1)
})

it('keeps context isolation separate from refracting glass', async () => {
  for (const glass of [Glass.contextBackdrop, Glass.contextPreview, Glass.contextMenu]) {
    const scene = await initializedScene({} as LayerDevice)
    const value = { ...region, material: glass.material }
    const snapshot = {
      revision: 1,
      layers: [region.layer],
      scrolls: [
        { id: 'list', offsetX: 0, offsetY: 0, viewportX: 0, viewportY: 0, width: 440, height: 800 },
      ],
      regions: [value],
    }
    await expect(scene.request({ type: 'scene', snapshot })).resolves.toEqual({ presented: [] })
    const spec = regionSpec(
      value,
      {
        id: 'slot',
        layerId: 'scroll',
        regionIds: ['card'],
        origin: { x: 0, y: 0 },
        width: 100,
        height: 60,
        resolution: 3,
      },
      snapshot,
    )
    expect(spec.materialProfile).toBe(glass === Glass.contextMenu ? 'menu' : 'chrome')
    expect(spec.treatment).toBe(glass.material.treatment)
    await expect(
      scene.request({
        type: 'scene',
        snapshot: {
          ...snapshot,
          revision: 2,
          regions: [{ ...value, material: glass.interactive().material }],
        },
      }),
    ).rejects.toThrow('named presentation')
  }
})

it('an emerging region samples over trigger and panel and moves its outline between them', () => {
  const panel = {
    ...region,
    layer: { id: 'fixed', depth: 0, attachment: { kind: 'fixed' as const } },
    frame: { x: 200, y: 300, width: 180, height: 140 },
    shape: { kind: 'roundedRectangle' as const, cornerRadius: 24 },
    emerge: { from: { x: 40, y: 240, width: 80, height: 40, radius: 20 } },
  }
  const presenter = {
    id: 'menu',
    layerId: 'fixed',
    regionIds: [panel.id],
    origin: { x: 20, y: 220 },
    width: 380,
    height: 240,
    resolution: 3,
  }
  const base = regionSpec(panel, presenter, {
    revision: 1,
    layers: [panel.layer],
    regions: [panel],
    scrolls: [],
  })
  const start = emergeRegionSpec(base, panel, presenter, 0),
    end = emergeRegionSpec(base, panel, presenter, 1)
  expect(start.frameWidth).toBe(340)
  expect(start.frameHeight).toBe(200)
  expect(start.shape.first.halfWidth * 2).toBe(80)
  expect(start.shape.first.radius).toBe(20)
  expect(start.frameX + start.shape.first.centerX + presenter.origin.x).toBe(80)
  expect(end.shape.first.halfWidth * 2).toBe(180)
  expect(end.shape.first.radius).toBe(24)
  expect(end.frameY + end.shape.first.centerY + presenter.origin.y).toBe(370)
})

it('reports a close morph as settled once, at its end (review P4: the panel is torn down on this)', async () => {
  const events: string[] = []
  const scene = await initializedScene({} as LayerDevice, event =>
    events.push(
      event.type +
        ':' +
        ('regionId' in event ? event.regionId : undefined) +
        ':' +
        ('generation' in event ? event.generation : undefined),
    ),
  )
  const panel = {
    ...region,
    layer: { id: 'fixed', depth: 0, attachment: { kind: 'fixed' as const } },
    shape: { kind: 'roundedRectangle' as const, cornerRadius: 24 },
    emerge: { from: { x: 40, y: 240, width: 80, height: 40, radius: 20 } },
  }
  await scene.request({
    type: 'scene',
    snapshot: { revision: 1, layers: [panel.layer], scrolls: [], regions: [panel] },
  })
  await scene.request({
    type: 'scene',
    snapshot: {
      revision: 2,
      layers: [panel.layer],
      scrolls: [],
      regions: [{ ...panel, emerge: { ...panel.emerge, closing: true, generation: 2 } }],
    },
  })
  expect(scene.active).toBe(true)
  const start = performance.timeOrigin + performance.now()
  // Predicting a viewport pose must not tell the page to tear down its sheet early.
  scene.sample(start, start + 2000)
  expect(events).toEqual([])
  for (let at = start; at < start + 2000; at += 1000 / 60) scene.sample(at)
  expect(events).toEqual(['emerge-settled:card:2'])
})

it.each([false, true])(
  'a navigation composes its atlas without install draws, including retained emerge=%s',
  async emerge => {
    const owner = { liveDevice: undefined, subscribe: () => () => {} } as unknown as LayerDevice
    const scene = await initializedScene(owner),
      fixed = {
        ...region,
        ...(emerge ? { emerge: { from: { ...region.frame, radius: 12 } } } : {}),
        material: Glass.regular.interactive().material,
        layer: { id: 'fixed', depth: 0, attachment: { kind: 'fixed' as const } },
      }
    const bitmap = { width: 440, height: 956, close: vi.fn() } as unknown as ImageBitmap
    FrameGraph.for(owner).image('production:1:front', bitmap)
    const setups: Record<string, unknown>[] = [],
      poses: unknown[] = [],
      draws: number[] = []
    const raster = {
      spec: { sampleWidth: 140, sampleHeight: 100 },
      setCovered: () => {},
      clear: () => {},
      draw: () => draws.push(1),
      installRetained: (
        setup: Record<string, unknown>,
        _source: unknown,
        _glyphs: unknown,
        present = true,
      ) => {
        setups.push(setup)
        if (present) draws.push(1)
      },
      updateSpec: () => {},
      settled: async () => {},
      setSourceOrigin: () => {},
      setViewportOrigin: () => {},
      backdropStale: () => false,
      setVisible: () => {},
      setNavigation: (pose: unknown) => poses.push(pose),
    }
    installFixedPresenter(scene, raster, bitmap)
    await scene.shareSource(rootBackdrop(1), bitmap, 'production:1:front')
    await scene.request({
      type: 'scene',
      snapshot: { revision: 1, layers: [fixed.layer], regions: [fixed], scrolls: [] },
    })
    expect(setups.at(-1)).toMatchObject({ navigationAtlas: 1, sourceKey: 'production:1' })
    expect(setups.at(-1)!.contentLayer).toBeUndefined()
    // The navigation starts: the presenter composes the atlas (viewport space) in place of the content plane.
    const atlas = { key: 'navigation:7:front', value: bitmap, release() {} } as never
    await scene.navigationSource({
      key: 'navigation:7',
      lease: atlas,
      routes: 2,
      contentLayer: 'plane-4',
      width: 440,
      height: 956,
    })
    expect(setups.at(-1)).toMatchObject({
      navigationAtlas: 2,
      contentLayer: 'plane-4',
      sourceKey: 'navigation:7',
      sourceWidth: 440,
      sourceOrigin: { x: 10, y: 230 },
    })
    const pose = {
      frontX: 120,
      rearX: -60,
      frontDim: 0,
      rearDim: 0.1,
      routes: [
        { x: -60, dim: 0.1 },
        { x: 120, dim: 0 },
      ],
    }
    draws.length = 0
    scene.setNavigation(pose)
    expect(poses).toEqual([pose])
    expect(draws.length).toBe(1)
    // An atlas handed over while a track runs presents at its pose from the first draw (never all routes at rest).
    const next = { ...pose, frontX: 60 }
    await scene.request({
      type: 'interaction',
      interaction: { regionId: 'card', phase: 'pressed', epoch: 1000 },
    })
    await scene.request({
      type: 'interaction',
      interaction: { regionId: 'card', phase: 'rest', epoch: 2000 },
    })
    draws.length = 0
    await scene.navigationSource({
      key: 'navigation:8',
      lease: atlas,
      routes: 2,
      contentLayer: 'plane-4',
      width: 440,
      height: 956,
      pose: next,
    })
    expect(poses.at(-1)).toBe(next)
    expect(draws).toHaveLength(0)
    scene.setNavigation(next)
    expect(draws).toHaveLength(1)
    // A direct pose must present immediately, since no running track will wake another frame.
    draws.length = 0
    await scene.navigationSource({
      key: 'navigation:9',
      lease: atlas,
      routes: 2,
      contentLayer: 'plane-4',
      width: 440,
      height: 956,
      pose,
      deferPresent: false,
    })
    expect(poses.at(-1)).toBe(pose)
    expect(draws).toHaveLength(1)
    // The settled capture after the navigation replaces the atlas; later poses no longer apply.
    FrameGraph.for(owner).image('production:0:front', bitmap)
    // A pop restores an older resident image. Its ordered transport must still end navigation.
    await scene.shareSource(rootBackdrop(0), bitmap, 'production:0:front', true)
    expect(scene.sharedRevision).toBe(0)
    expect(scene.navigationActive).toBe(false)
    expect(setups.at(-1)).toMatchObject({ navigationAtlas: 1, sourceKey: 'production:0' })
    expect(setups.at(-1)!.contentLayer).toBeUndefined()
    const count = poses.length
    scene.setNavigation(pose)
    expect(poses.length).toBe(count)
  },
)

it('prewarms an emerging menu without consuming its timeline until reveal', async () => {
  const scene = await initializedScene({} as LayerDevice)
  const panel = {
    ...region,
    layer: { id: 'fixed', depth: 0, attachment: { kind: 'fixed' as const } },
    emerge: {
      from: { x: 40, y: 240, width: 80, height: 40, radius: 20 },
      generation: 1,
      ready: false,
    },
  }
  await scene.request({
    type: 'scene',
    snapshot: { revision: 1, layers: [panel.layer], regions: [panel], scrolls: [] },
  })
  expect(scene.active).toBe(false)
  const start = performance.timeOrigin + performance.now()
  scene.sample(start + 5000)
  expect(scene.active).toBe(false)
  await scene.request({
    type: 'scene',
    snapshot: {
      revision: 2,
      layers: [panel.layer],
      regions: [{ ...panel, emerge: { ...panel.emerge, ready: true } }],
      scrolls: [],
    },
  })
  expect(scene.active).toBe(true)
})

it('submits a released prewarm before acknowledging an unchanged scene key', async () => {
  const owner = { liveDevice: undefined, subscribe: () => () => {} } as unknown as LayerDevice
  let allowed = true
  const scene = await initializedScene(
      owner,
      () => {},
      () => allowed,
    ),
    fixed = {
      ...region,
      emerge: { from: { ...region.frame, radius: 12 }, ready: false },
      material: Glass.regular.interactive().material,
      layer: { id: 'fixed', depth: 0, attachment: { kind: 'fixed' as const } },
    }
  const bitmap = { width: 440, height: 956, close: vi.fn() } as unknown as ImageBitmap
  FrameGraph.for(owner).image('production:1:front', bitmap)
  const setups: Record<string, unknown>[] = [],
    poses: unknown[] = [],
    draws: number[] = []
  const raster = {
    spec: { sampleWidth: 140, sampleHeight: 100 },
    setCovered: () => {},
    clear: () => {},
    draw: () => draws.push(1),
    installRetained: (
      setup: Record<string, unknown>,
      _source: unknown,
      _glyphs: unknown,
      present = true,
    ) => {
      setups.push(setup)
      if (present) draws.push(1)
    },
    updateSpec: () => {},
    settled: async () => {},
    setSourceOrigin: () => {},
    setViewportOrigin: () => {},
    backdropStale: () => false,
    setVisible: () => {},
    setNavigation: (pose: unknown) => poses.push(pose),
  }
  installFixedPresenter(scene, raster, bitmap)
  await scene.shareSource(rootBackdrop(1), bitmap, 'production:1:front')
  await scene.request({
    type: 'scene',
    snapshot: { revision: 1, layers: [fixed.layer], regions: [fixed], scrolls: [] },
  })
  draws.length = 0
  const receipt = await scene.request({
    type: 'scene',
    snapshot: {
      revision: 2,
      layers: [fixed.layer],
      regions: [{ ...fixed, emerge: { ...fixed.emerge, ready: true } }],
      scrolls: [],
    },
  })
  expect(draws.length).toBeGreaterThan(0)
  expect(receipt).toEqual({ presented: ['card'] })
  const drawsAtReceipt = draws.length
  await scene.request({
    type: 'scene',
    snapshot: {
      revision: 3,
      layers: [fixed.layer],
      regions: [{ ...fixed, emerge: { ...fixed.emerge, ready: true } }],
      scrolls: [],
    },
  })
  expect(draws.length).toBe(drawsAtReceipt)
  allowed = false
  await expect(
    scene.request({
      type: 'scene',
      snapshot: { revision: 4, layers: [fixed.layer], regions: [fixed], scrolls: [] },
    }),
  ).resolves.toEqual({ presented: [] })
})

it('draws the menu as a two-member field and hands its rows to the page only once settled', async () => {
  const events: import('../rendererContract.ts').GlassRegionEvent[] = []
  const scene = await initializedScene({} as LayerDevice, event => events.push(event))
  const panel = {
    ...region,
    layer: { id: 'fixed', depth: 0, attachment: { kind: 'fixed' as const } },
    emerge: {
      from: { x: 70, y: 180, width: 60, height: 40, radius: 20 },
      generation: 7,
      ready: true,
    },
  }
  await scene.request({
    type: 'scene',
    snapshot: { revision: 1, layers: [panel.layer], regions: [panel], scrolls: [] },
  })
  const raster = { spec: {}, updateSpec: vi.fn(), draw: vi.fn() }
  ;(scene as unknown as { presenters: Map<string, unknown> }).presenters.set('slot', {
    descriptor: { id: 'slot', role: 'material', regionIds: ['card'], origin: { x: 0, y: 0 } },
    raster,
  })
  const at = performance.timeOrigin + performance.now()
  scene.sample(at)
  expect(raster.draw).toHaveBeenCalled()
  // The first frame is the trigger: both members sit on it, one shape.
  const first = raster.updateSpec.mock.calls.at(-1)![0] as SurfaceRenderSpec
  expect(first.shape.members).toHaveLength(2)
  expect(first.shape.members![0]).toEqual(first.shape.members![1])
  expect(events).toEqual([])
  // Mid-open the trigger member has been absorbed; the rows are still glass ink.
  scene.sample(at + 200)
  const middle = raster.updateSpec.mock.calls.at(-1)![0] as SurfaceRenderSpec
  expect(middle.shape.members).toHaveLength(1)
  expect(events).toEqual([])
  scene.sample(at + GLASS_MENU_MORPH.open.ms)
  expect(events).toEqual([
    { type: 'emerge-ink', regionId: 'card', generation: 7, phase: 'open-settled' },
  ])
  scene.sample(at + GLASS_MENU_MORPH.open.ms + 20)
  expect(events).toHaveLength(1)
})

it.each([false, true])(
  'freezes a lost return source and settles after reopen, stale fade=%s',
  async staleFade => {
    const events: import('../rendererContract.ts').GlassRegionEvent[] = []
    const scene = await initializedScene({} as LayerDevice, event => events.push(event))
    const panel = {
      ...region,
      layer: { id: 'fixed', depth: 0, attachment: { kind: 'fixed' as const } },
      emerge: {
        from: { x: 70, y: 180, width: 60, height: 40, radius: 20 },
        closing: true,
        generation: 2,
        ink: {
          atlas: { width: 100, height: 100 },
          rows: { source: { x: 0, y: 0, width: 100, height: 60 }, frame: region.frame },
        },
      },
    }
    const snapshot = { revision: 1, layers: [panel.layer], regions: [panel], scrolls: [] }
    await scene.request({ type: 'scene', snapshot })
    const raster = { spec: {}, updateSpec: vi.fn(), draw: vi.fn() }
    const descriptor = {
      id: 'slot',
      role: 'material' as const,
      layerId: panel.layer.id,
      regionIds: ['card'],
      width: 100,
      height: 100,
      resolution: 1,
      origin: { x: 0, y: 0 },
    }
    ;(scene as unknown as { presenters: Map<string, unknown> }).presenters.set('slot', {
      descriptor,
      raster,
    })
    const start = performance.timeOrigin + performance.now()
    scene.sample(start)
    scene.sample(start + 60)
    const beforeFade = raster.updateSpec.mock.calls.at(-1)![0] as SurfaceRenderSpec
    const ordinary = regionSpec(panel, descriptor, snapshot)
    expect(beforeFade.shape).not.toEqual(ordinary.shape)
    expect(beforeFade.ink?.layers.length).toBeGreaterThan(0)
    await scene.request({
      type: 'scene',
      snapshot: {
        ...snapshot,
        revision: 2,
        regions: [{ ...panel, emerge: { ...panel.emerge, fading: true } }],
      },
    })
    // Force a redraw after the original close duration, as backdrop updates/reinstalls do.
    const renderer = scene as unknown as { presentEmerge(id: string, at: number): void }
    renderer.presentEmerge('card', start + 1000)
    const faded = raster.updateSpec.mock.calls.at(-1)![0] as SurfaceRenderSpec
    expect(faded).toEqual(beforeFade)
    scene.sample(start + 1000)
    expect(events.filter(event => event.type === 'emerge-settled')).toEqual([])
    expect(scene.active).toBe(false)
    await scene.request({
      type: 'scene',
      snapshot: {
        ...snapshot,
        revision: 3,
        regions: [
          {
            ...panel,
            emerge: { ...panel.emerge, closing: false, fading: staleFade, generation: 3 },
          },
        ],
      },
    })
    const reopened = performance.timeOrigin + performance.now()
    scene.sample(reopened)
    scene.sample(reopened + 2000)
    expect(
      events.filter(event => event.type === 'emerge-ink' && event.phase === 'open-settled'),
    ).toEqual([{ type: 'emerge-ink', regionId: 'card', generation: 3, phase: 'open-settled' }])
    await scene.request({
      type: 'scene',
      snapshot: {
        ...snapshot,
        revision: 4,
        regions: [{ ...panel, emerge: { ...panel.emerge, generation: 4 } }],
      },
    })
    const closed = performance.timeOrigin + performance.now()
    scene.sample(closed)
    scene.sample(closed + 2000)
    expect(events.filter(event => event.type === 'emerge-settled')).toEqual([
      { type: 'emerge-settled', regionId: 'card', generation: 4 },
    ])
  },
)

it('holds a phone close for its measured lead before the recorded close begins', async () => {
  const scene = await initializedScene({} as LayerDevice)
  const layer = { id: 'fixed', depth: 0, attachment: { kind: 'fixed' as const } }
  const from = { x: 380, y: 62, width: 44, height: 44, radius: 22 }
  const emerge = { from, generation: 1, ready: true, idiom: 'phone' as const }
  await scene.request({
    type: 'scene',
    snapshot: {
      revision: 1,
      layers: [layer],
      regions: [{ ...region, layer, emerge }],
      scrolls: [],
    },
  })
  const emerges = (scene as unknown as { emerges: Map<string, { start: number }> }).emerges
  const before = performance.timeOrigin + performance.now()
  await scene.request({
    type: 'scene',
    snapshot: {
      revision: 2,
      layers: [layer],
      regions: [{ ...region, layer, emerge: { ...emerge, closing: true, generation: 2 } }],
      scrolls: [],
    },
  })
  const start = emerges.get('card')!.start
  expect(start - before).toBeGreaterThanOrEqual(10)
  expect(start - before).toBeLessThan(40)
})

it('starts a context close at its first presented frame, so the hand-off frame draws the rows in place', async () => {
  // Owner, Music Home tile (2026-10-14): timed from the scene's arrival, the first close frame
  // had already moved the ink while the page still showed its rows, so they showed twice.
  const scene = await initializedScene({} as LayerDevice)
  const layer = { id: 'fixed', depth: 0, attachment: { kind: 'fixed' as const } }
  const from = { x: 120, y: 500, width: 92, height: 25, radius: 12.5 }
  const emerge = {
    from,
    generation: 1,
    ready: true,
    idiom: 'phone' as const,
    sourceKind: 'context' as const,
    recognitionEpoch: performance.timeOrigin + performance.now(),
  }
  await scene.request({
    type: 'scene',
    snapshot: {
      revision: 1,
      layers: [layer],
      regions: [{ ...region, layer, emerge }],
      scrolls: [],
    },
  })
  const emerges = (
    scene as unknown as { emerges: Map<string, { shown?: boolean; direction: string }> }
  ).emerges
  emerges.get('card')!.shown = true
  await scene.request({
    type: 'scene',
    snapshot: {
      revision: 2,
      layers: [layer],
      regions: [{ ...region, layer, emerge: { ...emerge, closing: true, generation: 2 } }],
      scrolls: [],
    },
  })
  const closing = emerges.get('card')!
  expect(closing.direction).toBe('close')
  // Not yet shown: its clock starts when its first frame is presented (presentEmerge).
  expect(closing.shown).toBe(false)
})

async function firstMaterial(
  appearance?: 'dark' | 'light',
  lifecycle?: (scene: RegionScene, calls: string[]) => Promise<void>,
) {
  const owner = { liveDevice: undefined, subscribe: () => () => {} } as unknown as LayerDevice
  const scene = new RegionScene(owner),
    fixed = { ...region, layer: { id: 'fixed', depth: 0, attachment: { kind: 'fixed' as const } } }
  if (appearance)
    await scene.request({
      type: 'initialize',
      protocol: GLASS_RENDERER_PROTOCOL,
      appearance,
      reducedMotion: false,
    })
  const bitmap = { width: 440, height: 956, close: vi.fn() } as unknown as ImageBitmap
  FrameGraph.for(owner).image('held:front', bitmap)
  const calls: string[] = []
  let installed: string | undefined
  const raster = {
    spec: { sampleWidth: 140, sampleHeight: 100 },
    setCovered: () => {},
    setVisible: () => {},
    clear: () => {},
    draw: () => calls.push('draw:' + installed),
    installRetained: (config: { appearance: string }) => {
      installed = config.appearance
      calls.push('install:' + installed)
    },
    settled: async () => {},
    setSourceOrigin: () => {},
    setViewportOrigin: () => {},
    backdropStale: () => false,
  }
  installFixedPresenter(scene, raster, bitmap)
  await scene.shareSource(
    {
      id: 'root-backdrop',
      revision: 1,
      layerId: 'chrome',
      role: 'transmitted-backdrop',
      origin: { x: 0, y: 0 },
      width: 440,
      height: 956,
      resolution: 1,
    },
    bitmap,
    'held:front',
  )
  await scene.request({
    type: 'scene',
    snapshot: { revision: 1, layers: [fixed.layer], regions: [fixed], scrolls: [] },
  })
  scene.sample(0)
  scene.present()
  await lifecycle?.(scene, calls)
  return calls
}

it('keeps hidden material unpresented and installs current appearance before resume', async () => {
  await firstMaterial('dark', async (scene, calls) => {
    calls.length = 0
    await scene.request({ type: 'visibility', visible: false })
    await scene.request({ type: 'appearance', value: 'light', reducedMotion: false })
    scene.present()
    expect(calls.filter(call => call.startsWith('draw:'))).toEqual([])
    await scene.request({ type: 'appearance', value: 'dark', reducedMotion: false })
    await scene.request({ type: 'visibility', visible: true })
    expect(calls.at(-1)).toBe('draw:dark')
    expect(calls).not.toContain('draw:light')
  })
})
it.each(['dark', 'light'] as const)(
  'draws the held %s appearance first on initial and recreated devices',
  async appearance => {
    expect(await firstMaterial(appearance)).toEqual(['install:' + appearance, 'draw:' + appearance])
    // A replacement device/scene has no inherited defaults or material state.
    expect(await firstMaterial(appearance)).toEqual(['install:' + appearance, 'draw:' + appearance])
  },
)
it('rejects a first material draw without a presented appearance', async () => {
  await expect(firstMaterial()).rejects.toThrow('requires a presented appearance')
})

it('propagates presentation paint exclusions into the raster spec', () => {
  const presentation = {
    ...region,
    layer: { ...region.layer, attachment: { kind: 'fixed' as const } },
    backdropExclusions: ['sheet-owner', 'alert-owner'],
  }
  const presenter = {
    id: 'slot',
    layerId: 'scroll',
    regionIds: ['card'],
    origin: { x: 0, y: 0 },
    width: 100,
    height: 60,
    resolution: 3,
  }
  const snapshot = { revision: 1, layers: [region.layer], regions: [presentation], scrolls: [] }
  expect(regionSpec(presentation, presenter, snapshot).backdropExclusions).toEqual(
    presentation.backdropExclusions,
  )
})

it.each([0, 1, 2])(
  'preserves all blended members when member %i is pressed',
  async pressedIndex => {
    const scene = await initializedScene({} as LayerDevice)
    const members = [0, 1, 2].map(index => ({
      ...region,
      id: `member-${index}`,
      layer: { id: 'fixed', depth: 0, attachment: { kind: 'fixed' as const } },
      frame: { x: 20 + index * 70, y: 200, width: 60, height: 40 },
      shape: 'capsule' as const,
      container: { id: 'buttons', spacing: 20 },
      material: {
        ...Glass.regular.interactive().material,
        press: index === 1 ? ('menu' as const) : ('button' as const),
      },
    }))
    await scene.request({
      type: 'scene',
      snapshot: { revision: 1, layers: [members[0]!.layer], regions: members, scrolls: [] },
    })
    const raster = { spec: {}, updateSpec: vi.fn(), draw: vi.fn() }
    ;(scene as unknown as { presenters: Map<string, unknown> }).presenters.set('slot', {
      descriptor: {
        id: 'slot',
        role: 'material',
        regionIds: members.map(member => member.id),
        layerId: 'fixed',
        origin: { x: 0, y: 180 },
        width: 240,
        height: 80,
        resolution: 1,
      },
      raster,
    })
    const pressScene = scene as unknown as {
      presentMotion(
        id: string,
        state: { motion: object; press: { amount: number }; downAt?: number },
      ): void
    }
    pressScene.presentMotion(members[pressedIndex]!.id, {
      motion: {},
      press: { amount: 1 },
      downAt: performance.timeOrigin + performance.now() - 60,
    })
    expect(raster.updateSpec).toHaveBeenCalledOnce()
    const held = raster.updateSpec.mock.calls[0]![0] as SurfaceRenderSpec
    expect(held.shape.members).toHaveLength(3)
    // The shared material stays at rest. Only the addressed member whitens.
    expect(held.tint).toEqual(
      regionSpec(
        members[0]!,
        {
          id: 'slot',
          layerId: 'fixed',
          regionIds: members.map(member => member.id),
          origin: { x: 0, y: 180 },
          width: 240,
          height: 80,
          resolution: 1,
        },
        { revision: 1, layers: [members[0]!.layer], regions: members, scrolls: [] },
      ).tint,
    )
    expect(held.memberHighlight?.member).toBe(pressedIndex)
    expect(held.memberHighlight?.amount).toBeGreaterThan(0)
    for (const [index, member] of held.shape.members!.entries()) {
      expect(member.halfWidth).toBe(index === pressedIndex ? (index === 1 ? 32 : 38) : 30)
    }
  },
)

it('a plain label drop is whole glass from its first frame, settles to the panel corner and fades out on close', () => {
  const panel = {
    ...region,
    layer: { id: 'fixed', depth: 0, attachment: { kind: 'fixed' as const } },
    frame: { x: 150, y: 200, width: 250, height: 320 },
    shape: { kind: 'roundedRectangle' as const, cornerRadius: 32 },
    emerge: {
      sourceKind: 'label' as const,
      ready: false,
      from: { x: 330, y: 178, width: 80, height: 24, radius: 12 },
    },
  }
  const presenter = {
    id: 'drop',
    layerId: region.layer.id,
    regionIds: [region.id],
    origin: { x: 0, y: 0 },
    width: 440,
    height: 956,
    resolution: 2,
  }
  const base = regionSpec(panel, presenter, {
    revision: 1,
    layers: [panel.layer],
    regions: [panel],
    scrolls: [],
  })
  const held = emergeRegionSpec(base, panel, presenter, 0, { rounding: 0 }, undefined, {
    direction: 'open',
    ms: 0,
    pressHighlight: 0,
    settled: false,
  })
  expect(held.opacity).toBe(0)
  expect(held.prewarmTransparent).toBe(true)
  const ready = { ...panel, emerge: { ...panel.emerge, ready: true } }
  const early = emergeRegionSpec(base, ready, presenter, 0.05, { rounding: 0 }, undefined, {
    direction: 'open',
    ms: 17,
    pressHighlight: 0,
    settled: false,
  })
  expect(early.opacity).toBe(1)
  // The drop grows from the label's centre, not from the label's whole box.
  expect(early.shape.first.halfWidth).toBeLessThan(12)
  const settled = emergeRegionSpec(base, ready, presenter, 1, { rounding: 0 }, undefined, {
    direction: 'open',
    ms: 0,
    pressHighlight: 0,
    settled: true,
  })
  expect(settled.shape.first.radius).toBe(32)
  expect(settled.opacity).toBe(1)
  const closed = emergeRegionSpec(base, panel, presenter, 0, { rounding: 0 }, undefined, {
    direction: 'close',
    ms: 183,
    pressHighlight: 0,
    settled: false,
  })
  expect(closed.shape.members).toHaveLength(1)
  expect(closed.opacity).toBe(0)
})

it('keeps menu light following a held finger without restarting its rise and fades after release', () => {
  const light = new MenuTouchLight()
  light.input({ regionId: 'menu', phase: 'pressed', epoch: 1000, contact: { x: 20, y: 30 } })
  const held = light.sample('dark', 1500)!
  light.input({ regionId: 'menu', phase: 'dragging', epoch: 1501, contact: { x: 90, y: 70 } })
  expect(light.sample('dark', 1501)).toEqual({ ...held, x: 90, y: 70 })
  light.input({ regionId: 'menu', phase: 'releasing', epoch: 1600 })
  const fading = light.sample('dark', 1850)!
  expect(fading.intensity).toBeGreaterThan(0)
  expect(fading.intensity).toBeLessThan(held.intensity)
  expect(fading.radius).toBeGreaterThan(held.radius)
  expect(light.sample('dark', 2300)).toBeUndefined()
  expect(light.needsFrame(2300)).toBe(false)
  light.input({ regionId: 'menu', phase: 'pressed', epoch: 2400, contact: { x: 20, y: 30 } })
  light.input({ regionId: 'menu', phase: 'rest', epoch: 2401 })
  expect(light.sample('dark', 2500)).toBeUndefined()
})

it('keeps late preview-source glass on the same clock as an already-presented button morph', async () => {
  const recognitionEpoch = performance.timeOrigin + performance.now()
  const panel: GlassRegion = {
    ...region,
    frame: { x: 95, y: 255, width: 250, height: 104 },
    layer: { id: 'fixed', depth: 0, attachment: { kind: 'fixed' } },
    emerge: {
      recognitionEpoch,
      sourceKind: 'context',
      ready: true,
      idiom: 'phone',
      from: contextMenuSeed({ x: 20, y: 170, width: 400, height: 68 }),
    },
  }
  const render = async (warm: boolean) => {
    const scene = await initializedScene({} as LayerDevice)
    await scene.request({
      type: 'scene',
      snapshot: { revision: 1, layers: [panel.layer], regions: [panel], scrolls: [] },
    })
    const raster = { spec: {}, updateSpec: vi.fn(), draw: vi.fn() }
    ;(scene as unknown as { presenters: Map<string, unknown> }).presenters.set('slot', {
      descriptor: { id: 'slot', role: 'material', regionIds: ['card'], origin: { x: 0, y: 0 } },
      raster,
    })
    if (warm) scene.sample(recognitionEpoch)
    scene.sample(recognitionEpoch + 256.5)
    return raster.updateSpec.mock.calls.at(-1)![0] as SurfaceRenderSpec
  }
  expect(panel.emerge!.from.width).toBe(92)
  expect(panel.emerge!.from.y).toBe(240)
  const late = await render(false)
  const warm = await render(true)
  expect(late.shape).toEqual(warm.shape)
  expect(late.opacity).toBe(warm.opacity)
  // reference light body at touch +1006.5ms is approximately 222x96pt.
  // The old dark-derived fit was 205.7pt wide at this light sample.
  expect(late.shape.first.halfWidth * 2).toBeCloseTo(222, -1)
  expect(late.shape.first.halfHeight * 2).toBeCloseTo(96, -1)
})

it('keeps each glass member at its own position when the field declaration order changes', async () => {
  const owner = { liveDevice: undefined, subscribe: () => () => {} } as unknown as LayerDevice
  const scene = await initializedScene(owner)
  const members = [0, 1].map(index => ({
    ...region,
    id: `member-${index}`,
    layer: { id: 'fixed', depth: 0, attachment: { kind: 'fixed' as const } },
    frame: { x: 20 + index * 100, y: 200, width: 60, height: 40 },
    shape: 'capsule' as const,
    container: { id: 'buttons', spacing: 20 },
  }))
  const presenter = {
    id: 'slot',
    role: 'material' as const,
    regionIds: members.map(member => member.id),
    layerId: 'fixed',
    origin: { x: 0, y: 180 },
    fieldOrigin: { x: 20, y: 200 },
    width: 240,
    height: 80,
    resolution: 1,
  }
  const snapshot = (revision: number, regions: typeof members) => ({
    revision,
    layers: [members[0]!.layer],
    regions,
    scrolls: [],
  })
  const raster = {
    spec: regionSpec(members[0]!, presenter, snapshot(1, members)),
    setCovered() {},
    setVisible() {},
    clear() {},
    draw() {},
    installRetained(config: { spec: SurfaceRenderSpec }) {
      this.spec = config.spec
    },
    updateSpec(spec: SurfaceRenderSpec) {
      this.spec = spec
    },
    async settled() {},
    setSourceOrigin() {},
    setViewportOrigin() {},
    backdropStale: () => false,
  }
  ;(scene as unknown as { presenters: Map<string, unknown> }).presenters.set('slot', {
    descriptor: presenter,
    raster,
  })
  const bitmap = { width: 440, height: 956, close: vi.fn() } as unknown as ImageBitmap
  ;(scene as unknown as { emptyForeground: unknown }).emptyForeground = {
    key: 'region:empty',
    value: bitmap,
    release() {},
  }
  await scene.shareSource(
    {
      id: 'root-backdrop',
      revision: 1,
      layerId: 'chrome',
      role: 'transmitted-backdrop',
      origin: { x: 0, y: 0 },
      width: 440,
      height: 956,
      resolution: 1,
    },
    bitmap,
    'member-identity:front',
  )
  await scene.request({ type: 'scene', snapshot: snapshot(1, members) })
  scene.sample(performance.timeOrigin + performance.now() + 1100)
  const original = raster.spec.shape.members!.map(member => member.centerX)
  expect(original[0]).not.toBe(original[1])
  // Common container translation cannot create a geometry spring. A real member
  // change below still starts one, including after this scroll and its reversal.
  const shape = raster.spec.shape
  for (const offset of [-200, 0]) {
    await scene.request({
      type: 'update-presenter',
      presenter: {
        ...presenter,
        origin: { x: 0, y: 180 + offset },
        fieldOrigin: { x: 20, y: 200 + offset },
      },
    })
    await scene.request({
      type: 'scene',
      snapshot: snapshot(
        1,
        members.map(member => ({
          ...member,
          frame: { ...member.frame, y: member.frame.y + offset },
        })),
      ),
    })
    expect(raster.spec.shape).toEqual(shape)
    expect((scene as unknown as { fields: Map<string, unknown> }).fields.size).toBe(0)
  }
  await scene.request({ type: 'scene', snapshot: snapshot(2, [...members].reverse()) })
  // A declaration reorder must never send two settled surfaces through each other.
  expect(raster.spec.shape.members!.map(member => member.centerX)).toEqual([...original].reverse())
  scene.sample(performance.timeOrigin + performance.now() + 100)
  expect(raster.spec.shape.members!.map(member => member.centerX)).toEqual([...original].reverse())

  const at = performance.now() + 1100
  const clock = vi.spyOn(performance, 'now').mockReturnValue(at)
  try {
    scene.sample(performance.timeOrigin + at)
    const moved = members.map((member, index) => ({
      ...member,
      frame: { ...member.frame, x: member.frame.x + (index === 0 ? 40 : 0) },
    }))
    await scene.request({ type: 'scene', snapshot: snapshot(3, moved) })
    clock.mockReturnValue(at + 100)
    scene.sample(performance.timeOrigin + at + 100)
    const moving = raster.spec.shape.members!.map(member => member.centerX)
    const added = { ...members[0]!, id: 'new-member', frame: { ...members[0]!.frame, x: 220 } }
    await scene.request({
      type: 'update-presenter',
      presenter: { ...presenter, regionIds: [...presenter.regionIds, added.id] },
    })
    await scene.request({ type: 'scene', snapshot: snapshot(4, [moved[1]!, added, moved[0]!]) })
    expect(raster.spec.shape.members!.map(member => member.centerX)).toEqual([
      moving[1],
      230,
      moving[0],
    ])
    clock.mockReturnValue(at + 101)
    scene.sample(performance.timeOrigin + at + 101)
    // The moving member keeps its velocity; the new one cannot inherit it.
    expect(raster.spec.shape.members![2]!.centerX).toBeGreaterThan(moving[0]!)
    expect(raster.spec.shape.members![1]!.centerX).toBe(230)
  } finally {
    clock.mockRestore()
  }
})

it.each(['document ink', 'retained ink', 'sheet'])(
  'samples the moving backdrop with %s after a resting viewport was observed',
  async mode => {
    const owner = { liveDevice: undefined, subscribe: () => () => {} } as unknown as LayerDevice
    const scene = await initializedScene(owner)
    const accessory = {
      ...region,
      layer: { id: 'fixed', depth: 0, attachment: { kind: 'fixed' as const } },
      accessoryViewportTrack: {
        epoch: 1000,
        duration: 100,
        widths: [100, 60],
        offsets: [
          { x: 0, y: 0 },
          { x: 40, y: 20 },
        ],
      },
      accessoryTrack:
        mode === 'retained ink'
          ? {
              epoch: 1000,
              duration: 100,
              widths: [100, 60],
              offsets: [
                { x: 0, y: 0 },
                { x: 40, y: 20 },
              ],
              envelope: 100,
              slices: [],
            }
          : undefined,
    }
    if (mode === 'sheet') {
      Object.assign(accessory, { presentationViewportTrack: accessory.accessoryViewportTrack })
      Object.assign(accessory, { accessoryViewportTrack: undefined })
    }
    const presenter = {
      id: 'accessory',
      role: 'material' as const,
      regionIds: [region.id],
      layerId: 'fixed',
      origin: { x: 10, y: 700 },
      width: 140,
      height: 100,
      resolution: 1,
    }
    const snapshot = { revision: 1, layers: [accessory.layer], regions: [accessory], scrolls: [] }
    const raster = new WebGPURaster()
    const spec = regionSpec(accessory, presenter, snapshot)
    // Exercise the real sampling rectangle without requiring a GPU in the unit test.
    Object.assign(raster, {
      setup: { spec, viewportOrigin: presenter.origin },
      allocate() {},
      upload() {},
    })
    raster.setViewport({ ...presenter.origin, scaleX: 1, scaleY: 1 })
    const sampleRect = () =>
      (
        raster as unknown as {
          backdropRect(): readonly number[]
        }
      ).backdropRect()
    const resting = sampleRect()
    const drawn: number[][] = []
    raster.draw = () => {
      drawn.push([...sampleRect()])
    }
    // Keep viewport admission independent of GPU allocation in this geometry regression.
    raster.backdropStale = () => false
    Object.assign(scene, {
      scene: snapshot,
      presenters: new Map([[presenter.id, { descriptor: presenter, raster }]]),
      sources:
        mode === 'retained ink'
          ? new Map([[`foreground:${region.id}`, { descriptor: { width: 140, height: 100 } }]])
          : new Map(),
    })
    scene.sample(1050)
    const moving = sampleRect()
    await scene.request({
      type: 'presenter-viewport',
      id: presenter.id,
      viewport: { ...presenter.origin, scaleX: 1, scaleY: 1 },
    })
    expect(sampleRect()).toEqual(moving)
    scene.sample(1100)
    expect(drawn.map(rect => [rect[0]! - resting[0]!, rect[1]! - resting[1]!])).toEqual([
      [20, 10],
      [40, 20],
    ])
    // Once the track is gone the normal observer owns the viewport again.
    Object.assign(scene, {
      scene: {
        ...snapshot,
        regions: [
          {
            ...accessory,
            accessoryTrack: undefined,
            accessoryViewportTrack: undefined,
            presentationViewportTrack: undefined,
          },
        ],
      },
    })
    raster.setViewport({ x: 25, y: 715, scaleX: 1, scaleY: 1 })
    expect(sampleRect()[0]! - resting[0]!).toBe(15)
    expect(sampleRect()[1]! - resting[1]!).toBe(15)
  },
)

it.each(['sheet', 'accessory'] as const)(
  'submits %s material once per motion epoch before acknowledging the scene',
  async kind => {
    const owner = { liveDevice: undefined, subscribe: () => () => {} } as unknown as LayerDevice
    const scene = await initializedScene(owner),
      fixed = {
        ...region,
        layer: { id: 'fixed', depth: 0, attachment: { kind: 'fixed' as const } },
      }
    const bitmap = { width: 440, height: 956, close: vi.fn() } as unknown as ImageBitmap
    FrameGraph.for(owner).image('production:1:front', bitmap)
    const calls: string[] = [],
      raster = {
        spec: { sampleWidth: 140, sampleHeight: 100 },
        setCovered: () => {},
        setViewport: () => {},
        clear: () => {},
        draw: () => calls.push('draw'),
        installRetained: () => calls.push('install'),
        settled: async () => {
          calls.push('fence')
        },
        setSourceOrigin: () => {},
        setViewportOrigin: () => {},
        backdropStale: () => false,
      }
    installFixedPresenter(scene, raster, bitmap)
    await scene.shareSource(
      {
        id: 'root-backdrop',
        revision: 1,
        layerId: 'chrome',
        role: 'transmitted-backdrop',
        origin: { x: 0, y: 0 },
        width: 440,
        height: 956,
        resolution: 1,
      },
      bitmap,
      'production:1:front',
    )
    const snapshot = (offsetY: number, revision: number) => ({
      revision,
      layers: [fixed.layer],
      regions: [fixed],
      scrolls: [
        {
          id: 'webgpu-source-root',
          offsetX: 0,
          offsetY,
          viewportX: 0,
          viewportY: 0,
          width: 440,
          height: 956,
        },
      ],
    })
    await scene.request({ type: 'scene', snapshot: snapshot(0, 1) })
    calls.length = 0
    const setEpoch = (epoch: number) => {
      Object.assign(
        fixed,
        kind === 'sheet'
          ? { presentationContentEpoch: epoch }
          : {
              accessoryViewportTrack: {
                epoch,
                duration: 100,
                widths: [140, 140],
                offsets: [
                  { x: 0, y: 0 },
                  { x: 0, y: 0 },
                ],
              },
            },
      )
    }
    setEpoch(1000)
    await scene.request({ type: 'scene', snapshot: snapshot(0, 2) })
    expect(calls).toEqual(['install', 'fence'])
    calls.length = 0
    await scene.request({ type: 'scene', snapshot: snapshot(0, 3) })
    expect(calls).toEqual([])
    scene.sample(1050)
    // Moving material still samples its trajectory; it must not reinstall or fence per frame.
    expect(calls).toEqual(kind === 'sheet' ? [] : ['draw'])
    setEpoch(2000)
    raster.settled = async () => {
      throw Error('lost completion')
    }
    await expect(scene.request({ type: 'scene', snapshot: snapshot(0, 4) })).rejects.toThrow(
      'lost completion',
    )
    calls.length = 0
    raster.settled = async () => {
      calls.push('fence')
    }
    await scene.request({ type: 'scene', snapshot: snapshot(0, 5) })
    expect(calls).toEqual(['install', 'fence'])

    // A navigation that has not submitted its atlas cannot acknowledge the sheet's epoch.
    setEpoch(3000)
    Object.assign(scene, {
      navigation: {
        key: 'pending',
        routes: 1,
        contentLayer: 'next',
        width: 440,
        height: 956,
        deferPresent: true,
        lease: { value: bitmap },
      },
    })
    const pending = await scene.request({ type: 'scene', snapshot: snapshot(0, 6) })
    expect(pending).toMatchObject({ presented: [] })
    Object.assign(scene, { navigation: undefined })
    calls.length = 0
    const ready = await scene.request({ type: 'scene', snapshot: snapshot(0, 7) })
    expect(calls).toEqual(['install', 'fence'])
    expect(ready).toMatchObject({ presented: ['card'] })
  },
)

it('keeps a submitted old scene parked until the navigation source and matching scene commit', async () => {
  const owner = { liveDevice: undefined, subscribe: () => () => {} } as unknown as LayerDevice
  const scene = await initializedScene(owner),
    fixed = {
      ...region,

      material: Glass.regular.interactive().material,
      layer: { id: 'fixed', depth: 0, attachment: { kind: 'fixed' as const } },
    }
  const bitmap = { width: 440, height: 956, close: vi.fn() } as unknown as ImageBitmap
  FrameGraph.for(owner).image('production:1:front', bitmap)
  const setups: Record<string, unknown>[] = [],
    poses: unknown[] = [],
    draws: number[] = []
  const raster = {
    spec: { sampleWidth: 140, sampleHeight: 100 },
    setCovered: () => {},
    clear: () => {},
    draw: () => draws.push(1),
    installRetained: (
      setup: Record<string, unknown>,
      _source: unknown,
      _glyphs: unknown,
      present = true,
    ) => {
      // Use the raster's real coverage predicate at the fake GPU boundary. The old
      // root holds only chrome bands; incoming content glass is in their gap.
      const missing = uncoveredSourceRows(
        [30, 250, 100, 60],
        {
          origin: { y: 0 },
          scroll: { y: 0 },
          height: 956,
          resolution: 1,
          clip: [0, 0, 440, 956],
          rows: [
            { top: 0, bottom: 88 },
            { top: 856, bottom: 956 },
          ],
        },
        setup.navigationCoverage as Parameters<typeof uncoveredSourceRows>[2],
      )
      if (missing) throw Error('Incoming glass sampled the old banded root')
      setups.push(setup)
      if (present) draws.push(1)
    },
    updateSpec: () => {},
    settled: async () => {},
    setSourceOrigin: () => {},
    setViewportOrigin: () => {},
    backdropStale: () => false,
    setVisible: () => {},
    setNavigation: (pose: unknown) => poses.push(pose),
  }
  installFixedPresenter(scene, raster, bitmap)

  await scene.shareSource(rootBackdrop(1), bitmap, 'production:1:front')
  scene.beginSourceChange(2)
  const stale = await scene.request({
    type: 'scene',
    snapshot: {
      revision: 1,
      sourceRevision: 1,
      layers: [fixed.layer],
      regions: [fixed],
      scrolls: [],
    },
  })
  expect(stale).toEqual({ superseded: true, presented: [] })
  expect(setups).toEqual([])
  const rows = [{ top: 0, bottom: 956 }]
  await scene.navigationSource({
    key: 'navigation:2',
    lease: { key: 'navigation:2:front', value: bitmap, release() {} } as never,
    routes: 2,
    contentLayer: 'plane-4',
    width: 440,
    height: 956,
    rows,
  })
  expect(setups).toEqual([])
  await scene.request({
    type: 'scene',
    snapshot: {
      revision: 2,
      sourceRevision: 2,
      layers: [fixed.layer],
      regions: [fixed],
      scrolls: [],
    },
  })
  expect(setups.at(-1)).toMatchObject({
    sourceKey: 'navigation:2',
    contentLayer: 'plane-4',
    navigationCoverage: { width: 440, height: 956, rows },
  })
})

it('does not expose an outgoing dialog plane between its close scene and source commit', async () => {
  const owner = { liveDevice: undefined, subscribe: () => () => {} } as unknown as LayerDevice
  const scene = await initializedScene(owner)
  const bitmap = { width: 440, height: 956, close() {} } as ImageBitmap
  FrameGraph.for(owner).image('sheet-blue', bitmap)
  const backdrop = Backdrop.for(owner)
  backdrop.setLayers([
    {
      id: 'sheet',
      owner: 'sheet-owner',
      key: 'sheet-blue',
      fill: [0, 0, 1, 1],
      origin: { x: 0, y: 0 },
      scroll: { x: 0, y: 0 },
      clip: [0, 0, 440, 956],
      width: 440,
      height: 956,
      resolution: 1,
    },
  ])
  const snapshot = (revision: number, sourceRevision: number, owners: string[]) => ({
    revision,
    sourceRevision,
    backdropOwners: owners,
    layers: [region.layer],
    regions: [{ ...region, backdropExclusions: owners }],
    scrolls: [],
  })
  await scene.request({ type: 'scene', snapshot: snapshot(1, 1, ['sheet-owner']) })
  // The DOM has closed its dialog, but the captured blue plane is still installed.
  // The exclusion must not disappear from the committed scene in that interval.
  const closed = await scene.request({ type: 'scene', snapshot: snapshot(2, 1, []) })
  expect(closed).toMatchObject({ superseded: true, presented: [] })
  const committed = (scene as unknown as { scene: { regions: GlassRegion[] } }).scene
  expect(backdrop.under([0, 0, 440, 200], committed.regions[0]!.backdropExclusions)).toEqual([])
  // The source batch retires the outgoing plane before the matching scene commits.
  scene.beginSourceChange(2)
  backdrop.setLayers([])
  const settled = await scene.request({ type: 'scene', snapshot: snapshot(3, 2, []) })
  expect(settled).toEqual({ presented: [] })
  expect(
    (scene as unknown as { scene: { regions: GlassRegion[] } }).scene.regions[0]!
      .backdropExclusions,
  ).toEqual([])
})

it('admits reparented exclusions but waits for captured dialog order on a reorder', async () => {
  const owner = { liveDevice: undefined, subscribe: () => () => {} } as unknown as LayerDevice
  const scene = await initializedScene(owner)
  const bitmap = { width: 440, height: 956, close() {} } as ImageBitmap
  FrameGraph.for(owner).image('dialogs', bitmap)
  const backdrop = Backdrop.for(owner)
  const plane = (id: string) => ({
    id,
    owner: id,
    key: 'dialogs',
    fill: [0, 0, 1, 1] as const,
    origin: { x: 0, y: 0 },
    scroll: { x: 0, y: 0 },
    clip: [0, 0, 440, 956] as const,
    width: 440,
    height: 956,
    resolution: 1,
  })
  backdrop.setLayers([plane('a'), plane('b')])
  const snapshot = (revision: number, owners: string[], exclusions: string[]) => ({
    revision,
    sourceRevision: 1,
    backdropOwners: owners,
    layers: [region.layer],
    regions: [{ ...region, backdropExclusions: exclusions }],
    scrolls: [],
  })
  await scene.request({ type: 'scene', snapshot: snapshot(1, ['a', 'b'], ['a', 'b']) })
  // A control reparented into a can sample a immediately: the captured order is coherent.
  expect(await scene.request({ type: 'scene', snapshot: snapshot(2, ['a', 'b'], ['b']) })).toEqual({
    presented: [],
  })
  expect(
    await scene.request({ type: 'scene', snapshot: snapshot(3, ['b', 'a'], ['a']) }),
  ).toMatchObject({ superseded: true })
  backdrop.setLayers([plane('b'), plane('a')])
  expect(await scene.request({ type: 'scene', snapshot: snapshot(4, ['b', 'a'], ['a']) })).toEqual({
    presented: [],
  })
})

it('keeps the presented menu material continuous across close and reopen reversals', async () => {
  let clock = 1000
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  const scene = await initializedScene({} as LayerDevice)
  let panel: GlassRegion = {
    ...region,
    layer: { id: 'fixed', depth: 0, attachment: { kind: 'fixed' } },
    emerge: {
      from: { x: 40, y: 240, width: 44, height: 44, radius: 22 },
      idiom: 'pad',
      generation: 1,
    },
  }
  const raster = { spec: {}, updateSpec: vi.fn(), draw: vi.fn() }
  const submit = async () => {
    await scene.request({
      type: 'scene',
      snapshot: {
        revision: panel.emerge!.generation!,
        layers: [panel.layer],
        regions: [panel],
        scrolls: [],
      },
    })
    ;(scene as unknown as { presenters: Map<string, unknown> }).presenters.set('slot', {
      descriptor: {
        id: 'slot',
        role: 'material',
        layerId: 'fixed',
        regionIds: ['card'],
        origin: { x: 0, y: 0 },
        width: 400,
        height: 400,
        resolution: 1,
      },
      raster,
    })
  }
  const sample = () => {
    scene.sample(performance.timeOrigin + clock)
    return (raster.updateSpec.mock.calls.at(-1)![0] as SurfaceRenderSpec).recipeMix!
  }
  await submit()
  sample()
  clock += 75
  const opening = sample()
  expect(opening).toBeCloseTo(0.52)
  panel = { ...panel, emerge: { ...panel.emerge!, closing: true, generation: 2 } }
  await submit()
  expect(sample()).toBeCloseTo(opening)
  clock += 60
  const closing = sample()
  expect(closing).toBeLessThan(opening)
  panel = { ...panel, emerge: { ...panel.emerge!, closing: false, generation: 3 } }
  await submit()
  expect(sample()).toBeCloseTo(closing)
  clock += 200
  expect(sample()).toBe(1)
  vi.restoreAllMocks()
})

it('samples keyboard lens geometry without more document messages and draws the exact endpoint', async () => {
  const scene = await initializedScene({ subscribe: () => () => {} } as unknown as LayerDevice)
  const presenter = {
    id: 'composer',
    layerId: 'fixed',
    regionIds: ['card'],
    origin: { x: 40, y: 900 },
    width: 100,
    height: 60,
    resolution: 1,
  }
  const viewport = { x: 40, y: 900, scaleX: 1, scaleY: 1 }
  const setViewport = vi.fn()
  const draw = vi.fn()
  const raster = { setViewport, draw, backdropStale: () => true }
  Object.assign(scene, { presenters: new Map([[presenter.id, { descriptor: presenter, raster }]]) })
  const keyboard = {
    epoch: 1000,
    duration: 1900,
    end: 1400,
    offset: 900,
    stops: [
      [0, 0],
      [200 / 1900, -300],
      [400 / 1900, -400],
      [1, -400],
    ] as const,
  }
  await scene.request({ type: 'presenter-viewport', id: presenter.id, viewport, keyboard })
  expect(draw).not.toHaveBeenCalled()
  scene.sample(1200, 1250)
  expect(setViewport).toHaveBeenLastCalledWith({ ...viewport, y: 600 })
  expect(scene.active).toBe(true)
  // Crossing the endpoint still needs one frame even if the callback is late.
  scene.sample(1405, 1455)
  expect(setViewport).toHaveBeenLastCalledWith({ ...viewport, y: 500 })
  expect(scene.active).toBe(false)
  await scene.request({
    type: 'presenter-viewport',
    id: presenter.id,
    viewport: { ...viewport, y: 500 },
  })
  scene.sample(1500)
  expect(setViewport).toHaveBeenLastCalledWith({ ...viewport, y: 500 })
})

it.each([22, -22])(
  'preserves the screen pose when a bottom-anchored field resizes by %s',
  async delta => {
    const scene = await initializedScene({} as LayerDevice)
    const member = { centerX: 60, centerY: 40, halfWidth: 50, halfHeight: 30, radius: 22 }
    const spec = { shape: { first: member, members: [member] } } as unknown as SurfaceRenderSpec
    const raster = { spec, updateSpec: vi.fn() }
    const descriptor = {
      id: 'composer',
      role: 'material' as const,
      layerId: 'fixed',
      regionIds: ['editor'],
      origin: { x: 0, y: 800 },
      fieldOrigin: { x: 20, y: 820 },
      width: 240,
      height: 80,
      resolution: 1,
    }
    ;(scene as unknown as { presenters: Map<string, unknown> }).presenters.set('composer', {
      descriptor,
      raster,
    })
    await scene.request({
      type: 'update-presenter',
      presenter: {
        ...descriptor,
        height: 80 + delta,
        origin: { x: 0, y: 800 - delta },
        fieldOrigin: { x: 20, y: 820 - delta },
      },
    })
    const shifted = raster.updateSpec.mock.calls[0]![0] as SurfaceRenderSpec
    expect(800 - delta + shifted.shape.first.centerY).toBe(840)
    expect(shifted.shape.first.halfHeight).toBe(30)
  },
)

it('samples every partition aperture in the shared field, not its canvas envelope', async () => {
  const members: GlassRegion[] = [0, 1].map(index => ({
    ...region,
    id: `branch-${index}`,
    layer: { id: 'fixed', depth: 0, attachment: { kind: 'fixed' } },
    frame: { x: 0, y: 800, width: 440, height: 44 },
    shape: 'capsule',
    container: { id: 'toolbar', spacing: 20 },
    shapeTrack: {
      epoch: 100,
      duration: 100,
      frames: [
        { x: index * 60, y: 0, width: 20, height: 20 },
        { x: index * 60, y: 0, width: 44, height: 44 },
      ],
      radii: [10, 22],
    },
  }))
  const snapshot = { revision: 1, layers: [members[0]!.layer], scrolls: [], regions: members }
  const presenter = {
    id: 'toolbar',
    role: 'material' as const,
    regionIds: members.map(member => member.id),
    layerId: 'fixed',
    origin: { x: 0, y: 800 },
    width: 440,
    height: 44,
    resolution: 1,
  }
  const spec = fieldRegionSpec(members, presenter, snapshot, 150)
  expect(spec.shape.members).toHaveLength(2)
  expect(
    spec.shape.members!.map(member => [member.halfWidth, member.halfHeight, member.radius]),
  ).toEqual([
    [16, 16, 16],
    [16, 16, 16],
  ])
  expect(spec.shape.members![1]!.centerX - spec.shape.members![0]!.centerX).toBe(60)
  // A retired partition (no area) leaves the field instead of blending in as a point.
  const retired = { ...members[1]!.shapeTrack!, frames: [{ x: 60, y: 22, width: 0, height: 0 }] }
  const merged = fieldRegionSpec(
    [members[0]!, { ...members[1]!, shapeTrack: retired }],
    presenter,
    snapshot,
    150,
  )
  expect(merged.shape.members).toEqual([spec.shape.members![0]])
  const scene = await initializedScene({} as LayerDevice)
  await scene.request({ type: 'scene', snapshot })
  const raster = { spec, updateSpec: vi.fn(), draw: vi.fn() }
  ;(scene as unknown as { presenters: Map<string, unknown> }).presenters.set('toolbar', {
    descriptor: presenter,
    raster,
  })
  scene.sample(150)
  expect(raster.updateSpec).toHaveBeenCalledTimes(1)
  expect(raster.updateSpec.mock.calls[0]![0].shape.members).toEqual(spec.shape.members)
})
