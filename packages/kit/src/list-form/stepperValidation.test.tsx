import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { StepperControl, type StepperProps } from './ListForm.tsx'

describe('stepper render validation', () => {
  function render(props: Partial<StepperProps> = {}) {
    return renderToStaticMarkup(
      <StepperControl label="Goal" value={5} onChange={() => {}} {...props} />,
    )
  }

  it('rejects reversed bounds before both buttons can become disabled', () => {
    expect(() => render({ min: 10, max: 0 })).toThrow(
      'StepperControl bounds must be ordered numbers.',
    )
  })

  it.each([-1, 0, NaN, Infinity, -Infinity])('rejects nonpositive or nonfinite step %s', step => {
    expect(() => render({ step })).toThrow(
      'StepperControl step must be finite and greater than zero.',
    )
  })

  it.each([NaN, Infinity, -Infinity])('rejects nonfinite value %s', value => {
    expect(() => render({ value })).toThrow('StepperControl value must be finite.')
  })

  it.each([{ min: NaN }, { max: NaN }])('rejects NaN bounds %j', bounds => {
    expect(() => render(bounds)).toThrow('StepperControl bounds must be ordered numbers.')
  })

  it('validates invalid props even when the control is disabled', () => {
    expect(() => render({ disabled: true, step: -1 })).toThrow(
      'StepperControl step must be finite and greater than zero.',
    )
  })

  it('preserves unbounded defaults and positive fractional steps', () => {
    expect(render()).not.toContain('disabled=""')
    expect(render({ step: 0.5 })).not.toContain('disabled=""')
    expect(render({ min: -Infinity, max: Infinity })).not.toContain('disabled=""')
  })

  it('keeps ordered equal bounds valid and disables both controls', () => {
    expect(render({ min: 5, max: 5 }).match(/disabled=""/g)).toHaveLength(2)
  })
})
