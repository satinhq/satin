import type { Appearance } from './theme.ts'

export type ReferenceRegularTintPreset = Readonly<{
  gains: readonly [number, number, number, number, number]
  luminances: readonly [number, number, number, number, number]
  whiteMixes: readonly [number, number, number, number, number]
}>

const LUMINANCES = [0, 0.1254902, 0.4507584, 0.8470588, 1] as const

// measured-reference native iOS 26.5 fit. Each knot is a neutral affine operator:
// out = mix(backdrop * gain, white, whiteMix). The blue knot uses a
// least-squares RGB fit; grey knots use the directly observed scalar gain.
export const REFERENCE_REGULAR_TINT_PRESETS: Readonly<
  Record<Appearance, ReferenceRegularTintPreset>
> = {
  light: {
    gains: [1, 0.875, 1.0765072, 1.1296296, 0.9921569],
    luminances: LUMINANCES,
    whiteMixes: [0.0745098, 0, 0.5659916, 0, 0],
  },
  dark: {
    gains: [1, 0.875, 0.6110944, 0.4953704, 0.9921569],
    luminances: LUMINANCES,
    whiteMixes: [0.0745098, 0, 0.0715847, 0, 0],
  },
}

function smoothUnit(value: number) {
  const clamped = Math.max(0, Math.min(1, value))
  return clamped * clamped * (3 - 2 * clamped)
}

export function referenceRegularTintAt(luminance: number, preset: ReferenceRegularTintPreset) {
  const last = preset.luminances.length - 1
  if (luminance <= preset.luminances[0])
    return { gain: preset.gains[0], whiteMix: preset.whiteMixes[0] }
  if (luminance >= preset.luminances[last])
    return { gain: preset.gains[last], whiteMix: preset.whiteMixes[last] }
  let high = 1
  while (luminance > preset.luminances[high]) high += 1
  const low = high - 1
  const progress = smoothUnit(
    (luminance - preset.luminances[low]) / (preset.luminances[high] - preset.luminances[low]),
  )
  return {
    gain: preset.gains[low] + (preset.gains[high] - preset.gains[low]) * progress,
    whiteMix:
      preset.whiteMixes[low] + (preset.whiteMixes[high] - preset.whiteMixes[low]) * progress,
  }
}

export function applyReferenceRegularTint(
  rgb: readonly number[],
  preset: ReferenceRegularTintPreset,
) {
  const luminance = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255
  const { gain, whiteMix } = referenceRegularTintAt(luminance, preset)
  return rgb.map(channel =>
    Math.max(0, Math.min(255, channel * gain * (1 - whiteMix) + 255 * whiteMix)),
  )
}
