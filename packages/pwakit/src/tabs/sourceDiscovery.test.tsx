// @vitest-environment happy-dom
import { act, createRef, useContext, useLayoutEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { MaterialEffectRoot } from '../glass/MaterialEffectRoot.tsx'
import { MaterialEffectContext } from '../glass/liquidContext.ts'

vi.mock('../glass/GlassPresentation.tsx', () => ({
  GlassPresentation: ({ consumer }: { consumer: { scroller: HTMLElement } }) => (
    <span data-source={consumer.scroller.id} />
  ),
}))
function Registration() {
  const context = useContext(MaterialEffectContext)!
  useLayoutEffect(() => {
    context.registerTabs('tabs', {
      items: [
        { id: 'a', label: 'A', icon: null },
        { id: 'b', label: 'B', icon: null },
      ],
      selected: 'b',
      onSelect() {},
    })
    return () => context.registerTabs('tabs', undefined)
  }, [context.registerTabs])
  return null
}
it('discovers the initial source after its parent scene ref attaches and ignores a hidden push', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const mount = document.createElement('div'),
    chrome = document.createElement('div')
  document.body.append(mount, chrome)
  const scene = createRef<HTMLDivElement>(),
    root = createRoot(mount)
  act(() =>
    root.render(
      <div ref={scene}>
        <MaterialEffectRoot scene={scene} chrome={chrome} enabled capabilitySettled>
          <Registration />
          <div data-satin-tab-panel="a" data-satin-tab-active="false">
            <div data-satin-transition-active="true">
              <div id="hidden" data-satin-scroll="a" data-satin-primary="true" />
            </div>
          </div>
          <div data-satin-tab-panel="b" data-satin-tab-active="true">
            <div id="visible" data-satin-scroll="b" data-satin-primary="true" />
          </div>
        </MaterialEffectRoot>
      </div>,
    ),
  )
  expect(chrome.querySelector('[data-source]')?.getAttribute('data-source')).toBe('visible')
  act(() => root.unmount())
  mount.remove()
  chrome.remove()
})
it('uses the split layout content column, not the sidebar list, as the backdrop source', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const mount = document.createElement('div'),
    chrome = document.createElement('div')
  document.body.append(mount, chrome)
  const scene = createRef<HTMLDivElement>(),
    root = createRoot(mount)
  act(() =>
    root.render(
      <div ref={scene}>
        <MaterialEffectRoot scene={scene} chrome={chrome} enabled capabilitySettled>
          <Registration />
          <div data-satin-navigation-layout="split">
            <div
              data-satin-pane="sidebar"
              data-satin-screen-container="true"
              data-satin-covered="false"
            >
              <div id="sidebar" data-satin-scroll="list" data-satin-primary="true" />
            </div>
            <div data-satin-detail-content="true">
              <div
                data-satin-pane="detail"
                data-satin-screen-container="true"
                data-satin-covered="true"
              >
                <div id="covered" data-satin-scroll="rear" data-satin-primary="true" />
              </div>
              <div
                data-satin-pane="detail"
                data-satin-screen-container="true"
                data-satin-covered="false"
              >
                <div id="detail" data-satin-scroll="front" data-satin-primary="true" />
              </div>
            </div>
          </div>
        </MaterialEffectRoot>
      </div>,
    ),
  )
  expect(chrome.querySelector('[data-source]')?.getAttribute('data-source')).toBe('detail')
  act(() => root.unmount())
  const sidebarOnly = createRoot(mount)
  act(() =>
    sidebarOnly.render(
      <div ref={scene}>
        <MaterialEffectRoot scene={scene} chrome={chrome} enabled capabilitySettled>
          <Registration />
          <div data-satin-navigation-layout="split">
            <div
              data-satin-pane="sidebar"
              data-satin-screen-container="true"
              data-satin-covered="false"
            >
              <div id="sidebar" data-satin-scroll="list" data-satin-primary="true" />
            </div>
          </div>
        </MaterialEffectRoot>
      </div>,
    ),
  )
  expect(chrome.querySelector('[data-source]')?.getAttribute('data-source')).toBe('sidebar')
  act(() => sidebarOnly.unmount())
  mount.remove()
  chrome.remove()
})
