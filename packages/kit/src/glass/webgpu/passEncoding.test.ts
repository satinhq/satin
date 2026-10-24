import { expect, it, vi } from 'vitest'
import { clampScissor, encodePass } from './passes.ts'
import { WebGPURaster } from './raster.ts'
import { encodeMaterial } from './rasterMaterial.ts'
import type { RasterSetup } from '../worker/protocol.ts'
import type { Passes, Target } from './passes.ts'
import type { ResultLayout } from './rasterUniforms.ts'
/** WebKit-like encoder: an out-of-bounds scissor invalidates the pass, and ending an
 * invalid (or never ending a) pass leaves the command encoder locked, so finish() fails. */
function webkitEncoder(width: number, height: number) {
  let state: 'open' | 'locked' = 'open',
    invalid = false
  const pass = {
    setScissorRect: (x: number, y: number, w: number, h: number) => {
      if (x < 0 || y < 0 || w < 0 || h < 0 || x + w > width || y + h > height) invalid = true
    },
    setViewport: vi.fn(),
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    draw: vi.fn(),
    end: () => {
      if (!invalid) state = 'open'
    },
  }
  return {
    beginRenderPass: () => {
      state = 'locked'
      invalid = false
      return pass
    },
    finish: () => {
      if (state !== 'open')
        throw Error(
          `GPUCommandEncoder.finish: encoder state is '${state === 'locked' ? 'Locked' : state}', expected 'Open'`,
        )
      return {}
    },
  } as unknown as GPUCommandEncoder
}
it('clamps scissors inside the attachment, including surfaces wholly outside it', () => {
  expect(clampScissor([10.4, 20.6, 100, 50], 1320, 2868)).toEqual([10, 20, 101, 51])
  expect(clampScissor([-5, -5, 20, 20], 100, 100)).toEqual([0, 0, 15, 15])
  // Dock sample rect (y 2600) after the keyboard shrinks the layer to 1623 px tall.
  expect(clampScissor([63, 2600, 1194, 306], 1320, 1623)).toEqual([63, 1623, 1194, 0])
  expect(clampScissor([1400, 10, 90, 90], 1320, 2868)).toEqual([1320, 10, 0, 90])
})
it('ends a pass even when encoding throws, so the encoder is never left locked', () => {
  const encoder = webkitEncoder(100, 100)
  expect(() =>
    encodePass(encoder, { colorAttachments: [] }, () => {
      throw Error('lost texture')
    }),
  ).toThrow('lost texture')
  expect(() => encoder.finish()).not.toThrow()
})
it('presents a surface whose envelope moved or grew past a resized layer without locking the encoder', () => {
  const raster = new WebGPURaster(),
    encoder = webkitEncoder(1320, 1623)
  Object.assign(raster, {
    device: { createBindGroup: () => ({}) },
    passes: { uniform: () => ({}), sampler: {}, draws: 0 },
  })
  const pipeline = { getBindGroupLayout: () => ({}) } as unknown as GPURenderPipeline
  const custom = (raster as unknown as { custom: (...a: unknown[]) => void }).custom.bind(raster)
  // Keyboard opened: canvas now 1623 px tall; the dock's sample rect still starts at 2600.
  custom(encoder, pipeline, {}, [0, 0, 0, 0], [], true, [63, 2600, 1194, 306], [1320, 1623])
  // Envelope grew mid-frame (held button 160 -> 164 pt) past the right edge of the presenter.
  custom(encoder, pipeline, {}, [0, 0, 0, 0], [], true, [1200, 40, 500, 500], [1320, 1623])
  expect(() => encoder.finish()).not.toThrow()
  // The pre-fix arithmetic produced exactly the rejected rectangle.
  const unclamped = webkitEncoder(1320, 1623)
  const pass = unclamped.beginRenderPass({ colorAttachments: [] })
  pass.setScissorRect(63, 2600, 0, 0)
  pass.end()
  expect(() => unclamped.finish()).toThrow("encoder state is 'Locked'")
})
it('summarizes worker frames per interaction kind after the loop has been quiet', async () => {
  vi.useFakeTimers()
  const { FrameProbe } = await import('./frameProbe.ts')
  const posted: unknown[][] = [],
    probe = new FrameProbe(s => posted.push(s))
  const device = {
    features: new Set(),
    createCommandEncoder: () => ({ finish: () => ({}) }),
    queue: { submit: vi.fn(), onSubmittedWorkDone: () => new Promise(() => {}) },
  } as unknown as GPUDevice
  probe.useDevice(device)
  for (let i = 0; i < 5; i++) probe.frame('drag', i ? 16 : null, i === 0, () => {})
  probe.flush()
  probe.frame('scroll', null, true, () => {})
  probe.flush()
  vi.advanceTimersByTime(299)
  expect(posted).toHaveLength(0)
  vi.advanceTimersByTime(1)
  expect(posted).toHaveLength(1)
  const [drag, scroll] = posted[0] as {
    kind: string
    frames: number
    timestampQuery: boolean
    intervals: { p50: number }
  }[]
  expect([drag.kind, drag.frames, drag.timestampQuery, drag.intervals.p50]).toEqual([
    'drag',
    5,
    false,
    16,
  ])
  expect(scroll.kind).toBe('scroll')
  vi.useRealTimers()
})
it.each([false, true])('preserves material ping-pong with member highlight %s', memberHighlight => {
  const raster = new WebGPURaster()
  const target = () => ({ width: 140, height: 100, texture: { createView: () => ({}) } })
  const targets = {
    material: target(),
    tinted: target(),
    result: target(),
    source: target(),
    pyramid: target(),
    front: target(),
    rear: target(),
  }
  const original = targets.material,
    tinted = targets.tinted
  const kernel = vi.fn(),
    copy = vi.fn(),
    custom = vi.fn()
  Object.assign(raster, {
    owner: { subscribe: () => () => {} },
    canvas: { width: 140, height: 100 },
    targets,
    custom,
    canvasSize: () => [140, 100],
    passes: { kernel, copy },
    graph: {
      matches: (t: unknown) => t !== targets.result,
      mark: vi.fn(),
      publish: vi.fn(),
      unpublish: vi.fn(),
    },
    setup: {
      width: 140,
      height: 100,
      resolution: 1,
      appearance: 'light',
      spec: {
        variant: 'regular',
        materialProfile: 'bar',
        sampleWidth: 140,
        sampleHeight: 100,
        sampleInsetX: 20,
        sampleInsetY: 20,
        frameX: 20,
        frameY: 20,
        tint: [0.2, 0.3, 0.4, 0.5],
        memberHighlight: memberHighlight ? { member: 1, amount: 0.4 } : undefined,
        shape: {
          first: { centerX: 30, centerY: 30, halfWidth: 20, halfHeight: 20, radius: 20 },
          members: [
            { centerX: 30, centerY: 30, halfWidth: 20, halfHeight: 20, radius: 20 },
            { centerX: 70, centerY: 30, halfWidth: 24, halfHeight: 24, radius: 24 },
          ],
          blendRadius: 20,
        },
      },
    },
  })
  const encode = (
    raster as unknown as { encodeResult: (e: GPUCommandEncoder, x: number) => boolean }
  ).encodeResult.bind(raster)
  expect(encode({} as GPUCommandEncoder, 0)).toBe(true)
  expect(kernel.mock.calls[1][2]).toBe(tinted)
  const firstOutput = memberHighlight ? original : tinted
  expect(targets.material).toBe(firstOutput)
  expect(custom.mock.calls.at(-1)?.[4]).toEqual([firstOutput])
  if (memberHighlight) {
    const tints = kernel.mock.calls.filter(call => call[1] === 'tint')
    expect(tints).toHaveLength(2)
    expect(tints[0]![3].uMorphParams[0]).toBe(2)
    expect(tints[1]![3].uMorphParams).toEqual([1, 0, 0, 0])
    expect(tints[1]![3].uShape).toEqual([90, 50, 24, 24])
    expect(tints[1]![3].uTint).toEqual([1, 1, 1, 0.4])
  }
  expect(copy).not.toHaveBeenCalled()
  expect(encode({} as GPUCommandEncoder, 1)).toBe(true)
  expect(targets.material).toBe(original)
  expect(custom.mock.calls.at(-1)?.[4]).toEqual([original])
  expect(copy).not.toHaveBeenCalled()
})

