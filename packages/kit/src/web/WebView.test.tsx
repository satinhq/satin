// @vitest-environment happy-dom
import { act, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { bindFrameDocument } from './frameDocument.ts'
import { bindMenuOutside, holdEmbeddedFrameInput } from '../menu/menuOutside.ts'
import { WebView, useWebFrame, type WebFrameController } from './WebView.tsx'

import { NavigatorContext, ScreenContext } from '../navigation/navigationContext.tsx'
import { createNavigator } from '../navigation/store.ts'
import { createScreenRegistry, defineScreen } from '../navigation/registry.ts'
import { createScrollSurfaceRegistry } from '../scroll/registry.ts'
import type { TransitionController } from '../navigation/types.ts'

const roots: ReturnType<typeof createRoot>[] = []
afterEach(() => {
  act(() => roots.splice(0).forEach(root => root.unmount()))
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})
it('reports blocked or foreign frames as unverified and denies inaccessible commands', () => {
  let controller!: WebFrameController
  function App() {
    controller = useWebFrame()
    return <WebView url="https://foreign.test/denied" title="Help" controller={controller} />
  }
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(<App />))
  const frame = container.querySelector('iframe')!
  Object.defineProperty(frame, 'contentDocument', { value: null })
  act(() => frame.dispatchEvent(new Event('load')))
  expect(controller.state).toEqual({ status: 'unverified', reason: 'cross-origin-or-denied' })
  expect(controller.reload()).toMatchObject({ status: 'unavailable' })
  expect(frame.getAttribute('sandbox')).not.toContain('allow-scripts')
  expect(frame.getAttribute('sandbox')).not.toContain('allow-top-navigation')
})
it('rejects executable embed URLs without mounting a frame and reports an invalid URL', () => {
  let controller!: WebFrameController
  function App() {
    controller = useWebFrame()
    return <WebView url="javascript:alert(1)" title="Help" controller={controller} />
  }
  const container = document.createElement('div')
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(<App />))
  expect(container.querySelector('iframe')).toBeNull()
  expect(controller.state).toEqual({ status: 'unavailable', reason: 'invalid-url' })
  expect(controller.reload()).toEqual({ status: 'unavailable', reason: 'not-mounted' })
})

it('scales a wide document and handles a dispatched link event', async () => {
  const resizes: ResizeObserverCallback[] = []
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        resizes.push(callback)
      }
      observe() {}
      disconnect() {}
    },
  )
  const frame = document.createElement('iframe')
  document.body.append(frame)
  const content = document.implementation.createHTMLDocument('Newsletter')
  content.body.innerHTML =
    '<table width="600"><tr><td>Mail</td></tr></table><a href="https://example.test/article" target="_top">Read</a>'
  Object.defineProperty(frame, 'contentDocument', { value: content })
  let width = 300
  let naturalHeight = 800
  Object.defineProperty(frame, 'clientWidth', { get: () => width })
  Object.defineProperty(content.documentElement, 'scrollWidth', { value: 600 })
  Object.defineProperty(content.body, 'scrollHeight', { get: () => naturalHeight })
  let height: number | undefined
  const opened: unknown[] = []
  const dispose = bindFrameDocument(
    frame,
    {
      sizing: 'content',
      fitsWidth: true,
      onOpenURL: (url, link) => opened.push([url, link.target]),
    },
    value => {
      height = value
    },
  )
  expect(content.body.style.zoom).toBe('0.5')
  expect(height).toBe(400)
  const tap = new MouseEvent('click', { bubbles: true, cancelable: true })
  content.querySelector('a')!.dispatchEvent(tap)
  expect(tap.defaultPrevented).toBe(true)
  expect(opened).toEqual([['https://example.test/article', '_top']])
  width = 0
  naturalHeight = 1000
  content.dispatchEvent(new Event('load'))
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  width = 300
  resizes[1]!([], {} as ResizeObserver)
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  expect(height).toBe(500)
  width = 600
  naturalHeight = 1200
  content.dispatchEvent(new Event('load'))
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  expect(content.body.style.zoom).toBe('1')
  expect(height).toBe(1200)
  dispose()
  expect(content.body.style.zoom).toBe('')
})

