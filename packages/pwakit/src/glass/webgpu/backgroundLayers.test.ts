import { expect, it, vi } from 'vitest'
import {
  drawBackgroundLayers,
  linearLine,
  parseGradient,
  repeatStops,
  resolveStops,
  splitTop,
} from './backgroundLayers.ts'

// The perf fixture's and Preview's motion pages: WebKit's computed form of their stripes.
const stripes =
  'repeating-linear-gradient(135deg, rgb(109, 33, 202) 0px, rgb(109, 33, 202) 28px, rgb(81, 25, 150) 28px, rgb(81, 25, 150) 56px)'

it('splits layers and tokens outside parentheses', () => {
  expect(splitTop(`${stripes}, linear-gradient(red, blue)`, ',')).toEqual([
    stripes,
    'linear-gradient(red, blue)',
  ])
  expect(splitTop('rgb(1, 2, 3) 10px 20%', ' ')).toEqual(['rgb(1, 2, 3)', '10px', '20%'])
})

it('parses the motion page stripes and places the CSS gradient line', () => {
  const g = parseGradient(stripes)!
  expect(g).toMatchObject({ kind: 'linear', repeating: true, angle: 135 })
  expect(g.stops.map(s => [s.color, s.at])).toEqual([
    ['rgb(109, 33, 202)', 0],
    ['rgb(109, 33, 202)', 28],
    ['rgb(81, 25, 150)', 28],
    ['rgb(81, 25, 150)', 56],
  ])
  // 135deg in a 200x100 box: the line length is |w sin| + |h cos|, through the centre toward the bottom right.
  const line = linearLine(g as never, 200, 100),
    l = (200 + 100) * Math.SQRT1_2
  expect(line.length).toBeCloseTo(l)
  expect(line.x1 - line.x0).toBeCloseTo(l * Math.SQRT1_2)
  expect(line.y1 - line.y0).toBeCloseTo(l * Math.SQRT1_2)
  expect(
    linearLine({ kind: 'linear', repeating: false, corner: 'top right', stops: [] }, 200, 100).x1,
  ).toBeGreaterThan(100)
})

it('resolves stop positions like CSS and repeats a period across the whole line', () => {
  expect(
    resolveStops([{ color: 'a' }, { color: 'b' }, { color: 'c' }], 100).map(s => s.offset),
  ).toEqual([0, 0.5, 1])
  expect(
    resolveStops(
      [
        { color: 'a', at: 50, unit: '%' },
        { color: 'b', at: 10, unit: 'px' },
      ],
      100,
    ).map(s => s.offset),
  ).toEqual([0.5, 0.5])
  const repeated = repeatStops(resolveStops(parseGradient(stripes)!.stops, 560))
  // 560 px of line: ten 56 px periods, each a hard edge at its middle.
  expect(repeated[0].offset).toBe(0)
  expect(repeated.at(-1)!.offset).toBe(1)
  expect(repeated.filter(s => s.color === 'rgb(81, 25, 150)').length).toBeGreaterThanOrEqual(20)
  for (let i = 1; i < repeated.length; i++)
    expect(repeated[i].offset).toBeGreaterThanOrEqual(repeated[i - 1].offset)
})

const context = () => {
  const calls: string[] = [],
    gradient = {
      stops: [] as [number, string][],
      addColorStop(offset: number, color: string) {
        this.stops.push([offset, color])
      },
    }
  const ctx = {
    fillStyle: '' as unknown,
    createLinearGradient: (...a: number[]) => {
      calls.push('linear ' + a.map(v => Math.round(v)).join(','))
      return gradient
    },
    createRadialGradient: () => {
      calls.push('radial')
      return gradient
    },
    createConicGradient: () => {
      calls.push('conic')
      return gradient
    },
    save() {},
    restore() {},
    translate: (x: number, y: number) => calls.push(`t ${x},${y}`),
    scale() {},
    beginPath() {},
    roundRect() {},
    clip() {},
    rect() {},
    fillRect: (x: number, y: number, w: number, h: number) =>
      calls.push(`fill ${x},${y},${w},${h}`),
  }
  return { ctx: ctx as never, calls, gradient }
}

it('draws a gradient layer over the element box and tiles a sized layer', () => {
  const one = context()
  drawBackgroundLayers(
    one.ctx,
    { image: stripes, size: 'auto', position: '0% 0%', repeat: 'repeat' },
    1046,
    970,
    0,
    () => {
      throw Error('unexpected')
    },
  )
  expect(one.calls.filter(c => c.startsWith('linear')).length).toBe(1)
  expect(one.calls).toContain('fill 0,0,1046,970')
  const tiled = context()
  drawBackgroundLayers(
    tiled.ctx,
    {
      image: 'linear-gradient(red, blue)',
      size: '50px 20px',
      position: '0px 0px',
      repeat: 'repeat-x',
    },
    100,
    40,
    0,
    () => {},
  )
  expect(tiled.calls.filter(c => c.startsWith('fill')).length).toBe(2)
})

it('an image the capture cannot draw is a loud glass error, once per value', () => {
  const report = vi.fn(),
    { ctx } = context()
  const spec = {
    image: 'url("https://example.com/a.png")',
    size: 'auto',
    position: '0% 0%',
    repeat: 'repeat',
  }
  drawBackgroundLayers(ctx, spec, 10, 10, 0, report)
  drawBackgroundLayers(ctx, spec, 10, 10, 0, report)
  expect(report).toHaveBeenCalledTimes(1)
  expect(String(report.mock.calls[0][0])).toMatch(/does not draw background-image/)
})

it.each([
  'linear-gradient(red -100%, blue 100%)',
  'radial-gradient(red -100%, blue 100%)',
  'conic-gradient(red -100%, blue 100%)',
  'repeating-linear-gradient(red 10%, blue 40%)',
])('reports unsupported interpolation instead of changing colors: %s', image => {
  const { ctx, calls } = context(),
    report = vi.fn()
  drawBackgroundLayers(
    ctx,
    { image, size: 'auto', position: '0% 0%', repeat: 'no-repeat' },
    100,
    100,
    0,
    report,
  )
  expect(report).toHaveBeenCalledTimes(1)
  expect(String(report.mock.calls[0][0])).toMatch(/Unsupported.*(outside|boundary)/)
  expect(calls.some(c => c.startsWith('fill'))).toBe(false)
})
