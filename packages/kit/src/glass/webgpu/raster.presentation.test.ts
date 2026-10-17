import { expect, it, vi } from 'vitest'
import { WebGPURaster } from './raster.ts'

function fixture() {
  const uniforms: number[][] = []
  const pass = {
    setPipeline() {},
    setScissorRect() {},
    draw() {},
    end() {},
    setBindGroup(_index: number, group: { values: number[] }) {
      uniforms.push(group.values)
    },
  }
  const encoder = { beginRenderPass: () => pass, finish: () => ({}) }
  const device = {
    createCommandEncoder: () => encoder,
    createBindGroup: (descriptor: { entries: { resource: { buffer: number[] } }[] }) => ({
      values: Array.from(descriptor.entries[0].resource.buffer),
    }),
    pushErrorScope() {},
    popErrorScope: () => Promise.resolve(null),
    queue: { submit() {} },
  }
  const make = (width: number, height: number) => {
    const canvas = { width, height }
    const texture = { width, height, createView: () => ({}) }
    const context = { canvas, getCurrentTexture: vi.fn(() => texture) }
    const raster = new WebGPURaster()
    Object.assign(raster, {
      canvas,
      context,
      device,
      setup: { width: width / 2, height: height / 2, resolution: 2, spec: { frameY: 873 } },
      targets: { result: { texture, width, height } },
      passes: { uniform: (values: number[]) => values, submitted() {}, draws: 0, sampler: {} },
      presentPipeline: { getBindGroupLayout: () => ({}) },
      encodeResult: () => true,
      clear: vi.fn(),
    })
    return { raster, context }
  }
  const root = make(880, 422),
    accessory = make(1030, 314)
  root.raster.setCanvasViewport([0, 745, 440, 211])
  return { root, accessory, encoder: encoder as unknown as GPUCommandEncoder, uniforms }
}

it('stores a shared morph once and places full-resolution accessory pixels in viewport coordinates', () => {
  const { root, accessory, encoder, uniforms } = fixture()
  accessory.raster.joinPresentation(root.raster, { x: -2, y: 794 })
  root.raster.withSharedPresentation(() => {
    accessory.raster.draw(0)
    expect(root.context.getCurrentTexture).not.toHaveBeenCalled()
    WebGPURaster.presentLayer(encoder, [root.raster])
  })
  expect(accessory.context.getCurrentTexture).not.toHaveBeenCalled()
  expect(root.context.getCurrentTexture).toHaveBeenCalledTimes(1)
  expect(uniforms).toHaveLength(2)
  expect(uniforms[1].slice(0, 4)).toEqual([-4, 0, 1030, 314])
  expect(root.context.canvas.height).toBe(324)
  // Once DOM ink returns, the accessory leaves this stacking slot.
  accessory.raster.leavePresentation()
  expect(root.context.canvas.height).toBe(422)
  WebGPURaster.presentLayer(encoder, [root.raster])
  expect(uniforms).toHaveLength(3)
})

it('releases frame collection after an encoding error so later standalone draws can present', () => {
  const { root, accessory } = fixture()
  accessory.raster.joinPresentation(root.raster, { x: -2, y: 794 })
  expect(() =>
    root.raster.withSharedPresentation(() => {
      throw Error('encode failed')
    }),
  ).toThrow('encode failed')
  accessory.raster.draw(0)
  expect(root.context.getCurrentTexture).toHaveBeenCalledTimes(1)
})
