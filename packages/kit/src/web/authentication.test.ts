// @vitest-environment happy-dom
import { webcrypto } from 'node:crypto'
import { URL as NodeURL } from 'node:url'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defineWebAuthentication, type WebAuthenticationConfiguration } from './authentication.ts'

const appURL = 'https://app.test/app/'
const callbackURL = 'https://app.test/auth/callback'
let authorization: URL
let popup: Window
let exchanged: Parameters<WebAuthenticationConfiguration['exchange']>[0][]
const config = (): WebAuthenticationConfiguration => ({
  id: 'test',
  appURL,
  callbackURL,
  authorizationURL: 'https://idp.test/authorize',
  clientID: 'test-client',
  exchange: async request => {
    exchanged.push(request)
  },
})
function visit(url: string) {
  ;(window as unknown as { happyDOM: { setURL: (url: string) => void } }).happyDOM.setURL(url)
}
function callbackURLFor(url = authorization, response = 'code=one-use-code') {
  return `${callbackURL}?${response}&state=${url.searchParams.get('state')}`
}
beforeEach(() => {
  vi.stubGlobal('URL', NodeURL)
  vi.stubGlobal('crypto', webcrypto)
  visit(appURL)
  localStorage.clear()
  exchanged = []
  let queue = Promise.resolve<unknown>(undefined)
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: (_name: string, action: () => unknown) => {
        const result = queue.then(action)
        queue = result.catch(() => {})
        return result
      },
    },
  })
  popup = {
    closed: false,
    close() {
      Object.defineProperty(this, 'closed', { value: true })
    },
  } as Window
  vi.spyOn(window, 'open').mockImplementation(url => {
    authorization = new URL(String(url))
    return popup
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('completes authorization-code PKCE once and restores a secret-free result in a new document', async () => {
  const authentication = defineWebAuthentication(config())
  const request = await authentication.prepare()
  expect(request.start()).toEqual({ status: 'dispatched', transport: 'popup' })
  expect(authorization.searchParams.get('code_challenge_method')).toBe('S256')
  visit(callbackURLFor())
  expect(await defineWebAuthentication(config()).complete()).toEqual({
    status: 'completed',
    returnURL: appURL,
  })
  expect(location.search).toBe('')
  visit(appURL)
  const restored = defineWebAuthentication(config())
  expect(await restored.resume()).toEqual({ status: 'succeeded' })
  expect(exchanged).toHaveLength(1)
  const challenge = Buffer.from(
    await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(exchanged[0]!.codeVerifier)),
  ).toString('base64url')
  expect(challenge).toBe(authorization.searchParams.get('code_challenge'))
  expect(exchanged[0]!.code).toBe('one-use-code')
  expect(await defineWebAuthentication(config()).resume()).toEqual({ status: 'succeeded' })
  expect(exchanged).toHaveLength(1)
  expect(JSON.stringify(localStorage)).not.toContain(exchanged[0]!.codeVerifier)
  expect(JSON.stringify(localStorage)).not.toContain('one-use-code')
  visit(callbackURLFor())
  expect((await restored.complete()).status).toBe('rejected')
})

it('retains a blocked request for an explicit redirect and rejects a second start', async () => {
  vi.mocked(window.open).mockReturnValue(null)
  const authentication = defineWebAuthentication(config())
  const request = await authentication.prepare()
  expect(request.start()).toEqual({ status: 'unavailable', reason: 'popup-blocked' })
  expect(authentication.getSnapshot().status).toBe('prepared')
  expect(request.start({ transport: 'redirect' })).toEqual({
    status: 'dispatched',
    transport: 'redirect',
  })
  expect(request.start()).toEqual({ status: 'unavailable', reason: 'already-started' })
})

it('does not mistake a closed or COOP-severed popup for successful authentication', async () => {
  const authentication = defineWebAuthentication(config())
  ;(await authentication.prepare()).start()
  Object.defineProperty(popup, 'closed', { value: true })
  expect(await authentication.resume()).toMatchObject({ status: 'pending', needsReturn: true })
  authentication.cancel()
  expect(authentication.getSnapshot()).toEqual({ status: 'cancelled' })
  visit(callbackURLFor())
  expect((await authentication.complete()).status).toBe('rejected')
  expect(exchanged).toEqual([])
})

it('rejects forged state, ambiguous responses and callbacks on an app route', async () => {
  const authentication = defineWebAuthentication(config())
  ;(await authentication.prepare()).start()
  visit(`${callbackURL}?state=${'a'.repeat(43)}&code=forged`)
  expect((await authentication.complete()).status).toBe('rejected')
  visit(callbackURLFor(authorization, 'code=one&code=two'))
  expect((await authentication.complete()).status).toBe('rejected')
  visit(callbackURLFor().replace('/auth/callback', '/app/'))
  expect((await authentication.complete()).status).toBe('rejected')
  expect((await authentication.resume()).status).toBe('pending')
  expect(exchanged).toEqual([])
})

it('expires a pending transaction and treats provider denial as cancellation', async () => {
  const authentication = defineWebAuthentication({ ...config(), timeoutMs: 10_000 })
  ;(await authentication.prepare()).start()
  visit(callbackURLFor(authorization, 'error=access_denied'))
  await authentication.complete()
  visit(appURL)
  expect(await authentication.resume()).toEqual({ status: 'cancelled' })
  ;(await authentication.prepare()).start()
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 11_000)
  expect(await authentication.resume()).toEqual({ status: 'expired' })
})

