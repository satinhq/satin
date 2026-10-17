# Talking to the network

Use `useReachability().fetch` for requests to the app server so transport outcomes
update the declared offline presentation. It returns the browser's `Response`
and preserves request options, HTTP errors and cancellation. Use browser `fetch`
for unrelated services. Satin supplies screen-bound tasks and pull-to-refresh;
it does not supply a response cache or backend.

## Declare a server dependency

An online device can lose access to its app server, including when Tailscale is
disabled. `navigator.onLine` does not establish server reachability. Declare the
dependency in the same `defineApp` input that generates the installed app:

```tsx
const app = defineApp({
  id: 'music',
  name: 'Music',
  icons: { source: '/icon.png' },
  connectivity: 'server',
  reachability: {
    probe: { url: '/__satin_reachability', method: 'HEAD', timeoutMs: 2500 },
    defaultRoutePolicy: 'local-first',
    routes: { video: 'requires-server' },
    surfaces: { localFirst: 'banner', requiresServer: 'full-screen' },
  },
})
```

The probe must reach the server rather than an entry in the service worker's
precache. Serve an uncached endpoint at that URL. Any HTTP response, including a
404 or 503, establishes transport reachability; the application still handles
the response's status. Only a transport failure means the server is unreachable.
The static specimen server's response to an unknown uncached URL also works as
a transport probe. Route keys are the IDs supplied to `defineRoutes`.

The root owns the initial probe and online, offline and foreground rechecks.
Same-server image failures prompt a probe because an image decode error cannot
distinguish transport loss from a missing or corrupt file. Error bursts share
the current probe. This includes `Image`, `AsyncImage` and raw `img`. Successful
decoding of cached artwork does not establish transport reachability.

`useReachability().fetch(input, init)` reports outcomes only for the probe's
origin. A response restores reachability, a network failure reports the outage,
and an `AbortError` leaves reachability unchanged. The existing
`reportFetchOutcome` method remains available for app-owned request adapters.
Neither method reports JSON parsing or application errors as a lost connection.

Local-first routes keep their content usable behind a banner. Required routes
use the declared full-screen, banner or application-owned treatment. The full
screen uses `ContentUnavailableView`, keeps the route mounted, blocks its
interaction and leaves a Back action when navigation supplies one. Try again
runs a new probe. Returning online or foregrounding also rechecks. There is no
continuous network polling. Once the server responds, the treatment disappears
and failed framework artwork retries without a relaunch. Failed raw images on
the same server also retry. Data reloads and queued writes remain app decisions.

Declare `connectivity: 'local'` only when the app's tasks and required assets are
available from local storage and the installed precache. Bundled catalog metadata
does not make streamed artwork or audio local. A local profile does not show
server-outage UI or install reachability listeners.

## Image loading outcomes

`Image` reserves bundled artwork geometry and waits for its decode.
`AsyncImage` keeps a placeholder while a remote request is pending and never
blocks navigation. Both retain a placeholder or previously painted artwork on
failure. Glass capture and transition clones preserve that content outcome;
a network error, 404 or corrupt image does not become a `GlassError`. Renderer
assets, drawing failures and missing successfully decoded pixels still fail
loudly.

`AsyncImage` exposes the native phase names through `onPhaseChange`. Its
`AsyncImagePhase` union has `phase: 'empty'`, `phase: 'success'` with the displayed
image, or `phase: 'failure'` with the decode error. Source replacement starts a
new empty phase; a superseded completion cannot publish success or failure.
The callback can update app-owned loading or failure copy. It does not replace
the framework's image placeholder or geometry policy.

Use reachability signals, request errors, `AsyncImagePhase` and
`ContentUnavailableView` to distinguish connectivity and content failures.
Satin's server probe adds the server distinction that browser online events
cannot provide.

## Load when a screen appears

`useTask(action, { id? })` starts on appearance and passes an `AbortSignal` plus a
`commit` function. It cancels when navigation hides or removes the screen, when
its retained tab becomes inactive, or when its sheet disappears. Returning to the
screen starts a new run. A partial sheet does not cancel the presenting screen's
task. Changing `id`, compared with `Object.is`, cancels and replaces the current run.
Changing an inline action closure alone does not restart it.

