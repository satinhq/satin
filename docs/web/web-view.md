# WebView

<!-- example: web-view open -->

```tsx
import { Screen, WebView } from '@satinhq/kit'

function Example() {
  return (
    <Screen>
      <div style={{ height: 320 }}>
        <WebView url="/preview/embedded-help.html" title="Embedded help" />
      </div>
    </Screen>
  )
}
```

`WebView` embeds an iframe. Its parent supplies a height. Scripts and form submission are disabled unless `allowsJavaScript` or `allowsForms` is true. Popups, downloads and top navigation remain sandboxed. Same-origin scripted content must be trusted: `allow-scripts` with `allow-same-origin` is not a security boundary against your own origin.

`loaded` means a same-origin document is inspectable after its load event. It does not assert an HTTP success status or application readiness. Foreign or denied frames report `unverified` with `cross-origin-or-denied`. A browser does not reliably reveal which happened. Offer an ordinary Link when embedding is unavailable; never proxy around a page's framing restrictions.

`useWebFrame` returns a controller with `state`, `reload()` and `stop()`. Both commands return `unavailable` for foreign, denied or unmounted frames. There is no invented cross-origin title, progress, script evaluation or browser-history API. Embedded navigation can participate in browser session history; qualify your content's edge-back, keyboard and scrolling behavior. Embedded storage can be partitioned. Use the authentication helper for sign in.
