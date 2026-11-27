// @vitest-environment happy-dom
import { act, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { frameworkStyleDeclarations } from '../../test/domStyles.ts'
import { usePrimaryScrollIndicator } from './PrimaryScrollIndicator.tsx'
import { createScrollSurfaceRegistry } from './registry.ts'
import { installScrollIndicator } from './scrollIndicator.ts'

const releases: (() => void)[] = []
let resized: () => void
let animation: FrameRequestCallback | undefined

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resized = callback
      }
      observe() {}
      disconnect() {}
    },
  )
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      animation = callback
      return 1
    }),
  )
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})

afterEach(() => {
  for (const release of releases.splice(0)) release()
  document.body.replaceChildren()
  document.head.replaceChildren()
  animation = undefined
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function pointer(target: EventTarget, type: string, pointerId = 1, pointerType = 'touch') {
  // WebKit begins with both event families; terminal pointer paths must work without touchend.
  if (type === 'pointerdown' && pointerType === 'touch')
    target.dispatchEvent(new Event('touchstart', { bubbles: true }))
  const event = new Event(type, { bubbles: true })
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    pointerType: { value: pointerType },
  })
  target.dispatchEvent(event)
}

function fixture(sheet = false, layoutHeight = 800) {
  const dialog = document.createElement('dialog')
  dialog.dataset.satinPresentation = 'sheet'
  const surface = document.createElement('div')
  surface.className = 'satin-presentation-surface'
  surface.style.borderRadius = '38px'
  const frame = document.createElement('div')
  if (sheet) frame.className = 'satin-sheet-content-scale'
  else frame.dataset.satinPresentation = 'push'
  const scroller = document.createElement('div')
  scroller.dataset.satinScrollAxis = 'vertical'
  const track = document.createElement('span')
  const thumb = document.createElement('span')
  track.append(thumb)
  frame.append(scroller, track)
  surface.append(frame)
  dialog.append(surface)
  document.body.append(dialog)
  const box = (top: number, bottom: number) => ({ top, bottom, height: bottom - top }) as DOMRect
  surface.getBoundingClientRect = vi.fn(() => box(0, 450))
  frame.getBoundingClientRect = vi.fn(() => box(20, 420))
  scroller.getBoundingClientRect = vi.fn(() => box(40, 400))
  Object.defineProperty(frame, 'clientHeight', { value: layoutHeight, configurable: true })
  Object.defineProperties(scroller, {
    clientHeight: { value: 720 },
    scrollHeight: { value: 2880 },
  })
  frame.style.setProperty('--satin-sheet-content-scale', '0.5')
  const release = installScrollIndicator(scroller, {
    frame,
    track,
    thumb,
    mode: sheet ? 'sheet' : 'screen',
  })
  releases.push(release)
  return { dialog, surface, frame, scroller, track, thumb }
}

function scroll(scroller: HTMLElement) {
  scroller.scrollTop += 20
  scroller.dispatchEvent(new Event('scroll'))
}

it('keeps sheet indicator ownership out of screen layout and primary-change events', () => {
  const host = document.createElement('div')
  document.body.append(host)
  const registry = createScrollSurfaceRegistry()
  const changed = vi.fn()
  host.addEventListener('satin:primary-scroll', changed)
  function Owner() {
    const frame = useRef<HTMLDivElement>(null)
    const indicator = usePrimaryScrollIndicator(frame, registry, 'sheet')
    return (
      <div className="satin-sheet-content-scale" ref={frame}>
        {indicator}
      </div>
    )
  }
  const root = createRoot(host)
  act(() => root.render(<Owner />))
  releases.push(() => act(() => root.unmount()))
  const frame = host.firstElementChild as HTMLElement
  const scroller = document.createElement('div')
  frame.prepend(scroller)
  const unregister = registry.register({
    id: 'sheet',
    axis: 'vertical',
    primary: true,
    element: scroller,
  })
  releases.push(unregister)
  expect(frame.hasAttribute('data-satin-screen-scroll')).toBe(false)
  expect(changed).not.toHaveBeenCalled()
  expect(frame.dataset.satinScrollIndicatorOwner).toBe('primary')
})

it('uses the declared detent scale for nonzero offsets and fractional layout heights', () => {
  const { track, thumb } = fixture(true, 800.25)
  expect(track.style.top).toBe('43px')
  expect(track.style.bottom).toBe('43px')
  expect(parseFloat(thumb.style.height)).toBeCloseTo((800 - 86) / 4)
})

