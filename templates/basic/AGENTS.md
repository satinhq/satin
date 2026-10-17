# Building a Satin 27 app

Build for the installed iOS Home Screen runtime. Satin 27 targets iOS 27 appearance on every supported iOS version; it does not switch design language with the host OS. iPad has the same fidelity bar. React renders the app; Satin owns navigation, input, geometry, glass and updates.

Never change `platforms` or disable the platform gate. Never test the app in a non-WebKit browser,
including desktop Chrome or Firefox with an emulated iPhone user-agent. Check the app in Safari
on an iPhone or iPad, or in the iOS Simulator, then install it on the Home Screen for acceptance.
A desktop browser is not a supported way to run a Satin app. If it shows "This app is designed for iPhone and iPad",
move testing to the supported runtime instead of changing `src/app.ts` to bypass the gate.

## Find the contract before writing a screen

This is a developer preview. An exported API is available to compile, not a promise of native equivalence. Use the installed package's version of these offline references:

- [Getting started](GETTING-STARTED.md) explains setup and primary navigation. [IOS-DESIGN.md](IOS-DESIGN.md) explains screen composition.
- The [Satin API reference](node_modules/@satinhq/kit/dist/docs/reference.md) is the naming and coverage authority. It is keyed by Satin export, with behavior, limits and declaration links for every entry point. Search the export name, then follow its declaration link for accepted props, callbacks, overloads and related types. Import type-only contracts with `import type`; they are not controls.
- The [package README](node_modules/@satinhq/kit/README.md) has complete examples for routes, controls, restoration, notifications, symbols, data and adaptive navigation. [Application recipes](node_modules/@satinhq/kit/dist/docs/app-recipes.md) covers editing, failed saves, date editing and progress compositions. Copy a complete example before adapting it, then run `npm run typecheck` and `npm run build` in this app.
- [Local data](node_modules/@satinhq/kit/dist/docs/data.md), [networking](node_modules/@satinhq/kit/dist/docs/networking.md), [messaging scroll](node_modules/@satinhq/kit/dist/docs/messaging-scroll.md) and [geometry tokens](node_modules/@satinhq/kit/dist/docs/tokens.md) describe the supported compositions and their limits. For a growing message composer, follow the messaging guide’s bottom `SafeAreaInset` + `TextEditor minLines/maxLines` recipe; do not add keyboard-height padding or a hidden draft mirror.

The generated family table below uses that same reviewed concept metadata. It is a reading map, not a second prop reference. A concept name in the first column does not create a React prop or import. If a capability is absent, use only a documented composition, reduce the feature to supported behavior, or report it blocked. Do not hand-roll a control, gesture recognizer, geometry adapter or material to conceal a framework gap. Do not import a proposed API from a roadmap.

## Import and execution ownership

| Entry point | Supported use and limits | Exact reference / example |
| --- | --- | --- |
| `@satinhq/kit` | App components, state and hooks. Mount once through `runApp`; let its root own navigation, media, keyboard, restoration and updates. App callbacks own domain validation, writes and user-visible errors. | [Root declarations](node_modules/@satinhq/kit/dist/index.d.ts), family table below, README examples. |
| `@satinhq/kit/styles.css` | Import once in the app entry. Keep system fonts and framework geometry; do not add a global reset or overwrite control internals. | [Stylesheet](node_modules/@satinhq/kit/dist/styles.css), scaffold `src/main.tsx`. |
| `@satinhq/kit/vite` | Use `satinApp` with the same `defineApp` definition used by the runtime. It generates the app, install/unsupported documents, manifest and worker. Lower-level shell and fixture tools (`satinAppShell`, `satinAppFixtures`, `defineAppFixture`) are available from the Node-only `@satinhq/kit/internal/vite` entry, not the stable Vite entry or a second app root. Do not register another worker. | [Build declarations](node_modules/@satinhq/kit/dist/sw/vite.d.ts), scaffold `vite.config.ts`. |
| `@satinhq/kit/install` | Custom install pages only. `readInstallContext` / `useInstallContext` read the generated page context; they throw outside that page. `InstallSteps` and `InstallTip` supply framework instructions. `copyInstallLink` reports clipboard success or the URL to offer manually. `standalone` does not tell a Safari tab whether a clip already exists. | [Install declarations](node_modules/@satinhq/kit/dist/install.d.ts), example below. |
| `@satinhq/kit/server` | Node-only `serveStaticFile` streams static GET/HEAD responses and single byte ranges within a root directory. It supplies no authentication, upload handling, compression or production cache policy. Keep it out of the browser bundle. A successful media response does not prove device playback. | [Server declaration](node_modules/@satinhq/kit/dist/server.d.ts), example below. |
| `@satinhq/kit/testing` | Test-only `assertNavigation` checks the active route in a DOM container. `sendTestNotification` requests a relay token at call time and returns the accepted count. Neither proves physical touches, notification display or delivery. | [Testing declarations](node_modules/@satinhq/kit/dist/testing.d.ts). Example: `assertNavigation(container, 'detail')` after your test navigation; `await sendTestNotification({ url, token })` for an explicitly authorized relay test. |
| `@satinhq/kit/unstable` | Experimental APIs, including MatchedGeometryEffect. Import withAnimation and Animation from stable `@satinhq/kit`. Import eager Lazy stacks/grids, GridItem and their types from `@satinhq/kit`. Low-level composition exports include: `Sidebar`, `DetailList`, `useSplitSelection`, `SidebarSymbol`, with their types. Prefer stable `NavigationSplitView`, `SymbolImage` and root `RowIcon`. Do not combine the low-level sidebar owner with the stable split owner or assume compatible future releases. No stable example depends on this entry point. | [Experimental declarations](node_modules/@satinhq/kit/dist/unstable.d.ts), exact inventory and missing mappings in the concept reference. |
| `@satinhq/kit/internal` | Framework-only engines, measurements and probes. Never import it in an app, including to fill a missing control or tweak motion. Inventory presence is not consumer authorization. | The concept reference explicitly classifies these exports as internal. |

For Safari-tab development output, set `advanced: { updateProfile: 'preview' }` in `defineApp`. Preview may reload on update. Installed production apps use the default `release`.

### Custom install page example

Use this component only as the page configured by `satinApp(app, { installPage: './src/Install.tsx' })`. The framework still owns document head, platform gating and deployment health checks. The install page is outside the running app root.

```tsx
import { InstallSteps, InstallTip, useInstallContext } from '@satinhq/kit/install'

export default function Install() {
  const context = useInstallContext()
  return <main>
    <h1>Install {context.app.name}</h1>
    <InstallSteps />
    <InstallTip />
  </main>
}
```

### Static server example

This is a Node entry, separate from app code. Supply an explicit build directory and unused port when running it. The example does not provide TLS; a deployment needs HTTPS for installation and worker behavior.

```ts
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { serveStaticFile } from '@satinhq/kit/server'

const root = resolve(process.argv[2])
const port = Number(process.argv[3])
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Supply a port')
createServer((request, response) => {
  void serveStaticFile(request, response, root)
}).listen(port, '127.0.0.1')
```

## Choose the framework API

<!-- framework-api:start -->
Generated from the same reviewed metadata as the shipped Satin API reference. Links open the exact package declarations; related type-only exports are listed in that reference.

