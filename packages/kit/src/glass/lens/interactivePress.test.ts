import { describe, expect, it } from 'vitest'
import { InteractivePress, interactivePressScale } from './interactivePress.ts'

const run = (press: InteractivePress, from: number, to: number) => {
  const out: number[] = []
  for (let t = from; t <= to; t += 1000 / 60) out.push(press.sample(t))
  return out
}

describe('interactive glass press (native fit)', () => {
  it('grows buttons 16 pt and surfaces 4 pt at full press', () => {
    expect(interactivePressScale('button', 80, 1) * 34).toBeCloseTo(40.8, 1)
    expect(interactivePressScale('button', 44, 1) * 44).toBeCloseTo(60, 5)
    expect(interactivePressScale('surface', 160, 1) * 160).toBeCloseTo(164, 5)
  })
  it('holds: starts after 50 ms, peaks near 135 ms with a small overshoot, then settles', () => {
    const p = new InteractivePress()
    p.down(0)
    expect(p.sample(45)).toBe(0)
    const s = run(p, 45, 600),
      peak = Math.max(...s)
    expect(peak).toBeGreaterThan(1.02)
    expect(peak).toBeLessThan(1.1)
    expect(p.amount).toBeCloseTo(1, 2)
  })
  it('releases with an undershoot of about 30% of the press and settles by ~350 ms', () => {
    const p = new InteractivePress()
    p.down(0)
    run(p, 0, 600)
    p.up(600)
    const s = run(p, 600, 1200),
      low = Math.min(...s)
    expect(low).toBeLessThan(-0.2)
    expect(low).toBeGreaterThan(-0.4)
    expect(Math.abs(p.sample(950))).toBeLessThan(0.08)
    expect(p.needsFrame).toBe(p.amount !== 0)
  })
  it('Reduce Motion keeps the resting size', () => {
    const p = new InteractivePress()
    p.down(0)
    expect(p.sample(300, true)).toBe(0)
  })
})

import { glassMenuMorphProgress } from './interactivePress.ts'
describe('glass Menu morph (from its trigger)', () => {
  it('follows the native opening overshoot and closing undershoot', () => {
    const open = Array.from({ length: 43 }, (_, i) => glassMenuMorphProgress('open', i * 10))
    expect(open[0]).toBe(0)
    expect(Math.max(...open)).toBeGreaterThan(1)
    expect(Math.max(...open)).toBeLessThan(1.05)
    expect(glassMenuMorphProgress('open', 550)).toBe(1)
    const close = Array.from({ length: 33 }, (_, i) => glassMenuMorphProgress('close', i * 10))
    expect(Math.max(...close)).toBeGreaterThan(1)
    expect(Math.max(...close)).toBeLessThan(1.03)
    expect(glassMenuMorphProgress('close', 700)).toBe(1)
  })
})

import { interactiveHighlight, withHighlight } from './interactivePress.ts'
describe('interactive glass highlight (GPU tint of the pressed shape)', () => {
  it('holds the native iPad plateau without a flash and clears on release', () => {
    // Dark: no flash above the held plateau (native: +51 of 223 sRGB, steady from ~170 ms).
    const dark = [17, 50, 120, 167, 600, 900].map(ms =>
      interactiveHighlight('button', 'dark', 0, undefined, ms),
    )
    expect(Math.max(...dark)).toBeCloseTo(0.25)
    expect(interactiveHighlight('button', 'dark', 0, undefined, 900)).toBeCloseTo(0.25)
    // Light: white from the first pressed frames and still white while held.
    expect(interactiveHighlight('bar', 'light', 0, undefined, 900)).toBeCloseTo(0.9)
    expect(interactiveHighlight('button', 'dark', 0, 900, 1020)).toBeCloseTo(0.125)
    expect(interactiveHighlight('button', 'dark', 0, 900, 1200)).toBe(0)
    // A surface lights at the finger instead (the menu field), never across its whole shape.
    expect(interactiveHighlight('surface', 'dark', 0, undefined, 300)).toBe(0)
  })
  it('composes a material tint with the white highlight as one tint', () => {
    expect(withHighlight(undefined, 0.5)).toEqual([1, 1, 1, 0.5])
    const [r, , b, a] = withHighlight([0, 0.48, 1, 0.65], 0.5)
    expect(a).toBeCloseTo(0.825)
    expect(b).toBeCloseTo(1)
    expect(r).toBeCloseTo(0.5 / 0.825)
  })
})
