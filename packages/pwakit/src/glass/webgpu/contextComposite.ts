/** Native light exterior fit, review-2/measurements/context-shadow-fit.json.
 * Dark uses the same geometric shadow candidate; its near-black signal did not identify a fit. */
export const contextPreviewShadow = [
  19.544682868986335, 0.29743200247189167, 0.24465397829558655,
] as const
export const contextMenuShadow = [17.05975989117854, 0.12642226441997836, 7.75094276443249] as const
export const contextSampleInset = (treatment?: string) =>
  treatment === 'contextPreview' || treatment === 'contextMenu'
    ? 80
    : treatment === 'alert' || treatment === 'confirmation'
      ? 48
      : 20

/* Context isolation is a filtered screen or an unfiltered element, never a lens.
 * Coefficients: measured-reference/review-1/measurements/{light,dark}-context.json.
 * Effective sigma is below one pixel in these Simulator recordings. Do not
 * substitute a conventional material blur radius without a new measurement. */
export const contextBackdropFit = {
  light: { sigma: 0.031692773778513594, gain: 0.8010016469847555, bias: -0.4095190853094271 / 255 },
  dark: { sigma: 0.034251656122903235, gain: 0.5188529641684325, bias: -0.3273089787388216 / 255 },
} as const

export const contextComposite = {
  uniforms: ['uResolution', 'uShape', 'uRadius', 'uFilter', 'uAxis', 'uShadow'],
  textures: ['uTexture'],
  wgsl: `
struct P { resolution:vec4f, shape:vec4f, radius:vec4f, response:vec4f, axis:vec4f, shadow:vec4f }
@group(0) @binding(0) var<uniform> p:P;
@group(0) @binding(1) var s:sampler;
@group(0) @binding(2) var source:texture_2d<f32>;
// Gaussian integral of a rounded rectangle. Integrate horizontal CDF slices
// through the true rounded aperture, rather than a distance-only halo.
fn cdf(v:f32)->f32 {
 let z=abs(v)/sqrt(2.0);let t=1.0/(1.0+.3275911*z);
 let erf=1.0-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*exp(-z*z);
 return .5*(1.0+sign(v)*erf);
}
fn shadowAt(point:vec2f)->f32 {
 let sigma=p.shadow.x;if(sigma<=0.0){return 0.0;}
 let local=point-p.shape.xy-vec2f(0,p.shadow.z);var total=0.0;
 let step=2*p.shape.w/64.0;let exponent=select(2.0,2.900378259,p.radius.y>0.0);
 for(var i=0;i<64;i++){
  let yy=-p.shape.w+(f32(i)+.5)*step;let dy=(yy-local.y)/sigma;
  let corner=max(0.0,abs(yy)-(p.shape.w-p.radius.x));
  let halfWidth=p.shape.z-p.radius.x+p.radius.x*pow(max(0.0,1.0-pow(corner/p.radius.x,exponent)),1.0/exponent);
  total+=(cdf((halfWidth-local.x)/sigma)-cdf((-halfWidth-local.x)/sigma))*exp(-.5*dy*dy)*step/(sigma*sqrt(6.283185307));
 }
 return total*p.shadow.y;
}
@fragment fn main(@location(0) uv:vec2f,@location(1) coord:vec2f)->@location(0) vec4f {
 var colour=textureSampleLevel(source,s,uv,0);
 if(p.response.x>0.001){
  var total=1.0;
  for(var i=1;i<=6;i++){
   let w=exp(-.5*pow(f32(i)*.5,2));
   let delta=p.axis.xy*f32(i)*.5*p.response.x/p.resolution.xy;
   colour+=(textureSampleLevel(source,s,uv+delta,0)+textureSampleLevel(source,s,uv-delta,0))*w;
   total+=2*w;
  }
  colour/=total;
 }
 let point=coord*p.resolution.xy;
 let q=abs(point-p.shape.xy)-p.shape.zw+p.radius.x;
 let distance=length(max(q,vec2f(0)))+min(max(q.x,q.y),0)-p.radius.x;
 let coverage=1-smoothstep(-.5,.5,distance);
 let face=vec4f(clamp(colour.rgb*p.response.y+vec3f(p.response.z)*colour.a,vec3f(0),vec3f(1)),colour.a)*select(coverage,1.0,p.radius.y>0.0);
 return face+vec4f(0,0,0,shadowAt(point))*(1-face.a);
}`,
} as const