it('does not substitute a visual border box for a zero layout height', () => {
  const { track } = fixture(true, 0)
  expect(track.dataset.satinScrollIndicatorScrollable).toBe('false')
})

it('normalizes a screen inside a scaled sheet with the same explicit scale and sheet clearance', () => {
  const { frame, track } = fixture(false, 800.25)
  frame.style.setProperty('--satin-screen-bar-inset', '50px')
  resized()
  animation?.(0)
  expect(track.style.top).toBe('93px')
  expect(track.style.bottom).toBe('43px')
})

it('does not carry ancestor sheet clearance through a full-screen cover', () => {
  const { surface, frame, scroller, track, thumb } = fixture()
  releases.pop()!()
  const cover = document.createElement('dialog')
  cover.dataset.satinPresentation = 'cover'
  const coverSurface = document.createElement('div')
  coverSurface.className = 'satin-presentation-surface'
  coverSurface.style.borderRadius = '0px'
  coverSurface.getBoundingClientRect = surface.getBoundingClientRect
  surface.append(cover)
  cover.append(coverSurface)
  coverSurface.append(frame)
  frame.style.setProperty('--satin-sheet-content-scale', '1')
  scroller.style.paddingBottom = '34px'
  scroller.style.setProperty('--satin-inset-bottom', '34px')
  releases.push(installScrollIndicator(scroller, { frame, track, thumb }))
  expect(track.style.bottom).toBe('85px')
})

it('has a single drawing owner when the same primary scroller is rebound', () => {
  const { frame, scroller, track } = fixture()
  const replacement = document.createElement('span')
  const thumb = document.createElement('span')
  replacement.append(thumb)
  frame.append(replacement)
  releases.push(installScrollIndicator(scroller, { frame, track: replacement, thumb }))
  pointer(scroller, 'pointerdown')
  scroll(scroller)
  expect(track.dataset.satinScrollIndicatorVisible).toBe('false')
  expect(replacement.dataset.satinScrollIndicatorVisible).toBe('true')
  expect(scroller.dataset.satinScrollIndicatorOwned).toBe('true')
})

it.each(['pointerup', 'pointercancel', 'lostpointercapture', 'blur', 'hidden'])(
  'retires a held touch on %s even when a menu consumes the lift',
  end => {
    const { scroller, track } = fixture()
    pointer(scroller, 'pointerdown')
    scroll(scroller)
    vi.advanceTimersByTime(1200)
    expect(track.dataset.satinScrollIndicatorVisible).toBe('true')
    const swallow = (event: Event) => event.stopPropagation()
    document.addEventListener(end, swallow, true)
    if (end === 'hidden') {
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
      document.dispatchEvent(new Event('visibilitychange'))
    } else if (end === 'blur') {
      // Model the native Window blur target explicitly in the DOM emulator.
      const event = new FocusEvent('blur')
      Object.defineProperty(event, 'target', { value: window })
      window.dispatchEvent(event)
    } else pointer(scroller, end)
    document.removeEventListener(end, swallow, true)
    vi.advanceTimersByTime(501)
    expect(track.dataset.satinScrollIndicatorVisible).toBe('false')
  },
)

it('keeps a held touch when a focused text field blurs', () => {
  const { scroller, track } = fixture()
  const input = document.createElement('input')
  scroller.append(input)
  input.focus()
  pointer(scroller, 'pointerdown')
  scroll(scroller)
  input.blur()
  vi.advanceTimersByTime(1200)
  expect(track.dataset.satinScrollIndicatorVisible).toBe('true')
  pointer(window, 'pointerup')
  vi.advanceTimersByTime(501)
  expect(track.dataset.satinScrollIndicatorVisible).toBe('false')
})

it('tracks only the initiating touch id including text-node targets', () => {
  const { scroller, track } = fixture()
  const text = document.createTextNode('Row')
  scroller.append(text)
  pointer(text, 'pointerdown', 7)
  scroll(scroller)
  pointer(scroller, 'pointerdown', 8)
  pointer(window, 'pointerup', 8)
  vi.advanceTimersByTime(1200)
  expect(track.dataset.satinScrollIndicatorVisible).toBe('true')
  pointer(window, 'pointerup', 7)
  vi.advanceTimersByTime(501)
  expect(track.dataset.satinScrollIndicatorVisible).toBe('false')
})

it.each(['wheel', 'mouse', 'failsafe'])('does not retain a stuck touch after %s', ending => {
  const { scroller, track } = fixture()
  pointer(scroller, 'pointerdown')
  scroll(scroller)
  if (ending === 'wheel') scroller.dispatchEvent(new Event('wheel'))
  else if (ending === 'mouse') pointer(scroller, 'pointerdown', 2, 'mouse')
  vi.advanceTimersByTime(31_000)
  expect(track.dataset.satinScrollIndicatorVisible).toBe('false')
})

