// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

// Computed-style model; installed WebKit recordings establish painted glass/shadow clipping.
it('keeps the back control overflow visible during a transition', () => {
  const stylesheet = document.createElement('style')
  stylesheet.textContent = readFileSync('src/styles.css', 'utf8')
  const host = document.createElement('div')
  host.setAttribute('data-satin-navigator-host', 'true')
  host.setAttribute('data-satin-transition-active', 'true')
  const mask = document.createElement('div')
  mask.setAttribute('data-satin-navigation-back-mask', 'true')
  const button = document.createElement('button')
  button.setAttribute('data-satin-navigation-back-button', 'true')
  mask.append(button)
  host.append(mask)
  document.head.append(stylesheet)
  document.body.append(host)
  try {
    expect(getComputedStyle(mask).overflow).not.toBe('hidden')
    expect(getComputedStyle(button).overflow).not.toBe('hidden')
  } finally {
    host.remove()
    stylesheet.remove()
  }
})
