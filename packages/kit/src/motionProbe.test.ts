import { describe, expect, it } from 'vitest'
import { motionPercentile, summarizeMotionWindow } from './motionProbe.ts'
describe('motion probe accounting', () => {
  it('does not report missing samples as a zero-cost pass', () => {
    expect(motionPercentile([], 0.95)).toBeNull()
    const report = summarizeMotionWindow({
      id: 1,
      kind: 'push',
      owner: 'WAAPI',
      start: 0,
      frames: [],
      inputTimes: [],
      styles: {},
    })
    expect(report.callbackP95).toBeNull()
    expect(report.rafHz).toBeNull()
  })
  it('retains expensive callbacks crossing the start boundary separately', () => {
    const frame = {
      at: 90,
      delta: 160,
      callbackMs: 101,
      callbacks: 1,
      input: 0,
      styleWrites: 0,
      otherStyleWrites: 0,
      gl: 0,
      uploads: 13,
      mirrorRebuilds: 1,
    }
    const r = summarizeMotionWindow({
      id: 1,
      kind: 'minimize',
      owner: 'WAAPI',
      start: 100,
      end: 150,
      frames: [frame],
      inputTimes: [],
      styles: {},
    })
    expect(r.callbackP95).toBeNull()
    expect(r.boundaryCallbackMax).toBe(101)
    expect(r.maximumObservedGap).toBe(160)
  })
  it('separates callback work from cadence and counts histogram boundaries once', () => {
    const frames = [8.3, 16.7, 50, 100].map((delta, i) => ({
      at: i * 100,
      delta,
      callbackMs: 1,
      callbacks: 1,
      input: 1,
      styleWrites: 2,
      otherStyleWrites: 0,
      gl: 1,
      uploads: 0,
      mirrorRebuilds: 0,
    }))
    const r = summarizeMotionWindow({
      id: 1,
      kind: 'pop-scrub',
      owner: 'rAF',
      start: 0,
      end: 400,
      frames,
      inputTimes: [0, 10, 20],
      styles: { transform: 8 },
    })
    expect(r.callbackP95).toBe(1)
    expect(r.deltaP95).toBe(100)
    expect(r.histogram.reduce((n, b) => n + b.count, 0)).toBe(3)
    expect(r.inputHz).toBe(100)
    expect(r.totals.gl).toBe(4)
  })
  it('keeps preparation between first input and visible intent in the interaction budget', () => {
    const frame = {
      at: 90,
      delta: 17,
      callbackMs: 101,
      callbacks: 1,
      input: 1,
      styleWrites: 0,
      otherStyleWrites: 0,
      gl: 0,
      uploads: 13,
      mirrorRebuilds: 1,
    }
    const next = { ...frame, at: 207, delta: 117, callbackMs: 1, uploads: 0, mirrorRebuilds: 0 }
    const r = summarizeMotionWindow({
      id: 1,
      kind: 'pop-scrub',
      owner: 'native',
      inputStart: 100,
      start: 210,
      end: 240,
      contactFrames: [frame, next],
      frames: [next, { ...next, at: 224, delta: 17 }],
      inputTimes: [],
      styles: {},
    })
    expect(r.inputToSettlement?.callbackMax).toBe(101)
    expect(r.inputToSettlement?.maximumObservedGap).toBe(117)
    expect(r.inputToSettlement?.uploads).toBe(13)
    expect(r.callbackP95).toBe(1)
  })
})
