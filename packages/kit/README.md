# Satin

Satin builds personal apps for the installed iOS Home Screen runtime. The framework owns navigation, glass, editing, restoration and release updates.

Import app APIs from `@satinhq/kit`, build integration from `@satinhq/kit/vite`, and let `satinApp()` include framework styles before app CSS. For utility classes, follow [Using Tailwind with Satin](dist/docs/tailwind.md). `@satinhq/kit/internal` is for framework development; app lint rejects it. `@satinhq/kit/testing` belongs in tests. `NavigationSplitView` and `SymbolImage` are public app APIs. Legacy `Sidebar`, `DetailList`, `useSplitSelection` and `SidebarSymbol` composition remains in `@satinhq/kit/unstable`; use its generated export inventory for the exact list.

## Declare routes, then primary navigation

Declare parameter schemas before components. This avoids a component/route type-inference cycle:

```tsx
import {
  defineApp,
  defineRoutes,
  defineNavigation,
  route,
  param,
  runApp,
  TabView,
  Screen,
  List,
  Section,
  NavigationLink,
  ToolbarItem,
  Button,
  useNavigation,
  type RouteParameters,
} from '@satinhq/kit'

const app = defineApp({ id: 'reading-list', name: 'Reading List', icons: { source: '/icon.png' } })
const bookParams = { id: param.string(), page: param.int().optional() }

function Home() {
  return (
    <Screen>
      <List id="books">
        <Section>
          <NavigationLink to="book" params={{ id: 'one' }}>
            My book
          </NavigationLink>
        </Section>
      </List>
    </Screen>
  )
}
function Book({ id, page }: RouteParameters<typeof bookParams>) {
  const navigation = useNavigation()
  return (
    <Screen
      toolbar={
        <ToolbarItem placement="topBarTrailing">
          <Button onPress={() => navigation.pop()}>Done</Button>
        </ToolbarItem>
      }
    >
      <List id="book">
        <Section header={`Book ${id}, page ${page ?? 1}`}>Reading notes</Section>
      </List>
    </Screen>
  )
}
const routes = defineRoutes({
  home: route(Home, { title: 'Books', titleDisplay: 'large' }),
  book: route(Book, { params: bookParams, title: ({ id }) => `Book ${id}` }),
})
const navigation = defineNavigation(routes, {
  tabs: [{ id: 'books', label: 'Books', symbol: 'book', root: 'home' }],
})
declare module '@satinhq/kit' {
  interface Register {
    routes: typeof routes
    navigation: typeof navigation
  }
}
function App() {
  return <TabView />
}
runApp({ app: app, routes: routes, navigation: navigation, content: App })
```

`defineNavigation` declares every primary stack before first paint. Use `{ stack: { root: 'home' } }` for a single stack, or `tabs` for independent destinations. A tab may provide a `content` component that wraps `<NavigationStack />` in app providers. `TabView` renders the declared tabs; it accepts a typed `selection` and `onSelectionChange`, not JSX tab declarations. Selection precedence is an explicit controlled `selection`, then a cold-launch or notification target, then the restored selection, then the declaration's `defaultTab`. A controlled tab press calls `onSelectionChange` as a request; the visible tab stays unchanged until its parent supplies a new value. Launch routing still prepares the target stack when controlled selection keeps another tab visible. `Tab` renders one already-declared identity. React wrappers and hooks in `App` are ordinary React; no JSX is scanned.

Register the route map and navigation declaration once, as above. Without registration, bare navigation accepts no route/tab IDs; explicit `typeof routes` and `typeof navigation` generics are available for reusable code. Use schema-first `RouteParameters<typeof schema>` for screen props. `RouteProps` describes an already-built route map, but should not be used to create a circular component declaration.

A sheet may contain `<NavigationStack modal root="book" params={{ id: 'one' }} />`. Modal stacks are explicit and transient. A primary stack hidden in a component remains primary because its identity comes from the declaration. Unknown tabs, duplicate identities, mismatched roots and undeclared primary stacks throw instead of becoming transient. `NavigationStack` always renders one stack. Use `NavigationSplitView` for an explicit sidebar and detail; compact windows collapse those columns into one stack.

## Screen content and controls