it('blocks executable links and resolves authored targets through the document base', () => {
  const frame = document.createElement('iframe')
  document.body.append(frame)
  const content = document.implementation.createHTMLDocument('Article')
  content.head.innerHTML = '<base href="https://example.test/articles/" target="reader">'
  content.body.innerHTML = '<a href="story">Read</a><a href="javascript:alert(1)">Unsafe</a>'
  Object.defineProperty(frame, 'contentDocument', { value: content })
  const opened: unknown[] = []
  const dispose = bindFrameDocument(
    frame,
    { sizing: 'fill', fitsWidth: false, onOpenURL: (url, link) => opened.push([url, link.target]) },
    () => {},
  )
  for (const anchor of content.querySelectorAll('a')) {
    const tap = new MouseEvent('click', { bubbles: true, cancelable: true })
    anchor.dispatchEvent(tap)
    expect(tap.defaultPrevented).toBe(anchor.hasAttribute('href'))
  }
  content
    .querySelector('a')!
    .dispatchEvent(new MouseEvent('auxclick', { button: 2, bubbles: true }))
  expect(opened).toEqual([['https://example.test/articles/story', 'reader']])
  content
    .querySelector('a')!
    .dispatchEvent(new MouseEvent('auxclick', { button: 1, bubbles: true }))
  expect(opened).toHaveLength(2)
  dispose()
})

it('puts late frame catchers in the frame wrapper, including sheets, below overlapping chrome', () => {
  const release = holdEmbeddedFrameInput(document)
  const dialog = document.createElement('dialog')
  document.body.append(dialog)
  const root = createRoot(dialog)
  roots.push(root)
  act(() =>
    root.render(
      <>
        <WebView url="https://example.test/mail" title="Mail" />
        <button style={{ position: 'absolute', zIndex: 15000 }}>Toolbar</button>
      </>,
    ),
  )
  const frame = dialog.querySelector('iframe')!
  const wrapper = frame.parentElement!
  const catcher = wrapper.querySelector('[data-satin-webview-catcher]')!
  expect(catcher.parentElement).toBe(wrapper)
  expect(wrapper.parentElement).toBe(dialog)
  expect(wrapper.style.isolation).toBe('isolate')
  expect(wrapper.contains(dialog.querySelector('button'))).toBe(false)
  // Stub the same containing block a browser uses for the inset:0 catcher.
  const box = {
    x: 10,
    y: 70,
    left: 10,
    top: 70,
    right: 310,
    bottom: 470,
    width: 300,
    height: 400,
  } as DOMRect
  wrapper.getBoundingClientRect = () => box
  frame.getBoundingClientRect = () => wrapper.getBoundingClientRect()
  catcher.getBoundingClientRect = () => catcher.parentElement!.getBoundingClientRect()
  expect(catcher.getBoundingClientRect()).toEqual(frame.getBoundingClientRect())
  release()
})

it('dismisses a catcher drag and wheel, consumes closing contacts, and refcounts each document', () => {
  const secondDocument = document.implementation.createHTMLDocument('Second')
  const release = holdEmbeddedFrameInput(document)
  const releaseAgain = holdEmbeddedFrameInput(document)
  const releaseSecond = holdEmbeddedFrameInput(secondDocument)
  const catcher = document.createElement('div')
  catcher.setAttribute('data-satin-webview-catcher', '')
  document.body.append(catcher)
  let open = true
  let dismissals = 0
  const dispose = bindMenuOutside({
    target: document,
    contains: () => false,
    isOpen: () => open,
    isShown: () => true,
    dismiss: () => {
      dismissals++
      open = false
    },
  })
  const send = (type: string, x: number) => {
    const event = new PointerEvent(type, {
      pointerId: 1,
      isPrimary: true,
      button: 0,
      clientX: x,
      bubbles: true,
      cancelable: true,
    })
    catcher.dispatchEvent(event)
    return event
  }
  expect(send('pointerdown', 0).defaultPrevented).toBe(true)
  send('pointermove', 80)
  send('pointerup', 80)
  expect(dismissals).toBe(1)
  expect(send('pointerdown', 0).defaultPrevented).toBe(true)
  send('pointercancel', 0)
  open = true
  const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true })
  catcher.dispatchEvent(wheel)
  expect(wheel.defaultPrevented).toBe(true)
  expect(dismissals).toBe(2)
  release()
  expect(document.documentElement.hasAttribute('data-satin-menu-shown')).toBe(true)
  releaseSecond()
  expect(secondDocument.documentElement.hasAttribute('data-satin-menu-shown')).toBe(false)
  releaseAgain()
  releaseAgain()
  expect(document.documentElement.hasAttribute('data-satin-menu-shown')).toBe(false)
  dispose()
})

