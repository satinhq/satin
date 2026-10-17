// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { Slider } from './ListForm.tsx'
import { SliderContact } from './sliderContact.ts'

it('a stepped Slider thumb follows the finger from the thumb only, snapping to its stops', () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const changed = vi.fn()
  const render = (value: number) =>
    root.render(<Slider label="Steps" value={value} onChange={changed} max={10} step={1} ticks />)
  act(() => render(2))
  const slider = host.querySelector<HTMLElement>('[data-satin-slider]')!
  // A 360 pt row: the thumb centre travels 323 pt, one stop is 32.3 pt.
  Object.defineProperty(slider, 'clientWidth', { value: 360 })
  act(() => render(2))
  const thumb = host.querySelector<HTMLElement>('[data-satin-slider-thumb]')!
  const fill = host.querySelector<HTMLElement>('[data-satin-slider-fill]')!
  const center = () => parseFloat(thumb.style.left) + parseFloat(thumb.style.width) / 2 - 12
  const pointer = (type: string, clientX: number) =>
    act(() => {
      slider.dispatchEvent(
        new PointerEvent(type, { isPrimary: true, bubbles: true, clientX, pointerId: 3 }),
      )
    })
  expect(host.querySelectorAll('[data-satin-slider-tick]')).toHaveLength(11)
  // The track beside the thumb is not a drag handle (UISlider): the row keeps its scroll.
  pointer('pointerdown', 300)
  pointer('pointermove', 340)
  pointer('pointerup', 340)
  expect(changed).not.toHaveBeenCalled()
  const start = 18.5 + 0.2 * 323
  pointer('pointerdown', start)
  // Less than half a stop: the thumb stays on its stop.
  pointer('pointermove', start + 10)
  expect(center()).toBeCloseTo(start)
  expect(changed).not.toHaveBeenCalled()
  // Past half a stop: one stop on, and the fill ends at the thumb centre.
  pointer('pointermove', start + 20)
  expect(changed).toHaveBeenLastCalledWith(3)
  expect(center()).toBeCloseTo(18.5 + 0.3 * 323)
  expect(parseFloat(fill.style.width)).toBeCloseTo(18.5 + 0.3 * 323)
  pointer('pointerup', start + 20)
  act(() => root.unmount())
  host.remove()
})

it('a held Slider lifts its thumb into the 58 × 37.3 pt lens; Reduce Motion never lifts', () => {
  const contact = new SliderContact(0.25)
  contact.down(1, 0, 0, 0)
  expect(contact.liftDue(200)).toBe(false)
  expect(contact.liftDue(333)).toBe(true)
  contact.lift(333)
  expect(contact.sample(333 + 2000).lift).toBeCloseTo(1)
  contact.end(2400)
  expect(contact.sample(2400 + 3000).lift).toBeCloseTo(0)
  const reduced = new SliderContact(0.25)
  reduced.reducedMotion = true
  reduced.down(1, 0, 0, 0)
  reduced.lift(333)
  expect(reduced.sample(333 + 2000).lift).toBe(0)
})

it('a lifted Slider fill runs unbroken under the lens rim, flaring there (no gap)', () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  let clock = 1000
  const time = vi.spyOn(performance, 'now').mockImplementation(() => clock)
  const render = () => root.render(<Slider label="Volume" value={0.5} onChange={() => {}} />)
  act(render)
  const slider = host.querySelector<HTMLElement>('[data-satin-slider]')!
  Object.defineProperty(slider, 'clientWidth', { value: 360 })
  act(render)
  const fill = host.querySelector<HTMLElement>('[data-satin-slider-fill]')!
  const pointer = (type: string, clientX: number) =>
    act(() => {
      slider.dispatchEvent(
        new PointerEvent(type, { isPrimary: true, bubbles: true, clientX, pointerId: 4 }),
      )
    })
  const start = 18.5 + 0.5 * 323
  pointer('pointerdown', start)
  host.querySelector<HTMLCanvasElement>(
    '[data-satin-control-lens] canvas',
  )!.dataset.satinGlassPresented = 'true'
  pointer('pointermove', start + 30)
  clock += 2000
  pointer('pointermove', start + 30)
  // Held lens 58 pt wide: its left rim sits 29 pt before the thumb centre.
  expect(fill.hasAttribute('data-satin-slider-lifted')).toBe(true)
  expect(parseFloat(fill.style.getPropertyValue('--satin-slider-rim'))).toBeCloseTo(
    start + 30 - 29,
    0,
  )
  expect(fill.style.getPropertyValue('--satin-slider-flare')).toBe('1')
  expect(fill.style.maskImage).toBe('')
  pointer('pointerup', start + 30)
  time.mockRestore()
  act(() => root.unmount())
  host.remove()
})

