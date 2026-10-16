# WebFrameController

Create the controller with useWebFrame and pass it to one WebView. state is reactive in the hook owner. reload and stop return dispatched only for an inspectable same-origin frame; an absent or cross-origin frame returns unavailable. There is no script evaluation or fabricated navigation history.

```ts
export interface WebFrameController {
  readonly state: WebFrameState
  reload(): WebFrameActionResult
  stop(): WebFrameActionResult
}
```

See [Web pages and sign in](../web-handoff.md) for complete examples and the hosting contract. The runnable HTTPS example is in `fixtures/web-handoff/`.
