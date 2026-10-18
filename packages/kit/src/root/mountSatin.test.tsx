import { setupPrelaunch, prelaunchDOM } from '../app/prelaunch.test-helper.ts'
// @vitest-environment happy-dom
import { useLayoutEffect } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { mountSatin } from './mountSatin.ts'

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

function Broken(): null {
  useLayoutEffect(() => {
    throw new Error('glassEffectID and union require a namespace.')
  }, [])
  return null
}

it('turns an app that crashes while mounting into a visible failure, not an endless launch cover', () => {
  const reported = vi.fn()
  vi.stubGlobal('reportError', reported)
  document.body.innerHTML =
    '<div id="satin-launch-screen"><div class="satin-launch-icon"><img src="data:,icon"></div></div><div id="root"></div>'
  const root = document.getElementById('root')!
  setupPrelaunch()
  mountSatin(root, <Broken />)
  // React unmounted the tree: nothing of the app is left under the launch cover.
  expect(root.childElementCount).toBe(0)
  const failure = prelaunchDOM.querySelector<HTMLElement>('#satin-launch-error')
  expect(failure?.getAttribute('role')).toBe('alert')
  expect(failure?.textContent).toContain('App Failed to Start')
  expect(failure?.textContent).toContain('glassEffectID and union require a namespace.')
  expect(reported).toHaveBeenCalledOnce()
  vi.unstubAllGlobals()
})

it('mounts app content immediately while managed styles are pending', async () => {
  setupPrelaunch()
  document.body.innerHTML = '<link data-satin-style="all"><div id="root"></div>'
  const link = document.querySelector('link')!
  const mounted = vi.fn()
  function App() {
    useLayoutEffect(mounted, [])
    return <p>Ready</p>
  }
  const root = mountSatin(document.getElementById('root')!, <App />)
  expect(mounted).toHaveBeenCalledOnce()
  link.dispatchEvent(new Event('load'))
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(mounted).toHaveBeenCalledOnce()
  root.unmount()
})

it('does not remount an app when a stylesheet finishes after unmount', async () => {
  setupPrelaunch()
  document.body.innerHTML = '<link data-satin-style="all"><div id="root"></div>'
  const mounted = vi.fn()
  function App() {
    useLayoutEffect(mounted, [])
    return null
  }
  const root = mountSatin(document.getElementById('root')!, <App />)
  expect(mounted).toHaveBeenCalledOnce()
  root.unmount()
  mounted.mockClear()
  document.querySelector('link')!.dispatchEvent(new Event('load'))
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(mounted).not.toHaveBeenCalled()
})

it('does not hold app mounting behind delayed framework rules', () => {
  setupPrelaunch()
  document.head.querySelector('[data-test-framework-styles]')!.remove()
  document.body.innerHTML = '<link data-satin-style="all"><div id="root"></div>'
  const container = document.getElementById('root')!
  const root = mountSatin(container, <span>Measured app content</span>)
  try {
    expect(container.textContent).toBe('Measured app content')
  } finally {
    root.unmount()
  }
})
