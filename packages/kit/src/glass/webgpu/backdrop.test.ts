import { openModal } from '../../modal/lifecycle.ts'
// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { Backdrop, intersect } from './backdrop.ts'
import { FrameGraph } from './frameGraph.ts'
import {
  backdropOwner,
  backdropExclusions,
  backdropClip,
  discoverBackdropHosts,
  effectiveBackground,
} from './backdropLayers.ts'
import type { LayerDevice } from './layers.ts'
import type { BackdropLayer } from '../worker/protocol.ts'
import { hold } from '../presentationFrame.ts'
import { measureMirrorLayout } from '../lens/Scene.tsx'

const owner = () => ({ liveDevice: undefined, subscribe: () => () => {} }) as unknown as LayerDevice
const bitmap = (width: number, height: number) =>
  ({ width, height, close() {} }) as unknown as ImageBitmap
const layer = (
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  scroll = { x: 0, y: 0 },
): BackdropLayer => ({
  id,
  key: `${id}:1:front`,
  width,
  height: height * 2,
  resolution: 2,
  origin: { x, y },
  clip: [x, y, width, height],
  scroll,
  fill: [0, 0, 0, 1],
})
function backdrop(layers: BackdropLayer[]) {
  const device = owner(),
    graph = FrameGraph.for(device)
  for (const l of layers) graph.image(l.key, bitmap(l.width * 2, l.height * 2))
  const b = Backdrop.for(device)
  b.setLayers(layers)
  return b
}
// iPad split: sidebar 0..320, detail 320..1366, both below the 54 pt tab row.
const sidebar = layer('sidebar', 0, 54, 320, 970),
  detail = layer('detail', 320, 54, 1046, 970)

it('composes only the planes under a surface, and both planes under one straddling the pane boundary', () => {
  const b = backdrop([sidebar, detail])
  expect(b.under([266, 120, 44, 44]).map(u => u.plane.layer.id)).toEqual(['sidebar'])
  expect(b.under([1300, 60, 44, 44]).map(u => u.plane.layer.id)).toEqual(['detail'])
  const straddle = b.under([300, 200, 40, 40])
  expect(straddle.map(u => [u.plane.layer.id, u.clip])).toEqual([
    ['sidebar', [300, 200, 20, 40]],
    ['detail', [320, 200, 20, 40]],
  ])
  // A tab capsule above both panes samples the page background alone.
  expect(b.under([592, 36, 183, 18])).toEqual([])
})

it('keeps a scroll-attached surface key while its plane scrolls, and changes a fixed surface key', () => {
  const b = backdrop([sidebar, detail])
  const attached = (scroll: number) => b.keyFor([500, 300 - scroll, 100, 60]),
    fixed = () => b.keyFor([1300, 60, 44, 44])
  const before = [attached(0), fixed()]
  b.setScroll('detail', 0, 120)
  expect(attached(120)).toBe(before[0])
  expect(fixed()).not.toBe(before[1])
})

it('scrolls two independent planes independently', () => {
  const b = backdrop([sidebar, detail])
  const overSidebar = b.keyFor([16, 140, 44, 44]),
    overDetail = b.keyFor([336, 140, 44, 44])
  expect(b.setScroll('sidebar', 0, 40)).toBe(true)
  expect(b.keyFor([16, 140, 44, 44])).not.toBe(overSidebar)
  expect(b.keyFor([336, 140, 44, 44])).toBe(overDetail)
  expect(b.setScroll('sidebar', 0, 40)).toBe(false)
  expect(b.setScroll('missing', 0, 1)).toBe(false)
})

it('intersects viewport rectangles', () => {
  expect(intersect([0, 0, 10, 10], [5, 5, 10, 10])).toEqual([5, 5, 5, 5])
  expect(intersect([0, 0, 10, 10], [10, 0, 5, 5])).toBeUndefined()
})

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})
function box(element: Element, x: number, y: number, width: number, height: number) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    x,
    y,
    left: x,
    top: y,
    width,
    height,
    right: x + width,
    bottom: y + height,
    toJSON() {},
  } as DOMRect)
}
function html(markup: string) {
  const root = document.createElement('div')
  root.setAttribute('data-satin-scene-paint-layer', 'true')
  root.innerHTML = markup
  document.body.append(root)
  return root
}

