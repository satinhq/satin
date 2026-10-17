// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ReachabilityProvider, ReachabilityRoute, type OfflinePresentationProps } from './react.tsx'
import type { ReachabilityProfile, ReachabilitySurface } from './model.ts'

let root: Root
let container: HTMLDivElement
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('navigator', { onLine: false })
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('Offline probe must not fetch'))),
  )
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function profile(surface: ReachabilitySurface): ReachabilityProfile {
  return {
    connectivity: 'server',
    reachability: {
      defaultRoutePolicy: 'requires-server',
      probe: { url: 'https://satin.test/health', method: 'GET', timeoutMs: 100 },
      routes: {},
      surfaces: { localFirst: 'banner', requiresServer: surface },
    },
  }
}

it.each(['full-screen', 'banner', 'none'] as const)(
  'keeps route content mounted and blocks its interaction only for the %s offline presentation',
  async surface => {
    await act(async () =>
      root.render(
        <ReachabilityProvider profile={profile(surface)}>
          <ReachabilityRoute route="inbox">
            <button>Existing route action</button>
          </ReachabilityRoute>
        </ReachabilityProvider>,
      ),
    )
    const content = container.querySelector('[data-satin-route-content]')
    expect(content?.textContent).toContain('Existing route action')
    expect(content?.hasAttribute('inert')).toBe(surface === 'full-screen')
    expect(container.textContent?.includes('You’re offline')).toBe(surface !== 'none')
    expect(fetch).not.toHaveBeenCalled()
  },
)

it('provides the offline reason, retry state and back action to the consumer presentation', async () => {
  const goBack = vi.fn()
  const presented = vi.fn()
  function Presentation(props: OfflinePresentationProps) {
    presented(props)
    return (
      <aside>
        <button data-retry onClick={props.recheck}>
          Retry
        </button>
        <button data-back onClick={props.goBack}>
          Back
        </button>
      </aside>
    )
  }
  await act(async () =>
    root.render(
      <ReachabilityProvider profile={profile('full-screen')} offlinePresentation={Presentation}>
        <ReachabilityRoute route="inbox" goBack={goBack}>
          Inbox
        </ReachabilityRoute>
      </ReachabilityProvider>,
    ),
  )
  expect(presented.mock.lastCall?.[0]).toMatchObject({
    reason: 'device-offline',
    surface: 'full-screen',
    checking: false,
    goBack,
    recheck: expect.any(Function),
  })
  await act(async () => container.querySelector<HTMLButtonElement>('[data-retry]')!.click())
  expect(fetch).not.toHaveBeenCalled()
  expect(container.querySelector('[data-satin-route-content]')?.hasAttribute('inert')).toBe(true)
  await act(async () => container.querySelector<HTMLButtonElement>('[data-back]')!.click())
  expect(goBack).toHaveBeenCalledOnce()
})

it('keeps local app content interactive without an offline presentation even when the device is offline', async () => {
  const onAction = vi.fn()
  await act(async () =>
    root.render(
      <ReachabilityProvider profile={{ connectivity: 'local' }}>
        <ReachabilityRoute route="notes">
          <button onClick={onAction}>Edit notes</button>
        </ReachabilityRoute>
      </ReachabilityProvider>,
    ),
  )
  expect(container.querySelector('[data-satin-route-content]')?.hasAttribute('inert')).toBe(false)
  await act(async () => container.querySelector('button')!.click())
  expect(onAction).toHaveBeenCalledOnce()
  expect(container.textContent).toBe('Edit notes')
  expect(fetch).not.toHaveBeenCalled()
})
