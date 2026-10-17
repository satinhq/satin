import type { Appearance } from './theme.ts'
import fit from './ios27GlyphFit.json'

const stops = [0, 32 / 255, 216 / 255, 1]
const indices = [0, 1, 3, 4]
const blue = [10 / 255, 132 / 255, 1]
const luma = (rgb: readonly number[]) => rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
const blueLuma = luma(blue)
const axis = blue.map(v => v - blueLuma)
const norm = axis.reduce((sum, v) => sum + v * v, 0)
function neutral(appearance: Appearance, k: number, kind: 'selected' | 'unselected') {
  const i = Math.min(2, Math.max(0, stops.findIndex((v, index) => index > 0 && k <= v) - 1))
  const t = Math.max(0, Math.min(1, (k - stops[i]) / (stops[i + 1] - stops[i])))
  return fit[appearance][indices[i]][kind].map(
    (v, c) => v + (fit[appearance][indices[i + 1]][kind][c] - v) * t,
  )
}
/** iOS 27 flat-control ink calibration. Source context is retained alongside the
 * glass mirror; scrolling needs no new GPU readback and no fixture-name lookup.
 * The chroma correction is a first-order fit, pending textured ink acceptance.
 */
export function tabGlyphContextStyle(
  appearance: Appearance,
  rgb: readonly number[],
  tint?: string,
) {
  const k = luma(rgb)
  const chroma = rgb.reduce((sum, v, i) => sum + (v - k) * axis[i], 0) / norm
  const colour = (kind: 'selected' | 'unselected') => {
    const blueNeutral = neutral(appearance, blueLuma, kind)
    return `rgb(${neutral(appearance, k, kind)
      .map((v, i) =>
        Math.max(
          0,
          Math.min(255, v + chroma * (fit[appearance][2][kind][i] - blueNeutral[i])),
        ).toFixed(3),
      )
      .join(' ')})`
  }
  // Explicit author tint is a semantic colour, not the system-blue vibrancy fit.
  const selected = tint || colour('selected'),
    unselected = colour('unselected')
  return {
    '--tab-selected-icon': selected,
    '--tab-selected-label': selected,
    '--tab-unselected-icon': unselected,
    '--tab-unselected-label': unselected,
  }
}
export function tabGlyphStyle(
  appearance: Appearance,
  _background: string,
  _index: number,
  tint?: string,
) {
  return tabGlyphContextStyle(appearance, appearance === 'light' ? [1, 1, 1] : [0, 0, 0], tint)
}
