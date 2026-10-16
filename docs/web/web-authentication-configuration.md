# WebAuthenticationConfiguration

Declare one stable configuration per provider. id is unique within the app origin. callbackURL and bridgeURL must be same-origin dedicated endpoints outside the trailing-slash appURL scope. Use HTTPS except loopback development. An OpenID Connect scope requires issuer; your exchange server must verify the token issuer, audience, signature and nonce. timeoutMs defaults to ten minutes. A bridge is optional but needed when callback storage is partitioned.

```ts
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
```

See [Web pages and sign in](../web-handoff.md) for complete examples and the hosting contract. The runnable HTTPS example is in `fixtures/web-handoff/`.
