// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { registerImageCapture } from '../../image/resource.ts'
import { forgetMirrorLayouts, measureOrReuse } from './mirrorReuse.ts'
import { measureMirrorLayout } from './Scene.tsx'

afterEach(() => {
  forgetMirrorLayouts()
  document.body.replaceChildren()
  vi.restoreAllMocks()
  delete (globalThis as { __SATIN_MIRROR_AUDIT__?: unknown }).__SATIN_MIRROR_AUDIT__
})

/** A held sheet: dialog > layer > surface > content host (a row with a label, an image). */
function sheet() {
  const dialog = document.createElement('dialog')
  const layer = document.createElement('div')
  const surface = document.createElement('div')
  const host = document.createElement('div')
  host.setAttribute('data-satin-presentation-content', '')
  host.innerHTML =
    '<div class="row" style="background-color: rgb(255, 255, 255)"><span>Lisbon in May</span></div>' +
    '<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">' +
    '<div class="scroller"><div>Nested</div></div>' +
    '<button>Done</button>'
  surface.append(host)
  layer.append(surface)
  dialog.append(layer)
  document.body.append(dialog)
  const boxes = new Map<Element, DOMRect>([
    [host, new DOMRect(0, 100, 400, 600)],
    [host.querySelector('.row')!, new DOMRect(0, 100, 400, 44)],
    [host.querySelector('span')!, new DOMRect(16, 112, 120, 20)],
    [host.querySelector('img')!, new DOMRect(0, 160, 80, 80)],
    [host.querySelector('.scroller')!, new DOMRect(0, 260, 400, 100)],
    [host.querySelector('.scroller > div')!, new DOMRect(0, 260, 400, 20)],
    [host.querySelector('button')!, new DOMRect(300, 110, 60, 30)],
  ])
  for (const element of boxes.keys()) element.getBoundingClientRect = () => boxes.get(element)!
  let measured = 0
  const measure = () => {
    measured++
    return measureMirrorLayout(host, 'root', true, 'viewport')
  }
  const read = () => measureOrReuse(host, 'viewport', undefined, measure)
  return { dialog, layer, surface, host, boxes, read, measured: () => measured }
}

/** Mutation records are delivered with the next measurement (takeRecords), as in a preparation. */
it('captures newly sampled content when bands change inside the same outer extent', () => {
  const { host } = sheet()
  const range = {
    top: 0,
    bottom: 600,
    bands: [
      { top: 0, bottom: 40 },
      { top: 560, bottom: 600 },
    ],
  }
  const read = () =>
    measureOrReuse(host, 'viewport', range, () =>
      measureMirrorLayout(host, 'root', true, 'viewport', range),
    )
  expect(read().layout!.nodes.some(node => node.text === 'Nested')).toBe(false)
  range.bands.splice(1, 0, { top: 160, bottom: 260 })
  expect(read().layout!.nodes.some(node => node.text === 'Nested')).toBe(true)
})

it('reuses a measurement only while nothing the mirror reads has changed', () => {
  const { host, read, measured } = sheet()
  expect(read().reused).toBe(false)
  expect(read().reused).toBe(true)
  expect(read().reused).toBe(true)
  expect(measured()).toBe(1)
  host.querySelector('span')!.textContent = 'Porto in June'
  const changed = read()
  expect(changed.reused).toBe(false)
  expect(changed.layout!.nodes.some(node => node.text === 'Porto in June')).toBe(true)
  expect(read().reused).toBe(true)
})

it('survives the hold and its glass receipts, and a travelling layer', () => {
  const { dialog, layer, surface, host, read } = sheet()
  surface.setAttribute('data-satin-glass-hold', '1')
  surface.setAttribute('inert', '')
  read()
  // Reveal: the hold, its source receipt and the inert state go; canvases acknowledge their show.
  surface.setAttribute('data-satin-glass-source', '1')
  surface.removeAttribute('data-satin-glass-hold')
  surface.removeAttribute('inert')
  host.querySelector('button')!.setAttribute('data-satin-glass-presented-show', '1:source')
  // The entrance: the layer travels, the dialog flags its motion.
  dialog.setAttribute('data-satin-presentation-moving', 'entrance')
  layer.style.transform = 'translateY(600px)'
  layer.style.transform = ''
  dialog.removeAttribute('data-satin-presentation-moving')
  expect(read().reused).toBe(true)
})