it('serializes two resumed documents so a durable callback is exchanged once', async () => {
  const authentication = defineWebAuthentication(config())
  ;(await authentication.prepare()).start()
  visit(callbackURLFor())
  await authentication.complete()
  visit(appURL)
  const states = await Promise.all([
    authentication.resume(),
    defineWebAuthentication(config()).resume(),
  ])
  expect(states).toEqual([{ status: 'succeeded' }, { status: 'succeeded' }])
  expect(exchanged).toHaveLength(1)
})

it('keeps cancellation final when an exchange ignores its abort signal', async () => {
  let release!: () => void
  const pending = new Promise<void>(resolve => {
    release = resolve
  })
  const authentication = defineWebAuthentication({
    ...config(),
    exchange: async () => {
      await pending
    },
  })
  ;(await authentication.prepare()).start()
  visit(callbackURLFor())
  await authentication.complete()
  visit(appURL)
  const result = authentication.resume()
  await vi.waitFor(() => expect(authentication.getSnapshot().status).toBe('completing'))
  authentication.cancel()
  release()
  expect(await result).toEqual({ status: 'cancelled' })
})

it('uses a validated server bridge response when the callback lost its local storage and opener', async () => {
  let response: unknown = null
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body)
      if (body.operation === 'complete') response = body.response
      return new Response(JSON.stringify(body.operation === 'read' ? response : { accepted: true }))
    }),
  )
  const configuration = { ...config(), bridgeURL: 'https://app.test/auth/bridge' }
  const authentication = defineWebAuthentication(configuration)
  ;(await authentication.prepare()).start()
  const durable = localStorage.getItem('satin:web-auth:test')!
  localStorage.clear()
  visit(callbackURLFor())
  expect((await defineWebAuthentication(configuration).complete()).status).toBe('completed')
  localStorage.setItem('satin:web-auth:test', durable)
  visit(appURL)
  expect(await authentication.resume()).toEqual({ status: 'succeeded' })
  expect(exchanged).toHaveLength(1)
})

it('rejects insecure endpoints and callback documents inside the installed app scope', () => {
  expect(() =>
    defineWebAuthentication({ ...config(), authorizationURL: 'javascript:alert(1)' }),
  ).toThrow()
  expect(() => defineWebAuthentication({ ...config(), callbackURL: `${appURL}callback` })).toThrow()
  expect(() =>
    defineWebAuthentication({ ...config(), bridgeURL: 'https://other.test/bridge' }),
  ).toThrow()
})

it('rejects concurrent callback replay before exchanging its first accepted response', async () => {
  const authentication = defineWebAuthentication(config())
  ;(await authentication.prepare()).start()
  visit(callbackURLFor())
  const results = await Promise.all([
    authentication.complete(),
    defineWebAuthentication(config()).complete(),
  ])
  expect(results.map(result => result.status).sort()).toEqual(['completed', 'rejected'])
  visit(appURL)
  expect(await authentication.resume()).toEqual({ status: 'succeeded' })
  expect(exchanged).toHaveLength(1)
})

it('does not consume a callback when the server refuses to acknowledge bridge acceptance', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ accepted: false }))),
  )
  const authentication = defineWebAuthentication({
    ...config(),
    bridgeURL: 'https://app.test/auth/bridge',
  })
  visit(`${callbackURL}?state=${'a'.repeat(43)}&code=unaccepted`)
  expect(await authentication.complete()).toEqual({
    status: 'unavailable',
    reason: 'bridge-unavailable',
  })
  expect(location.search).toContain('code=unaccepted')
})

it('allows a fresh dispatch after a browser throws before opening its popup', async () => {
  const authentication = defineWebAuthentication(config())
  const request = await authentication.prepare()
  vi.mocked(window.open).mockImplementationOnce(() => {
    throw new Error('Navigation blocked')
  })
  expect(request.start()).toEqual({
    status: 'unavailable',
    reason: 'storage-or-navigation-unavailable',
  })
  expect(authentication.getSnapshot().status).toBe('prepared')
  expect(request.start()).toEqual({ status: 'dispatched', transport: 'popup' })
})
