import { lagMark, lagTraceEnabled, lagTraceHasRoom } from './lagTrace.ts'
import { glassNow } from './profile.ts'

// Diagnostic capture identities follow textures, including shared graph results. A result
// keeps the capture it encoded from even after the scratch source texture is overwritten.
const captures = new WeakMap<object, number>()
const results = new WeakMap<object, number | null>()
let nextCapture = 0

export function traceCapture(source: object) {
  const capture = ++nextCapture
  captures.set(source, capture)
  return capture
}

/** Exact float32 shader inputs, before material refraction/blur. These are encoded samples,
 * not scanout evidence. Atlas poses cannot be summarized as one source rectangle. */
export function traceSourcePlane(
  source: object,
  identity: { raster: number | string; region: string; plane: string; key: string },
  uniforms: Float32Array,
  scissor: readonly number[],
  geometry: Record<string, number | string | boolean | null>,
) {
  if (!lagTraceEnabled() || !lagTraceHasRoom()) return
  const u = uniforms
  const atlas = u[52] > 0
  lagMark({
    stage: 'worker-source-plane',
    at: glassNow(),
    values: {
      ...identity,
      ...geometry,
      capture: captures.get(source) ?? null,
      uniforms: JSON.stringify(Array.from(u)),
      scissor: JSON.stringify(scissor),
      // Bounds of the scissored front-plane footprint in logical source pixels. Pixel
      // centres lie half a destination pixel inside; sampler clamping/open fill apply later.
      sourceX: atlas ? null : (scissor[0] / u[2]) * u[56] + u[4] - u[16],
      sourceY: atlas ? null : (scissor[1] / u[2]) * u[57] + u[5] + u[14],
      sourceWidth: atlas ? null : (scissor[2] / u[2]) * u[56],
      sourceHeight: atlas ? null : (scissor[3] / u[2]) * u[57],
      atlas,
    },
  })
}

export function traceResult(result: object, source: object | null) {
  results.set(result, source ? (captures.get(source) ?? null) : null)
}

export function traceSubmitted(
  result: object,
  values: Record<string, number | string | boolean | null>,
) {
  if (!lagTraceEnabled() || !lagTraceHasRoom()) return
  lagMark({
    stage: 'worker-source-submit',
    at: glassNow(),
    values: { ...values, capture: results.get(result) ?? null },
  })
}
