// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import {
  animateSubmenuFrame,
  submenuContentAt,
  submenuContentPlace,
  submenuGlassFrames,
  submenuVisibleFrame,
} from './submenuMotion.ts'
import { shapeTrackFrame } from './shapeTrack.ts'

const from = { x: 10, y: 114.8, width: 230, height: 42 }
const to = { x: 0, y: 45.2, width: 250, height: 334 }
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it.each(['open', 'back'] as const)(
  'keeps %s content and clip within 0.5 pt of the old curves without a frame writer',
  direction => {
    let now = 100
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    const raf = vi.fn()
    vi.stubGlobal('requestAnimationFrame', raf)
    const records: {
      frames: Keyframe[]
      options: KeyframeAnimationOptions
      cancel: ReturnType<typeof vi.fn>
      startTime: number | null
    }[] = []
    const parts = {
      platter: document.createElement('div'),
      glass: document.createElement('div'),
      clip: document.createElement('div'),
      content: document.createElement('div'),
      cornerRadius: 24,
    }
    for (const element of [parts.clip, parts.content]) {
      element.animate = ((frames: Keyframe[], options: KeyframeAnimationOptions) => {
        const record = {
          frames,
          options,
          cancel: vi.fn(),
          startTime: null as number | null,
          finished: new Promise(() => {}),
        }
        records.push(record)
        return record as unknown as Animation
      }) as typeof element.animate
    }
    const start = direction === 'open' ? from : to
    const end = direction === 'open' ? to : from
    const done = vi.fn()
    const stop = animateSubmenuFrame(parts, start, end, start, end, direction, done)
    expect(raf).not.toHaveBeenCalled()
    expect(records).toHaveLength(2)
    expect(records[0]!.startTime).toBe(records[1]!.startTime)
    const content = records[0]!
    const clip = records[1]!
    const duration = Number(content.options.duration)
    const glass = submenuGlassFrames(start, end, direction)
    const origin = {
      x: parseFloat(parts.platter.style.left),
      y: parseFloat(parts.platter.style.top),
    }
    // Interpolate the keyframes as WAAPI does, including between samples at 1 ms resolution.
    const numbers = (value: unknown) =>
      String(value)
        .match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g)!
        .map(Number)
    const interpolate = (frames: Keyframe[], key: 'transform' | 'clipPath', ms: number) => {
      const position = (ms / duration) * (frames.length - 1)
      const index = Math.floor(position)
      const a = numbers(frames[index]![key])
      const b = numbers(frames[Math.min(index + 1, frames.length - 1)]![key])
      return a.map((v, i) => v + (b[i]! - v) * (position - index))
    }
    let maxError = 0
    for (let ms = 0; ms < duration; ms++) {
      const actual = interpolate(content.frames, 'transform', ms)
      const expected = submenuContentAt(start, end, direction, ms)
      maxError = Math.max(
        maxError,
        Math.abs(actual[0]! + origin.x - expected.x),
        Math.abs(actual[1]! + origin.y - expected.y),
      )
      const shape = shapeTrackFrame({ epoch: 0, ...glass }, ms)
      const insets = interpolate(clip.frames, 'clipPath', ms)
      maxError = Math.max(
        maxError,
        Math.abs(insets[0]! + origin.y - shape.y),
        Math.abs(insets[3]! + origin.x - shape.x),
      )
    }
    expect(maxError).toBeLessThan(0.5)
    console.info(`${direction} maximum interpolation error: ${maxError} pt`)
    now += 137
    expect(submenuContentPlace(parts.platter)).toEqual(submenuContentAt(start, end, direction, 137))
    const visible = submenuVisibleFrame(parts.platter)
    stop()
    now += 100
    expect(submenuVisibleFrame(parts.platter)).toEqual(visible)
    expect(records.every(record => record.cancel.mock.calls.length === 1)).toBe(true)
    expect(done).not.toHaveBeenCalled()
    stop()
    expect(records.every(record => record.cancel.mock.calls.length === 1)).toBe(true)
  },
)
