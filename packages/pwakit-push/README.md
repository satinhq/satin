# Satin push sender

Node 22.12+ sender and private relay for an installed iPhone Home Screen app. This package uses Web Push encryption and VAPID. It does not require Apple Developer membership. Apple accepting a message does not prove the phone displayed it.

## Set up the relay

Run from this workspace after `pnpm install && pnpm --filter @satinhq/kit build`. Replace the URLs with your installed app scope and trusted HTTPS relay URL.

```sh
node packages/pwakit-push/src/cli.mjs init --out "$HOME/.config/satin-push/push.json" --app-url https://your-app.example/app/ --relay-url https://your-app.example/push/ --subject https://example.com/contact
```

`init` generates a detail/title route at version 1, matching the starter, and writes the private configuration and owner token with mode 0600. Custom apps must align both the rule and notification route versions with their screen schema. It never prints secrets. Copy the generated public `client.env` into the starter's `.env.local`, then build and deploy the app. Supply the owner token at runtime through the app's authenticated session or token field; never bundle it.

```sh
node packages/pwakit-push/src/cli.mjs relay --config "$HOME/.config/satin-push/push.json" --port 5466
```

The default bind address is loopback. Forward the trusted HTTPS `/push/` path to this listener, stripping `/push` before forwarding. Keep the private Node listener on loopback or a permitted Tailscale address. A phone cannot call an HTTP relay from an HTTPS app. Keep CORS restricted to the configured app origin, as the relay does by default. Never create a public tunnel.

Open the installed app's Notifications screen, supply its owner token, read the explanation, and tap Enable Notifications. Then tap Send a test notification. Configure the relay's test route to match a screen and exact parameter names registered by that app. The `detail`/`title` example below matches the starter's registered detail screen.

## Send in one line

```sh
node packages/pwakit-push/src/cli.mjs send --config "$HOME/.config/satin-push/push.json" --title 'Reminder' --body 'Review your list' --route '{"screen":"detail","version":1,"params":{"title":"Welcome"}}' --badge 3
```

Once published, the equivalent entry is `npm exec --package @satinhq/push -- satin-push send` with those same options. Use the workspace command above when working from source.

```js
import { FileSubscriptionStore, sendNotification } from '@satinhq/push'
const result = await sendNotification(config, new FileSubscriptionStore(config.store), 'owner', {
  title: 'Reminder',
  body: 'Review your list',
  route: { screen: 'detail', version: 1, params: { title: 'Welcome' } },
  badge: 3,
})
// result.accepted counts push-service receipts, not phone displays.
```

The HTTP equivalent is authenticated `POST /send` with `Authorization: Bearer <sender token>` and a JSON message plus `owner`. An owner token cannot use `/send`. It can use `/subscriptions`, `/unsubscribe`, and the server-configured `/test`, limited to one test per 30 seconds. Body size is capped at 8 KiB. Subscription count is capped at 10 per owner. Never ship the sender token or private VAPID key in a browser bundle. Never log subscription endpoints or keys.

`keys --out /private/vapid.json` generates VAPID keys without relay configuration. Keep VAPID keys stable across ordinary releases. Rotation requires the owner to explicitly enable again; an expired endpoint also requires explicit recovery. The file store keeps an invalid marker after a 404/410 so foreground registration cannot resurrect it. A replacement subscription atomically retires its predecessor. Invalid endpoint tombstones survive replacement and unsubscribe, and do not count toward the 10 active subscriptions. They persist across process restarts; do not prune them while old clients can retry.

## Payload and routes

The shared route codec validates the closed screen list and exact parameter names. Routes encode as query parameters on the app's exact HTTPS scope URL. They cannot escape to another path or origin. Declare destinations with public `defineRoutes` and `route` in the app; `runApp` connects tap routing automatically. Define matching rules in the relay using `@satinhq/push/schema`. Parameters follow the declared validators; string values are capped at 256 characters. Unknown parameters and tabs are rejected. For a tab switch, declare allowed `tabs` in the relay rule matching the app's navigation IDs. The starter pushes onto its current tab.

Every payload has a nonempty title, body, validated `routeURL`, and unique delivery ID. `app_badge` is a top-level decimal string. The sender uses classic Web Push: `application/octet-stream`, `satin_push: 1`, no `web_push` marker and no `notification.navigate`. The worker displays a visible notification with the route in `data`, so it owns `notificationclick`. Badge-only and silent pushes are forbidden.