it('survives an attribute written again with its value, inside the host or above it', () => {
  const { surface, host, read } = sheet()
  const row = host.querySelector('.row')!
  row.setAttribute('data-satin-last-row', 'true')
  surface.setAttribute('hidden', '')
  surface.removeAttribute('hidden')
  read()
  // A list marks its boundary rows on every layout effect (ListForm.tsx).
  row.setAttribute('data-satin-last-row', 'true')
  surface.setAttribute('data-state', 'open')
  surface.setAttribute('data-state', 'open')
  expect(read().reused).toBe(false)
  surface.setAttribute('data-state', 'open')
  row.setAttribute('data-satin-last-row', 'true')
  expect(read().reused).toBe(true)
  row.setAttribute('data-satin-last-row', 'false')
  expect(read().reused).toBe(false)
  // React 19 detaches a controlled input from its radio group on every update.
  const field = document.createElement('input')
  host.append(field)
  read()
  field.name = ''
  field.removeAttribute('name')
  expect(read().reused).toBe(true)
})

it('measures again after any other change it could see', () => {
  const cases: [string, (s: ReturnType<typeof sheet>) => void][] = [
    ['subtree attribute', s => s.host.querySelector('.row')!.setAttribute('class', 'row selected')],
    ['subtree child', s => s.host.append(document.createElement('p'))],
    ['host attribute', s => s.host.setAttribute('data-state', 'editing')],
    [
      'nested scroll',
      s =>
        s.host.querySelector('.scroller')!.dispatchEvent(new Event('scroll', { bubbles: false })),
    ],
    ['image load', s => s.host.querySelector('img')!.dispatchEvent(new Event('load'))],
    [
      'source damage',
      s =>
        s.host
          .querySelector('button')!
          .dispatchEvent(new Event('satin-glass-source-damage', { bubbles: true })),
    ],
    [
      'image capture',
      s => {
        const image = s.host.querySelector('img')!
        registerImageCapture(image, { source: 'next.jpg', ready: Promise.resolve(image) })
      },
    ],
    ['host resize', s => s.boxes.set(s.host, new DOMRect(0, 100, 400, 420))],
    ['host width', s => s.boxes.set(s.host, new DOMRect(0, 100, 320, 600))],
    ['host scroll', s => (s.host.scrollTop = 40)],
    ['ancestor class', s => s.surface.classList.add('compact')],
    ['ancestor style', s => (s.surface.style.height = '400px')],
    ['ancestor custom property', s => s.surface.style.setProperty('--tone', 'red')],
    ['root attribute', () => document.documentElement.setAttribute('data-appearance', 'dark')],
    ['focus inside', s => s.host.querySelector('button')!.focus()],
    [
      're-parented',
      s => {
        const wrapper = document.createElement('div')
        s.layer.append(wrapper)
        wrapper.append(s.surface)
      },
    ],
  ]
  for (const [name, change] of cases) {
    const s = sheet()
    s.read()
    change(s)
    expect([name, s.read().reused]).toEqual([name, false])
    forgetMirrorLayouts()
    document.body.replaceChildren()
    document.documentElement.removeAttribute('data-appearance')
  }
})

it('measures again while an animation runs inside the host, and after appearance changes', () => {
  const { host, read } = sheet()
  read()
  const animation = { effect: { target: host.querySelector('.row') } } as unknown as Animation
  let running = [animation]
  Object.defineProperty(document, 'getAnimations', { configurable: true, value: () => running })
  expect(read().reused).toBe(false)
  expect(read().reused).toBe(false)
  running = []
  expect(read().reused).toBe(false)
  expect(read().reused).toBe(true)
  const dark = vi
    .spyOn(window, 'matchMedia')
    .mockImplementation(query => ({ matches: query.includes('dark') }) as MediaQueryList)
  expect(read().reused).toBe(false)
  expect(read().reused).toBe(true)
  dark.mockRestore()
  delete (document as { getAnimations?: unknown }).getAnimations
})

it('the audit measures every reuse again and reports a stale one', () => {
  const audit = { scans: 0, mismatches: [] as string[], reuses: 0 }
  ;(globalThis as { __SATIN_MIRROR_AUDIT__?: typeof audit }).__SATIN_MIRROR_AUDIT__ = audit
  const { host, boxes, read } = sheet()
  read()
  read()
  expect(audit).toMatchObject({ reuses: 1, mismatches: [] })
  // Layout that moves with no record at all (an untracked :hover style) is what the audit catches.
  boxes.set(host.querySelector('button')!, new DOMRect(300, 150, 60, 30))
  read()
  expect(audit.reuses).toBe(2)
  expect(audit.mismatches).toHaveLength(1)
})
