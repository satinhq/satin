/** Explicit development views. Distances shown by the shader are framebuffer pixels. */
export const LENS_DEBUG_VIEWS = [
  'normal',
  'displacement',
  'rim-mask',
  'signed-displacement',
  'transmission',
  'magnification',
  'refraction',
  'dispersion',
  'highlight',
  'shadow',
  'foreground',
  'edge-map',
  'face',
  'key',
  'fill',
  'diffuse',
  'background-highlight',
  'optics',
  'foreground-edge',
] as const
export type LensDebugView = (typeof LENS_DEBUG_VIEWS)[number]
export function lensDebugIndex(view: LensDebugView) {
  const index = LENS_DEBUG_VIEWS.indexOf(view)
  if (index < 0) throw Error('Unknown lens debug view: ' + view)
  return index
}
