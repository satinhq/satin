// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { ScrollSurface } from '../scroll/ScrollSurface.tsx'
import { SafeAreaInset } from './SafeAreaInset.tsx'

it('updates nested scroll and side-accessory clearance without rendering the transcript again', () => {
  const observers = new Map<Element, Set<() => void>>()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      elements = new Set<Element>()
      private callback: () => void
      constructor(callback: () => void) {
        this.callback = callback
      }
      observe(element: Element) {
        this.elements.add(element)
        const callbacks = observers.get(element) ?? new Set()
        callbacks.add(this.callback)
        observers.set(element, callbacks)
      }
      unobserve(element: Element) {
        observers.get(element)?.delete(this.callback)
      }
      disconnect() {
        for (const element of this.elements) this.unobserve(element)
      }
    },
  )
  let outerHeight = 50
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const height = this.matches('[data-satin-inset-accessory="true"]')
      ? this.parentElement?.id === 'outer'
        ? outerHeight
        : 30
      : 0
    return { top: 0, bottom: height, height, left: 0, right: 0, width: 0 } as DOMRect
  })
  let renders = 0
  function Transcript() {
    renders += 1
    return (
      <ScrollSurface id="thread">
        <div>Long transcript</div>
      </ScrollSurface>
    )
  }
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const inset = (selector: string) =>
    container
      .querySelector<HTMLElement>(selector)!
      .style.getPropertyValue('--satin-scroll-inset-bottom')
  try {
    act(() =>
      root.render(
        <SafeAreaInset
          id="outer"
          edge="bottom"
          spacing={2}
          content={<ScrollSurface id="accessory">Composer</ScrollSurface>}
        >
          <SafeAreaInset edge="leading" content={<div>Side rail</div>}>
            <SafeAreaInset edge="bottom" spacing={3} content={<div>Inner accessory</div>}>
              <Transcript />
            </SafeAreaInset>
          </SafeAreaInset>
        </SafeAreaInset>,
      ),
    )
    expect(inset('[data-satin-scroll="thread"]')).toBe('85px')
    expect(inset('[data-satin-inset-accessory="leading"]')).toBe('52px')
    expect(inset('[data-satin-scroll="accessory"]')).toBe('')
    const initialRenders = renders
    const boundary = container.querySelector<HTMLElement>('#outer')!
    outerHeight = 100
    const content = boundary.querySelector<HTMLElement>('[data-satin-inset-content]')!
    content.style.marginBottom = '-20px'
    // Changing system padding and the negative extension leaves the scrollport size unchanged.
    // Only the boundary's content box reports this resize.
    act(() => {
      for (const callback of observers.get(boundary) ?? []) callback()
    })
    expect(inset('[data-satin-scroll="thread"]')).toBe('155px')
    expect(inset('[data-satin-inset-accessory="leading"]')).toBe('122px')
    expect(renders).toBe(initialRenders)
  } finally {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  }
})
