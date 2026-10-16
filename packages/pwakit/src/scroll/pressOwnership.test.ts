import { afterEach, describe, expect, it, vi } from 'vitest'
import { installScrollPressOwnership } from './pressOwnership.ts'
import { registerPointerPressCancellation } from '../press/gestureArbitration.ts'
import {
  consumePointerClickSuppression,
  resetPointerClickSuppression,
} from '../press/activation.ts'

class Surface extends EventTarget {
  pointer(type: string, x: number, y: number, pointerId = 1, pointerType = 'touch') {
    this.dispatchEvent(
      Object.assign(new Event(type), { clientX: x, clientY: y, pointerId, pointerType }),
    )
  }
}
afterEach(() => {
  resetPointerClickSuppression()
  vi.restoreAllMocks()
})
describe('ScrollSurface press ownership', () => {
  it('cancels permanently at the native slop, even at a boundary and after returning', () => {
    const surface = new Surface(),
      cancel = vi.fn()
    const dispose = installScrollPressOwnership(surface as unknown as HTMLElement, 'vertical')
    const unregister = registerPointerPressCancellation(1, cancel)
    surface.pointer('pointerdown', 200, 433)
    surface.pointer('pointermove', 200, 424)
    expect(cancel).not.toHaveBeenCalled()
    surface.pointer('pointermove', 200, 423)
    surface.pointer('pointermove', 200, 433)
    expect(cancel).toHaveBeenCalledTimes(1)
    vi.spyOn(performance, 'now').mockReturnValue(5000)
    surface.pointer('pointerup', 200, 433)
    expect(consumePointerClickSuppression(5001)).toBe(true)
    dispose()
    unregister()
  })
  it('preserves tremor, cross-axis motion, mouse retention and later contacts', () => {
    const surface = new Surface(),
      cancel = vi.fn()
    const dispose = installScrollPressOwnership(surface as unknown as HTMLElement, 'vertical')
    const unregister = registerPointerPressCancellation(1, cancel)
    for (const [x, y, type] of [
      [204, 429, 'touch'],
      [250, 434, 'touch'],
      [200, 350, 'mouse'],
    ] as const) {
      surface.pointer('pointerdown', 200, 433, 1, type)
      surface.pointer('pointermove', x, y, 1, type)
      surface.pointer('pointerup', x, y, 1, type)
    }
    expect(cancel).not.toHaveBeenCalled()
    surface.pointer('pointerdown', 200, 433)
    surface.pointer('pointerup', 200, 423)
    expect(cancel).toHaveBeenCalledOnce()
    dispose()
    unregister()
  })
  it('owns horizontal pans and actual scroll; ignores nested scroll and cleans listeners', () => {
    const surface = new Surface(),
      cancel = vi.fn()
    const dispose = installScrollPressOwnership(surface as unknown as HTMLElement, 'horizontal')
    const unregister = registerPointerPressCancellation(7, cancel)
    surface.pointer('pointerdown', 0, 0, 7)
    surface.pointer('pointermove', 0, 20, 7)
    expect(cancel).not.toHaveBeenCalled()
    const nested = new Event('scroll')
    Object.defineProperty(nested, 'target', { value: new EventTarget() })
    surface.dispatchEvent(nested)
    expect(cancel).not.toHaveBeenCalled()
    surface.dispatchEvent(new Event('scroll'))
    expect(cancel).toHaveBeenCalledOnce()
    surface.pointer('pointercancel', 0, 0, 7)
    dispose()
    unregister()
    const other = vi.fn(),
      cleanup = registerPointerPressCancellation(8, other)
    surface.pointer('pointerdown', 0, 0, 8)
    surface.pointer('pointermove', 20, 0, 8)
    expect(other).not.toHaveBeenCalled()
    cleanup()
  })
})