`Screen` owns title, titleDisplay, backButton and toolbar. A List obtains its visible large title from Screen or the route; adding a class never changes that behavior. Put Button inside List/Section to get a row. Outside a List it is a standalone control; toolbar Buttons use the existing glass treatment. `role="destructive"` is preserved in every placement. Press-state machinery belongs to Pressable, not Button.

Toggle, Picker, Stepper and fields adapt to their context. Picker supports menu, inline, segmented and navigationLink styles; navigationLink creates its destination automatically. It restores to the owning screen after a cold launch because the choice page is transient. Disabled pickers cannot change selection. A standalone Stepper renders the stepper control without a list row. TextField, SecureField and TextEditor accept `prompt`; TextEditor omits the native `placeholder` prop. Fields inside `GlassEffect` automatically use a clear, unrounded editing frame. `textFieldStyle="plain"` requests that frame anywhere; `textFieldStyle="automatic"` keeps context defaults. Existing CSS `style` objects still style the editing element. `prompt` makes `label` accessibility-only, and `TextEditor` hides its label in a Form. `TextField axis="vertical"` shares TextEditor's content measurement and accepts `lineLimit={6}` or `lineLimit={{ min: 1, max: 6 }}`; it grows with its content independently of its parent's height, then scrolls at the limit. A vertical field defaults to the multiline Return key, preserves Return as a newline and forwards a textarea ref. `lineLimit` applies only to vertical TextField. TextEditor also grows with its content; only an enclosing ScrollView or the keyboard bounds it, and `maxLines` caps a composer. In a Form or List it starts at one line like the stock editor (`minLines` overrides), elsewhere at three. Fields measure 22 pt per line at body size. Password fields stay single-line. Glass exposes regular, clear, tint and interactive intent. Presentation treatments and serialized materials are internal. `MenuProps.trigger` remains unstable.

## Restoration, storage and notifications

Without custom content, omit `content`, for example `runApp({ app, routes, navigation, restoration: { maxBytes: 262144 } })`.

`runApp` owns scene creation, selected tabs, launch/notification resolution and lifecycle connections. Declare `param.string()`, `.int()`, `.number()`, `.boolean()` or `.enum([...])`, with `.optional()` where needed. Keep route params small and stable. A failed decoder preserves valid ancestors. `restoration: 'skip'` saves only the prefix before that route; descendants cannot be restored without their parent. A notification to a skipped destination cannot receive a durable acknowledgement for an omitted checkpoint entry.

Use `useSceneStorage('draft', '')` for an entry-local serializable draft and `useAppStorage('units', 'kg')` for an app preference. The second argument is the initial value, never a schema object. Repeated pushes own separate drafts. Keep presentation visibility in React `useState(false)`: sheets, alerts, confirmation dialogs, popovers, menus and context menus start closed after a relaunch. Satin closes legacy scene-stored presentation flags before mounting their renderer. Persist the draft separately from whether its editor is open.

Checkpoints coalesce and lifecycle events can flush them, but process loss or storage failure can lose recent state. Keep saved records in collections and offer export. `runApp` restoration options configure maxBytes and maxAbsenceMs. Use named List/ScrollView surfaces for scroll recovery and `useUnsavedChanges` for update protection. Do not construct a codec, scene, navigator, route connection or browser-history entry in app code.

Configure `runApp`'s notifications relay with a URL, public key and runtime token callback. Use `NotificationPermissionExplainer` or `useNotifications().requestAuthorization()` from an explicit user action; `setBadge` requests a badge update. Send setup diagnostics from the relay tooling, not a production testing import. Shared server schemas use `@satinhq/push/schema`; no UI module needs to load on the server.

Use useScenePhase, useAppUpdate, useColorScheme, size-class and safe-area hooks for the framework's accepted environment. Glass failures are reported through onGlassError/useGlassErrors. Development builds show them; released apps switch to a lighter material. Installed recordings, not desktop screenshots, establish fidelity.

An Alert text field uses the state supplied by the app. Dismissing or cancelling the alert does not reset that state. For a temporary draft, reset it in the Cancel action's `onPress` callback; keep it when the app should preserve an unfinished edit.

## Release updates

Release updates apply at cold launch, before first input after opening or returning to the foreground, or at a clean suspension. The first real touch, key, edit, click or wheel event protects the rest of that visible session. Downloads after that point stay silent. A warm resume with no applied update keeps the mounted app and its state; the framework does not restore state after an update reload.

