import { renderPipeline } from './errors.ts'
import { shaderModule } from './errors.ts'
/// <reference types="@webgpu/types" />
import { shaders as generatedShaders } from './shaders.ts'
import { contextComposite } from './contextComposite.ts'
import { presentationDiffusion, sheetDiffusion } from './presentationDiffusion.ts'
const shaders = { ...generatedShaders, contextComposite, presentationDiffusion, sheetDiffusion }
export type Values = Record<string, number | readonly number[]>
export type Target = { texture: GPUTexture; width: number; height: number; levels: number }
export function assertViewport(width: number, height: number, viewport: readonly number[]) {
  const [x, y, w, h] = viewport
  if (
    ![x, y, w, h].every(Number.isFinite) ||
    x < 0 ||
    y < 0 ||
    w < 0 ||
    h < 0 ||
    x + w > width ||
    y + h > height
  )
    throw Error(
      `WebGPU viewport validation failed: [${viewport.join(',')}] exceeds ${width}x${height} attachment`,
    )
}
const vertex = `struct Vertex { @builtin(position) position: vec4f, @location(0) uv: vec2f, @location(1) filterCoord: vec2f }
@vertex fn vertex(@builtin(vertex_index) i: u32) -> Vertex {
 let p = array<vec2f,6>(vec2f(0,0),vec2f(1,0),vec2f(1,1),vec2f(0,0),vec2f(1,1),vec2f(0,1))[i];
 return Vertex(vec4f(p.x*2-1,1-p.y*2,0,1),p,p);
}`
const copyVertex = vertex.replace(
  'array<vec2f,6>(vec2f(0,0),vec2f(1,0),vec2f(1,1),vec2f(0,0),vec2f(1,1),vec2f(0,1))',
  'array<vec2f,3>(vec2f(0,0),vec2f(2,0),vec2f(0,2))',
)
const copy = `${copyVertex}
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var linearSampler: sampler;
@fragment fn fragment(v: Vertex) -> @location(0) vec4f { return textureSampleLevel(source,linearSampler,v.uv,0); }`

/** Scissor [x,y,w,h] snapped outward to whole pixels and clamped inside the attachment.
 * WebGPU rejects a scissor that extends past its attachment; in WebKit the rejected pass
 * leaves its command encoder locked, so the whole frame fails at finish(). A surface
 * wholly outside the attachment (moved off-screen, or a shrunken viewport) yields an
 * empty rectangle at the attachment edge, never an invalid one. */
export function clampScissor(
  rect: readonly number[],
  width: number,
  height: number,
): [number, number, number, number] {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
  const x = clamp(Math.floor(rect[0]), 0, width),
    y = clamp(Math.floor(rect[1]), 0, height)
  const right = clamp(Math.ceil(rect[0] + rect[2]), x, width),
    bottom = clamp(Math.ceil(rect[1] + rect[3]), y, height)
  return [x, y, right - x, bottom - y]
}
/** Default whole-texture views, created once per texture instead of per pass per frame. */
const views = new WeakMap<GPUTexture, GPUTextureView>()
export function viewOf(texture: GPUTexture) {
  let view = views.get(texture)
  if (!view) {
    view = texture.createView()
    views.set(texture, view)
  }
  return view
}
/** Per-pass GPU timing for the frame probe: while `set` is armed, each pass writes its
 * begin/end timestamps under a label (device must have `timestamp-query`). */
export const passTimer: { set?: GPUQuerySet; labels: string[]; capacity: number } = {
  labels: [],
  capacity: 0,
}
/** Every pass is ended even when encoding throws: an open pass locks its encoder. */
export function encodePass(
  encoder: GPUCommandEncoder,
  descriptor: GPURenderPassDescriptor,
  body: (pass: GPURenderPassEncoder) => void,
  label = 'pass',
) {
  if (
    passTimer.set &&
    !descriptor.timestampWrites &&
    passTimer.labels.length < passTimer.capacity
  ) {
    const i = passTimer.labels.length
    passTimer.labels.push(label)
    descriptor = {
      ...descriptor,
      timestampWrites: {
        querySet: passTimer.set,
        beginningOfPassWriteIndex: 2 * i,
        endOfPassWriteIndex: 2 * i + 1,
      },
    }
  }
  const pass = encoder.beginRenderPass(descriptor)
  try {
    body(pass)
  } finally {
    pass.end()
  }
}
const mipCompute = `@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var linearSampler: sampler;
@group(0) @binding(2) var destination: texture_storage_2d<rgba8unorm, write>;
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) id: vec3u) {
 let size=textureDimensions(destination);
 if(id.x>=size.x||id.y>=size.y){return;}
 textureStore(destination,id.xy,textureSampleLevel(source,linearSampler,(vec2f(id.xy)+.5)/vec2f(size),0));
}`
const deviceMips = new WeakMap<GPUDevice, GPUComputePipeline>()
/** Cached per-level views of a mip chain (sampled and storage). */
const levelCache = new WeakMap<
  GPUTexture,
  { sampled: GPUTextureView; storage: GPUTextureView; width: number; height: number }[]
