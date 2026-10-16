# WebAuthenticationExchange

The exchange function receives the authorization code, PKCE verifier, exact callbackURL, transactionID, nonce, optional expectedIssuer and an AbortSignal. Send these to your server over HTTPS. Use transactionID as an idempotency key, validate the provider response and establish a secure server session. Resolve only after session establishment. Never send tokens through window messaging.

```ts
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
```

See [Web pages and sign in](../web-handoff.md) for complete examples and the hosting contract. The runnable HTTPS example is in `fixtures/web-handoff/`.
