// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

// Owner, Oct 9 (Music Library): a header with its own band under the bar's edge read as two
// stacked bands. Unpinned it draws nothing; pinned, it carries the bar's one material.
it('pins one header that draws no band of its own', () => {
  const style = document.createElement('style')
  style.textContent = readFileSync('src/styles.css', 'utf8')
  const list = document.createElement('div')
  list.dataset.satinList = 'plain'
  list.innerHTML =
    '<section data-satin-list-section="true"><div data-satin-section-header="true">Recently Added</div><div data-satin-section-rows="true">Albums</div></section>'
  document.head.append(style)
  document.body.append(list)
  try {
    const headers = list.querySelectorAll<HTMLElement>('[data-satin-section-header]')
    expect(headers).toHaveLength(1)
    const computed = getComputedStyle(headers[0]!)
    expect(computed.position).toBe('sticky')
    expect(computed.backgroundImage).not.toContain('gradient')
    expect(computed.backdropFilter).not.toContain('blur')
  } finally {
    list.remove()
    style.remove()
  }
})

it('keeps presented search chrome hidden with its retained tab', () => {
  const style = document.createElement('style')
  style.textContent = readFileSync('src/styles.css', 'utf8')
  const panel = document.createElement('div')
  panel.setAttribute('data-satin-tab-panel', 'search')
  panel.setAttribute('data-satin-tab-active', 'false')
  panel.innerHTML =
    '<div data-satin-search data-satin-search-presented><div><button data-satin-search-close data-satin-pressable data-satin-press-state="rest">Close</button></div><div data-satin-search-scopes>All</div></div>'
  document.head.append(style)
  document.body.append(panel)
  try {
    for (const element of panel.querySelectorAll('button, [data-satin-search-scopes]')) {
      expect(getComputedStyle(element).visibility).toBe('hidden')
    }
  } finally {
    panel.remove()
    style.remove()
  }
})