WebKit requires a navigation URL even when a mutable declarative event re-shows its notification, and falls back to that URL when the worker cannot run. That cannot meet the app contract that taps never navigate a running document.

An existing scoped window, including an uncontrolled/loading one, is focused without document navigation. The worker persists a pending route in a separate Cache API inbox. The document claims it at launch, pageshow, visibilitychange, controllerchange or a worker wake message. `runApp` owns the internal `connectPushRoutes` connection and queues delivery while a gesture owns the navigator. Apps must not add another connection or import this internal helper. Only accepted routes are consumed. Undecodable/unknown routes are rejected without navigation. Only absence of any scoped client allows `openWindow`.

Classic delivery needs the existing worker. If WebKit removes that worker or cannot execute it, delivery can fail instead of receiving an OS-owned declarative fallback. Do not mistake a push-service receipt for delivery. Previously sent declarative notifications cannot be converted after delivery; clear those before acceptance testing.

## Deployment

Run one Node process with a persistent private directory behind trusted HTTPS, with the configured origin and bearer authentication intact. The file store is serialized within that process and atomically renamed. Do not share it between relay processes. Back up the VAPID keys and configuration securely. Restrict config and store files to the service account. Subscription endpoints are restricted to `web.push.apple.com` because Satin's sole target is iOS. This is intentionally not a general browser relay.

For an edge worker, reuse the payload/route contract, store subscriptions in a transactional database keyed by authenticated owner, and replace Node `web-push` encryption and HTTPS transport with an edge-compatible RFC 8291/VAPID implementation. The Node package itself does not run in an edge isolate. Preserve invalid endpoint markers, atomic replacement, per-owner auth, body limits, fixed test payloads, and HTTPS. The Node relay does not supply that implementation.

## Shared route parameters

Keep parameter declarations in a browser-safe module. Both the app's `route` options and the relay use these same validators:

```ts
// shared-routes.ts (no screen imports)
import { param } from '@satinhq/push/schema'
export const destinations = {
  home: {},
  detail: { params: { id: param.string(), page: param.int().optional() } },
}
// App: defineRoutes({ home: route(Home, destinations.home),
//                     detail: route(Detail, destinations.detail) })
// Relay:
import { notificationRoutes } from '@satinhq/push/schema'
const routes = notificationRoutes(destinations, ['home', 'settings'])
// Pass routes to PushConfig; payloads name screen and version: 1.
```

`@satinhq/kit` exports the identical `param` implementation for apps that do not share a relay schema. The relay schema entry point imports no React, renderer, or Node APIs.

## Scheduled reminders need a server

The relay has no schedule registration, update/cancel, recurrence or idempotent-send endpoint. The storage and sender code below is a single-owner backend example you operate separately, not a relay scheduler.

`useNotifications()` requests authorization and manages subscriptions and badges. It does not schedule a local notification. Satin's deferred work runs at opportunities such as launch or resume; it is not an alarm clock. A suspended Home Screen app cannot promise a timer wakeup.

A reminder feature needs an authenticated server endpoint that stores the owner's schedule, UTC due instant, original calendar time and time zone, route and cancellation state. Validate those fields server-side using the same route rules as the app. Only show “Reminder scheduled” after the server durably accepts it. Permission granted and schedule saved are separate states. Disabling or changing a reminder must update the server record. Keep sender credentials on the server.

For a single-owner server, use one private SQLite database shared by the scheduler and authenticated schedule-management endpoint. This recipe requires Node 22.18+ for direct `.mts` execution and the built-in `node:sqlite` module, which is experimental in Node 22. Set `REMINDERS_DB` to the same absolute path in every process. Keep the database in a server-owned directory with mode 0700. Set `PUSH_CONFIG` and `PUSH_SEND_URL` to the private relay configuration and HTTPS `/send` endpoint.

```ts
// reminder-store.mts: the only database access module for both processes.
import { DatabaseSync } from 'node:sqlite'

export type Reminder = {
  id: string
  dueAt: string
  owner: string
  title: string
  body: string
  route: { screen: string; version: number; params: Record<string, string> }
}

if (!process.env.REMINDERS_DB) throw new Error('Set REMINDERS_DB.')
const database = new DatabaseSync(process.env.REMINDERS_DB)
database.exec(`
  PRAGMA busy_timeout = 5000;
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS reminders (
    id TEXT PRIMARY KEY, dueAt INTEGER NOT NULL, payload TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('pending', 'sending', 'sent', 'cancelled')),
    sentAt TEXT
  );
