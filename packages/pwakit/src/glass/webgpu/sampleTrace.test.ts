import { afterEach, expect, it } from 'vitest'
import { lagMarks, setLagTrace } from './lagTrace.ts'
import { planeCompositeUniforms } from './rasterUniforms.ts'
import { traceCapture, traceResult, traceSourcePlane, traceSubmitted } from './sampleTrace.ts'

afterEach(() => setLagTrace(false))

it('records negative overscroll and the exact source window without losing float32 inputs', () => {
  setLagTrace(true)
  const source = {}
  const capture = traceCapture(source)
  const layer = {
    width: 440,
    height: 1200,
    origin: { x: 0, y: 100 },
    scroll: { x: 0, y: -160 },
    fill: [0, 0, 0, 1],
  }
  const uniforms = new Float32Array(
    planeCompositeUniforms([600, 180], 3, layer, [20, 613, 200, 60]),
  )
  traceSourcePlane(
    source,
    { raster: 1, region: 'play', plane: 'album', key: 'r1' },
    uniforms,
    [0, 0, 600, 180],
    { scrollY: -160 },
  )
  const values = lagMarks().at(-1)!.values!
  expect(values).toMatchObject({
    capture,
    sourceX: 20,
    sourceY: 353,
    sourceWidth: 200,
    sourceHeight: 60,
    scrollY: -160,
    atlas: false,
  })
  // JSON normalizes signed zero; all shader coordinates keep their float32 value.
  expect(JSON.parse(values.uniforms as string)).toEqual(Array.from(uniforms, value => value || 0))
})

it('keeps the capture of a cached result after another raster overwrites shared scratch', () => {
  setLagTrace(true)
  const source = {},
    result = {}
  const first = traceCapture(source)
  traceResult(result, source)
  traceSubmitted(result, { raster: 1, revision: 1 })
  const second = traceCapture(source)
  traceSubmitted(result, { raster: 2, revision: 1 })
  expect(lagMarks().map(mark => mark.values!.capture)).toEqual([first, first])
  traceResult(result, source)
  traceSubmitted(result, { raster: 2, revision: 2 })
  expect(lagMarks().at(-1)!.values!.capture).toBe(second)
  traceResult(result, null)
  traceSubmitted(result, { raster: 2, revision: 3 })
  expect(lagMarks().at(-1)!.values!.capture).toBeNull()
})

it('does not claim an affine source rectangle for a zoom atlas', () => {
  setLagTrace(true)
  const uniforms = new Float32Array(124)
  uniforms[52] = 2
  traceSourcePlane(
    {},
    { raster: 1, region: 'play', plane: 'album', key: 'atlas' },
    uniforms,
    [0, 0, 200, 60],
    {},
  )
  expect(lagMarks().at(-1)!.values).toMatchObject({ atlas: true, sourceY: null })
})

it('stores no sampling marks unless explicitly enabled', () => {
  traceSubmitted({}, { raster: 1 })
  traceSourcePlane(
    {},
    { raster: 1, region: 'play', plane: 'album', key: 'r1' },
    new Float32Array(),
    [],
    {},
  )
  expect(lagMarks()).toHaveLength(0)
})