| Satin exports and declarations | Behavior and ownership | Limits |
| --- | --- | --- |
| [`Overlay`](node_modules/@satinhq/kit/dist/safe-area/Overlay.d.ts) | Layer content over a view without changing its frame. Overlay content respects the enclosing SafeAreaInset and follows the composer on its existing keyboard carrier. | Bottom composer geometry shares the existing inset store. This is the view-content overload; shape-style overlay is not implemented. |
| [`ProgressView`](node_modules/@satinhq/kit/dist/controls/ProgressView.d.ts) | Choose linear, circular or automatic through progressViewStyle. iOS circular uses the shared activity indicator even with a value; indeterminate linear draws an empty track. | Automatic preserves the value-dependent defaults. Circular progress uses the shared activity indicator; indeterminate linear progress draws an empty track. |
| [`GeometryReader`](node_modules/@satinhq/kit/dist/content/layout.d.ts) | Report allocated size through a render-prop proxy; frame reads current viewport or element-relative coordinates. | CSS needs a definite proposal on scrolling axes. Native safeAreaInsets and transformed proposal semantics are unsupported. |
| [`ViewThatFits`](node_modules/@satinhq/kit/dist/content/layout.d.ts) | Select the first child whose CSS ideal size fits the constrained axes, or the last child when none fits. | Give vertical proposals a definite height. Candidates remain mounted; hidden candidates are inert and pause framework tasks and activity indicators. Arbitrary app effects remain active. Selection uses CSS ideal sizes and retains each candidate; hidden children do not unmount. |
| [`useScaledMetric`](node_modules/@satinhq/kit/dist/content/scaledMetric.d.ts) | Scale a finite dimension relative to a WebKit system text style and the measured default system text size. | System font probes are shared per subscribed style and use the same font definitions as Text. largeTitle and callout use fixed-size fallbacks because WebKit lacks their system font keywords. |
| [`Text`](node_modules/@satinhq/kit/dist/content/content.d.ts), [`VStack`](node_modules/@satinhq/kit/dist/content/content.d.ts), [`HStack`](node_modules/@satinhq/kit/dist/content/content.d.ts), [`ZStack`](node_modules/@satinhq/kit/dist/content/content.d.ts), [`Spacer`](node_modules/@satinhq/kit/dist/content/content.d.ts), [`Divider`](node_modules/@satinhq/kit/dist/content/content.d.ts) | Compose content with system text styles, semantic colors, padding and frame props. Plain React and HTML remain supported. | Default spacing and frame proposal differences are documented in content.md. No arbitrary modifier ordering. |
| [`LazyVStack`](node_modules/@satinhq/kit/dist/content/content.d.ts), [`LazyHStack`](node_modules/@satinhq/kit/dist/content/content.d.ts), [`LazyVGrid`](node_modules/@satinhq/kit/dist/content/content.d.ts), [`LazyHGrid`](node_modules/@satinhq/kit/dist/content/content.d.ts), [`GridItem`](node_modules/@satinhq/kit/dist/content/content.d.ts) | Stable eager layouts propose track widths with per-track spacing and alignment. Import these layouts and their types from @satinhq/kit. Use List for long data. | Eager rendering without virtualization. Mixed adaptive tracks and Grid/GridRow are deferred. |
| [`useTask`](node_modules/@satinhq/kit/dist/tasks/useTask.d.ts) | Run cancellable appearance work; an id change or returned runner replaces the current run. Pass the AbortSignal to fetch and publish through commit. | Cancellation is cooperative. Arbitrary setters outside commit cannot be intercepted. Native lifecycle has been measured; this is foreground work, not a Web Worker or background scheduler. |
| [`List`](node_modules/@satinhq/kit/dist/public/controls.d.ts), [`ScrollView`](node_modules/@satinhq/kit/dist/public/scroll.d.ts) | Await a refreshable action on a vertical scroll surface. | The refresh indicator holds a 60-point content inset while the action runs. Its activity animation is shared with ProgressView. |
| [`defineApp`](node_modules/@satinhq/kit/dist/public/definition.d.ts), [`runApp`](node_modules/@satinhq/kit/dist/public/runtime.d.ts), [`defineNavigation`](node_modules/@satinhq/kit/dist/public/structure.d.ts) | Declare install metadata and primary navigation, then mount through runApp once. | One app root and the Home Screen WebKit target. No native multi-window Scene builder. |
| [`preferredColorScheme`](node_modules/@satinhq/kit/dist/app/appearance.d.ts), [`PreferredColorScheme`](node_modules/@satinhq/kit/dist/app/appearanceStore.d.ts), [`runApp`](node_modules/@satinhq/kit/dist/public/runtime.d.ts), [`useColorScheme`](node_modules/@satinhq/kit/dist/public/environment.d.ts) | Set the document scene to light, dark or system through the shared appearance store; runApp accepts an initial preferredColorScheme option. | System or null clears the override. Persist and reapply the choice with useAppStorage. Whole-scene scope including presentations; no per-view or independent sheet preference. |
| [`NavigationStack`](node_modules/@satinhq/kit/dist/public/runtime.d.ts), [`defineRoutes`](node_modules/@satinhq/kit/dist/public/routes.d.ts), [`route`](node_modules/@satinhq/kit/dist/public/routes.d.ts), [`param`](node_modules/@satinhq/kit/dist/push/schema.d.ts), [`useNavigation`](node_modules/@satinhq/kit/dist/public/runtime.d.ts), [`NavigationLink`](node_modules/@satinhq/kit/dist/public/controls.d.ts) | Declare typed destinations and use the framework in-memory navigation stack. | No browser-history router. Route parameters must satisfy the declared schema. |
| [`TabView`](node_modules/@satinhq/kit/dist/public/runtime.d.ts), [`Tab`](node_modules/@satinhq/kit/dist/public/runtime.d.ts) | Retain independent declared tab stacks and restore the selected tab. Optional Tab and TabSection children compose every declared ID once. | Only declared tab styles are supported; no desktop browser support. |
| [`TabSection`](node_modules/@satinhq/kit/dist/tabs/TabSection.d.ts) | Group declared Tab destinations under collapsible sidebar headers. tabPlacement=sidebarOnly excludes group members from floating and compact bars while retaining their stack identities. | Only explicit sidebarOnly placement is supported; automatic section representation in the top bar, tab customization and section header actions are unavailable. Section expansion is retained for this mounted TabView. With no available sidebar, a sidebar-only selection presents the first available primary tab. |
| [`Screen`](node_modules/@satinhq/kit/dist/public/Screen.d.ts) | Set the retained entry title and titleDisplay through Screen. An automatic untitled root omits its bar unless toolbar or back controls need it. | Only the options in ScreenProps exist. Use only the props documented in the declaration. |
| [`ToolbarItem`](node_modules/@satinhq/kit/dist/public/toolbar.d.ts), [`ToolbarItemGroup`](node_modules/@satinhq/kit/dist/public/toolbar.d.ts), [`ToolbarSpacer`](node_modules/@satinhq/kit/dist/public/toolbar.d.ts) | Declare toolbar content through Screen. subtitle replaces inline subtitle content without growing the bar; largeTitle and largeSubtitle replace intrinsically sized expanded rows that scroll away. | Toolbar items use the available capsule and principal placements. Use the declared ToolbarItem props for grouping and sizing. |
| [`List`](node_modules/@satinhq/kit/dist/public/controls.d.ts), [`Form`](node_modules/@satinhq/kit/dist/public/controls.d.ts), [`Section`](node_modules/@satinhq/kit/dist/list-form/ListForm.d.ts), [`ListRow`](node_modules/@satinhq/kit/dist/list-form/ListForm.d.ts) | Own vertical scrolling, grouped or plain rows and section headers and footers. | ListRow siblings compose within one row. Use separate ListRow elements for separate rows. |
| [`List`](node_modules/@satinhq/kit/dist/public/controls.d.ts), [`Form`](node_modules/@satinhq/kit/dist/public/controls.d.ts), [`ListProps`](node_modules/@satinhq/kit/dist/public/controls.d.ts) | Choose default or compact section spacing, or specify a finite nonnegative gap in points. Hide the scroll surface background while retaining row fills. | Compact spacing uses inset-grouped allocations. Numeric gaps change the margin between sections while retaining header/footer allocations. visible retains style and presentation defaults; it does not force an opaque sheet. |
| [`ListRow`](node_modules/@satinhq/kit/dist/list-form/ListForm.d.ts) | Set per-row insets, background and separators through ListRowProps. | Framework geometry ownership still applies. No raw viewport or safe-area CSS. |
| [`ForEach`](node_modules/@satinhq/kit/dist/list-form/editing.d.ts), [`ListRow`](node_modules/@satinhq/kit/dist/list-form/ListForm.d.ts) | Identify rows by id. onDelete adds swipe-to-delete and the edit-mode delete control; onMove adds the reorder handle and drag. Both receive offsets into the declared row sequence. | ForEach must sit directly in a List or Section. Selected-group moves, two-finger selection and VoiceOver move actions are not implemented. |
| [`moving`](node_modules/@satinhq/kit/dist/list-form/offsets.d.ts), [`removing`](node_modules/@satinhq/kit/dist/list-form/offsets.d.ts) | Apply ForEach onMove and onDelete offsets to the data: moving(items, { fromOffsets, toOffset }) and removing(items, offsets) return a new array. | Returns a new array. Store the result with setState to update the rendered rows. |
| [`List`](node_modules/@satinhq/kit/dist/public/controls.d.ts), [`EditButton`](node_modules/@satinhq/kit/dist/public/controls.d.ts), [`useEditMode`](node_modules/@satinhq/kit/dist/list-form/editing.d.ts), [`ListRow`](node_modules/@satinhq/kit/dist/list-form/ListForm.d.ts) | Select one optional id or a Set of ids; EditButton toggles the screen edit mode, showing selection circles for a Set. | Selection identity comes from ForEach ids (no tag). Edit mode is per screen; there is no environment override binding. Plain rows outside edit mode are not keyboard-focusable for selection. |
| [`ScrollView`](node_modules/@satinhq/kit/dist/public/scroll.d.ts), [`ScrollTarget`](node_modules/@satinhq/kit/dist/scroll/ScrollTarget.d.ts) | Own a named scroll region, vertical by default, and address declared targets through its handle or position binding. Standalone views own mount-local scroll state without navigation chrome or scene restoration. | Supported anchoring is in ScrollViewProps, including defaultScrollAnchor and maintainVisibleContentPosition. Only the declared scroll options are supported. |
| [`SafeAreaInset`](node_modules/@satinhq/kit/dist/safe-area/SafeAreaInset.d.ts), [`useSafeAreaInsets`](node_modules/@satinhq/kit/dist/public/environment.d.ts) | Place an accessory on any edge with SafeAreaInset; it joins the one inset chain with the bar, the tab bar, bottom bars and the keyboard. A top accessory sits below the bar (or the large title) and its root background reaches the screen top. | A top inset under a large title stays at the expanded title edge while the title collapses. On an installed iPhone the status band is a flat WebKit fill (top-edge-limitation.md). |
| [`SafeAreaPadding`](node_modules/@satinhq/kit/dist/safe-area/modifiers.d.ts) | Grow the safe area of the content below: scroll views inset their content, Lists lay out their cards inside the padded width, other content is padded. | Bottom padding on a scroll view is a trailing spacer in its content. Nested padding adds up as chained modifiers do. |
| [`ContentMargins`](node_modules/@satinhq/kit/dist/safe-area/modifiers.d.ts) | Margin the content of every scroll view below; a List takes a horizontal margin as its layout margin. | placement scrollIndicators has no effect: Satin draws the indicator in the screen frame. |
| [`SafeAreaBar`](node_modules/@satinhq/kit/dist/safe-area/modifiers.d.ts) | A top or bottom safeAreaInset with no spacing and its own scroll edge blur. | The bar material is a CSS backdrop blur, not the navigation bar edge effect; it does not extend the navigation bar edge or its seam. |
| [`IgnoresSafeArea`](node_modules/@satinhq/kit/dist/safe-area/modifiers.d.ts), [`ScrollView`](node_modules/@satinhq/kit/dist/public/scroll.d.ts) | Wrap any view: one at the top safe edge draws from the screen top and keeps its layout slot; a primary scroll view inside runs under the bars; the keyboard region keeps a bottom SafeAreaInset above the home indicator. | Only a view that starts the screen content extends upward. The bottom edge of non-scroll content is not extended. |
| [`Button`](node_modules/@satinhq/kit/dist/public/controls.d.ts), [`Pressable`](node_modules/@satinhq/kit/dist/press/Pressable.d.ts), [`ControlStyleProvider`](node_modules/@satinhq/kit/dist/public/controlStyle.d.ts) | Use onPress and framework control styles, size and inherited disabled state. buttonBorderShape selects automatic, capsule or a fixed roundedRectangle radius through the shared material shape. | Native style names apply only to the supported styles. Circle and container-concentric button borders are not exposed; plain and List-row buttons have no painted border. Custom ButtonStyle.makeBody controls the visual content; Satin retains button interaction and accessibility. |
| [`Label`](node_modules/@satinhq/kit/dist/public/Label.d.ts), [`LabeledContent`](node_modules/@satinhq/kit/dist/public/controls.d.ts), [`RowLabel`](node_modules/@satinhq/kit/dist/public/controls.d.ts), [`RowIcon`](node_modules/@satinhq/kit/dist/list-form/ListForm.d.ts) | Compose accessible titles, symbols and values with framework row and label styles. Automatic leading List Label symbols inherit app or control tint; explicit symbol colors remain authored. | Custom labels must obey the public noninteractive label contract. |
| [`Toggle`](node_modules/@satinhq/kit/dist/public/controls.d.ts) | Edit a controlled boolean through a framework switch or supported toggle style. | This does not provide every platform ToggleStyle. |
| [`Picker`](node_modules/@satinhq/kit/dist/public/controls.d.ts), [`Choice`](node_modules/@satinhq/kit/dist/list-form/ListForm.d.ts) | Select controlled options using menu, navigationLink, inline or segmented style. | Supported option values and styles come from PickerProps. |
| [`Stepper`](node_modules/@satinhq/kit/dist/public/controls.d.ts) | Increment or decrement a controlled value within declared bounds. | Use a controlled numeric value and the declared Stepper props. |
| [`Slider`](node_modules/@satinhq/kit/dist/public/controls.d.ts) | Drag a controlled value within min...max (default 0...1), continuous or snapped to step, with optional tick marks; the held thumb lifts into the glass control lens. | No minimum/maximum value labels or custom tick content; label is accessibility-only. Only the thumb takes a drag. |
| [`TextField`](node_modules/@satinhq/kit/dist/public/controls.d.ts) | Edit controlled text with prompt, keyboard intent and automatic row placement; vertical axis uses the shared editor with lineLimit. | Plain styling uses textFieldStyle="plain". The style prop accepts inline CSS. WebKit owns the system keyboard; arbitrary native text layout is not exposed. |
| [`SecureField`](node_modules/@satinhq/kit/dist/public/controls.d.ts) | Edit controlled password text through secure system input. | No access to system password-manager internals. |
| [`TextEditor`](node_modules/@satinhq/kit/dist/public/controls.d.ts) | Edit controlled multiline text with framework keyboard geometry. | Only TextEditorProps apply; no arbitrary native text-layout engine. |
| [`useFocusChain`](node_modules/@satinhq/kit/dist/text-input/focusChain.d.ts) | Register and traverse named text-input focus targets with the framework focus chain. | Focus registration uses framework hooks; custom keyboard replacement is unsupported. |
| [`Sheet`](node_modules/@satinhq/kit/dist/public/presentation.d.ts) | Bind sheet visibility and use supported detents and modal navigation. Supplying selection requires onSelectionChange; omitting selection keeps the detent uncontrolled. | Visibility starts closed after relaunch. Persist editor drafts separately, never presentation flags. |
| [`FullScreenCover`](node_modules/@satinhq/kit/dist/public/presentation.d.ts), [`useDismiss`](node_modules/@satinhq/kit/dist/presentation/dismiss.d.ts) | Bind cover visibility; useDismiss pops a pushed screen or dismisses the enclosing presentation. | No interactive dismissal on covers. Visibility starts closed after relaunch. |
| [`Alert`](node_modules/@satinhq/kit/dist/presentation/Presentation.d.ts), [`ConfirmationDialog`](node_modules/@satinhq/kit/dist/presentation/Presentation.d.ts) | Bind framework-owned presentations and declare shared ActionItem actions. Alert text fields use prompt with value/onChange. | Cold launch closes legacy restored flags. Destructive confirmations must start closed. |
| [`Menu`](node_modules/@satinhq/kit/dist/public/actions.d.ts), [`ContextMenu`](node_modules/@satinhq/kit/dist/actions/RowActions.d.ts), [`Action`](node_modules/@satinhq/kit/dist/actions/types.d.ts) | Use one shared action contract for menus and supported list row interactions. | Native VoiceOver Actions rotor entries are unavailable; accessible named actions exist. |
| [`Image`](node_modules/@satinhq/kit/dist/image/Image.d.ts), [`AsyncImage`](node_modules/@satinhq/kit/dist/image/Image.d.ts) | Render packaged or remote artwork with framework-owned geometry, placeholders and failed-content handling. AsyncImage publishes empty, success and failure phases through onPhaseChange. | Remote loading is not a native URLSession cache. The phase callback reports loading state; it does not build alternate content. No Photos library authorization API. |
| [`SymbolImage`](node_modules/@satinhq/kit/dist/symbols/Symbol.d.ts), [`SymbolProvider`](node_modules/@satinhq/kit/dist/symbols/Symbol.d.ts) | Resolve a named catalogue glyph or provider glyph with supported weight, scale and rendering mode. | The bundled catalogue uses Framework7 Icons 5.0.5 (MIT) plus Satin-drawn clean-room additions, not Apple SF Symbols assets. Preserve copyright and license notices. Provider glyphs need their own provenance. Only shipped or registered names exist. |
| [`Glass`](node_modules/@satinhq/kit/dist/public/glassValue.d.ts), [`GlassEffect`](node_modules/@satinhq/kit/dist/public/glass.d.ts), [`GlassEffectContainer`](node_modules/@satinhq/kit/dist/glass/GlassEffect.d.ts) | Use the shared WebGPU glass material and grouped region contract. | Low-level field/outline helpers compute geometry, not a general view modifier. Released apps use blur-and-tint fallback material for unrecoverable WebGPU failures unless strict glass is requested; development builds report the failure. |
| [`useScenePhase`](node_modules/@satinhq/kit/dist/public/environment.d.ts), [`useScreenLifecycle`](node_modules/@satinhq/kit/dist/navigation/navigationContext.d.ts) | Read app foreground state and retained screen lifecycle through framework hooks. | Browser execution can stop when suspended. Screen lifecycle is distinct from app foreground state. |
| [`useSceneStorage`](node_modules/@satinhq/kit/dist/public/environment.d.ts) | Checkpoint an entry-scoped JSON-serializable draft; repeated pushes have independent state. Nullable transitions are supported when allowed by the TypeScript type; runtime validation checks serializability only. | Not presentation visibility. Checkpoints cannot guarantee recovery after storage eviction or every process crash. |
| [`useAppStorage`](node_modules/@satinhq/kit/dist/public/environment.d.ts) | Persist a small app preference across relaunches. | Origin-local WebKit storage, not UserDefaults or an iCloud key-value store. |
| [`useColorScheme`](node_modules/@satinhq/kit/dist/public/environment.d.ts), [`useHorizontalSizeClass`](node_modules/@satinhq/kit/dist/public/environment.d.ts), [`useVerticalSizeClass`](node_modules/@satinhq/kit/dist/public/environment.d.ts), [`systemColor`](node_modules/@satinhq/kit/dist/public/colors.d.ts), [`semanticColor`](node_modules/@satinhq/kit/dist/public/colors.d.ts) | Read accepted appearance and adaptive size classes. systemColor resolves the 18 UIKit system colors; semanticColor resolves document content, fill, background, separator and tint roles, including body portals. | Values follow measured normal-contrast iOS 27 traits. Increased contrast and Display P3 are not supported. Semantic label colors and composited secondary/tertiary foreground can differ. |
| [`SensoryButton`](node_modules/@satinhq/kit/dist/haptics/SensoryButton.d.ts) | SensoryButton selection uses browser native switch-label activation where available. | Only selection and false are accepted. Other feedback kinds are unsupported. Keyboard/assistive activation do not promise a native tick. |
| [`collection`](node_modules/@satinhq/kit/dist/data/database.d.ts), [`defineDatabase`](node_modules/@satinhq/kit/dist/data/database.d.ts), [`newId`](node_modules/@satinhq/kit/dist/data/database.d.ts), [`useQuery`](node_modules/@satinhq/kit/dist/data/database.d.ts), [`useRecord`](node_modules/@satinhq/kit/dist/data/database.d.ts), [`Query`](node_modules/@satinhq/kit/dist/data/database.d.ts), [`storageQuota`](node_modules/@satinhq/kit/dist/public/storage.d.ts) | Use the reactive local database, schema declarations and explicit durability promises. | This is IndexedDB, not SwiftData, Core Data or CloudKit. Storage may be evicted; writes can fail. |
| [`MediaPlayer`](node_modules/@satinhq/kit/dist/media/types.d.ts), [`useMediaPlayer`](node_modules/@satinhq/kit/dist/media/react.d.ts) | Control an app-root media queue and its exposed playback snapshot. | Audio transport only; no VideoPlayer, AVKit or background audio entitlement. Playback depends on WebKit codec support and the server delivering compatible media with byte-range support. |
| [`useNotifications`](node_modules/@satinhq/kit/dist/public/environment.d.ts), [`NotificationPermissionExplainer`](node_modules/@satinhq/kit/dist/public/environment.d.ts) | Request permission from a gesture and use the supported push and badge contract. | Installed Home Screen permission is required. Local scheduled notification delivery is unavailable; use an app-owned authenticated server scheduler. |
| [`useUnsavedChanges`](node_modules/@satinhq/kit/dist/root/runtimeContext.d.ts) | Register unsaved work with the framework navigation and update guard. | This is a framework guard, not a general native interactiveDismissDisabled guarantee. |
| [`useAppUpdate`](node_modules/@satinhq/kit/dist/public/environment.d.ts) | Read the completed update outcome after app launch readiness. defineApp advanced.updateProfile preview admits iOS Safari tabs and live updates. | Preview may reload on update. Release remains the installed production default. |
| [`useReachability`](node_modules/@satinhq/kit/dist/reachability/react.d.ts) | Read framework network and configured server reachability. | No native Network framework path monitor or guarantee that a request will succeed. |
| [`Selectable`](node_modules/@satinhq/kit/dist/root/SatinRoot.d.ts), [`Zoomable`](node_modules/@satinhq/kit/dist/zoom/Zoomable.d.ts) | Declare text selection or an owned zoomable content region. | Page zoom remains disabled by the installed shell; general-purpose gesture composition is unsupported. |
| [`ContentUnavailableView`](node_modules/@satinhq/kit/dist/public/controls.d.ts) | Compose an unavailable-content title, symbol, optional description and actions. Required offline routes use this view. | Supports the explicit title, icon, description and actions composition; no automatic search variant. |
| [`NavigationSplitView`](node_modules/@satinhq/kit/dist/public/runtime.d.ts) | Render the declared primary sidebar root and retained detail stack; compact width collapses to a stack. | Select an existing declared tab; modal and ad hoc root props are not supported. |
| [`Screen`](node_modules/@satinhq/kit/dist/public/Screen.d.ts), [`List`](node_modules/@satinhq/kit/dist/public/controls.d.ts), [`Searchable`](node_modules/@satinhq/kit/dist/search/searchable.d.ts), [`SearchScopes`](node_modules/@satinhq/kit/dist/search/searchable.d.ts), [`SearchSuggestion`](node_modules/@satinhq/kit/dist/search/searchable.d.ts), [`SearchFieldPlacement`](node_modules/@satinhq/kit/dist/search/searchable.d.ts) | Pass searchable={{ text, onChange, prompt, placement, scopes, suggestions, onSubmit }} to Screen or List. placement automatic (default) uses platform placement: on iPhone the bottom toolbar when the screen has no other bottom bar items, else the navigation bar drawer; iPad and scoped fields use the drawer. The drawer owns the field, clear and close buttons, scope bar, suggestions and collapse on scroll; the bottom field rides above the keyboard with a close button while presented. isPresented/onPresentedChange mirror isPresented:. | Bottom toolbar presentation is not animated yet and its scope bar is not drawn (scoped fields stay in the drawer). The search tab bottom field is not drawn; a declared tab role="search" is metadata. Never hand-build a search bar. |
| [`DefaultToolbarItem`](node_modules/@satinhq/kit/dist/public/toolbar.d.ts) | Place <DefaultToolbarItem kind="search" placement="bottomBar" /> in a Screen toolbar to put its searchable field in the bottom bar beside other bottom items (Messages: search, ToolbarSpacer, compose). | Only kind search. Without a ToolbarSpacer the neighbouring item is not merged into the search capsule as natively; iPad keeps the drawer. |
| [`DatePicker`](node_modules/@satinhq/kit/dist/controls/DatePicker.d.ts) | Compact (automatic) style: grey value capsules open the system date or time picker. selection is a Date, or a civil string with no time zone (YYYY-MM-DD, HH:mm, YYYY-MM-DDTHH:mm) for days that must not move across time zones. displayedComponents and in (lowerBound/upperBound, clamped like UIDatePicker). | graphical and wheel styles are unsupported. The open picker is the system UIDatePicker but WebKit adds Reset and Done buttons, centres it rather than anchoring it under the capsule, and does not grey out days outside the range (choices are clamped). See controls.md. |
| [`ColorPicker`](node_modules/@satinhq/kit/dist/controls/ColorPicker.d.ts) | A row with the native colour well; tapping it opens the system colour picker (grid, spectrum, sliders, eyedropper, saved colours). supportsOpacity shows its opacity slider. selection is #RRGGBB or #RRGGBBAA. | The system picker is titled "Colors" instead of the label. Output is sRGB hex; Display P3 choices are converted to sRGB. See controls.md. |
| [`ProgressView`](node_modules/@satinhq/kit/dist/controls/ProgressView.d.ts) | Render labeled indeterminate activity or clamped determinate linear progress with inherited tint and accessible progress values. | Shares the activity animation used by the refresh indicator. See controls.md. |
| [`PhotosPicker`](node_modules/@satinhq/kit/dist/public/filePickers.d.ts), [`PhotosPickerProps`](node_modules/@satinhq/kit/dist/public/filePickers.d.ts), [`FileImporter`](node_modules/@satinhq/kit/dist/public/filePickers.d.ts), [`FileImporterProps`](node_modules/@satinhq/kit/dist/public/filePickers.d.ts) | Use the system file chooser to receive photo or document bytes. Cancel preserves accepted selection; observed owner changes reject stale delivery. | FileImporter uses React component spelling. MIME hints are not content validation. No PhotosPickerItem identity, persistent file access or exact overlapping chooser attribution. Installed acceptance remains pending. |
| [`ScrollView`](node_modules/@satinhq/kit/dist/public/scroll.d.ts), [`ScrollEdgeEffectStyle`](node_modules/@satinhq/kit/dist/scroll/edgePolicy.d.ts), [`ScrollEdgeEffectHidden`](node_modules/@satinhq/kit/dist/scroll/edgePolicy.d.ts), [`ScrollEdgeSelection`](node_modules/@satinhq/kit/dist/scroll/edgePolicy.d.ts) | Select soft/automatic top material and edge-specific visibility through ScrollView props. Boolean visibility selects the top edge. | Hard top material throws an unsupported error. The navigation engine renders only the top edge; selecting other edges creates no material. |
| [`Screen`](node_modules/@satinhq/kit/dist/public/Screen.d.ts), [`ToolbarMinimizationBehavior`](node_modules/@satinhq/kit/dist/navigation/toolbarMinimization.d.ts), [`ToolbarMinimizationRestoration`](node_modules/@satinhq/kit/dist/navigation/toolbarMinimization.d.ts), [`ToolbarMinimizationSafeAreaAdjustment`](node_modules/@satinhq/kit/dist/navigation/toolbarMinimization.d.ts) | Opt into navigation-bar minimization on scroll down/up, reversal or atScrollEdge restoration, and automatic/enabled/disabled safe-area adjustment through Screen or route options. | Opt-in navigation-bar minimization. Use never to keep the bar expanded. |
| [`TabView`](node_modules/@satinhq/kit/dist/public/runtime.d.ts) | Render bottomAccessory content in the retained TabView bottom inset slot. TabView supplies capsule glass by default; set bottomAccessoryMaterial="custom" when the app draws its own material. | A tab can declare role="search" in defineNavigation. No minimizeBehavior or public useBottomAccessoryPlacement contract exists at this revision. The native collapse/inline morph remains incomplete. |
| [`ShareLink`](node_modules/@satinhq/kit/dist/public/deviceActions.d.ts), [`ShareLinkProps`](node_modules/@satinhq/kit/dist/public/deviceActions.d.ts) | Share prepared text, URLs or files through the system share sheet during activation; check file sharing support before handing off. | No Transferable or file-provider integration. Completion is platform handoff, not recipient delivery; AbortError also covers no suitable target. Installed acceptance remains pending. |
| [`PasteButton`](node_modules/@satinhq/kit/dist/public/deviceActions.d.ts), [`PasteButtonProps`](node_modules/@satinhq/kit/dist/public/deviceActions.d.ts) | Read plain text during the user press, with browser permission UI and owner-scoped asynchronous delivery. | No clipboard preflight, arbitrary Transferable content, or reliable distinction between dismissal and denial. WebKit can require an additional Paste confirmation. Installed acceptance remains pending. |
| [`useNamespace`](node_modules/@satinhq/kit/dist/motion/matchedGeometry.d.ts) | Wrap one element with an id and a namespace. In a withAnimation change, a view whose id is removed and re-inserted moves from the old frame to the new one while the pair cross-fades; a matched view that moves animates from its presented frame; an unpaired one fades. Motion is transform and opacity on the compositor; the removed view stays on screen as its own decoded node until the fade ends. | Frame matching only (properties .frame, anchor .center). Corner radius scales with the frame during flight rather than remaining fixed in points. A non-source view does not follow its source outside an animation. Removed glass presenters do not travel. |
| [`MatchedTransitionSource`](node_modules/@satinhq/kit/dist/public/navigationTransition.d.ts), [`NavigationTransition`](node_modules/@satinhq/kit/dist/public/navigationTransition.d.ts), [`defineNamespace`](node_modules/@satinhq/kit/dist/motion/matchedGeometry.d.ts) | Mark the view a push starts from with MatchedTransitionSource (id, namespace) and give the pushed Screen navigationTransition={NavigationTransition.zoom({ sourceID, in })}. The screen grows out of the source on push and shrinks back into it on Back, on the edge back swipe and on a downward drag (scrolled to top); the screen behind dims and recedes. Motion is fitted to an iOS 27 stock native fixture (centre and size springs, tile cross-fade, dim, corner radius, drag geometry) and runs as compositor transforms; only the corner radius is a main-thread value. defineNamespace() shares a namespace between routes. When multiple visible sources share an ID, a user activation selects that copy for both push and return; if it disappears, navigation falls back to the ordinary transition instead of choosing another copy. | Pushed screens only: FullScreenCover and Sheet zooms are not available. The source must be on screen in the covered screen, otherwise the push slides. Downward dismissal accepts initial travel within about 26.6 degrees of vertical. Zoom glass uses the projected navigation route atlas. |
| [`withAnimation`](node_modules/@satinhq/kit/dist/motion/matchedGeometry.d.ts), [`Animation`](node_modules/@satinhq/kit/dist/motion/animationValue.d.ts), [`SpringOptions`](node_modules/@satinhq/kit/dist/motion/animationValue.d.ts) | Stable Satin exports apply synchronous state changes from an event handler, return the callback result and propagate errors. Keyed ForEach rows in List animate reorders; experimental MatchedGeometryEffect views also participate. Animation provides opaque default, smooth, snappy, bouncy and spring({ durationMs, bounce }) values. Existing unstable imports remain compatible. | Other state and style changes do not animate. Use ForEach identities for keyed List animation. No null animation, easing curves, repeatCount, delay, completion or per-update nested timing. Use one outer synchronous update. Negative bounces are not offered. |
| [`useBuildInfo`](node_modules/@satinhq/kit/dist/app/buildInfo.d.ts), [`BuildInfo`](node_modules/@satinhq/kit/dist/app/buildInfo.d.ts) | Read the framework version, unique app build identifier and build time embedded in the running app bundle, including offline launches. | The app build ID is not a git revision or service-worker cache hash. Builds that bypass satinApp report unavailable metadata. Server fetch receipts are separate evidence, not proof of which cached bundle is running. |
| [`Link`](node_modules/@satinhq/kit/dist/web/openURL.d.ts), [`useOpenURL`](node_modules/@satinhq/kit/dist/web/openURL.d.ts), [`WebView`](node_modules/@satinhq/kit/dist/web/WebView.d.ts), [`useWebFrame`](node_modules/@satinhq/kit/dist/web/WebView.d.ts) | Open registered app URLs through in-memory navigation, request an auxiliary web page, or embed an explicitly permissioned frame. | External browser selection is unavailable. Web dispatch is not page completion. Cross-origin or denied frames report status unverified; reload and stop require same-origin access. |
| [`defineWebAuthentication`](node_modules/@satinhq/kit/dist/web/authentication.d.ts), [`useWebAuthentication`](node_modules/@satinhq/kit/dist/web/useWebAuthentication.d.ts) | Prepare a durable authorization-code transaction with PKCE, dispatch popup or redirect from a gesture, and reconcile its callback on return. | Requires secure context, local storage, Web Locks, dedicated uncached callback and server exchange. Bridge reads require a private transaction proof. Token and OpenID Connect validation belong to the server. No native-session or background-completion guarantee. |
| [`cornerClipPath`](node_modules/@satinhq/kit/dist/shapes/corners.d.ts) | Return a CSS clip path for explicit width and height, with continuous or circular rounded corners, a capsule, or an ellipse. Swipe action configurations accept the same shape choices for their revealed row face. | The caller owns sizing outside framework rows. This helper does not change a glass renderer mask. Continuous path coordinates use the measured iOS 27 corner profile. |
| [`useGlassErrors`](node_modules/@satinhq/kit/dist/public/environment.d.ts) | Inspect scoped installation failures, appearance receipts and glass errors using the existing framework diagnostics. | Diagnostic receipts are not native fidelity or installed acceptance evidence. |
| [`useKeyboardMetrics`](node_modules/@satinhq/kit/dist/public/keyboard.d.ts) | Read the framework keyboard adapter metrics for supported editing integration. | No native keyboard-frame API or permission to add an independent keyboard lifecycle. |
<!-- framework-api:end -->

