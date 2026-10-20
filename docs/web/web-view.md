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

`WebView` embeds an iframe. Its parent supplies a height. Scripts and form submission are disabled unless `allowsJavaScript` or `allowsForms` is true. Downloads and top navigation remain sandboxed. Same-origin scripted content must be trusted: `allow-scripts` with `allow-same-origin` is not a security boundary against your own origin.

`loaded` means a same-origin document is inspectable after its load event. It does not assert an HTTP success status or application readiness. Foreign or denied frames report `unverified` with `cross-origin-or-denied`. A browser does not reliably reveal which happened. Offer an ordinary Link when embedding is unavailable; never proxy around a page's framing restrictions.

`useWebFrame` returns a controller with `state`, `reload()` and `stop()`. Both commands return `unavailable` for foreign, denied or unmounted frames. There is no invented cross-origin title, progress, script evaluation or browser-history API. Embedded navigation can participate in browser session history; qualify your content's edge-back, keyboard and scrolling behavior. Embedded storage can be partitioned. Use the authentication helper for sign in.

## Links in same-origin documents

With scripts disabled, Satin rewrites safe `<a href>` and image-map links before
revealing the loaded document. HTTP and HTTPS URLs without credentials receive
`target="_blank"` and `rel="noopener noreferrer"`. Executable, data, custom-scheme
and credentialed destinations lose their `href`; tracking pings and download
attributes are removed. Only this same-origin scripts-off mode grants
`allow-popups allow-popups-to-escape-sandbox`. A tap opens a new browser context
without navigating the email frame. The platform chooses the browser presentation.
Embedded scripts remain disabled. If forms are explicitly enabled, their targets and
submit-button targets are restricted to the frame; they cannot reuse link popup permissions.

`onOpenURL` cannot run in scripts-off WebKit frames because WebKit blocks event
listeners installed by the parent. With trusted `allowsJavaScript` content, the
framework intercepts links and calls `onOpenURL` synchronously with the authored
target. Without a callback it dispatches the URL from the parent. Unsafe links are
stripped in both modes. Do not enable scripts for untrusted email.

Set `allowsLinkOpening={false}` to remove all link destinations and withhold popup
permissions. Changing the script, form or link policy reloads the frame. Cross-origin
frames cannot be rewritten or intercepted and receive no popup permissions. A
same-origin URL that redirects to an inaccessible document stays hidden when the
native link policy cannot be installed; its state is `unverified`. Serve sanitized
email HTML from your own origin with appropriate response security headers.
