import { expect, it } from 'vitest'
import { commitPlaneSet, surfaceInstalls } from './productionInstalls.ts'
import type { ProductionGlassRuntime } from './production.ts'
import { visiblePlaneSetKey, type MaterialContext, type Plane } from './productionPlanes.ts'
import { ResidentPlanes } from './residentPlanes.ts'
import { releaseCaptureCanvases } from './captureRelease.ts'

// A plane that leaves the plane set gives up its main-thread capture canvas. The commit only
// collects it: the caller releases it after the batch is posted (and on a failure), because the
// release is a synchronous GPU-process round trip.

const canvas = (width: number, height: number) => ({ width, height }) as HTMLCanvasElement
const plane = (id: string): Plane =>
  ({
    id,
    host: { isConnected: true } as HTMLElement,
    origin: { x: 0, y: 0 },
    clip: [0, 0, 440, 956],
    fill: [1, 1, 1, 1],
    width: 440,
    height: 956,
    signature: id,
    measured: { layout: { nodes: [], contentHeight: 956 }, top: 0, left: 0 },
  }) as unknown as Plane

it('collects the capture canvas of a plane that left the set without releasing it', () => {
  const merge = canvas(1320, 2868)
  const scroll = canvas(1320, 15018)
  const runtime = {
    planes: new Map([
      [
        'plane-1',
        {
          signature: 'plane-1',
          key: 'backdrop:plane-1:1',
          revision: 1,
          host: { isConnected: true },
          appearance: 'light',
          text: '17px',
        },
      ],
    ]),
    planeCanvases: new Map([
      ['plane-1', { canvas: merge }],
      ['plane-2', { canvas: scroll }],
    ]),
    planeBytes: new Map([['plane-1', 15e6]]),
    damaged: new Set<string>(),
    resident: new ResidentPlanes<MaterialContext>(80e6),
    captureRevision: 1,
    contextGeometry: '',
  } as unknown as ProductionGlassRuntime
  const next = plane('plane-2')
  const committed = commitPlaneSet(runtime, {
    planes: [next],
    contentPlane: next,
    captures: new Map([['plane-2', { bitmap: {} as ImageBitmap, signature: 'plane-2' }]]),
    reused: new Set(),
    capture: undefined,
    contextKey: 'context',
    geometry: { width: 440, height: 956 } as never,
    resolution: 3,
    appearance: 'light',
    text: '17px',
  })
  expect(committed.removed).toEqual(['plane-1'])
  expect(committed.droppedCanvases).toEqual([merge])
  expect(runtime.planeCanvases.has('plane-1')).toBe(false)
  // Still intact: nothing was released before the batch could be posted.
  expect([merge.width, merge.height]).toEqual([1320, 2868])
  // The plane that stays keeps its canvas.
  expect(runtime.planeCanvases.get('plane-2')?.canvas).toBe(scroll)

  // The caller's release drains the list: the normal path and a failure path cannot both release.
  releaseCaptureCanvases(committed.droppedCanvases)
  expect([merge.width, merge.height]).toEqual([0, 0])
  expect(committed.droppedCanvases).toEqual([])
  merge.width = 7
  releaseCaptureCanvases(committed.droppedCanvases)
  expect(merge.width).toBe(7)
})