Use `Sheet` for short independent edits, `Alert` for a brief message or text entry, and `ConfirmationDialog` for destructive choices. Each uses `isPresented` and `onPresentedChange`. Give actions stable ids and explicit cancel/destructive roles. Pass the trigger ref as `anchor` for an iPad confirmation. Only the destructive action may write data; handle rejected writes before reporting success. `no-browser-dialog` forbids browser alert, confirm and prompt. See the application recipes for a complete confirmation and failed-save example.

## Hard rules and lint

Use the `satin-lint` checker when available in the framework checkout. Its rule names below are the review vocabulary too. The generated app currently has typecheck/build, not a published lint package; do not claim a lint pass without running that checker.

| Rule | Mechanical check |
| --- | --- |
| Never import `@satinhq/kit/internal` in apps. | `no-internal-import` |
| Mount through Satin; configure head/manifest through `defineApp`. | `no-direct-react-root`, `no-handwritten-app-head` |
| Never add browser history entries or call app-side `replaceState`; use the navigator. Never reload the running app for updates or notification taps. | `no-browser-history`, `no-app-reload` |
| Geometry comes from Satin, including bottom chrome. | `no-fixed-document`, `no-raw-viewport-height`, `no-raw-safe-area-env`, `require-bottom-safe-area-inset` |
| Scroll through `List`/`ScrollView`. | `no-raw-css-overflow-scroll`, `no-raw-inline-overflow-scroll`, `no-webkit-overflow-scrolling-css`, `no-webkit-overflow-scrolling-inline` |
| Activate through Satin controls and `onPress`. Use labelled fields; native-input exceptions need a reason. Keep input type at least 16px. | `no-raw-button`, `no-onclick-activation`, `no-raw-text-input`, `no-small-input-font` |
| Use framework glass; never fake it with a CSS filter or another glass library. | `no-handrolled-glass`, `no-direct-glass-import` |
| Keep appearance on the accepted framework state and zoom inside `Zoomable`. No global selection reset or document-wide touch cancellation. | `no-raw-appearance-query`, `no-page-zoom`, `no-global-selection-reset`, `no-global-touch-listener` |
| Keep framework motion; do not replace menu interaction with CSS active states or custom-property motion. | `no-custom-linear-easing`, `no-native-menu-active`, `no-menu-motion-properties` |
| Keep tab IDs unique, data in collections, permission/badges and worker registration framework-owned. | `no-duplicate-tab-id`, `no-raw-persistent-storage`, `no-direct-push-api`, `no-direct-sw-registration` |

