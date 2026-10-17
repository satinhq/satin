import type { SurfaceRenderSpec } from './renderSpecs.ts'
import type { GlassRegion } from './regions.ts'
import { GLASS_BLEND_ANGLE_POWER } from './fieldGeometry.ts'
export {
  glassBlendRadius,
  glassFieldDistance,
  roundedRectDistance,
  roundedRectNormal,
  smoothMinimum,
  GLASS_BLEND_ANGLE_POWER,
  type GlassFieldMember,
  type GlassUnionFrame,
} from './fieldGeometry.ts'
export function glassIdentityKey(region: Pick<GlassRegion, 'container' | 'morph'>) {
  return region.morph
    ? JSON.stringify([region.container?.id ?? null, region.morph.namespace, region.morph.id])
    : undefined
}
type FieldRegion = Pick<
  GlassRegion,
  'container' | 'morph' | 'namespace' | 'union' | 'shape' | 'material'
> &
  Partial<Pick<GlassRegion, 'layer'>>
export function glassFieldKey(region: FieldRegion) {
  // Press policy controls interaction, not optical compatibility.
  const { press: _press, ...material } = region.material
  return JSON.stringify([
    region.container?.id,
    region.morph?.namespace ?? region.namespace,
    region.union ?? null,
    region.shape,
    material,
    region.layer,
  ])
}
export function glassUnionDiagnostics(regions: readonly FieldRegion[]) {
  const requested = new Map<string, Set<string>>()
  for (const region of regions) {
    if (!region.container || region.union === undefined) continue
    const key = JSON.stringify([
      region.container.id,
      region.morph?.namespace ?? region.namespace,
      region.union,
    ])
    const fields = requested.get(key) ?? new Set<string>()
    fields.add(glassFieldKey(region))
    requested.set(key, fields)
  }
  return [...requested]
    .filter(([, fields]) => fields.size > 1)
    .map(
      ([key]) => `Incompatible glassEffectUnion ${key}: preserving separate shape/material fields.`,
    )
}
/** Conservative visible-field bounds in sample coordinates. Each smooth minimum can
 * extend a union by at most blendRadius / 4; retain the optical sample inset too.
 * Capture geometry stays fixed so animation does not invalidate the backdrop. */
export function morphFieldSampleBounds(spec: SurfaceRenderSpec) {
  const members = spec.shape.members
  if (!members?.length || spec.treatment || spec.materialProfile !== 'chrome') return undefined
  const blendSupport = (Math.max(0, spec.shape.blendRadius) * (members.length - 1)) / 4
  const paddingX = spec.sampleInsetX + blendSupport
  const paddingY = spec.sampleInsetY + blendSupport
  const left =
    Math.min(...members.map(member => member.centerX - member.halfWidth)) +
    spec.sampleInsetX -
    paddingX
  const top =
    Math.min(...members.map(member => member.centerY - member.halfHeight)) +
    spec.sampleInsetY -
    paddingY
  const right =
    Math.max(...members.map(member => member.centerX + member.halfWidth)) +
    spec.sampleInsetX +
    paddingX
  const bottom =
    Math.max(...members.map(member => member.centerY + member.halfHeight)) +
    spec.sampleInsetY +
    paddingY
  return [left, top, right - left, bottom - top] as const
}
export function morphFieldUniforms(spec: SurfaceRenderSpec): Record<string, number | number[]> {
  const members = spec.shape.members ?? []
  return {
    uMorphParams: [members.length, spec.shape.blendRadius, 0, 0],
    ...Object.fromEntries(
      Array.from({ length: 16 }, (_, i) => {
        const s = members[i]
        return [
          `uMorphShape${i}`,
          s
            ? [
                s.centerX + spec.sampleInsetX,
                s.centerY + spec.sampleInsetY,
                s.halfWidth,
                s.halfHeight,
              ]
            : [0, 0, 0, 0],
        ]
      }),
    ),
    ...Object.fromEntries(
      Array.from({ length: 4 }, (_, i) => [
        `uMorphRadii${i}`,
        Array.from({ length: 4 }, (_, j) => members[i * 4 + j]?.radius ?? 0),
      ]),
    ),
  }
}
/** The union field (fieldGeometry.ts is its CPU twin; both share the zero set).
 * morphRawDistance is the smooth union. A smooth minimum flattens the field across a neck
 * (|gradient| is about 0.4 at a 14-pt-gap waist), so material bands measured in field units
 * would widen there into a bright rim bead. morphDistance divides by the gradient near the
 * surface, restoring point-true band widths without moving the contour. */
