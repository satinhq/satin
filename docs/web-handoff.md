# Web pages and sign in

Use `NavigationLink` for typed screen destinations. Use `Link` or `useOpenURL` for a URL. Registered URLs in your app scope use the existing navigation stack and retain the document. An unknown app URL returns `unavailable`; it never turns a route typo into a page reload.

```tsx
import { Link, Button, useOpenURL } from '@satinhq/kit'

function Help() {
  const openURL = useOpenURL()
  return <>
    <Link destination="https://example.com/help" onResult={console.log}>Help</Link>
    <Button onPress={() => console.log(openURL('https://example.com/account'))}>Account</Button>
  </>
}
```

Call URL actions directly from a press. External HTTP and HTTPS pages open an auxiliary browsing context with its opener removed. The browser chooses its presentation. On the installed target, this can be a page with Safari controls above it; use its Close control to return. `dispatched` means the browser accepted the request, not that the page loaded. There is no reliable generic dismissal callback. The app remains alive while the platform permits it; enable scene restoration for eviction.

`prefersInApp` defaults to true. Setting it to false returns `unavailable` because web code cannot guarantee a switch to a separate browser. A blocked auxiliary window also returns `unavailable`. There is no automatic document-replacing fallback. Only HTTP and HTTPS URLs are supported. Executable URLs, embedded credentials, custom schemes and private Safari schemes are rejected.

`Link` uses the framework press policy and exposes link accessibility semantics. It is a URL action, not an HTML anchor with a browser context menu. It takes `destination`, `children`, `disabled`, `className`, `style`, `prefersInApp` and `onResult`.

## Embedded pages

```tsx
import { WebView, useWebFrame, Button } from '@satinhq/kit'

function EmbeddedHelp() {
  const frame = useWebFrame()
  return <>
    <div style={{ height: 320 }}>
      <WebView url="https://example.com/help" title="Help" controller={frame} />
    </div>
    <p>{frame.state.status}</p>
    <Button onPress={() => console.log(frame.reload())}>Reload</Button>
  </>
}
```

`WebView` embeds an iframe. Its parent supplies a height. Scripts and form submission are disabled unless `allowsJavaScript` or `allowsForms` is true. Popups, downloads and top navigation remain sandboxed. Same-origin scripted content must be trusted: `allow-scripts` with `allow-same-origin` is not a security boundary against your own origin.

`loaded` means a same-origin document is inspectable after its load event. It does not assert an HTTP success status or application readiness. Foreign or denied frames report `unverified` with `cross-origin-or-denied`. A browser does not reliably reveal which happened. Offer an ordinary Link when embedding is unavailable; never proxy around a page's framing restrictions.

`useWebFrame` returns a controller with `state`, `reload()` and `stop()`. Both commands return `unavailable` for foreign, denied or unmounted frames. There is no invented cross-origin title, progress, script evaluation or browser-history API. Embedded navigation can participate in browser session history; qualify your content's edge-back, keyboard and scrolling behavior. Embedded storage can be partitioned. Use the authentication helper for sign in.

## Authorization-code sign in

Declare one authentication object outside rendering. Generate PKCE before the tap, then dispatch the prepared request synchronously.

```tsx
import { defineWebAuthentication, useWebAuthentication, Button } from '@satinhq/kit'
import { useState } from 'react'
import type { WebAuthenticationRequest } from '@satinhq/kit'

const authentication = defineWebAuthentication({
  id: 'account',
  appURL: 'https://app.example/app/',
  callbackURL: 'https://app.example/auth/callback',
  authorizationURL: 'https://accounts.example/authorize',
  clientID: 'public-client-id',
  scopes: ['openid', 'profile'],
  issuer: 'https://accounts.example',
  bridgeURL: 'https://app.example/auth/bridge',
  exchange: async ({ signal, ...request }) => {
    const response = await fetch('/auth/exchange', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request), signal,
    })
    if (!response.ok) throw new Error('Sign in failed')
  },
})

function SignIn() {
  const state = useWebAuthentication(authentication)
  const [request, setRequest] = useState<WebAuthenticationRequest | null>(null)
  return <>
    <p>{state.status}</p>
    <Button onPress={() => void authentication.prepare().then(setRequest)}>Prepare sign in</Button>
    <Button disabled={!request} onPress={() => console.log(request!.start())}>Sign in</Button>
    <Button onPress={() => authentication.cancel()}>Cancel</Button>
  </>
}
```

Handle rejected preparation in your app. A real app can prepare when its sign-in view appears and enable Sign in when ready. `start()` defaults to popup. If it reports `popup-blocked`, offer a new user action calling `request.start({ transport: 'redirect' })`. Redirect replaces the app document. The old JavaScript promise cannot receive its completion; `useWebAuthentication` reconciles durable state when the app launches again.

A popup closed by the user and an opener severed by browser isolation can look identical. The state remains pending with `needsReturn: true`; check completion, offer Return and Cancel, and let the transaction expire. To choose redirect after an already-started popup, cancel it, prepare a fresh request and start that request as redirect. A fresh request prevents an old callback from consuming the new sign-in attempt.

The callback is a dedicated same-origin document outside the app scope. It imports the same declaration, calls `await authentication.complete()`, and shows a Return to app link using the returned `returnURL`. A popup may offer `window.close()` on that callback document. Returning through an ordinary link can open a new app document or Safari tab; the platform does not guarantee automatic reopening of the installed app. The user can return through Home Screen and the result will reconcile there.

