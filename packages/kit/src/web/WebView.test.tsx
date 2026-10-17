// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it } from 'vitest'
import { WebView, useWebFrame, type WebFrameController } from './WebView.tsx'

const roots: ReturnType<typeof createRoot>[] = []
afterEach(() => {
  act(() => roots.splice(0).forEach(root => root.unmount()))
  document.body.innerHTML = ''
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
