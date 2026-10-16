// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'
import * as presentationFrame from '../presentationFrame.ts'
import { demandBands, regionSampleRect } from './captureDemand.ts'
import { uncoveredRows } from './captureBands.ts'

it('captures nested toolbar rows in the same resting frame as a travelling sheet plane', () => {
  const element = document.createElement('button')
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 984, 44, 44))
  const travel = vi.spyOn(presentationFrame, 'presentationTravel').mockReturnValue({ x: 0, y: 902 })
  try {
    const rect = regionSampleRect(element)!
    const bands = demandBands({
      host: { left: 0, top: 82, right: 440, bottom: 956 },
      contentHeight: 874,
      resolution: 2,
      demand: {
        // Existing page glass also overlaps the new plane. It must not be the
        // only demand when the sheet toolbar is parked below the viewport.
        rects: [[0, 185, 440, 122], [0, 721, 440, 120], rect],
        covered: false,
        damaged: true,
      },
    })
    expect(rect[1]).toBeLessThan(82)
    expect(
      uncoveredRows([0, 82, 440, 64], {
        origin: { y: 82 },
        scroll: { y: 0 },
        height: 874,
        clip: [0, 82, 440, 874],
        rows: bands,
        resolution: 2,
      }),
    ).toBeUndefined()
  } finally {
    travel.mockRestore()
  }
})
