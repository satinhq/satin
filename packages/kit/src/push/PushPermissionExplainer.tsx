import { useEffect } from 'react'
import { Pressable } from '../press/Pressable.tsx'
import { usePushNotifications, type PushNotifications } from './notifications.ts'

/** Mount at the app root so renewals reconcile even when Settings is not visible. */
export function PushNotificationsLifecycle({ controller }: { controller: PushNotifications }) {
  useEffect(() => controller.start(), [controller])
  return null
}
export function PushPermissionExplainer({
  controller,
  title = 'Notifications',
  children,
}: {
  controller: PushNotifications
  title?: string
  children: React.ReactNode
}) {
  const state = usePushNotifications(controller)
  useEffect(() => controller.educate(), [controller])
  return (
    <section className="satin-push-explainer">
      <h2>{title}</h2>
      <div>{children}</div>
      <p role="status">
        {state.status === 'unsupported'
          ? 'Open this app from your iPhone Home Screen to use notifications.'
          : state.status === 'denied'
            ? 'Notifications are off. You can allow them in iPhone Settings → Notifications.'
            : state.status === 'subscribed'
              ? 'Notifications are on.'
              : 'Choose Enable to allow this app to notify you.'}
      </p>
      {state.error && <p role="alert">{state.error}</p>}
      <Pressable
        disabled={['loading', 'unsupported', 'denied', 'requesting'].includes(state.status)}
        onPress={() => {
          void (state.status === 'subscribed' ? controller.unsubscribe() : controller.enable())
        }}
      >
        {state.status === 'subscribed'
          ? 'Turn Off Notifications'
          : state.status === 'requesting'
            ? 'Enabling…'
            : 'Enable Notifications'}
      </Pressable>
      <p>Badge visibility is controlled in iPhone Settings and cannot be read by this app.</p>
    </section>
  )
}

/** A runtime user credential, never a build-time VITE secret. Keep its value in memory. */
export function PushRelayTokenField({ onChange }: { onChange: (token: string) => void }) {
  return (
    <label className="satin-push-token">
      Notification access token
      <input
        data-satin-role="text-input"
        type="password"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        onChange={event => onChange(event.currentTarget.value)}
      />
    </label>
  )
}
