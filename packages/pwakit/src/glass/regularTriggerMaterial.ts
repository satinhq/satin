/* Phase reference fit fitting-only export. See frozen-model.json for source and splits.
 * Context is encoded-sRGB disc integration. The response consumes the existing
 * blurred/refracted pixel; it does not own or alter diffusion or lens geometry.
 */
export const REGULAR_TRIGGER_MATERIAL = {
  radiusPt: 52,
  thresholds: {
    light: 49.25,
    dark: 228,
  },
  models: {
    'light-0': [
      0.23357323336904154, -0.12025038168260119, 0.7223854586442838, -0.3451911179708627, 1,
    ],
    'light-1': [
      0.4425394744439445, -0.003838997933491911, 0.34505442834797134, 0.21213920995723007,
      0.9999999999998385,
    ],
    'dark-0': [
      0.5358530945042601, 0.06152028922900846, 0.7019229824978999, -0.24774618727435888,
      0.7674240204118238,
    ],
    'dark-1': [
      0.4425394744439445, -0.003838997933491911, 0.34505442834797134, 0.21213920995723007,
      0.9999999999998385,
    ],
  },
  neutralCurves: [
    [
      [0.0, 0.07450980392156863],
      [0.06274509803921569, 0.09019607843137255],
      [0.12549019607843137, 0.10980392156862745],
      [0.18823529411764706, 0.13333333333333333],
      [0.19215686274509805, 0.13333333333333333],
      [0.2, 0.1411764705882353],
      [0.2196078431372549, 0.1450980392156863],
      [0.25098039215686274, 0.1607843137254902],
      [0.2823529411764706, 0.18823529411764706],
      [0.32941176470588235, 0.2392156862745141],
      [0.39215686274509803, 0.2901960784313769],
      [0.4549019607843137, 0.32941176470588235],
      [0.5019607843137255, 0.34509803921568627],
      [0.5176470588235295, 0.35294117647057927],
      [0.5803921568627451, 0.3686274509803948],
      [0.6431372549019608, 0.3803921568627337],
      [0.7058823529411765, 0.3882352941176591],
      [0.7686274509803922, 0.4078431372548884],
      [0.8313725490196079, 0.4196078431372463],
      [0.8470588235294118, 0.4196078431372549],
      [0.8627450980392157, 0.4235294117647119],
      [0.8784313725490196, 0.42745098039215684],
    ],
    [
      [0.2, 0.6666666666666666],
      [0.2196078431372549, 0.6705882352941176],
      [0.25098039215686274, 0.6784313725490196],
      [0.2823529411764706, 0.6980392156862745],
      [0.32941176470588235, 0.7215686274509999],
      [0.39215686274509803, 0.7450980392156805],
      [0.4549019607843137, 0.7764705882353182],
      [0.5019607843137255, 0.8],
      [0.5176470588235295, 0.8156862745097768],
      [0.5803921568627451, 0.8549019607843014],
      [0.6431372549019608, 0.8823529411764569],
      [0.7058823529411765, 0.9058823529411764],
      [0.7686274509803922, 0.9294117647058983],
      [0.8313725490196079, 0.9529411764705527],
      [0.8470588235294118, 0.9568627450980393],
      [0.8627450980392157, 0.9607843137254903],
      [0.8784313725490196, 0.9647058823529412],
      [0.9098039215686274, 0.9725490196078431],
      [0.9568627450980393, 0.9843137254902143],
      [0.9725490196078431, 0.9882352941176471],
      [1.0, 0.9921568627450981],
    ],
  ],
  identifiability: {
    'dark-1':
      'Only neutral fitting scenes; response parameters tied to light bright, whose observed neutral response is identical.',
  },
} as const

export function regularTriggerRegime(contextLuminance: number, appearance: 'light' | 'dark') {
  return contextLuminance * 255 > REGULAR_TRIGGER_MATERIAL.thresholds[appearance] ? 1 : 0
}

function curveGlsl(knots: readonly (readonly number[])[]) {
  return knots
    .slice(1)
    .map((q, i) => {
      const p = knots[i]
      return `${i < knots.length - 2 ? `if (value <= ${q[0].toFixed(12)}) ` : ''}return ${p[1].toFixed(12)} + (value - ${p[0].toFixed(12)}) * ${((q[1] - p[1]) / (q[0] - p[0])).toFixed(12)};`
    })
    .join('\n')
}
export const REGULAR_TRIGGER_MATERIAL_GLSL = `
uniform vec4 uTriggerContext;
uniform vec4 uTriggerResponse;
uniform float uTriggerChroma;
uniform float uTriggerRegime;
uniform float uTriggerEnabled;
float triggerNeutral(float value) {
 if (uTriggerRegime < .5) { ${curveGlsl(REGULAR_TRIGGER_MATERIAL.neutralCurves[0])} }
 ${curveGlsl(REGULAR_TRIGGER_MATERIAL.neutralCurves[1])}
}
vec3 triggerMaterial(vec3 local) {
 const vec3 weights = vec3(.2126,.7152,.0722);
 vec3 rgb = mix(uTriggerContext.rgb, local, uTriggerResponse.x);
 float luminance = dot(rgb,weights);
 float grey = triggerNeutral(luminance) + uTriggerResponse.y * uTriggerContext.a;
 vec3 colour = mix(rgb,local,uTriggerChroma);
 return clamp(vec3(grey) + (colour-dot(colour,weights)) * (uTriggerResponse.z+uTriggerResponse.w*luminance),0.0,1.0);
}
`
