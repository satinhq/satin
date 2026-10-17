// @vitest-environment happy-dom
import { expect, it } from 'vitest'
import { observeTabSources, tabSourceRevision } from './sourceRevision.ts'

it('keeps prepared sources across visibility changes and invalidates hidden content synchronously', () => {
  const root = document.createElement('div')
  root.innerHTML =
    '<div data-satin-tab-panel="a"><p>A</p></div><div data-satin-tab-panel="b"><p>B</p></div>'
  const a = root.children[0] as HTMLElement,
    b = root.children[1] as HTMLElement
  const stop = observeTabSources(root)
  expect(tabSourceRevision(a.firstElementChild!)).toBe(0)
  a.dataset.satinTabActive = 'false'
  a.dataset.satinTabPresented = 'false'
  a.setAttribute('inert', '')
  a.setAttribute('aria-hidden', 'true')
  expect(tabSourceRevision(a.firstElementChild!)).toBe(0)
  a.firstElementChild!.textContent = 'changed while hidden'
  expect(tabSourceRevision(a.firstElementChild!)).toBeGreaterThan(0)
  expect(tabSourceRevision(b.firstElementChild!)).toBe(0)
  stop()
})