it('prepares native scripts-off links before display, strips unsafe schemes, and keeps frame history untouched', () => {
  const frame = document.createElement('iframe')
  document.body.append(frame)
  const content = document.implementation.createHTMLDocument('Email')
  content.head.innerHTML = '<base href="https://example.test/mail/" target="_blank">'
  content.body.innerHTML =
    '<a href="story" target="_self" ping="/track" download>Read</a>' +
    '<a href="javascript:alert(1)">JS</a><a href="data:text/html,bad">Data</a>' +
    '<a href="https://user:password@localhost/">Credentials</a><a href="mailto:a@localhost">Mail</a>' +
    '<area href="https://example.test/map" target="_parent">' +
    '<form action="/submit" target="_blank"><button formtarget="_blank">Submit</button></form>' +
    '<svg xmlns:xlink="http://www.w3.org/1999/xlink"><a xlink:href="data:text/html,bad" target="_blank">SVG unsafe</a></svg>'
  Object.defineProperty(frame, 'contentDocument', { value: content })
  const opened = vi.fn()
  const dispose = bindFrameDocument(
    frame,
    {
      sizing: 'fill',
      fitsWidth: false,
      nativeLinks: true,
      onOpenURL: opened,
    },
    () => {},
  )
  const anchor = content.querySelector('a')!
  expect(anchor.getAttribute('href')).toBe('https://example.test/mail/story')
  expect(anchor.getAttribute('target')).toBe('_blank')
  expect(anchor.getAttribute('rel')).toBe('noopener noreferrer')
  expect(content.querySelector('form')?.getAttribute('target')).toBe('_self')
  expect(content.querySelector('button')?.getAttribute('formtarget')).toBe('_self')
  expect(anchor.hasAttribute('ping')).toBe(false)
  expect(anchor.hasAttribute('download')).toBe(false)
  expect(content.querySelectorAll('a[href]')).toHaveLength(1)
  expect(
    content.querySelector('svg a')?.getAttributeNS('http://www.w3.org/1999/xlink', 'href'),
  ).toBeNull()
  expect(content.querySelector('area')?.getAttribute('target')).toBe('_blank')
  const tap = new MouseEvent('click', { bubbles: true, cancelable: true })
  anchor.dispatchEvent(tap)
  expect(tap.defaultPrevented).toBe(false)
  expect(opened).not.toHaveBeenCalled()
  dispose()
})

it('grants native popup permissions only for enabled same-origin scripts-off links', () => {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  const render = (props: Partial<Parameters<typeof WebView>[0]>) => {
    act(() => root.render(<WebView url="/email.html" title="Email" {...props} />))
    return container.querySelector('iframe')!.getAttribute('sandbox')!
  }
  expect(render({})).toContain('allow-popups-to-escape-sandbox')
  expect(render({})).not.toContain('allow-scripts')
  expect(render({ allowsLinkOpening: false })).not.toContain('allow-popups')
  expect(render({ allowsJavaScript: true })).not.toContain('allow-popups')
  expect(render({ url: 'https://foreign.test/mail' })).not.toContain('allow-popups')
})

