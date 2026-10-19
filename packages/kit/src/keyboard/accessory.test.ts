// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import type { KeyboardMotion } from './adapter.ts'
import { keyboardCarrierPose } from '../safe-area/keyboardCarrierGeometry.ts'
import { KEYBOARD_DURATION_MS } from './motion.ts'

let keyboardChanged: (motion: KeyboardMotion) => void
vi.mock('./adapter.ts', () => ({
  currentKeyboardHeight: () => 0,
  onKeyboardMotion: (listener: typeof keyboardChanged) => {
    keyboardChanged = listener
    return () => {}
  },
}))
const { installKeyboardAccessory } = await import('./accessory.ts')
afterEach(() => vi.restoreAllMocks())

it('carries a dismissed search field down instead of dropping it to its resting position', () => {
  let now = 1000
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  const element = document.createElement('div')
  element.animate = () =>
    ({
      startTime: now,
      effect: { setKeyframes() {} },
      play() {},
      cancel() {},
    }) as unknown as Animation
  let searching = true
  const dispose = installKeyboardAccessory(
    element,
    () => searching,
    height => -height,
  )
  keyboardChanged({ height: 300, startTime: now })
  now += KEYBOARD_DURATION_MS
  expect(keyboardCarrierPose(element)?.offsetY).toBe(-300)
  searching = false
  keyboardChanged({ height: 0, startTime: now })
  expect(keyboardCarrierPose(element)?.offsetY).toBe(-300)
  now += KEYBOARD_DURATION_MS / 2
  const halfway = keyboardCarrierPose(element)!.offsetY
  expect(halfway).toBeGreaterThan(-300)
  expect(halfway).toBeLessThan(0)
  now += KEYBOARD_DURATION_MS / 2
  expect(keyboardCarrierPose(element)?.offsetY).toBe(0)
  dispose()
})
