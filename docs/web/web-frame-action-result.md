# WebFrameActionResult

Inspect this return value after reload or stop. dispatched acknowledges the request; unavailable explains not-mounted or cross-origin-or-denied. Neither outcome promises completion.

```ts
export type WebFrameActionResult =
  | { status: 'dispatched' }
  | { status: 'unavailable'; reason: 'not-mounted' | 'cross-origin-or-denied' }
```

See [Web pages and sign in](../web-handoff.md) for complete examples and the hosting contract. The runnable HTTPS example is in `fixtures/web-handoff/`.
