// @vitest-environment happy-dom
import { act, useContext, useLayoutEffect, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { frameworkStyleDeclarations } from '../../test/domStyles.ts'

const keyboard = vi.hoisted(() => ({
  height: 0,
  listeners: new Set<(motion: { height: number; startTime: number }) => void>(),
}))
vi.mock('../keyboard/adapter.ts', () => ({
  currentKeyboardHeight: () => keyboard.height,
  editable: () => false,
  onKeyboardMotion: (listener: (motion: { height: number; startTime: number }) => void) => {
    keyboard.listeners.add(listener)
    return () => keyboard.listeners.delete(listener)
  },
}))
import { BottomInsetContext, SafeAreaInset } from './SafeAreaInset.tsx'

let root: Root | undefined
function Surface() {
  const { geometry } = useContext(BottomInsetContext)
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => geometry?.attach(ref.current!), [geometry])
  return <div ref={ref} data-testid="scroll" />
}
function renderTabs(dock: boolean, tab = true) {
  const style = document.createElement('style')
  style.textContent = frameworkStyleDeclarations()
  document.head.append(style)
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return { height: this.hasAttribute('data-satin-inset-accessory') && dock ? 62 : 0 } as DOMRect
  })
  const mount = document.createElement('div')
  document.body.append(mount)
  root = createRoot(mount)
  act(() =>
    root!.render(
      <div
        data-satin-tab-view={tab ? 'true' : undefined}
        style={
          {
            '--satin-inset-bottom': '20px',
            '--satin-glass-tab-bar-bottom-gap': '24px',
          } as React.CSSProperties
        }
      >
        <SafeAreaInset
          edge="bottom"
          spacing={0}
          content={dock ? <div data-satin-tab-inset="true" /> : null}
        >
          <Surface />
        </SafeAreaInset>
      </div>,
    ),
  )
  return {
    boundary: mount.querySelector<HTMLElement>('[data-satin-bottom-boundary]')!,
    content: mount.querySelector<HTMLElement>('[data-satin-inset-content]')!,
    surface: mount.querySelector<HTMLElement>('[data-testid="scroll"]')!,
  }
}
function report(height: number) {
  keyboard.height = height
  act(() => {
    for (const listener of keyboard.listeners)
      listener({ height, startTime: performance.now() - 0 })
  })
}
afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  keyboard.height = 0
  keyboard.listeners.clear()
  document.body.replaceChildren()
  document.head.replaceChildren()
  vi.restoreAllMocks()
})

it.each([false, true])('keeps tab content drawable beneath the keyboard, dock=%s', dock => {
  const { boundary, content, surface } = renderTabs(dock)
  const rest = surface.style.getPropertyValue('--satin-scroll-inset-bottom')
  const framePadding = getComputedStyle(boundary).paddingBottom
  report(367)
  boundary.style.setProperty('--satin-keyboard-height', '367px')
  expect(surface.style.getPropertyValue('--satin-scroll-inset-bottom')).toBe('367px')
  expect(getComputedStyle(boundary).paddingBottom).toBe(framePadding)
  expect(getComputedStyle(content).paddingBottom).toBe('0px')
  report(0)
  expect(surface.style.getPropertyValue('--satin-scroll-inset-bottom')).toBe(rest)
})

it('gives a newly mounted destination the current keyboard inset before its first paint', () => {
  keyboard.height = 367
  const { surface } = renderTabs(false)
  expect(surface.style.getPropertyValue('--satin-scroll-inset-bottom')).toBe('367px')
  act(() => root!.unmount())
  root = undefined
  expect(keyboard.listeners.size).toBe(0)
})

it('mounts an ordinary composer over a full frame with current keyboard clearance in the scroll inset', () => {
  keyboard.height = 367
  const { boundary, content, surface } = renderTabs(true, false)
  expect(boundary.dataset.satinKeyboardCarrier).toBe('true')
  expect(getComputedStyle(content).position).toBe('absolute')
  expect(getComputedStyle(content).gridArea).toBe('auto')
  expect(surface.style.getPropertyValue('--satin-scroll-inset-bottom')).toBe('429px')
})
