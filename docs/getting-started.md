# Getting started

Build a personal React app for the installed iPhone or iPad Home Screen runtime. This public beta targets iOS 27. For the shortest path from the published package, follow the [Quick start](learn/quick-start.md). This guide is the full reference: start with the local package instructions below, then read [current limitations](limitations.md) for supported behavior and platform constraints.

Satin's APIs follow the declarative style people already use to build iPhone and iPad apps. If you've used SwiftUI, Jetpack Compose or Flutter, it will feel familiar.

## Create an app from this checkout

Use Node 22.12 or later in the 22.x series, or Node 24 or later, and pnpm 10. The following commands pack the preview and its scaffolder locally. Other app dependencies still need registry access. Run the first block at the repository root:

```sh
pnpm install --frozen-lockfile
PREVIEW_DIR="$(mktemp -d "${TMPDIR:-/tmp}/satin-preview.XXXXXX")"
mkdir -p "$PREVIEW_DIR/packages" "$PREVIEW_DIR/scaffolder"
KIT_ARCHIVE="$(node -p "const { name, version } = require('./packages/kit/package.json'); name.replace(/^@/, '').replaceAll('/', '-') + '-' + version + '.tgz'")"
CREATE_ARCHIVE="$(node -p "const { name, version } = require('./packages/create-satin/package.json'); name.replace(/^@/, '').replaceAll('/', '-') + '-' + version + '.tgz'")"
pnpm --filter @satinhq/kit pack --pack-destination "$PREVIEW_DIR/packages"
pnpm --filter create-satin pack --pack-destination "$PREVIEW_DIR/packages"
tar -xzf "$PREVIEW_DIR/packages/$CREATE_ARCHIVE" -C "$PREVIEW_DIR/scaffolder"
```

Packing builds the framework and copies the current starter and guide into the scaffolder. The archive filenames are derived from the package manifests, so the commands follow the configured package names and version. Keep the temporary directory while using this preview, since the app's local dependency points into it.

In the same shell, create the app outside the repository and install its dependencies:

```sh
cd "$PREVIEW_DIR"
node scaffolder/package/bin/create-satin.mjs my-app --yes --name "My App" --id my-app --satin-package "$PREVIEW_DIR/packages/$KIT_ARCHIVE"
cd my-app
npm install
npm run typecheck
npm run build
```

The scaffolder requires an absent or empty destination and does not install dependencies itself. The default starter has Home and Settings tabs, a local reading list, a Your data screen, and notification setup. Sending notifications requires your own authenticated relay configuration.

This flow builds the packages from a checkout. The [Quick start](learn/quick-start.md) creates an app from the published package instead. The scaffold also carries this guide as `GETTING-STARTED.md`.

## Write your first screen

Replace `src/main.tsx` with the following. Keep the generated `src/app.ts`, icons and `vite.config.ts`. Both the runtime and Vite plugin consume the same app definition. This example declares one primary stack and a typed detail destination:

```tsx
import {
  defineApp,
  defineRoutes,
  defineNavigation,
  route,
  param,
  runApp,
  Screen,
  List,
  Section,
  NavigationLink,
  type RouteParameters,
} from '@satinhq/kit'
import { app as appInput } from './app'

const app = defineApp(appInput)
const bookParams = { id: param.string() }

function Home() {
  return (
    <Screen>
      <List id="books">
        <Section header="Books">
          <NavigationLink to="book" params={{ id: 'one' }}>
            My book
          </NavigationLink>
        </Section>
      </List>
    </Screen>
  )
}

function Book({ id }: RouteParameters<typeof bookParams>) {
  return (
    <Screen>
      <List id="book">
        <Section header="Reading notes">Book {id}</Section>
      </List>
    </Screen>
  )
}

const routes = defineRoutes({
  home: route(Home, { title: 'Books', titleDisplay: 'large' }),
  book: route(Book, { params: bookParams, title: 'My book' }),
})
const navigation = defineNavigation(routes, { stack: { root: 'home' } })

declare module '@satinhq/kit' {
  interface Register {
    routes: typeof routes
    navigation: typeof navigation
  }
}

runApp({ app: app, routes: routes, navigation: navigation })
```

Run `npm run typecheck` and `npm run build` again. The plugin emits the install page, manifests, app document and service worker into `dist`. Do not add handwritten manifest metadata, a second router or service-worker registration.

Declare parameter schemas before screen components to avoid circular type inference. Register the routes and navigation once for typed `NavigationLink` and `useNavigation` calls. Use `param.string()`, `.int()`, `.number()`, `.boolean()` or `.enum([...])`, with `.optional()` where needed. Route parameters should be small and stable.

