// @vitest-environment happy-dom
import { useLayoutEffect } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { setupPrelaunch, prelaunchDOM } from '../app/prelaunch.test-helper.ts'
import { mountSatin } from './mountSatin.ts'

afterEach(() => {
  document.body.replaceChildren()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it('shows the startup failure before delivering the original error to the consumer callback exactly once', () => {
  setupPrelaunch()
  const failure = new Error('Consumer screen failed')
  const reported = vi.fn()
  vi.stubGlobal('reportError', reported)
  function BrokenScreen(): null {
    useLayoutEffect(() => {
      throw failure
    }, [])
    return null
  }
  const callback = vi.fn((error: unknown, info: { componentStack?: string | null }) => {
    expect(error).toBe(failure)
    expect(info.componentStack).toContain('BrokenScreen')
    expect(prelaunchDOM.querySelector('#satin-launch-error')?.textContent).toContain(
      failure.message,
    )
  })
  const container = document.createElement('div')
  document.body.append(container)
  const root = mountSatin(container, <BrokenScreen />, { onUncaughtError: callback })
  expect(callback).toHaveBeenCalledOnce()
  expect(reported).not.toHaveBeenCalled()
  expect(container.childElementCount).toBe(0)
  expect(prelaunchDOM.querySelector('#satin-launch-error')?.getAttribute('role')).toBe('alert')
  root.unmount()
})
