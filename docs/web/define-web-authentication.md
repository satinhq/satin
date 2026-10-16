# defineWebAuthentication

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
