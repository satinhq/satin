// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TextField } from './TextField.tsx'
import { createFocusChain } from './focusChain.ts'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('TextField submission through keyboard events', () => {
  it.each([
    ['composing Enter', { key: 'Enter', isComposing: true }],
    ['IME key code 229', { key: 'Enter', keyCode: 229 }],
    ['consumer-cancelled Enter', { key: 'Enter' }],
  ])(
    'preserves focus and suppresses submission for %s before accepting ordinary Enter',
    (name, init) => {
      const submitted = vi.fn()
      const chain = createFocusChain(['first', 'second'])
      let cancel = name === 'consumer-cancelled Enter'
      const firstBinding = chain.field('first')
      act(() =>
        root.render(
          <>
            <TextField
              label="First"
              value=""
              onChange={() => {}}
              ref={firstBinding.ref}
              onKeyDown={event => {
                if (cancel) event.preventDefault()
              }}
              onSubmit={() => {
                submitted()
                firstBinding.onSubmit()
              }}
            />
            <TextField label="Second" value="" onChange={() => {}} {...chain.field('second')} />
          </>,
        ),
      )
      const [first, second] = container.querySelectorAll('input')
      first!.focus()
      act(() =>
        first!.dispatchEvent(
          new KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true }),
        ),
      )
      expect(submitted).not.toHaveBeenCalled()
      expect(document.activeElement).toBe(first)
      cancel = false
      act(() =>
        first!.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
        ),
      )
      expect(submitted).toHaveBeenCalledOnce()
      expect(document.activeElement).toBe(second)
    },
  )

  it('ordinary final-field Enter blurs once while a next field without a chain keeps focus', () => {
    act(() =>
      root.render(
        <>
          <TextField label="Done" value="" onChange={() => {}} submitLabel="done" />
          <TextField label="Next" value="" onChange={() => {}} submitLabel="next" />
        </>,
      ),
    )
    const [done, next] = container.querySelectorAll('input')
    const blurred = vi.fn()
    done!.addEventListener('blur', blurred)
    done!.focus()
    act(() =>
      done!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      ),
    )
    expect(blurred).toHaveBeenCalledOnce()
    expect(document.activeElement).not.toBe(done)
    next!.focus()
    act(() =>
      next!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      ),
    )
    expect(document.activeElement).toBe(next)
  })
})
