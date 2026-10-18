// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'
import {
  hideSwipeFace,
  resetSwipeFace,
  showSwipeFace,
  swipeFaceAppear,
  swipeFaceDisappear,
} from './swipeFace.ts'

type Recorded = { frames: Keyframe[]; animation: Animation }

function row() {
  const host = document.createElement('div')
  const tint = document.createElement('span')
  tint.dataset.satinSwipeFaceTint = 'true'
  host.append(tint)
  const recorded: Recorded[] = []
  tint.animate = vi.fn((frames: Keyframe[]) => {
    const animation = { id: '', startTime: null, cancel: vi.fn() } as unknown as Animation
    recorded.push({ frames, animation })
    return animation
  }) as unknown as typeof tint.animate
  tint.getAnimations = () => recorded.map(entry => entry.animation)
  return { host, tint, recorded }
}

const opacity = (frame: Keyframe) => Number(frame.opacity)

it('fades the face in on the native time response, from pan recognition', () => {
  const { host, tint, recorded } = row()
  showSwipeFace(host, 1000)
  expect(host.dataset.satinSwipeFace).toBe('swiped')
  const [{ frames, animation }] = recorded
  // Timed from the recognizing input sample, not from when this code ran.
  expect(animation.startTime).toBeCloseTo(1000 + swipeFaceAppear.delayMilliseconds, 3)
  // Native eases in, critically damped: a third after 7 frames, half after 10, settled within ~1s.
  expect(opacity(frames[0]!)).toBe(0)
  expect(opacity(frames[7]!)).toBeCloseTo(0.32, 1)
  expect(opacity(frames[10]!)).toBeCloseTo(0.5, 1)
  expect(frames.length).toBeLessThan(62)
  expect(opacity(frames.at(-1)!)).toBe(1)
  expect(tint.style.opacity).toBe('1')
  // A second recognition in the same contact does not restart the fade.
  showSwipeFace(host, 1100)
  expect(recorded).toHaveLength(1)
})

it('fades back from the presented opacity after release, and resets without a fade', () => {
  const { host, tint, recorded } = row()
  showSwipeFace(host, 0)
  // Released while the fade-in was presenting 60% grey.
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({ opacity: '0.6' } as CSSStyleDeclaration)
  hideSwipeFace(host, 500)
  expect(host.dataset.satinSwipeFace).toBe('closing')
  const fade = recorded[1]!
  expect(opacity(fade.frames[0]!)).toBeCloseTo(0.6, 6)
  expect(opacity(fade.frames.at(-1)!)).toBe(0)
  expect(fade.animation.startTime).toBeCloseTo(500 + swipeFaceDisappear.delayMilliseconds, 3)
  expect(recorded[0]!.animation.cancel).toHaveBeenCalled()
  resetSwipeFace(host)
  expect(host.dataset.satinSwipeFace).toBeUndefined()
  expect(tint.style.opacity).toBe('')
})