The callback must have `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, no analytics, and no third-party subresources. Serve it independently of the app platform/install gate. Keep bridge, exchange and IdP routes out of the app-shell cache. The framework worker passes authorization responses containing state plus code/error through to the network.

The helper checks exact callback origin/path, state, response shape, expiry and replay. It stores a callback before removing response parameters with the framework URL projection. It sends only a wake-up notice through `postMessage`, with an exact origin; the receiver also checks the popup source. Codes, verifiers and tokens are never messaged. The pending verifier lives in origin-local storage until completion, cancellation or expiration. A terminal result contains no code, verifier, nonce or bridge proof.

`exchange` establishes the server session and resolves only after success. Use `transactionID` as an idempotency key: process eviction after exchange but before the local success write can cause a retry. Verify the code, PKCE verifier, callback and configured provider on the server. For OpenID Connect also validate the token signature, issuer, audience, time claims and supplied nonce. The helper supplies `nonce` and `expectedIssuer`; it does not validate identity tokens. An `iss` response parameter is checked when present; server token issuer validation is required even when it is absent. Use distinct callback URLs for providers that do not identify their issuer in the authorization response. Never put a client secret in this bundle.

The helper requires secure context, local storage and Web Locks. HTTP loopback is accepted for local development. It cannot complete while the app is suspended; it resumes on launch, pageshow, visibility, focus or a callback wake-up. Storage and network errors are explicit. Cancellation aborts a cooperating exchange and preserves the cancelled local result; it cannot revoke a session already created by your server.

## Optional server bridge

Use a bridge when the callback cannot access the initiating app's storage or opener. It is a same-origin HTTPS POST endpoint outside the app scope. All responses are no-store JSON. The request includes `operation`, `id`, `state` and the fields below.

| Operation | Request fields | Response |
| --- | --- | --- |
| register | proofHash, timeoutMs | { accepted: true } |
| complete | response: { state, code } or { state, error } | { accepted: true } |
| read | proof | null or the stored response |
| clear | proof | { accepted: true } |

Register stores the SHA-256 base64url hash of a fresh 256-bit private proof, a bounded expiry and app/provider binding. Read and clear must hash and compare that proof. The proof never appears in the provider URL or callback. Knowledge of state alone must not permit reading or claiming a login. Complete must atomically accept only the first response for an unexpired registered state, reject malformed inputs, and never mint a session. The final server exchange still verifies PKCE. Reject cross-origin requests, bound sizes and rates, and expire abandoned transactions. A non-read success must explicitly return `accepted: true`; HTTP 200 alone is insufficient.

The fixture in `fixtures/web-handoff` implements this protocol and verifies one-use PKCE codes. It demonstrates OAuth code exchange with PKCE, not OpenID Connect identity-token validation. Its in-memory IdP and bridge are for local testing only; use durable transactional server storage in production.

## Showing email or article HTML

Serve sanitized HTML from your own origin. Keep scripts and forms disabled. For an email
inside a `ScrollView`, use content sizing:

```tsx
<ScrollView id="email" axis="vertical">
  <WebView url="/messages/42/body" title="Message from Alex" sizing="content" />
</ScrollView>
```

`fitsWidth` defaults to true. The parent measures the unscaled document and scales wide
content down to the frame width. Images and media are constrained to that width. Content
height follows image loads, font completion, document mutations and body resizes. This is
for ordinary flow content, not documents whose height depends on the frame viewport.
Set `fitsWidth={false}` to retain the document's authored width. `sizing="fill"` remains the
default and requires a height from the parent.

`onOpenURL` is unavailable for scripts-off sandboxed documents on WebKit, which blocks
even parent-installed frame event listeners ([WebKit 218086](https://bugs.webkit.org/show_bug.cgi?id=218086)).
Neither callback delivery nor prevention of frame navigation is promised in that mode.
Keep untrusted email scripts disabled; expose application-owned `Link` controls outside
the frame when link policy is required. Do not enable scripts as a workaround.

For trusted same-origin documents that already allow scripts, `onOpenURL(url, { target })`
handles document links synchronously. The target
comes from the link or its `base` element. Returning does not navigate the frame. Without
a handler, HTTP(S) links open an auxiliary browser context through the same handoff as
`useOpenURL`. `_self`, `_parent` and `_top` cannot replace the frame or app; the default
handoff always uses a new browser context. Applications that need named-target reuse
must implement that policy in `onOpenURL`. Unsupported schemes are blocked. The browser
chooses whether the new context uses Safari controls or a separate browser; Satin cannot
force a particular presentation.

Sizing and available link policies are installed at the frame's load event before it
becomes visible, avoiding an initial unscaled flash. A foreign or denied
frame falls back to fill sizing: the parent cannot inspect its height, scale its content,
or intercept its links. Neither navigation policy nor content sizing is promised for that
case. Use a normal `Link` when the app needs those guarantees.

`className` and `style` now apply to a containing wrapper. The inner iframe fills it.
The wrapper owns its relative positioning and isolated stacking context; put external
positioning on a parent if needed. Each wrapper also owns the menu input catcher, which
follows its layout and stays inside a sheet's dialog. Menu previews remain interactive.
A tap, drag or wheel over a caught frame dismisses the menu without activating content
under the frame. The catcher remains through preparation and the closing morph.

Retained pages, press-prefetch, pinch zoom and installed back-swipe equivalence remain
pending. This change does
not introduce a `WebPage` API or claim that unmounting a WebView preserves its document.