These checks catch recognizable source patterns, not every computed or third-party bypass. Manual review must check component placement, stable scroller IDs, labels, meaningful tab identity, motion provenance, icon licensing, permissions timing, secret handling, route validation and actual device behavior. Do not use suppression to evade the contract. The documented native-input and legacy-storage bridges need a specific integration reason.

## Glass, updates and push

WebGPU draws framework glass. If it cannot render, a released app switches to a simpler CSS material by itself and records a diagnostic; development and strict builds keep the failure visible. `runApp`'s `onGlassError` option lets the app report it. Never catch an error and substitute fake glass.

Release updates apply at launch, before first input after foregrounding, or at a clean suspension. Once the user interacts, downloads stay silent until suspension or relaunch. Mark app drafts with `useUnsavedChanges(dirty)`. Hot reload is explicit development-only configuration, not a production default.

Explain the notification's value before showing `NotificationPermissionExplainer`, only after the owner chooses the notification setting. No launch, login, route-entry or generic first-tap prompt. Keep the public VAPID key and relay URL in client config; private keys and sender credentials stay on the server. Supply owner authentication at runtime.

Use an authenticated HTTPS relay on your deployment. Match closed route rules on client and server. `runApp` owns routing and retries refused transitions when navigation becomes available. A tap uses the current stack or a declared tab; it never reloads an existing app. Send visible title/body/route payloads only, never badge-only pushes or arbitrary destination URLs. Keep the single generated worker. Show denial and retry states; subscription loss or key rotation needs an explicit Enable action. A send receipt and a badge API success do not prove display.