export const MORPH_FIELD_GLSL = /* glsl */ `
precision highp float;
uniform vec4 uMorphParams;
uniform vec4 uMorphShape0;
uniform vec4 uMorphShape1;
uniform vec4 uMorphShape2;
uniform vec4 uMorphShape3;
uniform vec4 uMorphShape4;
uniform vec4 uMorphShape5;
uniform vec4 uMorphShape6;
uniform vec4 uMorphShape7;
uniform vec4 uMorphShape8;
uniform vec4 uMorphShape9;
uniform vec4 uMorphShape10;
uniform vec4 uMorphShape11;
uniform vec4 uMorphShape12;
uniform vec4 uMorphShape13;
uniform vec4 uMorphShape14;
uniform vec4 uMorphShape15;
uniform vec4 uMorphRadii0;
uniform vec4 uMorphRadii1;
uniform vec4 uMorphRadii2;
uniform vec4 uMorphRadii3;
float morphMemberDistance(vec2 p,vec4 shape,float radius){vec2 q=abs(p-shape.xy)-shape.zw+radius;return min(max(q.x,q.y),0.0)+length(max(q,vec2(0)))-radius;}
float morphSmoothMin(float a,float b){float k=uMorphParams.y;if(k<=0.0)return min(a,b);float h=max(k-abs(a-b),0.0)/k;return min(a,b)-h*h*k*.25;}
vec2 morphMemberNormal(vec2 p,vec4 shape,float radius){vec2 delta=p-shape.xy;vec2 q=abs(delta)-shape.zw+radius;vec2 n=max(q,vec2(0))*sign(delta);if(max(q.x,q.y)<=0.0)n=q.x>=q.y?vec2(sign(delta.x),0):vec2(0,sign(delta.y));return n/max(length(n),1e-8);}
void morphAdd(vec2 p,vec4 shape,float radius,inout float d,inout vec2 n){float b=morphMemberDistance(p,shape,radius);vec2 nb=morphMemberNormal(p,shape,radius);if(d>1e9){d=b;n=nb;return;}float k=uMorphParams.y*pow(clamp((1.0-dot(n,nb))*.5,0.0,1.0),${GLASS_BLEND_ANGLE_POWER});if(k<=1e-4){if(b<d){d=b;n=nb;}return;}float h=max(k-abs(d-b),0.0)/k;float w=clamp(.5+(d-b)/(2.0*k),0.0,1.0);d=min(d,b)-h*h*k*.25;n=mix(n,nb,w);n=n/max(length(n),1e-8);}
float morphRawDistance(vec2 p){float d=1e10;vec2 n=vec2(0);
if(uMorphParams.x>0.5)morphAdd(p,uMorphShape0,uMorphRadii0.x,d,n);
if(uMorphParams.x>1.5)morphAdd(p,uMorphShape1,uMorphRadii0.y,d,n);
if(uMorphParams.x>2.5)morphAdd(p,uMorphShape2,uMorphRadii0.z,d,n);
if(uMorphParams.x>3.5)morphAdd(p,uMorphShape3,uMorphRadii0.w,d,n);
if(uMorphParams.x>4.5)morphAdd(p,uMorphShape4,uMorphRadii1.x,d,n);
if(uMorphParams.x>5.5)morphAdd(p,uMorphShape5,uMorphRadii1.y,d,n);
if(uMorphParams.x>6.5)morphAdd(p,uMorphShape6,uMorphRadii1.z,d,n);
if(uMorphParams.x>7.5)morphAdd(p,uMorphShape7,uMorphRadii1.w,d,n);
if(uMorphParams.x>8.5)morphAdd(p,uMorphShape8,uMorphRadii2.x,d,n);
if(uMorphParams.x>9.5)morphAdd(p,uMorphShape9,uMorphRadii2.y,d,n);
if(uMorphParams.x>10.5)morphAdd(p,uMorphShape10,uMorphRadii2.z,d,n);
if(uMorphParams.x>11.5)morphAdd(p,uMorphShape11,uMorphRadii2.w,d,n);
if(uMorphParams.x>12.5)morphAdd(p,uMorphShape12,uMorphRadii3.x,d,n);
if(uMorphParams.x>13.5)morphAdd(p,uMorphShape13,uMorphRadii3.y,d,n);
if(uMorphParams.x>14.5)morphAdd(p,uMorphShape14,uMorphRadii3.z,d,n);
if(uMorphParams.x>15.5)morphAdd(p,uMorphShape15,uMorphRadii3.w,d,n);
return d;}
vec2 morphGradient(vec2 p){float e=.1;return vec2(morphRawDistance(p+vec2(e,0))-morphRawDistance(p-vec2(e,0)),morphRawDistance(p+vec2(0,e))-morphRawDistance(p-vec2(0,e)))/(2.0*e);}
vec2 morphNormal(vec2 p){return normalize(morphGradient(p)+vec2(1e-8));}
float morphDistance(vec2 p){float d=morphRawDistance(p);if(uMorphParams.x<1.5||uMorphParams.y<=0.0)return d;float scale=1.0/clamp(length(morphGradient(p)),.25,1.0);return d*mix(scale,1.0,smoothstep(16.0,28.0,-d));}
`
