# WebFrameState

idle means no admitted page; loading means a navigation began. loaded means a load event was observed and the same-origin document could be inspected. It does not prove HTTP success or application readiness. unverified combines cross-origin and denied framing because browser APIs cannot reliably distinguish them. unavailable reports invalid-url or an observed load-error.

```ts
export type WebFrameState =
  | { status: 'idle' | 'loading' }
  | { status: 'loaded'; url: string; title: string }
  | { status: 'unverified'; reason: 'cross-origin-or-denied' }
  | { status: 'unavailable'; reason: 'invalid-url' | 'load-error' }
```

See [Web pages and sign in](../web-handoff.md) for complete examples and the hosting contract. The runnable HTTPS example is in `fixtures/web-handoff/`.
