// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('keeps an icon-only glass button a centred 44 pt circle at every control size', () => {
  // `buttonStyle="glass" controlSize="large" iconOnly symbol="plus"` drew its glyph
  // 8 pt right and 3 pt low. The large label padding (15/20) applied inside the fixed circle.
  const style = document.createElement('style')
  style.textContent = readFileSync('src/styles.css', 'utf8')
  document.head.append(style)
  try {
    for (const size of ['mini', 'small', 'regular', 'large', 'extraLarge']) {
      const button = document.createElement('button')
      button.dataset.satinGlassButton = 'glass'
      button.dataset.satinButtonStyle = 'glass'
      button.dataset.satinIconOnly = 'true'
      button.dataset.satinControlSize = size
      document.body.append(button)
      const computed = getComputedStyle(button)
      expect([computed.paddingTop, computed.paddingRight], size).toEqual(['0px', '0px'])
      expect([computed.paddingBottom, computed.paddingLeft], size).toEqual(['0px', '0px'])
      expect([computed.width, computed.height], size).toEqual(['44px', '44px'])
      button.remove()
    }
  } finally {
    style.remove()
  }
})
