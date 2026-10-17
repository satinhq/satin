import { MORPH_FIELD_GLSL, morphFieldUniforms } from '../morphField.ts'
import { REFERENCE_LENS_PRESETS, referenceAmplitudeScale } from '../lens/referenceProfiles.ts'
import type { SurfaceRenderSpec } from '../renderSpecs.ts'
import { shaders } from './shaders.ts'
import type { Values } from './passes.ts'
/** Resting clear uses the frozen 7j operator. Interactive transmission remains
 * blur-free and tint-free in sharedLift, regardless of the resting variant. */
export function clearRestValues(spec: SurfaceRenderSpec): Values {
  const preset = REFERENCE_LENS_PRESETS.clear,
    first = spec.shape.first
  const shape = [
    spec.sampleInsetX + first.centerX,
    spec.sampleInsetY + first.centerY,
    first.halfWidth,
    first.halfHeight,
  ]
  const raw = Array.from({ length: 7 }, (_, i) => Math.exp(-0.5 * (i * 0.5) ** 2)),
    sum = raw[0] + 2 * raw.slice(1).reduce((a, b) => a + b, 0),
    weights = raw.map(v => v / sum)
  return {
    ...Object.fromEntries(shaders.clear.uniforms.map(name => [name, [0, 0, 0, 0]])),
    ...morphFieldUniforms(spec),
    uResolution: [spec.sampleWidth, spec.sampleHeight],
    uSurfaceCenter: shape.slice(0, 2),
    uHalfSize: shape.slice(2),
    uRadius: first.radius,
    uShapeA: shape,
    uShapeB: shape,
    uShapeRadii: [first.radius, first.radius],
    uShapeParams: [1, 0, 0, spec.shape.rimAlpha],
    uRimBand: spec.shape.rimBandCssPx ?? 0.75,
    uCoverageWidth: 0.75,
    uMotionMix: 1,
    uProfile: [
      preset.knotSpacingCssPx,
      referenceAmplitudeScale(first.radius, preset),
      0,
      preset.bandBlurCssPx,
    ],
    uKnotsA: preset.knotsCssPx.slice(0, 4),
    uKnotsB: preset.knotsCssPx.slice(4, 8),
    uKnotsC: preset.knotsCssPx.slice(8, 12),
    uKnotsD: preset.knotsCssPx.slice(12, 16),
    uMaterialGain: 1.12,
    uMaterialTint: spec.tint ?? [1, 1, 1, 0.075],
    uSpacing: (spec.blurSigmaCssPx ?? preset.blurSigmaCssPx) * 0.5,
    uCornerRadius: first.radius,
    uWeightsA: weights.slice(0, 4),
    uWeightsB: [...weights.slice(4), 0],
  }
}
export const tintFragment =
  MORPH_FIELD_GLSL +
  /* glsl */ `
precision highp float;
in vec2 vTextureCoord;
in vec2 vFilterCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uTint;
uniform vec2 uResolution;
uniform vec4 uShape;
uniform float uRadius;
void main(){
 vec4 source=texture(uTexture,vTextureCoord);
 vec2 q=abs(vFilterCoord*uResolution-uShape.xy)-uShape.zw+uRadius;
 float sd=min(max(q.x,q.y),0.0)+length(max(q,0.0))-uRadius;
 if(uMorphParams.x>.5)sd=morphDistance(vFilterCoord*uResolution);
 float amount=uTint.a*(1.0-step(0.0,sd));
 finalColor=vec4(mix(source.rgb,uTint.rgb*source.a,amount),source.a);
}`
