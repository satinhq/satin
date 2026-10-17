// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('places landscape icons beside their labels within the dock height', () => {
  const style = document.createElement('style')
  style.textContent = readFileSync('src/styles.css', 'utf8')
  const dock = document.createElement('div')
  dock.dataset.satinTabLayout = 'compact'
  const items = document.createElement('div')
  items.className = 'satin-lens-tab-items'
  const item = document.createElement('button')
  item.className = 'satin-lens-tab-item'
  const label = document.createElement('small')
  label.textContent = 'Library'
  item.append(label)
  items.append(item)
  dock.append(items)
  document.head.append(style)
  document.body.append(dock)
  try {
    expect(getComputedStyle(items).height).toBe('36px')
    expect(getComputedStyle(item).display).toBe('flex')
    expect(getComputedStyle(item).transform).toBe('none')
    expect(getComputedStyle(label).fontSize).toBe('12px')
  } finally {
    dock.remove()
    style.remove()
  }
})