For independent tabs, use `defineNavigation(routes, { tabs: [...] })` and render `TabView`. Each declaration supplies an `id`, `label`, `root` and optional `symbol`. `TabView` renders declared identities and retains their stacks. A controlled `selection` changes only when the parent accepts `onSelectionChange`; launch routing can prepare another tab's stack without overriding that controlled selection. A plain `NavigationStack` stays a stack on iPad; use `NavigationSplitView` for an explicit sidebar and detail. Modal stacks require `<NavigationStack modal root="book" params={{ id: 'one' }} />` inside a Sheet.

## Run and install

The generated `npm run dev` serves a development build on port 5390. `npm run preview` serves `dist` on that port. Both use a strict port check; stop your own server before switching between them. Open the printed address in iOS Simulator Safari or Safari on a supported iPhone or iPad. Desktop browsers are outside the app runtime target.

Release is the default. Open the site root, follow its install link, choose Safari's Add to Home Screen, then launch the Home Screen icon. The app document is `/app/`, and the install guide is `/install`. A physical device needs a trusted HTTPS origin for the service worker and install checks. Local Simulator testing can use localhost. Before testing a deployed build, run:

```sh
npm run check:deploy -- https://your-app.example
```

Use your actual origin. The checker validates deployment metadata and assets; it does not prove keyboard behavior, native pixels or motion. Test the installed app on your target device, including offline launch, editing, navigation and relaunch.

For a built Safari-tab preview, add `updateProfile: 'preview'` to the generated app definition's existing `advanced` object, retaining its scope, start route and install route. Rebuild. This named profile admits supported iOS tabs and may reload on updates. Return to `release` for installed production output. No query parameter enables preview in a release app. Legacy `hot-reload` and `dev` built profiles still require `SATIN_ENABLE_HOT_RELOAD=1`; the named preview does not.

`--start-route` changes the manifest launch document, not a navigation route. It must stay inside `/app/` and name an emitted document. The starter emits `/app/` and `/app/index.html`; the build rejects a missing launch document. `--accent` sets the app tint, while `--background` and `--dark-background` set launch backgrounds. Omit tint to use the framework system blue. `--icon` copies a square PNG.

## Find supported APIs

Import app APIs from `@satinhq/kit`, build integration from `@satinhq/kit/vite`, and let `satinApp()` include framework styles before app CSS. `@satinhq/kit/internal` is for framework development; app lint rejects it. `@satinhq/kit/testing` belongs in tests. `@satinhq/kit/unstable` contains experimental compatibility APIs; consult its generated export inventory before use.

The generated [API reference](../packages/kit/api/reference.md) describes supported exports and behavior. Its declaration links resolve inside the installed package. See the [package guide](../packages/kit/README.md) for examples. A planned feature does not imply that a React prop exists.

Use `NavigationLink` for a destination, `Button` for an action, `LabeledContent` for a value, and `RowLabel` for composed text. Use `Picker pickerStyle="segmented"` for segmented selection. Public fields and Alert's embedded field use `prompt`.

Let the app definition own install metadata and launch backgrounds. Keep the generated status style; components consume framework geometry rather than raw viewport units or safe-area CSS. Satin uses the system font. Do not add font files or recreate missing framework controls in app CSS.

Use [Tailwind with Satin](tailwind.md) for utility classes.

Continue with [application recipes](app-recipes.md), [safe local data and backup restore](data.md), [geometry and theme tokens](tokens.md), [networking](networking.md) and [push sender setup](../packages/push/README.md). The [push relay](../packages/push/README.md) sends immediately; your backend owns reminder scheduling. DatePicker, ColorPicker and ProgressView are available with [documented styles and constraints](controls.md). Photo/file acquisition has no public chooser at this revision. Read the current limitations before depending on these capabilities.

## Screen content and controls

`Screen` owns title, titleDisplay, backButton and toolbar. A List obtains its visible large title from Screen or the route; adding a class never changes that behavior. Put Button inside List/Section to get a row. Outside a List it is a standalone control; put ToolbarItem and ToolbarItemGroup in the Screen toolbar prop to use the contextual glass treatment. `role="destructive"` is preserved in every placement. Press-state machinery belongs to Pressable, not Button.

