/* The scroll edge material in numbers. styles.css draws it (the --satin-edge-* properties); the
 * glass renderer composes it under glass that overlaps it (glass/webgpu/scrollEdgeBackdrop.ts); the
 * fitted status band takes its colour over the resting background (app/statusBand.ts). */

/** The scroll edge material, shared by the bar's edge and a pinned plain-list header. Measured on
 * the iOS 27.0 Simulator, iPhone 17 Pro Max, with a stock List fixture over full-width solid
 * colours and a black/white split, light and dark:
 *   out = saturate(lift + gain * blur(content)), clamped to [0, 1]
 * where blur mixes a `near` Gaussian with a `wide` one carrying `wideWeight` (sigmas in points),
 * and saturate is CSS saturate(). The saturation comes after the wash: blue (0 136 255) reads
 * 121 206 255 in light, a red channel below the 136 that black reads.
 * Light reads black as 136 and 128 grey as 200; dark reads black as 8 and white as 110. */
export const SCROLL_EDGE_MATERIAL = {
  light: { near: 4, wide: 24, wideWeight: 0.63, gain: 0.5, lift: 0.532, saturation: 1.25 },
  dark: { near: 4, wide: 24, wideWeight: 0.55, gain: 0.4, lift: 0.031, saturation: 1.25 },
} as const
export type EdgeMaterial = (typeof SCROLL_EDGE_MATERIAL)['light' | 'dark']

/** The three stacked CSS layers that draw `material` (styles.css), bottom to top:
 * - near: `blur(near) brightness(nearBrightness)` of the content;
 * - wide: `blur(wide)` of everything below (the near layer covers the content) under a fill of
 *   grey level `fillLevel` (0-255) at `fillAlpha`, the layer shown at `opacity`;
 * - finish: `saturate(saturation)` of everything below.
 * Before the finish they composite to
 *   b * ((1 - opacity) * near + opacity * (1 - fillAlpha) * wide) + opacity * fillAlpha * fill
 * (b the near brightness), which is lift + gain * blur(content) when
 *   b * (1 - opacity) = gain * (1 - wideWeight),
 *   b * opacity * (1 - fillAlpha) = gain * wideWeight,
 *   opacity * fillAlpha * fill = lift.
 * The brightness sits in the near layer because the light material's lift plus gain exceeds 1:
 * with a white fill, only a brightened layer below it reaches both. Light fills white; dark fills
 * at half alpha, which leaves a dark grey fill. */
export function edgeMaterialLayers(material: EdgeMaterial) {
  const { gain, lift, wideWeight } = material
  if (lift > 0.5) {
    // White fill: opacity * fillAlpha = lift, so the near brightness carries the rest of the gain.
    const nearBrightness = gain / (1 - lift)
    const opacity = 1 - (1 - lift) * (1 - wideWeight)
    return { nearBrightness, opacity, fillAlpha: lift / opacity, fillLevel: 255 }
  }
  const fillAlpha = 0.5
  const opacity = wideWeight / (wideWeight + (1 - fillAlpha) * (1 - wideWeight))
  const nearBrightness = (gain * (1 - wideWeight)) / (1 - opacity)
  const fillLevel = Math.round((lift * 255) / (opacity * fillAlpha))
  return { nearBrightness, opacity, fillAlpha, fillLevel }
}

/** The material as one renderer pass (glass/webgpu/edgePass.ts): a mixed blur, then
 * mix(blurred, tint, a) with a = 1 - gain and the tint carrying the lift, then the saturation.
 * The tint level can exceed 1 in light; the pass clamps after saturating. */
export function edgeMaterialPass(material: EdgeMaterial) {
  const alpha = 1 - material.gain
  const level = material.lift / alpha
  return {
    sigma: material.near,
    wide: { sigma: material.wide, weight: material.wideWeight },
    saturation: material.saturation,
    tint: [level, level, level, alpha] as const,
  }
}

/** The material over a flat colour (0-255 RGB), as a solid band beside it reads. */
export function edgeMaterialOver(
  color: readonly [number, number, number],
  material: EdgeMaterial,
): [number, number, number] {
  const washed = color.map(value => material.lift * 255 + material.gain * value)
  const luma = 0.2126 * washed[0]! + 0.7152 * washed[1]! + 0.0722 * washed[2]!
  const channel = (value: number) =>
    Math.min(255, Math.max(0, luma + (value - luma) * material.saturation))
  return [channel(washed[0]!), channel(washed[1]!), channel(washed[2]!)]
}