Checks run when ready, on foreground return, on reconnect and every five minutes while visible, plus at suspension. An unanswered check releases its retry lock after 10 seconds. Native drafts, `useUnsavedChanges(dirty)`, active media and another scoped client defer activation, including before first input. iOS may stop JavaScript while backgrounded, so a build shipped during suspension may only be discovered on return. A user who starts interacting before installation finishes keeps the current build until another safe boundary.

At cold launch, a waiting worker can activate offline behind the launch screen. Otherwise lookup, discovery and download share an 800 ms budget, followed by a separate 3-second activation limit. Slow, failed or offline checks keep the cached build usable. Optional download bytes never show update progress until the replacement has claimed this document and a safe reload is committed. First-install progress is unchanged. `advanced.updateActivation: 'cold-launch-or-explicit'` retains the explicit update action; preview/hot reload keeps its explicit development policy.

## Choosing contracts without source inspection

Use `NavigationLink`, `Button`, `LabeledContent` and `RowLabel` for list content. Segmented selection is `Picker pickerStyle="segmented"`. Notifications use `useNotifications()` and its `setBadge` method. The inventory below is the naming authority. Satin uses the default opaque status bar.

Action and field contracts differ between presentations and ordinary controls:

```tsx
import {
  Alert,
  Menu,
  TextField,
  type Action,
  type ActionItem,
  type LabeledContentProps,
} from '@satinhq/kit'

const menuActions: readonly Action[] = [
  { id: 'archive', label: 'Archive', onPress: () => console.log('Archive requested') },
]
const dialogActions: readonly ActionItem[] = [
  { id: 'cancel', label: 'Cancel', role: 'cancel' },
  { id: 'save', label: 'Save', onPress: () => console.log('Save requested') },
]
export const swipeActions: LabeledContentProps['swipeActions'] = {
  edge: 'trailing',
  actions: menuActions,
  allowsFullSwipe: false,
}
export function Controls() {
  return (
    <>
      <Menu label="Actions" actions={menuActions} />
      <TextField label="Name" prompt="Enter a name" value="" onChange={() => {}} />
      <Alert
        title="Rename"
        isPresented={false}
        onPresentedChange={() => {}}
        textField={{ label: 'Name', prompt: 'Enter a name', value: '', onChange: () => {} }}
        actions={dialogActions}
      />
    </>
  )
}
```

A returned Alert/ConfirmationDialog action promise does not delay dismissal. Keep an asynchronous editor open in a Sheet, await its collection write, and dismiss after success. Keep the draft and show an error on failure. Store recoverable drafts in the owning primary screen or a collection, rather than depending on modal scene storage.

`useQuery` observes local writes immediately, before persistence completes. Changing its configure callback updates the query selection on the next render. A cached selection stays loaded; initial hydration is asynchronous. The hook has no retry method. For a read retry, deliberately remount the query owner while keeping the editor draft in its parent.

See [application recipes](dist/docs/app-recipes.md) for complete CRUD, short-sheet, date/time/duration, progress, adaptive-navigation examples and the unavailable photo-acquisition boundary, [local data](dist/docs/data.md) for safe restore and file sharing, [tokens](dist/docs/tokens.md) for supported geometry, and [push sender setup](dist/docs/push.md) for the app/backend recipe. The [push sender](dist/docs/push.md) has no scheduler. These compositions use the existing framework controls.

Painted decorative SVG in glass uses `role="presentation"` and `focusable="false"`, with an accessible name on the enclosing control. `aria-hidden` excludes painted subtrees from the glass renderer. Do not hide artwork that needs to be rendered.

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
`weight` accepts ultralight, thin, light, regular, medium, semibold, bold, heavy,
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
falls back to the base glyph when no fill exists. See the shipped [available symbol names](dist/docs/symbols.md) before choosing a name.

## Public API inventory

See the packaged [Satin API reference](dist/docs/reference.md) for behavior, limits, unsupported capabilities and the exact export inventory. The index lists supported APIs and known gaps.