## Before calling the app done

- Run typecheck and production build, and the Satin lint checker if available. State any unavailable check.
- Exercise empty, loading, error and saved states, offline data, relaunch, and backup restore. Protect drafts and confirm destructive actions.
- Check each tab's retained stack, re-tap, scroll restoration, keyboard, selection, labelled controls, large text, Reduce Motion, light/dark, and regular-width iPad layout.
- Check installed warm/cold notification taps and denial/retry if push is used. Scheduled delivery needs a server scheduler; a suspended PWA timer is not an alarm.
- Test the app from its Home Screen icon on the target iPhone and iPad. Report the device, OS, tested flows and any checks you could not run. Desktop checks do not establish installed behavior. Native reference comparisons are Satin framework-maintenance work, not a prerequisite for finishing a personal app.

## Accessibility ownership

Give every screen a meaningful `title`. NavigationStack owns focus after navigation. Keep the real, visible large title as an exposed `h1`; never add a visually hidden focus heading. Inline navigation titles and Back controls are owned by the framework. Keep section headings exposed. Use `iconOnly` and a specific `aria-label` on an icon-only Button or Pressable. Give Toggle and fields meaningful labels; never hide interactive controls from the accessibility tree.

Use system text styles with the `font` shorthand, such as `font: -apple-system-body`, for custom text. Using that keyword as a font family does not enable Dynamic Type. Allow text to wrap and rows to grow. Keep scrollable content in List or ScrollView. Check default, XXXL and accessibility XXXL text, Reduce Motion, Increase Contrast and keyboard focus. Do not replace framework focus handling with route-title live announcements.

