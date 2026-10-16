/** Shared clear transmission kernel. The resting reference graph is a separate input.
 * Geometry is the frozen 11k fit. Optical point conversion remains provisional.
 * Output belongs ABOVE semantic foreground. Inside an active aperture it replaces
 * that foreground with one warped atlas image. Zero lift is exactly transparent.
 * The optical field and directional highlight are independent of bar material.
 */
export const sharedLiftFragment = /* glsl */ `
precision highp float;
in vec2 vTextureCoord;
in vec2 vFilterCoord;
out vec4 finalColor;
uniform sampler2D uClearSource;
uniform sampler2D uRestSource;
uniform sampler2D uGlyphSource;
uniform vec2 uResolution;
uniform vec4 uShape;
uniform float uRadius;
uniform float uLiftMix;
uniform vec4 uLensField;
uniform vec4 uLensMap;
// (amplitude, centre pt below the rim, rim-side sigma, centre-side sigma): the top inner shadow.
uniform vec4 uLensTopShade;
uniform vec4 uLensDebug;
uniform vec4 uLensLighting;
uniform float uLensBandScale;
uniform vec2 uLensBandDirections;
uniform vec4 uLensFringe;
uniform vec2 uLensFaceTreatment;
uniform vec4 uLensDepthShade;
uniform float uLensDepthIsotropic;
uniform vec4 uLensCrestVertical;
uniform vec3 uLensExteriorShadow;
uniform float uLensLightRotation;
uniform vec4 uLensLightStrength;
uniform vec4 uLensLightingClock;
uniform vec4 uLensLightingClock2;
uniform float uMotionMix;
uniform float uBackgroundWarpPt;
uniform float uTravelWarpPt;
uniform float uForegroundChroma;
uniform float uForegroundScaleX;
uniform float uForegroundScaleY;
uniform float uForegroundLabelScaleX;
uniform float uForegroundLabelScaleY;
uniform vec2 uForegroundShiftPt;
uniform vec3 uCapBendIcon;
uniform vec3 uCapBendLabel;
uniform float uRimGradient;
uniform vec2 uGlyphAnchors;
uniform float uGlyphCount;
uniform vec4 uDockShape;
uniform vec2 uGlyphVibrancy;
float sdRoundRect(vec2 point,vec2 halfSize,float radius) {
  vec2 q=abs(point)-halfSize+radius;
  return min(max(q.x,q.y),0.0)+length(max(q,0.0))-radius;
}
vec3 dockColour(vec2 uv) {
  // This is the actual surface behind this lens, including lower glass when
  // present. Never substitute the lens's own frosted material for transmission.
  return texture(uClearSource,clamp(uv,vec2(0.0),vec2(1.0))).rgb;
}
void movingLens(vec2 point, float sd, out vec3 background, out vec4 glyph, out vec2 displacement, out float rimMask) {
  vec2 p=point-uShape.xy;
  vec2 q=abs(p)-uShape.zw+uRadius;
  vec2 a=max(q,0.0);
  float len=length(a);
  vec2 outward=len>0.0?sign(p)*a/len:(q.x>q.y?vec2(sign(p.x),0.0):vec2(0.0,sign(p.y)));
  float inside=max(0.0,-sd);
  // Distances here are explicit point-space hypotheses. The archived field
  // texture scale was not material; it must be qualified against stills.
  // Distance support is directional. The narrow cap must not inherit the
  // straight edge's wider sampling band. Amplitudes and DPR stay unchanged.
  float capWeight=outward.x*outward.x;
  float verticalBand=outward.y>0.0?uLensBandDirections.y:uLensBandScale;
  float band=mix(verticalBand,uLensBandDirections.x,capWeight);
  float opticalDistance=inside/max(.001,band);
  float displacementProfile=pow(max(0.0,1.0-opticalDistance/max(.001,uLensField.z)),1.0);
  float depth=clamp(opticalDistance/max(.001,uLensField.y),0.0,1.0);
  float edgeRefraction=uLensField.x*(1.0-sqrt(depth*(2.0-depth)));
  float mode=uLensDebug.x;
  bool allTerms=mode<4.0;
  // Native selected-lens maps: +9 over 36 local points, -17.5 over
  // 11.2. Inverse sampling subtracts map displacement. This analytic normal
  // field substitutes for the unmaterial map texture, not its material IR.
  // The fitted band scale converts field distance to window points without
  // changing signed displacement amplitude. DPR is applied by rasterization only.
  // uLensMap = (broad amplitude, broad support, edge amplitude, medial fade); the tab lens is (9, 36, -17.5, 0).
  // A negative broad amplitude samples outward: a held control thumb shows the track slightly
  // minified, so the row beyond the track edges reads as dark bands inside the rim.
  // uLensMap.w > 0 (controls only): the broad map fades to 0 within w pt of the medial axis, where
  // the normal flips, so a thin track through the lens centre passes at gain 1 (Slider).
  float medialFade=uLensMap.w>0.0?smoothstep(0.5*uLensMap.w,uLensMap.w,max(0.0,uRadius-inside)):1.0;
  float broadMap=uLensMap.x*uLiftMix*max(0.0,1.0-opticalDistance/max(.001,uLensMap.y))*medialFade;
  float edgeMap=uLensMap.z*uLiftMix*displacementProfile;
  vec2 sourcePoint=point;
  if(allTerms||mode==17.0||mode==5.0)sourcePoint-=outward*broadMap;
  if(allTerms||mode==17.0||mode==11.0)sourcePoint-=outward*edgeMap;
  if(allTerms||mode==17.0||mode==6.0)sourcePoint+=outward*edgeRefraction+vec2(uTravelWarpPt*displacementProfile,0.0);
  displacement=sourcePoint-point;
  vec2 uv=sourcePoint/uResolution;
  // Spectral support is independent from refraction support. Press height
  // supplies its existing clock; straight edges and caps have fitted widths.
  float fringeWidth=mix(uLensFringe.z,uLensFringe.w,capWeight)*uLensField.z/11.2;
  float fringe=pow(max(0.0,1.0-inside/max(.001,fringeWidth)),2.0);
  float fringeGain=mix(uLensFringe.x,uLensFringe.y,capWeight);
  vec2 dispersion=outward*uLensField.w*fringeGain*fringe/uResolution;
  if(!allTerms&&mode!=17.0&&mode!=7.0)dispersion=vec2(0.0);
  background=vec3(dockColour(uv+dispersion).r,dockColour(uv).g,dockColour(uv-dispersion).b);
  // Face/output treatment, background highlights, independent SDF key/fill
  // and diffuse lobes, then foreground. Never brighten the resting bar input.
  float height=uLensLighting.z;
  float offset=uLensLighting.w;
  float faceClock=uLensLightingClock.x;
  float lightClock=uLensLightingClock.y;
  // Measured output crest in window points. Unlike the former finite-support
  // lobe, this has no discontinuity at an interior mask offset. Directional
  // key/fill and symmetric background terms retain separate output clocks.
  float crest=exp(-.5*pow((inside-offset)/max(.001,height),2.0));
  float nx=dot(outward,vec2(cos(uLensLightRotation),sin(uLensLightRotation)));
  float key=crest*pow(max(nx,0.0),2.0);
  float fill=crest*pow(max(-nx,0.0),2.0);
  // A broad smooth diffuse term replaces the offset onset that made an inner
  // contour. Width is 8 times the native-derived 6pt projection estimate.
  float diffuse=mix(1.0,exp(-.5*pow(inside/max(.001,48.0*uLensLightingClock.z),2.0)),uLensFaceTreatment.y)*uLensLightingClock.w;
  if(allTerms||mode==12.0){
    float faceLuma=dot(background,vec3(.2126,.7152,.0722));
    vec3 face=mix(vec3(faceLuma),background,uLensFaceTreatment.x);
    background=mix(background,clamp(face*uLensLighting.x+uLensLighting.y,0.0,1.0),faceClock);
  }
  float H=0.0;
  if(allTerms||mode==8.0||mode==13.0)H+=key*uLensLightStrength.x*lightClock;
  if(allTerms||mode==8.0||mode==14.0)H+=fill*uLensLightStrength.y*lightClock;
  if(allTerms||mode==8.0||mode==16.0)H+=crest*(pow(max(-outward.y,0.0),2.0)*uLensCrestVertical.x+pow(max(outward.y,0.0),2.0)*uLensCrestVertical.y)*lightClock;
  if(allTerms||mode==8.0||mode==15.0)H+=diffuse*uLensLightStrength.z;
  rimMask=crest*lightClock;
  background=mix(background,vec3(1.0),clamp(H,0.0,.95));
  // Neutral output shading is independent of spectral sampling. The narrow
  // output rim and broader directional key/fill projection have separate clocks.
  float shadeCap=mix(capWeight,1.0,uLensDepthIsotropic);
  float shade=uLensDepthShade.x*faceClock
    +uLensDepthShade.y*exp(-inside/1.2)*lightClock
    +(uLensDepthShade.z*shadeCap+uLensDepthShade.w*(1.0-shadeCap))*exp(-inside/6.0)*uLensLightingClock.w;
  // Isotropic button shading consumes available tonal contrast. A constant
  // additive shade dirtied white faces and made a bright perimeter around them.
  float shadeLuma=dot(background,vec3(.2126,.7152,.0722));
  shade*=mix(1.0,clamp(4.0*shadeLuma*(1.0-shadeLuma),0.0,1.0),uLensDepthIsotropic);
  // Controls: native's held lens darkens the upper half below its top rim (a top inner shadow),
  // deepest ≈ 9 pt in and gone by the lens centre line; the lower half stays at the face level.
  // Depth below the top edge, not the SDF: a horizontal band, so it never curls through the caps.
  float topOffset=(uShape.w+p.y)-uLensTopShade.y;
  float topScaled=topOffset/max(.001,topOffset<0.0?uLensTopShade.z:uLensTopShade.w);
  shade+=uLensTopShade.x*exp(-.5*topScaled*topScaled)*(1.0-smoothstep(-1.0,1.0,p.y))*uLensLightingClock.w;
  if(allTerms||mode==8.0)background=clamp(background+vec3(shade),0.0,1.0);
  float edgeShift=max(0.0,uGlyphAnchors.x-uShape.x)-max(0.0,uShape.x-uGlyphAnchors.y);
  // The cap folds a foreground stroke inward; the flat top must not pull
  // a second gear into the highlight. This foreground field is independent
  // of the backdrop transmission field.
  float foregroundResponse=clamp(uForegroundChroma/255.0,0.0,1.0);
  float label=step(uDockShape.y,point.y);
  vec2 magnification=vec2(1.0+mix(uForegroundScaleX,uForegroundLabelScaleX,label),
    1.0+mix(uForegroundScaleY,uForegroundLabelScaleY,label));
  float capBend=3.0*abs(outward.x)*displacementProfile*foregroundResponse;
  // Native magnifies each tab's content at its own anchor. Magnifying the
  // atlas around the travelling lens center makes glyphs slide sideways and
  // disappear into the wrong cap as the aperture crosses between tabs.
  float lastIndex=max(0.0,uGlyphCount-1.0);
  float spacing=max(1.0,(uGlyphAnchors.y-uGlyphAnchors.x)/max(1.0,lastIndex));
  float anchorIndex=clamp(floor((point.x-uGlyphAnchors.x)/spacing+.5),0.0,lastIndex);
  float anchor=uGlyphAnchors.x+anchorIndex*spacing;
  vec2 glyphPoint=vec2(anchor+(point.x-anchor)/magnification.x,uShape.y+p.y/magnification.y);
  // Fitting glyph-crop centres shows a leading-cap fold beyond the interior
  // magnification. Its sigmoid is spatial, so the nearer stroke bends more.
  float lead=sign(uTravelWarpPt);
  vec3 fold=mix(uCapBendIcon,uCapBendLabel,label);
  float leadingDistance=lead>0.0?uShape.x+uShape.z-point.x:point.x-(uShape.x-uShape.z);
  float leadingFold=lead*fold.x/(1.0+exp(clamp((leadingDistance-fold.y)/fold.z,-30.0,30.0)));
  glyphPoint.x-=leadingFold;
  vec2 glyphUv=(glyphPoint-outward*capBend+vec2(edgeShift/magnification.x-mix(uForegroundShiftPt.x,uForegroundShiftPt.y,label)*uMotionMix,0.0))/uResolution;
  vec2 soften=outward*.75*abs(outward.x)*exp(-inside/6.0)*foregroundResponse/uResolution;
  bool selected=true;
  if(selected){
    glyph=texture(uGlyphSource,clamp(glyphUv,vec2(0.0),vec2(1.0)))*.4
      +(texture(uGlyphSource,clamp(glyphUv+soften*.5,vec2(0.0),vec2(1.0)))
        +texture(uGlyphSource,clamp(glyphUv-soften*.5,vec2(0.0),vec2(1.0))))*.24
      +(texture(uGlyphSource,clamp(glyphUv+soften,vec2(0.0),vec2(1.0)))
        +texture(uGlyphSource,clamp(glyphUv-soften,vec2(0.0),vec2(1.0))))*.06;
    glyph.gb=clamp(glyph.gb+uGlyphVibrancy*glyph.a*uMotionMix,vec2(0.0),vec2(glyph.a));
  }
  // Foreground edge opacity falls from one at -14 local units to zero
  // at the contour in the held sample. The conversion remains provisional.
  if(allTerms||mode==18.0)glyph*=mix(1.0,clamp(inside/14.0,0.0,1.0),uLensLightingClock2.z);
  if(!allTerms&&mode!=10.0&&mode!=18.0)glyph=vec4(0.0);
}

void main() {
  if(uLiftMix<=0.0){finalColor=vec4(0.0);return;}
  vec2 point=vFilterCoord*uResolution;
  float sd=sdRoundRect(point-uShape.xy,uShape.zw,uRadius);
  // Control rim (uLensCrestVertical.zw = dark line gain, width pt): device-pixel edge, crisp line.
  float rimAa=uLensCrestVertical.w>0.0?.5/max(1.0,uLensDebug.y):.4;
  float coverage=smoothstep(rimAa,-rimAa,sd);
  vec3 transmitted;vec4 glyph;vec2 displacement;float rimMask;
  movingLens(point,sd,transmitted,glyph,displacement,rimMask);
  // 1 point displaces d framebuffer pixels here. Neutral blue=0, red=32px.
  if(uLensDebug.x==1.0){float m=clamp(length(displacement)*uLensDebug.y/uLensDebug.z,0.0,1.0);finalColor=vec4(vec3(m,4.0*m*(1.0-m),1.0-m)*coverage,coverage);return;}
  if(uLensDebug.x==2.0){finalColor=vec4(vec3(rimMask)*coverage,coverage);return;}
  // RG encode signed x/y displacement around 0.5, at +/-32 framebuffer px.
  if(uLensDebug.x==3.0){finalColor=vec4(vec3(vec2(.5)+displacement*uLensDebug.y/(2.0*uLensDebug.z),0.0)*coverage,coverage);return;}
  vec3 rest=texture(uRestSource,clamp(vFilterCoord,vec2(0.0),vec2(1.0))).rgb;
  vec3 body=mix(rest,transmitted,clamp(uLiftMix,0.0,1.0));
  float rimPx=.5/max(1.0,uLensDebug.y);
  body*=1.0-uLensCrestVertical.z*(1.0-smoothstep(uLensCrestVertical.w-rimPx,uLensCrestVertical.w+rimPx,max(0.0,-sd)))*clamp(uLiftMix,0.0,1.0);
  // Foreground is premultiplied. Do not crossfade two differently warped glyphs.
  // Gaussian half-plane approximation of the measured exterior shadow.
  // Fit opacity/offset/spread outside the aperture, independent of face light.
  float shadowDistance=sdRoundRect(point-uShape.xy-vec2(0.0,uLensExteriorShadow.y),uShape.zw,uRadius);
  float z=shadowDistance/max(.001,uLensExteriorShadow.z)/1.41421356;
  float t=1.0/(1.0+.3275911*abs(z));
  float erf=sign(z)*(1.0-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*exp(-z*z));
  float shadow=.5*(1.0-erf)*uLensExteriorShadow.x*uLensLightingClock2.y;
  if(uLensDebug.x>=4.0&&uLensDebug.x!=9.0)shadow=0.0;
  finalColor=vec4((body*(1.0-glyph.a)+glyph.rgb)*coverage,coverage+(1.0-coverage)*shadow);
}`
