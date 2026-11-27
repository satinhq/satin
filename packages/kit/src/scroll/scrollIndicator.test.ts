// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { installScrollIndicator } from './scrollIndicator.ts'

afterEach(() => {
  document.body.replaceChildren()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it('ranges the indicator below the bar and above the bottom insets wherever the content is', () => {
  // Owner, Reminders "Scheduled": the indicator's top jumped between ~65 pt and ~115 pt with the
  // scroll position. Native keeps it 3 pt below the bar and clear of the display's corner.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  const frame = document.createElement('div')
  const scroller = document.createElement('div')
  const track = document.createElement('span')
  const thumb = document.createElement('span')
  frame.append(scroller, track)
  track.append(thumb)
  document.body.append(frame)
  frame.style.setProperty('--satin-screen-bar-inset', '116px')
  scroller.style.setProperty('--satin-inset-bottom', '34px')
  scroller.style.paddingBottom = '34px'
  const screen = { top: 0, bottom: 956, height: 956 } as DOMRect
  Object.defineProperty(frame, 'clientHeight', { value: 956, configurable: true })
  frame.getBoundingClientRect = () => screen
  scroller.getBoundingClientRect = () => screen
  let offset = 0
  Object.defineProperties(scroller, {
    clientHeight: { get: () => 956 },
    scrollHeight: { get: () => 2868 },
    scrollTop: { get: () => offset },
  })
  const release = installScrollIndicator(scroller, { frame, track, thumb })
  const range = () => [track.style.top, track.style.bottom]
  expect(range()).toEqual(['119px', '65px'])
  // A programmatic scroll does not flash it; a touch-driven one does, over the same range.
  scroller.dispatchEvent(new Event('scroll'))
  expect(track.dataset.satinScrollIndicatorVisible).toBeUndefined()
  scroller.dispatchEvent(
    new PointerEvent('pointerdown', { bubbles: true, pointerId: 7, pointerType: 'touch' }),
  )
  offset = 1912
  scroller.dispatchEvent(new Event('scroll'))
  expect(track.dataset.satinScrollIndicatorVisible).toBe('true')
  expect(range()).toEqual(['119px', '65px'])
  // At the end of the content the thumb rests on the track's bottom.
  const trackLength = 956 - 119 - 65
  const position = parseFloat(thumb.style.transform.split(',')[1]!)
  expect(position + parseFloat(thumb.style.height)).toBeCloseTo(trackLength)
  // Scaling a sheet must not apply its transform twice to the indicator's CSS geometry.
  Object.defineProperty(frame, 'clientHeight', { value: 956 })
  frame.style.setProperty('--satin-sheet-content-scale', '0.5')
  const scaled = { top: 0, bottom: 478, height: 478 } as DOMRect
  frame.getBoundingClientRect = () => scaled
  scroller.getBoundingClientRect = () => scaled
  release()
  const releaseScaled = installScrollIndicator(scroller, { frame, track, thumb })
  expect(range()).toEqual(['119px', '65px'])
  expect(parseFloat(thumb.style.height)).toBeCloseTo(trackLength / 3)
  releaseScaled()
})

it('keeps a paused contact visible, resumes it, then retires ownership after release and momentum', () => {
  vi.useFakeTimers()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  const frame = document.createElement('div')
  const scroller = document.createElement('div')
  const track = document.createElement('span')
  const thumb = document.createElement('span')
  frame.append(scroller, track)
  document.body.append(frame)
  const box = { top: 0, bottom: 800, height: 800 } as DOMRect
  Object.defineProperty(frame, 'clientHeight', { value: 800 })
  frame.getBoundingClientRect = () => box
  scroller.getBoundingClientRect = () => box
  Object.defineProperties(scroller, {
    clientHeight: { value: 800 },
    scrollHeight: { value: 3200 },
  })
  const release = installScrollIndicator(scroller, { frame, track, thumb })
  const visible = () => track.dataset.satinScrollIndicatorVisible
  scroller.dispatchEvent(
    new PointerEvent('pointerdown', { bubbles: true, pointerId: 7, pointerType: 'touch' }),
  )
  scroller.dispatchEvent(new Event('scroll'))
  vi.advanceTimersByTime(1200)
  expect(visible()).toBe('true')
  scroller.scrollTop = 200
  scroller.dispatchEvent(new Event('scroll'))
  expect(visible()).toBe('true')
  window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, pointerType: 'touch' }))
  vi.advanceTimersByTime(400)
  scroller.dispatchEvent(new Event('scroll'))
  vi.advanceTimersByTime(400)
  expect(visible()).toBe('true')
  vi.advanceTimersByTime(1000)
  expect(visible()).toBe('false')
  scroller.dispatchEvent(new Event('scroll'))
  expect(visible()).toBe('false')
  scroller.dispatchEvent(
    new PointerEvent('pointerdown', { bubbles: true, pointerId: 7, pointerType: 'touch' }),
  )
  scroller.dispatchEvent(new Event('scroll'))
  window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 7, pointerType: 'touch' }))
  vi.advanceTimersByTime(1500)
  expect(visible()).toBe('false')
  scroller.dataset.satinScrollAxis = 'vertical'
  const nested = document.createElement('div')
  nested.dataset.satinScrollAxis = 'horizontal'
  scroller.append(nested)
  nested.dispatchEvent(new Event('wheel', { bubbles: true }))
  scroller.dispatchEvent(new Event('scroll'))
  // Input arms the ancestor; its own actual chained scroll is what shows its track.
  expect(visible()).toBe('true')
  release()
})