For a Safari-tab development build, set `advanced: { updateProfile: 'preview' }` in `defineApp`. No environment switch is needed. It retains the iOS WebKit platform gate and uses the existing live-update service-worker policy, which may reload on update. Use the default `release` profile for installed production apps and cold-launch update activation. A query parameter cannot opt a release build into preview. The profile does not change status style, viewport geometry, glass or lifecycle ownership.

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
| Data and environment | `defineResource`, `useResource`, `defineDatabase`, `collection`, `useQuery`, `useRecord`, `useAppStorage`, `useSceneStorage`, `useNotifications`, `useReachability` |

See the packaged API reference for every export, prop and limitation.
<!-- public-api:end -->

### Swipe actions and context menus

Inside `List`, `NavigationLink`, `Button` and `LabeledContent` accept `swipeActions={[{ edge: "leading", actions: leading }, { edge: "trailing", actions: trailing, allowsFullSwipe }]}` and `contextMenu={actions}` (or `{ actions, preview }`). Arrays use the same `Action` type as `Menu`. Use `ContextMenu` around other content. The framework owns gesture arbitration, selection and dismissal. Native VoiceOver Actions rotor entries and haptics remain unavailable; named accessible action buttons are provided.

### Local edits

```tsx
import { Button, collection, defineDatabase } from '@satinhq/kit'

const db = defineDatabase({
  name: 'notes',
  version: 1,
  collections: { notes: collection<{ id: string; pinned: boolean }>()({ key: 'id' }) },
})

export function PinButton({ id }: { id: string }) {
  return (
    <Button onPress={() => db.notes.update(id, note => ({ ...note, pinned: !note.pinned }))}>
      Toggle pin
    </Button>
  )
}
```

Local writes update subscribed memory immediately. No busy flag is needed. The returned promise represents durability. Use `db.onError` to display persistence failures; failed writes roll back and are always logged. See [local data](dist/docs/data.md) for transactions and cross-tab semantics.

### Messaging threads

Use a vertical `ScrollView` with `defaultScrollAnchor="bottom"` and stable
`ScrollTarget` IDs for a thread. `maintainVisibleContentPosition` preserves the
message being read when older messages prepend. The view ref's
`scrollTo(id, 'bottom')` supplies jump-to-latest; avoid trailing space outside the
last target if that command should pin the content end. See the
[messaging scroll contract](dist/docs/messaging-scroll.md) for binding, layout restrictions and the
supported composition and API limits. Its
growing-composer recipe uses a bottom `SafeAreaInset` with `TextEditor`
`minLines`/`maxLines`; do not add app-owned keyboard padding or a hidden text
mirror to size the composer.

### Image API index

| Concept | Satin API | Current boundary |
| --- | --- | --- |
| `Image` | `Image` | Local artwork: decoded before it is shown, fit/fill, intrinsic geometry. A push waits for its visible artwork up to a short fitted budget, then starts with the placeholder. |
| `AsyncImage` | `AsyncImage` | Remote artwork: colour placeholder while loading and on failure; never holds a push or glass. Swaps without a fade. |

Import local artwork with `import cover from './cover.jpg?satin-image'`, then render
`<Image src={cover} alt="Album cover" contentMode="fill" sizes="160px" />`.
The app Vite plugin generates display variants, a color placeholder and intrinsic dimensions,
and includes emitted variants in the offline shell. Plain URL strings need authored width/height
or aspectRatio for stable geometry. `priority` requests an early, high-priority decode.
Mounted images retain their shared resources. Unmounted images share a 32 MiB decoded-size cache; evicted artwork is decoded during destination preparation. This bounds application retention, not WebKit resident memory. Failed remote artwork keeps its
placeholder and does not block navigation.

Built media transport uses the ordinary repository server or `satinApp`'s Vite
preview middleware. A Node deployment can import `serveStaticFile` from
`@satinhq/kit/server` and call it with the request, response and built output directory;
an optional fourth argument names an extensionless-route fallback relative to
that directory. It handles GET/HEAD, single byte ranges and container MIME types,
streams bytes, and rejects files outside the real root. Other routes and methods
remain the server's responsibility.

`satin check` probes the first emitted media file with `Range: bytes=0-1` and
requires the built bytes and matching 206 headers. For remote-only media, bundle
a small local probe and select it with `satinApp(app, { mediaProbe:
'media/probe.m4a' })`. The path is relative to build output. This tests the
local deployment origin; remote media delivery and installed playback
are outside this probe. No bundled probe reports NOT APPLICABLE.