## Restoration and route schemas

Declare schema-first screen props with `RouteParameters<typeof params>` and pass the same params object to `route`. Register routes and the `defineNavigation` declaration once. `runApp` prepares every declared primary stack and tab before first paint; render TabView or NavigationStack from that declaration. Never construct scenes, navigators, codecs or route connections in app code. Modal stacks are explicitly `modal` inside Sheet.

Use `useSceneStorage('draft', '')`: its second argument is the initial value, never a schema object. Each pushed entry owns its own state. Keep every presentation flag in React useState(false). Sheets, alerts, confirmation dialogs, popovers, menus and context menus start closed after a relaunch. Persist drafts separately; presentation visibility never belongs in useSceneStorage, useAppStorage or app-owned storage. Satin closes legacy scene-stored flags before mounting their renderer. Navigation and draft restoration are unchanged.

Keep route params small and stable. Valid ancestors survive rejected params. `restoration: 'skip'` stops the saved path before that destination; descendants cannot recover without their parent. Notification delivery is acknowledged durably only when its destination is in the checkpoint. Never change location or browser history for navigation.

Checkpoint writes coalesce. Process loss before a flush, quota failures or cleared storage can lose recent state or permit notification replay. Save domain records in collections and offer export; do not checkpoint secrets or full records. Use useUnsavedChanges for update protection. Configure maxBytes/maxAbsenceMs through runApp's restoration option, with an app ID independent of build hashes. Named scroll surfaces recover when their content is available. Use useAppStorage for small app preferences.

