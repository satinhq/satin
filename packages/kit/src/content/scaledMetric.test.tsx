// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { Text } from './content.tsx'
import { useScaledMetric } from './scaledMetric.ts'

const container = document.createElement('div')
const root = createRoot(container)
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
afterEach(() => {
  act(() => root.render(null))
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it.each([
  ['largeTitle', 34],
  ['callout', 16],
] as const)(
  'keeps %s metrics consistent with Text when its system keyword is unsupported',
  (style, size) => {
    let inheritedFontSize = 17
    let resize: () => void = () => {}
    const disconnect = vi.fn()
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resize = callback
        }
        observe() {}
        disconnect = disconnect
      },
    )
    // Model WebKit rejecting these two font keywords and inheriting the body's font.
    // Explicit font sizes still resolve, as they do for Text. This is not a Type curve.
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      element =>
        ({
          fontSize: (element as HTMLElement).style.fontSize || `${inheritedFontSize}px`,
        }) as CSSStyleDeclaration,
    )
    function Fixture() {
      return (
        <>
          <Text font={style}>Label</Text>
          <output>{useScaledMetric(24, style)}</output>
        </>
      )
    }

    act(() => root.render(<Fixture />))
    expect(container.querySelector('output')?.textContent).toBe('24')
    const text = container.querySelector<HTMLElement>('[data-satin-content="text"]')!
    const probe = document.body.querySelector<HTMLSpanElement>('span[aria-hidden="true"]')!
    expect(text.style.fontSize).toBe(`${size}px`)
    expect(probe.style.font).toBe(text.style.font)

    // A changed inherited/category font must not scale an explicitly sized Text fallback.
    inheritedFontSize = 25.5
    act(() => resize())
    expect(container.querySelector('output')?.textContent).toBe('24')
    expect(text.style.fontSize).toBe(`${size}px`)
    act(() => root.render(null))
    expect(probe.isConnected).toBe(false)
    expect(disconnect).toHaveBeenCalledOnce()
  },
)
