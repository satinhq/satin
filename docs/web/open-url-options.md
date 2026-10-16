# OpenURLOptions

prefersInApp defaults to true. It requests browser-owned auxiliary presentation while preserving the app document. false is a strict external-browser preference and returns unavailable because the web cannot guarantee launching another app.

```ts
export interface OpenURLOptions {
  /** Defaults to true. A strict external-browser request is unavailable on this runtime. */
  prefersInApp?: boolean
}
```

See [Web pages and sign in](../web-handoff.md) for complete examples and the hosting contract. The runnable HTTPS example is in `fixtures/web-handoff/`.
