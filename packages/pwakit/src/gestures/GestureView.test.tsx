// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { GestureView } from './GestureView.tsx'
import {
  DragGesture,
  LongPressGesture,
  MagnifyGesture,
  useGestureState,
  type DragGestureValue,
} from './gesture.ts'
import { cancelPointerPressForOwnedGesture } from '../press/gestureArbitration.ts'

it('yields a moving hold to drag, resets gesture state on native cancellation, and cancels a hold on scroll', () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const held = vi.fn()
  const ended = vi.fn()
  function Fixture() {
    const [value, state] = useGestureState<DragGestureValue | null>(null)
    return (
      <GestureView
        gesture={DragGesture({ axis: 'horizontal', state, onEnded: ended })}
        highPriorityGesture={LongPressGesture({ onChanged: held })}
      >
        <output>{value ? value.translation.x : 'idle'}</output>
      </GestureView>
    )
  }
  const send = (type: string, x: number, y = 0, pointerId = 42, isPrimary = true) =>
    act(() => {
      host.querySelector('output')!.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerId,
          isPrimary,
          button: 0,
          pointerType: 'touch',
          clientX: x,
          clientY: y,
        }),
      )
    })
  try {
    act(() => root.render(<Fixture />))
    send('pointerdown', 0)
    send('pointermove', 40)
    expect(host.textContent).toBe('40')
    act(() => {
      cancelPointerPressForOwnedGesture(42, 'back-swipe')
    })
    expect(host.textContent).toBe('idle')
    send('pointerup', 40)
    expect(ended).not.toHaveBeenCalled()
    send('pointerdown', 0)
    send('pointermove', 0, 30)
    send('pointercancel', 0, 30)
    act(() => vi.advanceTimersByTime(600))
    expect(held).not.toHaveBeenCalled()
    expect(host.textContent).toBe('idle')
    const ancestor = vi.fn()
    const descendant = vi.fn()
    act(() =>
      root.render(
        <GestureView highPriorityGesture={DragGesture({ axis: 'horizontal', onChanged: ancestor })}>
          <GestureView gesture={DragGesture({ axis: 'horizontal', onChanged: descendant })}>
            <output>Nested</output>
          </GestureView>
        </GestureView>,
      ),
    )
    send('pointerdown', 0)
    send('pointermove', 40)
    expect(ancestor).toHaveBeenCalled()
    expect(descendant).not.toHaveBeenCalled()
    send('pointercancel', 40)
    const pinched = vi.fn()
    act(() =>
      root.render(
        <GestureView gesture={MagnifyGesture({ onChanged: pinched })}>
          <output>Pinch</output>
        </GestureView>,
      ),
    )
    send('pointerdown', 0)
    send('pointerdown', 100, 0, 43, false)
    send('pointermove', 120, 0, 43, false)
    expect(pinched).toHaveBeenLastCalledWith({ magnification: 1.2, startAnchor: { x: 50, y: 0 } })
    send('pointerup', 120, 0, 43, false)
  } finally {
    act(() => root.unmount())
    host.remove()
    vi.useRealTimers()
  }
})
