# OpenURLAction

Call the function returned by useOpenURL directly inside a press handler. The action shares Link URL validation and internal route handling. An asynchronous call may lose browser user activation and return popup-blocked.

```ts
export type OpenURLAction = (url: string, options?: OpenURLOptions) => OpenURLResult
```

See [Web pages and sign in](../web-handoff.md) for complete examples and the hosting contract. The runnable HTTPS example is in `fixtures/web-handoff/`.
