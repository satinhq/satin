/// <reference types="@webgpu/types" />
import { shaderModule } from './errors.ts'
import { encodeComputePass, type Target } from './passes.ts'

/** The bar material's blur pyramid: its wide diffusion reads coarse levels (level 5 to 6 at
 * half resolution, texels of 21 to 43 pt), so the pyramid decides how bright the glass's interior
 * reads over any detail in the backdrop.
 *
 * Two things keep that brightness a property of the backdrop alone, not of the shape's size.
 *
 * Every destination texel is the exact area average of the source texels it covers. With one
 * bilinear tap at the destination centre, a chain that is not a power of two (the tab bar's is
 * 789 x 477) gave whole bands of the backdrop no weight and others double weight: text scrolling
 * under the bar lit its blur at some heights and vanished from it at others.
 *
 * The storage is a whole number of coarse texels (PYRAMID_GRID), so each level is exactly half
 * the one below and a level-k texel always covers the same 2^k level-0 texels, counted from the
 * sample rectangle's top-left corner. When the storage was the content rounded up, every level's
 * texel size followed the surface's width: a growing Music accessory moved the coarse texels'
 * edges across the tiles under it and its interior dimmed and brightened by several luma levels
 * over a still backdrop, then stepped when the run ended at a narrower width. Storage past the
 * content carries no weight: a coarse texel at the content's edge averages only the content it
 * covers, and the shader's reads stop at the content (pyramidClamp). A wider surface changes
 * only the texels at its edge; the ones away from it stay exactly as they were. */

/** Level-0 texels per side of the coarsest exact texel (level 6, the wide diffusion's deepest). */
export const PYRAMID_GRID = 64

/** Storage for `extent` level-0 texels of content: a whole number of PYRAMID_GRID cells. */
export function pyramidStorage(extent: number) {
  return Math.max(1, Math.ceil(Math.ceil(extent) / PYRAMID_GRID)) * PYRAMID_GRID
}

/** Level-0 texels the content copy writes for a content extent: those whose centre lies inside
 * it (the copy's scissor in passes.ts). */
export function pyramidContent(extent: number) {
  return Math.max(1, Math.ceil(extent - 0.5))
}

/** The kernel's read clamp for a pyramid whose level 0 holds `content` texels: half a texel
 * inside the content, so no sample reaches the cleared storage past it. Same layout as
 * rasterUniforms.ts inputUniforms' uInputClamp. */
export function pyramidClamp(target: Target, content: readonly [number, number]) {
  return [
    0.5 / target.width,
    0.5 / target.height,
    (content[0] - 0.5) / target.width,
    (content[1] - 0.5) / target.height,
  ]
}

/** Texels of content at each level, fractional: a level keeps the content's share of its size. */
export function contentLevels(target: Target, content: readonly [number, number]) {
  const levels = areaMipLevels(target)
  const result: [number, number][] = [[content[0], content[1]]]
  for (let level = 1; level < levels.length; level++) {
    const [width, height] = result[level - 1]
    const below = levels[level - 1]
    const here = levels[level]
    result.push([(width * here.width) / below.width, (height * here.height) / below.height])
  }
  return result
}

/** One axis of a destination texel's footprint over the level below: the source texels it
 * overlaps and how much of each, counting only the part inside the content. Mirrors
 * `footprint` in the compute shader; texel t spans [t, t + 1]. */
export function footprint(index: number, ratio: number, content: number) {
  const start = index * ratio
  const end = start + ratio
  const taps: { texel: number; weight: number }[] = []
  for (let texel = Math.floor(start); texel < end; texel++) {
    const overlap = Math.min(texel + 1, end) - Math.max(texel, start)
    const inside = Math.min(1, Math.max(0, content - texel))
    if (overlap > 0 && inside > 0) taps.push({ texel, weight: overlap * inside })
  }
  return taps
}

