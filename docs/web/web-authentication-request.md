# WebAuthenticationRequest

Store the request returned by prepare, then enable your sign-in button. Call start synchronously from that press. Popup is the default transport; redirect explicitly replaces the document. A blocked popup may retry using redirect. A dispatched request is single-use: cancel and prepare a fresh request before changing transport after opener loss.

```ts
export interface WebAuthenticationRequest {
  /** Call synchronously in the user's press handler. A blocked popup may retry as redirect. */
  start(options?: { transport?: 'popup' | 'redirect' }): WebAuthenticationStartResult
}
```

See [Web pages and sign in](../web-handoff.md) for complete examples and the hosting contract. The runnable HTTPS example is in `fixtures/web-handoff/`.
