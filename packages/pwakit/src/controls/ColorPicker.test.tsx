// @vitest-environment happy-dom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it } from 'vitest'
import { ColorPicker } from './ColorPicker.tsx'
import { ControlStyleProvider } from '../public/controlStyle.tsx'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const container = document.createElement('div')
const root = createRoot(container)
afterEach(() => act(() => root.render(null)))

/**
 * What the system colour picker does: change the input's value and fire its events. happy-dom
 * sanitizes `color(srgb …)` to black, which WebKit does not, so the value is supplied directly.
 */
function pick(input: HTMLInputElement, value: string) {
  act(() => {
    Object.defineProperty(input, 'value', { configurable: true, get: () => value, set() {} })
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

it('opens the system picker and publishes its colour as hex, with opacity only when supported', () => {
  const chosen: string[] = []
  function Example({ supportsOpacity }: { supportsOpacity: boolean }) {
    const [color, setColor] = useState('#0088ff')
    return (
      <ColorPicker
        label="Tint"
        selection={color}
        supportsOpacity={supportsOpacity}
        onSelectionChange={next => {
          chosen.push(next)
          setColor(next)
        }}
      />
    )
  }
  act(() => root.render(<Example supportsOpacity />))
  const input = container.querySelector<HTMLInputElement>('input[type="color"]')!
  expect(input.getAttribute('aria-label')).toBe('Tint')
  expect(input.hasAttribute('alpha')).toBe(true)
  // WebKit reports a picker with opacity in CSS color() syntax.
  pick(input, 'color(srgb 1 0.584314 0 / 0.501961)')
  expect(chosen).toEqual(['#ff950080'])
  pick(input, 'not a colour')
  expect(chosen).toHaveLength(1)

  act(() => root.render(<Example supportsOpacity={false} />))
  expect(input.hasAttribute('alpha')).toBe(false)
  pick(input, '#30d158')
  expect(chosen.at(-1)).toBe('#30d158')
})

it('cannot change colour while disabled by an ancestor', () => {
  act(() =>
    root.render(
      <ControlStyleProvider disabled>
        <ColorPicker
          label="Tint"
          selection="#0088ff"
          onSelectionChange={() => {
            throw new Error('disabled selection')
          }}
        />
      </ControlStyleProvider>,
    ),
  )
  const input = container.querySelector<HTMLInputElement>('input[type="color"]')!
  expect(input.disabled).toBe(true)
  pick(input, '#ff0000')
})
