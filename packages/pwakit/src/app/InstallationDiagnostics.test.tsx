// @vitest-environment happy-dom
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { afterEach, expect, it } from 'vitest'
import { InstallationDiagnostics, readInstallationFailure } from './InstallationDiagnostics.tsx'

afterEach(() => localStorage.clear())
it('shows the failed update resource and reason from the Settings Diagnostics entry', async () => {
  localStorage.setItem(
    'satin-install-failure:/app/',
    JSON.stringify({
      buildId: 'broken',
      url: '/secondary.js',
      reason: 'HTTP 404',
      networkFailure: false,
    }),
  )
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  try {
    await act(async () => root.render(<InstallationDiagnostics scope="/app/" />))
    await act(async () => container.querySelector<HTMLButtonElement>('button')!.click())
    expect(container.textContent).toContain('/secondary.js')
    expect(container.textContent).toContain('HTTP 404')
    expect(readInstallationFailure('/other/')).toBeNull()
  } finally {
    await act(async () => root.unmount())
    container.remove()
  }
})

it('refreshes a failed build to the successful build without a stale failure', async () => {
  localStorage.setItem(
    'satin-install-failure:/app/',
    JSON.stringify({
      buildId: 'broken',
      url: '/secondary.js',
      reason: 'fetch failed',
      networkFailure: true,
      recordedAt: 10,
    }),
  )
  const container = document.createElement('div')
  const root = createRoot(container)
  try {
    await act(async () => root.render(<InstallationDiagnostics scope="/app/" />))
    await act(async () => container.querySelector<HTMLButtonElement>('button')!.click())
    expect(container.textContent).toContain('Failed')
    expect(container.textContent).toContain('Check your connection')
    localStorage.setItem(
      'satin-install-success:/app/',
      JSON.stringify({ buildId: 'repaired', recordedAt: 20 }),
    )
    await act(async () => window.dispatchEvent(new Event('satin-install-diagnostics')))
    expect(container.textContent).toContain('Ready')
    expect(container.textContent).toContain('repaired')
    expect(container.textContent).not.toContain('Failed')
    expect(container.textContent).not.toContain('/secondary.js')
  } finally {
    await act(async () => root.unmount())
  }
})

it.each([
  ['same-build', undefined, undefined, false],
  ['newer-failure', 30, 20, true],
  ['newer-success', 10, 20, false],
])(
  'resolves coexisting diagnostic records for %s',
  (scenario, failureTime, successTime, failed) => {
    localStorage.setItem(
      'satin-install-failure:/app/',
      JSON.stringify({
        buildId: 'build',
        url: '/failed.js',
        reason: 'HTTP 404',
        networkFailure: false,
        recordedAt: failureTime,
      }),
    )
    localStorage.setItem(
      'satin-install-success:/app/',
      JSON.stringify({
        buildId: scenario === 'same-build' ? 'build' : 'other-build',
        recordedAt: successTime,
      }),
    )
    expect(readInstallationFailure('/app/') !== null).toBe(failed)
  },
)
