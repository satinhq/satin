import { expect, it, vi } from 'vitest'
import { keepSourcePixels, pixelImage, takeSourcePixels } from './preparedSourcePixels.ts'
import type { ProductionGlassRuntime } from './production.ts'
import { pinnedTopWindow, type PinnedTop } from './productionPinnedTop.ts'
import {
  discardChangedPinnedTops,
  preparePinnedTops,
  type PinnedTopChanges,
} from './productionPinnedTopPrepare.ts'
import {
  backdropLayers,
  type Plane,
  type PlaneCapture,
  type PlaneEntry,
} from './productionPlanes.ts'

vi.mock('./backdropLayers.ts', () => ({ cssColor: () => '#fff', backdropOwner: () => undefined }))
vi.mock('./capture.ts', () => ({ rasterProductionSource: vi.fn() }))

// The step of a source preparation that keeps a long list's top when its window moves on.
// 4 px wide at resolution 1, so the bytes are countable; a 100 pt scrollport.

const frame = { page: [1, 1, 1] as const, resolution: 1, appearance: 'light' as const }
const host = {
  clientHeight: 100,
  hasAttribute: (name: string) => name === 'data-satin-scroll',
} as unknown as HTMLElement
const top = pinnedTopWindow(100, 5000, 1)
const plane = (window: Plane['window']): Plane =>
  ({
    id: 'plane-1',
    measured: {
      top: 0,
      left: 0,
      layout: { nodes: [], width: 440, contentHeight: 956, measuredAt: 0, screen: 'root' },
    },
    host,
    width: 4,
    height: window ? window.bottom - window.top : 5000,
    window,
    contentHeight: 5000,
    origin: { x: 0, y: 0 },
  }) as unknown as Plane
const installed = (window: PlaneEntry['window']): PlaneEntry => ({
  window,
  signature: 's',
  key: 'backdrop:plane-1:1',
  revision: 1,
  origin: { x: 0, y: 0 },
  width: 4,
  height: window ? window.bottom - window.top : 5000,
  resolution: 1,
  host,
  appearance: 'light',
  text: '17px',
})
function runtime(entry: PlaneEntry | undefined, rows = 1000) {
  const image = pixelImage(4, rows)
  // Each row's bytes are its row number.
  const bytes = new Uint8ClampedArray(4 * 4 * rows)
  for (let row = 0; row < rows; row++) bytes.fill(row % 251, row * 16, row * 16 + 16)
  keepSourcePixels(image, bytes)
  return {
    client: { documentOwned: true },
    planes: new Map(entry ? [['plane-1', entry]] : []),
    planeImages: new Map(entry ? [['plane-1', image]] : []),
    pinnedTops: new Map<string, PinnedTop>(),
    pinnedOrphans: new Set<string>(),
    growPlanes: new Set<string>(),
    damaged: new Set<string>(),
    captureRevision: 1,
  } as unknown as ProductionGlassRuntime
}
const captured = new Map<string, PlaneCapture>([
  ['plane-1', { bitmap: pixelImage(4, 1000), signature: 'next' }],
])

it('the window leaves the top: the rows it is giving up become the pinned top, with no capture', async () => {
  const glass = runtime(installed({ top: 0, bottom: 1000, viewport: 100 }))
  const moved = plane({ top: 2000, bottom: 3000, viewport: 100 })
  const changes = await preparePinnedTops(glass, [moved], captured, frame, '17px')
  expect(changes.release).toEqual([])
  expect(changes.images.map(entry => [entry.slot, entry.key])).toEqual([
    ['plane:plane-1:top', 'backdrop:plane-1:top:2:front'],
  ])
  const image = changes.images[0].image!
  expect([image.width, image.height]).toEqual([4, top.bottom])
  const bytes = takeSourcePixels(image)!
  expect(bytes.byteLength).toBe(4 * 4 * top.bottom)
  // Row for row the top of the capture that is being replaced.
  expect([bytes[0], bytes[16], bytes[16 * 37]]).toEqual([0, 1, 37])
  expect(changes.next.get('plane-1')).toMatchObject({
    key: 'backdrop:plane-1:top:2',
    window: top,
    stale: false,
  })
  // The runtime is changed by the commit, not here.
  expect(glass.pinnedTops.size).toBe(0)
})