### Data initialization and nullable storage

`useSceneStorage<string | null>('photo', null)` and
`useAppStorage<string | null>('photo', null)` accept any JSON-serializable value
allowed by their TypeScript type. Dates, functions, cycles, undefined and lossy
objects are rejected before writing. Scene values are checkpointed by the scene
lifecycle; app preferences persist immediately and notify all mounted consumers.
Previously stored JSON is not checked against the initial value's runtime shape.

`collection<Reminder>({ key: 'id' })` accepts an ordinary interface. Primary keys
must be string fields; indexes must name actual fields. `param.enum(values)`
accepts a readonly literal array and infers its element union. A `string[]` that
has already lost its literal type remains string-valued.

```ts
import { collection, defineDatabase } from '@satinhq/kit'

interface Note {
  id: string
  title: string
}

export const database = defineDatabase({
  name: 'notes', version: 1,
  collections: { notes: collection<Note>({ key: 'id' }) },
  seed: async tx => {
    await tx.notes.put({ id: 'welcome', title: 'Welcome' })
  },
})
```

Seed runs only when IndexedDB creates the database, after all creation migrations,
in their atomic upgrade transaction. It does not run when users clear records,
on reopen, or on later upgrades. Concurrent handles cannot seed twice. A rejected
seed aborts creation and all initialization writes; the opening operation rejects
with that cause, and a later open may retry. Use `tx` inside seed, not the database
handle, and avoid waiting for user interaction or unbounded external work.

Dark launch configuration may omit `statusBar` and inherits the light installation mode.
### Adaptive navigation and orientation

`NavigationStack` always renders one stack; it never promotes the root into a sidebar. Opt into columns with `NavigationSplitView`, rendered as a declared tab's `content` (the declaration's root route is its sidebar). Pushing from that sidebar selects detail; pushes inside detail extend its stack. Compact windows collapse the same path into one stack.

`TabView` keeps bottom tabs on iPhone in both orientations. Regular-width iPad windows use floating top tabs; `tabViewStyle="sidebarAdaptable"` adds the separate tab sidebar. This tab sidebar is distinct from NavigationSplitView's sidebar. `useHorizontalSizeClass()` and `useVerticalSizeClass()` return `'compact' | 'regular'`.

Use `TabSection` to group destinations without creating another stack. Keep all destination IDs in `defineNavigation`, then include each ID once in the composition. `tabPlacement="sidebarOnly"` keeps destinations in sidebar groups. The most recently selected grouped destination also appears in the regular iPad bar; compact bars keep the primary destinations. When the sidebar is unavailable, a restored sidebar-only selection presents the first available primary tab. Section disclosure preserves destination state. Give a section an explicit `id` if its title changes or repeats.

```tsx
import { defineNavigation, defineRoutes, route, Tab, TabSection, TabView } from '@satinhq/kit'

export const musicRoutes = defineRoutes({
  home: route(() => <p>Your home content</p>),
  library: route(() => <p>Your library content</p>),
  search: route(() => <p>Your search content</p>),
  artists: route(() => <p>Your artists content</p>),
  albums: route(() => <p>Your albums content</p>),
})
export const musicNavigation = defineNavigation(musicRoutes, {
  tabs: [
    { id: 'home', label: 'Home', root: 'home' },
    { id: 'library', label: 'Library', root: 'library' },
    { id: 'search', label: 'Search', root: 'search', role: 'search' },
    { id: 'artists', label: 'Artists', root: 'artists' },
    { id: 'albums', label: 'Albums', root: 'albums' },
  ],
})
// Pass musicRoutes, musicNavigation and MusicTabs to runApp.
export function MusicTabs() {
  return <TabView<typeof musicNavigation> tabViewStyle="sidebarAdaptable">
    <Tab<typeof musicNavigation> id="home" />
    <Tab<typeof musicNavigation> id="library" />
    <Tab<typeof musicNavigation> id="search" />
    <TabSection title="Library" tabPlacement="sidebarOnly">
      <Tab<typeof musicNavigation> id="artists" />
      <Tab<typeof musicNavigation> id="albums" />
    </TabSection>
  </TabView>
}
```

A search-role destination appears as the trailing magnifier on iPad and the first sidebar row. Selecting a sidebar destination dismisses the portrait overlay. Landscape keeps its sidebar open. The most recently selected grouped destination remains available in the iPad bar after returning to a primary tab.

