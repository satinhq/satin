// @vitest-environment happy-dom
import { act, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { useSearchPresentation } from './useSearchPresentation.ts'
import { SearchEnvironment, useIsSearching, useDismissSearch } from './SearchEnvironment.tsx'
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
  let setControlled!: (value: boolean) => void
  const changed = vi.fn()
  const submitted = vi.fn()
  function Fixture() {
    const [text, setText] = useState('')
    const [controlledPresented, setControlledPresented] = useState(controlled)
    setControlled = setControlledPresented
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
        : { ...base, isPresented: controlledPresented!, onPresentedChange: changed }
    api = useSearchPresentation(config, input, pad)
    return (
      <>
        <input
          ref={input}
          value={text}
          onChange={() => {}}
          onFocus={api.present}
          onBlur={api.resign}
        />
        <BrowseAction />
        <SearchStatus />
      </>
    )
  }
  act(() =>
    root.render(
      <SearchEnvironment>
        <Fixture />
      </SearchEnvironment>,
    ),
  )
  dispose = () => root.unmount()
  return {
    host,
    setControlled,
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

it('controlled phone dismissal releases keyboard focus without requiring the field close button', () => {
  const view = mount(false, false)
  act(() => view.setControlled(true))
  expect(document.activeElement?.tagName).toBe('INPUT')
  act(() => view.setControlled(false))
  expect(document.activeElement?.tagName).not.toBe('INPUT')
  expect(view.api.presented).toBe(false)
})

function BrowseAction() {
  const [opened, setOpened] = useState(0)
  return <button onClick={() => setOpened(value => value + 1)}>Inbox action {opened}</button>
}

function SearchStatus() {
  const searching = useIsSearching()
  const dismiss = useDismissSearch()
  return <button onClick={dismiss}>{searching ? 'Leave search' : 'Not searching'}</button>
}

it('preserves ordinary content during empty-query search and lets descendants dismiss the mode', () => {
  const view = mount(false)
  expect(document.body.textContent).toContain('Inbox action 0')
  act(() => document.querySelector<HTMLButtonElement>('button')!.click())
  view.host.scrollTop = 400
  act(() => view.api.present())
  const browsing = [...document.querySelectorAll('button')].find(button =>
    button.textContent?.startsWith('Inbox action'),
  )!
  expect(browsing.style.display).not.toBe('none')
  act(() => browsing.click())
  expect(browsing.textContent).toBe('Inbox action 2')
  expect(document.body.textContent).toContain('Leave search')
  act(() => view.api.change('Apple'))
  act(() => view.api.submit())
  expect(document.body.textContent).toContain('Inbox action')
  expect(document.body.textContent).toContain('Leave search')
  const dismiss = [...document.querySelectorAll('button')].find(
    button => button.textContent === 'Leave search',
  )!
  act(() => dismiss.click())
  expect(view.text).toBe('')
  expect(document.body.textContent).toContain('Not searching')
  expect(document.body.textContent).toContain('Inbox action 2')
  expect(view.host.scrollTop).toBe(400)
})
