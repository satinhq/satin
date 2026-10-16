// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { useScreenScrollRegistry } from '../navigation/navigationContext.tsx'
import DevMenu from './DevMenu.tsx'

const gesture = vi.hoisted(() => ({ open: () => {} }))
vi.mock('./gesture.ts', () => ({
  installDevMenuGesture: (open: () => void) => {
    gesture.open = open
    return () => {}
  },
}))
vi.mock('../app/runtime.ts', () => ({ getBuiltApp: () => undefined }))
vi.mock('../public/presentation.tsx', () => ({
  Sheet: ({ isPresented, children }: { isPresented: boolean; children: React.ReactNode }) =>
    isPresented ? children : null,
}))
vi.mock('../presentation/Presentation.tsx', () => ({ Alert: () => null }))
vi.mock('../list-form/ListForm.tsx', () => ({
  List: () => {
    const registry = useScreenScrollRegistry()
    return <div data-registry-empty={registry.capture().size === 0}>Menu list</div>
  },
  Section: () => null,
  Row: () => null,
  ButtonRow: () => null,
}))
afterEach(() => vi.unstubAllGlobals())

it('opens its framework list outside navigation with an isolated scroll registry', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  const container = document.createElement('div')
  const root = createRoot(container)
  try {
    act(() => root.render(<DevMenu />))
    act(() => gesture.open())
    expect(container.textContent).toBe('Menu list')
    expect(container.firstElementChild?.getAttribute('data-registry-empty')).toBe('true')
  } finally {
    act(() => root.unmount())
  }
})
