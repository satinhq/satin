# WebAuthentication

prepare registers durable PKCE material before a user press. complete runs in the dedicated callback document. resume reconciles stored completion and invokes the app exchange. cancel aborts this instance and persists cancellation. getSnapshot/subscribe expose state; connect adds lifecycle and popup monitoring and returns cleanup. The React hook manages those subscriptions for you.

```ts
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
```

See [Web pages and sign in](../web-handoff.md) for complete examples and the hosting contract. The runnable HTTPS example is in `fixtures/web-handoff/`.
