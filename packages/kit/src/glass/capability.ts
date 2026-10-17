export type GlassCapabilityState = 'baseline' | 'displacement'
export type GlassRenderTestState = 'pending' | 'passed' | 'failed'

export type GlassAccessibilityPreferences = Readonly<{
  increasedContrast: boolean
  reducedMotion: boolean
  reducedTransparency: boolean
}>

export type GlassCapabilityDecision = Readonly<{
  reason:
    | 'renderer-required'
    | 'forced-baseline'
    | 'render-test-failed'
    | 'render-test-pending'
    | 'reduced-transparency'
    | 'raster-probe-passed'
  state: GlassCapabilityState
}>

export function resolveGlassCapability({
  forcedBaseline,
  reducedTransparency,
  renderTest,
}: Readonly<{
  forcedBaseline: boolean
  reducedTransparency: boolean
  renderTest: GlassRenderTestState
}>): GlassCapabilityDecision {
  if (forcedBaseline) return { reason: 'forced-baseline', state: 'baseline' }
  if (reducedTransparency) {
    return { reason: 'reduced-transparency', state: 'baseline' }
  }
  if (renderTest === 'pending') {
    return { reason: 'render-test-pending', state: 'baseline' }
  }
  if (renderTest === 'failed') {
    return { reason: 'render-test-failed', state: 'baseline' }
  }
  return { reason: 'raster-probe-passed', state: 'displacement' }
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('The foreground SVG render probe did not load.'))
    image.src = source
  })
}

/**
 * Paints a deliberately displaced standalone SVG image into a readable canvas
 * and verifies the resulting pixels. This is a raster-path prerequisite, not a
 * live-compositor proof: WebKit can pass this Image -> canvas path while an SVG
 * filter referenced by a live HTML element paints no displacement. JavaScript
 * has no pixel-read API for the latter; installed-PWA capture and the lens-boost
 * diagnostic remain the acceptance boundary.
 */
export async function runForegroundSvgRenderTest(): Promise<boolean> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return false

  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="2" viewBox="0 0 18 2">',
    '<defs><filter id="d" x="0" y="0" width="18" height="2" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">',
    '<feFlood flood-color="rgb(255 128 128)" result="map"/>',
    '<feDisplacementMap in="SourceGraphic" in2="map" scale="6" xChannelSelector="R" yChannelSelector="G"/>',
    '</filter></defs>',
    '<g id="source"><rect width="9" height="2" fill="black"/><rect x="9" width="9" height="2" fill="white"/></g>',
    '<use href="#source" filter="url(#d)"/>',
    '</svg>',
  ].join('')
  const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

  try {
    const image = await loadImage(source)
    const canvas = document.createElement('canvas')
    canvas.width = 18
    canvas.height = 2
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return false
    context.drawImage(image, 0, 0)

    // Without displacement x=7 is black. A +3 px foreground sample makes it
    // white. Keep a wide threshold so color-management rounding cannot decide
    // the gate.
    const pixel = context.getImageData(7, 1, 1, 1).data
    return pixel[0] > 220 && pixel[1] > 220 && pixel[2] > 220 && pixel[3] > 220
  } catch {
    return false
  }
}
