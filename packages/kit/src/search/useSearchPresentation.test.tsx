// @vitest-environment happy-dom
import { act, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { useSearchPresentation } from './useSearchPresentation.ts'
import type { Searchable } from './searchable.ts'

let dispose: (() => void) | undefined
afterEach(() => {
  act(() => dispose?.())
  document.body.replaceChildren()
})
function mount(pad: boolean, controlled?: boolean) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  let api!: ReturnType<typeof useSearchPresentation>
  let value = ''
  const changed = vi.fn()
  const submitted = vi.fn()
  function Fixture() {
    const [text, setText] = useState('')
    value = text
    const input = useRef<HTMLInputElement>(null)
    const base = {
      text,
      onTextChange: setText,
      onSubmit: submitted,
      suggestions: [{ id: 'apple', text: 'Apple' }],
    }
    const config: Searchable =
      controlled === undefined
        ? base
        : { ...base, isPresented: controlled, onPresentedChange: changed }
    api = useSearchPresentation(config, input, pad)
    return (
      <input
        ref={input}
        value={text}
        onChange={() => {}}
        onFocus={api.present}
        onBlur={api.resign}
      />
    )
  }
  act(() => root.render(<Fixture />))
  dispose = () => root.unmount()
  return {
    get api() {
      return api
    },
    get text() {
      return value
    },
    changed,
    submitted,
  }
}

it('collapses an empty iPad field on blur and removes its suggestions', () => {
  const view = mount(true)
  act(() => view.api.present())
  expect(view.api.suggestions).toHaveLength(1)
  act(() => view.api.resign())
  expect(view.api.presented).toBe(false)
  expect(view.api.suggestions).toHaveLength(0)
})
it('retains the query and expanded field after submitting on iPad', () => {
  const view = mount(true)
  act(() => view.api.present())
  act(() => view.api.change('Apple'))
  act(() => view.api.submit())
  act(() => view.api.resign())
  expect(view.text).toBe('Apple')
  expect(view.api.presented).toBe(true)
  expect(view.api.suggestions).toHaveLength(0)
  expect(view.submitted).toHaveBeenCalledTimes(1)
})
it('clearing an ordinary field retains presentation until it resigns focus', () => {
  const view = mount(true)
  act(() => view.api.present())
  act(() => view.api.change('Apple'))
  act(() => view.api.change(''))
  expect(view.api.presented).toBe(true)
  act(() => view.api.resign())
  expect(view.api.presented).toBe(false)
})
it('requests controlled dismissal without overriding its owner', () => {
  const view = mount(true, true)
  act(() => view.api.resign())
  expect(view.changed).toHaveBeenCalledWith(false)
  expect(view.api.presented).toBe(true)
})
it('keeps phone presentation unchanged when focus resigns', () => {
  const view = mount(false)
  act(() => view.api.present())
  act(() => view.api.resign())
  expect(view.api.presented).toBe(true)
  expect(view.api.suggestions).toHaveLength(1)
})

it('requests controlled dismissal once when blur fires synchronously', () => {
  const fixture = mount(true, true)
  act(() => fixture.api.dismiss())
  expect(fixture.changed.mock.calls.filter(([value]) => value === false)).toHaveLength(1)
})
