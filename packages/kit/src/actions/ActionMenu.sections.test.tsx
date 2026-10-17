// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it } from 'vitest'
import { ActionMenu } from './ActionMenu.tsx'

it('shows a labelled menu section header above its rows and separates loose actions (reference, iOS 27.0 native reference)', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  act(() =>
    root.render(
      <ActionMenu
        select={() => {}}
        actions={[
          { label: 'Sort By', section: [{ id: 'name', label: 'Name', onPress() {} }] },
          { section: [{ id: 'view', label: 'Show Completed', onPress() {} }] },
          { id: 'delete', label: 'Delete List', onPress() {} },
        ]}
      />,
    ),
  )
  try {
    const sections = host.querySelectorAll('[data-satin-action-section]')
    const header = sections[0]!.firstElementChild!
    expect(header.matches('[data-satin-action-section-header]')).toBe(true)
    expect(header.textContent).toBe('Sort By')
    expect(sections[1]!.querySelector('[data-satin-action-section-header]')).toBeNull()
    // A loose action after a section is separated like a section of its own.
    expect(sections).toHaveLength(3)
    expect(sections[2]!.textContent).toBe('Delete List')
  } finally {
    act(() => root.unmount())
    host.remove()
  }
})

it('draws a shared action symbol when the command has no custom icon', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  act(() =>
    root.render(
      <ActionMenu
        select={() => {}}
        actions={[{ id: 'pin', label: 'Pin', symbol: 'pin', onPress() {} }]}
      />,
    ),
  )
  try {
    expect(host.querySelector('[data-satin-symbol="pin"]')).not.toBeNull()
    expect(host.textContent).toBe('Pin')
  } finally {
    act(() => root.unmount())
    host.remove()
  }
})