it('shows the parent only when nested input actually chains into parent scrolling', () => {
  const { scroller, track } = fixture()
  const nested = document.createElement('div')
  nested.dataset.satinScrollAxis = 'horizontal'
  nested.append(document.createTextNode('Nested'))
  scroller.append(nested)
  pointer(nested, 'pointerdown')
  expect(track.dataset.satinScrollIndicatorVisible).not.toBe('true')
  vi.advanceTimersByTime(1200)
  scroll(scroller)
  expect(track.dataset.satinScrollIndicatorVisible).toBe('true')
  pointer(window, 'pointerup')
  vi.advanceTimersByTime(501)
  expect(track.dataset.satinScrollIndicatorVisible).toBe('false')
})

it('clears sheet corners and puts sheet indicators below navigation chrome without screen grid roles', () => {
  const style = document.createElement('style')
  style.textContent = frameworkStyleDeclarations()
  document.head.append(style)
  const { frame, scroller, track } = fixture(true)
  frame.dataset.satinScrollIndicatorOwner = 'primary'
  track.dataset.satinScrollIndicatorTrack = 'true'
  // At the very edge the continuous corner, rather than a home-indicator allowance, wins.
  frame.getBoundingClientRect = () => ({ top: 0, bottom: 450, height: 450 }) as DOMRect
  scroller.getBoundingClientRect = frame.getBoundingClientRect
  resized()
  animation?.(0)
  expect(track.style.top).toBe('76px')
  expect(track.style.bottom).toBe('76px')
  expect(getComputedStyle(track).display).toBe('block')
  expect(getComputedStyle(track).zIndex).toBe('1')
})

it.each([true, false])(
  'coalesces resize work and skips geometry reads during a detent drag (direct=%s)',
  direct => {
    const { dialog, frame, scroller } = fixture(direct)
    const frameReads = vi.mocked(frame.getBoundingClientRect)
    const scrollerReads = vi.mocked(scroller.getBoundingClientRect)
    frameReads.mockClear()
    scrollerReads.mockClear()
    dialog.dataset.satinPresentationMoving = 'drag'
    resized()
    resized()
    animation?.(0)
    expect(frameReads).not.toHaveBeenCalled()
    expect(scrollerReads).not.toHaveBeenCalled()
    delete dialog.dataset.satinPresentationMoving
    resized()
    resized()
    animation?.(1)
    expect(frameReads).toHaveBeenCalledTimes(1)
    expect(scrollerReads).toHaveBeenCalledTimes(1)
  },
)

it('installs capture listeners only during a held contact and removes them on release', () => {
  const add = vi.spyOn(window, 'addEventListener')
  const remove = vi.spyOn(window, 'removeEventListener')
  const { scroller } = fixture()
  expect(add.mock.calls.filter(([type]) => ['pointerup', 'touchend'].includes(type))).toHaveLength(
    0,
  )
  pointer(scroller, 'pointerdown')
  expect(add.mock.calls.some(([type, , options]) => type === 'pointerup' && options === true)).toBe(
    true,
  )
  pointer(window, 'pointerup')
  expect(
    remove.mock.calls.some(([type, , options]) => type === 'pointerup' && options === true),
  ).toBe(true)
})

it('releases a contact and its global listeners when a screen is retained behind another screen', () => {
  const host = document.createElement('div')
  document.body.append(host)
  const registry = createScrollSurfaceRegistry()
  function Owner({ active }: { active: boolean }) {
    const frame = useRef<HTMLDivElement>(null)
    const indicator = usePrimaryScrollIndicator(frame, registry, 'screen', active)
    return <div ref={frame}>{indicator}</div>
  }
  const root = createRoot(host)
  act(() => root.render(<Owner active />))
  releases.push(() => act(() => root.unmount()))
  const frame = host.firstElementChild as HTMLElement
  const scroller = document.createElement('div')
  frame.prepend(scroller)
  releases.push(
    registry.register({ id: 'page', axis: 'vertical', primary: true, element: scroller }),
  )
  const remove = vi.spyOn(window, 'removeEventListener')
  pointer(scroller, 'pointerdown')
  act(() => root.render(<Owner active={false} />))
  expect(remove.mock.calls.some(([type]) => type === 'pointerup')).toBe(true)
  expect(scroller.hasAttribute('data-satin-scroll-indicator-owned')).toBe(false)
})
