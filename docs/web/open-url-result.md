# OpenURLResult

handled means a registered app destination was handled in memory. dispatched means the browser accepted an external action; it makes no page-load claim. unavailable includes a reason suitable for choosing an explicit alternative. A blocked action never silently replaces the app document.

```ts
export type OpenURLResult =
  | { status: 'handled'; destination: 'app' }
  | { status: 'dispatched'; destination: 'web' }
  | {
      status: 'unavailable'
      reason:
        | 'invalid-url'
        | 'external-browser'
        | 'unregistered-app-url'
        | 'navigation-failed'
        | 'popup-blocked'
    }
```

See [Web pages and sign in](../web-handoff.md) for complete examples and the hosting contract. The runnable HTTPS example is in `fixtures/web-handoff/`.