it('keeps a current pinned top, and lets it go when the list is at its top again or has left the screen', async () => {
  const glass = runtime(installed({ top: 2000, bottom: 3000, viewport: 100 }))
  const pinned: PinnedTop = {
    key: 'backdrop:plane-1:top:2',
    window: top,
    width: 4,
    resolution: 1,
    appearance: 'light',
    text: '17px',
    stale: false,
  }
  glass.pinnedTops.set('plane-1', pinned)
  const further = plane({ top: 3000, bottom: 4000, viewport: 100 })
  const kept = await preparePinnedTops(glass, [further], new Map(), frame, '17px')
  expect([kept.images, kept.release]).toEqual([[], []])
  expect(kept.next.get('plane-1')).toBe(pinned)
  const atTop = plane({ top: 0, bottom: 1000, viewport: 100 })
  const released = await preparePinnedTops(glass, [atTop], captured, frame, '17px')
  expect(released.release).toEqual(['plane:plane-1:top'])
  expect(released.next.size).toBe(0)
  const gone = await preparePinnedTops(glass, [], new Map(), frame, '17px')
  expect(gone.release).toEqual(['plane:plane-1:top'])
})

it('releases the slots a failed batch may have left in the renderer', async () => {
  const glass = runtime(undefined)
  glass.pinnedOrphans.add('plane-9')
  const changes = await preparePinnedTops(glass, [], new Map(), frame, '17px')
  expect(changes.release).toEqual(['plane:plane-9:top'])
})

it('does nothing for a renderer in a worker (its captures are bitmaps)', async () => {
  const glass = runtime(installed({ top: 0, bottom: 1000, viewport: 100 }))
  Object.assign(glass, { client: { documentOwned: false } })
  const moved = plane({ top: 2000, bottom: 3000, viewport: 100 })
  const changes = await preparePinnedTops(glass, [moved], captured, frame, '17px')
  expect([changes.images, changes.release, changes.next.size]).toEqual([[], [], 0])
})

it('never composites stale pinned pixels while a new capture is deferred', () => {
  const window = { top: 2000, bottom: 3000, viewport: 100 }
  const current = plane(window)
  const pin: PinnedTop = {
    key: 'old',
    window: top,
    width: 4,
    resolution: 1,
    appearance: 'light',
    text: '17px',
    stale: true,
  }
  const layers = backdropLayers(
    [current],
    new Map([['plane-1', installed(window)]]),
    1,
    new Map([['plane-1', pin]]),
  )
  expect(layers.map(layer => layer.id)).toEqual(['plane-1'])
  expect(layers[0].band).not.toBe(true)
})

it('drops only the pin damaged during preparation, including damage after its capture finishes', () => {
  const changedImage = pixelImage(4, 100)
  const otherImage = pixelImage(4, 100)
  const closeChanged = vi.spyOn(changedImage, 'close')
  const closeOther = vi.spyOn(otherImage, 'close')
  const runtime = {
    damageGenerations: new Map([
      ['plane-1', 1],
      ['plane-2', 0],
    ]),
  } as unknown as ProductionGlassRuntime
  const changes: PinnedTopChanges = {
    images: [
      { slot: 'plane:plane-1:top', key: 'changed', image: changedImage },
      { slot: 'plane:plane-2:top', key: 'other', image: otherImage },
    ],
    release: [],
    next: new Map([
      ['plane-1', {} as PinnedTop],
      ['plane-2', {} as PinnedTop],
    ]),
    generations: new Map([
      ['plane-1', 0],
      ['plane-2', 0],
    ]),
  }
  const opened = [changedImage, otherImage]

  discardChangedPinnedTops(runtime, changes, opened)
  expect([...changes.next.keys()]).toEqual(['plane-2'])
  expect(changes.images.map(source => source.slot)).toEqual(['plane:plane-2:top'])
  expect(changes.release).toEqual(['plane:plane-1:top'])
  expect(opened).toEqual([otherImage])
  expect(closeChanged).toHaveBeenCalledOnce()
  expect(closeOther).not.toHaveBeenCalled()
})

it('drops a pin cropped after damage from a plane captured before that damage', async () => {
  const glass = runtime(installed({ top: 0, bottom: 1000, viewport: 100 }))
  glass.damageGenerations = new Map([['plane-1', 1]])
  glass.damaged.add('plane-1')
  const moved = plane({ top: 2000, bottom: 3000, viewport: 100 })
  const changes = await preparePinnedTops(
    glass,
    [moved],
    captured,
    frame,
    '17px',
    new Map([['plane-1', 0]]),
  )
  const opened = changes.images.flatMap(source => (source.image ? [source.image] : []))
  discardChangedPinnedTops(glass, changes, opened)
  expect(changes.next.size).toBe(0)
  expect(changes.images).toEqual([])
  expect(changes.release).toEqual(['plane:plane-1:top'])
  expect(opened).toEqual([])
})