Pass `signal` to `fetch`, and put result setters inside `commit`. It returns false
without calling your update after cancellation or replacement. Cancellation is
cooperative: JavaScript cannot intercept arbitrary setters,
undo a request already accepted by a server, or stop code which ignores the signal.
Keep the commit callback synchronous. Catch expected network failures in your
action and publish an app-visible error; uncaught active-task errors reach React's
error boundary. Cancellation errors are ignored only after that run is cancelled.

The returned runner replaces the current task and resolves when the new run ends.
Use it as `refreshable` so initial loading and refreshing cannot race. `onRefresh`
is an alias on List and ScrollView; supply one name. Refreshing keeps its indicator
until the returned promise settles. A horizontal ScrollView cannot refresh.

```tsx
import { useState } from 'react'
import { LabeledContent, List, Section, useTask } from '@satinhq/kit'

type Entry = { id: string; title: string }

export function Inbox({ accountID }: { accountID: string }) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [error, setError] = useState<string | null>(null)
  const reload = useTask(async (signal, commit) => {
    try {
      const response = await fetch(`/api/accounts/${encodeURIComponent(accountID)}/entries`, {
        signal,
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      })
      if (!response.ok) throw new Error(`Request failed (${response.status})`)
      const value: unknown = await response.json()
      if (!Array.isArray(value) || !value.every(entry =>
        typeof entry === 'object' && entry !== null &&
        typeof entry.id === 'string' && typeof entry.title === 'string')) {
        throw new Error('The server returned an invalid entry list')
      }
      commit(() => {
        setEntries(value as Entry[])
        setError(null)
      })
    } catch (failure) {
      if (signal.aborted) return
      commit(() => setError(failure instanceof Error ? failure.message : 'Could not load entries'))
    }
  }, { id: accountID })

  return (
    <List id="inbox" refreshable={reload}>
      <Section header="Inbox" footer={error ?? 'Pull down to check for new entries.'}>
        {entries.map(entry => <LabeledContent key={entry.id} label={entry.title} value="" />)}
      </Section>
    </List>
  )
}
```

Mount this component as a screen in your scaffold's NavigationStack. `/api/accounts/:id/entries`
is your authenticated backend endpoint, returning a JSON array of `{ id, title }`.
It is not a built-in Satin service. A refresh handler can also take `(signal, commit)`
directly when it has independent work. Return its whole promise, including parsing.

## CORS is different from URLSession

A native app can call an API that a browser refuses to expose. Use an API that
allows your installed app's HTTPS origin, or route requests through your own
same-origin backend proxy. CORS permissions come from the server response;
request headers cannot grant them. `mode: 'no-cors'` produces an unreadable opaque
response and does not fix JSON loading. Authorization headers and many writes
require the API to handle an OPTIONS preflight.

For cross-origin cookies, `credentials: 'include'` also requires an explicit
`Access-Control-Allow-Origin` matching your origin and
`Access-Control-Allow-Credentials: true`, not a wildcard origin. Cookie and
tracking policies still apply. See the [Fetch CORS protocol](https://fetch.spec.whatwg.org/#http-cors-protocol).

## Authenticate inside the installed app

Treat Safari and the installed app as separate storage contexts. Installation can
copy existing cookies, but later cookie changes are separate and local storage is
not copied. A successful Safari login does not establish a durable installed-app
session. Support signing in from the installed app, and preserve its origin and
manifest identity across releases. See [WebKit's installation behavior](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/)
and [Apple's web app session explanation](https://developer.apple.com/videos/play/wwdc2023/10120/).

## Background delivery and offline writes

Do not schedule background fetch or background sync on iOS. A page may be frozen
or killed after it leaves the foreground. Run schedules on your server and use
visible Web Push to notify the user; follow the [push sender guide](../packages/push/README.md).
Push is not permission to run a silent polling loop or a guaranteed delivery time.

Queue offline writes in the [local database](data.md). Store a stable operation ID,
payload and retry state durably before reporting the edit saved. Drain that queue
when the app is open and connectivity returns, and retry failures on the next
foreground opportunity. Delete an operation only after the server acknowledges it.
Use its stable ID as a server-side idempotency key so a lost response cannot apply
the write twice. Keep conflicts and authentication failures visible to the user.
