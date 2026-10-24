import { expect, it, vi } from 'vitest'
import { WebGPURaster } from './raster.ts'

// A layer canvas is presented only when what it shows changes: WebKit blocks the worker for every
// canvas a frame draws to, in proportion to its pixels, so re-presenting an unchanged tab bar
// during a menu morph halved the morph's frame rate.

function fakeEncoder() {
  const pass = {
    setScissorRect: vi.fn(),
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    draw: vi.fn(),
    end: vi.fn(),
  }
  return {
    encoder: { beginRenderPass: () => pass } as unknown as GPUCommandEncoder,
    pass,
  }
}

/** One layer canvas and `count` surfaces on it (the first is the layer's root). */
function layer(count: number) {
  const canvas = { width: 1320, height: 633 }
  const acquire = vi.fn(() => ({ width: 1320, height: 633, createView: () => ({}) }))
  const context = { canvas, getCurrentTexture: acquire }
  const rasters = Array.from({ length: count }, () => {
    const raster = new WebGPURaster()
    Object.assign(raster, {
      canvas,
      context,
      device: { createBindGroup: () => ({}) },
      passes: { uniform: () => ({}), sampler: {}, draws: 0 },
      presentPipeline: { getBindGroupLayout: () => ({}) },
      targets: { result: { texture: { createView: () => ({}) }, width: 1320, height: 633 } },
      setup: { resolution: 3, width: 440, height: 211, spec: {} },
      presentRect: [0, 0, 1320, 633],
    })
    return raster
  })
  const present = () => WebGPURaster.presentLayer(fakeEncoder().encoder, rasters)
  return { rasters, acquire, present }
}
const set = (raster: WebGPURaster, fields: Record<string, unknown>) => Object.assign(raster, fields)
const revision = (raster: WebGPURaster) =>
  (raster as unknown as { resultRevision: number }).resultRevision

it('presents a layer once, then skips frames that would show exactly the same', () => {
  const { acquire, present } = layer(2)
  expect(present()).toBe(true)
  expect(acquire).toHaveBeenCalledTimes(1)
  expect(present()).toBe(false)
  expect(present()).toBe(false)
  // Skipped frames never touch the canvas: its current texture is not acquired.
  expect(acquire).toHaveBeenCalledTimes(1)
})

it('presents again when any surface of the layer re-encoded its result', () => {
  const { rasters, acquire, present } = layer(2)
  present()
  set(rasters[1], { resultRevision: revision(rasters[1]) + 1 })
  expect(present()).toBe(true)
  expect(present()).toBe(false)
  expect(acquire).toHaveBeenCalledTimes(2)
})

it('presents again when a surface moves, fades or leaves the layer', () => {
  const { rasters, acquire, present } = layer(2)
  present()
  set(rasters[0], { setup: { resolution: 3, width: 440, height: 211, spec: { opacity: 0.5 } } })
  expect(present()).toBe(true)
  set(rasters[1], { presentRect: [0, 30, 1320, 603] })
  expect(present()).toBe(true)
  // A surface that stops drawing (a lift overlay back at rest) must be cleared off the canvas.
  set(rasters[1], { resultEmpty: true })
  expect(present()).toBe(true)
  expect(present()).toBe(false)
  expect(acquire).toHaveBeenCalledTimes(4)
})

it('an all-empty layer is cleared once, then left alone', () => {
  const { rasters, acquire, present } = layer(2)
  for (const raster of rasters) set(raster, { resultEmpty: true })
  expect(present()).toBe(true)
  expect(present()).toBe(false)
  expect(acquire).toHaveBeenCalledTimes(1)
})

it('never skips after the canvas was covered, resized, hidden or drawn to by another path', () => {
  const { rasters, acquire, present } = layer(1)
  const [raster] = rasters
  present()
  raster.setCovered(false)
  expect(present()).toBe(true)
  raster.setCanvasViewport([0, 745, 440, 211])
  expect(present()).toBe(true)
  // A canvas resize clears it: the size is part of what was presented.
  ;(raster as unknown as { canvas: { height: number } }).canvas.height = 300
  expect(present()).toBe(true)
  expect(present()).toBe(false)
  expect(acquire).toHaveBeenCalledTimes(4)
})

