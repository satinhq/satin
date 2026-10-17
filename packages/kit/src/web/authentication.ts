import { secureWebURL } from './urlPolicy.ts'
import { consumeWebAuthenticationURL } from '../push/urlProjection.ts'

/** The OAuth provider, client, callback and app URLs for `defineWebAuthentication`, and the
 * `exchange` function that finishes sign-in on your server. */
export interface WebAuthenticationConfiguration {
  /** Stable name, unique within this app origin. */
  id: string
  authorizationURL: string
  clientID: string
  /** Dedicated same-origin callback document outside appURL's scope. Never cache it. */
  callbackURL: string
  /** The app's trailing-slash scope URL. */
  appURL: string
  scopes?: readonly string[]
  /** Required for OpenID Connect; the server must verify issuer, audience, signature and nonce. */
  issuer?: string
  timeoutMs?: number
  /** Optional same-origin POST endpoint implementing the documented bridge protocol. */
  bridgeURL?: string
  /** Establish your session on the server. Never return or message tokens to another window. */
  exchange: (request: WebAuthenticationExchange) => Promise<void>
}
/** What `exchange` receives: the authorization code, the PKCE verifier and the values your
 * server needs to redeem and check it. */
export interface WebAuthenticationExchange {
  code: string
  codeVerifier: string
  callbackURL: string
  /** Use this as the server's idempotency key. */
  transactionID: string
  nonce: string
  expectedIssuer?: string
  signal: AbortSignal
}
/** Where a sign-in stands, from `idle` through `pending` and `completing` to a final status. */
export type WebAuthenticationState =
  | { status: 'idle' }
  | { status: 'prepared' | 'pending' | 'completing'; expiresAt: number; needsReturn: boolean }
  | { status: 'succeeded' | 'cancelled' | 'expired' }
  | { status: 'failed' | 'unavailable'; reason: string }
/** Whether `start` opened the provider in a popup or a redirect, or why it could not. */
export type WebAuthenticationStartResult =
  | { status: 'dispatched'; transport: 'popup' | 'redirect' }
  | { status: 'unavailable'; reason: string }
/** The outcome of `complete` on the callback page: the URL to return to, or why it was rejected. */
export type WebAuthenticationCallbackResult =
  | { status: 'completed'; returnURL: string }
  | { status: 'rejected' | 'unavailable'; reason: string }
/** A prepared sign-in. Call `start` from the user's press. */
export interface WebAuthenticationRequest {
  /** Call synchronously in the user's press handler. A blocked popup may retry as redirect. */
  start(options?: { transport?: 'popup' | 'redirect' }): WebAuthenticationStartResult
}
/** A sign-in flow made by `defineWebAuthentication`: prepare, start, complete and resume it, or
 * subscribe to its state. */
export interface WebAuthentication {
  /** Generate PKCE and durably register the transaction before enabling the sign-in button. */
  prepare(): Promise<WebAuthenticationRequest>
  /** Validate and store the callback on the dedicated callback document. */
  complete(): Promise<WebAuthenticationCallbackResult>
  /** Reconcile durable completion on launch, pageshow, focus and return from suspension. */
  resume(): Promise<WebAuthenticationState>
  cancel(): void
  getSnapshot(): WebAuthenticationState
  subscribe(listener: () => void): () => void
  /** Attach bounded popup monitoring and lifecycle listeners. Returns their cleanup. */
  connect(): () => void
}

type Callback = { state: string; code?: string; error?: string }
type Transaction = {
  state: string
  verifier?: string
  nonce?: string
  proof?: string
  binding: string
  authorizationURL?: string
  expiresAt: number
  status: 'prepared' | 'pending' | 'completing' | 'succeeded' | 'cancelled' | 'expired' | 'failed'
  response?: Callback
  reason?: string
}
const terminal = (status: Transaction['status']) =>
  ['succeeded', 'cancelled', 'expired', 'failed'].includes(status)
function randomSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return base64URL(bytes)
}
function base64URL(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
}
function callbackValue(value: unknown, state: string): Callback | null {
  if (!value || typeof value !== 'object') return null
  const response = value as Callback
  if (response.state !== state) return null
  if (
    typeof response.code === 'string' &&
    response.code.length > 0 &&
    response.code.length <= 8192 &&
    response.error === undefined
  )
    return { state, code: response.code }
  if (
    typeof response.error === 'string' &&
    response.error.length > 0 &&
    response.error.length <= 256 &&
    response.code === undefined
  )
    return { state, error: response.error }
  return null
}

/** Sets up an OAuth authorization-code sign-in with PKCE. The transaction is stored durably, so
 * it survives a redirect or a suspended app. Your server redeems the code. */
export function defineWebAuthentication(
  configuration: WebAuthenticationConfiguration,
): WebAuthentication {
  const app = secureWebURL(configuration.appURL, configuration.appURL)
  const callback = secureWebURL(configuration.callbackURL, app.href)
  const authorization = secureWebURL(configuration.authorizationURL, app.href)
  const bridge = configuration.bridgeURL ? secureWebURL(configuration.bridgeURL, app.href) : null
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(configuration.id) || !configuration.clientID)
    throw new Error('Web authentication needs a stable id and clientID')
  if (
    !app.pathname.endsWith('/') ||
    app.search ||
    app.hash ||
    callback.search ||
    callback.hash ||
    callback.origin !== app.origin ||
    callback.pathname.startsWith(app.pathname) ||
    (bridge &&
      (bridge.origin !== app.origin ||
        bridge.search ||
        bridge.hash ||
        bridge.pathname.startsWith(app.pathname)))
  )
    throw new Error(
      'Callback and bridge must be same-origin, outside the app scope, without query or fragment',
    )
  const timeoutMs = configuration.timeoutMs ?? 600_000
  if (!Number.isFinite(timeoutMs) || timeoutMs < 10_000 || timeoutMs > 3_600_000)
    throw new Error('Authentication timeoutMs must be between 10000 and 3600000')
  if (configuration.scopes?.includes('openid') && !configuration.issuer)
    throw new Error('OpenID Connect requires an expected issuer and server token validation')
  const binding = JSON.stringify([
    app.href,
    callback.href,
    authorization.href,
    configuration.clientID,
    configuration.issuer,
  ])
  const key = `satin:web-auth:${configuration.id}`
  const listeners = new Set<() => void>()
  let snapshot: WebAuthenticationState = { status: 'idle' }
  let popup: Window | null = null
  let activeExchange: AbortController | null = null
  let resumeJob: Promise<WebAuthenticationState> | null = null
  let preparing = false
  let generation = 0
  const publish = (state: WebAuthenticationState) => {
    if (JSON.stringify(state) !== JSON.stringify(snapshot)) {
      snapshot = state
      listeners.forEach(listener => listener())
    }
    return snapshot
  }
  const read = (): Transaction | null => {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const transaction = JSON.parse(raw) as Transaction
    if (
      !transaction ||
      transaction.binding !== binding ||
      typeof transaction.state !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(transaction.state) ||
      !Number.isFinite(transaction.expiresAt) ||
      ![
        'prepared',
        'pending',
        'completing',
        'succeeded',
        'cancelled',
        'expired',
        'failed',
      ].includes(transaction.status)
    )
      throw new Error('Invalid authentication storage')
    return transaction
  }
  const save = (transaction: Transaction) => {
    localStorage.setItem(key, JSON.stringify(transaction))
  }
  const describe = (transaction: Transaction): WebAuthenticationState => {
    if (transaction.status === 'failed')
      return { status: 'failed', reason: transaction.reason ?? 'exchange-failed' }
    if (terminal(transaction.status))
      return { status: transaction.status } as WebAuthenticationState
    let needsReturn = false
    try {
      needsReturn = Boolean(popup?.closed)
    } catch {
      needsReturn = true
    }
    return {
      status: transaction.status,
      expiresAt: transaction.expiresAt,
      needsReturn,
    } as WebAuthenticationState
  }
  const bridgeRequest = async (
    operation: string,
    state: string,
    response?: Callback,
    proof?: string,
    proofHash?: string,
  ) => {
    if (!bridge) return null
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)
    try {
      const result = await fetch(bridge.href, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation,
          id: configuration.id,
          state,
          response,
          proof,
          proofHash,
          timeoutMs,
        }),
        signal: controller.signal,
      })
      if (!result.ok) throw new Error('Authentication bridge unavailable')
      const body: unknown = await result.json()
      if (
        operation !== 'read' &&
        (!body || typeof body !== 'object' || (body as { accepted?: unknown }).accepted !== true)
      )
        throw new Error('Authentication bridge did not accept the operation')
      return body
    } finally {
      clearTimeout(timer)
    }
  }
  const finish = (transaction: Transaction, status: Transaction['status'], reason?: string) => {
    const result: Transaction = {
      state: transaction.state,
      binding,
      expiresAt: transaction.expiresAt,
      status,
      reason,
    }
    save(result)
    if (bridge)
      void bridgeRequest('clear', transaction.state, undefined, transaction.proof).catch(() => {})
    return publish(describe(result))
  }
  const reconcile = async (): Promise<WebAuthenticationState> => {
    let transaction = read()
    if (!transaction) return publish({ status: 'idle' })
    if (terminal(transaction.status)) return publish(describe(transaction))
    if (transaction.expiresAt <= Date.now()) return finish(transaction, 'expired')
    let response = callbackValue(transaction.response, transaction.state)
    if (!response && bridge) {
      const delivered = await bridgeRequest('read', transaction.state, undefined, transaction.proof)
      response = callbackValue(delivered, transaction.state)
    }
    // Storage or a bridge response is the completion signal. Closing a popup is not proof.
    const current = read()
    if (!current || current.state !== transaction.state || terminal(current.status))
      return current ? publish(describe(current)) : publish({ status: 'idle' })
    transaction = current
    if (transaction.expiresAt <= Date.now()) return finish(transaction, 'expired')
    response ??= callbackValue(transaction.response, transaction.state)
    if (!response) return publish(describe(transaction))
    if (response.error)
      return finish(
        transaction,
        response.error === 'access_denied' ? 'cancelled' : 'failed',
        'authorization-rejected',
      )
    if (
      !transaction.nonce ||
      !transaction.verifier ||
      !/^[A-Za-z0-9_-]{43}$/.test(transaction.verifier)
    )
      return finish(transaction, 'failed', 'missing-verifier')
    transaction.status = 'completing'
    save(transaction)
    publish(describe(transaction))
    const controller = new AbortController()
    activeExchange = controller
    const timer = setTimeout(
      () => controller.abort(),
      Math.max(0, transaction.expiresAt - Date.now()),
    )
    try {
      await configuration.exchange({
        code: response.code!,
        codeVerifier: transaction.verifier,
        callbackURL: callback.href,
        transactionID: transaction.state,
        nonce: transaction.nonce,
        expectedIssuer: configuration.issuer,
        signal: controller.signal,
      })
      const latest = read()
      if (!latest || latest.state !== transaction.state || terminal(latest.status))
        return latest ? publish(describe(latest)) : publish({ status: 'idle' })
      if (controller.signal.aborted) return finish(latest, 'expired')
      return finish(latest, 'succeeded')
    } catch {
      const latest = read()
      if (latest?.state === transaction.state && terminal(latest.status))
        return publish(describe(latest))
      return finish(
        transaction,
        controller.signal.aborted ? 'expired' : 'failed',
        'exchange-failed',
      )
    } finally {
      clearTimeout(timer)
      if (activeExchange === controller) activeExchange = null
    }
  }
  const resume = (): Promise<WebAuthenticationState> => {
    if (resumeJob) return resumeJob
    if (location.origin !== app.origin)
      return Promise.resolve(publish({ status: 'unavailable', reason: 'wrong-origin' }))
    if (!navigator.locks)
      return Promise.resolve(publish({ status: 'unavailable', reason: 'locks-unavailable' }))
    resumeJob = navigator.locks
      .request(key, reconcile)
      .catch(() => publish({ status: 'unavailable', reason: 'storage-or-bridge-unavailable' }))
      .finally(() => {
        resumeJob = null
      })
    return resumeJob
  }
  const start = (state: string, transport: 'popup' | 'redirect'): WebAuthenticationStartResult => {
    let transaction: Transaction | null = null
    try {
      transaction = read()
      if (
        !transaction ||
        transaction.state !== state ||
        terminal(transaction.status) ||
        !transaction.authorizationURL
      )
        return { status: 'unavailable', reason: 'request-consumed' }
      if (transaction.expiresAt <= Date.now()) {
        finish(transaction, 'expired')
        return { status: 'unavailable', reason: 'request-expired' }
      }
      if (transport !== 'popup' && transport !== 'redirect')
        return { status: 'unavailable', reason: 'invalid-transport' }
      if (transaction.status !== 'prepared')
        return { status: 'unavailable', reason: 'already-started' }
      transaction.status = 'pending'
      save(transaction)
      if (transport === 'popup') {
        popup = window.open(transaction.authorizationURL, '_blank', 'popup')
        if (!popup) {
          transaction.status = 'prepared'
          save(transaction)
          publish(describe(transaction))
          return { status: 'unavailable', reason: 'popup-blocked' }
        }
      } else window.location.assign(transaction.authorizationURL)
      publish(describe(transaction))
      return { status: 'dispatched', transport }
    } catch {
      if (transaction && transaction.state === state && transaction.status === 'pending') {
        try {
          transaction.status = 'prepared'
          save(transaction)
          publish(describe(transaction))
        } catch {
          /* Storage failure is explicit in the action result. */
        }
      }
      return { status: 'unavailable', reason: 'storage-or-navigation-unavailable' }
    }
  }
  return {
    async prepare() {
      if (preparing) throw new Error('Authentication preparation is already running')
      if (location.origin !== app.origin || !navigator.locks)
        throw new Error('Authentication origin or locking is unavailable')
      preparing = true
      const version = ++generation
      try {
        return await navigator.locks.request(key, async () => {
          const prior = read()
          if (prior && !terminal(prior.status) && prior.expiresAt > Date.now())
            throw new Error('Cancel the pending authentication before preparing another')
          const state = randomSecret()
          const verifier = randomSecret()
          const nonce = randomSecret()
          const proof = randomSecret()
          const proofHash = base64URL(
            new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(proof))),
          )
          const challenge = base64URL(
            new Uint8Array(
              await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)),
            ),
          )
          const url = new URL(authorization)
          url.searchParams.set('response_type', 'code')
          url.searchParams.set('client_id', configuration.clientID)
          url.searchParams.set('redirect_uri', callback.href)
          url.searchParams.set('state', state)
          if (configuration.scopes?.includes('openid')) url.searchParams.set('nonce', nonce)
          url.searchParams.set('code_challenge', challenge)
          url.searchParams.set('code_challenge_method', 'S256')
          if (configuration.scopes?.length)
            url.searchParams.set('scope', configuration.scopes.join(' '))
          await bridgeRequest('register', state, undefined, undefined, proofHash)
          if (version !== generation) {
            if (bridge) void bridgeRequest('clear', state, undefined, proof).catch(() => {})
            throw new Error('Authentication preparation was cancelled')
          }
          const transaction: Transaction = {
            state,
            verifier,
            nonce,
            proof,
            binding,
            authorizationURL: url.href,
            expiresAt: Date.now() + timeoutMs,
            status: 'prepared',
          }
          save(transaction)
          publish(describe(transaction))
          return { start: (options = {}) => start(state, options.transport ?? 'popup') }
        })
      } finally {
        preparing = false
      }
    },
    async complete() {
      try {
        const url = new URL(location.href)
        if (url.origin !== callback.origin || url.pathname !== callback.pathname || url.hash)
          return { status: 'rejected', reason: 'wrong-callback-url' }
        const state = url.searchParams.get('state') ?? ''
        if (
          !/^[A-Za-z0-9_-]{43}$/.test(state) ||
          url.searchParams.getAll('state').length !== 1 ||
          url.searchParams.getAll('code').length > 1 ||
          url.searchParams.getAll('error').length > 1
        )
          return { status: 'rejected', reason: 'invalid-response' }
        const response = callbackValue(
          {
            state,
            ...(url.searchParams.has('code') ? { code: url.searchParams.get('code') } : {}),
            ...(url.searchParams.has('error') ? { error: url.searchParams.get('error') } : {}),
          },
          state,
        )
        if (!response) return { status: 'rejected', reason: 'invalid-response' }
        if (
          url.searchParams.getAll('iss').length > 1 ||
          (url.searchParams.has('iss') && url.searchParams.get('iss') !== configuration.issuer)
        )
          return { status: 'rejected', reason: 'issuer-mismatch' }
        if (!navigator.locks) return { status: 'unavailable', reason: 'locks-unavailable' }
        let stored = false
        let rejected = false
        try {
          await navigator.locks.request(key, () => {
            const transaction = read()
            if (
              transaction?.state === state &&
              transaction.status === 'pending' &&
              transaction.expiresAt > Date.now() &&
              !transaction.response
            ) {
              transaction.response = response
              save(transaction)
              stored = true
            } else if (transaction?.state === state) rejected = true
          })
        } catch {
          /* Partitioned or unavailable storage needs the server bridge. */
        }
        if (rejected) return { status: 'rejected', reason: 'request-consumed-or-expired' }
        if (bridge) {
          try {
            await bridgeRequest('complete', state, response)
            stored = true
          } catch {
            if (!stored) return { status: 'unavailable', reason: 'bridge-unavailable' }
          }
        }
        if (!stored) return { status: 'rejected', reason: 'unknown-state' }
        consumeWebAuthenticationURL(url.href)
        try {
          window.opener?.postMessage({ type: 'SATIN_AUTH_READY', id: configuration.id }, app.origin)
        } catch {
          /* Completion is durable; the app can reconcile after manual return. */
        }
        return { status: 'completed', returnURL: app.href }
      } catch {
        return { status: 'unavailable', reason: 'callback-storage-unavailable' }
      }
    },
    resume,
    cancel() {
      generation++
      activeExchange?.abort()
      try {
        const transaction = read()
        if (transaction && !terminal(transaction.status)) finish(transaction, 'cancelled')
        else publish(transaction ? describe(transaction) : { status: 'cancelled' })
      } catch {
        publish({ status: 'unavailable', reason: 'storage-unavailable' })
      }
      try {
        popup?.close()
      } catch {
        /* A severed opener cannot close its auxiliary page. */
      }
      popup = null
    },
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    connect() {
      const reconcileOnReturn = () => {
        if (document.visibilityState !== 'hidden') void resume()
      }
      const storage = (event: StorageEvent) => {
        if (event.key === key || event.key === null) reconcileOnReturn()
      }
      const message = (event: MessageEvent) => {
        if (
          popup &&
          event.source === popup &&
          event.origin === app.origin &&
          event.data?.type === 'SATIN_AUTH_READY' &&
          event.data.id === configuration.id
        )
          reconcileOnReturn()
      }
      window.addEventListener('pageshow', reconcileOnReturn)
      window.addEventListener('focus', reconcileOnReturn)
      window.addEventListener('storage', storage)
      window.addEventListener('message', message)
      document.addEventListener('visibilitychange', reconcileOnReturn)
      const timer = setInterval(() => {
        if (['pending', 'completing'].includes(snapshot.status)) reconcileOnReturn()
      }, 1000)
      reconcileOnReturn()
      return () => {
        clearInterval(timer)
        window.removeEventListener('pageshow', reconcileOnReturn)
        window.removeEventListener('focus', reconcileOnReturn)
        window.removeEventListener('storage', storage)
        window.removeEventListener('message', message)
        document.removeEventListener('visibilitychange', reconcileOnReturn)
      }
    },
  }
}
