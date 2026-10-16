// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { TextField } from './TextField.tsx'
import { TextEditor } from './TextEditor.tsx'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
afterEach(() => {
  vi.restoreAllMocks()
  document.body.replaceChildren()
})
it.each(['field', 'editor'] as const)(
  'the %s autofocus starts with preventScroll rather than correcting a native focus',
  kind => {
    const host = document.createElement('div')
    document.body.append(host)
    const calls: FocusOptions[] = []
    const original = HTMLElement.prototype.focus
    vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (
      this: HTMLElement,
      options,
    ) {
      if (this.matches('input,textarea')) calls.push(options ?? {})
      original.call(this, options)
    })
    const root = createRoot(host)
    act(() =>
      root.render(
        kind === 'field' ? (
          <TextField autoFocus label="Name" value="" onChange={() => {}} />
        ) : (
          <TextEditor autoFocus label="Note" value="" onChange={() => {}} />
        ),
      ),
    )
    expect(calls[0]).toMatchObject({ preventScroll: true })
    expect(document.activeElement).toBe(host.querySelector('input,textarea'))
    act(() => root.unmount())
  },
)
