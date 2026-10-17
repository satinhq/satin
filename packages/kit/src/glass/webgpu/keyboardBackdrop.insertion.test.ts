// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'
import { createInsertionMotion } from '../../scroll/insertionMotion.ts'
import {
  setKeyboardCarrierContent,
  setKeyboardCarrierPose,
  clearKeyboardCarrierContent,
  clearKeyboardCarrierPose,
} from '../../safe-area/keyboardCarrierGeometry.ts'
import { sampleKeyboardTranslation } from '../../keyboard/translation.ts'
import { keyboardBackdrop, keyboardBackdropAnchor } from './keyboardBackdrop.ts'

it('adds simultaneous keyboard and insertion travel on the same glass sampling clock', () => {
  const clock = vi.spyOn(performance, 'now').mockReturnValue(0)
  const surface = document.createElement('div'),
    content = document.createElement('div'),
    row = document.createElement('div')
  surface.append(content)
  content.append(row)
  document.body.append(surface)
  let y = 100
  row.getBoundingClientRect = () => ({ top: y }) as DOMRect
  content.animate = vi.fn(
    () => ({ cancel() {}, finished: new Promise(() => {}) }) as unknown as Animation,
  )
  const insert = createInsertionMotion(surface, content)
  try {
    insert.reconcile(true)
    const anchor = keyboardBackdropAnchor(surface)
    content.append(document.createElement('div'))
    y = 50
    insert.reconcile(true)
    setKeyboardCarrierContent(surface, content, () => 0)
    setKeyboardCarrierPose(content, () => ({
      offsetY: 20,
      moving: true,
      motion: {
        epoch: performance.timeOrigin,
        duration: 300,
        end: performance.timeOrigin + 300,
        offset: 0,
        stops: [
          [0, 20],
          [1, 0],
        ],
      },
    }))
    const pose = keyboardBackdrop(surface, anchor)!
    expect(pose.offsetY).toBe(70)
    expect(sampleKeyboardTranslation(pose.motion!, performance.timeOrigin)).toBe(70)
    expect(
      sampleKeyboardTranslation(pose.motion!, performance.timeOrigin + pose.motion!.duration),
    ).toBe(0)
  } finally {
    insert.cancel()
    clearKeyboardCarrierContent(surface)
    clearKeyboardCarrierPose(content)
    surface.remove()
    clock.mockRestore()
  }
})
