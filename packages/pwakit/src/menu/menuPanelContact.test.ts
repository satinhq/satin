// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { beginMenuPanelContact } from './menuPanelContact.ts'
import { menuPanelPull, menuReturn } from './menuGesture.ts'

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
it('hands the measured 850 ms return to WAAPI and cancels its fill on retirement', () => {
  const panel = document.createElement('div')
  document.body.append(panel)
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  vi.stubGlobal('requestAnimationFrame', vi.fn())
  const bounds = { left: 0, top: 0, width: 250, height: 334 }
  vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue(bounds as DOMRect)
  const cancel = vi.fn()
  const animate = vi.fn(() => ({ cancel, finished: new Promise(() => {}) }))
  panel.animate = animate as unknown as typeof panel.animate
  const contact = beginMenuPanelContact(panel, 20, 20)
  contact.move(90, 120)
  contact.release()
  expect(requestAnimationFrame).not.toHaveBeenCalled()
  const [frames, options] = animate.mock.calls[0] as unknown as [
    Keyframe[],
    KeyframeAnimationOptions,
  ]
  expect(options.duration).toBe(850)
  const pose = menuPanelPull(90, 120, 20, 20, bounds)
  const values = (frame: Keyframe) =>
    String(frame.transform)
      .match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g)!
      .map(Number)
  let maxError = 0
  for (let ms = 0; ms < 849; ms++) {
    const position = (ms / 850) * (frames.length - 1)
    const index = Math.floor(position)
    const a = values(frames[index]!)
    const b = values(frames[index + 1]!)
    const actual = a.map((v, i) => v + (b[i]! - v) * (position - index))
    const amount = menuReturn(ms)
    // translate3d contributes the first numeric token, 3.
    maxError = Math.max(
      maxError,
      Math.abs(actual[1]! - pose.x * amount),
      Math.abs(actual[2]! - pose.y * amount),
      Math.abs(actual[4]! - (1 + (pose.scaleX - 1) * amount)) * bounds.width,
      Math.abs(actual[5]! - (1 + (pose.scaleY - 1) * amount)) * bounds.height,
    )
  }
  expect(maxError).toBeLessThan(0.5)
  console.info(`panel maximum interpolation error: ${maxError} pt`)
  contact.cancel()
  expect(cancel).toHaveBeenCalledOnce()
  expect(panel.style.transform).toBe('')
})