Toggle, Picker, Stepper and fields adapt to their context. Picker supports menu, inline, segmented and navigationLink styles; navigationLink creates its destination automatically. It restores to the owning screen after a cold launch because the choice page is transient. Disabled pickers cannot change selection. A standalone Stepper renders the stepper control without a list row. Fields accept `prompt`; a field inside GlassEffect uses the standalone editing frame. Glass exposes regular, clear, tint and interactive intent. Presentation treatments and serialized materials are internal. `MenuProps.trigger` remains experimental.

## Restoration, storage and notifications

Without custom content, omit `content`, for example `runApp({ app, routes, navigation, restoration: { maxBytes: 262144 } })`.

`runApp` owns scene creation, selected tabs, launch/notification resolution and lifecycle connections. Declare `param.string()`, `.int()`, `.number()`, `.boolean()` or `.enum([...])`, with `.optional()` where needed. Keep route params small and stable. A failed decoder preserves valid ancestors. `restoration: 'skip'` saves only the prefix before that route; descendants cannot be restored without their parent. A notification to a skipped destination cannot receive a durable acknowledgement for an omitted checkpoint entry.

Use `useSceneStorage('draft', '')` for an entry-local draft and `useAppStorage('units', 'kg')` for an app preference. The second argument is the initial value, never a schema object. Repeated pushes own separate drafts. Keep presentation flags in React `useState(false)`: sheets, alerts, confirmation dialogs, popovers, menus and context menus always start closed after a cold relaunch, with the navigation screen restored underneath. Persist drafts separately, and never persist presentation visibility in scene, preference or app-owned storage. Satin closes legacy scene-stored presentation flags before mounting their renderer.

Checkpoints coalesce and lifecycle events can flush them, but process loss or storage failure can lose recent state. Keep saved records in collections and offer export. `runApp` restoration options configure maxBytes and maxAbsenceMs. Use named List/ScrollView surfaces for scroll recovery and `useUnsavedChanges` for update protection. Do not construct a codec, scene, navigator, route connection or browser-history entry in app code.

Configure `runApp`'s notifications relay with a URL, public key and runtime token callback. Use `NotificationPermissionExplainer` or `useNotifications().requestAuthorization()` from an explicit user action; `setBadge` requests a badge update. Send setup diagnostics from the relay tooling, not a production testing import. Shared server schemas use `@satinhq/push/schema`; no UI module needs to load on the server.

Use useScenePhase, useAppUpdate, useColorScheme, size-class and safe-area hooks for the framework's accepted environment. Glass failures are reported through onGlassError/useGlassErrors. Development builds show them; released apps switch to a lighter material. Installed recordings, not desktop screenshots, establish fidelity.

## Symbols

Bar buttons and tab items use symbols. Use SF-style names as semantic aliases for
Framework7 Icons, not as a promise of Apple artwork:

```tsx
import { Button, SymbolImage } from '@satinhq/kit'

export function SymbolActions({ onShare }: { onShare(): void }) {
  return (
    <>
      <SymbolImage name="star" />
      <Button symbol="square.and.arrow.up" iconOnly aria-label="Share" onPress={onShare} />
    </>
  )
}
```

`NavigationLink` accepts `symbol="doc.text"` alongside its route and text label.
A navigation tab declaration accepts `symbol: 'house'`. Its selected tab chooses
`house.fill` if present. A `<SymbolImage>` supplied through the existing `icon` ReactNode
prop also inherits tab selection. `selected={false}` opts out. `ToolbarItem` accepts
`symbol` and `label` for noninteractive artwork; for an action use a labeled Button
inside ToolbarItem.

`SymbolImage` inherits text size, tint (`currentColor`), and computed font weight.
`weight` accepts ultraLight, thin, light, regular, medium, semibold, bold, heavy,
or black. `scale` accepts small, medium (default), or large. Symbols align their
center 0.356 em above the text baseline. Bar/list/tab symbol point sizes are
22/21.7/23.4 in the framework wrappers. Use `style={{ fontSize: 22 }}` for an
explicit size; numeric sizes are CSS pixels, corresponding to logical iOS points in the calibrated fixed-scale shell.

Symbols are decorative unless `label` or `aria-label` names them. Label an
icon-only Button on the Button, not on its child SymbolImage. `renderingMode` accepts
monochrome (default), hierarchical, or palette with `palette={['red', 'blue']}`.
A glyph's primary/secondary/tertiary paths select colors or 1/0.55/0.3 opacity.
Single-layer glyphs stay single-color; the renderer does not invent semantic
layers from compound path holes.