## Full-bleed installation and layout

Satin uses the default opaque status bar. Launch appearance configures background colours. The framework declares installation metadata in the initial HTML and owns live safe-area geometry. Its viewport policy uses `auto` on iPad and compact-axis iPhone windows. `defineApp({ advanced: { viewportFit: 'cover' }, ... })` overrides that policy; `adaptive`, `auto` and `contain` are also accepted.

Status-bar mode is installation metadata. A worker update, reload or runtime meta change does not migrate an existing installation. Report an install-time metadata mismatch to the owner. Never delete or replace a Home Screen app or clip to test a change; preserve its data and let the owner manage installation. If a delete alert appears, choose Cancel and stop device work.

Satin owns the document and keeps the root and scroll surfaces full height. Do not fix the html, body or app mount with app CSS. Use `useSafeAreaInsets()` or the framework inset tokens for interactive content, and let backgrounds paint to the viewport edges. The settings content-origin tokens already include the top inset; do not add it twice. The viewport can grow after launch, so never cache its first height or hardcode a device's status-bar height. A larger CSS viewport ruler does not prove that the host can paint there; use the framework's observed geometry. `physicalInsets` describe comparison coordinates; they are not layout padding. To convert a viewport y coordinate to a calibrated screen y coordinate, add `physicalInsets.top - insets.top`.

Let iOS choose the status-text color. Keep the content behind the clock consistent with the active appearance. Validate cold launch, resume, both appearances, rotation, keyboard and sheets from a fresh Home Screen installation.


## Row actions and context menus

Use `swipeActions={[{ edge: "leading", actions: leading }, { edge: "trailing", actions: trailing, allowsFullSwipe }]}` and `contextMenu`
on `NavigationLink`, `Button` and `LabeledContent` inside a `List`. Use `ContextMenu` with
`actions` and optional `preview` for other content. Menu actions use `id`,
`label`, optional `icon`, `role: 'destructive'`, `disabled` and `onPress`.
Group menu actions with `{ section: [...] }` or `{ id, label, submenu: [...] }`.
Swipe groups flatten to their leaf actions. The first action is the full-swipe
action; set `allowsFullSwipe: false` when revealing actions must never execute one.

Keep gesture timers, horizontal row transforms and long-press callout suppression
inside Satin. Do not build competing app gestures. Persist a deletion in your
collection callback and handle write failures in app state. Context menus require
the shared WebGPU renderer. Native custom VoiceOver rotor actions and haptics are
not implemented by the web component; the framework exposes named buttons for
assistive technology and keyboard access. Installed fidelity is still pending.

## Current app vocabulary and recipes

Use the generated family table and the shipped concept reference as the API contract. A navigation row is `NavigationLink`; an action row is `Button`; a value row is `LabeledContent`; composed row text is `RowLabel`. Segmented selection is `Picker pickerStyle="segmented"`. Notifications use `useNotifications()` and its `setBadge` method. `DatePicker`, `ColorPicker`, `Slider` and `ProgressView` are available. Their availability does not establish installed-device parity. `PhotosPicker` selects one image or video File; `FileImporter` imports document Files. `ShareLink` shares prepared data and `PasteButton` reads plain text during the press. WebKit owns their system prompts. Use these controls instead of an app-owned hidden file input; see their component docs for capability and owner-lifetime limits.