// Each destination texel is the average of the source texels under it, weighted by how much of
// each it covers and how much of each is content. A texel at the content's edge is the average
// of the content it covers; one wholly past the content repeats the nearest content texel.
const areaMipCompute = `@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var destination: texture_storage_2d<rgba8unorm, write>;
// xy: the source level's content in texels, fractional (contentLevels).
@group(0) @binding(2) var<uniform> sourceContent: vec4f;
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) id: vec3u) {
 let size = textureDimensions(destination);
 if (id.x >= size.x || id.y >= size.y) { return; }
 let sourceSize = vec2i(textureDimensions(source));
 let ratio = vec2f(sourceSize) / vec2f(size);
 let start = vec2f(id.xy) * ratio;
 let end = start + ratio;
 let first = vec2i(floor(start));
 var sum = vec4f(0.0);
 var weight = 0.0;
 // A footprint spans at most four texels per axis: level sizes halve rounding down, so the
 // ratio is at most 3.
 for (var dy = 0; dy < 4; dy++) {
  for (var dx = 0; dx < 4; dx++) {
   let texel = first + vec2i(dx, dy);
   if (any(texel >= sourceSize)) { continue; }
   let corner = vec2f(texel);
   let overlap = max(vec2f(0.0), min(corner + 1.0, end) - max(corner, start));
   let inside = clamp(sourceContent.xy - corner, vec2f(0.0), vec2f(1.0));
   let w = overlap.x * overlap.y * inside.x * inside.y;
   sum += textureLoad(source, texel, 0) * w;
   weight += w;
  }
 }
 if (weight > 0.0) {
  textureStore(destination, id.xy, sum / weight);
 } else {
  let last = max(vec2i(ceil(sourceContent.xy)) - 1, vec2i(0));
  textureStore(destination, id.xy, textureLoad(source, min(first, last), 0));
 }
}`

const pipelines = new WeakMap<GPUDevice, GPUComputePipeline>()
const levelCache = new WeakMap<
  GPUTexture,
  { view: GPUTextureView; width: number; height: number }[]
>()

/** One view per mip level of a pyramid target (created once per texture). */
export function areaMipLevels(target: Target) {
  let levels = levelCache.get(target.texture)
  if (!levels) {
    levels = Array.from({ length: target.levels }, (_, level) => ({
      view: target.texture.createView({ baseMipLevel: level, mipLevelCount: 1 }),
      width: Math.max(1, target.width >> level),
      height: Math.max(1, target.height >> level),
    }))
    levelCache.set(target.texture, levels)
  }
  return levels
}

/** Fill every level above 0 of `target` from the level below, in one compute pass. Level 0
 * holds `content` texels of backdrop; `uniform` makes a uniform buffer (Passes.uniform). */
export function encodeAreaMips(
  encoder: GPUCommandEncoder,
  device: GPUDevice,
  target: Target,
  content: readonly [number, number],
  uniform: (values: Float32Array<ArrayBuffer>) => GPUBuffer,
) {
  if (target.levels < 2) return
  let pipeline = pipelines.get(device)
  if (!pipeline) {
    const module = shaderModule(device, { label: 'area-mips', code: areaMipCompute })
    pipeline = device.createComputePipeline({
      label: 'area-mips',
      layout: 'auto',
      compute: { module, entryPoint: 'main' },
    })
    pipelines.set(device, pipeline)
  }
  const levels = areaMipLevels(target)
  const contents = contentLevels(target, content)
  const layout = pipeline.getBindGroupLayout(0)
  const steps = levels.slice(1).map((level, index) => ({
    level,
    group: device.createBindGroup({
      layout,
      entries: [
        { binding: 0, resource: levels[index].view },
        { binding: 1, resource: level.view },
        {
          binding: 2,
          resource: { buffer: uniform(new Float32Array([...contents[index], 0, 0])) },
        },
      ],
    }),
  }))
  const compute = pipeline
  encodeComputePass(
    encoder,
    pass => {
      pass.setPipeline(compute)
      for (const { level, group } of steps) {
        pass.setBindGroup(0, group)
        pass.dispatchWorkgroups(Math.ceil(level.width / 8), Math.ceil(level.height / 8))
      }
    },
    'area-mips',
  )
}