it('discovers every visible scroll container and static screen, in paint order, with no pane names', () => {
  const scene = html(`<div data-satin-navigation-layout="split">
  <div data-satin-screen-container data-satin-pane="sidebar" data-satin-covered="false"><div id="side" data-satin-scroll="list"><div id="nested" data-satin-scroll="carousel"></div></div></div>
  <div data-satin-screen-container data-satin-pane="detail" data-satin-covered="true"><div id="under" data-satin-scroll="rear"></div></div>
  <div data-satin-screen-container data-satin-pane="detail" data-satin-covered="false" id="static"><p>No scroller</p></div>
 </div>`)
  for (const [id, [x, y, w, h]] of [
    ['side', [0, 54, 320, 970]],
    ['nested', [0, 300, 320, 100]],
    ['under', [320, 54, 1046, 970]],
    ['static', [320, 54, 1046, 970]],
  ] as const)
    box(scene.querySelector('#' + id)!, x, y, w, h)
  vi.stubGlobal('innerWidth', 1366)
  vi.stubGlobal('innerHeight', 1024)
  expect(discoverBackdropHosts(scene).map(e => e.id)).toEqual(['side', 'static'])
})

// happy-dom does not implement :modal; a dialog opened with showModal matches it in WebKit.
const modal = (dialog: HTMLDialogElement) => {
  const matches = dialog.matches.bind(dialog)
  vi.spyOn(dialog, 'matches').mockImplementation(
    selector => selector === ':modal' || matches(selector),
  )
  return dialog
}
it('drops a collapsed sidebar, keeps a hidden launch root, and adds open modal dialogs last', () => {
  const scene =
    html(`<div data-satin-screen-container data-satin-covered="false" style="visibility:hidden"><div id="side" data-satin-scroll="list"></div></div>
  <div data-satin-screen-container data-satin-covered="false"><div id="detail" data-satin-scroll="detail"></div></div>`)
  const dialog = modal(document.createElement('dialog'))
  dialog.setAttribute('open', '')
  dialog.innerHTML = '<div id="sheet" data-satin-scroll="sheet"></div>'
  document.body.append(dialog)
  for (const id of ['side', 'detail']) box(scene.querySelector('#' + id)!, 0, 0, 440, 956)
  box(dialog.querySelector('#sheet')!, 0, 300, 440, 656)
  vi.stubGlobal('innerWidth', 440)
  vi.stubGlobal('innerHeight', 956)
  expect(discoverBackdropHosts(scene).map(e => e.id)).toEqual(['detail', 'sheet'])
  // A launch cover hides the whole scene from above: planes are still prepared (the
  // pane's own hiding cannot be told apart then; the reveal prepares again).
  const launch = document.createElement('div')
  launch.setAttribute('inert', '')
  launch.style.visibility = 'hidden'
  scene.replaceWith(launch)
  launch.append(scene)
  expect(discoverBackdropHosts(scene).map(e => e.id)).toEqual(['side', 'detail', 'sheet'])
})

// reference: a sheet held for its first glass (hidden, at its entrance pose below the screen) must
// still give its glass a backdrop of its own content, placed where the sheet will rest.
it("discovers a held, travelling sheet's content under its scroll views, in its resting frame", () => {
  const scene = html('<div data-satin-screen-container data-satin-covered="false" id="page"></div>')
  const dialog = modal(document.createElement('dialog'))
  dialog.setAttribute('open', '')
  dialog.setAttribute('data-satin-presentation', 'sheet')
  dialog.innerHTML = `<div data-satin-glass-layer="sheet"
    style="transform:matrix(1, 0, 0, 1, 0, 900)">
    <div class="satin-presentation-surface" id="surface" data-satin-glass-region-id="sheet">
      <div class="satin-sheet-content"><div data-satin-presentation-content="true" id="content">
        <div id="rows" data-satin-scroll="rows"></div></div></div></div></div>`
  document.body.append(dialog)
  hold(dialog.querySelector<HTMLElement>('[data-satin-glass-layer]')!, '1')
  // The hold clips the presentation to nothing. Its layout and computed visibility stay as they
  // will show, so discovery reads it without any style change (toggling a stylesheet restyles the
  // whole document, about 216 ms per read on an iPad behind a long thread).
  const sheet = document.querySelector<HTMLStyleElement>('style[data-satin-glass-hold-style]')!
  expect(sheet.textContent).toContain('clip-path: inset(50%) !important')
  expect(sheet.textContent).not.toContain('visibility')
  box(scene.querySelector('#page')!, 0, 0, 440, 956)
  box(dialog.querySelector('#surface')!, 0, 990, 440, 894)
  box(dialog.querySelector('#content')!, 0, 1010, 440, 874)
  box(dialog.querySelector('#rows')!, 0, 1100, 440, 784)
  vi.stubGlobal('innerWidth', 440)
  vi.stubGlobal('innerHeight', 956)
  expect(discoverBackdropHosts(scene).map(e => e.id)).toEqual(['page', 'content', 'rows'])
  // The content backs the whole surface, at rest 900 pt higher.
  expect(backdropClip(dialog.querySelector<HTMLElement>('#content')!)).toEqual([
    -1e5,
    90,
    2e5,
    1e5 - 90,
  ])
})

