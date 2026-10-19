# Deploy and update

In this guide you put your app on a static host, check the deployment, and ship a new version to people who installed it. It takes about fifteen minutes.

You need:

- An app from [Quick start](quick-start.md).
- A static host that serves your site over HTTPS. Satin needs no server code.

## 1. Build

```sh
npm run build
```

The build type-checks the app, then writes everything the site needs to `dist/`: the app, its install page, icons, manifests and the offline cache.

## 2. Upload `dist`

Upload the whole `dist/` folder to the root of your site. Most hosts do this from a folder or a Git repository with `npm run build` as the build command and `dist` as the output folder.

Two host settings matter:

- Serve `sw.js` as JavaScript, and let browsers revalidate it. Don't cache it forever.
- Use `index.html` as the fallback for unknown paths.

To serve the app from a subpath such as `/fixed/` instead of the root, see [Check a deployment before installing](../getting-started.md#check-a-deployment-before-installing).

If your host uses Content Security Policy, add the per-page hashes from `dist/satin-csp.json` to its script and style sources. Publish those headers with each build; the inline launch environment must run before app resources arrive. These hashes are additions to your existing policy, not a complete site-wide policy.

## 3. Check the deployment

```sh
npm run check:deploy -- https://your-app.example
```

Use your real address. The check loads what an installing phone would: both manifests, the icons, the start page, the install page, the service worker and every cached file. If anything is missing or inconsistent, it exits with an error, the URL that failed and a suggested fix.

Run it before you share the link. Then [add the app to your Home Screen](installing-and-updates.md) from that address.

## 4. Ship an update

Change the app, then build, upload and check again. Keep the app's `id` and its paths the same, so phones treat the new build as an update of the app they already have.

Installed apps never reload while someone is using them. They pick up the new version:

- when the app is opened from scratch;
- when it comes back to the foreground, before the first touch;
- or when iOS suspends it cleanly.

If the check is slow or the phone is offline, the app opens with the version it already has.

## Good to know

- A passing check means the deployment is complete. Open the installed app once while online, so it can cache itself for offline launches.
- Unsaved edits your app reports with `useUnsavedChanges`, playing media and a second open copy of the app hold an update back until they finish.

## Next steps

- [Notifications](notifications.md): ask for permission and send reminders.
- [Data](data.md): store records on the device and offer backups.
- [Release updates](../getting-started.md#release-updates): the full update policy.

## Serving under a sub-path

Set Vite's `base` once. For example, serve `dist/` at `/ios/`:

```ts
export default defineConfig({
  base: '/ios/',
  plugins: [react(), satinApp(defineApp(app))],
})
```

Keep `icons.source: '/icon-source.png'` in `src/app.ts`. Satin derives the app
scope and start URL as `/ios/`, the install page as `/ios/install`, and prefixes
icon and reachability probe URLs with `/ios/`. Already-prefixed paths stay as
written. Omit `advanced.startRoute`; it names the emitted entry page, not an
in-memory navigation route. Run `satin check https://your-host/ios/` after deploying.

`dist/satin-csp.json` includes each emitted HTML page, including `unsupported.html`.
Apply its script and style hashes to your existing CSP and allow same-origin
external assets. When a deep link serves `index.html` through SPA fallback, use
the policy for that `index.html`, regardless of the requested path. Runtime
appearance and presentation rules use constructed stylesheets and require no
`unsafe-inline` allowance for style elements.

Satin sets Vite's default chunk warning budget to 2,000 kB of minified,
uncompressed JavaScript per chunk. The renderer and its shader compiler account
for about 1.8 MB in the starter. This is a finite runtime budget, not a download
size estimate or a performance guarantee. Vite still prints actual output and
gzip sizes. App growth beyond the budget still warns. Set
`build.chunkSizeWarningLimit` explicitly if your deployment needs a stricter budget.
