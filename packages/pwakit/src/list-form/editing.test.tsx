// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { EditButton, List } from '../public/controls.tsx'
import { EditModeScope, ForEach } from './editing.tsx'
import { moving, removing } from './offsets.ts'
import { Section } from './ListForm.tsx'

let root: Root | undefined
let node: HTMLDivElement
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const notes = [
  { id: 'a', title: 'Groceries' },
  { id: 'b', title: 'Call Alex' },
  { id: 'c', title: 'Plan weekend' },
]

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }))
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  // jsdom has no Web Animations: every animation finishes at once.
  const finished = Promise.resolve()
  HTMLElement.prototype.animate = vi.fn(() => ({ finished, cancel() {} }) as unknown as Animation)
  HTMLElement.prototype.getAnimations = () => []
})
afterEach(() => {
  act(() => root?.unmount())
  node?.remove()
  vi.unstubAllGlobals()
})
function render(content: React.ReactNode) {
  node = document.createElement('div')
  document.body.append(node)
  root = createRoot(node)
  act(() => root!.render(content))
}
const rows = () => [...node.querySelectorAll<HTMLElement>('[data-satin-section-item]')]
// A finger tap with no click after it: WebKit's synthesized click can be claimed by the shared
// press receipt before it reaches the row, so the row must read the pointer itself.
function tap(target: Element) {
  const init = { bubbles: true, isPrimary: true, pointerId: 1, clientX: 40, clientY: 20 }
  target.dispatchEvent(new PointerEvent('pointerdown', init))
  target.dispatchEvent(new PointerEvent('pointerup', init))
}

it('gives ForEach rows swipe-to-delete that reports the row offset, as SwiftUI onDelete does', async () => {
  const onDelete = vi.fn()
  render(
    <EditModeScope>
      <List id="notes">
        <Section>
          <ForEach data={notes} onDelete={onDelete}>
            {note => <span>{note.title}</span>}
          </ForEach>
        </Section>
      </List>
    </EditModeScope>,
  )
  const remove = rows()[1].querySelector<HTMLButtonElement>('[data-satin-action-access] button')
  expect(remove?.textContent).toBe('Delete')
  await act(async () => remove!.click())
  expect(onDelete).toHaveBeenCalledWith([1])
})

it('edits a Set selection with EditButton: circles appear and row taps toggle', () => {
  const changes: string[][] = []
  function Notes() {
    const [selection, setSelection] = useState<Set<string>>(new Set())
    return (
      <EditModeScope>
        <EditButton />
        <List
          id="notes"
          selection={selection}
          onSelectionChange={next => {
            changes.push([...next].sort())
            setSelection(next)
          }}
        >
          <ForEach data={notes}>{note => <span>{note.title}</span>}</ForEach>
        </List>
      </EditModeScope>
    )
  }
  render(<Notes />)
  expect(node.querySelectorAll('[data-satin-edit-control="select"]')).toHaveLength(0)
  act(() => node.querySelector<HTMLButtonElement>('button')!.click())
  expect(node.querySelectorAll('[data-satin-edit-control="select"]')).toHaveLength(3)
  act(() => tap(rows()[0].querySelector('span')!))
  act(() => tap(rows()[2].querySelector('span')!))
  act(() => tap(rows()[0].querySelector('span')!))
  expect(changes).toEqual([['a'], ['a', 'c'], ['c']])
  expect(rows().map(row => row.hasAttribute('data-satin-selected'))).toEqual([false, false, true])
})

it('applies onMove and onDelete offsets as Swift move(fromOffsets:toOffset:) and remove(atOffsets:) do', () => {
  const letters = ['a', 'b', 'c', 'd']
  // A drag of the first row below the second reports the destination in original positions.
  expect(moving(letters, { fromOffsets: [0], toOffset: 2 })).toEqual(['b', 'a', 'c', 'd'])
  expect(moving(letters, { fromOffsets: [3], toOffset: 1 })).toEqual(['a', 'd', 'b', 'c'])
  expect(moving(letters, { fromOffsets: [2, 0], toOffset: 4 })).toEqual(['b', 'd', 'a', 'c'])
  expect(removing(letters, [3, 1])).toEqual(['a', 'c'])
  expect(letters).toEqual(['a', 'b', 'c', 'd'])
})
