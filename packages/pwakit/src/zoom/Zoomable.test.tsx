// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Zoomable } from './Zoomable.tsx'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let root: Root | undefined
let container: HTMLDivElement | undefined

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
  vi.unstubAllGlobals()
})

function render(
  children?: ReactNode,
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void,
) {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  const onScaleChange = vi.fn()
  act(() =>
    root?.render(
      <Zoomable onScaleChange={onScaleChange} onKeyDown={onKeyDown}>
        {children}
      </Zoomable>,
    ),
  )
  const host = container.querySelector<HTMLElement>('[data-satin-role="zoomable"]')!
  onScaleChange.mockClear()
  return { host, onScaleChange }
}

function keydown(target: Element, key: string, options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options })
  act(() => target.dispatchEvent(event))
  return event
}

describe('zoom keyboard ownership', () => {
  it('preserves the exact 10-2 typing sequence in a focused descendant', () => {
    const { host, onScaleChange } = render(<input defaultValue="" />)
    const input = host.querySelector('input')!
    input.focus()
    for (const key of '10-2') {
      expect(keydown(input, key).defaultPrevented).toBe(false)
    }
    expect(onScaleChange).not.toHaveBeenCalled()
  })

  it.each(['input', 'textarea', 'select', 'contenteditable'])(
    'preserves all zoom keys in %s',
    kind => {
      const child =
        kind === 'input' ? (
          <input />
        ) : kind === 'textarea' ? (
          <textarea />
        ) : kind === 'select' ? (
          <select>
            <option>Option</option>
          </select>
        ) : (
          <div contentEditable suppressContentEditableWarning>
            <span>Editor</span>
          </div>
        )
      const { host, onScaleChange } = render(child)
      const target = host.querySelector(kind === 'contenteditable' ? 'span' : kind)!
      for (const key of ['0', '-', '+', '=']) {
        expect(keydown(target, key).defaultPrevented).toBe(false)
      }
      expect(onScaleChange).not.toHaveBeenCalled()
    },
  )

  it.each([{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { isComposing: true }])(
    'preserves modified or composing key events %j',
    options => {
      const { host, onScaleChange } = render()
      expect(keydown(host, '+', options).defaultPrevented).toBe(false)
      expect(onScaleChange).not.toHaveBeenCalled()
    },
  )

  it('keeps host zoom, shifted plus, minus, equals and reset shortcuts working', () => {
    const { host } = render()
    host.focus()
    expect(keydown(host, '+', { shiftKey: true }).defaultPrevented).toBe(true)
    expect(host.dataset.satinZoomScale).toBe('1.25')
    keydown(host, '-')
    expect(host.dataset.satinZoomScale).toBe('1')
    keydown(host, '=')
    expect(host.dataset.satinZoomScale).toBe('1.25')
    keydown(host, '0')
    expect(host.dataset.satinZoomScale).toBe('1')
  })

  it('keeps zoom shortcuts inside an explicitly noneditable descendant', () => {
    const { host } = render(
      <div contentEditable suppressContentEditableWarning>
        <span contentEditable={false}>Noneditable content</span>
      </div>,
    )
    const target = host.querySelector('span')!
    expect(keydown(target, '+').defaultPrevented).toBe(true)
    expect(host.dataset.satinZoomScale).toBe('1.25')
  })

  it('respects a caller that already prevented the key event', () => {
    const { host, onScaleChange } = render(undefined, event => event.preventDefault())
    expect(keydown(host, '+').defaultPrevented).toBe(true)
    expect(onScaleChange).not.toHaveBeenCalled()
  })
})
