# Notifications

In this guide you explain notifications and request authorization from a person's gesture. It takes about ten minutes.

You need:

- An installed Satin app on iPhone or iPad.
- Your own authenticated push relay configured in `runApp`.

## 1. Read notification status

Call `useNotifications` inside a screen. Without notification configuration, the status is `unsupported`.

<!-- example: notification-status code-only -->

```tsx
import { useNotifications } from '@satinhq/kit'

function NotificationStatus() {
  const notifications = useNotifications()
  return <p>{notifications.status}</p>
}
```

Try it on a device: desktop browsers and the docs preview can't show how notifications behave in an installed app.

What the code does:

- `useNotifications` reads the app's notification runtime.
- `status` is `unsupported`, `notDetermined`, `denied` or `authorized`. Subscription setup and token rotation are internal.
- `setBadge` resolves to `true` when WebKit accepts the request, or `false` when unavailable or failed. Acceptance does not prove that the badge is visible.
- `requestAuthorization` requests authorization after an explanation and a gesture.

## 2. Explain the request

Place `NotificationPermissionExplainer` in your notification settings screen. Its content should explain what this app sends. Its button requests authorization from the person's gesture.

<!-- example: notification-settings code-only -->

```tsx
import { NotificationPermissionExplainer } from '@satinhq/kit'

function NotificationSettings() {
  return (
    <NotificationPermissionExplainer title="Reading reminders">
      <p>Get a reminder when a book is due.</p>
    </NotificationPermissionExplainer>
  )
}
```

This snippet stays Code-only because the system permission prompt belongs to an installed app.

## 3. Connect the relay

Use your own authenticated relay and keep private credentials on the server. Follow [Push relay](../../packages/push/README.md) and [Server-scheduled reminders](../server-reminders.md) for sending, subscription state and retries.

## Next steps

- [Deploy and update](deploy.md)
- [Push relay](../../packages/push/README.md)
- [Server-scheduled reminders](../server-reminders.md)