`)

// Call after authentication, owner authorization and payload/route validation.
export function scheduleReminder(reminder: Reminder) {
  const dueAt = Date.parse(reminder.dueAt)
  if (!reminder.id || !Number.isFinite(dueAt)) throw new Error('Invalid reminder.')
  database
    .prepare(
      `INSERT INTO reminders (id, dueAt, payload, state)
    VALUES (?, ?, ?, 'pending')`,
    )
    .run(reminder.id, dueAt, JSON.stringify(reminder))
}

export function cancelReminder(id: string, owner: string) {
  database
    .prepare(
      `UPDATE reminders SET state = 'cancelled'
    WHERE id = ? AND json_extract(payload, '$.owner') = ? AND state = 'pending'`,
    )
    .run(id, owner)
  const row = database
    .prepare(
      `SELECT state FROM reminders
    WHERE id = ? AND json_extract(payload, '$.owner') = ?`,
    )
    .get(id, owner)
  if (!row) return 'not-found'
  return row.state === 'cancelled' ? 'cancelled' : 'too-late'
}

export function claimReminder(): Reminder | undefined {
  const row = database
    .prepare(
      `UPDATE reminders SET state = 'sending'
    WHERE id = (SELECT id FROM reminders WHERE state = 'pending' AND dueAt <= ?
      ORDER BY dueAt, id LIMIT 1) AND state = 'pending' RETURNING payload`,
    )
    .get(Date.now())
  return row ? (JSON.parse(String(row.payload)) as Reminder) : undefined
}

export function finishReminder(id: string) {
  database
    .prepare(
      `UPDATE reminders SET state = 'sent', sentAt = ?
    WHERE id = ? AND state = 'sending'`,
    )
    .run(new Date().toISOString(), id)
}
```

The schedule-management endpoint must import `scheduleReminder` and `cancelReminder` from this module, and respond only after they return. It must authenticate and validate the owner, payload and route against the app's schema before calling them. Map duplicate IDs to HTTP 409; IDs are never reused. To change a reminder, cancel the old ID successfully, then schedule a new ID. Map cancellation results to HTTP 200 for `cancelled`, 404 for `not-found` and 409 for `too-late`. Never claim cancellation succeeded after a send was claimed. Do not edit a JSON queue or the database from another code path.

```ts
// send-due.mts: atomic claims serialize competing scheduler invocations.
import { readFile } from 'node:fs/promises'
import { claimReminder, finishReminder } from './reminder-store.mts'

if (!process.env.PUSH_CONFIG || !process.env.PUSH_SEND_URL) {
  throw new Error('Set PUSH_CONFIG and PUSH_SEND_URL.')
}
const config = JSON.parse(await readFile(process.env.PUSH_CONFIG, 'utf8'))
if (typeof config.senderToken !== 'string') throw new Error('Missing sender token.')
for (let reminder = claimReminder(); reminder; reminder = claimReminder()) {
  const response = await fetch(process.env.PUSH_SEND_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.senderToken}`,
    },
    body: JSON.stringify({
      owner: reminder.owner,
      title: reminder.title,
      body: reminder.body,
      route: reminder.route,
    }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`Relay rejected reminder: HTTP ${response.status}`)
  const receipt = await response.json()
  if (!(receipt.accepted >= 1) || receipt.failed !== 0) {
    throw new Error(
      'Reminder was not accepted by every active subscription. Reconcile this attempt.',
    )
  }
  finishReminder(reminder.id)
}
```

```sh
# Install in the server's crontab, with absolute paths and environment configured.
* * * * * /usr/local/bin/node /srv/reminders/send-due.mts >> /srv/reminders/scheduler.log 2>&1
```

SQLite serializes each update across processes. Cancellation that changes `pending` to `cancelled` before the atomic claim prevents sending. Once claimed as `sending`, cancellation returns `too-late`; it cannot retract an in-flight request. A later queued reminder can still be cancelled while an earlier send awaits the network, and new schedules cannot be overwritten by that send.

This is not exactly-once delivery. Failed requests, partial acceptance, unreadable receipts and crashes leave `sending` records for operator reconciliation; do not automatically reclaim them, since the relay may already have accepted the message. Retrying an uncertain send can duplicate delivery. Production schedules also need bounded retry/backoff and an explicit duplicate policy; the sender has no idempotency API. Failed or missing subscriptions must appear as setup failures. A receipt never proves display or delivery at the exact requested second. This recipe supplies storage functions for the app's endpoint, not its authentication or HTTP routing.