it('disabling link opening removes safe destinations too, without relying on a click listener', () => {
  const frame = document.createElement('iframe')
  document.body.append(frame)
  const content = document.implementation.createHTMLDocument('Email')
  content.body.innerHTML = '<a href="https://example.test/">Read</a>'
  Object.defineProperty(frame, 'contentDocument', { value: content })
  const dispose = bindFrameDocument(
    frame,
    {
      sizing: 'fill',
      fitsWidth: false,
      nativeLinks: true,
      allowsLinkOpening: false,
    },
    () => {},
  )
  expect(content.querySelector('a')?.hasAttribute('href')).toBe(false)
  dispose()
})

it('sanitizes native links in a standalone SVG document before skipping HTML layout', () => {
  const frame = document.createElement('iframe')
  document.body.append(frame)
  const content = new DOMParser().parseFromString(
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">' +
      '<a xlink:href="data:text/html,bad" target="_blank">Unsafe</a>' +
      '<a href="https://example.test/">Safe</a></svg>',
    'image/svg+xml',
  )
  Object.defineProperty(frame, 'contentDocument', { value: content })
  const dispose = bindFrameDocument(
    frame,
    { sizing: 'fill', fitsWidth: false, nativeLinks: true },
    () => {},
  )
  const anchors = content.querySelectorAll('a')
  expect(anchors[0]?.getAttributeNS('http://www.w3.org/1999/xlink', 'href')).toBeNull()
  expect(anchors[0]?.hasAttribute('href')).toBe(false)
  expect(anchors[1]?.getAttribute('target')).toBe('_blank')
  expect(anchors[1]?.getAttribute('rel')).toBe('noopener noreferrer')
  dispose()
})

it('reserves an email back edge only while its navigation screen has a back destination', () => {
  const controllers: TransitionController[] = []
  const navigator = createNavigator({
    registry: createScreenRegistry(defineScreen('email', { component: () => null })),
    initial: { id: 'email' },
    transitionControllerFactory: completion => {
      const controller = { progress: 0, finish: completion.finish, cancel: completion.cancel }
      controllers.push(controller)
      return controller
    },
  })
  const scrollRegistry = createScrollSurfaceRegistry()
  function CurrentEmail() {
    const state = useSyncExternalStore(navigator.subscribe, navigator.getState)
    const entry = state.entries.at(-1)!
    return (
      <NavigatorContext value={navigator}>
        <ScreenContext
          value={{
            key: entry.key,
            params: undefined,
            scrollRegistry,
            lifecycle: { isCovered: false, phase: entry.transition.phase },
          }}
        >
          <WebView url="https://example.test/email" title="Email" />
        </ScreenContext>
      </NavigatorContext>
    )
  }
  const container = document.createElement('div')
  container.setAttribute('data-satin-navigator-host', '')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(<CurrentEmail />))
  expect(container.querySelector('[data-satin-webview-back-edge]')).toBeNull()
  act(() => {
    navigator.push('email')
    controllers.at(-1)!.finish()
  })
  let edge = container.querySelector<HTMLElement>('[data-satin-webview-back-edge]')!
  expect(edge.style.width).toBe('20px')
  expect(edge.parentElement).toBe(container.querySelector('iframe')!.parentElement)
  act(() =>
    root.render(
      <dialog open>
        <CurrentEmail />
      </dialog>,
    ),
  )
  expect(
    container.querySelector<HTMLElement>('[data-satin-webview-back-edge]')!.style.display,
  ).toBe('none')
  act(() =>
    root.render(
      <dialog open>
        <div data-satin-navigator-host="">
          <CurrentEmail />
        </div>
      </dialog>,
    ),
  )
  edge = container.querySelector<HTMLElement>('[data-satin-webview-back-edge]')!
  expect(edge.style.display).toBe('')
  act(() => navigator.pop())
  expect(container.querySelector('[data-satin-webview-back-edge]')).toBe(edge)
  act(() => controllers.at(-1)!.finish())
  expect(container.querySelector('[data-satin-webview-back-edge]')).toBeNull()
})
