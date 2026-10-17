// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import {
  SCROLL_EDGE_CAP_FADE_PT,
  SCROLL_EDGE_FADE_PT,
  SCROLL_EDGE_MATERIAL,
  readScrollEdges,
} from './scrollEdgeBackdrop.ts'
import { edgesUnderSurface } from './edgePass.ts'

const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8')
afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

it('mirrors the CSS scroll-edge material the canvas cannot sample', () => {
  const rule = (selector: string) => {
    const start = css.indexOf(selector + ' {')
    return css.slice(start, css.indexOf('\n}', start))
  }
  const light = rule('[data-satin-scroll-edge]')
  const dark = rule("html[data-satin-appearance='dark'] [data-satin-scroll-edge]")
  expect(light).toContain(`backdrop-filter: blur(${SCROLL_EDGE_MATERIAL.light.sigma}px)`)
  expect(light).toContain(`rgb(255 255 255 / ${SCROLL_EDGE_MATERIAL.light.tint[3]})`)
  expect(light).toContain(`#000 calc(100% - ${SCROLL_EDGE_FADE_PT}px), transparent`)
  // Dark changes only the tint: same blur, same hard-edged geometry.
  expect(dark).not.toContain('blur(')
  expect(dark).not.toContain('mask-image')
  expect(SCROLL_EDGE_MATERIAL.dark.sigma).toBe(SCROLL_EDGE_MATERIAL.light.sigma)
  expect(dark).toContain(`rgb(0 0 0 / ${SCROLL_EDGE_MATERIAL.dark.tint[3]})`)
  expect(css).toContain(`height: calc(var(--satin-inset-top) + ${SCROLL_EDGE_CAP_FADE_PT}px);`)
})

it('reads only visible edges, with their bar-relative mask and scroll-driven strength', () => {
  document.body.innerHTML = `<div id="host"><div id="edge" data-satin-scroll-edge="true" data-satin-scroll-edge-visible="true" style="opacity:0.5"></div></div>
    <div><div id="hidden" data-satin-scroll-edge="true" data-satin-scroll-edge-visible="false"></div></div>`
  const box = (id: string, x: number, y: number, w: number, h: number) =>
    vi.spyOn(document.getElementById(id)!, 'getBoundingClientRect').mockReturnValue({
      x,
      y,
      left: x,
      top: y,
      width: w,
      height: h,
      right: x + w,
      bottom: y + h,
      toJSON() {},
    } as DOMRect)
  box('host', 0, 0, 440, 44)
  box('edge', 0, 0, 440, 54)
  vi.spyOn(document.getElementById('edge')!, 'getClientRects').mockReturnValue([
    {},
  ] as unknown as DOMRectList)
  expect(readScrollEdges(document, true)).toEqual([
    {
      rect: [0, 0, 440, 54],
      solid: 52,
      sigma: SCROLL_EDGE_MATERIAL.dark.sigma,
      tint: SCROLL_EDGE_MATERIAL.dark.tint,
      strength: 0.5,
    },
  ])
  // A fitted bar's edge reaches up through the status inset; it stays solid to the bar row's bottom.
  box('host', 0, 62, 440, 44)
  box('edge', 0, 0, 440, 116)
  const fitted = readScrollEdges(document, false)[0]!
  expect(fitted).toMatchObject({ rect: [0, 0, 440, 116], solid: 114 })
  expect(fitted.mask).toBeUndefined()
})

it('composes the search drawer edge into glass backdrops at rest, so the field refracts it', () => {
  // reference (owner, Oct 10): dark Chats scrolled showed sharp avatars inside the search field, whose
  // glass sampled content the CSS edge had not blurred or darkened.
  document.body.innerHTML = `<div data-satin-searchable="true"><div id="marker" data-satin-search-edge="true"></div></div>`
  const marker = document.getElementById('marker')!
  vi.spyOn(marker, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 170,
    left: 0,
    top: 170,
    width: 440,
    height: 0,
    right: 440,
    bottom: 170,
    toJSON() {},
  } as DOMRect)
  vi.spyOn(marker, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
  let pinned = false
  const computed = window.getComputedStyle
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) =>
    element === marker && pseudo === '::before'
      ? ({
          opacity: '1',
          top: pinned ? '-58px' : '-54px',
          height: pinned ? '98px' : '94px',
          backdropFilter: pinned ? 'blur(1.5px)' : 'blur(12.5px)',
          backgroundColor: 'rgba(0, 0, 0, 0.429191155)',
          getPropertyValue: () => '',
        } as unknown as CSSStyleDeclaration)
      : computed(element, pseudo),
  )
  const edge = readScrollEdges(document, true).at(-1)
  expect(edge).toEqual({
    search: true,
    rect: [0, 116, 440, 94],
    solid: 188,
    sigma: 12.5,
    // Blur only: the field's material already carries the edge's darkening.
    tint: [0, 0, 0, 0],
    strength: 1,
  })
  // Native preserves the avatar's shape through a pinned field. Its 1.5 pt
  // diffusion and input transmission replace the Form-derived 12.5 pt halo.
  pinned = true
  marker.setAttribute('data-satin-search-edge-covered', '')
  expect(readScrollEdges(document, true).at(-1)).toMatchObject({
    rect: [0, 112, 440, 53],
    solid: 160,
    sigma: 1.5,
    tint: [0, 0, 0, 0.15439976917646614],
  })
  // The field itself sees that edge's transmission but not its blur: native passes a row title
  // through the pinned field at 0.9 pt, and the header's blur under the field's own diffusion
  // measured 2.0-2.25 pt. Other glass over the edge keeps it whole.
  const edges = readScrollEdges(document, true)
  expect(edgesUnderSurface(edges, 'searchField').at(-1)).toMatchObject({
    sigma: 0,
    tint: [0, 0, 0, 0.15439976917646614],
  })
  expect(edgesUnderSurface(edges, 'chrome')).toEqual(edges)
  // During push/pop the transition owns the bar's edges.
  const screen = document.createElement('div')
  const route = { screen, motion: screen }
  expect(readScrollEdges(document, true, [route] as never)).not.toContainEqual(edge)
})
