// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { bindFrameDocument } from './frameDocument.ts'
import { bindMenuOutside, holdEmbeddedFrameInput } from '../menu/menuOutside.ts'
import { WebView, useWebFrame, type WebFrameController } from './WebView.tsx'

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
    expect(tap.defaultPrevented).toBe(true)
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