it('leaves the occluder capsule empty: its place on the canvas rides in the present uniform', () => {
  // The tab bar carries the bottom accessory's capsule while the accessory moves between rows.
  // Native draws the accessory over the bar; Satin's accessory is in the page, below the bar's
  // layer canvas, so the bar's present leaves that capsule empty.
  const { rasters, present } = layer(1)
  const [raster] = rasters
  const uniforms: number[][] = []
  set(raster, {
    passes: {
      uniform: (values: Float32Array) => (uniforms.push([...values]), {}),
      sampler: {},
      draws: 0,
    },
    setup: {
      resolution: 3,
      width: 440,
      height: 211,
      spec: {
        frameX: 21,
        frameY: 4,
        occluder: { centerX: 100, centerY: 30, halfWidth: 50, halfHeight: 24, radius: 24 },
      },
    },
  })
  raster.setCanvasViewport([0, 745, 440, 211])
  present()
  // origin (layer at canvas offset), opacity and radius, then centre and half size: canvas pixels.
  expect(uniforms.at(-1)!.map(value => value + 0)).toEqual([
    0, -2235, 1320, 633, 1, 72, 0, 0, 363, -2133, 150, 72,
  ])
  // The capsule moves every frame of the run: a moved occluder is a different presentation.
  set(raster, {
    setup: {
      resolution: 3,
      width: 440,
      height: 211,
      spec: {
        frameX: 21,
        frameY: 4,
        occluder: { centerX: 100, centerY: 20, halfWidth: 50, halfHeight: 24, radius: 24 },
      },
    },
  })
  expect(present()).toBe(true)
  // Without an occluder the slots are zero (no capsule is cut).
  set(raster, {
    setup: { resolution: 3, width: 440, height: 211, spec: { frameX: 21, frameY: 4 } },
  })
  present()
  expect(uniforms.at(-1)!.slice(4)).toEqual([1, 0, 0, 0, 0, 0, 0, 0])
})

it('sizes shared storage from the presenting root and skips unchanged dimensions', () => {
  const { rasters, present } = layer(2)
  const canvas = (rasters[0] as unknown as { canvas: HTMLCanvasElement }).canvas
  let width = 300
  let height = 150
  const writes: number[][] = []
  Object.defineProperties(canvas, {
    width: {
      get: () => width,
      set: (next: number) => {
        width = next
        writes.push([width, height])
      },
    },
    height: {
      get: () => height,
      set: (next: number) => {
        height = next
        writes.push([width, height])
      },
    },
  })
  set(rasters[1], { setup: { resolution: 3, width: 120, height: 80, spec: {} } })
  present()
  expect([width, height]).toEqual([1320, 633])
  expect(writes).toHaveLength(2)
  present()
  expect(writes).toHaveLength(2)
  set(rasters[0], { setup: { resolution: 3, width: 440, height: 240, spec: {} } })
  present()
  expect([width, height]).toEqual([1320, 720])
  expect(writes).toHaveLength(3)
})

it('does not mutate presentation storage while encoding a region result', () => {
  const { rasters } = layer(2)
  const canvas = (rasters[0] as unknown as { canvas: HTMLCanvasElement }).canvas
  set(rasters[1], {
    setup: { resolution: 3, width: 120, height: 80, spec: {} },
    // Stop before GPU material passes: this test owns the shared-storage boundary.
    sampleRectangle: () => {
      throw Error('material encoding boundary')
    },
  })
  expect(() => rasters[1].encodeResult(fakeEncoder().encoder, 0)).toThrow(
    'material encoding boundary',
  )
  expect([canvas.width, canvas.height]).toEqual([1320, 633])
})
