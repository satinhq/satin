/** Exterior rim measured from the iOS 27 stock 44 pt circle, at 3 device pixels/pt.
 * See scripts/research/glass-blackroom/fit-rim.py and the round-2 evidence packet.
 *
 * The dark line is outside the material aperture. Its colour comes from the local
 * backdrop, while the interior specular is a separate normal-dependent lobe.
 * Both lateral normals have the same response; a signed horizontal term would
 * introduce lighting that the native flat-background captures do not contain.
 */
export function controlRimUniform(appearance: 'light' | 'dark'): [number, number, number, number] {
  // Coverage/low-luma gain jointly fit to 36 native pixels over nine backdrop levels.
  // Exterior support (pt), coverage at contour, dark-appearance blend, vertical response.
  return appearance === 'light' ? [5 / 6, 0.75531308, 0, 0.32] : [5 / 6, 0.75531308, 1, 0]
}

/** Native dark regular glass changes with the short side, independently of corner radius.
 * The 44/50/62/64/70/80/100 pt sweep measured white interior 185/185/185/185/175/159/128.
 * Grey and 75% grey deltas follow backdrop squared. Limit extrapolation to the measured range.
 */
export function controlSizeResponse(
  appearance: 'light' | 'dark',
  width: number,
  height: number,
): number {
  return appearance === 'dark'
    ? (1.6 / 255) * Math.min(36, Math.max(0, Math.min(width, height) - 64))
    : 0
}

/** White backdrop, bottom exterior at 2 pt: native 44/62 pt controls are 252,
 * 80 pt controls are 248 light / 246 dark; the unscaled kernel is 245.
 * Keep the broad shadow separate from the sub-point rim coverage.
 */
export function controlShadowScale(
  appearance: 'light' | 'dark',
  width: number,
  height: number,
): number {
  const growth = Math.min(16, Math.max(0, Math.min(width, height) - 64)) / 16
  return 0.3 + (appearance === 'dark' ? 0.6 : 0.4) * growth
}

/** Native 44 pt sweep at background code levels 32/64/96/128: first exterior pixel 6/17/32/52. */
export const CONTROL_RIM_LOW_LUMA_GAIN = 0.6891894

/** Joint least-squares fit of the unclipped black/grey/white cardinal profiles.
 * Final amplitudes include the 1.02493656 contrast fit over 32 unclipped flat-background
 * vertical rays after the measured size response. Photo cases were held out.
 * Shared across appearances: the native colour matrix supplies their different contrast.
 * Narrow support/amount, diffuse support/amount (all support distances in points).
 */
export const CONTROL_SPECULAR = [1.25, 1.5385214, 6.4, 0.38803352] as const

export const controlRimWGSL = /* wgsl */ `
fn materialBoundary(distance: f32, normal: vec2<f32>, uv: vec2<f32>) -> vec4<f32> {
    let rim = global.uControlRim_slot;
    let angular = normal.x * normal.x + rim.w * normal.y * normal.y;
    let backdrop = materialMip(uv, 0.0);
    let luminance = dot(backdrop, vec3f(0.2126, 0.7152, 0.0722));
    let opacity = rim.y + ${CONTROL_RIM_LOW_LUMA_GAIN} * max(0.5 - luminance, 0.0);
    let radial = opacity * clamp(1.0 - max(distance, 0.0) / rim.x, 0.0, 1.0);
    // Size sweep: exterior contrast changes linearly above mid-grey, while the face
    // changes quadratically. Normalizing by luminance expresses that contrast as coverage.
    let sizeContrast = global.uControlSize_slot.x * max(2.0 * luminance - 1.0, 0.0);
    let sizeCoverage = sizeContrast / max(0.6 * luminance, 0.001);
    let coverage = clamp(radial * angular * (1.0 + sizeCoverage), 0.0, 1.0);
    // Nine-level native sweep: light reflects a quadratic colour transform;
    // dark retains a small highlight in the upper half of the backdrop range.
    let lightColour = clamp(backdrop * (backdrop - vec3f(0.5)), vec3f(0.0), vec3f(1.0));
    let darkColour = 0.6 * max(backdrop - vec3f(0.5), vec3f(0.0)) * (vec3f(1.0) - backdrop);
    let colour = mix(lightColour, darkColour, rim.z);
    return vec4f(colour * coverage, coverage);
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
