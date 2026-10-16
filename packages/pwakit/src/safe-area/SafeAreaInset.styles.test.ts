// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('stretches the inset content child inside a bounded grid row', () => {
  const style = document.createElement('style')
  style.textContent = readFileSync('src/styles.css', 'utf8')
  const content = document.createElement('div')
  content.dataset.satinInsetContent = 'true'
  const scroll = document.createElement('div')
  scroll.dataset.satinScroll = 'true'
  content.append(scroll)
  document.head.append(style)
  document.body.append(content)
  try {
    // Happy DOM cannot measure overflow. Verify the layout contract here; the real long-thread
    // Catalyst fixture verifies clientHeight < scrollHeight and the terminal anchor's gap.
    expect(getComputedStyle(content).display).toBe('grid')
    expect(getComputedStyle(content).gridTemplateRows).toBe('minmax(0, 1fr)')
    expect(getComputedStyle(scroll).minHeight).toBe('0')
  } finally {
    content.remove()
    style.remove()
  }
})

it('chains top insets: a primary scroll view takes the accessory under the bar (reference)', () => {
  // iOS 27 native reference inset-top / inset-top-large: the List spans the frame and its inline inset
  // grows by the banner plus spacing; the banner sits below the bar or the large title.
  const css = readFileSync('src/styles.css', 'utf8')
  const rule = (selector: string) => {
    const start = css.indexOf(`${selector} {`)
    expect(start, selector).toBeGreaterThan(-1)
    return css.slice(start, css.indexOf('}', start))
  }
  expect(rule("[data-satin-scroll-navigation='inline']")).toContain('var(--satin-scroll-inset-top)')
  expect(rule("[data-satin-list-navigation='inline']")).toContain('var(--satin-scroll-inset-top)')
  expect(css).toMatch(
    /\[data-satin-screen-scroll='primary'\]\s+\[data-satin-safe-area-inset='top'\]\s+> \[data-satin-inset-content='true'\] \{\s+--satin-scroll-inset-top: calc\(\s+var\(--satin-inset-parent-top\) \+ var\(--satin-inset-accessory-height, 0px\) \+\s+var\(--satin-inset-spacing, 0px\)/,
  )
  expect(
    rule("[data-satin-navigation-motion-layer='true'][data-satin-screen-title-display='large']"),
  ).toContain('calc(var(--satin-screen-bar-inset) + 52px)')
})

it('keeps compact phone toolbar circles 44 pt tall with the native 24 pt bottom clearance', () => {
  const style = document.createElement('style')
  style.textContent = readFileSync('src/styles.css', 'utf8')
  const chrome = document.createElement('div')
  chrome.dataset.satinNavigationChrome = 'true'
  chrome.style.cssText =
    '--satin-inset-bottom:20px;--satin-bottom-toolbar-height:44px;--satin-bottom-toolbar-gap:24px;--satin-bottom-toolbar-inline-inset:38px'
  const slot = document.createElement('div')
  slot.dataset.satinNavigationToolbarSlot = 'bottom'
  const button = document.createElement('button')
  button.dataset.satinToolbarButton = 'true'
  button.dataset.satinIconOnly = 'true'
  slot.append(button)
  chrome.append(slot)
  document.head.append(style)
  document.body.append(chrome)
  try {
    // iPhone 17 Pro Max landscape native reference: the circle is y372–416 on a 440 pt screen.
    expect(getComputedStyle(slot).bottom).toBe('24px')
    expect(getComputedStyle(button).height).toBe('44px')
    expect(getComputedStyle(button).width).toBe('44px')
  } finally {
    chrome.remove()
    style.remove()
  }
})

it('publishes floating toolbar clearance through the registered scroll inset', () => {
  const primary = readFileSync('src/styles.css', 'utf8')
    .split("[data-satin-primary='true'][data-satin-bottom-bar='true'] {")[1]
    ?.split('}')[0]
  expect(primary).toContain('--satin-bottom-bar-inset: calc(')
  expect(primary).toContain(
    'padding-bottom: calc(var(--satin-inset-bottom) + var(--satin-bottom-bar-inset))',
  )
})

// Catalyst growth trace: inherited geometry restyled 21,310 transcript descendants and
// blocked the presenter observer for 180–193 ms. Only explicit layout owners need these values.
it('keeps changing bottom-inset geometry out of transcript descendants', () => {
  const css = readFileSync('src/styles.css', 'utf8')
  for (const property of ['inset-accessory-height', 'inset-parent', 'scroll-inset-bottom']) {
    const registration = css.match(new RegExp(`@property --satin-${property} \\{([^}]+)\\}`))?.[1]
    expect(registration).toContain('inherits: false')
  }
})
