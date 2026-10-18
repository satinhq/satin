// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import type { SurfaceRenderSpec } from '../renderSpecs.ts'
import { PadSearchBarMotion } from '../../search/padSearchBarMotion.ts'
import { chromeSampleDemand } from './chromeSampleDemand.ts'
import { demandBands } from './captureDemand.ts'
import { uncoveredRows } from './captureBands.ts'

vi.mock('../../motion/animate.ts', () => ({
  animateElement: () => ({
    playState: 'running',
    cancel() {},
    finished: Promise.resolve(),
    startTime: null,
  }),
  timelineStart: (at: number) => at,
}))
afterEach(() => vi.unstubAllGlobals())

it('keeps the rows the iPad tab bar reveals after typing with Search focused', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  // Installed Music: the hidden endpoint captures 0..132, but return samples through172.
  const hidden = {
    id: 'dock',
    frameX: 420,
    frameY: -64,
    sampleInsetX: 0,
    sampleInsetY: 128,
    sampleWidth: 353,
    sampleHeight: 300,
    opacity: 0,
  } as SurfaceRenderSpec
  const bands = demandBands({
    host: { left: 0, top: 0, right: 1194, bottom: 802 },
    contentHeight: 802,
    resolution: 2,
    demand: {
      rects: [chromeSampleDemand(hidden, 'top'), [4, 710, 1186, 88]],
      covered: false,
      damaged: true,
    },
  })
  const motion = new PadSearchBarMotion()
  motion.start(document.createElement('nav'), 1, hidden, 0)
  const shown = { ...hidden, frameY: 0, opacity: 1 }
  const track = motion.start(document.createElement('nav'), 0, shown, 2000)
  const missing = track.specs.flatMap(spec => {
    const rows = uncoveredRows(
      [spec.frameX, spec.frameY - spec.sampleInsetY, spec.sampleWidth, spec.sampleHeight],
      {
        origin: { y: 0 },
        scroll: { y: 0 },
        height: 802,
        clip: [0, 0, 1194, 802],
        rows: bands,
        resolution: 2,
      },
    )
    return rows ? [rows] : []
  })
  expect(missing).toEqual([])
  expect(chromeSampleDemand(hidden, 'top')).toEqual(chromeSampleDemand(shown, 'top'))
  expect(chromeSampleDemand({ ...hidden, frameY: -32, opacity: 0.5 }, 'top')).toEqual(
    chromeSampleDemand(shown, 'top'),
  )
})

it('leaves bottom tabs and other chrome on their existing demand', () => {
  const spec = {
    id: 'dock',
    frameX: 4,
    frameY: 710,
    sampleInsetX: 2,
    sampleInsetY: 20,
    sampleWidth: 1186,
    sampleHeight: 88,
    opacity: 0,
  } as SurfaceRenderSpec
  expect(chromeSampleDemand(spec, 'bottom')).toEqual([2, 690, 1186, 88])
  expect(chromeSampleDemand({ ...spec, id: 'right' }, 'top')).toEqual([2, 690, 1186, 88])
})
