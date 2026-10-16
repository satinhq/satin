# WebViewProps

url accepts HTTP or HTTPS and title supplies the accessible frame name. Set the container height explicitly. The frame uses a sandbox: scripts and forms are disabled unless explicitly allowed. Same-origin content with scripts enabled must be trusted because it is not a security boundary against your own origin. Popups and top-level navigation remain disallowed.

```ts
export interface WebViewProps {
  url: string
  /** Accessible name for the embedded page. */
  title: string
  controller?: WebFrameController
  /** Explicitly allow scripts. Same-origin scripted content must be trusted. */
  allowsJavaScript?: boolean
  allowsForms?: boolean
  className?: string
  style?: CSSProperties
  onStateChange?: (state: WebFrameState) => void
}
```

See [Web pages and sign in](../web-handoff.md) for complete examples and the hosting contract. The runnable HTTPS example is in `fixtures/web-handoff/`.
