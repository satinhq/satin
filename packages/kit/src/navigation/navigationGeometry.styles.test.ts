// @vitest-environment happy-dom
import { frameworkStyleDeclarations } from '../../test/domStyles.ts'
import { expect, it } from 'vitest'

// iOS 27.0, iPad Pro 11 M5: window safe top 32, bar row 54, expanded title row 52.
// The historical regular List +8 offset double-counted a stale harness safe-area input.
it('does not add a second safe-area correction to a regular stack large title', () => {
  const style = document.createElement('style')
  style.textContent = frameworkStyleDeclarations()
  const root = document.createElement('div')
  root.dataset.satinLayoutHorizontal = 'regular'
  root.style.cssText =
    '--satin-inset-top:32px;--satin-settings-root-title-top:89.333333px;' +
    '--satin-scroll-inset-top:0px;--satin-extra-top:0px;--satin-inline-title-extra:0px'
  root.innerHTML =
    '<div data-satin-navigation-layout="stack">' +
    '<div data-satin-list-navigation="large"></div>' +
    '</div>'
  document.head.append(style)
  document.body.append(root)
  try {
    const padding = (selector: string) =>
      getComputedStyle(root.querySelector<HTMLElement>(selector)!).paddingTop
    expect(padding('[data-satin-list-navigation="large"]')).toBe('89.333333px')
  } finally {
    root.remove()
    style.remove()
  }
})
