// @vitest-environment happy-dom
import { frameworkStyleDeclarations } from '../../../test/domStyles.ts'
import { afterEach, expect, it, vi } from 'vitest'
import {
  SCROLL_EDGE_CAP_FADE_PT,
  SCROLL_EDGE_FADE_PT,
  SCROLL_EDGE_MATERIAL,
  readScrollEdges,
} from './scrollEdgeBackdrop.ts'
import {
  edgeMaterialLayers,
  edgeMaterialOver,
  edgeMaterialPass,
} from '../../navigation/scrollEdgeMaterial.ts'
import { edgesUnderSurface } from './edgePass.ts'

const css = frameworkStyleDeclarations()
afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

// The bar's edge and a pinned plain-list header draw one material, whose numbers live in
// scrollEdgeMaterial.ts. The CSS layers must be the ones those numbers derive.
it('mirrors the CSS scroll-edge material the canvas cannot sample', () => {
  const rule = (selector: string) => {
    const escaped = selector
      .trim()
      .split(/\s+/)
      .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('\\s+')
    // Every block written for exactly this selector, joined (a selector can have several).
    const blocks = [...css.matchAll(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]+)\\}`, 'g'))]
    expect(blocks.length, selector).toBeGreaterThan(0)
    return blocks.map(block => block[1]!).join('\n')
  }
  const value = (block: string, property: string) =>
    new RegExp(`(?:^|[\\s;])${property}:\\s*([^;]+);`).exec(block)?.[1]?.trim()
  const numbers = (text = '') => [...text.matchAll(/[\d.]+/g)].map(match => Number(match[0]))
  for (const [appearance, selector] of [
    ['light', ':root'],
    ['dark', "html[data-satin-appearance='dark']"],
  ] as const) {
    const material = SCROLL_EDGE_MATERIAL[appearance]
    const layers = edgeMaterialLayers(material)
    const block = rule(selector)
    const [near, brightness] = numbers(value(block, '--satin-edge-near-filter'))
    expect(near).toBe(material.near)
    expect(brightness).toBeCloseTo(layers.nearBrightness, 2)
    const [r, g, b, alpha] = numbers(value(block, '--satin-edge-wide-fill'))
    expect([r, g, b]).toEqual([layers.fillLevel, layers.fillLevel, layers.fillLevel])
    expect(alpha).toBeCloseTo(layers.fillAlpha, 2)
    expect(Number(value(block, '--satin-edge-wide-opacity'))).toBeCloseTo(layers.opacity, 2)
  }
  // Three sibling layers, shared by the bar's edge and a pinned header.
  const pinned = "[data-satin-list='plain'] [data-satin-section-header-pinned='true']"
  const nearLayer = rule(`[data-satin-scroll-edge],\n${pinned}::before`)
  expect(value(nearLayer, 'backdrop-filter')).toBe('var(--satin-edge-near-filter)')
  const wideLayer = rule(`[data-satin-scroll-edge-layer='wide'],\n${pinned}::after`)
  // A blur only, of what is below; the near layer carries the brightness.
  expect(value(wideLayer, 'backdrop-filter')).toBe(`blur(${SCROLL_EDGE_MATERIAL.light.wide}px)`)
  expect(value(wideLayer, 'background')).toBe('var(--satin-edge-wide-fill)')
  expect(value(wideLayer, 'opacity')).toBe(
    'calc(var(--satin-edge-wide-opacity) * var(--satin-scroll-edge-strength, 1))',
  )
  const finish = rule(
    `[data-satin-scroll-edge-layer='finish'],\n${pinned} > [data-satin-edge-material]`,
  )
  expect(value(finish, 'backdrop-filter')).toBe(
    `saturate(${SCROLL_EDGE_MATERIAL.light.saturation})`,
  )
  for (const key of ['near', 'wide', 'saturation'] as const)
    expect(SCROLL_EDGE_MATERIAL.dark[key]).toBe(SCROLL_EDGE_MATERIAL.light[key])
  // WebKit gives nested backdrop layers nothing to sample: no layer is a pseudo-element of
  // another backdrop element.
  expect(css).not.toMatch(/\[data-satin-scroll-edge\]::(before|after)/)
  expect(css).not.toMatch(/\[data-satin-edge-material\]::(before|after)/)
  // The bar's layers share its geometry and hard bottom.
  const edge = rule('[data-satin-scroll-edge],\n[data-satin-scroll-edge-layer]')
  expect(edge).toContain(`#000 calc(100% - ${SCROLL_EDGE_FADE_PT}px), transparent`)
  expect(edge).not.toMatch(/background|backdrop-filter/)
  expect(css).toContain(`height: calc(var(--satin-inset-top) + ${SCROLL_EDGE_CAP_FADE_PT}px);`)
  // The cap stays while the edge has yielded to a pinned header.
  expect(css).toMatch(
    /:is\(\[data-satin-scroll-edge-visible='true'\], \[data-satin-scroll-edge-yielded\]\)\s*~ \[data-satin-scroll-edge-cap\]/,
  )
})

