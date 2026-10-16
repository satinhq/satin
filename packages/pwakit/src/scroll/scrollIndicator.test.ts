// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { installScrollIndicator } from './scrollIndicator.ts'

afterEach(() => {
  document.body.replaceChildren()
  vi.unstubAllGlobals()
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
  frame.getBoundingClientRect = () => screen
  scroller.getBoundingClientRect = () => screen
  let offset = 0
  Object.defineProperties(scroller, {
    clientHeight: { get: () => 956 },
    scrollHeight: { get: () => 2868 },
    scrollTop: { get: () => offset },
  })
  installScrollIndicator(scroller, { frame, track, thumb })
  const range = () => [track.style.top, track.style.bottom]
  expect(range()).toEqual(['119px', '65px'])
  // A programmatic scroll does not flash it; a touch-driven one does, over the same range.
  scroller.dispatchEvent(new Event('scroll'))
  expect(track.dataset.satinScrollIndicatorVisible).toBeUndefined()
  scroller.dispatchEvent(new Event('touchstart'))
  offset = 1912
  scroller.dispatchEvent(new Event('scroll'))
  expect(track.dataset.satinScrollIndicatorVisible).toBe('true')
  expect(range()).toEqual(['119px', '65px'])
  // At the end of the content the thumb rests on the track's bottom.
  const trackLength = 956 - 119 - 65
  const position = parseFloat(thumb.style.transform.split(',')[1]!)
  expect(position + parseFloat(thumb.style.height)).toBeCloseTo(trackLength)
})
