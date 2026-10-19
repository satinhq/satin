# Remote data without loading on every push

Define a resource outside React and read it with `useResource`. Every screen with
the same resource and key shares one request and one retained value. Returning to
a screen reads that value on the first render. Stale values stay visible while a
new request runs. Covering or unmounting a screen does not cancel shared work.

```tsx
import { defineResource, useResource } from '@satinhq/kit'

type Message = { id: string; subject: string; preview: string; body?: string }
export const messages = defineResource(async (key: string, signal) => {
  const response = await fetch(`/api/messages/${encodeURIComponent(key)}`, {
    signal,
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Message unavailable (${response.status})`)
  return (await response.json()) as Message // Validate untrusted JSON in your app.
})

function MessageContent({ id }: { id: string }) {
  const message = useResource(messages, id)
  if (message.loading) return <p>Loading message…</p>
  if (!message.hasData) return <p>Could not load this message.</p>
  return <article><h2>{message.data!.subject}</h2><p>{message.data!.body ?? message.data!.preview}</p></article>
}
```

## Start on press-down

Seed detail resources from summaries when the inbox arrives. This reuses data
already downloaded and starts no additional requests:

```ts
for (const summary of page.items) messages.seed(summary.id, summary)
return page
```

Put `prefetch` on the `NavigationLink` that opens the detail. Satin calls it on
press begin, before release starts the push. `Button` and custom `Pressable`
controls accept the same prop, including buttons rendered as list rows.

```tsx
<NavigationLink
  to="message"
  params={{ id: summary.id }}
  prefetch={signal => messages.prefetch(summary.id, signal)}
>
  {summary.subject}
</NavigationLink>
```

Pass the supplied signal through. Scrolling, swiping, leaving the target or
cancelling the contact aborts that press's speculative interest. A successful
release keeps it running through navigation. The destination's `useResource`
joins the same request; it does not fetch again. Cancelling one press never aborts
work another reader has joined. Keyboard press begins preparation too; an
accessibility activation without a preceding press starts it at activation.

The available head start is the actual contact time plus navigation time. It is
not a guaranteed 400–500 ms: fast taps, network delays and image decoding vary.
Do not wait for prefetch before navigating. Seeded content gives the screen
something truthful to show while full content arrives.

Loading a small explicit set in advance is optional when the app has evidence it
is useful, for example `void messages.prefetch(page.items[0].id)` for one likely
next item. Do not bulk-prefetch a mailbox or start work for every visible row by
default. Press-driven preparation avoids that speculative network and decode work.

Loaders must be read-only. Prefetch must not mark a message as read, send analytics
for a visit, or perform a mutation. Keep those actions tied to the actual visit.
Treat returned values as immutable snapshots.

A seed must have the resource's declared type. Model missing body content explicitly;
do not cast a summary to a full message. Seeds fill only empty entries, stay stale,
and never overwrite a newer loaded value. The detail can immediately show its
subject and preview while the body arrives. Use account-qualified keys or a separate
resource per account. Every response field affecting the result belongs in the key,
including mailbox, filter and pagination cursor.

`prefetch(key, signal?)` reuses a fresh value or joins the existing request. Its promise
always settles successfully; failures remain in the resource snapshot. `load(key)`
and `refresh(key)` reject on failure so an explicit action can report it. `refresh`
always requests current data, joining any request already running. Use it for pull
to refresh and Retry, handling rejected promises in event handlers. `error` can
coexist with `hasData`: retain the content and show a retry affordance rather than
replacing the screen with a spinner. Check `loading`, then `hasData`, before showing
an empty state. A successful empty array is data.

After a server mutation succeeds, call `invalidate(key)`. It keeps the previous
value, cancels obsolete work and reloads subscribed entries. An obsolete request
cannot overwrite the mutation's fresh result even if its loader ignores abort.
No automatic retry loop runs after failure. Showing the screen again revalidates.

## Memory and privacy

Defaults are 30 seconds of freshness and at most 100 unused entries per resource.
Use `{ staleTime, maxEntries }` as the second argument to `defineResource` to change
those limits. Active readers and in-flight requests are retained until released or
settled. This is an entry-count limit, not a byte budget; avoid speculative downloads
of large attachments. Eviction, document termination and `clear()` remove retained
content. Cold reads after those events still require loading UI.

Call `clear()` on every account resource on sign-out, then leave account screens.
It aborts pending requests, clears mounted snapshots and rejects late responses.
It does not start replacement requests. Loaders must pass the supplied signal to
fetch to stop unnecessary network work.

Satin writes no resource values to IndexedDB, localStorage or its service-worker
cache. Persistence is an explicit application decision through `defineDatabase`.
The browser's HTTP cache is independent: use `cache: 'no-store'` and appropriate
server response headers for private data. For remote image responses, configure
`Cache-Control: no-store` on the server if they must not enter the HTTP disk cache.
The resource does not own authentication, JSON validation or reachability tracking;
a loader can use the app's existing request client.

## Images

`await AsyncImage.prefetch(url, options)` warms the existing bounded decoded-image
cache. Match `srcSet`, `sizes`, `crossOrigin` and `referrerPolicy` to the destination.
Start it in the same press callback, forwarding the signal:

```tsx
prefetch={signal => Promise.all([
  messages.prefetch(summary.id, signal),
  AsyncImage.prefetch(summary.image, { crossOrigin: 'anonymous', signal }),
])}
```

The callback's rejection never prevents activation. Outside a press callback,
handle image prefetch rejection yourself. A cancelled press retires an unfinished
image request only if no destination or other reader has adopted it. `AsyncImage` reads an available decode immediately and keeps
its reserved geometry and placeholder on a cold or failed load. It does not delay
navigation. Prefetch is a preparation opportunity, not a guarantee against eviction.

## Choose the owner of the work

Use `defineResource` and `useResource` for remote data shared by screens. Use
`useTask` for work that should cancel when its screen is covered, such as a
screen-specific subscription. `defineDatabase` remains the opt-in durable store.
No resource runs while iOS suspends the app, and none claims native background fetch.