The default orientation policy requests iPhone portrait and iPad portrait/landscape. The manifest is selected by device idiom before installation. Configure `orientations: { supported: ['portrait', 'landscape'], fallback: 'none', ipad: { supported: ['portrait', 'landscape'], fallback: 'none' } }` for phone landscape. A portrait-only policy can use `fallback: 'responsive'` to continue rendering the phone layout if the host rotates, or `fallback: 'rotation-overlay'` to request rotation back. Manifest orientation hints do not lock the runtime orientation; the host controls rotation.

## Talking to the network

Use `defineResource` and `useResource` for shared remote content, seeding and prefetch. See [Remote data](dist/docs/remote-data.md). Use `useTask(action, { id })` for cancellable appearance work and pass its returned runner to `List refreshable` or `ScrollView refreshable`. See [Talking to the network](dist/docs/networking.md) for the complete fetch example, guarded state updates, CORS, installed-app authentication, server push and offline writes.

## Content composition

Use `Text`, `VStack`, `HStack`, `ZStack`, `Spacer` and `Divider` as the default vocabulary for new content. They are optional; custom React and semantic HTML are supported without warnings. See [Content](dist/docs/content.md) for examples and supported layout behavior.


## Appearance and scroll settings

ScrollView defaults to the vertical axis. It also works outside NavigationStack,
such as onboarding. Standalone scroll state lasts for the mounted view; it does
not enter navigation restoration or acquire navigation chrome. Keep a stable id.

Use `runApp`'s `preferredColorScheme` option for an initial scene choice, then call
`preferredColorScheme('light')`, `preferredColorScheme('dark')` or
`preferredColorScheme('system')` when a Settings picker changes. `null` also returns
to system appearance. `useColorScheme()` follows the effective choice, as do CSS,
controls, glass and the existing app-background subscriber. Store the user's
preference with `useAppStorage` and reapply it at launch. The setter applies to
this document's whole scene, including presentations; per-view preferences and
independent sheet overrides are not supported. Install-time status-bar styles
remain installation metadata.

`List` and `Form` accept `scrollContentBackground="hidden"` to reveal the
parent's background while retaining row fills. `visible` keeps the existing
style and presentation background policy. It does not make a sheet opaque.
`List`'s `listStyle` selects `plain`, `grouped`, `insetGrouped` or `sidebar`. Its `style` accepts CSSProperties. The internal renderer type is named ListEngineProps.

`listSectionSpacing="default"` retains measured section gaps. A finite
nonnegative number sets the margin between adjacent sections in points, with
the existing terminal inset retained. Header/footer allocations remain intact.
`compact` uses inset-grouped allocations, including 12-point gaps between
headerless sections.

`Glass.tint` accepts `[red, green, blue, alpha]`, each a finite number in 0...1.
For example, `Glass.regular.tintRGBA([0, 0.48, 1, 0.2])`. CSS color strings and 0...255
channels are not accepted.

## Acknowledgements

Satin registers a credit and bundled-license screen by default. Open it from an About or Settings action:

```tsx
import { Button, useNavigation } from '@satinhq/kit'

export function AcknowledgementsAction() {
  const navigation = useNavigation()
  return (
    <Button onPress={() => navigation.showAcknowledgements()}>
      Acknowledgements
    </Button>
  )
}
```

Set `acknowledgements: false` in `defineApp` to remove the screen. The action then returns false. It also returns false while a back gesture owns navigation. This does not remove distribution license notices. Vite builds include `NOTICE.txt`, `licenses.json`, and the runtime notices inside the app scope and offline cache. Satin adds no startup modal or toolbar button.

Please consider crediting Satin in your app About screen. Credit is optional.

iPhone, iPad, iOS, Safari and Liquid Glass are trademarks of Apple Inc. Satin is not affiliated with or endorsed by Apple.

### Tab bar action

`TabView.trailingAction?: ReactNode` places one app action beside the destinations.
Use a symbol `Button`, or a `Menu` with a symbol Button trigger. The action runs
without selecting or re-tapping a tab. Combining it with a search-role tab throws
an error because both need the trailing position. The source checkout includes a complete recipe in `docs/app-recipes.md`.