`SymbolProvider glyphs={source}` extends or overrides the catalogue within its
subtree. A `SymbolGlyph` contains filled `paths` on Framework7's 56-unit grid,
optional `fillRule`, `transform`, and `layer` per path, plus required `provenance`.
Optional `opticalSize` calibrates the SVG box in em; the default is the measured
circle normalization, with per-glyph overrides for measured stock symbols.
The `glyph` prop supplies one directly. Use your own redistributable artwork;
never supply SF Symbols exports or tracings. Missing names render a visible
question-mark square with `data-satin-symbol-placeholder="true"`. Fill selection
falls back to the base glyph when no fill exists. See the installed `node_modules/@satinhq/kit/dist/docs/symbols.md` catalogue for available names; symbol weight and installed fidelity have verification limits.

## Release updates

Release updates apply at cold launch, before first input after opening or returning to the foreground, or at a clean suspension. The first real touch, key, edit, click or wheel event protects the rest of that visible session. Downloads after that point stay silent. A warm resume with no applied update keeps the mounted app and its state; the framework does not restore state after an update reload.

Checks run when ready, on foreground return, on reconnect and every five minutes while visible, plus at suspension. An unanswered check releases its retry lock after 10 seconds. Native drafts, `useUnsavedChanges(dirty)`, active media and another scoped client defer activation, including before first input. iOS may stop JavaScript while backgrounded, so a build shipped during suspension may only be discovered on return. A user who starts interacting before installation finishes keeps the current build until another safe boundary.

At each new-document launch, lookup has an 800 ms deadline. Offline, failed or unanswered lookup opens the cached build. A discovered update downloads and installs behind the launch cover without a total download deadline. The existing isolated ring shows download bytes, reserves its final arc for activation, and remains visible for at least 800 ms on the successor. Eight seconds without new bytes, response-header activity or an installation phase transition counts as a stall; failed precache validation also falls back. The next launch retries. An already waiting worker can activate offline. A clean document returning after at least 15 minutes hidden is reloaded immediately into this same launch check. Short warm resumes keep their document. Unsaved drafts and active media prevent suspension replacement; an app is never reloaded later during visible use to finish a download. `advanced.updateActivation: 'cold-launch-or-explicit'` retains the explicit update action; preview/hot reload keeps its explicit development policy.

The cover, progress ring and launch/install errors belong to one inline, shadow-isolated pre-launch environment generated by `satinApp()`. They do not require React, application CSS or an active worker. The framework hands off only after its styles and content are ready. If your host sets Content Security Policy, add the per-page script and style hashes from `dist/satin-csp.json` to its existing policy and publish those headers with each build. Do not block the inline launch environment while app resources load.

## Public API inventory

<!-- public-api:start -->
| Area | Start here |
| --- | --- |
| App and navigation | `defineApp`, `runApp`, `defineRoutes`, `route`, `param`, `defineNavigation`, `Screen`, `NavigationStack`, `NavigationLink`, `TabView` |
| Lists and controls | `List`, `Form`, `Section`, `Button`, `Toggle`, `Picker`, `TextField`, `TextEditor`, `ContentUnavailableView` |
| Device capabilities | `PhotosPicker`, `FileImporter`, `ShareLink`, `PasteButton` |
| Layout and text | `Text`, `Label`, `Selectable`, `VStack`, `HStack`, `ZStack`, `Spacer`, `Divider`, `ScrollView` |
| Presentation | `Sheet`, `Alert`, `ConfirmationDialog`, `Menu`, `ContextMenu` |
| Animation | `withAnimation`, `Animation` |
| Glass and imagery | `Glass`, `GlassEffect`, `GlassEffectContainer`, `SymbolImage`, `Image` |
| Data and environment | `defineDatabase`, `collection`, `useQuery`, `useRecord`, `useAppStorage`, `useSceneStorage`, `useNotifications`, `useReachability` |

See the packaged API reference for every export, prop and limitation.
<!-- public-api:end -->

### Swipe actions and context menus

Inside `List`, `NavigationLink`, `Button` and `LabeledContent` accept `swipeActions={[{ edge: "leading", actions: leading }, { edge: "trailing", actions: trailing, allowsFullSwipe }]}` and `contextMenu={actions}` (or `{ actions, preview }`). Arrays use the same `Action` type as `Menu`. Use `ContextMenu` around other content. The framework owns gesture arbitration, selection and dismissal. Native VoiceOver Actions rotor entries and haptics remain unavailable; named accessible action buttons are provided.

### Check a deployment before installing

Deploy the complete `dist/` directory at the configured Vite base. After deploying, run:

```sh
pnpm run check:deploy -- https://your-host.example/install
```

