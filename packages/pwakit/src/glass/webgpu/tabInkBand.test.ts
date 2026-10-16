// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'
import type { SurfaceRenderSpec } from '../renderSpecs.ts'
import { tabInkBand } from './tabGlyphInk.ts'

// The layered tab atlas (complete icons above complete labels) must not cost more than the flat
// atlas it replaced. Each plane stores the bar frame plus a transparent margin, not the backdrop's
// 128 pt vertical overscan, which never holds ink.

vi.mock('./foreground.ts', async original => ({
  ...(await original<typeof import('./foreground.ts')>()),
  captureRegionForeground: vi.fn(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 120
    canvas.height = 372
    return canvas
  }),
}))
const { captureProductionGlyphs } = await import('./capture.ts')

const spec = {
  frameHeight: 62,
  sampleWidth: 526,
  sampleHeight: 318,
  sampleInsetX: 64,
  sampleInsetY: 128,
  tabSelection: { glyphLayers: true },
} as unknown as SurfaceRenderSpec

it('stores two bar-height planes in less memory than one full sample plane', async () => {
  const band = tabInkBand(spec, 3)
  expect(band).toEqual({ top: 120, pixels: 234, height: 78 })
  const draws: number[][] = []
  const context = {
    setTransform() {},
    clearRect() {},
    scale() {},
    drawImage(...args: number[]) {
      draws.push(args.slice(1))
    },
    set globalAlpha(_value: number) {},
  }
  const target = { width: 0, height: 0, getContext: () => context } as unknown as HTMLCanvasElement
  const dock = document.createElement('div')
  const tab = document.createElement('button')
  tab.setAttribute('role', 'tab')
  dock.append(tab)
  document.body.append(dock)
  await captureProductionGlyphs(dock, spec, 3, target)
  dock.remove()
  expect([target.width, target.height]).toEqual([1578, 468])
  expect(target.height).toBeLessThan(Math.ceil(spec.sampleHeight * 3))
  // Icons at the frame top plus the margin; labels one plane (78 pt) lower.
  expect(draws.map(args => args[5])).toEqual([8, 86])
})
