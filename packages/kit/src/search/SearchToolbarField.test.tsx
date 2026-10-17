// @vitest-environment happy-dom
import { act, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { SearchToolbarField } from './SearchToolbarField.tsx'
import {
  PadSearchPresentationContext,
  PadSearchTabContext,
} from './PadSearchPresentationContext.tsx'
const environment = vi.hoisted(() => ({ idiom: 'pad' }))
vi.mock('../layout/deviceIdiom.ts', () => ({ readDeviceIdiom: () => environment.idiom }))
vi.mock('../glass/GlassEffect.tsx', () => ({ GlassBackground: () => null }))
vi.mock('./usePadSearchFieldMotion.ts', () => ({ usePadSearchFieldMotion: () => {} }))
let cleanup = () => {}
afterEach(() => {
  act(cleanup)
  document.body.replaceChildren()
  environment.idiom = 'pad'
})
function mount(tab: boolean) {
  const host = document.createElement('div'),
    container = document.createElement('div')
  document.body.append(host, container)
  let owner: string | null = null
  let text = ''
  let changeText!: (value: string) => void
  function Fixture() {
    const [value, setValue] = useState('')
    const [activeOwner, setOwner] = useState<string | null>(null)
    const scroller = useRef(container)
    owner = activeOwner
    text = value
    changeText = setValue
    return (
      <PadSearchPresentationContext value={{ owner: activeOwner, setOwner }}>
        <PadSearchTabContext value={tab ? 'search' : null}>
          <SearchToolbarField
            host={host}
            scroller={scroller}
            navigation
            configuration={{ text: value, onTextChange: setValue }}
          />
        </PadSearchTabContext>
      </PadSearchPresentationContext>
    )
  }
  const root = createRoot(container)
  act(() => root.render(<Fixture />))
  cleanup = () => root.unmount()
  return {
    host,
    get owner() {
      return owner
    },
    get text() {
      return text
    },
    type(value: string) {
      act(() => changeText(value))
    },
    input: host.querySelector('input')!,
  }
}
it('ordinary pad clear keeps focus and never adds an external Close', () => {
  const view = mount(false)
  act(() => view.input.focus())
  view.type('apple')
  act(() => view.host.querySelector<HTMLButtonElement>('[aria-label="Clear text"]')!.click())
  expect(view.text).toBe('')
  expect(document.activeElement).toBe(view.input)
  expect(view.host.querySelector('[aria-label="Close"]')).toBeNull()
  expect(view.owner).toBeNull()
})
it('search-tab focus owns the bar handoff and clearing releases it', () => {
  const view = mount(true)
  expect(view.owner).toBeNull()
  act(() => view.input.focus())
  expect(view.owner).toBe('search')
  view.type('apple')
  act(() => view.host.querySelector<HTMLButtonElement>('[aria-label="Clear text"]')!.click())
  expect(view.owner).toBeNull()
  expect(view.text).toBe('')
  expect(document.activeElement).not.toBe(view.input)
})
it('phone toolbar keeps its separate Close and does not own the pad bar', () => {
  environment.idiom = 'phone'
  const view = mount(true)
  act(() => view.input.focus())
  expect(view.host.querySelector('[aria-label="Close"]')).not.toBeNull()
  expect(view.owner).toBeNull()
})
