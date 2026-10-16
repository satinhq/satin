import samples from './tabCollapseInkSamples.json'

/** Native expanded ink keeps its spacing while the aperture clips and fades it.
 * The selected glyph has its own full-opacity path to the compact button. */
export function tabMinimizeInkFrame({
  progress,
  fade,
  width,
  centre,
  selectedCentre,
  selected,
  compactCentre = 31,
}: {
  progress: number
  fade: number
  width: number
  centre: number
  selectedCentre: number
  selected: boolean
  compactCentre?: number
}) {
  const bounded = Math.max(0, Math.min(1, fade))
  const curve = samples.fadeScale
  const upper = curve.findIndex(sample => sample[0] >= bounded)
  const b = curve[Math.max(0, upper)]!,
    a = curve[Math.max(0, upper - 1)]!
  const scale = selected
    ? 1
    : a[1]! + (b[1]! - a[1]!) * (b[0] === a[0] ? 0 : (bounded - a[0]!) / (b[0]! - a[0]!))
  const x = (compactCentre - selectedCentre) * progress + (width / 2 - centre) * (1 - scale)
  return { x, scale, opacity: selected ? 1 : 1 - bounded }
}
