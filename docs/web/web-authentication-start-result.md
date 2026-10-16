# WebAuthenticationStartResult

dispatched reports the selected transport. unavailable includes the failure reason, including blocked popups or an expired/already-started request. It does not mean that authentication succeeded. Watch WebAuthenticationState for session completion.

```ts
export type WebAuthenticationStartResult =
  | { status: 'dispatched'; transport: 'popup' | 'redirect' }
  | { status: 'unavailable'; reason: string }
```

See [Web pages and sign in](../web-handoff.md) for complete examples and the hosting contract. The runnable HTTPS example is in `fixtures/web-handoff/`.
