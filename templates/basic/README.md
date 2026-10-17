# Satin starter

A personal iOS Home Screen app with saved items, typed detail routes and Settings.

## Develop

```sh
npm install
npm run dev
```

Open the printed address at `/app/` in iPhone or iPad Safari, or iOS Simulator
Safari. A physical device needs a reachable trusted HTTPS address. The origin
root is the landing page; `/install` explains Home Screen installation.

## Build and install

```sh
npm run build
npm run preview
```

Preview listens on port 5390. Open its root page in iOS Safari and follow the
install link. On a physical device, serve `dist` over trusted HTTPS. Serve the
whole directory at the origin root, with `index.html` as the navigation fallback.
Use Share > Add to Home Screen, then open the installed icon.

For a built Safari-tab preview, set `advanced: { updateProfile: 'preview' }` in
`src/app.ts`. No environment flag is needed. Use the default `release` profile
for installed apps. Release updates wait for a safe launch; preview builds can
reload while developing. Keep important data backed up.

## App structure

- `src/app.ts` declares identity, launch colors and one source icon. Keep `id`
  stable after installation because it identifies storage and restoration.
- `src/main.tsx` declares Home, detail, Settings and Your data routes. Each tab
  keeps its navigation stack. Search uses `Screen searchable`.
- `src/data.ts` defines the local database. Home reads saved items with `useQuery`;
  detail uses `useRecord` and saves through the collection.
- `src/styles.css` contains optional app typography and spacing.

Use `Button` for actions, `NavigationLink` for navigation and `Selectable` for
prose. Import application components from `@satinhq/kit` and build integration
from `@satinhq/kit/vite`. `satinApp()` includes framework styles before app CSS. Diagnostics and
internal imports are not needed by this starter.

## Data and notifications

Your data exports a JSON backup. The starter does not import or delete data.
Before adding either, provide validation, a preview and confirmation. Data stays
on this device; removing the app or clearing website data can remove it.

Notification setup belongs in the notifications recipe in `GETTING-STARTED.md`.
Configure a server relay and obtain authorization from a user gesture. Never put
server credentials in client code or persist registration credentials in local
storage.

## Launch and glass

The source icon appears against the declared launch background while the app
loads. Satin owns the installed shell, safe areas, update lifecycle and glass.
Release builds fall back to a CSS material when WebGPU cannot render.
`onGlassError` still receives every failure. Development and gate builds keep
renderer failures visible. Check launch and offline relaunch in the installed app.

`GETTING-STARTED.md` links to recipes and the packaged API reference.
`AGENTS.md` describes the application contract. `IOS-DESIGN.md` covers layout and
interaction conventions.