it('keeps a non-modal dialog (show()) in the plane it sits in', () => {
  const scene = html(
    `<div data-satin-screen-container data-satin-covered="false"><div id="detail" data-satin-scroll="detail"><dialog open id="inline"><div id="popover" data-satin-scroll="popover"></div></dialog></div></div>`,
  )
  box(scene.querySelector('#detail')!, 0, 0, 440, 956)
  box(scene.querySelector('#popover')!, 0, 100, 200, 200)
  vi.stubGlobal('innerWidth', 440)
  vi.stubGlobal('innerHeight', 956)
  // Not a top-layer plane of its own, and not dropped from the page: in-flow content.
  expect(discoverBackdropHosts(scene).map(e => e.id)).not.toContain('popover')
  expect(discoverBackdropHosts(scene).map(e => e.id)).toContain('detail')
})

it('clips a plane to its clipping ancestors and continues it past screen edges', () => {
  const scene = html(
    `<div id="pane" style="overflow:hidden"><div id="boxless" style="display:contents;overflow:scroll"><div id="list" data-satin-scroll="list"></div></div></div>`,
  )
  box(scene.querySelector('#boxless')!, 0, 0, 0, 0)
  box(scene.querySelector('#pane')!, 0, 54, 320, 970)
  box(scene.querySelector('#list')!, 0, 40, 320, 1000)
  vi.stubGlobal('innerWidth', 1366)
  vi.stubGlobal('innerHeight', 1024)
  expect(backdropClip(scene.querySelector('#list')!)).toEqual([-1e5, 54, 1e5 + 320, 1e5 - 54])
})

it('continues a plane past a screen edge its clipping ancestor misses by a sub-pixel', () => {
  const scene = html(
    `<div id="mount" style="overflow:hidden"><div id="list" data-satin-scroll="list"></div></div>`,
  )
  // The mount is laid out 1/64 pt short of the 956 pt screen; the list fills the screen.
  box(scene.querySelector('#mount')!, 0, 0, 440, 955.984375)
  box(scene.querySelector('#list')!, 0, 0, 440, 956)
  vi.stubGlobal('innerWidth', 440)
  vi.stubGlobal('innerHeight', 956)
  expect(backdropClip(scene.querySelector('#list')!)).toEqual([-1e5, -1e5, 2e5, 2e5])
})

it('fills a plane with its composited ancestor backgrounds over the page', () => {
  const scene = html(
    `<div id="pane" style="background:rgb(24, 29, 32)"><div id="list" style="background:rgba(255, 255, 255, 0.5)"></div></div>`,
  )
  expect(
    effectiveBackground(scene.querySelector('#list')!, [0, 0, 0]).map(v => Math.round(v * 255)),
  ).toEqual([140, 142, 144, 255])
  expect(effectiveBackground(scene, [1, 1, 1])).toEqual([1, 1, 1, 1])
})

it('excludes a presentation owner and later dialogs from both composition and its cache key', () => {
  const page = layer('page', 0, 0, 440, 956)
  const sheet = { ...layer('sheet', 0, 400, 440, 556), owner: 'sheet-dialog' }
  const alert = { ...layer('alert', 100, 450, 240, 200), owner: 'alert-dialog' }
  const scene = backdrop([page, sheet, alert])
  const rect = [100, 450, 240, 200] as const
  const excluded = ['sheet-dialog', 'alert-dialog']
  expect(scene.under(rect, excluded).map(item => item.plane.layer.id)).toEqual(['page'])
  const key = scene.keyFor(rect, undefined, excluded)
  scene.setScroll('sheet', 0, 30)
  expect(scene.keyFor(rect, undefined, excluded)).toBe(key)
  expect(scene.under(rect, ['alert-dialog']).map(item => item.plane.layer.id)).toEqual([
    'page',
    'sheet',
  ])
})