The `satin check <url>` command belongs to the framework package, so existing apps and
newly generated apps use the same deployment contract. It checks both manifests, icons,
start URL, install route, service worker and every precached file. Any missing file,
HTML fallback, inconsistent path or insecure remote origin exits nonzero with the URL
and a suggested fix. Run it before sharing the install URL.

For a subpath such as `/fixed/`, set Vite `base: '/fixed/'`, app scope `/fixed/`, and
prefix public icon URLs with `/fixed/`. Serve `dist/` at `/fixed/` and check
`https://your-host.example/fixed/install`. The build cannot infer the server mount.
The install page independently checks its deployment before showing installation steps;
a broken Home Screen launch exposes a Retry error with its last launch stage.

## Developer menu

Vite development builds include a developer menu. Hold two fingers still for one second
anywhere outside selectable content or an editor. Movement, scrolling, a third finger,
and native text selection cancel the hold. The menu uses Satin's Sheet and inset-grouped
List and is never restored with your app's navigation.

Opt a release-mode **test build** in through your Vite configuration:

```ts
satinApp(app, {
  devMenu: { version: '1.2.0-test', statusUrl: 'https://example.com/status' },
})
```

`devMenu: true` also enables it, and so does building with `SATIN_DEV_MENU=1` (plus an optional
`SATIN_DEV_MENU_STATUS_URL`), for test builds that shouldn't edit the app. Normal release builds exclude the menu and its dynamic
chunk. The option includes source revision, app and framework versions, worker build
IDs, platform information, reload and update controls. Test builds allow deliberate
explicit activation even when the app's release policy is cold-launch-only.

Force update requires confirmation and a reachable deployment, removes only the app
scope's generated Satin shell caches, re-registers its worker, then reloads. App storage,
other scopes and legacy caches are kept. Use Check for update and Apply update now for
ordinary testing. Shake opening requires the menu's explicit permission button and is
enabled only for the current session. The gesture recorder control appears only in a
build instrumented with Satin's swipe recorder. Motion opening must be enabled again after each process launch.

### Messaging threads

Use a vertical `ScrollView` with `defaultScrollAnchor="bottom"` and stable
`ScrollTarget` IDs for a thread. `maintainVisibleContentPosition` preserves the
message being read when older messages prepend. The view ref's
`scrollTo(id, 'bottom')` supplies jump-to-latest; avoid trailing space outside the
last target if that command should pin the content end. See the
[messaging scroll guide](messaging-scroll.md) for binding, layout restrictions and the
current native, installed-device and performance evidence boundaries.
### iPad column toolbars

Declare a detail action on that detail screen. Satin keeps it in the detail
navigation bar when using an explicit `NavigationSplitView`:

```tsx
<Screen title="Plant" toolbar={
  <ToolbarItem placement="primaryAction">
    <Button onPress={edit}>Edit</Button>
  </ToolbarItem>
}>
  <List id="plant-details">{rows}</List>
</Screen>
```

`topBarLeading`, `topBarTrailing`, `primaryAction`, `automatic`, `principal`, and
`bottomBar` are supported. Existing `leading`, `trailing`, and `bottom` names remain
compatible. `primaryAction` and `automatic` use the trailing side on this iOS target.
A root screen's toolbar stays in the sidebar. A detail screen's toolbar stays in
the detail column. The framework reserves space for the sidebar toggle on either
side and includes it when constraining the title. Do not place app actions with
`position: absolute` or `position: fixed` over navigation chrome, and do not add
sidebar-specific padding in app code. Use a separate modal NavigationStack for
sheet toolbar ownership.

Other placements, including `secondaryAction` overflow menus and modal
confirmation/cancellation roles, are not yet supported as placement names. Do not
substitute a trailing item and claim the same behavior.

## Credit and release status

Please consider crediting Satin in your app's About screen. This request is optional, not a license requirement. The framework uses MIT. See [LICENSE](../LICENSE) and [the trademark policy](../TRADEMARKS.md). Acknowledgements destinations are registered by default; open them from an About or Settings Button with `useNavigation().showAcknowledgements()`. Set `acknowledgements: false` in `defineApp` to remove the destinations. Distribution notices remain in the build.

iPhone, iPad, iOS, Safari and Liquid Glass are trademarks of Apple Inc. Satin is not affiliated with or endorsed by Apple.

For new content, prefer the optional `Text`, `VStack`, `HStack`, `ZStack`, `Spacer` and `Divider` vocabulary. See [Content](content.md) for examples, lazy containers and current fidelity limits. Plain React and semantic HTML remain supported without warnings or adoption requirements.
