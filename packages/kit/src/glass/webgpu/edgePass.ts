import { renderPipeline, shaderModule } from './errors.ts'
import { encodePass, viewOf, type Target } from './passes.ts'
import type { ScrollEdge } from './scrollEdgeBackdrop.ts'

const vertex = `@vertex fn vertex(@builtin(vertex_index) i:u32)->@builtin(position) vec4f {let p=array<vec2f,3>(vec2f(-1,1),vec2f(3,1),vec2f(-1,-3))[i];return vec4f(p,0,1);}`
/** Separable Gaussian in texel space; bilinear taps every `step` texels, edge-clamped (as CSS blur()). */
const blur = `${vertex}
struct P { axis:vec4f, size:vec4f }
@group(0) @binding(0) var<uniform> p:P;
@group(0) @binding(1) var s:sampler;
@group(0) @binding(2) var source:texture_2d<f32>;
@fragment fn fragment(@builtin(position) pos:vec4f)->@location(0) vec4f {
 let sigma=p.axis.z; let step=p.axis.w; let reach=ceil(3.0*sigma/step);
 var sum=vec4f(0); var weight=0.0;
 for(var i=-reach;i<=reach;i+=1.0){
  let o=i*step; let w=exp(-.5*(o/sigma)*(o/sigma));
  let uv=clamp((pos.xy+p.axis.xy*o)/p.size.xy,vec2f(.5)/p.size.xy,vec2f(1)-vec2f(.5)/p.size.xy);
  sum+=textureSampleLevel(source,s,uv,0)*w; weight+=w;
 }
 return sum/weight;
}`
/** out = mix(base, mix(blurred, tint, tint.a), mask * strength) inside the edge rectangle. */
const composite = `${vertex}
struct P { origin:vec4f, edge:vec4f, fade:vec4f, tint:vec4f, cap:vec4f, viewportScale:vec4f, mask:array<vec4f,10>, zoomClip:vec4f, zoomRadius:vec4f, occlusion:array<vec4f,8>, occlusionRadius:array<vec4f,8> }
@group(0) @binding(0) var<uniform> p:P;
@group(0) @binding(1) var s:sampler;
@group(0) @binding(2) var base:texture_2d<f32>;
@group(0) @binding(3) var blurred:texture_2d<f32>;
@fragment fn fragment(@builtin(position) pos:vec4f)->@location(0) vec4f {
 let texel=vec2i(pos.xy);
 let b=textureLoad(base,texel,0); let g=textureLoad(blurred,texel,0);
 let point=pos.xy/p.origin.z*p.viewportScale.xy+p.origin.xy;
 for(var index=0u;index<8u;index++){
  let window=p.occlusion[index];
  if(window.z>0){
   let radius=min(p.occlusionRadius[index].x,min(window.z,window.w)*0.5);
   let delta=abs(point-window.xy-window.zw*0.5)-window.zw*0.5+vec2f(radius);
   if(length(max(delta,vec2f(0)))+min(max(delta.x,delta.y),0)-radius<=0){return b;}
  }
 }
 if(p.zoomClip.z>0){
  let radius=min(p.zoomRadius.x,min(p.zoomClip.z,p.zoomClip.w)*0.5);
  let delta=abs(point-p.zoomClip.xy-p.zoomClip.zw*0.5)-p.zoomClip.zw*0.5+vec2f(radius);
  if(length(max(delta,vec2f(0)))+min(max(delta.x,delta.y),0)-radius>0){return b;}
 }
 let inside=point.x>=p.edge.x&&point.x<p.edge.z&&point.y>=p.edge.y&&point.y<p.edge.w;
 var mask=0.0;
 if(inside){
  mask=select(clamp((p.edge.w-point.y)/max(1e-3,p.edge.w-p.fade.x),0.0,1.0),1.0,point.y<p.fade.x);
  let count=u32(p.origin.w);
  if(count>0u){
   mask=p.mask[0].y;
   for(var index=1u;index<count;index+=1u){
    let start=p.mask[index-1u]; let end=p.mask[index];
    if(point.y>=start.x){
     let progress=clamp((point.y-start.x)/max(1e-3,end.x-start.x),0.0,1.0);
     mask=mix(start.y,end.y,progress);
    }
   }
  }
 }
 let treated=vec4f(mix(g.rgb,p.tint.rgb,p.tint.a),g.a);
 let material=mix(b,treated,mask*p.fade.y);
 var capMask=0.0;
 if(inside&&p.cap.a>0.0){capMask=clamp((p.fade.w-point.y)/max(1e-3,p.fade.w-p.fade.z),0.0,1.0)*p.cap.a;}
 return vec4f(mix(material.rgb,p.cap.rgb,capMask),material.a);
}`
const pipelines = new WeakMap<
  GPUDevice,
  { blur: GPURenderPipeline; composite: GPURenderPipeline }