// Keep allocation real: pre-populating every target hides missing material storage.
it('renders a same-size toolbar material change and its retained-source reinstall', () => {
  const raster = new WebGPURaster()
  const image = { width: 140, height: 100 } as ImageBitmap
  const lease = { key: 'toolbar', value: image, release() {} }
  const shape = { centerX: 50, centerY: 30, halfWidth: 40, halfHeight: 20, radius: 20 }
  const setup: RasterSetup = {
    width: 140,
    height: 100,
    resolution: 1,
    appearance: 'dark',
    spec: {
      variant: 'regular',
      materialProfile: 'chrome',
      id: 'region:toolbar',
      frameWidth: 100,
      frameHeight: 60,
      radius: 20,
      materialMix: 1,
      shaderAperture: true,
      sampleWidth: 140,
      sampleHeight: 100,
      sampleInsetX: 20,
      sampleInsetY: 20,
      frameX: 20,
      frameY: 20,
      shape: { first: shape, blendRadius: 0, rimAlpha: 1, whiteMix: 0 },
    },
  }
  const submitted: string[] = []
  const passes = {
    kernel(_encoder: unknown, name: string, output: Target) {
      // The real GPU pass dereferences this attachment before it can submit.
      output.texture.createView()
      submitted.push(name)
    },
  } as unknown as Passes
  Object.assign(raster, {
    device: { pushErrorScope() {}, popErrorScope: () => Promise.resolve(null) },
    graph: {
      image: () => lease,
      target: (_name: string, width: number, height: number) => ({
        value: { width, height, texture: { createView: () => ({}) } },
        release() {},
      }),
      upload() {},
    },
    draw() {
      const current = Reflect.get(raster, 'setup') as RasterSetup
      encodeMaterial(
        {} as GPUCommandEncoder,
        passes,
        Reflect.get(raster, 'targets'),
        {
          ...current,
          sampleWidth: current.spec.sampleWidth,
          sampleHeight: current.spec.sampleHeight,
        } as ResultLayout,
        {},
      )
    },
  })
  raster.installRetained(setup, lease, lease)
  const pressed = { ...setup.spec, tint: [1, 1, 1, 0.12] as const }
  raster.updateSpec(pressed)
  expect(() => raster.draw(0)).not.toThrow()
  expect(submitted.at(-1)).toBe('tint')
  // The old retry compared against the already-mutated spec and kept the missing target.
  expect(() => raster.installRetained({ ...setup, spec: pressed }, lease, lease)).not.toThrow()
  raster.updateSpec(setup.spec)
  raster.updateSpec({
    ...pressed,
    tint: undefined,
    shape: { ...pressed.shape, members: [shape] },
    memberHighlight: { member: 0, amount: 0.4 },
  })
  expect(() => raster.draw(0)).not.toThrow()
  expect(submitted.at(-1)).toBe('tint')
})