Public `TextField`, `SecureField` and `TextEditor` use `prompt`. `TextEditor` also accepts native textarea props such as `disabled`, but omits `placeholder`. An Alert's embedded `textField` also uses `prompt`. Menu, context-menu and swipe actions use `label` and `onPress`; Alert and ConfirmationDialog actions use the shared `label` and `onPress` fields. Swipe actions are an object with `leading`, `trailing` and `allowsFullSwipe`, not an array.

A painted decorative SVG inside glass uses `role="presentation"` and `focusable="false"`; its containing control supplies the accessible name. Do not put `aria-hidden` on painted glass content: the renderer excludes hidden subtrees. Reserve accessibility hiding for content that does not need to be painted by glass. Do not use `SidebarSymbol` without its explicit unstable import.

The starter offers export and omits import. Before adding replacement import, read the file once, validate every application field and duplicate key, show a preview and replacement counts, offer an export outside the app, and request explicit Replace confirmation. Await the import, keep the parsed backup on failure, and show an actionable error. Cancelling must leave stored data unchanged. TypeScript record types do not validate imported JSON.

Keep editable drafts in the owning primary screen's scene storage or an application collection. Do not depend on modal scene storage for durable drafts. Keep an editor open until an awaited collection write succeeds; retain its draft on failure. Alert and ConfirmationDialog close before their action promise settles, so a returned promise does not keep a save dialog open. Catch failures in application state.

`useQuery` subscribes to collection writes and reads a changed configure callback, so filters can follow app state. It returns `data`, `loading` and `error`, with no retry method. Show loading, error and empty states separately. A remount is not a guaranteed retry for a stored collection error; retain the draft and surface the failure. A refresh must not clear an unsaved draft.

A short sheet with its own screen title and scroll surface uses `<NavigationStack modal root="editor" />` inside Sheet and a registered editor route. Do not reuse the primary NavigationStack inside a sheet. The app owns `isPresented`, selected detent and draft state; Satin owns presentation motion.

Push permission does not schedule reminders. Store the intended time and time zone, send that schedule to an authenticated backend, and let a durable server scheduler send visible pushes. A suspended app's timers cannot deliver an alarm. Show reminder setup failure separately from permission status.

Bar buttons and tab items use symbols. Prefer Button symbol="...", tab `symbol` declarations, and `<SymbolImage name="..." />`; label icon-only actions on their controls. Do not draw app-local replacements for framework symbols or ship SF Symbols assets.

### iPad column toolbars

Declare a detail action on that detail screen. Satin keeps it in the detail
navigation bar inside an explicit NavigationSplitView:

```tsx
import { Button, LabeledContent, List, Screen, ToolbarItem } from '@satinhq/kit'

export function Plant({ edit }: { edit: () => void }) {
  return <Screen title="Plant" toolbar={
  <ToolbarItem placement="primaryAction">
    <Button onPress={edit}>Edit</Button>
  </ToolbarItem>
}>
  <List id="plant-details"><LabeledContent label="Watering" value="Weekly" /></List>
</Screen>
}
```

`topBarLeading`, `topBarTrailing`, `primaryAction`, `automatic`, `principal`, and
`bottomBar`, `confirmationAction`, and `cancellationAction` are supported.
`confirmationAction` uses the trailing side and the native confirmation treatment;
`cancellationAction` uses the leading side. Existing `leading`, `trailing`, and `bottom` names remain
compatible. `primaryAction` and `automatic` use the trailing side on this iOS target.
In an explicit NavigationSplitView, the root screen's toolbar stays in the sidebar. A detail screen's toolbar stays in
the detail column. The framework reserves space for the sidebar toggle on either
side and includes it when constraining the title. Do not place app actions with
`position: absolute` or `position: fixed` over navigation chrome, and do not add
sidebar-specific padding in app code. Use a separate modal NavigationStack for
sheet toolbar ownership.

Other placements, including `secondaryAction` overflow menus,
are not yet supported as placement names. Do not
substitute a trailing item and claim the same behavior.

## Adaptive app structure

NavigationStack always stays one stack. For columns, declare the sidebar root route and render `<NavigationSplitView />` in that tab's `content`; regular width shows its root as the sidebar and selected route as detail, while compact width collapses the same path. Use `<TabView tabViewStyle="sidebarAdaptable" />` to offer the separate tab sidebar on iPad. Portrait presents it over the content; landscape places it beside the content. An explicit saved open/closed preference survives relaunch. Plain TabView + NavigationStack is the default on both devices. iPhone always uses bottom tabs, including landscape.

To opt into iPhone landscape, set `orientations.supported` to `['portrait', 'landscape']` with `fallback: 'none'`; to build a split view, render `NavigationSplitView` explicitly. The `orientations.ipad` override defaults to both orientations in the scaffold. `useHorizontalSizeClass()` and `useVerticalSizeClass()` expose the current window classes. A wide iPhone can have regular horizontal size without becoming an iPad.

The default iPhone manifest requests portrait; `fallback: 'responsive'` keeps the correct phone layout usable if the host ignores the orientation hint. The iPad manifest requests any orientation. These are install-time hints, not a guaranteed orientation lock. Physical enforcement remains pending verification; do not promise rotation is blocked.

For fetch, cancellation, pull-to-refresh, CORS, auth and offline writes, read [Talking to the network](node_modules/@satinhq/kit/dist/docs/networking.md).

## Preview defects and acceptance boundaries

Do not hide known framework defects with app offsets, alternative glass, custom controls or different motion. Glass and presentation material, emergence and performance remain incomplete; some flows drop frames. Pull-to-refresh can show a faint or partly obscured spinner, with sheet placement and dark-material differences. iPad can show an unresolved white status strip in dark appearance. Bottom-composer geometry, retained-tab keyboard recovery, image first-frame behavior, background audio and complete installed update/offline recovery still need device acceptance. These limits apply even when the relevant API compiles.

For API availability, supported compositions and unavailable capabilities, use the generated family table and shipped API reference. SensoryButton uses the native selection tick only for supported label activation. Other sensory actions do not promise a native tick. Use only the supported APIs and documented compositions.

Keep software checks, rendered visual checks and installed-device checks separate in the handoff. A typecheck/build proves package use; it does not prove touch arbitration, keyboard behavior, VoiceOver speech, optical fidelity or cadence. Record the tested package version, device/OS, appearance and exact flow for installed evidence. Label an unavailable device check DEVICE PENDING only if the applicable software and visual checks pass. A visible defect remains a defect, not DEVICE PENDING. Do not declare the preview complete from export coverage alone.

For a requested native-fidelity claim, compare the same screen structure with native originals in light and dark at 100% and 300%, and list visible differences. Framework motion changes require qualified native measurements; app code must retain the shipped motion.

## Content vocabulary

Prefer optional `Text`, `VStack`, `HStack`, `ZStack`, `Spacer` and `Divider` for new content. Import the eager `LazyVStack`, `LazyHStack`, grids, `GridItem` and their types from `@satinhq/kit`; every child mounts. Use `List` for long data. Read the installed `node_modules/@satinhq/kit/dist/docs/content.md` for examples and fidelity limits. Custom React and semantic HTML remain supported; never add adoption warnings or lint rules requiring these components. Keep chrome, scrolling and geometry in the framework.

### Floating controls and framework geometry

Put a floating control above a composer with `Overlay alignment="bottom"` around
its ScrollView, inside the same `SafeAreaInset`. Pass the control as `content`.
The reduced safe area and keyboard carrier belong to Satin. Do not read any
`--satin-*` custom property in app CSS or JavaScript. Use public component props
and `useSafeAreaInsets` for custom layouts. See `docs/messaging-scroll.md`.