it('installs an in-flight capture without clearing newer content damage', () => {
  const capturedPlane = plane('plane-1')
  const runtime = {
    planes: new Map(),
    damaged: new Set(['plane-1']),
    damageGenerations: new Map([['plane-1', 10]]),
    resident: new ResidentPlanes<MaterialContext>(80e6),
    captureRevision: 0,
    planeBytes: new Map(),
    planeCanvases: new Map(),
    prepareAgain: false,
  } as unknown as ProductionGlassRuntime
  const prepared = {
    planes: [capturedPlane],
    contentPlane: capturedPlane,
    captures: new Map([['plane-1', { signature: 'captured', bitmap: {} as ImageBitmap }]]),
    reused: new Set<string>(),
    capture: undefined,
    contextKey: 'context',
    geometry: { width: 440, height: 956 },
    resolution: 1,
    appearance: 'light' as const,
    text: 'text',
    damageGenerations: new Map([['plane-1', 0]]),
  } as unknown as Parameters<typeof commitPlaneSet>[1]

  commitPlaneSet(runtime, prepared)
  expect(runtime.planes.get('plane-1')?.signature).toBe('captured')
  expect(runtime.damaged.has('plane-1')).toBe(true)
  expect(runtime.prepareAgain).toBe(true)

  runtime.prepareAgain = false
  prepared.damageGenerations = new Map(runtime.damageGenerations)
  commitPlaneSet(runtime, prepared)
  expect(runtime.damaged.has('plane-1')).toBe(false)
  expect(runtime.prepareAgain).toBe(false)
})

// The scroller offset belongs to the source transaction, not a later message.
it('carries the current source rows into dock and lift installs on navigation settlement', () => {
  const runtime = {
    glyphs: new Map([['dock', { key: 'glyphs' }]]),
    regionIds: new Map(),
    specs: new Map(),
    liftAttached: true,
    nextTransport: () => 1,
  } as unknown as ProductionGlassRuntime
  const installs = surfaceInstalls(
    runtime,
    [{ id: 'dock' }] as unknown as Parameters<typeof surfaceInstalls>[1],
    {
      menuTrack: undefined,
      barTrack: undefined,
      now: 0,
      appearance: 'dark',
      sourceKey: 'scrolled-library',
      contentLayer: 'library',
      sourceScrollY: 1240,
      trigger: undefined,
      geometry: { width: 440, height: 956 },
      resolution: 1,
    } as Parameters<typeof surfaceInstalls>[2],
  )
  expect(installs).toHaveLength(2)
  for (const install of installs) {
    expect(install.type === 'source' || install.type === 'layer-source').toBe(true)
    expect(Reflect.get(install, 'setup').sourceScrollY).toBe(1240)
  }
})

it.each(['null', JSON.stringify({ owner: 'menu', alpha: 0.2 })])(
  'commits the same content and overlay identity used to reuse material context (%s)',
  contextOverlayKey => {
    const source = plane('plane-1')
    const runtime = {
      planes: new Map(),
      damaged: new Set(),
      resident: new ResidentPlanes<MaterialContext>(80e6),
      captureRevision: 0,
      planeBytes: new Map(),
      planeCanvases: new Map(),
    } as unknown as ProductionGlassRuntime
    const geometry = { width: 440, height: 956 } as never
    commitPlaneSet(runtime, {
      planes: [source],
      contentPlane: source,
      captures: new Map([['plane-1', { bitmap: {} as ImageBitmap, signature: source.signature }]]),
      reused: new Set(),
      capture: { context: {} as MaterialContext },
      contextKey: 'context',
      contextOverlayKey,
      geometry,
      resolution: 3,
      appearance: 'light',
      text: '17px',
    })
    const key = () =>
      visiblePlaneSetKey([source], runtime.planes, source, geometry, contextOverlayKey)
    expect(runtime.contextGeometry).toBe(key())
    // Presentation travel reuses source pixels; it does not change their identity.
    source.origin = { x: 0, y: 120 }
    source.clip = [0, 120, 440, 600]
    expect(runtime.contextGeometry).toBe(key())
    // A new source or overlay must still force a fresh material snapshot.
    expect(runtime.contextGeometry).not.toBe(
      visiblePlaneSetKey(
        [source],
        runtime.planes,
        source,
        geometry,
        contextOverlayKey + ':changed',
      ),
    )
    const installed = runtime.planes.get(source.id)!
    const originalKey = installed.key
    installed.key += ':changed'
    expect(runtime.contextGeometry).not.toBe(key())
    installed.key = originalKey
    source.hidden = true
    expect(runtime.contextGeometry).not.toBe(key())
  },
)
