import { afterEach, expect, it, vi } from 'vitest'
import { RELAUNCH_AFTER_MS, watchReleaseUpdates } from './releaseUpdates.ts'
import {
  APP_SHELL_APPLY_BACKGROUND_UPDATE,
  APP_SHELL_APPLY_COLD_UPDATE,
  APP_SHELL_BUILD_ID_REQUEST,
  APP_SHELL_BUILD_ID_RESPONSE,
} from '../sw/protocol.ts'

function fixture(hidden = false) {
  const page = Object.assign(new EventTarget(), { hidden })
  const active = Object.assign(new EventTarget(), {
    state: 'activated',
    postMessage: (message: { type: string }, ports?: MessagePort[]) => {
      if (message.type === APP_SHELL_BUILD_ID_REQUEST)
        ports?.[0]?.postMessage({ type: APP_SHELL_BUILD_ID_RESPONSE, buildId: 'a' })
    },
  })
  let claim: () => void = () => {}
  const next = Object.assign(new EventTarget(), {
    state: 'installed',
    postMessage: vi.fn((message: { type: string }, ports?: MessagePort[]) => {
      if (message.type === APP_SHELL_BUILD_ID_REQUEST)
        ports?.[0]?.postMessage({ type: APP_SHELL_BUILD_ID_RESPONSE, buildId: 'b' })
      else if (
        message.type === APP_SHELL_APPLY_COLD_UPDATE ||
        message.type === APP_SHELL_APPLY_BACKGROUND_UPDATE
      )
        claim()
    }),
  })
  const registration = Object.assign(new EventTarget(), {
    active,
    waiting: null as typeof next | null,
    installing: null as typeof next | null,
    update: vi.fn(async () => {}),
  })
  const workers = Object.assign(new EventTarget(), {
    controller: active,
    getRegistration: async () => registration,
  })
  const events = Object.assign(new EventTarget(), { location: { reload: vi.fn() } })
  vi.stubGlobal('document', page)
  vi.stubGlobal('window', events)
  vi.stubGlobal('navigator', { onLine: true, serviceWorker: workers })
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('', { status: 404 })),
  )
  const values = new Map<string, string>()
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  })
  claim = () => {
    registration.waiting = null
    registration.active = next
    workers.controller = next
    workers.dispatchEvent(new Event('controllerchange'))
  }
  const visibility = (hidden: boolean) => {
    page.hidden = hidden
    page.dispatchEvent(new Event('visibilitychange'))
  }
  const install = () => {
    registration.installing = next
    registration.dispatchEvent(new Event('updatefound'))
    registration.installing = null
    registration.waiting = next
    next.dispatchEvent(new Event('statechange'))
  }
  return {
    registration,
    next,
    workers,
    events,
    visibility,
    install,
    setClaim: (fn: () => void) => {
      claim = fn
    },
  }
}

let stop: (() => void) | undefined
afterEach(() => {
  stop?.()
  stop = undefined
  vi.unstubAllGlobals()
})

it('keeps a late cold-start download offscreen until suspension, even before input', async () => {
  const host = fixture()
  const observer = watchReleaseUpdates('/app/', () => true)
  stop = observer.dispose
  await vi.waitFor(() => expect(host.registration.update).toHaveBeenCalled())
  host.install()
  await new Promise(resolve => setTimeout(resolve, 25))
  expect(window.location.reload).not.toHaveBeenCalled()
  host.visibility(true)
  await vi.waitFor(() => expect(window.location.reload).toHaveBeenCalledOnce())
  expect(host.workers.controller).toBe(host.next)
})

it('keeps a download that finishes during warm resume until the next suspension', async () => {
  const host = fixture(true)
  const observer = watchReleaseUpdates('/app/', () => true)
  stop = observer.dispose
  await vi.waitFor(() => expect(host.registration.update).toHaveBeenCalled())
  host.visibility(false)
  host.install()
  await new Promise(resolve => setTimeout(resolve, 25))
  expect(window.location.reload).not.toHaveBeenCalled()
  host.visibility(true)
  await vi.waitFor(() => expect(window.location.reload).toHaveBeenCalledOnce())
})

it('protects a warm-resume draft until it is saved at a later suspension', async () => {
  const host = fixture(true)
  let clean = false
  const observer = watchReleaseUpdates('/app/', () => clean)
  stop = observer.dispose
  await vi.waitFor(() => expect(host.registration.update).toHaveBeenCalled())
  host.visibility(false)
  host.install()
  await new Promise(resolve => setTimeout(resolve, 25))
  expect(window.location.reload).not.toHaveBeenCalled()
  clean = true
  host.visibility(true)
  await vi.waitFor(() => expect(window.location.reload).toHaveBeenCalledOnce())
})

it('defers a hidden claim that races foregrounding until the next suspension', async () => {
  const host = fixture(true)
  host.setClaim(() => {
    host.visibility(false)
    host.registration.waiting = null
    host.registration.active = host.next
    host.workers.controller = host.next
    host.workers.dispatchEvent(new Event('controllerchange'))
  })
  const observer = watchReleaseUpdates('/app/', () => true)
  stop = observer.dispose
  await vi.waitFor(() => expect(host.registration.update).toHaveBeenCalled())
  host.install()
  await vi.waitFor(() => expect(host.workers.controller).toBe(host.next))
  expect(window.location.reload).not.toHaveBeenCalled()
  host.visibility(true)
  await vi.waitFor(() => expect(window.location.reload).toHaveBeenCalledOnce())
})

it('does not replace visible content on duplicate visibility events or reconnect', async () => {
  const host = fixture()
  const observer = watchReleaseUpdates('/app/', () => true)
  stop = observer.dispose
  await vi.waitFor(() => expect(host.registration.update).toHaveBeenCalled())
  host.visibility(false)
  host.events.dispatchEvent(new Event('online'))
  host.install()
  await new Promise(resolve => setTimeout(resolve, 25))
  expect(window.location.reload).not.toHaveBeenCalled()
  host.visibility(true)
  await vi.waitFor(() => expect(window.location.reload).toHaveBeenCalledOnce())
})

it('disposes in-flight eligibility and download listeners without replacing the app', async () => {
  const host = fixture()
  const observer = watchReleaseUpdates('/app/', () => true)
  await vi.waitFor(() => expect(host.registration.update).toHaveBeenCalled())
  observer.dispose()
  host.install()
  host.visibility(true)
  host.events.dispatchEvent(new Event('online'))
  await new Promise(resolve => setTimeout(resolve, 25))
  expect(window.location.reload).not.toHaveBeenCalled()
})

it('treats a clean fifteen-minute suspension as a relaunch but preserves a draft', () => {
  const host = fixture()
  let clean = false
  const observer = watchReleaseUpdates('/app/', () => clean)
  stop = observer.dispose
  const now = vi.spyOn(Date, 'now')
  now.mockReturnValue(1000)
  host.visibility(true)
  now.mockReturnValue(1000 + RELAUNCH_AFTER_MS)
  host.visibility(false)
  expect(window.location.reload).not.toHaveBeenCalled()
  host.visibility(true)
  clean = true
  now.mockReturnValue(1000 + 2 * RELAUNCH_AFTER_MS)
  host.visibility(false)
  expect(window.location.reload).toHaveBeenCalledOnce()
  now.mockRestore()
})
