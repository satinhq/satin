// @vitest-environment happy-dom
import { act, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { useAlertKeyboardMotion } from './useAlertKeyboardMotion.ts'
import { alertKeyboardState } from './motion.ts'

afterEach(() => vi.restoreAllMocks())
it('keeps the old visible centre at a viewport step and cancels sampling on close', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const cancel = vi.fn(),
    invalidate = vi.fn()
  const animate = vi
    .spyOn(HTMLElement.prototype, 'animate')
    .mockReturnValue({ cancel, finished: new Promise(() => {}) } as unknown as Animation)
  const request = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(31)
  const cancelFrame = vi.spyOn(window, 'cancelAnimationFrame')
  const container = document.createElement('div'),
    root = createRoot(container)
  const regions = { invalidate } as never
  function Probe({ center, open = true }: { center: number; open?: boolean }) {
    const dialog = useRef<HTMLDialogElement>(null)
    useAlertKeyboardMotion(dialog, open, center, center !== 492, regions)
    return (
      <dialog ref={dialog}>
        <div data-satin-glass-layer style={{ top: center, transform: 'translateY(-50%)' }} />
      </dialog>
    )
  }
  try {
    act(() => root.render(<Probe center={492} />))
    expect(animate).not.toHaveBeenCalled()
    act(() => root.render(<Probe center={335.5} />))
    expect(animate).toHaveBeenCalledOnce()
    // A pending WebKit animation may contribute no keyframes until next paint.
    // The underlying position must still equal the old centre during that gap.
    const panel = container.querySelector<HTMLElement>('[data-satin-glass-layer]')!
    expect(Number.parseFloat(panel.style.top)).toBe(335.5)
    expect(panel.style.transform).toBe('translateY(-50%) translateY(156.5px)')
    expect(animate.mock.calls[0]![1]).toMatchObject({ fill: 'both' })
    const frames = animate.mock.calls[0]![0] as Keyframe[]
    expect(frames[0]!.transform).toBe('translateY(-50%) translateY(156.5px)')
    expect(frames.every(frame => !('top' in frame))).toBe(true)
    expect(frames.at(-1)!.transform).toBe('translateY(-50%) translateY(0px)')
    expect(container.querySelector('dialog')?.getAttribute('data-satin-presentation-moving')).toBe(
      'keyboard',
    )
    expect(request).toHaveBeenCalled()
    act(() => root.render(<Probe center={335.5} open={false} />))
    expect(cancel).toHaveBeenCalledOnce()
    expect(panel.style.top).toBe('335.5px')
    expect(cancelFrame).toHaveBeenCalledWith(31)
    expect(container.querySelector('dialog')?.hasAttribute('data-satin-presentation-moving')).toBe(
      false,
    )
  } finally {
    act(() => root.unmount())
    container.remove()
  }
})

it('retargets from the moving position and honors reduced motion on the next update', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  let now = 0,
    reduced = false
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.spyOn(window, 'matchMedia').mockImplementation(() => ({ matches: reduced }) as MediaQueryList)
  const cancel = vi.fn(),
    invalidate = vi.fn()
  const animate = vi
    .spyOn(HTMLElement.prototype, 'animate')
    .mockImplementation(() => ({ cancel, finished: new Promise(() => {}) }) as unknown as Animation)
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(31)
  vi.spyOn(window, 'cancelAnimationFrame')
  const container = document.createElement('div'),
    root = createRoot(container)
  const regions = { invalidate } as never
  function Probe({ center, keyboard = center !== 492 }: { center: number; keyboard?: boolean }) {
    const dialog = useRef<HTMLDialogElement>(null)
    useAlertKeyboardMotion(dialog, true, center, keyboard, regions)
    return (
      <dialog ref={dialog}>
        <div data-satin-glass-layer />
      </dialog>
    )
  }
  try {
    act(() => root.render(<Probe center={470} keyboard={false} />))
    act(() => root.render(<Probe center={492} />))
    expect(animate).not.toHaveBeenCalled()
    act(() => root.render(<Probe center={335.5} />))
    now = 90
    const before = 335.5 + alertKeyboardState(156.5, 0, 0, 0.09).position
    act(() => root.render(<Probe center={400} />))
    expect(animate).toHaveBeenCalledTimes(2)
    const frames = animate.mock.calls[1]![0] as Keyframe[]
    const offset = Number(String(frames[0]!.transform).match(/translateY\(([-\d.]+)px\)/)![1])
    expect(400 + offset).toBeCloseTo(before, 8)
    expect(cancel).toHaveBeenCalledOnce()
    reduced = true
    act(() => root.render(<Probe center={492} />))
    expect(animate).toHaveBeenCalledTimes(2)
    expect(cancel).toHaveBeenCalledTimes(2)
    expect(container.querySelector<HTMLElement>('[data-satin-glass-layer]')?.style.top).toBe(
      '492px',
    )
    expect(invalidate).toHaveBeenCalled()
  } finally {
    act(() => root.unmount())
    container.remove()
  }
})