it('a Slider releases and reopens editing when a modal stops pointer events', () => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const editing = vi.fn()
  let clock = 1000
  const time = vi.spyOn(performance, 'now').mockImplementation(() => clock)
  act(() =>
    root.render(
      <div
        onPointerMove={event => event.stopPropagation()}
        onPointerUp={event => event.stopPropagation()}
        onPointerCancel={event => event.stopPropagation()}
      >
        <Slider label="Volume" value={0.5} onChange={() => {}} onEditingChange={editing} />
      </div>,
    ),
  )
  const slider = host.querySelector<HTMLElement>('[data-satin-slider]')!
  Object.defineProperty(slider, 'clientWidth', { value: 360 })
  const advance = (duration: number) => {
    clock += duration
    act(() => vi.advanceTimersByTime(duration))
  }
  const thumb = host.querySelector<HTMLElement>('[data-satin-slider-thumb]')!
  const pointer = (type: string, clientX = 180) =>
    act(() => {
      slider.dispatchEvent(
        new PointerEvent(type, { isPrimary: true, bubbles: true, clientX, pointerId: 4 }),
      )
    })
  for (const ending of ['pointerup', 'pointercancel']) {
    pointer('pointerdown')
    host.querySelector<HTMLCanvasElement>('canvas')!.dataset.satinGlassPresented = 'true'
    advance(500)
    advance(2000)
    expect(Number(thumb.style.opacity)).toBeLessThan(0.01)
    pointer('pointermove', 190)
    pointer(ending, 190)
    expect(editing).toHaveBeenLastCalledWith(false)
    advance(3000)
    expect(Number(thumb.style.opacity)).toBeGreaterThan(0.99)
    pointer('pointerdown', 190)
    expect(editing).toHaveBeenLastCalledWith(true)
    pointer('pointercancel', 190)
  }
  act(() => root.unmount())
  time.mockRestore()
  host.remove()
})

it('commits the final finger position when release arrives after the last move', () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const changed = vi.fn()
  const editing = vi.fn()
  act(() =>
    root.render(<Slider label="Volume" value={0.5} onChange={changed} onEditingChange={editing} />),
  )
  const slider = host.querySelector<HTMLElement>('[data-satin-slider]')!
  Object.defineProperty(slider, 'clientWidth', { value: 360 })
  const pointer = (type: string, clientX: number) =>
    act(() => {
      slider.dispatchEvent(
        new PointerEvent(type, {
          isPrimary: true,
          bubbles: true,
          clientX,
          pointerId: 19,
        }),
      )
    })
  try {
    pointer('pointerdown', 180)
    pointer('pointermove', 220)
    pointer('pointerup', 300)
    expect(changed).toHaveBeenLastCalledWith(0.5 + 120 / 323)
    expect(editing.mock.calls).toEqual([[true], [false]])
    // A browser cancellation has no valid final coordinates and must not move the thumb.
    changed.mockClear()
    pointer('pointerdown', 300)
    pointer('pointercancel', 0)
    expect(changed).not.toHaveBeenCalled()
  } finally {
    act(() => root.unmount())
    host.remove()
  }
})
