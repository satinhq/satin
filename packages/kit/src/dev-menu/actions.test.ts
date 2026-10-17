import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { registerAppShell } from '../sw/registerAppShell.ts'
import type { SatinAppShellRegistration } from '../sw/registerAppShell.ts'
import { createDevMenuActions } from './actions.ts'

vi.mock('../sw/registerAppShell.ts', () => ({ registerAppShell: vi.fn() }))
beforeEach(() => {
  vi.stubGlobal('location', { origin: 'https://app.test' })
  vi.stubGlobal('navigator', {
    get onLine() {
      return true
    },
  })
  vi.mocked(registerAppShell).mockResolvedValue({ waiting: null } as SatinAppShellRegistration)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
function fixture() {
  const reload = vi.fn()
  const checked = vi.fn()
  const shell = {
    registration: {
      scope: new URL('/app/', location.origin).href,
      update: vi.fn().mockResolvedValue(undefined),
      unregister: vi.fn().mockResolvedValue(true),
    },
    refresh: vi.fn().mockResolvedValue({ current: 'A', waiting: 'B' }),
    applyUpdate: vi.fn().mockResolvedValue(true),
    dispose: vi.fn(),
  }
  const actions = createDevMenuActions({
    shell: shell as unknown as SatinAppShellRegistration,
    scope: '/app/',
    reload,
    checked,
  })
  return { actions, shell, reload, checked }
}
it('reloads only on request', () => {
  const { actions, reload } = fixture()
  expect(reload).not.toHaveBeenCalled()
  actions.reload()
  expect(reload).toHaveBeenCalledTimes(1)
})
it('checks the network then refreshes IDs and records the attempt', async () => {
  const { actions, shell, checked } = fixture()
  await expect(actions.check()).resolves.toEqual({ current: 'A', waiting: 'B' })
  expect(shell.registration.update).toHaveBeenCalledTimes(1)
  expect(shell.refresh).toHaveBeenCalledTimes(1)
  expect(checked).toHaveBeenCalledWith(expect.any(Number))
})
it('uses existing explicit activation with no second reload', async () => {
  const { actions, shell, reload } = fixture()
  await actions.apply()
  expect(shell.applyUpdate).toHaveBeenCalledTimes(1)
  expect(reload).not.toHaveBeenCalled()
})
it('reports absent or refused waiting update', async () => {
  const { actions, shell } = fixture()
  shell.applyUpdate.mockResolvedValue(false)
  await expect(actions.apply()).rejects.toThrow('No waiting update')
})
it('requires force confirmation', async () => {
  const { actions, shell } = fixture()
  await expect(actions.force(false)).resolves.toBe(false)
  expect(shell.registration.unregister).not.toHaveBeenCalled()
})
it('keeps cached builds when offline or deployment is broken', async () => {
  const { actions, shell } = fixture()
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  await expect(actions.force(true)).rejects.toThrow('network')
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
  await expect(actions.force(true)).rejects.toThrow('Cached build retained')
  expect(shell.registration.unregister).not.toHaveBeenCalled()
})
it('clears only exact app-scope shell caches, registers a fresh worker, and reloads once', async () => {
  const { actions, shell, reload } = fixture()
  const scope = shell.registration.scope
  const owned = ':satin:app-shell:v2:' + encodeURIComponent(scope) + ':old'
  const bindings = ':satin:app-shell-clients:v1:' + encodeURIComponent(scope)
  const remove = vi.fn().mockResolvedValue(true)
  vi.stubGlobal('caches', {
    keys: vi
      .fn()
      .mockResolvedValue([owned, bindings, 'app-data', ':satin:app-shell:v2:sibling:old']),
    delete: remove,
  })
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ buildId: 'B' }) }),
  )
  const registration = new EventTarget() as EventTarget & Record<string, unknown>
  Object.assign(registration, { scope, active: null, installing: null, waiting: null })
  const register = vi.fn().mockImplementation(async () => {
    Object.assign(registration, { active: { state: 'activated', postMessage: vi.fn() } })
    return registration
  })
  vi.stubGlobal('navigator', {
    onLine: true,
    serviceWorker: Object.assign(new EventTarget(), { register, controller: null }),
  })
  await actions.force(true)
  expect(remove.mock.calls).toEqual([[owned], [bindings]])
  expect(register).toHaveBeenCalledWith(new URL('sw.js', scope).href, {
    scope,
    updateViaCache: 'none',
  })
  expect(shell.dispose).toHaveBeenCalledTimes(1)
  expect(reload).toHaveBeenCalledTimes(1)
})
it('rejects registration scope mismatch before changing caches', async () => {
  const { actions, shell } = fixture()
  shell.registration.scope = new URL('/other/', location.origin).href
  await expect(actions.force(true)).rejects.toThrow('scope')
  expect(shell.registration.unregister).not.toHaveBeenCalled()
})
