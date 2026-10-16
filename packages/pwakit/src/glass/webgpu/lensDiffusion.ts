/** Separable input diffusion for retained pressed material, before displacement. */
export const lensDiffusionFragment = /* glsl */ `
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec2 uStep;
uniform float uSigma;
void main(){
  vec3 sum=vec3(0.0);float total=0.0;
  float sigma=max(.01,uSigma);
  float spacing=max(1.0,3.0*sigma/32.0);
  for(int i=-32;i<=32;i++){
    float offset=float(i)*spacing;
    float weight=exp(-.5*pow(offset/sigma,2.0));
    sum+=texture(uTexture,clamp(vTextureCoord+uStep*offset,vec2(0.0),vec2(1.0))).rgb*weight;
    total+=weight;
  }
  finalColor=vec4(sum/total,1.0);
}`
