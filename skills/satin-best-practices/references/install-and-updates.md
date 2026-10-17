# Install, updates and notifications

## The app definition

`src/app.ts` holds one `defineApp` input, used by both `runApp` and `satinApp` in
`vite.config.ts`. It declares the name, icons, appearance (tint and launch backgrounds),
orientations, capabilities and scope. The framework generates the document head, manifest,
install page and service worker from it.

- Never hand-write `<meta>` or `<link rel="manifest">` tags, and never register a second worker.
- Never change `platforms` or disable the platform gate. A desktop browser showing "This app is
  designed for iPhone and iPad" is correct; move testing to Safari on iOS or the iOS Simulator.
- Status bar style and other install metadata are fixed when the user adds the app to the Home
  Screen. An update cannot change them on an existing installation.
- During development in a Safari tab, set `advanced: { updateProfile: 'preview' }`. Preview may
  reload when an update lands. Installed apps use the default `release` profile.
- A custom install page is a separate entry: `satinApp(app, { installPage: './src/Install.tsx' })`,
  built from `InstallSteps`, `InstallTip` and `useInstallContext` from `@satinhq/kit/install`.
- Serve over HTTPS for installation and the service worker. `@satinhq/kit/server` only streams static
  files; real deployments need their own TLS, auth and cache policy.

## Updates

Release updates behave like iOS app updates: they apply at cold launch, before the first touch
after returning to the foreground, or at a clean suspension. Once the user touches the app, a new
version waits silently until the next suspension or launch. The app is never reloaded under the
user's finger.

- Never call `location.reload()` to apply an update or handle a notification.
- Mark unsaved work with `useUnsavedChanges(dirty)`; it defers activation.
- `useAppUpdate()` reports a completed update after launch, and `useBuildInfo()` reports the
  running build.

## Push notifications

A web app cannot schedule notifications on the device. A suspended app's timers do not fire.
Reminders need a server that stores the schedule (time and time zone) and sends visible pushes.

- Ask for permission only after the user chooses to turn notifications on, from a gesture, and
  explain the benefit first ("Get a reminder at the time you choose"). Use
  `NotificationPermissionExplainer`; never prompt at launch, login or first tap.
- `useNotifications()` exposes the permission state, enable actions and `setBadge`.
- Keep the public VAPID key and relay URL in client config; private keys stay on the server. Use
  an authenticated HTTPS relay.
- Payloads carry a visible title, body and a route that names a registered screen, never an
  arbitrary URL and never badge-only. A tap opens that screen on the existing navigator without
  reloading.
- Show denied and failed states with a way to retry. A send receipt or a successful `setBadge`
  call doesn't prove the user saw anything.

See `node_modules/@satinhq/kit/dist/docs/push.md` and the server reminders guide in the public docs.

The generated HTML owns a closed-shadow pre-launch environment for the cover, first-install progress, applied-update confirmation and failure/retry states. Do not implement these in app React or app CSS. Apply `satin-csp.json` hashes when configuring deployment CSP.
