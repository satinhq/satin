// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest'
import { measureMirrorLayout } from './Scene.tsx'

afterEach(() => {
  document.body.replaceChildren()
  delete (globalThis as { __SATIN_MIRROR_AUDIT__?: unknown }).__SATIN_MIRROR_AUDIT__
})

/** A 400-row list (one bubble and one label per row) with stubbed layout: row i at y = 60 i. */
function longList() {
  const host = document.createElement('div')
  host.style.overflowY = 'auto'
  document.body.append(host)
  let reads = 0
  const place = (element: Element, top: () => number, height: number) => {
    element.getBoundingClientRect = () => {
      reads++
      return new DOMRect(0, top() - host.scrollTop, 300, height)
    }
  }
  place(host, () => host.scrollTop, 800)
  Object.defineProperty(host, 'scrollHeight', { value: 400 * 60 })
  const shifts = new Map<Element, number>()
  for (let index = 0; index < 400; index++) {
    const row = document.createElement('div')
    const bubble = document.createElement('div')
    const label = document.createElement('span')
    bubble.style.backgroundColor = 'rgb(0, 122, 255)'
    label.textContent = `Message ${index}`
    bubble.append(label)
    row.append(bubble)
    host.append(row)
    place(row, () => index * 60, 56)
    place(bubble, () => index * 60 + (shifts.get(bubble) ?? 0), 56)
    place(label, () => index * 60 + 8 + (shifts.get(bubble) ?? 0), 20)
  }
  return {
    host,
    shifts,
    reads: () => reads,
    resetReads: () => (reads = 0),
  }
}

it('reads only the rows near a windowed capture, and still finds a far row moved into it', () => {
  const list = longList()
  list.host.scrollTop = 12000
  list.host.setAttribute('data-satin-scroll', 'thread')
  list.host.style.setProperty('--satin-scroll-inset-bottom', '60px')
  const range = { top: 11500, bottom: 13300 }
  const first = measureMirrorLayout(list.host, 'root', true, 'viewport', range)!
  const coldReads = list.reads()
  list.resetReads()
  const second = measureMirrorLayout(list.host, 'root', true, 'viewport', range)!
  expect(second.nodes).toEqual(first.nodes)
  // Every row's box (400) plus the rows reaching the window, not every element (1,200).
  expect(list.reads()).toBeLessThan(500)
  console.info(JSON.stringify({ coldReads, warmReads: list.reads(), nodes: second.nodes.length }))

  // A restyled bubble of a far row (row 10, y = 600) now paints inside the window.
  const far = list.host.children[10].firstElementChild!
  list.shifts.set(far, 12000)
  far.setAttribute('style', 'background-color: rgb(0, 122, 255); transform: translateY(12000px)')
  const moved = measureMirrorLayout(list.host, 'root', true, 'viewport', range)!
  expect(moved.nodes.filter(node => node.text === 'Message 10')).toHaveLength(1)
})

it('audits bounded scans against the whole tree after an overflow owner is restyled', () => {
  const list = longList()
  list.host.scrollTop = 12000
  const range = { top: 11500, bottom: 13300 }
  const audit = { scans: 0, mismatches: [] as string[] }
  ;(globalThis as { __SATIN_MIRROR_AUDIT__?: typeof audit }).__SATIN_MIRROR_AUDIT__ = audit
  measureMirrorLayout(list.host, 'root', true, 'viewport', range)
  measureMirrorLayout(list.host, 'root', true, 'viewport', range)
  // The ancestor's dimensions stay fixed. Its overflow belongs to the bubble, not the row box.
  const row = list.host.children[10] as HTMLElement
  const bubble = row.firstElementChild!
  list.shifts.set(bubble, 12000)
  row.className = 'overflow-owner-restyled'
  const moved = measureMirrorLayout(list.host, 'root', true, 'viewport', range)!
  expect(moved.nodes.filter(node => node.text === 'Message 10')).toHaveLength(1)
  expect(audit.scans).toBe(3)
  expect(audit.mismatches).toEqual([])
})

it('excludes the searchable large title from its field backdrop', () => {
  const host = document.createElement('div')
  host.setAttribute('data-satin-searchable', '')
  const title = document.createElement('h1')
  title.setAttribute('data-satin-list-title', 'true')
  title.style.backgroundColor = 'rgb(255, 0, 0)'
  title.style.opacity = '0'
  title.textContent = 'Chats'
  host.append(title)
  document.body.append(host)
  host.getBoundingClientRect = () => new DOMRect(0, 0, 440, 956)
  title.getBoundingClientRect = () => new DOMRect(20, 62, 200, 41)
  const layout = measureMirrorLayout(host, 'root')!
  expect(layout.nodes.some(node => node.sourceElement?.startsWith('h1'))).toBe(false)
})

it('keeps a long-list capture bounded across framework-only ancestor writes', () => {
  const list = longList()
  list.host.scrollTop = 12000
  list.host.setAttribute('data-satin-scroll', 'thread')
  list.host.style.setProperty('--satin-scroll-inset-bottom', '60px')
  const range = { top: 11500, bottom: 13300 }
  const first = measureMirrorLayout(list.host, 'root', true, 'viewport', range)!
  list.resetReads()
  // Controlled layout can publish the same style again. The final source is
  // unchanged, so this must not reopen every offscreen message subtree.
  list.host.setAttribute('style', list.host.getAttribute('style')!)
  list.host.setAttribute('data-satin-source-ready', 'true')
  const next = measureMirrorLayout(list.host, 'root', true, 'viewport', range)!
  expect(next.nodes).toEqual(first.nodes)
  expect(list.reads()).toBeLessThan(500)
  list.resetReads()
  list.host.style.setProperty('--satin-scroll-inset-bottom', '104px')
  const grown = measureMirrorLayout(list.host, 'root', true, 'viewport', range)!
  expect(grown.nodes).toEqual(first.nodes)
  expect(list.reads()).toBeLessThan(500)
})
