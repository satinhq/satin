import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createPushRelayAdapter, type PushSubscriptionPayload } from './notifications.ts'

const subscription: PushSubscriptionPayload = {
  endpoint: 'https://push.apple.test/subscription',
  p256dh: 'public-key',
  auth: 'authentication',
  applicationServerKey: 'application-key',
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(AbortSignal, 'timeout').mockReturnValue(new AbortController().signal)
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it.each([
  'http://relay.test',
  'https://user@localhost',
  'https://user:secret@localhost',
  'https://relay.test?token=secret',
  'https://relay.test#fragment',
])('rejects unsafe relay URL %s before fetching or requesting a token', url => {
  const fetcher = vi.fn()
  const token = vi.fn(() => 'token')
  vi.stubGlobal('fetch', fetcher)
  expect(() => createPushRelayAdapter({ url, token })).toThrow('trusted HTTPS relay URL')
  expect(fetcher).not.toHaveBeenCalled()
  expect(token).not.toHaveBeenCalled()
})

it('posts the complete subscription to the relay subpath with a freshly resolved bearer token', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json({ saved: true }))
  vi.stubGlobal('fetch', fetcher)
  const token = vi.fn().mockResolvedValueOnce('first-token').mockResolvedValueOnce('second-token')
  const adapter = createPushRelayAdapter({ url: 'https://relay.test/v1', token })
  const input = { subscription, replacesEndpoint: 'https://push.apple.test/previous' }
  expect(await adapter.upsertSubscription(input)).toEqual({ saved: true })
  await adapter.sendTest()
  expect(fetcher).toHaveBeenNthCalledWith(
    1,
    new URL('https://relay.test/v1/subscriptions'),
    expect.objectContaining({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer first-token',
      },
      body: JSON.stringify(input),
    }),
  )
  expect(fetcher).toHaveBeenNthCalledWith(
    2,
    new URL('https://relay.test/v1/test'),
    expect.objectContaining({
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer second-token',
      },
      body: '{}',
    }),
  )
  expect(token).toHaveBeenCalledTimes(2)
})

it.each([
  [409, 'subscription-expired'],
  [401, 'relay-unavailable'],
  [503, 'relay-unavailable'],
] as const)(
  'reports relay HTTP %i as %s so consumers can choose recovery',
  async (status, code) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('Rejected', { status })),
    )
    const adapter = createPushRelayAdapter({ url: 'https://relay.test/', token: () => 'token' })
    await expect(
      adapter.upsertSubscription({ subscription, replacesEndpoint: null }),
    ).rejects.toMatchObject({ code })
  },
)

it('sends the removed endpoint and reason to unsubscribe and waits for its acknowledgement', async () => {
  let acknowledge!: (response: Response) => void
  const acknowledgement = new Promise<Response>(resolve => {
    acknowledge = resolve
  })
  const fetcher = vi.fn<typeof fetch>(() => acknowledgement)
  vi.stubGlobal('fetch', fetcher)
  const adapter = createPushRelayAdapter({ url: 'https://relay.test/v1/', token: () => 'token' })
  const input = { endpoint: subscription.endpoint, reason: 'user-disabled' }
  const removal = adapter.removeSubscription(input)
  const settled = vi.fn()
  void removal.then(settled, settled)
  await vi.runAllTimersAsync()
  expect(fetcher).toHaveBeenCalledWith(
    new URL('https://relay.test/v1/unsubscribe'),
    expect.objectContaining({ method: 'POST', body: JSON.stringify(input) }),
  )
  expect(settled).not.toHaveBeenCalled()

  acknowledge(Response.json({ removed: true }))
  await expect(removal).resolves.toBeUndefined()
  expect(settled).toHaveBeenCalledOnce()
})

it('propagates a rejected unsubscribe request instead of reporting successful removal', async () => {
  const failure = new TypeError('Relay unavailable')
  const fetcher = vi.fn<typeof fetch>().mockRejectedValue(failure)
  vi.stubGlobal('fetch', fetcher)
  const adapter = createPushRelayAdapter({ url: 'https://relay.test/v1/', token: () => 'token' })
  await expect(
    adapter.removeSubscription({ endpoint: subscription.endpoint, reason: 'user-disabled' }),
  ).rejects.toBe(failure)
})

it('propagates a rejected token without sending an unauthenticated relay request', async () => {
  const fetcher = vi.fn()
  vi.stubGlobal('fetch', fetcher)
  const failure = new Error('Session expired')
  const adapter = createPushRelayAdapter({
    url: 'https://relay.test/',
    token: () => Promise.reject(failure),
  })
  await expect(adapter.sendTest()).rejects.toBe(failure)
  expect(fetcher).not.toHaveBeenCalled()
})