>()
function cached(device: GPUDevice) {
  let entry = pipelines.get(device)
  if (!entry) {
    const make = (label: string, code: string) => {
      const module = shaderModule(device, { label, code })
      return renderPipeline(device, {
        label,
        layout: 'auto',
        vertex: { module, entryPoint: 'vertex' },
        fragment: { module, entryPoint: 'fragment', targets: [{ format: 'rgba8unorm' }] },
      })
    }
    entry = {
      blur: make('scroll-edge-blur', blur),
      composite: make('scroll-edge-composite', composite),
    }
    pipelines.set(device, entry)
  }
  return entry
}
type Uniform = (values: Float32Array<ArrayBuffer>) => GPUBuffer
/** Apply every overlapping scroll edge to `source` (a surface's composed backdrop,
 * covering viewport rectangle `rect` at `resolution`), using two scratch targets of
 * the same size. `source` holds the treated backdrop afterwards. */
export function encodeScrollEdges(
  encoder: GPUCommandEncoder,
  device: GPUDevice,
  uniform: Uniform,
  sampler: GPUSampler,
  source: Target,
  scratch: readonly [Target, Target],
  rect: readonly [number, number, number, number],
  resolution: number,
  edges: readonly ScrollEdge[],
  scale: readonly [number, number] = [1, 1],
) {
  const { blur: blurPipeline, composite: compositePipeline } = cached(device)
  const [h, v] = scratch,
    size = [source.width, source.height] as const
  const draw = (
    pipeline: GPURenderPipeline,
    output: Target,
    values: number[],
    textures: Target[],
    label: string,
  ) => {
    const group = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniform(new Float32Array(values)) } },
        { binding: 1, resource: sampler },
        ...textures.map((t, i) => ({ binding: i + 2, resource: viewOf(t.texture) })),
      ],
    })
    encodePass(
      encoder,
      { colorAttachments: [{ view: viewOf(output.texture), loadOp: 'clear', storeOp: 'store' }] },
      pass => {
        pass.setPipeline(pipeline)
        pass.setBindGroup(0, group)
        pass.draw(3)
      },
      label,
    )
  }
  for (const edge of edges) {
    const sigmaX = (edge.sigma * resolution) / scale[0]
    const sigmaY = (edge.sigma * resolution) / scale[1]
    // A tint-only edge (sigma 0, edgesUnderSurface) composites the source itself.
    if (edge.sigma > 0) {
      draw(
        blurPipeline,
        h,
        [1, 0, sigmaX, Math.max(1, sigmaX / 8), size[0], size[1], 0, 0],
        [source],
        'edge-blur',
      )
      draw(
        blurPipeline,
        v,
        [0, 1, sigmaY, Math.max(1, sigmaY / 8), size[0], size[1], 0, 0],
        [h],
        'edge-blur',
      )
    } else
      encoder.copyTextureToTexture({ texture: source.texture }, { texture: v.texture }, [
        source.width,
        source.height,
      ])
    draw(
      compositePipeline,
      h,
      [
        rect[0],
        rect[1],
        resolution,
        edge.mask?.length ?? 0,
        edge.rect[0],
        edge.rect[1],
        edge.rect[0] + edge.rect[2],
        edge.rect[1] + edge.rect[3],
        edge.solid,
        edge.strength,
        edge.cap?.solid ?? 0,
        edge.cap?.end ?? 0,
        ...edge.tint,
        ...(edge.cap?.color ?? [0, 0, 0, 0]),
        ...scale,
        0,
        0,
        ...Array.from({ length: 10 }, (_, index) => {
          const stop = edge.mask?.[index]
          return [stop?.[0] ?? 0, stop?.[1] ?? 0, 0, 0]
        }).flat(),
        ...(edge.zoomClip?.rect ?? [0, 0, 0, 0]),
        edge.zoomClip?.radius ?? 0,
        0,
        0,
        0,
        ...Array.from(
          { length: 8 },
          (_, index) => edge.zoomOcclusions?.[index]?.rect ?? [0, 0, 0, 0],
        ).flat(),
        ...Array.from({ length: 8 }, (_, index) => [
          edge.zoomOcclusions?.[index]?.radius ?? 0,
          0,
          0,
          0,
        ]).flat(),
      ],
      [source, v],
      'edge-composite',
    )
    encoder.copyTextureToTexture({ texture: h.texture }, { texture: source.texture }, [
      source.width,
      source.height,
    ])
  }
}

/* The edges composed under one surface. The search field sees the content under it without the
 * search header's blur: native's field passes the row title at a 0.9 pt blur, while the header's
 * 1.5–1.75 pt blur composed under it measured 2.0–2.25 pt (reference field material). Its tint (the
 * field's dark transmission) still applies; the field's own recipe row does the diffusing. */
export function edgesUnderSurface(
  edges: readonly ScrollEdge[],
  materialProfile: 'chrome' | 'searchField' | 'menu',
): readonly ScrollEdge[] {
  if (materialProfile !== 'searchField') return edges
  return edges.map(edge => (edge.search ? { ...edge, sigma: 0 } : edge))
}
