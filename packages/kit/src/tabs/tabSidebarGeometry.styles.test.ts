// @vitest-environment happy-dom
import { frameworkStyleDeclarations } from '../../test/domStyles.ts'
import { expect, it } from 'vitest'

it('reserves the former tab row only when expanding from tabs, not on an expanded launch', () => {
  const style = document.createElement('style')
  style.textContent = frameworkStyleDeclarations()
  const root = document.createElement('div')
  root.dataset.satinTabSidebarExpanded = 'true'
  root.style.setProperty('--satin-sidebar-tabReserve', '54px')
  root.innerHTML = `
    <div data-satin-pane="detail">
      <div data-satin-list="insetGrouped" data-satin-list-navigation="large">
        <div data-satin-list-title>Library</div>
      </div>
      <div data-satin-list="insetGrouped" data-satin-list-navigation="large">
        <div data-satin-scroll-content>
          <div data-satin-list-title>Library</div>
        </div>
      </div>
    </div>`
  document.head.append(style)
  document.body.append(root)
  try {
    const titles = [...root.querySelectorAll<HTMLElement>('[data-satin-list-title]')]
    root.dataset.satinTabSidebarExpanded = 'false'
    const collapsedMargins = titles.map(title => getComputedStyle(title).marginBlockEnd)
    root.dataset.satinTabSidebarExpanded = 'true'
    expect(titles.map(title => getComputedStyle(title).marginBlockEnd)).toEqual(collapsedMargins)
    root.dataset.satinTabSidebarExpandedFromTabs = 'true'
    expect(titles.map(title => getComputedStyle(title).marginBlockEnd)).not.toEqual(
      collapsedMargins,
    )
    delete root.dataset.satinTabSidebarExpandedFromTabs
    expect(titles.map(title => getComputedStyle(title).marginBlockEnd)).toEqual(collapsedMargins)
  } finally {
    root.remove()
    style.remove()
  }
})
