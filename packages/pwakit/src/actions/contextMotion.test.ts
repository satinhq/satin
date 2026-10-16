// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'
import {
  animateContentLift,
  animateContextDismissal,
  animateContextPreview,
  animateContextPreviewDismissal,
} from './contextMotion.ts'
import { CONTEXT_DISMISSAL_MS } from '../glass/lens/menuContextPresentation.ts'

type Frame = { offset: number; transform?: string; opacity?: number }
const recordAnimations = (...elements: HTMLElement[]) => {
  const seen: { frames: Frame[]; duration: number }[] = []
  for (const element of elements) {
    element.animate = ((frames: Frame[], options: KeyframeAnimationOptions) => {
      seen.push({ frames, duration: Number(options.duration) })
      return { cancel() {}, finished: Promise.resolve(), persist() {} } as unknown as Animation
    }) as unknown as typeof element.animate
    element.getAnimations = () => []
  }
  return seen
}
/** Scale shown `ms` into keyframes laid out on `duration` (linear between keyframes). */
const scaleAt = ({ frames, duration }: { frames: Frame[]; duration: number }, ms: number) => {
  const offset = Math.min(1, ms / duration)
  const next = frames.findIndex(frame => frame.offset >= offset)
  const read = (frame: Frame) => Number(/scale\(([\d.]+)/.exec(frame.transform ?? '')?.[1])
  if (next <= 0) return read(frames[0]!)
  const [before, after] = [frames[next - 1]!, frames[next]!]
  const part = (offset - before.offset) / (after.offset - before.offset)
  return read(before) + (read(after) - read(before)) * part
}

it('settles and returns lifted content on the native iPad curves, not the dim clock', () => {
  // native iPad warm-light chat-tall (3 counter-qualified trials): the 740 pt bubble settles
  // from its hold scale to 1.035 within ~176 ms of recognition (two thirds of the way by
  // +83 ms) and is back on its source ~184 ms after dismissal (62 % back by +67 ms), while
  // the dim takes CONTEXT_DISMISSAL_MS.
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  const content = document.createElement('div')
  const shadow = document.createElement('div')
  document.body.append(content, shadow)
  const seen = recordAnimations(content, shadow)
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({
    transform: 'matrix(1.035, 0, 0, 1.035, 0, 0)',
  } as CSSStyleDeclaration)
  try {
    animateContentLift(content, { scale: 1.035, dx: 0, dy: 0 }, 1.025, shadow)
    const lift = seen.at(-1)!
    expect(lift.duration).toBeLessThanOrEqual(200)
    const settled = (scaleAt(lift, 83) - 1.025) / 0.01
    expect(settled).toBeGreaterThan(0.55)
    expect(settled).toBeLessThan(0.85)
    seen.length = 0
    animateContextDismissal(null, content, performance.timeOrigin, shadow)
    const [back] = seen
    expect(back!.duration).toBeLessThan(CONTEXT_DISMISSAL_MS - 60)
    const returned = 1 - (scaleAt(back!, 67) - 1) / 0.035
    expect(returned).toBeGreaterThan(0.5)
    expect(returned).toBeLessThan(0.75)
    expect(scaleAt(back!, 190)).toBe(1)
  } finally {
    content.remove()
    shadow.remove()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  }
})

it('fades a content shadow with opacity and does not rebuild its drop-shadow', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  const preview = document.createElement('div')
  const shadow = document.createElement('div')
  document.body.append(preview, shadow)
  const seen: Keyframe[][] = []
  const animate = function (this: HTMLElement, frames: Keyframe[]) {
    seen.push(frames)
    return { cancel() {}, finished: Promise.resolve(), persist() {} } as unknown as Animation
  }
  preview.animate = animate as typeof preview.animate
  shadow.animate = animate as typeof shadow.animate
  preview.getAnimations = () => []
  shadow.getAnimations = () => []
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({
    transform: 'matrix(1.02, 0, 0, 1.02, 0, 0)',
    filter: 'drop-shadow(rgba(0, 0, 0, 0.4) 0px 5px 46px)',
    boxShadow: 'rgba(0, 0, 0, 0.4) 0px 5px 46px',
  } as CSSStyleDeclaration)
  try {
    animateContextDismissal(null, preview, performance.timeOrigin, shadow)
    const [previewFrames, shadowFrames] = seen as {
      offset: number
      transform?: string
      opacity?: number
      filter?: string
      boxShadow?: string
    }[][]
    expect(previewFrames?.length).toBeGreaterThan(1)
    for (const frame of previewFrames!) {
      expect(frame.transform).toMatch(/^scale\(/)
      expect(frame).not.toHaveProperty('filter')
      expect(frame).not.toHaveProperty('boxShadow')
      expect(frame).not.toHaveProperty('opacity')
    }
    expect(previewFrames![0]!.transform).toBe('scale(1.02)')
    expect(previewFrames!.at(-1)!.transform).toBe('scale(1)')
    expect(shadowFrames?.length).toBe(previewFrames!.length)
    // The shadow fades on the clock that returns the content: what is left of its 0.02 lift.
    shadowFrames!.forEach((frame, index) => {
      expect(frame).not.toHaveProperty('filter')
      expect(frame).not.toHaveProperty('boxShadow')
      const scale = Number(/scale\(([\d.]+)/.exec(previewFrames![index]!.transform!)![1])
      expect(frame.opacity).toBeCloseTo((scale - 1) / 0.02, 5)
    })
    expect(shadowFrames![0]!.opacity).toBe(1)
    expect(shadowFrames!.at(-1)!.opacity).toBe(0)
  } finally {
    preview.remove()
    shadow.remove()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  }
})

it('never darkens a custom preview by cross-fading it with its source', () => {
  // Owner, Oct 11 (Music Search album lift): the artwork dimmed while the preview and its
  // tile were both half transparent. Where they overlap, their coverage stays whole.
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  const preview = document.createElement('div')
  const source = document.createElement('div')
  document.body.append(preview, source)
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({ opacity: '1' } as CSSStyleDeclaration)
  const box = { dx: 0, dy: 40, scaleX: 0.5, scaleY: 0.5 }
  for (const run of [
    () => animateContextPreview(preview, source, box),
    () => animateContextPreviewDismissal(preview, source, box),
  ]) {
    const seen = recordAnimations(preview, source)
    run()
    const [shown, under] = seen.map(({ frames }) => frames)
    shown!.forEach((frame, index) => {
      const top = frame.opacity ?? 1,
        below = under![index]!.opacity ?? 1
      expect(top + (1 - top) * below).toBeGreaterThan(0.9)
    })
  }
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('returns a custom preview opaque, as its open in reverse, before it fades into its source', () => {
  // Owner, Music Home tile (2026-10-14): a fade from the first frame left the tile back in place
  // under a translucent platter, which read as a snap.
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  const preview = document.createElement('div')
  const source = document.createElement('div')
  document.body.append(preview, source)
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({ opacity: '1' } as CSSStyleDeclaration)
  const seen = recordAnimations(preview, source)
  animateContextPreviewDismissal(preview, source, { dx: 0, dy: 40, scaleX: 0.7, scaleY: 0.7 })
  const [shown, under] = seen.map(({ frames }) => frames)
  const scale = (frame: Frame) => Number(/scale\(([\d.]+)/.exec(frame.transform ?? '')?.[1])
  for (const [index, frame] of shown!.entries()) {
    // Two thirds of the way back (scale above 0.8 of the way from 0.7 to 1), still whole.
    if (scale(frame) > 0.7 + 0.3 / 3) {
      expect(frame.opacity).toBe(1)
      expect(under![index]!.opacity).toBe(0)
    }
  }
  expect(shown!.at(-1)!.opacity).toBe(0)
  expect(under!.at(-1)!.opacity).toBe(1)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
