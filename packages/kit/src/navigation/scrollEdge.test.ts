// @vitest-environment happy-dom
import { frameworkStyleDeclarations } from '../../test/domStyles.ts'
import { describe, expect, it } from 'vitest'
import {
  SCROLL_EDGE_RAMP_PX,
  firstContentTop,
  pinnedSectionHeader,
  scrollEdgeStrength,
  searchHeaderEdge,
} from './scrollEdge.ts'

const css = frameworkStyleDeclarations()

describe('scroll edge', () => {
  it('is off while nothing has scrolled under it', () => {
    // Content resting below the edge's lower boundary, touching it, or absent.
    expect(scrollEdgeStrength(116, 121)).toBe(0)
    expect(scrollEdgeStrength(116, 116)).toBe(0)
    expect(scrollEdgeStrength(116, undefined)).toBe(0)
  })

  it('ramps in as content moves underneath, then holds', () => {
    expect(scrollEdgeStrength(116, 116 - SCROLL_EDGE_RAMP_PX / 2)).toBe(0.5)
    expect(scrollEdgeStrength(116, 116 - SCROLL_EDGE_RAMP_PX)).toBe(1)
    expect(scrollEdgeStrength(116, -500)).toBe(1)
  })

  it('keeps the resting scroll edge hidden in computed style (DOM model)', () => {
    const stylesheet = document.createElement('style')
    stylesheet.textContent = css
    const host = document.createElement('div')
    host.setAttribute('data-satin-full-bleed', 'true')
    const edge = document.createElement('div')
    edge.setAttribute('data-satin-scroll-edge', 'top')
    host.append(edge)
    document.head.append(stylesheet)
    document.body.append(host)
    try {
      expect(getComputedStyle(edge).visibility).toBe('hidden')
    } finally {
      host.remove()
      stylesheet.remove()
    }
  })

  it('uses the clock-band colour at the top of a fitted edge', () => {
    const stylesheet = document.createElement('style')
    stylesheet.textContent = css
    document.head.append(stylesheet)
    const html = document.documentElement
    html.dataset.satinViewportFit = 'auto'
    html.dataset.satinAppearance = 'dark'
    html.style.setProperty('--satin-status-band', 'rgb(17, 57, 120)')
    const host = document.createElement('div')
    host.setAttribute('data-satin-full-bleed', 'true')
    host.innerHTML = `
      <div data-satin-navigation-edge-host="true">
        <div data-satin-scroll-edge data-satin-scroll-edge-visible="true"></div>
        <div data-satin-scroll-edge-cap></div>
      </div>`
    document.body.append(host)
    const cap = host.querySelector<HTMLElement>('[data-satin-scroll-edge-cap]')!
    try {
      expect(getComputedStyle(cap).display).toBe('block')
      expect(getComputedStyle(cap).backgroundColor).toBe('rgb(17, 57, 120)')
    } finally {
      host.remove()
      stylesheet.remove()
      html.removeAttribute('data-satin-viewport-fit')
      html.removeAttribute('data-satin-appearance')
      html.style.removeProperty('--satin-status-band')
    }
  })
})

it('does not blur resting content already inside the floating iPad tab row', () => {
  const scroller = document.createElement('div')
  const title = document.createElement('h1')
  title.getBoundingClientRect = () => ({ top: 57, width: 112, height: 42 }) as DOMRect
  scroller.append(title)
  expect(scrollEdgeStrength(110, firstContentTop(scroller))).toBe(0)
  scroller.scrollTop = 20
  expect(scrollEdgeStrength(110, firstContentTop(scroller))).toBe(1)
})

// Owner, Oct 9 (Music Library): the bar's edge and a pinned plain-list header drew two stacked
// bands with content showing through between them. Native (iOS 27 native reference rough-edges) draws one
// hard-edged material from the screen top through the pinned header.
it('hands the edge material to a plain-list section header pinned under the bar', () => {
  const scroller = document.createElement('div')
  scroller.setAttribute('data-satin-list', 'plain')
  scroller.getBoundingClientRect = () => ({ top: 0, bottom: 956 }) as DOMRect
  const sections = [0, 1].map(() => {
    const section = document.createElement('section')
    section.setAttribute('data-satin-list-section', 'true')
    const header = document.createElement('div')
    header.setAttribute('data-satin-section-header', 'true')
    section.append(header)
    scroller.append(section)
    return { section, header }
  })
  const place = (index: number, sectionTop: number, headerTop: number) => {
    sections[index]!.section.getBoundingClientRect = () => ({ top: sectionTop }) as DOMRect
    sections[index]!.header.getBoundingClientRect = () =>
      ({ top: headerTop, bottom: headerTop + 40 }) as DOMRect
  }
  // At rest every header sits at the top of its own section: nothing is pinned.
  place(0, 300, 300)
  place(1, 900, 900)
  expect(pinnedSectionHeader(scroller)).toBeUndefined()
  // Scrolled: the first section's top has passed under the bar and its header holds at 116.
  place(0, -400, 116)
  expect(pinnedSectionHeader(scroller)).toEqual({ header: sections[0]!.header, reach: 116 })
  // A searchable list pins its headers under the drawer, whose own edge material covers them.
  scroller.setAttribute('data-satin-searchable', 'plain')
  expect(pinnedSectionHeader(scroller)).toBeUndefined()
})

// Native searchable List, iPhone 17 Pro Max / iOS 27.0. The 4 pt join
// above the field keeps the high chrome layer clear of its foreground.
it('covers the entire pinned searchable header and releases it when search is presented', () => {
  const scroller = document.createElement('div')
  scroller.innerHTML =
    '<div data-satin-search></div><div data-satin-search-edge></div><section></section>'
  const [drawer, marker, content] = Array.from(scroller.children)
  drawer!.getBoundingClientRect = () => new DOMRect(0, 116, 440, 54)
  marker!.getBoundingClientRect = () => new DOMRect(0, 170, 440, 0)
  content!.getBoundingClientRect = () => new DOMRect(0, 150, 440, 900)
  expect(searchHeaderEdge(scroller)).toBeUndefined()
  scroller.scrollTop = 72
  expect(searchHeaderEdge(scroller)?.top).toBe(112)
  expect(searchHeaderEdge(scroller)?.strength).toBe(1)
  scroller.setAttribute('data-satin-search-presented', '')
  expect(searchHeaderEdge(scroller)).toBeUndefined()
})
