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
  mountSatin(root, <Broken />)
  // React unmounted the tree: nothing of the app is left under the launch cover.
  expect(root.childElementCount).toBe(0)
  const failure = document.querySelector<HTMLElement>('[data-satin-app-failure]')
  expect(failure?.getAttribute('role')).toBe('alert')
  expect(failure?.dataset.satinLaunchError).toBe('true')
  expect(failure?.textContent).toContain('App Failed to Start')
  expect(failure?.textContent).toContain('glassEffectID and union require a namespace.')
  expect(Number(failure?.style.zIndex)).toBeGreaterThan(0)
  expect(reported).toHaveBeenCalledOnce()
  vi.unstubAllGlobals()
})
