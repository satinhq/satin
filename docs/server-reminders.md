# Server-scheduled reminders

An installed iOS web app cannot schedule a local notification for a future date.
Keep due dates in the app, register a schedule with your authenticated backend,
and have that server request Web Push delivery when the reminder becomes due.
Satin supplies permission, subscription registration, visible push handling and
tap routing. Your backend supplies durable schedules and the process that sends them.
The Notifications API's `timestamp` describes an event time, not a future trigger;
see the [Notifications standard](https://notifications.spec.whatwg.org/#notifications).

This recipe uses the existing `satin-push` transport. Its relay accepts subscriptions
and immediate sends. It has **no reminder registration, scheduler, recurrence,
schedule update/cancel or idempotent-send endpoint**. The `/api/reminders` paths
below are an application backend contract you must implement, not installed relay APIs.
There is no `scheduleNotification` or public `onNotification` hook at this revision.

## Configure the existing app and enable notifications

Use the scaffold's existing `satinApp(defineApp(app))` Vite plugin and worker.
Keep its HTTPS app scope and manifest identity stable. Do not register another
service worker or add a `notificationclick` listener.

The complete, import-safe [client example](examples/server-reminders.tsx) uses only
public `@satinhq/kit` imports. Its `startReminderApp` function shows the route declarations
and the fifth `runApp` argument. In an existing app, retain its routes and layout
and add that notifications option to the existing `runApp` call:

```ts
runApp({ app, routes, navigation, content: App,
  notifications: {
    relay: {
      url: 'https://your-app.example/push/',
      publicKey: publicVAPIDKey,
      token: () => currentClientToken,
    },
  },
})
```

The key is the relay's public VAPID key. Resolve `currentClientToken` from your
existing authenticated session, before the enable gesture. Never put a sender token,
VAPID private key or a shared relay configuration file in the app bundle. The current
relay maps each distinct client bearer token to a configured owner. An app session
token is not automatically a relay token. Your backend must use the same owner mapping.
Follow [private relay setup](../packages/pwakit-push/README.md); keep the Node listener
private, behind trusted HTTPS, with the configured app origin and authentication intact.

Explain that reminders need notifications, then call
`useNotifications().requestAuthorization()` directly from Satin's `Button.onPress`.
Do not await a token fetch or reminder save before that call. Alternatively render
`NotificationPermissionExplainer`, which owns its enable gesture. Request permission
from the installed Home Screen app, not a Safari tab. WebKit requires direct user
interaction for the permission request. See [WebKit's Home Screen Web Push guidance](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).

Observe the hook's `status` and `error`. `requestAuthorization()` resolves without
returning a success receipt. Only `status === 'subscribed'` means Satin has handed
the subscription to the relay successfully. `denied`, `unsupported`, `revoked` and
`rotation-needed` require an explanation or setup recovery; they are not scheduled reminders.
The public hook does not expose the subscription or an unsubscribe method. It already
registers the subscription with the relay, so do not build a second registration path.

## Register one durable schedule version

Persist a new schedule ID locally before sending it. The example's
`registerServerReminder(input, ownerToken)` makes this request to your backend:

```json
{
  "id": "schedule-version-1",
  "reminderId": "reminder-1",
  "listId": "list-1",
  "calendar": { "date": "2026-11-02", "time": "09:00", "timeZone": "America/New_York" }
}
```

Authenticate every request. Derive the owner from the credential, never a body field.
Check that the reminder and list belong to that owner. Load the notification title
and body from authorized server records, or validate them if your app sends them.
Construct the destination server-side as
`{ screen: 'details', version: 1, params: { id: reminderId, list: listId } }`.
Validate it with the same parameter rules as the app. Do not accept arbitrary URLs.
Route validation constrains navigation; it does not authorize access to reminder data.

Resolve the calendar time in its named IANA time zone on the server, using a
maintained time-zone implementation. Persist both the original calendar fields and
the resulting UTC `dueAt`. This minimal request rejects nonexistent or ambiguous
daylight-saving times; ask the app to choose an unambiguous local time. Supporting
a repeated-hour selection needs an explicit offset or disambiguation field in your
backend contract. Do not concatenate a date and
time and call `new Date(...)`; that uses the executing machine's zone. A date-only
reminder needs an explicit app policy for its alert time, communicated before saving.

For this one-shot recipe, the UTC instant stays fixed when the device travels.
Changing the date, time or intended zone creates a new schedule version. Recurrence
and floating local-time reminders are outside this example. They need server-owned
calendar rules and a newly resolved UTC instant for every occurrence.

Within one durable transaction, store the owner, schedule ID, calendar fields,
UTC instant, validated message and state `pending`. A retry with the same owner,
ID and identical canonical request must return the stored receipt without inserting
another job or reviving a cancelled job. A different request with that ID returns 409.
Keep tombstones so IDs cannot be reused. Return 404 for IDs owned by someone else.
The existing SQLite recipe rejects duplicate IDs; add an authenticated lookup and
canonical request comparison in your endpoint to provide this replay behavior.

Return a receipt only after durable acceptance, for example:

```json
{ "id": "schedule-version-1", "state": "pending", "dueAt": "2026-11-02T14:00:00.000Z" }
```

The example validates this receipt. Show "Reminder scheduled" only for a confirmed
`pending` receipt and completed notification setup. A local due-date save or permission
grant alone does not establish that a server will send anything. Keep the receipt's
schedule ID with the local reminder so later cancellation reaches the same job.

## Send due reminders through the existing transport

Use the [single-owner SQLite storage and sender example](../packages/pwakit-push/README.md#scheduled-reminders-need-a-server).
It is a server recipe, not code Satin starts. Your already operated server must run
the sender periodically and monitor failures. Configure `REMINDERS_DB` to the same
private absolute database path for schedule endpoints and sender. Populate its
`Reminder.owner` from authentication and `Reminder.dueAt` from the time-zone resolution.
Store the calendar and canonical request beside that record in the same transaction.

The atomic `pending` to `sending` claim prevents competing invocations from claiming
the same job. Only claimed jobs call the private relay's `/send` using the sender
token, with `owner`, `title`, `body` and the validated route. A matching relay schema is:

```ts
import { notificationRoutes, param } from '@satinhq/push/schema'

const routes = notificationRoutes({
  lists: {},
  details: { params: { id: param.string(), list: param.string() } },
})
// Use routes in the relay config; the client example declares these same parameters.
```

The relay sends a visible classic Web Push and returns counts `accepted`, `expired`
and `failed`. HTTP 200 alone is insufficient. Zero accepted endpoints means no active
subscription accepted the reminder. Partial acceptance and failed endpoints need
reconciliation. Mark the job `sent` only under your documented acceptance policy;
that state means push-service acceptance, not presentation on a device.

## Cancel, edit and reconcile errors

`cancelServerReminder(id, ownerToken)` calls your backend's DELETE endpoint. Use the
same authenticated database module as the sender. A successful cancellation changes
`pending` to `cancelled` before the atomic claim and returns a cancelled receipt.
Repeating it returns that receipt. Missing or foreign IDs return 404. A `sending` or
`sent` job returns 409 because cancellation cannot retract an in-flight or displayed push.

For a due-time edit, await cancellation of the old schedule, then register a new ID.
The two calls are not an atomic replacement. If the second fails, the old schedule
is cancelled and the new one is unscheduled; show that state. A server endpoint can
later provide atomic replacement in one transaction, but the relay does not.
Marking a reminder completed or removing its due date must also cancel its server job.

Keep an offline edit marked "Not synced". Retry registration using the persisted ID
and unchanged request. After a timeout, query your backend's authenticated GET endpoint
for that ID; the request may have committed despite the missing response. A cancellation
timeout is also uncertain. Do not report it as cancelled or send a replacement until
you reconcile it. There is no local offline alert fallback or guaranteed background retry.

The SQLite example leaves uncertain sends in `sending` for operator reconciliation.
Do not automatically reclaim them. A crash after relay acceptance, partial delivery
or a lost response can make a retry send another notification. Atomic schedule claims
and idempotent registration do **not** give exactly-once notification delivery.
The relay generates a new delivery ID for every send and does not accept an idempotency
key. Production automatic retries need durable per-attempt records, bounded backoff
and an explicit duplicate policy; those are not supplied by this recipe.

## Route the notification tap

The example registers `details` with required string parameters `id` and `list`.
`runApp` connects the existing worker inbox and scene route queue automatically.
The worker focuses a scoped app window or opens one when none exists; the document
validates and accepts the destination through Satin's in-memory navigation.
Use these declarations for warm and cold taps. Do not import `@satinhq/kit/internal`,
connect another route listener, call browser history or manually push the same destination.
Load the reminder by its authorized ID and handle deleted or inaccessible records
in the destination. An old delivered notification can still be tapped after cancellation.

`onNotification` is a proposed name, not a public API at this revision.
The current supported tap-routing path is `defineRoutes` plus `runApp`. Tap routing
is also distinct from execution when a push arrives. No app callback in this recipe
promises work at the due instant.

## Delivery limits and verification

Your server's polling interval, downtime and queue delays affect when it requests
delivery. Device connectivity, notification settings and Focus can affect when an
alert appears. The current relay uses a one-hour TTL and normal urgency, with no
public per-send override. TTL limits push-service retention, not an alert's scheduled
display time; see [RFC 8030, section 5.2](https://www.rfc-editor.org/rfc/rfc8030.html#section-5.2).
Apple also requires a visible notification when a push arrives; see
[Apple's Web Push documentation](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers).
Permission can change and subscriptions can expire. Satin reconciles at foreground
opportunities, not through a guaranteed background scheduler. Classic push requires
the existing worker to execute; worker removal can prevent delivery.
