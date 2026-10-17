// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('keeps the TabView dock at the system bottom while its content avoids the keyboard', () => {
  const style = document.createElement('style')
  style.textContent = readFileSync('src/styles.css', 'utf8')
  const tabs = document.createElement('div')
  tabs.dataset.satinTabView = 'true'
  tabs.style.cssText =
    '--satin-glass-tab-bar-bottom-gap:24px;--satin-keyboard-height:336px;--satin-inset-accessory-height:62px'
  const boundary = document.createElement('div')
  boundary.dataset.satinBottomBoundary = 'root'
  const content = document.createElement('div')
  content.dataset.satinInsetContent = 'true'
  const dock = document.createElement('div')
  dock.dataset.satinTabInset = 'true'
  boundary.append(content, dock)
  tabs.append(boundary)
  document.head.append(style)
  document.body.append(tabs)
  try {
    // Native TabView with a focused TextField keeps the dock behind the keyboard.
    // The content alone consumes the keyboard's remainder after the dock's terminal inset.
    expect(getComputedStyle(boundary).paddingBottom).toBe('24px')
    expect(getComputedStyle(content).boxSizing).toBe('border-box')
  } finally {
    tabs.remove()
    style.remove()
  }
})
