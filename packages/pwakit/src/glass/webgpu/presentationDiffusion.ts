import type { Values } from './passes.ts'
import { presentationSigma } from './presentationMaterial.ts'

/** Adjacent Gaussian texels paired for linear sampling. Unlike sigma-spaced
 * taps, this kernel cannot print separated copies of a one-pixel stroke. */
export function presentationDiffusionTaps(sigma: number) {
  const taps = [{ offset: 0, weight: 1 }]
  const reach = Math.ceil(3 * sigma)
  for (let i = 1; i <= reach; i += 2) {
    const a = Math.exp(-0.5 * (i / sigma) ** 2)
    const b = i + 1 <= reach ? Math.exp(-0.5 * ((i + 1) / sigma) ** 2) : 0
    taps.push({ offset: i + b / (a + b), weight: a + b })
  }
  const total = 1 + 2 * taps.slice(1).reduce((sum, tap) => sum + tap.weight, 0)
  return taps.map(tap => ({ offset: tap.offset, weight: tap.weight / total }))
}

function diffusionShader(sigma: number) {
  const taps = presentationDiffusionTaps(sigma)
  /** Presentation backdrop diffusion at approximately one texel per CSS pixel. The
   * source mip is area-filtered before reduction. Blur the entire sample plane:
   * masking either pass at the aperture leaves sharp ink for the lens to fold. */
  return {
    uniforms: ['uSample', 'uAxis', 'uSource'],
    textures: ['uTexture'],
    wgsl: `
struct P { sample:vec4f, axis:vec4f, source:vec4f }
@group(0) @binding(0) var<uniform> p:P;
@group(0) @binding(1) var s:sampler;
@group(0) @binding(2) var source:texture_2d<f32>;
fn sampleAt(uv:vec2f)->vec4f {
 let halfTexel=.5*p.source.xy;
 return textureSampleLevel(source,s,clamp(uv,halfTexel,p.source.zw-halfTexel),p.axis.z);
}
@fragment fn main(@location(0) uv:vec2f,@location(1) coord:vec2f)->@location(0) vec4f {
 let center=uv*p.source.zw;
 let step=p.axis.xy/p.sample.xy*p.source.zw;
 var colour=sampleAt(center)*${taps[0]!.weight};
 ${taps
   .slice(1)
   .map(
     tap =>
       `colour+=(sampleAt(center+step*${tap.offset})+sampleAt(center-step*${tap.offset}))*${tap.weight};`,
   )
   .join('\n ')}
 return colour;
}`,
  } as const
}

export const presentationDiffusion = diffusionShader(presentationSigma('alert'))
export const sheetDiffusion = diffusionShader(presentationSigma('sheet'))

export function alertDiffusionUniforms(
  width: number,
  height: number,
  axis: readonly [number, number],
  sourceWidth: number,
  sourceHeight: number,
  sourceScale?: number,
  mip = 0,
): Values {
  return {
    uSample: [width, height, 0, 0],
    uAxis: [...axis, mip, 0],
    uSource: [
      2 ** mip / sourceWidth,
      2 ** mip / sourceHeight,
      sourceScale === undefined ? 1 : (width * sourceScale) / sourceWidth,
      sourceScale === undefined ? 1 : (height * sourceScale) / sourceHeight,
    ],
  }
}
