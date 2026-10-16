import { expect, it, vi } from 'vitest'
import { worker } from '../../test/pushHarness.ts'
import { encodePushRoute } from '../push/routes.ts'
const target = (id = 'one') =>
  encodePushRoute(
    'https://app.test/app/',
    { screen: 'detail', params: { id } },
    { detail: { params: ['id'] } },
    id,
  )
const windowClient = (id = 'client') => ({
  id,
  url: 'https://app.test/app/',
  postMessage: vi.fn(),
  focus: vi.fn(),
  navigate: vi.fn(),
})
it('classic delivery always displays without an OS navigation URL', async () => {
  const { dispatch, registration, navigator } = worker()
  await dispatch('push', {
    data: {
      json: () => {
        throw new Error('bad JSON')
      },
    },
  })
  await dispatch('push', {
    data: {
      json: () => ({
        satin_push: 1,
        routeURL: target(),
        notification: { title: 'Hello', body: 'Read me' },
        app_badge: '3',
      }),
    },
  })
  expect(registration.showNotification).toHaveBeenNthCalledWith(
    1,
    'New notification',
    expect.objectContaining({ data: { url: null } }),
  )
  expect(registration.showNotification).toHaveBeenLastCalledWith('Hello', {
    body: 'Read me',
    data: { url: target() },
  })
  expect(navigator.setAppBadge).toHaveBeenCalledWith(3)
  // Old/external declarative messages must use the platform fallback. WebKit
  // rejects re-show without navigate, so never pretend this converts them.
  await dispatch('push', {
    notification: { title: 'Mutable', body: 'Fallback input', navigate: target() },
    appBadge: 2,
  })
  expect(registration.showNotification).toHaveBeenCalledTimes(2)
})
it('a suspended/uncontrolled warm client claims the persisted tap after worker restart, without navigation', async () => {
  const first = worker(),
    client = windowClient()
  first.clients.matchAll.mockResolvedValue([client])
  await first.dispatch('notificationclick', {
    notification: { close: vi.fn(), data: { url: target() } },
  })
  expect(client.focus).toHaveBeenCalledTimes(1)
  expect(client.navigate).not.toHaveBeenCalled()
  expect(first.clients.openWindow).not.toHaveBeenCalled()
  expect(first.clients.matchAll).toHaveBeenCalledWith({ type: 'window', includeUncontrolled: true })
  const resumed = worker(first.caches)
  resumed.clients.matchAll.mockResolvedValue([client])
  await resumed.dispatch('message', { source: client, data: { type: 'SATIN_PUSH_CLAIM' } })
  expect(client.postMessage).toHaveBeenLastCalledWith({
    type: 'SATIN_PUSH_ROUTE',
    id: 'one',
    url: target(),
  })
  // Missing/negative page acceptance leaves it in the inbox, not a navigation timeout.
  await resumed.dispatch('message', { source: client, data: { type: 'SATIN_PUSH_CLAIM' } })
  expect(client.navigate).not.toHaveBeenCalled()
  await resumed.dispatch('message', {
    source: client,
    data: { type: 'SATIN_PUSH_ACK', id: 'one', result: 'accepted' },
  })
  client.postMessage.mockClear()
  await resumed.dispatch('message', { source: client, data: { type: 'SATIN_PUSH_CLAIM' } })
  expect(client.postMessage).not.toHaveBeenCalled()
})
it('only a cold tap opens a window, retaining its route for the launching document', async () => {
  const { dispatch, clients } = worker()
  await dispatch('notificationclick', { notification: { close: vi.fn(), data: { url: target() } } })
  expect(clients.openWindow).toHaveBeenCalledWith(target())
  const client = windowClient()
  clients.matchAll.mockResolvedValue([client])
  await dispatch('message', { source: client, data: { type: 'SATIN_PUSH_CLAIM' } })
  expect(client.postMessage).toHaveBeenCalledWith({
    type: 'SATIN_PUSH_ROUTE',
    id: 'one',
    url: target(),
  })
})
it.each([
  'https://evil.test/app/',
  'https://app.test/outside/',
  'not a URL',
  'https://app.test/app/',
  'https://app.test/app/?satin-push=x&satin-delivery=x',
  'https://u:p@localhost/app/',
])('rejects invalid click URL %s: warm focus only, cold opens only shell', async url => {
  const { dispatch, clients, caches } = worker(),
    client = windowClient()
  clients.matchAll.mockResolvedValueOnce([client])
  await dispatch('notificationclick', { notification: { close: vi.fn(), data: { url } } })
  expect(client.focus).toHaveBeenCalledTimes(1)
  expect(client.postMessage).not.toHaveBeenCalled()
  expect(client.navigate).not.toHaveBeenCalled()
  expect(clients.openWindow).not.toHaveBeenCalled()
  expect(caches.stores.size).toBe(0)
  await dispatch('notificationclick', { notification: { close: vi.fn(), data: { url } } })
  expect(clients.openWindow).toHaveBeenCalledWith('https://app.test/app/')
})
it('a different window cannot consume a pending tap assigned to a live window', async () => {
  const { dispatch, clients } = worker(),
    owner = windowClient('owner'),
    other = windowClient('other')
  clients.matchAll.mockResolvedValue([owner, other])
  await dispatch('notificationclick', { notification: { close: vi.fn(), data: { url: target() } } })
  await dispatch('message', {
    source: other,
    data: { type: 'SATIN_PUSH_ACK', id: 'one', result: 'accepted' },
  })
  await dispatch('message', { source: other, data: { type: 'SATIN_PUSH_CLAIM' } })
  expect(other.postMessage).not.toHaveBeenCalled()
  await dispatch('message', { source: owner, data: { type: 'SATIN_PUSH_CLAIM' } })
  expect(owner.postMessage).toHaveBeenLastCalledWith({
    type: 'SATIN_PUSH_ROUTE',
    id: 'one',
    url: target(),
  })
})
it('treats a live document below the app scope as existing, including uncontrolled documents', async () => {
  const { dispatch, clients } = worker(),
    client = windowClient()
  client.url = 'https://app.test/app/another-screen'
  clients.matchAll.mockResolvedValue([client])
  await dispatch('notificationclick', { notification: { close: vi.fn(), data: { url: target() } } })
  expect(client.focus).toHaveBeenCalledOnce()
  expect(client.navigate).not.toHaveBeenCalled()
  expect(clients.openWindow).not.toHaveBeenCalled()
})
