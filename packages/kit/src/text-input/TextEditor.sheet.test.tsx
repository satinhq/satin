// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { TextEditor, TextField } from '../public/controls.tsx'
import { ListContext } from '../list-form/listContext.ts'

const keyboard = vi.hoisted(() => ({ height: 0, viewportHeight: 956, offsetTop: 0 }))
vi.mock('../keyboard/adapter.ts', () => ({ useKeyboardMetrics: () => keyboard }))
let root: Root | undefined
afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  document.body.replaceChildren()
  vi.restoreAllMocks()
  keyboard.height = 0
  keyboard.viewportHeight = 956
})

function mount(field: 'editor' | 'vertical', min: number, top: number, viewport = 874) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const surface = document.createElement('div')
  surface.dataset.satinScrollAxis = 'vertical'
  Object.defineProperty(surface, 'clientHeight', { value: viewport })
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({ top } as DOMRect)
  document.body.append(surface)
  root = createRoot(surface)
  const common = {
    label: 'Ingredients',
    prompt: '2 cups flour\n1 tsp salt',
    value: '',
    onChange: () => {},
    style: { lineHeight: '22px', padding: '12px 5px' },
  }
  act(() =>
    root!.render(
      <ListContext value={true}>
        {field === 'editor' ? (
          <TextEditor {...common} minLines={min} />
        ) : (
          <TextField {...common} axis="vertical" lineLimit={{ min, max: 6 }} />
        )}
      </ListContext>,
    ),
  )
  return surface.querySelector('textarea')!
}

it.each(['editor', 'vertical'] as const)(
  '%s keeps four lines while its sheet is translated offscreen',
  field => {
    const editor = mount(field, 4, 956)
    expect(editor.style.height).toBe('112px')
    expect(editor.getAttribute('rows')).toBe('4')
    expect(editor.placeholder.split('\n')).toEqual(['2 cups flour', '1 tsp salt'])
    expect(editor.getAttribute('aria-label') ?? document.querySelector('label')?.textContent).toBe(
      'Ingredients',
    )
  },
)
it('keeps the real scroll viewport limit even without a keyboard', () => {
  expect(mount('editor', 20, 956, 200).style.height).toBe('176px')
})
it('still limits an editor to the visible viewport above the keyboard', () => {
  keyboard.height = 500
  keyboard.viewportHeight = 456
  expect(mount('editor', 20, 82).style.height).toBe('350px')
})
