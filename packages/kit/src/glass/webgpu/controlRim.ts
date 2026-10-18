/** Control optics calibrated against stock regular glass on iPadOS 27.0,
 * at 2 physical pixels/pt. See the implementation contract and the
 * default-setting remeasurement notes. The exterior line, directional interior shade,
 * bright specular and broad shadow are measured separately.
 */
export function controlRimUniform(appearance: 'light' | 'dark'): [number, number, number, number] {
  // Exterior support in points, coverage, appearance blend, vertical response.
  return appearance === 'light' ? [0.5, 1, 0, 0.3] : [0.5, 1, 1, 0]
}

/** Dark regular glass changes with the short side. Hardware 44/62 pt white
 * interiors are about 185; the 80 pt rectangle is about 160 before edge attenuation.
 * Preserve the historical 64..100 pt bounded growth; only 44/62/80 are measured
 * on this hardware, so larger sizes remain an extrapolation.
 */
export function controlSizeResponse(
  appearance: 'light' | 'dark',
  width: number,
  height: number,
): number {
  return appearance === 'dark'
    ? (1.58676747 / 255) * Math.min(36, Math.max(0, Math.min(width, height) - 64))
    : 0
}

/** Hardware white exterior: 44 pt dark circle 113, 80 pt rectangle 87.
 * The boundary and interior size terms were jointly fitted to the default material. */
export function controlBoundarySizeResponse(
  appearance: 'light' | 'dark',
  width: number,
  height: number,
): number {
  return appearance === 'dark'
    ? (1.67783661 / 255) * Math.min(36, Math.max(0, Math.min(width, height) - 64))
    : 0
}

/** White-room shadow fit, independently of the narrow line. Recipe radius
 * 6.09035917 and offset 8.05076614 give RMS 0.37 levels over 1.25..9.75 pt.
 * The recipe opacity is 0.04, hence 10.2 code levels before this scale.
 */
export function controlShadowScale(
  appearance: 'light' | 'dark',
  width: number,
  height: number,
): number {
  const growth = Math.min(16, Math.max(0, Math.min(width, height) - 64)) / 16
  return (3.14116032 + (appearance === 'dark' ? 6.94374306 : 4.42720708) * growth) / 10.2
}

/** Native stripe phase across 44/62/80 pt controls follows the short side.
 * The material refraction profile is expressed at the 62 pt tab reference.
 * Keep this separate from the SDF used to clip and shade the actual contour.
 */
export function controlOpticalScale(width: number, height: number): number {
  return Math.max(0, Math.min(width, height)) / 62
}

/** Independent native stripe fits separate displacement amplitude from radial
 * support. A single size multiplier cannot reproduce both: light 44/80 pt
 * controls fit 19.227/38.959 pt amplitude and 11.419/18.841 pt support.
 * Dark support includes the independently registered 62 pt tab measurement.
 * Beyond the measured 44..80 pt interval, scale the nearest endpoint with size.
 * The 0.4 pt onset is fixed in the stripe fit; it is not a fitted private parameter.
 */
export function controlTransmission(
  appearance: 'light' | 'dark',
  width: number,
  height: number,
): [number, number, number, number] {
  const side = Math.max(0, Math.min(width, height))
  const measured = Math.min(80, Math.max(44, side))
  const scale = side / measured
  const amplitude =
    appearance === 'light'
      ? 19.227 + ((measured - 44) * (38.959 - 19.227)) / 36
      : 18.95 + ((measured - 44) * (37.11 - 18.95)) / 36
  const support =
    appearance === 'light'
      ? 11.419 + ((measured - 44) * (18.841 - 11.419)) / 36
      : measured <= 62
        ? 11.54 + ((measured - 44) * (15.012 - 11.54)) / 18
        : 15.012 + ((measured - 62) * (20.22 - 15.012)) / 18
  return [amplitude * scale, Math.max(0.001, support * scale), 0.4, 1]
}