>()
function levelViews(target: Target) {
  let levels = levelCache.get(target.texture)
  if (!levels) {
    levels = Array.from({ length: target.levels }, (_, i) => ({
      sampled: target.texture.createView({ baseMipLevel: i, mipLevelCount: 1 }),
      storage: target.texture.createView({ baseMipLevel: i, mipLevelCount: 1 }),
      width: Math.max(1, target.width >> i),
      height: Math.max(1, target.height >> i),
    }))
    levelCache.set(target.texture, levels)
  }
  return levels
}
/** Compute passes follow the same rules: always ended, optionally timed. */
export function encodeComputePass(
  encoder: GPUCommandEncoder,
  body: (pass: GPUComputePassEncoder) => void,
  label = 'compute',
) {
  let descriptor: GPUComputePassDescriptor = {}
  if (passTimer.set && passTimer.labels.length < passTimer.capacity) {
    const i = passTimer.labels.length
    passTimer.labels.push(label)
    descriptor = {
      timestampWrites: {
        querySet: passTimer.set,
        beginningOfPassWriteIndex: 2 * i,
        endOfPassWriteIndex: 2 * i + 1,
      },
    }
  }
  const pass = encoder.beginComputePass(descriptor)
  try {
    body(pass)
  } finally {
    pass.end()
  }
}
const deviceKernels = new WeakMap<GPUDevice, Map<string, { pipeline: GPURenderPipeline }>>()
function kernelDescriptor(
  device: GPUDevice,
  name: keyof typeof shaders,
  blend: boolean,
): GPURenderPipelineDescriptor {
  const shader = shaders[name]
  const entries: GPUBindGroupLayoutEntry[] = [
    {
      binding: 0,
      visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX,
      buffer: { type: 'uniform' },
    },
    { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
    ...shader.textures.map((_, i) => ({
      binding: i + 2,
      visibility: GPUShaderStage.FRAGMENT,
      texture: { sampleType: 'float' as const },
    })),
  ]
  const layout = device.createBindGroupLayout({ entries })
  return {
    label: name,
    layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
    vertex: {
      module: shaderModule(device, {
        label: name + ':vertex',
        code:
          `struct VParams { slots:array<vec4f,${shader.uniforms.length + 3}> } @group(0) @binding(0) var<uniform> vp:VParams;\n` +
          vertex.replace(
            'return Vertex(vec4f(p.x*2-1,1-p.y*2,0,1),p,p);',
            `var position=vec4f(p.x*2-1,1-p.y*2,0,1); if(vp.slots[${shader.uniforms.length + 2}].w>0){let frame=vp.slots[${shader.uniforms.length + 1}];let output=vp.slots[${shader.uniforms.length + 2}];let point=p*frame.zw+frame.xy;position=vec4f(point.x*(2/output.x)-1,-(point.y*(2/output.y)-1),0,1);}return Vertex(position,p*vp.slots[${shader.uniforms.length}].xy,p*vp.slots[${shader.uniforms.length}].zw);`,
          ),
      }),
      entryPoint: 'vertex',
    },
    fragment: {
      module: shaderModule(device, { label: name + ':fragment', code: shader.wgsl }),
      entryPoint: 'main',
      targets: [
        {
          format: 'rgba8unorm',
          blend: blend
            ? {
                color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
                alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
              }
            : undefined,
        },
      ],
    },
  }
}
/** Compiles the requested material kernels asynchronously (all kernels by default), so a surface's
 * first use (an alert's or sheet's presentation material) never compiles on the GPU queue in the
 * frames of its entrance. A kernel already created synchronously keeps its pipeline. */
export async function prewarmKernels(
  device: GPUDevice,
  names: readonly (keyof typeof shaders)[] = Object.keys(shaders) as (keyof typeof shaders)[],
) {
  const kernels = deviceKernels.get(device) ?? new Map<string, { pipeline: GPURenderPipeline }>()
  deviceKernels.set(device, kernels)
  const failures: string[] = []
  for (const name of names)
    for (const blend of [false, true]) {
      const key = name + blend
      if (kernels.has(key)) continue
      try {
        const pipeline = await device.createRenderPipelineAsync(
          kernelDescriptor(device, name, blend),
        )
        if (!kernels.has(key)) kernels.set(key, { pipeline })
      } catch (error) {
        failures.push(
          `${name}${blend ? ' (blend)' : ''}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
  // Loud: a kernel that cannot compile is a renderer failure, reported now, not at first use.
  if (failures.length)
    throw Error(`Glass kernel pipelines failed to compile: ${failures.join('; ')}`)
}
const deviceCopies = new WeakMap<GPUDevice, Map<string, GPURenderPipeline>>()
/** Explicit graph with RGBA8 intermediates, matching reference's quantization boundaries. */
export class Passes {
  readonly sampler: GPUSampler
  private kernels = new Map<string, { pipeline: GPURenderPipeline }>()
  private copyPipelines = new Map<string, GPURenderPipeline>()
  draws = 0
  readonly device: GPUDevice
  constructor(device: GPUDevice) {
    this.device = device
    this.kernels = deviceKernels.get(device) ?? new Map()
    deviceKernels.set(device, this.kernels)
    this.copyPipelines = deviceCopies.get(device) ?? new Map()
    deviceCopies.set(device, this.copyPipelines)
    this.sampler = device.createSampler({
      minFilter: 'linear',
      magFilter: 'linear',
      mipmapFilter: 'linear',
    })
    this.mipPipeline = deviceMips.get(device)
  }
  kernel(
    encoder: GPUCommandEncoder,
    name: keyof typeof shaders,
    output: Target,
    values: Values,
    textures: Record<string, Target>,
    blend = false,
    scissor?: readonly number[],
  ) {
    const viewport = values.__viewport as readonly number[] | undefined
    if (viewport) assertViewport(output.width, output.height, [0, 0, ...viewport])
    const shader = shaders[name]
    const key = name + blend
    let kernel = this.kernels.get(key)
    if (!kernel) {
      kernel = { pipeline: renderPipeline(this.device, kernelDescriptor(this.device, name, blend)) }
      this.kernels.set(key, kernel)
    }
    const packed = new Float32Array((shader.uniforms.length + 3) * 4)
    shader.uniforms.forEach((key, i) => {
      const value = values[key]
      if (value === undefined) throw Error(`Missing ${name}.${key}`)
      packed.set(typeof value === 'number' ? [value] : value, i * 4)
    })
    packed.set((values.__uvScale ?? [1, 1]) as readonly number[], shader.uniforms.length * 4)
    packed.set(
      (values.__filterScale ?? [1, 1]) as readonly number[],
      shader.uniforms.length * 4 + 2,
    )
    if (values.__outputFrame) {
      packed.set(values.__outputFrame as readonly number[], (shader.uniforms.length + 1) * 4)
      packed.set(values.__outputTexture as readonly number[], (shader.uniforms.length + 2) * 4)
    }
    const buffer = this.uniform(packed)
    const group = this.device.createBindGroup({
      layout: kernel.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer } },
        { binding: 1, resource: this.sampler },
        ...shader.textures.map((key, i) => ({
          binding: i + 2,
          resource: viewOf(textures[key].texture),
        })),
      ],
    })
    encodePass(
      encoder,
      {
        colorAttachments: [
          { view: viewOf(output.texture), loadOp: blend ? 'load' : 'clear', storeOp: 'store' },
        ],
      },
      pass => {
        if (viewport) {
          pass.setViewport(0, 0, viewport[0], viewport[1], 0, 1)
          pass.setScissorRect(
            ...clampScissor(
              [0, 0, viewport[0] - 0.5, viewport[1] - 0.5],
              output.width,
              output.height,
            ),
          )
        }
        if (scissor) pass.setScissorRect(...clampScissor(scissor, output.width, output.height))
        pass.setPipeline(kernel.pipeline)
        pass.setBindGroup(0, group)
        pass.draw(6)
      },
      name,
    )
    this.draws++
  }
  clear(encoder: GPUCommandEncoder, output: Target) {
    encodePass(
      encoder,
      {
        colorAttachments: [
          {
            view: viewOf(output.texture),
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: [0, 0, 0, 0],
          },
        ],
      },
      () => {},
      'clear',
    )
  }
  private buffers: GPUBuffer[] = []
  private cursor = 0
  uniform(values: Float32Array<ArrayBuffer>) {
    const i = this.cursor++
    let buffer = this.buffers[i]
    if (!buffer || buffer.size < values.byteLength) {
      buffer?.destroy()
      buffer = this.device.createBuffer({
        size: Math.ceil(values.byteLength / 256) * 256,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      })
      this.buffers[i] = buffer
    }
    this.device.queue.writeBuffer(buffer, 0, values)
    return buffer
  }
  // Different passes in one submission have different slots. Reusing slots on
  // the next submission is safe because queue writes retain submission order.
  submitted() {
    this.cursor = 0
  }
  copy(
    encoder: GPUCommandEncoder,
    source: GPUTextureView,
    target: GPUTextureView,
    format: GPUTextureFormat = 'rgba8unorm',
    blend = false,
    load = false,
    viewport?: readonly number[],
  ) {
    const key = format + blend
    let pipeline = this.copyPipelines.get(key)
    if (!pipeline) {
      const module = shaderModule(this.device, { label: 'copy', code: copy })
      pipeline = renderPipeline(this.device, {
        label: 'copy:' + key,
        layout: 'auto',
        vertex: { module, entryPoint: 'vertex' },
        fragment: {
          module,
          entryPoint: 'fragment',
          targets: [
            {
              format,
              blend: blend
                ? {
                    color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
                    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
                  }
                : undefined,
            },
          ],
        },
      })
      this.copyPipelines.set(key, pipeline)
    }
    const group = this.device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: source },
        { binding: 1, resource: this.sampler },
      ],
    })
    encodePass(
      encoder,
      { colorAttachments: [{ view: target, loadOp: load ? 'load' : 'clear', storeOp: 'store' }] },
      pass => {
        pass.setPipeline(pipeline)
        pass.setBindGroup(0, group)
        if (viewport) {
          pass.setViewport(viewport[0], viewport[1], viewport[2], viewport[3], 0, 1)
          pass.setScissorRect(0, 0, Math.ceil(viewport[2] - 0.5), Math.ceil(viewport[3] - 0.5))
        }
        pass.draw(3)
      },
      viewport ? 'pyramid' : 'copy',
    )
    this.draws++
  }
  pyramid(
    encoder: GPUCommandEncoder,
    source: Target,
    target: Target,
    viewport?: readonly number[],
  ) {
    if (viewport) assertViewport(target.width, target.height, viewport)
    const levels = levelViews(target)
    this.copy(
      encoder,
      viewOf(source.texture),
      levels[0].sampled,
      'rgba8unorm',
      false,
      false,
      viewport,
    )
    if (target.levels < 2) return
    // Every further mip level in ONE compute pass (one dispatch per level) instead of one
    // render pass per level: each tiny render pass costs a tile load/store and a GPU pass
    // boundary on a phone. Same sampler at the same texel centres as the copy pass.
    let pipeline = this.mipPipeline
    if (!pipeline) {
      const module = shaderModule(this.device, { label: 'mips', code: mipCompute })
      pipeline = this.mipPipeline = this.device.createComputePipeline({
        label: 'mips',
        layout: 'auto',
        compute: { module, entryPoint: 'main' },
      })
      deviceMips.set(this.device, pipeline)
    }
    const groups = levels.slice(1).map((level, i) => ({
      level,
      group: this.device.createBindGroup({
        layout: pipeline!.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: levels[i].sampled },
          { binding: 1, resource: this.sampler },
          { binding: 2, resource: level.storage },
        ],
      }),
    }))
    encodeComputePass(
      encoder,
      pass => {
        pass.setPipeline(pipeline!)
        for (const { level, group } of groups) {
          pass.setBindGroup(0, group)
          pass.dispatchWorkgroups(Math.ceil(level.width / 8), Math.ceil(level.height / 8))
        }
      },
      'mips',
    )
    this.draws++
  }
  private mipPipeline?: GPUComputePipeline
  destroy() {
    for (const b of this.buffers) b.destroy()
    this.buffers = []
  }
}
