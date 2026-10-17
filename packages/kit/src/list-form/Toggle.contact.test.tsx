// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { Toggle, ToggleRow } from './ListForm.tsx'

afterEach(() => vi.useRealTimers())
it('a stationary release toggles once without a click and preserves native label activation', () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const changed = vi.fn()
  act(() => root.render(<Toggle checked={false} onChange={changed} label="Daily Reminder" />))
  const toggle = host.querySelector('[role=switch]')!
  act(() => {
    toggle.dispatchEvent(
      new PointerEvent('pointerdown', { isPrimary: true, bubbles: true, pointerId: 7 }),
    )
    toggle.dispatchEvent(
      new PointerEvent('pointerup', { isPrimary: true, bubbles: true, pointerId: 7 }),
    )
  })
  expect(changed).toHaveBeenCalledExactlyOnceWith(true)
  const click = new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })
  act(() => toggle.dispatchEvent(click))
  expect(changed).toHaveBeenCalledExactlyOnceWith(true)
  expect(click.defaultPrevented).toBe(false)
  // The label default is WebKit's haptic path; happy-dom does not run it after stopped propagation.
  const unrelatedLabel = document.createElement('label')
  host.append(unrelatedLabel)
  act(() => {
    toggle.dispatchEvent(
      new PointerEvent('pointerdown', { isPrimary: true, bubbles: true, pointerId: 8 }),
    )
    toggle.dispatchEvent(
      new PointerEvent('pointerup', { isPrimary: true, bubbles: true, pointerId: 8 }),
    )
  })
  const retargeted = new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })
  act(() => unrelatedLabel.dispatchEvent(retargeted))
  expect(retargeted.defaultPrevented).toBe(true)
  act(() => root.unmount())
  host.remove()
})
it('a switch contact does not start its containing row action', () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const rowAction = vi.fn()
  act(() =>
    root.render(
      <div onPointerDown={rowAction}>
        <ToggleRow checked={false} onChange={() => {}} label="Daily Reminder" />
      </div>,
    ),
  )
  const toggle = host.querySelector('[data-satin-toggle]')!
  act(() =>
    toggle.dispatchEvent(
      new PointerEvent('pointerdown', { isPrimary: true, bubbles: true, pointerId: 7 }),
    ),
  )
  expect(rowAction).not.toHaveBeenCalled()
  act(() =>
    toggle.dispatchEvent(
      new PointerEvent('pointercancel', { isPrimary: true, bubbles: true, pointerId: 7 }),
    ),
  )
  act(() => root.unmount())
  host.remove()
})
it('a Toggle drag changes once, consumes its click, and expires at 350 ms', () => {
  vi.useFakeTimers()
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const changed = vi.fn()
  act(() => root.render(<Toggle checked={false} onChange={changed} label="Switch" />))
  const toggle = host.querySelector('[role=switch]')!
  function drag() {
    act(() => {
      toggle.dispatchEvent(
        new PointerEvent('pointerdown', { isPrimary: true, bubbles: true, clientX: 0 }),
      )
      toggle.dispatchEvent(
        new PointerEvent('pointerup', { isPrimary: true, bubbles: true, clientX: 30 }),
      )
    })
  }
  drag()
  act(() => toggle.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })))
  expect(changed).toHaveBeenCalledTimes(1)
  drag()
  vi.advanceTimersByTime(350)
  act(() => toggle.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })))
  expect(changed).toHaveBeenCalledTimes(3)
  act(() => root.unmount())
  host.remove()
})
it('a dragged Toggle thumb follows the finger and commits the side it is released on', () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const changed = vi.fn()
  act(() => root.render(<Toggle checked={false} onChange={changed} label="Switch" />))
  const toggle = host.querySelector('[role=switch]')!
  const thumb = host.querySelector<HTMLElement>('[data-satin-toggle-thumb]')!
  // A resting thumb is ordinary glass-source content (bars over a scrolled list sample it); the
  // source drops aria-hidden subtrees (lens/Scene.tsx), so none may wrap it.
  expect(thumb.closest('[aria-hidden="true"]')).toBeNull()
  const pointer = (type: string, clientX: number) =>
    act(() => {
      toggle.dispatchEvent(
        new PointerEvent(type, { isPrimary: true, bubbles: true, clientX, pointerId: 7 }),
      )
    })
  pointer('pointerdown', 100)
  // 16 of the 22 pt travel: past the middle, and the white thumb (37 pt) sits under the finger.
  pointer('pointermove', 116)
  expect(parseFloat(thumb.style.left) + parseFloat(thumb.style.width) / 2).toBeCloseTo(
    11 + 20.5 + 16,
  )
  // Back to the off side before lifting the finger: the value stays off and no click toggles it.
  pointer('pointermove', 104)
  pointer('pointerup', 104)
  act(() => toggle.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })))
  expect(changed).not.toHaveBeenCalled()
  act(() => root.unmount())
  host.remove()
})

it('a Toggle restores and can lift again when a modal stops pointer events', () => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  let clock = 1000
  const time = vi.spyOn(performance, 'now').mockImplementation(() => clock)
  act(() =>
    root.render(
      <div
        onPointerMove={event => event.stopPropagation()}
        onPointerUp={event => event.stopPropagation()}
        onPointerCancel={event => event.stopPropagation()}
      >
        <Toggle checked={false} onChange={() => {}} label="Pin" />
      </div>,
    ),
  )
  const toggle = host.querySelector<HTMLElement>('[role=switch]')!
  const thumb = host.querySelector<HTMLElement>('[data-satin-toggle-thumb]')!
  const advance = (duration: number) => {
    clock += duration
    act(() => vi.advanceTimersByTime(duration))
  }
  const pointer = (type: string, clientX = 0) =>
    act(() => {
      toggle.dispatchEvent(
        new PointerEvent(type, { isPrimary: true, bubbles: true, clientX, pointerId: 7 }),
      )
    })
  for (const ending of ['pointerup', 'pointercancel']) {
    pointer('pointerdown')
    host.querySelector<HTMLCanvasElement>('canvas')!.dataset.satinGlassPresented = 'true'
    advance(500)
    advance(2000)
    pointer('pointermove', 20)
    expect(Number(thumb.style.opacity)).toBeLessThan(0.01)
    pointer(ending, 20)
    advance(3000)
    expect(Number(thumb.style.opacity)).toBeGreaterThan(0.99)
    // The next contact can lift again after the modal-isolated release.
    pointer('pointerdown')
    advance(500)
    advance(2000)
    expect(Number(thumb.style.opacity)).toBeLessThan(0.01)
    pointer('pointercancel')
    advance(3000)
  }
  act(() => root.unmount())
  time.mockRestore()
  host.remove()
})