it('keeps dialog ownership stable across recaptures and preserves lower dialog content for controls', () => {
  const page = html('<button id="page-button"></button>')
  const sheet = modal(document.createElement('dialog'))
  const alert = modal(document.createElement('dialog'))
  for (const dialog of [sheet, alert]) {
    dialog.setAttribute('open', '')
    dialog.innerHTML = '<button></button>'
    document.body.append(dialog)
  }
  const sheetOwner = backdropOwner(sheet)!
  const alertOwner = backdropOwner(alert)!
  expect(backdropOwner(sheet.querySelector('button')!)).toBe(sheetOwner)
  expect(backdropExclusions(sheet, true)).toEqual([sheetOwner, alertOwner])
  expect(backdropExclusions(sheet.querySelector('button')!, false)).toEqual([alertOwner])
  expect(backdropExclusions(page, false)).toEqual([sheetOwner, alertOwner])
})

it('tracks activation order on reopening and assigns nested content to its nearest modal', () => {
  const outer = document.createElement('dialog')
  const inner = document.createElement('dialog')
  const button = document.createElement('button')
  outer.append(inner)
  inner.append(button)
  document.body.append(outer)
  for (const dialog of [outer, inner]) modal(dialog)
  const closeOuter = openModal(outer)
  const closeInner = openModal(inner)
  const outerOwner = backdropOwner(outer)!
  const innerOwner = backdropOwner(button)!
  expect(innerOwner).not.toBe(outerOwner)
  expect(backdropExclusions(button, true)).toEqual([innerOwner])
  closeOuter()
  const reopenOuter = openModal(outer)
  expect(backdropExclusions(button, true)).toEqual([innerOwner, outerOwner])
  reopenOuter()
  closeInner()
})
it('keeps a visually present inert presenter below sheets throughout presentation', () => {
  const scene = html('<div id="presenter" data-satin-scroll="page" inert></div>')
  const sheet = modal(document.createElement('dialog'))
  sheet.open = true
  sheet.innerHTML = '<div id="sheet-content" data-satin-scroll="sheet"></div>'
  scene.append(sheet)
  box(scene.querySelector('#presenter')!, 0, 0, 440, 956)
  box(sheet.firstElementChild!, 0, 86, 440, 870)
  vi.stubGlobal('innerWidth', 440)
  vi.stubGlobal('innerHeight', 956)
  expect(discoverBackdropHosts(scene).map(host => host.id)).toEqual(['presenter', 'sheet-content'])
})

it('dims menu samples above the scene without dimming the underlying glass twice', () => {
  const overlay = { ...layer('dim', 0, 0, 1366, 1024), menuOverlay: true, owner: 'sheet' }
  const scene = backdrop([sidebar, detail, overlay])
  const rect = [400, 300, 224, 146] as const
  expect(scene.under(rect).map(({ plane }) => plane.layer.id)).toEqual(['detail'])
  expect(scene.under(rect, [], true).map(({ plane }) => plane.layer.id)).toEqual(['detail', 'dim'])
  expect(scene.under(rect, ['sheet'], true).map(({ plane }) => plane.layer.id)).toEqual(['detail'])
  const before = scene.keyFor(rect, undefined, [], false, true)
  overlay.fill = [0, 0, 0, 0.48]
  expect(scene.keyFor(rect, undefined, [], false, true)).not.toBe(before)
})

it("never enters a presentation content plane's own scroll views (their own planes)", () => {
  const content = html(`<div data-satin-presentation-content="true" id="content">
    <div id="header">Details</div>
    <div data-satin-scroll="form" id="form"><div id="row">Atlas</div></div></div>`).querySelector(
    '#content',
  )!
  box(content, 0, 0, 440, 900)
  box(content.querySelector('#header')!, 0, 0, 440, 60)
  box(content.querySelector('#form')!, 0, 60, 440, 840)
  const row = content.querySelector('#row')!
  box(row, 0, 60, 440, 44)
  const visited = vi.spyOn(row, 'closest')
  const layout = measureMirrorLayout(content as HTMLElement, 'root', true)
  expect(layout?.nodes.some(node => node.y === 0 && node.height === 60)).toBe(true)
  expect(layout?.nodes.some(node => node.y >= 60)).toBe(false)
  // A sheet's form is most of its elements: the scan never visits one.
  expect(visited).not.toHaveBeenCalled()
  expect(row.getBoundingClientRect).not.toHaveBeenCalled()
})

