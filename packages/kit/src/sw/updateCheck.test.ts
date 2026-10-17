import { afterEach, expect, it, vi } from 'vitest'
import { checkAppShellUpdate, subscribeAppShellChecks } from './updateCheck.ts'
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})
it('records all checks per exact registration scope only in enabled builds', async () => {
  vi.stubEnv('SATIN_DEV_MENU', '1')
  const first = vi.fn()
  const other = vi.fn()
  const stop = subscribeAppShellChecks('https://app.test/app/', first)
  const stopOther = subscribeAppShellChecks('https://app.test/other/', other)
  const update = vi.fn().mockResolvedValue(undefined)
  const registration = {
    scope: 'https://app.test/app/',
    update,
  } as unknown as ServiceWorkerRegistration
  await checkAppShellUpdate(registration)
  expect(first).toHaveBeenCalledWith(expect.any(Number))
  expect(other).not.toHaveBeenCalled()
  const late = vi.fn()
  const stopLate = subscribeAppShellChecks(registration.scope, late)
  expect(late).toHaveBeenCalledWith(first.mock.calls[0]![0])
  stop()
  stopOther()
  stopLate()
  vi.stubEnv('SATIN_DEV_MENU', '')
  await checkAppShellUpdate(registration)
  expect(first).toHaveBeenCalledTimes(1)
  expect(update).toHaveBeenCalledTimes(2)
})
