// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { observeNavigationEdge } from './navigationEdge.ts'

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

// Owner, Oct 17 (Music Library, light): once "Recently Added" pinned, the top of the screen
// changed from the bar's faded edge to a strongly coloured blur that ran straight into the status
// band. Natively the material is the same with or without a pinned header (iOS 27.0 List fixture),
// so the bar's edge yields its material to the header but keeps its fitted-viewport cap.
it('yields the bar edge to a pinned plain-list header and keeps the edge marked while pinned', async () => {
  document.body.innerHTML = `
    <div id="host"><div id="edge" data-satin-scroll-edge="true"></div></div>
    <div id="list" data-satin-list="plain">
      <section id="section" data-satin-list-section="true">
        <div id="header" data-satin-section-header="true"></div>
      </section>
    </div>`
  const get = (id: string) => document.getElementById(id)!
  const edge = get('edge'),
    scroller = get('list'),
    header = get('header')
  vi.spyOn(edge, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
  const rect = (element: HTMLElement, top: number, height: number) =>
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, top, 440, height))
  rect(edge, -62, 116)
  rect(scroller, 0, 956)
  // Scrolled: the section's top has passed under the bar and its header holds at 54.
  rect(get('section'), -400, 1400)
  rect(header, 54, 40)
  scroller.scrollTop = 460

  const release = observeNavigationEdge(edge, scroller, false)
  expect(header.getAttribute('data-satin-section-header-pinned')).toBe('true')
  expect(header.style.getPropertyValue('--satin-pinned-header-reach')).toBe('54px')
  // The header carries the material, so the edge's own layer is off; the cap stays (CSS).
  expect(edge.getAttribute('data-satin-scroll-edge-visible')).toBe('false')
  expect(edge.hasAttribute('data-satin-scroll-edge-yielded')).toBe(true)

  // Scrolled back: the header sits at its section's top again and nothing is pinned.
  rect(get('section'), 200, 1400)
  rect(header, 200, 40)
  scroller.setAttribute('data-satin-scroll-edge-hidden', 'false')
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(header.hasAttribute('data-satin-section-header-pinned')).toBe(false)
  expect(edge.hasAttribute('data-satin-scroll-edge-yielded')).toBe(false)

  // Releasing the observer while pinned also releases the yield.
  rect(get('section'), -400, 1400)
  rect(header, 54, 40)
  scroller.setAttribute('data-satin-scroll-edge-hidden', '')
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(edge.hasAttribute('data-satin-scroll-edge-yielded')).toBe(true)
  release()
  expect(edge.hasAttribute('data-satin-scroll-edge-yielded')).toBe(false)
  expect(header.hasAttribute('data-satin-section-header-pinned')).toBe(false)
})