it.each(['data-satin-search', 'data-satin-search-toolbar'])(
  'keeps %s chrome out of its own backdrop while retaining results',
  marker => {
    const content = html(`<div id="content">
      <div ${marker}><div><label>Search</label><input placeholder="Search"></div></div>
      <div id="result">Atlas</div></div>`).querySelector<HTMLElement>('#content')!
    box(content, 0, 0, 440, 900)
    for (const element of content.querySelectorAll('*')) box(element, 20, 30, 300, 44)
    const layout = measureMirrorLayout(content, 'root', true)!
    expect(layout.nodes.filter(node => node.kind === 'text').map(node => node.text)).toEqual([
      'Atlas',
    ])
  },
)

it('moves and occludes page edge material with the resident navigation pose', () => {
  const backdrop = Backdrop.for(owner())
  backdrop.setEdges([
    {
      rect: [0, 0, 440, 54],
      solid: 34,
      sigma: 5.5,
      tint: [1, 1, 1, 0.76],
      strength: 1,
      navigation: { route: 0, clip: [0, 440], covers: [1], origins: [0, 440] },
    },
  ])
  const pose = (rear: number, front: number) => ({
    routes: [
      { x: rear, dim: 0 },
      { x: front, dim: 0 },
    ],
    rearX: rear,
    frontX: front,
    rearDim: 0,
    frontDim: 0,
  })
  const sample = [0, 0, 440, 54] as const
  expect(backdrop.edgesUnder(sample, pose(-100, 220))[0]?.rect).toEqual([0, 0, 220, 54])
  expect(backdrop.edgesUnder(sample, pose(-140, 0))).toEqual([])
  expect(backdrop.edgesUnder(sample, pose(0, 440))[0]?.rect).toEqual(sample)
  expect(backdrop.keyFor(sample, undefined, [], false, false, pose(-100, 220))).not.toBe(
    backdrop.keyFor(sample, undefined, [], false, false, pose(0, 440)),
  )
})

it('moves the captured page before refraction on the carrier clock and commits scroll atomically', () => {
  const b = backdrop([layer('chat', 0, 0, 440, 1000), layer('sidebar', 440, 0, 200, 1000)])
  const motion = {
    epoch: 1000,
    duration: 1900,
    end: 1400,
    offset: 0,
    stops: [
      [0, 0],
      [200 / 1900, -300],
      [400 / 1900, -400],
      [1, -400],
    ] as const,
  }
  const startKey = b.keyFor([40, 900, 100, 50])
  b.setKeyboard('chat', 'chat:1:front', { offsetY: 0, motion }, { x: 0, y: 0 })
  expect(b.keyboardMoving).toBe(true)
  b.sampleKeyboard(1200)
  expect(b.layers[0]!.origin.y).toBe(-300)
  expect(b.layers[1]!.origin.y).toBe(0)
  // The actual source row under a lens carried by the same amount stays fixed.
  expect(b.layers[0]!.origin.y - b.layers[0]!.scroll.y - 600).toBe(-900)
  expect(b.keyFor([40, 900, 100, 50])).not.toBe(startKey)
  b.sampleKeyboard(1405)
  expect(b.layers[0]!.origin.y).toBe(-400)
  expect(b.keyboardMoving).toBe(false)
  b.setKeyboard('chat', 'chat:1:front', { offsetY: 0 }, { x: 0, y: 400 })
  b.sampleKeyboard(1410)
  expect(b.layers[0]!.origin.y - b.layers[0]!.scroll.y).toBe(-400)
  // Native overscroll stays signed. The keyboard never predicts or clamps it.
  b.setScroll('chat', 0, -25)
  expect(b.layers[0]!.scroll.y).toBe(-25)
  // An in-flight request from the previous capture must not move a replacement.
  b.setLayers([{ ...layer('chat', 0, 0, 440, 1000), keyboard: { offsetY: 0 } }])
  b.setKeyboard('chat', 'retired:front', { offsetY: -100 }, { x: 0, y: 999 })
  b.sampleKeyboard(1500)
  expect(b.layers[0]!.origin.y).toBe(0)
  expect(b.layers[0]!.scroll.y).toBe(0)
})

it('keeps insertion pixels out of the composer and restores ordinary under-glass scrolling', () => {
  const b = backdrop([layer('chat', 0, 0, 440, 956)])
  b.setKeyboard('chat', 'chat:1:front', { offsetY: 40, clipBottom: 850 }, { x: 0, y: 0 })
  expect(b.under([0, 860, 440, 60])).toHaveLength(0)
  expect(b.under([0, 830, 440, 60])[0]?.clip).toEqual([0, 830, 440, 20])
  b.setKeyboard('chat', 'chat:1:front', { offsetY: 0 }, { x: 0, y: 0 })
  expect(b.under([0, 860, 440, 60])).toHaveLength(1)
})