// iOS 27.0 Simulator, iPhone 17 Pro Max, stock plain List with a pinned header over full-width
// solid colours (pinned-header blur measurements, native/fit). The CSS layers composite to these; the
// iOS 27.0 Simulator's Safari renders them within 2 levels on black, greys, blue and orange.
it('composites the CSS layers to the native readings over solid colours', () => {
  const clamp = (v: number) => Math.min(255, Math.max(0, v))
  const composite = (appearance: 'light' | 'dark', input: readonly number[]) => {
    const material = SCROLL_EDGE_MATERIAL[appearance]
    const layers = edgeMaterialLayers(material)
    // Over a flat colour both blurs return it. WebKit clamps the near layer's output; the wide
    // layer samples it; the element's saturate() applies to the composite.
    const washed = input.map(channel => {
      const near = clamp(channel * layers.nearBrightness)
      return clamp(
        (1 - layers.opacity) * near +
          layers.opacity * (layers.fillAlpha * layers.fillLevel + (1 - layers.fillAlpha) * near),
      )
    })
    const luma = 0.2126 * washed[0]! + 0.7152 * washed[1]! + 0.0722 * washed[2]!
    return washed.map(channel => clamp(luma + (channel - luma) * material.saturation))
  }
  const native = {
    light: [
      [
        [0, 0, 0],
        [136, 136, 136],
      ],
      [
        [64, 64, 64],
        [168, 168, 168],
      ],
      [
        [128, 128, 128],
        [200, 200, 200],
      ],
      [
        [192, 192, 192],
        [231, 231, 231],
      ],
      [
        [255, 255, 255],
        [255, 255, 255],
      ],
      [
        [0, 136, 255],
        [121, 206, 255],
      ],
      [
        [255, 149, 0],
        [255, 208, 116],
      ],
      [
        [255, 0, 0],
        [255, 129, 129],
      ],
      [
        [0, 255, 0],
        [113, 255, 113],
      ],
      [
        [175, 82, 222],
        [230, 173, 255],
      ],
    ],
    dark: [
      [
        [0, 0, 0],
        [8, 8, 8],
      ],
      [
        [64, 64, 64],
        [34, 34, 34],
      ],
      [
        [128, 128, 128],
        [59, 59, 59],
      ],
      [
        [192, 192, 192],
        [85, 85, 85],
      ],
      [
        [255, 255, 255],
        [110, 110, 110],
      ],
      [
        [0, 136, 255],
        [0, 65, 123],
      ],
      [
        [255, 149, 0],
        [119, 67, 0],
      ],
      [
        [255, 0, 0],
        [130, 2, 2],
      ],
      [
        [0, 255, 0],
        [0, 117, 0],
      ],
      [
        [175, 82, 222],
        [84, 38, 108],
      ],
    ],
  } as const
  for (const appearance of ['light', 'dark'] as const)
    for (const [input, reading] of native[appearance]) {
      const out = composite(appearance, input)
      out.forEach((channel, index) =>
        expect(Math.abs(channel - reading[index]!), `${appearance} ${input}`).toBeLessThanOrEqual(
          5,
        ),
      )
      // The renderer's pass and the status band's flat reading are the same response.
      const flat = edgeMaterialOver(
        input as unknown as [number, number, number],
        SCROLL_EDGE_MATERIAL[appearance],
      )
      flat.forEach((channel, index) =>
        expect(
          Math.abs(channel - reading[index]!),
          `${appearance} ${input} flat`,
        ).toBeLessThanOrEqual(5),
      )
    }
  for (const appearance of ['light', 'dark'] as const) {
    const material = SCROLL_EDGE_MATERIAL[appearance]
    const pass = edgeMaterialPass(material)
    expect(pass.tint[3] * pass.tint[0]).toBeCloseTo(material.lift, 6)
    expect(1 - pass.tint[3]).toBeCloseTo(material.gain, 6)
  }
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
      ...edgeMaterialPass(SCROLL_EDGE_MATERIAL.dark),
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

// Owner, Oct 17 (Music Library): a pinned header changed the material under the bar's glass too.
it('gives a pinned header the bar material, then the yielded edge its cap above it', () => {
  document.body.innerHTML = `<div id="host">
      <div id="edge" data-satin-scroll-edge="true" data-satin-scroll-edge-visible="false" data-satin-scroll-edge-yielded=""></div>
      <div id="cap" data-satin-scroll-edge-cap="true" style="background-color: rgb(255, 255, 255)"></div>
    </div>
    <div id="header" data-satin-section-header-pinned="true" style="--satin-pinned-header-reach: 54px"></div>`
  const box = (id: string, rect: DOMRect) =>
    vi.spyOn(document.getElementById(id)!, 'getBoundingClientRect').mockReturnValue(rect)
  vi.spyOn(document.getElementById('edge')!, 'getClientRects').mockReturnValue([
    {},
  ] as unknown as DOMRectList)
  box('edge', new DOMRect(0, 0, 440, 54))
  box('cap', new DOMRect(0, 0, 440, 28))
  box('header', new DOMRect(0, 54, 440, 40))
  expect(readScrollEdges(document, false)).toEqual([
    {
      rect: [0, 0, 440, 94],
      solid: 94,
      ...edgeMaterialPass(SCROLL_EDGE_MATERIAL.light),
      strength: 1,
    },
    {
      rect: [0, 0, 440, 28],
      solid: 28,
      sigma: 0,
      tint: [0, 0, 0, 0],
      strength: 0,
      cap: { color: [1, 1, 1, 1], solid: 0, end: 28 },
    },
  ])
  // An edge that is merely hidden (not yielded) contributes nothing.
  document.getElementById('edge')!.removeAttribute('data-satin-scroll-edge-yielded')
  expect(readScrollEdges(document, false)).toHaveLength(1)
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
