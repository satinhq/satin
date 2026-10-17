import { MORPH_FIELD_GLSL } from '../morphField.ts'
import type { SurfaceRenderSpec } from '../renderSpecs.ts'
import type { Values } from './passes.ts'

/* Ink inside a glass field: a region of a captured foreground atlas (a menu's rows, its
 * trigger's glyph) drawn only where the field is, lensed by the rim like the backdrop: within
 * `lens width` of the edge the ink is sampled from deeper inside, so content passing under a
 * moving rim is magnified and bent along it. Premultiplied output, composited over the material.
 * Compiled to WGSL offline (scripts/measured-reference/regenerate-morph-field.mjs). */
export const FIELD_INK_GLSL =
  MORPH_FIELD_GLSL +
  /* glsl */ `
precision highp float;
in vec2 vTextureCoord;
in vec2 vFilterCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform vec2 uAtlasSize;
uniform vec4 uInkSource;
uniform vec4 uInkFrame;
uniform vec4 uInkParams;
uniform float uCoverageWidth;
vec4 inkSample(vec2 local,vec2 offset){
 vec2 point=uInkSource.xy+local*uInkSource.zw+offset;
 if(any(lessThan(point,uInkSource.xy))||any(greaterThan(point,uInkSource.xy+uInkSource.zw)))return vec4(0);
 return textureLod(uTexture,point/uAtlasSize,0.0);
}
void main(){
 vec2 p=vFilterCoord*uResolution;
 float d=morphDistance(p);
 float aa=max(uCoverageWidth,.5*fwidth(d));
 float coverage=1.0-smoothstep(-aa,aa,d);
 if(coverage<=0.0||uInkParams.x<=0.0){finalColor=vec4(0);return;}
 vec2 n=morphNormal(p);
 float rim=clamp(1.0-max(-d,0.0)/max(uInkParams.w,.001),0.0,1.0);
 vec2 q=p-n*uInkParams.z*rim*rim;
 vec2 local=(q-uInkFrame.xy)/uInkFrame.zw;
 float r=uInkParams.y*uInkSource.z/uInkFrame.z;
 vec4 c=inkSample(local,vec2(0));
 if(r>.05){
  c+=inkSample(local,vec2(r,0))+inkSample(local,vec2(-r,0))+inkSample(local,vec2(0,r))+inkSample(local,vec2(0,-r));
  c+=inkSample(local,vec2(.7,.7)*r)+inkSample(local,vec2(-.7,.7)*r)+inkSample(local,vec2(.7,-.7)*r)+inkSample(local,vec2(-.7,-.7)*r);
  c/=9.0;
 }
 finalColor=c*uInkParams.x*coverage;
}`

/** Kernel values for one ink layer. Layer rectangles are in field-member points; the kernel
 * works in sample points (member points plus the sample inset). */
export function fieldInkUniforms(
  spec: SurfaceRenderSpec,
  atlas: { width: number; height: number },
  layer: NonNullable<SurfaceRenderSpec['ink']>['layers'][number],
  field: Values,
  resolution: number,
): Values {
  return {
    ...field,
    uResolution: [spec.sampleWidth, spec.sampleHeight],
    uAtlasSize: [atlas.width, atlas.height],
    uInkSource: [layer.source.x, layer.source.y, layer.source.width, layer.source.height],
    uInkFrame: [
      layer.frame.x + spec.sampleInsetX,
      layer.frame.y + spec.sampleInsetY,
      layer.frame.width,
      layer.frame.height,
    ],
    uInkParams: [layer.opacity, layer.blur, layer.lens, layer.lensWidth],
    // The material's own edge (rasterUniforms materialUniforms).
    uCoverageWidth: 0.5 / resolution,
  }
}