/** Low-backdrop exterior coverage; the bright-backdrop correction differs by appearance. */
export const CONTROL_RIM_LOW_LUMA_GAIN = 0.95
export const CONTROL_RIM_HIGH_LUMA_GAIN = [0.05, 0.114] as const

/** Joint fit on hardware flat-room and photo interior profiles. Distances are points.
 * Narrow support/amount, diffuse support/amount. Colour response remains in
 * the native SDF matrix; the refraction mapping is independent of these terms.
 */
export const CONTROL_SPECULAR = [1.25, 1.46970299, 6.4, 0.35554162] as const

/** Lateral, vertical and top attenuation, then lateral falloff end in points. */
export const CONTROL_INTERIOR_SHADE = [0.01828576, 0.0104923, 0.01663575, 14] as const

export const controlRimWGSL = /* wgsl */ `
fn materialBoundary(distance: f32, normal: vec2<f32>, uv: vec2<f32>) -> vec4<f32> {
    let rim = global.uControlRim_slot;
    let angular = normal.x * normal.x + rim.w * normal.y * normal.y;
    let backdrop = materialMip(uv, 0.0);
    let luminance = dot(backdrop, vec3f(0.2126, 0.7152, 0.0722));
    let opacity = rim.y + ${CONTROL_RIM_LOW_LUMA_GAIN} * max(0.5 - luminance, 0.0)
        + mix(${CONTROL_RIM_HIGH_LUMA_GAIN[0]}, ${CONTROL_RIM_HIGH_LUMA_GAIN[1]}, rim.z) * max(2.0 * luminance - 1.0, 0.0);
    let radial = opacity * clamp(1.0 - max(distance, 0.0) / rim.x, 0.0, 1.0);
    // Size sweep: exterior contrast changes linearly above mid-grey, while the face
    // changes quadratically. Normalizing by luminance expresses that contrast as coverage.
    let sizeContrast = global.uControlSize_slot.z * max(2.0 * luminance - 1.0, 0.0);
    let sizeCoverage = sizeContrast / max(0.6 * luminance, 0.001);
    let coverage = clamp(radial * angular * (1.0 + sizeCoverage), 0.0, 1.0);
    // Nine-level native sweep: light reflects a quadratic colour transform;
    // dark retains a small highlight in the upper half of the backdrop range.
    let lightColour = clamp(backdrop * (backdrop - vec3f(0.5)), vec3f(0.0), vec3f(1.0));
    let darkColour = 0.6 * max(backdrop - vec3f(0.5), vec3f(0.0)) * (vec3f(1.0) - backdrop);
    let colour = mix(lightColour, darkColour, rim.z);
    return vec4f(colour * coverage, coverage);
}
// iPad regular glass, black/grey/white room. The face has a shallow
// lateral attenuation and a separate band inside its top edge. These terms
// depend on the surface normal and depth, independently of the bright lobe.
fn controlInteriorShade(distance: f32, normal: vec2<f32>) -> f32 {
    let depth = max(-distance, 0.0);
    let shade = global.uInnerShade_slot;
    let lateral = shade.x * normal.x * normal.x
        * smoothstep(0.0, 0.75, depth) * (1.0 - smoothstep(4.0, shade.w, depth));
    let vertical = shade.y * normal.y * normal.y
        * smoothstep(0.0, 1.0, depth) * (1.0 - smoothstep(3.0, 7.0, depth));
    let topFacing = max(-normal.y, 0.0);
    let top = shade.z * topFacing * topFacing
        * smoothstep(0.0, 8.0, depth) * (1.0 - smoothstep(11.0, 20.0, depth));
    return lateral + vertical + top;
}
fn controlSpecular(distance: f32, normal: vec2<f32>) -> f32 {
    let profile = global.uControlSpecular_slot;
    let depth = max(-distance, 0.0);
    let narrow = profile.y * max(1.0 - depth / profile.x, 0.0);
    let diffuse = profile.w * max(1.0 - depth / profile.z, 0.0);
    let facing = clamp((abs(normal.y) - 0.16) / 0.84, 0.0, 1.0);
    return (narrow + diffuse) * facing * facing * facing;
}
`
