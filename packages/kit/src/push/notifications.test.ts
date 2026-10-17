import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPushNotifications, setAppBadge } from './notifications.ts'
import type { AppDefinition } from '../app/definition.ts'
vi.mock('../app/runtime.ts', () => ({
  registerDefinedAppShell: vi.fn(async () => ({
    registration: { pushManager: (window as Window & { pushManager?: PushManager }).pushManager },
  })),
}))
const key = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 1)]).toString('base64url')
function setup(permission: NotificationPermission = 'default') {
  let current: any = null
  const server = {
    upsertSubscription: vi.fn().mockResolvedValue({ revision: '1' }),
    removeSubscription: vi.fn().mockResolvedValue(undefined),
  }
  const subscription = {
    endpoint: 'https://web.push.apple.com/Qtest',
    options: { applicationServerKey: Uint8Array.from(Buffer.from(key, 'base64url')).buffer },
    getKey: (name: string) => new Uint8Array(name === 'auth' ? 16 : 65).buffer,
    unsubscribe: vi.fn(async () => {
      current = null
      return true
    }),
  }
  const manager = {
    getSubscription: vi.fn(async () => current),
    subscribe: vi.fn(async () => {
      current = subscription
      return subscription
    }),
  }
  const notification = {
    permission,
    requestPermission: vi.fn(async () => {
      notification.permission = 'granted'
      return 'granted'
    }),
  }
  vi.stubGlobal('window', { isSecureContext: true, pushManager: manager })
  vi.stubGlobal('Notification', notification)
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  vi.stubGlobal('navigator', { userActivation: { isActive: true } })
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() })
  const controller = createPushNotifications({
    app: { id: '/test', scope: '/' } as AppDefinition,
    applicationServerKey: key,
    server,
  })
  return {
    controller,
    server,
    manager,
    notification,
    subscription,
    setCurrent: (value: unknown) => {
      current = value
    },
  }
}
afterEach(() => vi.unstubAllGlobals())
describe('push browser adapter', () => {
  it('never prompts during launch reconciliation or before education', async () => {
    const { controller, notification, manager } = setup()
    await controller.reconcile()
    await controller.enable()
    expect(notification.requestPermission).not.toHaveBeenCalled()
    expect(manager.subscribe).not.toHaveBeenCalled()
    controller.educate()
    const enabling = controller.enable()
    expect(notification.requestPermission).toHaveBeenCalledTimes(1) // synchronous gesture chain
    await enabling
    expect(controller.getSnapshot().status).toBe('subscribed')
  })
  it('requires active gesture and never retries denied permission', async () => {
    const { controller, notification } = setup('denied')
    await controller.reconcile()
    controller.educate()
    await controller.enable()
    expect(controller.getSnapshot().status).toBe('denied')
    expect(notification.requestPermission).not.toHaveBeenCalled()
    notification.permission = 'default'
    await controller.reconcile()
    vi.stubGlobal('navigator', { userActivation: { isActive: false } })
    await controller.enable()
    expect(notification.requestPermission).not.toHaveBeenCalled()
  })
  it('retries failed handoff without another prompt and removes missing subscriptions', async () => {
    const { controller, server, notification, setCurrent } = setup()
    await controller.reconcile()
    controller.educate()
    server.upsertSubscription.mockRejectedValueOnce(new Error('offline'))
    await controller.enable()
    expect(controller.getSnapshot().status).toBe('rotation-needed')
    await controller.reconcile()
    expect(controller.getSnapshot().status).toBe('subscribed')
    expect(notification.requestPermission).toHaveBeenCalledTimes(1)
    setCurrent(null)
    await controller.reconcile()
    expect(controller.getSnapshot().status).toBe('revoked')
    expect(server.removeSubscription).toHaveBeenCalledWith({
      endpoint: 'https://web.push.apple.com/Qtest',
      reason: 'subscription-missing',
    })
  })
  it('does not auto-subscribe when the application server key changes', async () => {
    const { controller, subscription, setCurrent, manager } = setup('granted')
    setCurrent({ ...subscription, options: { applicationServerKey: new Uint8Array(65).buffer } })
    await controller.reconcile()
    expect(controller.getSnapshot().status).toBe('rotation-needed')
    expect(manager.subscribe).not.toHaveBeenCalled()
    expect(subscription.unsubscribe).not.toHaveBeenCalled()
  })
  it('unsubscribes and retries server cleanup after network failure', async () => {
    const { controller, server, subscription } = setup()
    await controller.reconcile()
    controller.educate()
    await controller.enable()
    server.removeSubscription.mockRejectedValueOnce(new Error('offline'))
    await controller.unsubscribe()
    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1)
    expect(controller.getSnapshot().status).toBe('rotation-needed')
    await controller.reconcile()
    expect(server.removeSubscription).toHaveBeenCalledTimes(2)
    expect(controller.getSnapshot().subscription).toBeNull()
  })
  it('rejects tab contexts and reports badge visibility honestly', async () => {
    const { controller } = setup()
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    await controller.reconcile()
    expect(controller.getSnapshot().status).toBe('unsupported')
    expect(await setAppBadge(3)).toBe('unavailable')
    vi.stubGlobal('navigator', {
      setAppBadge: vi.fn().mockResolvedValue(undefined),
      clearAppBadge: vi.fn().mockResolvedValue(undefined),
    })
    expect(await setAppBadge(3)).toBe('applied-visibility-unknown')
    expect(await setAppBadge('clear')).toBe('applied-visibility-unknown')
    await expect(setAppBadge(-1)).rejects.toThrow()
  })
})

it('recovers an expired server endpoint only after an explicit Enable gesture', async () => {
  const { controller, server, subscription, manager } = setup('granted')
  await controller.reconcile()
  controller.educate()
  await controller.enable()
  server.upsertSubscription.mockRejectedValueOnce(
    Object.assign(new Error('expired'), { code: 'subscription-expired' }),
  )
  await controller.reconcile()
  expect(controller.getSnapshot().status).toBe('rotation-needed')
  expect(subscription.unsubscribe).not.toHaveBeenCalled()
  await controller.enable()
  expect(subscription.unsubscribe).toHaveBeenCalledTimes(1)
  expect(manager.subscribe).toHaveBeenCalledTimes(2)
})
