// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DisclosureIndicator } from './DisclosureIndicator.tsx'

function render(props = {}) {
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(<DisclosureIndicator {...props} />)
  return container.querySelector('svg')!
}

describe('settings disclosure accessibility', () => {
  it('keeps the decorative indicator out of accessibility and keyboard focus by default', () => {
    const indicator = render()
    expect(indicator.getAttribute('aria-hidden')).toBe('true')
    expect(indicator.getAttribute('focusable')).toBe('false')
    expect(indicator.querySelector('title')).toBeNull()
  })

  it('preserves an explicit accessible label and consumer sizing for a named indicator', () => {
    const indicator = render({
      'aria-hidden': false,
      'aria-label': 'Details',
      width: 12,
      height: 14,
    })
    expect(indicator.getAttribute('aria-hidden')).toBe('false')
    expect(indicator.getAttribute('aria-label')).toBe('Details')
    expect(indicator.getAttribute('width')).toBe('12')
    expect(indicator.getAttribute('height')).toBe('14')
    expect(indicator.getAttribute('focusable')).toBe('false')
  })
})
