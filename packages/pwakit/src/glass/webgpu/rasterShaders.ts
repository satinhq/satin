/// <reference types="@webgpu/types" />
import { renderPipeline, shaderModule } from './errors.ts'

// The raster's own two pipelines (raster.ts): the backdrop composite (capture, navigation pose and
// route atlas into the source target) and the present (a result texture onto its layer canvas).
// The material kernels live in shaders.ts / passes.ts.

const vertex = `@vertex fn vertex(@builtin(vertex_index) i:u32)->@builtin(position) vec4f {let p=array<vec2f,3>(vec2f(-1,1),vec2f(3,1),vec2f(-1,-3))[i];return vec4f(p,0,1);}`
// `source` is (front height, rear height, scroll, open edges); `atlasCount` is (atlas routes,
// fill rgb). A capture window's open edge (BackdropLayer.openEdges) has uncaptured content beyond
// it: there the plane's fill is shown. Without the test the clamping sampler stretched the
// window's last row over everything beyond it.
export const compositeSource = `${vertex}
struct P { size:vec4f, origin:vec4f, background:vec4f, source:vec4f, route:vec4f, atlas:array<vec4f,8>, atlasCount:vec4f, viewportScale:vec4f, zoom:array<vec4f,8>, clip:array<vec4f,8> }
@group(0) @binding(0) var<uniform> p:P;
@group(0) @binding(1) var s:sampler;
@group(0) @binding(2) var front:texture_2d<f32>;
@group(0) @binding(3) var rear:texture_2d<f32>;
fn openFill(v:f32)->bool {
 let open=u32(p.source.w);
 return (v<0 && (open&1u)!=0u) || (v>1 && (open&2u)!=0u);
}
@fragment fn fragment(@builtin(position) pos:vec4f)->@location(0) vec4f {
 let point=pos.xy/p.size.z*p.viewportScale.xy+p.origin.xy;
 let x=point.x-p.route.x;
 let rearX=point.x-p.route.y;
 var c=p.background;
 if(p.atlasCount.x>0){
  for(var i=0u;i<u32(p.atlasCount.x);i++){
   if(p.zoom[i].z>0){
    let window=p.clip[i];
    let radius=min(p.zoom[i].w,min(window.z,window.w)*0.5);
    let delta=abs(point-window.xy-window.zw*0.5)-window.zw*0.5+vec2f(radius);
    let distance=length(max(delta,vec2f(0)))+min(max(delta.x,delta.y),0)-radius;
    let coverage=1-smoothstep(-0.5,0.5,distance);
    if(coverage>0){
     let local=(point-p.zoom[i].xy)/p.zoom[i].z+p.atlas[i].zw;
     let sample=textureSampleLevel(front,s,vec2f((local.x/p.size.w+f32(i))/p.atlasCount.x,local.y/p.source.x),0)*coverage;
     c=vec4f(sample.rgb*(1-p.atlas[i].y),sample.a)+c*(1-sample.a);
    }
    continue;
   }
   let local=point.x-p.atlas[i].x;
   if(local>=0&&local<p.size.w){let sample=textureSampleLevel(front,s,vec2f((local/p.size.w+f32(i))/p.atlasCount.x,point.y/p.source.x),0);c=vec4f(sample.rgb*(1-p.atlas[i].y),sample.a)+c*(1-sample.a);}
  }
  return c;
 }
 let fill=vec4f(p.atlasCount.yzw,1);
 if(rearX>=0 && rearX<p.size.w){let v=(point.y+p.source.z)/p.source.y;c=textureSampleLevel(rear,s,vec2f(rearX/p.size.w,v),0);if(openFill(v)){c=fill;}c=vec4f(c.rgb*(1-p.route.w),c.a);}
 if(x>=0 && x<p.size.w){let v=(point.y+p.source.z)/p.source.x;c=textureSampleLevel(front,s,vec2f(x/p.size.w,v),0);if(openFill(v)){c=fill;}c=vec4f(c.rgb*(1-p.route.z),c.a);}
 return c;
}`
// `alpha` is (opacity, occluder radius). `occluder` is a capsule (centre, half size) in output
// pixels with glass drawn above this surface: the present leaves it empty (see SurfaceRenderSpec).
const present = `${vertex}
struct P { origin:vec4f, alpha:vec4f, occluder:vec4f }
@group(0) @binding(0) var<uniform> p:P;
@group(0) @binding(1) var s:sampler;
@group(0) @binding(2) var source:texture_2d<f32>;
@fragment fn fragment(@builtin(position) pos:vec4f)->@location(0) vec4f {
 let uv=(pos.xy-p.origin.xy)/p.origin.zw;
 if(any(uv<vec2f(0))||any(uv>vec2f(1))){return vec4f(0);}
 var c=textureSampleLevel(source,s,uv,0)*p.alpha.x;
 if(p.occluder.z>0){
  let q=abs(pos.xy-p.occluder.xy)-p.occluder.zw+vec2f(p.alpha.y);
  let distance=length(max(q,vec2f(0)))+min(max(q.x,q.y),0)-p.alpha.y;
  c*=smoothstep(-0.5,0.5,distance);
 }
 return c;
}`

const devicePipelines = new WeakMap<
  GPUDevice,
  { composite: GPURenderPipeline; overlay: GPURenderPipeline; present: GPURenderPipeline }
>()

/** The composite and present pipelines for a device, created once per device. */
export function rasterPipelines(device: GPUDevice, format: GPUTextureFormat) {
  let cached = devicePipelines.get(device)
  const pipeline = (label: string, code: string, blend = false) => {
    const module = shaderModule(device, { label, code })
    return renderPipeline(device, {
      label,
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
  }
  if (!cached) {
    cached = {
      composite: pipeline('composite', compositeSource),
      overlay: pipeline('backdrop-overlay', compositeSource, true),
      present: pipeline('present', present, true),
    }
    devicePipelines.set(device, cached)
  }
  return cached
}
