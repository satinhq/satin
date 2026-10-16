# WebAuthenticationCallbackResult

completed means the callback was validated and durably stored for the originating app; it is not session success. Offer returnURL as an explicit Return to app link. rejected indicates a malformed, expired, mismatched or replayed callback; unavailable means callback persistence or its runtime capability was unavailable. Do not show tokens or response parameters in the callback UI.

```ts
export type WebAuthenticationCallbackResult =
  | { status: 'completed'; returnURL: string }
  | { status: 'rejected' | 'unavailable'; reason: string }
```

See [Web pages and sign in](../web-handoff.md) for complete examples and the hosting contract. The runnable HTTPS example is in `fixtures/web-handoff/`.
