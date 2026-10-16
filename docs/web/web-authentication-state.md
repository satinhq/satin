# WebAuthenticationState

idle is the initial state. prepared, pending and completing include expiresAt and needsReturn. A closed or COOP-severed popup can set needsReturn without resolving the transaction: closure cannot reliably distinguish cancellation from opener loss. succeeded follows the app exchange; cancelled and expired are explicit terminal states. failed/unavailable carry a reason. Terminal persisted records remove transaction secrets.

```ts
export type WebAuthenticationState =
  | { status: 'idle' }
  | { status: 'prepared' | 'pending' | 'completing'; expiresAt: number; needsReturn: boolean }
  | { status: 'succeeded' | 'cancelled' | 'expired' }
  | { status: 'failed' | 'unavailable'; reason: string }
```

See [Web pages and sign in](../web-handoff.md) for complete examples and the hosting contract. The runnable HTTPS example is in `fixtures/web-handoff/`.
