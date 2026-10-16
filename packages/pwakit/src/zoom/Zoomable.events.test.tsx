// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Zoomable } from './Zoomable.tsx'

let container: HTMLDivElement
let root: Root
let resizeObservers: TestResizeObserver[]
const changed = vi.fn()

class TestResizeObserver {
  readonly observedTargets = new Set<Element>()
  private readonly callback: () => void

  constructor(callback: () => void) {
    this.callback = callback
    resizeObservers.push(this)
  }

  observe(target: Element) {
    this.observedTargets.add(target)
  }

  disconnect() {
    this.observedTargets.clear()
  }

  deliver(target: Element) {
    if (this.observedTargets.has(target)) this.callback()
  }
}

function resized(target: Element) {
  for (const observer of resizeObservers) observer.deliver(target)
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  changed.mockClear()
  resizeObservers = []
  vi.stubGlobal('ResizeObserver', TestResizeObserver)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

function mount(maxScale = 2) {
  act(() =>
    root.render(
      <Zoomable maxScale={maxScale} onScaleChange={changed}>
        Map
      </Zoomable>,
    ),
  )
  const host = container.querySelector<HTMLDivElement>('[data-satin-role="zoomable"]')!
  Object.defineProperties(host, {
    clientWidth: { value: 200, configurable: true },
    clientHeight: { value: 100, configurable: true },
  })
  host.getBoundingClientRect = () => new DOMRect(0, 0, 200, 100)
  host.setPointerCapture = vi.fn()
  return host
}

function pointer(
  host: HTMLElement,
  type: string,
  pointerId: number,
  clientX: number,
  clientY = 50,
) {
  act(() =>
    host.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        pointerType: 'touch',
        pointerId,
        clientX,
        clientY,
      }),
    ),
  )
}

function key(host: HTMLElement, value: string) {
  const event = new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true })
  act(() => host.dispatchEvent(event))
  return event
}

function transform() {
  return container.querySelector<HTMLElement>('[data-satin-zoom-content]')!.style.transform
}

describe('Zoomable gesture ownership', () => {
  it('bounds a pinch, rebases to one-finger pan without jumping, and ignores moves after cancellation', () => {
    const host = mount()
    pointer(host, 'pointerdown', 1, 50)
    pointer(host, 'pointerdown', 2, 150)
    pointer(host, 'pointermove', 1, -150)
    expect(transform()).toBe('translate(-200px, -50px) scale(2)')
    expect(changed).toHaveBeenLastCalledWith(2)
    expect(host.setPointerCapture).toHaveBeenNthCalledWith(1, 1)
    expect(host.setPointerCapture).toHaveBeenNthCalledWith(2, 2)
    pointer(host, 'pointerup', 1, -150)
    expect(transform()).toBe('translate(-200px, -50px) scale(2)')
    pointer(host, 'pointermove', 2, 150)
    expect(transform()).toBe('translate(-200px, -50px) scale(2)')
    pointer(host, 'pointermove', 2, 170)
    expect(transform()).toBe('translate(-180px, -50px) scale(2)')
    pointer(host, 'pointercancel', 2, 170)
    const notifications = changed.mock.calls.length
    pointer(host, 'pointermove', 2, 300)
    pointer(host, 'pointermove', 1, 0)
    expect(transform()).toBe('translate(-180px, -50px) scale(2)')
    expect(changed).toHaveBeenCalledTimes(notifications)
  })

  it('ignores a third finger and stops panning after pointer capture is lost', () => {
    const host = mount()
    key(host, '+')
    pointer(host, 'pointerdown', 1, 50)
    pointer(host, 'pointerdown', 2, 150)
    pointer(host, 'pointerdown', 3, 100)
    const previous = transform()
    pointer(host, 'pointermove', 3, 500)
    expect(transform()).toBe(previous)
    expect(host.setPointerCapture).toHaveBeenCalledTimes(2)
    pointer(host, 'pointerup', 2, 150)
    pointer(host, 'lostpointercapture', 1, 50)
    pointer(host, 'pointermove', 1, 90)
    expect(transform()).toBe(previous)
  })

  it('zooms about the center with plus and minus, clamps keyboard limits, and resets with zero', () => {
    const host = mount(1.25)
    expect(key(host, '+').defaultPrevented).toBe(true)
    expect(transform()).toBe('translate(-25px, -12.5px) scale(1.25)')
    expect(changed).toHaveBeenLastCalledWith(1.25)
    key(host, '=')
    expect(transform()).toBe('translate(-25px, -12.5px) scale(1.25)')
    key(host, '-')
    key(host, '-')
    expect(transform()).toBe('translate(0px, 0px) scale(1)')
    key(host, '+')
    key(host, '0')
    expect(transform()).toBe('translate(0px, 0px) scale(1)')
    expect(host.dataset.satinZoomScale).toBe('1')
    expect(changed).toHaveBeenLastCalledWith(1)
  })

  it('lets the consumer cancel a zoom shortcut and leaves unrelated keys untouched', () => {
    const host = mount()
    act(() =>
      root.render(
        <Zoomable onScaleChange={changed} onKeyDown={event => event.preventDefault()}>
          Map
        </Zoomable>,
      ),
    )
    key(host, '+')
    expect(changed).not.toHaveBeenCalled()
    expect(host.dataset.satinZoomScale).toBe('1')
    act(() => root.render(<Zoomable onScaleChange={changed}>Map</Zoomable>))
    expect(key(host, 'ArrowRight').defaultPrevented).toBe(false)
    expect(changed).not.toHaveBeenCalled()
  })

  it('reclamps on resize and abandons pointers measured in the old viewport', () => {
    const host = mount()
    pointer(host, 'pointerdown', 1, 50)
    pointer(host, 'pointerdown', 2, 150)
    pointer(host, 'pointermove', 1, -150)
    Object.defineProperties(host, {
      clientWidth: { value: 100, configurable: true },
      clientHeight: { value: 40, configurable: true },
    })
    act(() => resized(host))
    expect(transform()).toBe('translate(-100px, -40px) scale(2)')
    expect(host.dataset.satinZoomScale).toBe('2')
    expect(changed).toHaveBeenLastCalledWith(2)
    pointer(host, 'pointermove', 2, 300)
    expect(transform()).toBe('translate(-100px, -40px) scale(2)')
  })

  it('bounds the visible transform and reported scale on layout when maxScale decreases', () => {
    const host = mount()
    pointer(host, 'pointerdown', 1, 50)
    pointer(host, 'pointerdown', 2, 150)
    pointer(host, 'pointermove', 1, -150)
    act(() =>
      root.render(
        <Zoomable maxScale={1} onScaleChange={changed}>
          Map
        </Zoomable>,
      ),
    )
    expect(resizeObservers).toHaveLength(2)
    expect(resizeObservers[0].observedTargets.size).toBe(0)
    expect(resizeObservers[1].observedTargets.has(host)).toBe(true)
    const beforeNotification = transform()
    changed.mockClear()
    act(() => resizeObservers[0].deliver(host))
    expect(transform()).toBe(beforeNotification)
    expect(changed).not.toHaveBeenCalled()
    // The replacement observer receives an initial notification for its registered host.
    act(() => resized(host))
    expect(changed).toHaveBeenCalledTimes(1)
    expect(transform()).toBe('translate(0px, 0px) scale(1)')
    expect(host.dataset.satinZoomScale).toBe('1')
    expect(changed).toHaveBeenLastCalledWith(1)
  })
})
