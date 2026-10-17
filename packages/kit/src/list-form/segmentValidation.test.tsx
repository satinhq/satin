import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SegmentedControl } from './ListForm.tsx'

describe('segmented selection validation', () => {
  const options = [
    { id: 'day', label: 'Day' },
    { id: 'week', label: 'Week' },
  ]
  function render(value: string, choices = options) {
    return renderToStaticMarkup(
      <SegmentedControl value={value} options={choices} onChange={() => {}} />,
    )
  }

  it('rejects an unknown selected value before drawing an indicator', () => {
    expect(() => render('month')).toThrow(
      'SegmentedControl value "month" is not present in options.',
    )
  })

  it('rejects the selected option removed by a controlled options update', () => {
    expect(render('week')).toContain('--satin-segment-index:1')
    expect(() => render('week', options.slice(0, 1))).toThrow(
      'SegmentedControl value "week" is not present in options.',
    )
  })

  it('keeps the indicator and accessible selection aligned for every valid option', () => {
    for (const [index, option] of options.entries()) {
      const markup = render(option.id)
      expect(markup).toContain(`--satin-segment-index:${index}`)
      expect(markup.match(/aria-pressed="true"/g)).toHaveLength(1)
      expect(markup).toMatch(new RegExp(`aria-pressed="true"[^>]*><span>${option.label}</span>`))
    }
  })
})