it.each([492, 335.5])('blurs its editor before keyboard return motion to %s', returnCenter => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const animate = vi.spyOn(HTMLElement.prototype, 'animate').mockImplementation(() => {
    expect(document.activeElement?.tagName).not.toBe('INPUT')
    return { cancel: vi.fn(), finished: new Promise(() => {}) } as unknown as Animation
  })
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(31)
  vi.spyOn(window, 'cancelAnimationFrame')
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  function Probe({ keyboard, center }: { keyboard: boolean; center: number }) {
    const dialog = useRef<HTMLDialogElement>(null)
    useAlertKeyboardMotion(dialog, true, center, keyboard, { invalidate: vi.fn() } as never)
    return (
      <dialog open ref={dialog}>
        <div data-satin-glass-layer>
          <input />
        </div>
      </dialog>
    )
  }
  try {
    act(() => root.render(<Probe keyboard center={335.5} />))
    container.querySelector('input')!.focus()
    expect(document.activeElement).toBe(container.querySelector('input'))
    act(() => root.render(<Probe keyboard={false} center={returnCenter} />))
    expect(document.activeElement).not.toBe(container.querySelector('input'))
    expect(animate).toHaveBeenCalledTimes(returnCenter === 492 ? 1 : 0)
  } finally {
    act(() => root.unmount())
    container.remove()
  }
})

it('leaves an editor outside the alert focused when its keyboard disappears', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.spyOn(HTMLElement.prototype, 'animate').mockReturnValue({
    cancel: vi.fn(),
    finished: new Promise(() => {}),
  } as unknown as Animation)
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(31)
  vi.spyOn(window, 'cancelAnimationFrame')
  const container = document.createElement('div')
  const externalEditor = document.createElement('input')
  document.body.append(container, externalEditor)
  const root = createRoot(container)
  function Probe({ keyboard }: { keyboard: boolean }) {
    const dialog = useRef<HTMLDialogElement>(null)
    useAlertKeyboardMotion(dialog, true, keyboard ? 335.5 : 492, keyboard, {
      invalidate: vi.fn(),
    } as never)
    return (
      <dialog ref={dialog}>
        <div data-satin-glass-layer />
      </dialog>
    )
  }
  try {
    act(() => root.render(<Probe keyboard />))
    externalEditor.focus()
    act(() => root.render(<Probe keyboard={false} />))
    expect(document.activeElement).toBe(externalEditor)
  } finally {
    act(() => root.unmount())
    container.remove()
    externalEditor.remove()
  }
})

it('ends editing only when a reported keyboard leaves, not when an anticipated one is withdrawn', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.spyOn(HTMLElement.prototype, 'animate').mockReturnValue({
    cancel: vi.fn(),
    finished: new Promise(() => {}),
  } as unknown as Animation)
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(31)
  vi.spyOn(window, 'cancelAnimationFrame')
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  type Keyboard = 'hidden' | 'anticipated' | 'reported'
  function Probe({ keyboard }: { keyboard: Keyboard }) {
    const dialog = useRef<HTMLDialogElement>(null)
    useAlertKeyboardMotion(
      dialog,
      true,
      keyboard === 'hidden' ? 492 : 335.5,
      keyboard !== 'hidden',
      { invalidate: vi.fn() } as never,
      keyboard === 'reported',
    )
    return (
      <dialog ref={dialog}>
        <div data-satin-glass-layer />
        <input />
      </dialog>
    )
  }
  try {
    act(() => root.render(<Probe keyboard="hidden" />))
    const editor = container.querySelector('input')!
    // A tap focus: the alert leaves for its keyboard position at once...
    editor.focus()
    act(() => root.render(<Probe keyboard="anticipated" />))
    expect(container.querySelector('dialog')?.getAttribute('data-satin-presentation-moving')).toBe(
      'keyboard',
    )
    // ...and no keyboard arrives (a hardware keyboard): the alert returns, editing continues.
    act(() => root.render(<Probe keyboard="hidden" />))
    expect(document.activeElement).toBe(editor)
    // Anticipated, then reported at the same centre, then gone: that keyboard ends editing.
    act(() => root.render(<Probe keyboard="anticipated" />))
    act(() => root.render(<Probe keyboard="reported" />))
    expect(document.activeElement).toBe(editor)
    act(() => root.render(<Probe keyboard="hidden" />))
    expect(document.activeElement).not.toBe(editor)
  } finally {
    act(() => root.unmount())
    container.remove()
  }
})

it.each([
  [492, 335.5],
  [335.5, 492],
])('keeps the previous sampled top curve within 0.5 pt from %s to %s', (from, to) => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const animate = vi
    .spyOn(HTMLElement.prototype, 'animate')
    .mockReturnValue({ cancel: vi.fn(), finished: new Promise(() => {}) } as unknown as Animation)
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(31)
  const container = document.createElement('div')
  const root = createRoot(container)
  function Probe({ center }: { center: number }) {
    const dialog = useRef<HTMLDialogElement>(null)
    useAlertKeyboardMotion(dialog, true, center, center !== 492)
    return (
      <dialog ref={dialog}>
        <div data-satin-glass-layer />
      </dialog>
    )
  }
  try {
    act(() => root.render(<Probe center={from!} />))
    act(() => root.render(<Probe center={to!} />))
    const frames = animate.mock.calls[0]![0] as Keyframe[]
    const offsets = frames.map(frame =>
      Number(String(frame.transform).match(/translateY\(([-\d.]+)px\)/)![1]),
    )
    // Baseline top animation also linearly interpolated 85 samples over 700 ms.
    // Compare its delivered curve, including the forced terminal destination.
    const oldTops = Array.from({ length: 85 }, (_, index) =>
      index === 84 ? to! : alertKeyboardState(from!, to!, 0, index / 120).position,
    )
    for (let ms = 0; ms <= 700; ms++) {
      const index = (ms * 120) / 1000
      const a = Math.floor(index)
      const b = Math.min(offsets.length - 1, a + 1)
      const actual = to! + offsets[a]! + (offsets[b]! - offsets[a]!) * (index - a)
      const expected = oldTops[a]! + (oldTops[b]! - oldTops[a]!) * (index - a)
      expect(Math.abs(actual - expected)).toBeLessThan(0.5)
    }
  } finally {
    act(() => root.unmount())
  }
})
