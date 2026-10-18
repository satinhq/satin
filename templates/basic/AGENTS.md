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
| Framework styles | Included by `satinApp()` before app CSS. Keep system fonts and framework geometry; do not add a global reset or overwrite control internals. | [Stylesheet](node_modules/@satinhq/kit/dist/styles.css), scaffold `vite.config.ts`. |
| `@satinhq/kit/vite` | Use `satinApp` with the same `defineApp` definition used by the runtime. It includes framework CSS before app CSS and generates the app, install/unsupported documents, manifest and worker. Lower-level shell and fixture tools (`satinAppShell`, `satinAppFixtures`, `defineAppFixture`) are available from the Node-only `@satinhq/kit/internal/vite` entry, not the stable Vite entry or a second app root. Do not register another worker. | [Build declarations](node_modules/@satinhq/kit/dist/sw/vite.d.ts), scaffold `vite.config.ts`. |
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
| [`Overlay`](node_modules/@satinhq/kit/dist/safe-area/Overlay.d.ts) | Layer content over a view without changing its frame. Inside a SafeAreaInset the overlay keeps to the reduced safe area and moves with the keyboard, like the composer. | Only views can be overlaid; there is no shape or style overlay. |
| [`ProgressView`](node_modules/@satinhq/kit/dist/controls/ProgressView.d.ts) | Show an indeterminate spinner or a linear bar for a value, with an optional label, inherited tint and accessible progress values. progressViewStyle chooses linear, circular or automatic. | Circular progress always spins; it does not show a value. Indeterminate linear progress draws an empty track. See controls.md. |
| [`GeometryReader`](node_modules/@satinhq/kit/dist/content/layout.d.ts) | Report the space a reader is given to a render function; frame() reads its position in the viewport or relative to an element. | Inside a scroll view, give it a definite height. The proxy reports no safe-area insets. |
| [`ViewThatFits`](node_modules/@satinhq/kit/dist/content/layout.d.ts) | Show the first child whose natural size fits the constrained axes, or the last child when none fits. | Give it a definite height when it checks the vertical axis. Every child stays mounted: hidden children are inert and pause Satin tasks and activity indicators, but their own effects keep running. |
| [`useScaledMetric`](node_modules/@satinhq/kit/dist/content/scaledMetric.d.ts) | Scale a number with the user's text size, relative to a text style. | largeTitle and callout scale by fixed fallbacks, because WebKit has no system font keyword for them. |
| [`Text`](node_modules/@satinhq/kit/dist/content/content.d.ts), [`VStack`](node_modules/@satinhq/kit/dist/content/content.d.ts), [`HStack`](node_modules/@satinhq/kit/dist/content/content.d.ts), [`ZStack`](node_modules/@satinhq/kit/dist/content/content.d.ts), [`Spacer`](node_modules/@satinhq/kit/dist/content/content.d.ts), [`Divider`](node_modules/@satinhq/kit/dist/content/content.d.ts) | Lay out content with system text styles, semantic colours, padding and frame props. Plain React and HTML still work. | Default spacing and frame differences are listed in content.md. Props apply in a fixed order, not the order you write them. |
| [`LazyVStack`](node_modules/@satinhq/kit/dist/content/content.d.ts), [`LazyHStack`](node_modules/@satinhq/kit/dist/content/content.d.ts) | Lay out a stack whose children keep their state. Use List for long data. | Every child renders at once; there is no virtualization. |
| [`LazyVGrid`](node_modules/@satinhq/kit/dist/content/content.d.ts), [`LazyHGrid`](node_modules/@satinhq/kit/dist/content/content.d.ts), [`GridItem`](node_modules/@satinhq/kit/dist/content/content.d.ts) | Lay out grids with per-track spacing and alignment. Use List for long data. | Every child renders at once; there is no virtualization. An adaptive track must be the only track, and there is no Grid or GridRow. |
| [`useTask`](node_modules/@satinhq/kit/dist/tasks/useTask.d.ts) | Run cancellable work while a screen shows. A change of id, or a call to the returned runner, replaces the current run. Pass the AbortSignal to fetch and publish through commit. | Cancellation is cooperative: state set outside commit cannot be stopped. The work runs in the foreground only; it is not a Web Worker or a background scheduler. |
| [`List`](node_modules/@satinhq/kit/dist/public/controls.d.ts), [`ScrollView`](node_modules/@satinhq/kit/dist/public/scroll.d.ts) | Pass refreshable to a vertical List or ScrollView to add pull to refresh. The indicator stays until the returned promise settles. | The refresh indicator holds a 60 pt inset while the action runs. |
| [`defineApp`](node_modules/@satinhq/kit/dist/public/definition.d.ts), [`runApp`](node_modules/@satinhq/kit/dist/public/runtime.d.ts), [`defineNavigation`](node_modules/@satinhq/kit/dist/public/structure.d.ts) | Declare install metadata and primary navigation, then mount the app once with runApp. | One app root per page, for iPhone and iPad WebKit. There are no multiple windows. |
| [`preferredColorScheme`](node_modules/@satinhq/kit/dist/app/appearance.d.ts), [`PreferredColorScheme`](node_modules/@satinhq/kit/dist/app/appearanceStore.d.ts) | Force light or dark for the whole app, or follow the system. runApp also takes an initial preferredColorScheme. | The override covers the whole app, presentations included; one view or sheet cannot differ. Persist the choice with useAppStorage and apply it at launch. |
| [`NavigationStack`](node_modules/@satinhq/kit/dist/public/runtime.d.ts), [`defineRoutes`](node_modules/@satinhq/kit/dist/public/routes.d.ts), [`route`](node_modules/@satinhq/kit/dist/public/routes.d.ts), [`param`](node_modules/@satinhq/kit/dist/push/schema.d.ts), [`useNavigation`](node_modules/@satinhq/kit/dist/public/runtime.d.ts), [`NavigationLink`](node_modules/@satinhq/kit/dist/public/controls.d.ts) | Declare typed routes and navigate with Satin's in-memory stack. | Navigation does not use browser history. Route params must match the declared schema. |
| [`TabView`](node_modules/@satinhq/kit/dist/public/runtime.d.ts), [`Tab`](node_modules/@satinhq/kit/dist/public/runtime.d.ts) | Each declared tab keeps its own stack, and the selected tab is restored. Tab and TabSection children may arrange the declared tabs, using each id once. Set badge in defineNavigation or pass a live badge to Tab. A number shows a count, dot shows attention, and zero or null clears it. | Only the declared tab styles exist. Desktop browsers are not supported. |
| [`TabSection`](node_modules/@satinhq/kit/dist/tabs/TabSection.d.ts) | Group tabs under collapsible sidebar headers. tabPlacement="sidebarOnly" keeps a group out of the floating and compact tab bars; its tabs keep their stacks. | Only sidebarOnly placement exists: no automatic sections in the top bar, no tab customization and no section header actions. Expansion lasts while the TabView is mounted. With no sidebar, a sidebar-only selection shows the first primary tab. |
| [`Screen`](node_modules/@satinhq/kit/dist/public/Screen.d.ts) | Set the title and title display through Screen. An untitled root with automatic title display shows no bar unless it has toolbar items or a back button. | Title fonts and sizes follow the system; there is no custom title style. |
| [`ToolbarItem`](node_modules/@satinhq/kit/dist/public/toolbar.d.ts), [`ToolbarItemGroup`](node_modules/@satinhq/kit/dist/public/toolbar.d.ts), [`ToolbarSpacer`](node_modules/@satinhq/kit/dist/public/toolbar.d.ts) | Declare toolbar items through Screen. subtitle replaces the inline subtitle without growing the bar; largeTitle and largeSubtitle replace the expanded title rows, which scroll away. | Only the placements in ToolbarItemProps exist. |
| [`List`](node_modules/@satinhq/kit/dist/public/controls.d.ts), [`Form`](node_modules/@satinhq/kit/dist/public/controls.d.ts), [`Section`](node_modules/@satinhq/kit/dist/list-form/ListForm.d.ts), [`ListRow`](node_modules/@satinhq/kit/dist/list-form/ListForm.d.ts) | List and Form own vertical scrolling, grouped or plain rows, and section headers and footers. | A ListRow is always one row: its children sit side by side. Use one ListRow per row. |
| [`List`](node_modules/@satinhq/kit/dist/public/controls.d.ts), [`Form`](node_modules/@satinhq/kit/dist/public/controls.d.ts), [`ListProps`](node_modules/@satinhq/kit/dist/public/controls.d.ts) | Choose default or compact section spacing, or a gap in points. scrollContentBackground="hidden" removes the scroll background and keeps row fills. | A numeric gap changes the space between sections; header and footer space stays. visible keeps the default background; it does not make a sheet opaque. |
| [`ListRow`](node_modules/@satinhq/kit/dist/list-form/ListForm.d.ts) | Set per-row insets, background and separators through ListRowProps. | Satin still owns row geometry. Do not use raw viewport or safe-area CSS in rows. |
| [`ForEach`](node_modules/@satinhq/kit/dist/list-form/editing.d.ts), [`ListRow`](node_modules/@satinhq/kit/dist/list-form/ListForm.d.ts) | Identify rows by id. onDelete adds swipe-to-delete and the edit-mode delete control; onMove adds the reorder handle and drag. Both receive offsets into the declared rows. | ForEach must sit directly in a List or Section. Moving a selected group, two-finger selection and VoiceOver move actions are not available. |
| [`moving`](node_modules/@satinhq/kit/dist/list-form/offsets.d.ts), [`removing`](node_modules/@satinhq/kit/dist/list-form/offsets.d.ts) | Apply ForEach's onMove and onDelete offsets to your data: moving(items, { fromOffsets, toOffset }) and removing(items, offsets) return new arrays. | Each returns a new array; store the result in state to update the rows. |
| [`List`](node_modules/@satinhq/kit/dist/public/controls.d.ts), [`EditButton`](node_modules/@satinhq/kit/dist/public/controls.d.ts), [`useEditMode`](node_modules/@satinhq/kit/dist/list-form/editing.d.ts), [`ListRow`](node_modules/@satinhq/kit/dist/list-form/ListForm.d.ts) | Select one optional id or a Set of ids. EditButton toggles the screen edit mode, which shows selection circles for a Set. | Rows are identified by their ForEach ids. Edit mode belongs to each screen and cannot be set from outside it. Outside edit mode, plain rows cannot be selected with the keyboard. |
| [`ScrollView`](node_modules/@satinhq/kit/dist/public/scroll.d.ts), [`ScrollTarget`](node_modules/@satinhq/kit/dist/scroll/ScrollTarget.d.ts) | A named scroll region, vertical by default. Scroll to a ScrollTarget through the ref handle or a scrollPosition binding. A ScrollView outside a screen keeps its position only while mounted. | Scroll targets, pull to refresh and scroll geometry work only on the vertical axis. |
| [`SafeAreaInset`](node_modules/@satinhq/kit/dist/safe-area/SafeAreaInset.d.ts), [`useSafeAreaInsets`](node_modules/@satinhq/kit/dist/public/environment.d.ts) | Place an accessory on any edge with SafeAreaInset. It shares one inset chain with the navigation bar, the tab bar, bottom bars and the keyboard. A top accessory sits below the bar or large title, and its background reaches the top of the screen. | A top inset under a large title stays at the expanded title edge while the title collapses. On an installed iPhone the status bar area is a flat fill (see top-edge-limitation.md). |
| [`SafeAreaPadding`](node_modules/@satinhq/kit/dist/safe-area/modifiers.d.ts) | Grow the safe area of the content inside: scroll views inset their content, Lists lay out their cards inside the padded width, and other content is padded. | On a scroll view, bottom padding is a spacer at the end of the content. Nested padding adds up. |
| [`ContentMargins`](node_modules/@satinhq/kit/dist/safe-area/modifiers.d.ts) | Set content margins for every scroll view inside; a List takes a horizontal margin as its layout margin. | placement="scrollIndicators" has no effect: Satin draws the scroll indicator in the screen frame. |
| [`SafeAreaBar`](node_modules/@satinhq/kit/dist/safe-area/modifiers.d.ts) | A top or bottom SafeAreaInset with no spacing and its own blur under scrolling content. | The bar uses a CSS backdrop blur, not the navigation bar edge effect, and does not extend the navigation bar. |
| [`IgnoresSafeArea`](node_modules/@satinhq/kit/dist/safe-area/modifiers.d.ts) | Wrap any view. At the top edge it draws from the top of the screen and keeps its layout slot; a primary scroll view inside runs under the bars; keyboard avoidance keeps a bottom SafeAreaInset above the home indicator. | Only a view at the start of the screen content extends upward. Content that does not scroll does not extend through the bottom edge. |
| [`Button`](node_modules/@satinhq/kit/dist/public/controls.d.ts), [`ControlStyleProvider`](node_modules/@satinhq/kit/dist/public/controlStyle.d.ts) | Use onPress, the built-in control styles, control size and inherited disabled state. buttonBorderShape picks automatic, capsule or a rounded rectangle with a fixed radius. | Only the listed button styles exist. There are no circle or container-concentric borders, and plain and list-row buttons draw no border. A custom ButtonStyle draws the content; Satin keeps the press handling and accessibility. |
| [`Pressable`](node_modules/@satinhq/kit/dist/press/Pressable.d.ts) | A tap target with no chrome. It dims while pressed and ignores touches that turn into scrolls. | An icon-only Pressable needs an aria-label. |
| [`Label`](node_modules/@satinhq/kit/dist/public/Label.d.ts), [`LabeledContent`](node_modules/@satinhq/kit/dist/public/controls.d.ts), [`RowLabel`](node_modules/@satinhq/kit/dist/public/controls.d.ts), [`RowIcon`](node_modules/@satinhq/kit/dist/list-form/ListForm.d.ts) | Compose accessible titles, symbols and values with the framework row and label styles. Leading List Label symbols take the app or control tint; symbols with their own colour keep it. | Labels are not interactive, and a custom LabelStyle must return noninteractive content. |
| [`Toggle`](node_modules/@satinhq/kit/dist/public/controls.d.ts) | Edit a controlled boolean with a switch, a button or a custom ToggleStyle. | Only the switch and button styles are built in; anything else needs a custom ToggleStyle. |
| [`Picker`](node_modules/@satinhq/kit/dist/public/controls.d.ts), [`Choice`](node_modules/@satinhq/kit/dist/list-form/ListForm.d.ts) | Choose one controlled option with the menu, navigationLink, inline or segmented style. | Only the menu, navigationLink, inline and segmented styles exist. |
| [`Stepper`](node_modules/@satinhq/kit/dist/public/controls.d.ts) | Increment or decrement a controlled number within its bounds. | Controlled only: pass value and onChange. |
| [`Slider`](node_modules/@satinhq/kit/dist/public/controls.d.ts) | Drag a controlled value between min and max (0 and 1 by default), continuously or in steps, with optional tick marks. The held thumb lifts into the glass control lens. | No minimum or maximum value labels and no custom tick marks. The label is for accessibility only, and only the thumb can be dragged. |
| [`TextField`](node_modules/@satinhq/kit/dist/public/controls.d.ts) | Edit controlled text with a prompt and keyboard intent; in a List or Form it becomes the row. axis="vertical" grows up to lineLimit. | textFieldStyle="plain" removes the field chrome. WebKit owns the system keyboard, and text layout cannot be customized. |
| [`SecureField`](node_modules/@satinhq/kit/dist/public/controls.d.ts) | Edit a controlled password through secure system input. | Password manager support is limited to autofill. |
| [`TextEditor`](node_modules/@satinhq/kit/dist/public/controls.d.ts) | Edit controlled multiline text that stays clear of the keyboard. | Text layout cannot be customized. |
| [`useFocusChain`](node_modules/@satinhq/kit/dist/text-input/focusChain.d.ts) | Register named text fields and move focus through them in order with the return key. | Focus moves only through the fields you register. A custom keyboard is not possible. |
| [`Sheet`](node_modules/@satinhq/kit/dist/public/presentation.d.ts) | Bind sheet visibility and choose detents; a sheet can host a modal NavigationStack. Supplying selection requires onSelectionChange; without selection the detent is uncontrolled. | Sheets start closed after a relaunch. Persist drafts separately, never the presentation flag. |
| [`FullScreenCover`](node_modules/@satinhq/kit/dist/public/presentation.d.ts), [`useDismiss`](node_modules/@satinhq/kit/dist/presentation/dismiss.d.ts) | Bind cover visibility. useDismiss pops a pushed screen or closes the presentation it is in. | Covers cannot be swiped away. They start closed after a relaunch. |
| [`Alert`](node_modules/@satinhq/kit/dist/presentation/Presentation.d.ts), [`ConfirmationDialog`](node_modules/@satinhq/kit/dist/presentation/Presentation.d.ts) | Bind visibility and declare ActionItem actions. An alert text field takes prompt, value and onChange. | Alerts and confirmation dialogs start closed after a relaunch, so a destructive confirmation is never restored open. |
| [`Menu`](node_modules/@satinhq/kit/dist/public/actions.d.ts), [`ContextMenu`](node_modules/@satinhq/kit/dist/actions/RowActions.d.ts), [`Action`](node_modules/@satinhq/kit/dist/actions/types.d.ts) | One action format for menus, context menus and row swipe actions. | Actions have accessible names, but they do not appear in the VoiceOver Actions rotor. |
| [`Image`](node_modules/@satinhq/kit/dist/image/Image.d.ts), [`AsyncImage`](node_modules/@satinhq/kit/dist/image/Image.d.ts) | Show packaged or remote images with reserved geometry, placeholders and failure handling. AsyncImage reports empty, success and failure through onPhaseChange. | Remote images use the browser's HTTP cache. onPhaseChange reports loading state; it does not swap in other content. There is no Photos library access. |
| [`SymbolImage`](node_modules/@satinhq/kit/dist/symbols/Symbol.d.ts), [`SymbolProvider`](node_modules/@satinhq/kit/dist/symbols/Symbol.d.ts) | Draw a named catalogue or provider glyph with a weight, scale and rendering mode. | The bundled symbols are Framework7 Icons 5.0.5 (MIT) plus clean-room glyphs drawn for Satin, not Apple SF Symbols. Keep their copyright and license notices. Provider glyphs need their own provenance. Only shipped or registered names draw. |
| [`Glass`](node_modules/@satinhq/kit/dist/public/glassValue.d.ts), [`GlassEffect`](node_modules/@satinhq/kit/dist/public/glass.d.ts), [`GlassEffectContainer`](node_modules/@satinhq/kit/dist/glass/GlassEffect.d.ts) | Use the shared WebGPU glass material, and group effects in a GlassEffectContainer so they can blend and morph. | If WebGPU fails for good, release builds fall back to a blur-and-tint material unless strict glass is on; development builds report the failure. |
| [`useScenePhase`](node_modules/@satinhq/kit/dist/public/environment.d.ts), [`useScreenLifecycle`](node_modules/@satinhq/kit/dist/navigation/navigationContext.d.ts) | Read whether the app is in the foreground, and each screen's appear, cover and disappear lifecycle. | The browser may stop running the app while it is suspended. A screen's lifecycle is separate from the app's foreground state. |
| [`useSceneStorage`](node_modules/@satinhq/kit/dist/public/environment.d.ts) | Checkpoint a JSON-serializable draft for the current navigation entry; repeated pushes each have their own value. null is allowed where the TypeScript type allows it; at runtime only serializability is checked. | Do not store presentation visibility here. A checkpoint can be lost if the browser evicts storage or the process crashes. |
| [`useAppStorage`](node_modules/@satinhq/kit/dist/public/environment.d.ts) | Keep a small app preference across relaunches. | Stored in the origin's local storage on this device. It does not sync across devices. |
| [`useColorScheme`](node_modules/@satinhq/kit/dist/public/environment.d.ts), [`useHorizontalSizeClass`](node_modules/@satinhq/kit/dist/public/environment.d.ts), [`useVerticalSizeClass`](node_modules/@satinhq/kit/dist/public/environment.d.ts) | Read the appearance Satin is drawing and the horizontal and vertical size classes. | Increased contrast is not reported. Size classes are compact or regular only. |
| [`systemColor`](node_modules/@satinhq/kit/dist/public/colors.d.ts), [`semanticColor`](node_modules/@satinhq/kit/dist/public/colors.d.ts) | systemColor returns the 18 iOS system colours; semanticColor returns content, fill, background, separator and tint colours, which also work in portals. | Values match iOS 27 at normal contrast. Increased contrast and Display P3 are not supported. Semantic label colours and layered secondary or tertiary text can differ slightly from iOS. |
| [`SensoryButton`](node_modules/@satinhq/kit/dist/haptics/SensoryButton.d.ts) | Play the selection tick through the browser's native switch activation where it is available. | Only selection or false. Keyboard and assistive activation may not tick. |
| [`collection`](node_modules/@satinhq/kit/dist/data/database.d.ts), [`defineDatabase`](node_modules/@satinhq/kit/dist/data/database.d.ts), [`newId`](node_modules/@satinhq/kit/dist/data/database.d.ts), [`useQuery`](node_modules/@satinhq/kit/dist/data/database.d.ts), [`useRecord`](node_modules/@satinhq/kit/dist/data/database.d.ts), [`Query`](node_modules/@satinhq/kit/dist/data/database.d.ts), [`storageQuota`](node_modules/@satinhq/kit/dist/public/storage.d.ts) | Use the reactive local database with declared schemas and explicit durability. | Data lives in IndexedDB on this device. The browser may evict it, and writes can fail. |
| [`MediaPlayer`](node_modules/@satinhq/kit/dist/media/types.d.ts), [`useMediaPlayer`](node_modules/@satinhq/kit/dist/media/react.d.ts) | Control the app-wide audio queue and read its playback state. | Audio only, with no video player and no background playback beyond what WebKit allows. Playback depends on WebKit codec support and a server that serves byte ranges. |
| [`useNotifications`](node_modules/@satinhq/kit/dist/public/environment.d.ts), [`NotificationPermissionExplainer`](node_modules/@satinhq/kit/dist/public/environment.d.ts) | Ask for permission from a user gesture and use push notifications and the badge. | Permission requires the app to be installed on the Home Screen. Local scheduled notifications are unavailable; schedule them from your own authenticated server. |
| [`useUnsavedChanges`](node_modules/@satinhq/kit/dist/root/runtimeContext.d.ts) | Tell Satin about unsaved work so a pending app update waits. | It only delays app updates; it does not stop the user from dismissing a sheet. |
| [`useAppUpdate`](node_modules/@satinhq/kit/dist/public/environment.d.ts) | Read whether this launch applied an update, once the app is ready. defineApp advanced.updateProfile "preview" admits Safari tabs and live updates. | Preview builds may reload on update. Release, the default, applies updates only at safe moments. |
| [`useReachability`](node_modules/@satinhq/kit/dist/reachability/react.d.ts) | Read the network status and whether the app's server answers. | It cannot promise that a request will succeed. |
| [`Selectable`](node_modules/@satinhq/kit/dist/root/SatinRoot.d.ts), [`Zoomable`](node_modules/@satinhq/kit/dist/zoom/Zoomable.d.ts) | Allow text selection in a region, or pinch to zoom in a bounded region. | Zoomable is the only region that zooms; the page itself never does. There is no general gesture composition. |
| [`ContentUnavailableView`](node_modules/@satinhq/kit/dist/public/controls.d.ts) | Compose an empty state from a title, a symbol, an optional description and actions. Screens that need the server use it when offline. | Takes an explicit title, icon, description and actions; there is no built-in search variant. |
| [`NavigationSplitView`](node_modules/@satinhq/kit/dist/public/runtime.d.ts) | Show the declared primary root as a sidebar and its pushes as a retained detail column. At compact width it collapses to a stack. | It renders an existing declared stack; it takes no modal or ad hoc root. |
| [`Searchable`](node_modules/@satinhq/kit/dist/search/searchable.d.ts), [`SearchScopes`](node_modules/@satinhq/kit/dist/search/searchable.d.ts), [`SearchSuggestion`](node_modules/@satinhq/kit/dist/search/searchable.d.ts), [`SearchFieldPlacement`](node_modules/@satinhq/kit/dist/search/searchable.d.ts) | Pass searchable={{ text, onTextChange, prompt, placement, scopes, suggestions, onSubmit }} to Screen or List. With automatic placement, iPhone uses the bottom toolbar when the screen has no other bottom bar items, and the navigation bar drawer otherwise; iPad and scoped fields use the drawer. The bar owns the field, its clear and close buttons, the scope bar, suggestions and collapse on scroll. isPresented and onPresentedChange control whether search is active. | The bottom toolbar field does not animate in yet and draws no scope bar, so scoped fields stay in the drawer. A search tab draws no bottom field; role="search" is metadata only. Do not build your own search bar. |
| [`DefaultToolbarItem`](node_modules/@satinhq/kit/dist/public/toolbar.d.ts) | Place <DefaultToolbarItem kind="search" placement="bottomBar" /> in a Screen toolbar to put the search field in the bottom bar beside other items, for example a ToolbarSpacer and a compose button. | Only kind="search". Without a ToolbarSpacer the next item is not merged into the search capsule. iPad keeps the drawer. |
| [`DatePicker`](node_modules/@satinhq/kit/dist/controls/DatePicker.d.ts) | Compact style: grey value capsules open the system date or time picker. selection is a Date, or a time-zone-free string (YYYY-MM-DD, HH:mm or YYYY-MM-DDTHH:mm) for days that must not shift across time zones. displayedComponents picks the date, the time or both, and in sets the range; out-of-range choices are clamped. | No graphical or wheel style. WebKit adds Reset and Done buttons to the system picker, centres it instead of anchoring it to the capsule, and does not grey out days outside the range. See controls.md. |
| [`ColorPicker`](node_modules/@satinhq/kit/dist/controls/ColorPicker.d.ts) | A row with a colour well that opens the system colour picker: grid, spectrum, sliders, eyedropper and saved colours. supportsOpacity adds the opacity slider. selection is #RRGGBB or #RRGGBBAA. | The system picker is titled "Colors", not with the label. Output is sRGB hex; Display P3 choices are converted to sRGB. See controls.md. |
| [`PhotosPicker`](node_modules/@satinhq/kit/dist/public/filePickers.d.ts), [`PhotosPickerProps`](node_modules/@satinhq/kit/dist/public/filePickers.d.ts), [`FileImporter`](node_modules/@satinhq/kit/dist/public/filePickers.d.ts), [`FileImporterProps`](node_modules/@satinhq/kit/dist/public/filePickers.d.ts) | Use the system file chooser to receive photo or document bytes. Cancelling keeps the current selection, and results for a picker that changed meanwhile are dropped. | MIME types are hints, not validation. There is no photo library identifier and no lasting file access, and overlapping choosers cannot always be told apart. Not yet verified in an installed app. |
| [`ScrollView`](node_modules/@satinhq/kit/dist/public/scroll.d.ts), [`ScrollEdgeEffectStyle`](node_modules/@satinhq/kit/dist/scroll/edgePolicy.d.ts), [`ScrollEdgeEffectHidden`](node_modules/@satinhq/kit/dist/scroll/edgePolicy.d.ts), [`ScrollEdgeSelection`](node_modules/@satinhq/kit/dist/scroll/edgePolicy.d.ts) | Choose soft or automatic material under the top bar, and hide it per edge, through ScrollView props. A boolean applies to the top edge. | The hard style throws an unsupported error. Only the top edge draws material; other edges draw none. |
| [`Screen`](node_modules/@satinhq/kit/dist/public/Screen.d.ts), [`ToolbarMinimizationBehavior`](node_modules/@satinhq/kit/dist/navigation/toolbarMinimization.d.ts), [`ToolbarMinimizationRestoration`](node_modules/@satinhq/kit/dist/navigation/toolbarMinimization.d.ts), [`ToolbarMinimizationSafeAreaAdjustment`](node_modules/@satinhq/kit/dist/navigation/toolbarMinimization.d.ts) | Opt in to navigation bar minimization on scroll down or up, choose whether it returns on reversal or only at the scroll edge, and whether the content inset adjusts, through Screen or route options. | Navigation bar minimization is opt-in; never keeps the bar expanded. |
| [`TabView`](node_modules/@satinhq/kit/dist/public/runtime.d.ts) | Show bottomAccessory content in the TabView bottom slot. TabView draws capsule glass behind it; set bottomAccessoryMaterial="custom" when the app draws its own. | There is no minimize behavior or placement hook yet, and the collapse into the tab bar is incomplete. |
| [`ShareLink`](node_modules/@satinhq/kit/dist/public/deviceActions.d.ts), [`ShareLinkProps`](node_modules/@satinhq/kit/dist/public/deviceActions.d.ts) | Share prepared text, URLs or files through the system share sheet during the press. Check that file sharing is supported before handing files off. | No drag and drop or file provider integration. Completion means the system took the share, not that anyone received it; AbortError also covers having no suitable target. Not yet verified in an installed app. |
| [`PasteButton`](node_modules/@satinhq/kit/dist/public/deviceActions.d.ts), [`PasteButtonProps`](node_modules/@satinhq/kit/dist/public/deviceActions.d.ts) | Read plain text when the user presses, with the browser permission prompt and delivery scoped to the button. | Plain text only. Dismissal and denial look the same. WebKit may show an extra Paste confirmation. Not yet verified in an installed app. |
| [`useNamespace`](node_modules/@satinhq/kit/dist/motion/matchedGeometry.d.ts) | In a withAnimation change, a MatchedGeometryEffect view whose id is removed and inserted elsewhere moves from the old frame to the new one while the two cross-fade; a matched view that moves animates from where it was; an unpaired one fades. Motion runs on the compositor as transform and opacity, and the removed view stays on screen until its fade ends. | Matches frames only, around the centre. Corner radius scales with the frame during the flight instead of staying fixed. A non-source view does not follow its source outside an animation. Glass does not travel with a removed view. |
| [`MatchedTransitionSource`](node_modules/@satinhq/kit/dist/public/navigationTransition.d.ts), [`NavigationTransition`](node_modules/@satinhq/kit/dist/public/navigationTransition.d.ts), [`defineNamespace`](node_modules/@satinhq/kit/dist/motion/matchedGeometry.d.ts) | Mark the view a push starts from with MatchedTransitionSource (id, namespace) and give the pushed Screen navigationTransition={NavigationTransition.zoom({ sourceID, in })}. The screen grows out of the source on push and shrinks back into it on Back, the edge swipe and a downward drag from the top; the screen behind dims and recedes. defineNamespace() shares a namespace between routes. If several visible sources share an id, the one the user tapped is used both ways; if it disappears, navigation falls back to the normal slide. | Pushed screens only; sheets and full-screen covers do not zoom. The source must be on screen, or the push slides. A downward dismiss must start within about 27 degrees of vertical. |
| [`withAnimation`](node_modules/@satinhq/kit/dist/motion/matchedGeometry.d.ts), [`Animation`](node_modules/@satinhq/kit/dist/motion/animationValue.d.ts), [`SpringOptions`](node_modules/@satinhq/kit/dist/motion/animationValue.d.ts) | Apply synchronous state changes from an event handler; withAnimation returns the callback result and passes errors through. Keyed ForEach rows in a List animate reorders, and experimental MatchedGeometryEffect views also take part. Animation offers default, smooth, snappy, bouncy and spring({ durationMs, bounce }). | Other state and style changes do not animate. There is no null animation, easing curve, repeat, delay, completion callback or per-update timing; use one outer synchronous update. Bounce cannot be negative. |
| [`useBuildInfo`](node_modules/@satinhq/kit/dist/app/buildInfo.d.ts), [`BuildInfo`](node_modules/@satinhq/kit/dist/app/buildInfo.d.ts) | Read the framework version, unique app build id and build time baked into the running bundle, including offline launches. | The build id is not a git revision or a service worker cache hash. Builds made without satinApp report "unavailable". What the server last served says nothing about which cached bundle is running. |
| [`Link`](node_modules/@satinhq/kit/dist/web/openURL.d.ts), [`useOpenURL`](node_modules/@satinhq/kit/dist/web/openURL.d.ts), [`WebView`](node_modules/@satinhq/kit/dist/web/WebView.d.ts), [`useWebFrame`](node_modules/@satinhq/kit/dist/web/WebView.d.ts) | Open app URLs through in-memory navigation, hand other URLs to the browser, or embed a sandboxed frame. | You cannot force the external browser. A dispatched URL is not a loaded page. Cross-origin or blocked frames report unverified, and only same-origin frames can be reloaded or stopped. |
| [`defineWebAuthentication`](node_modules/@satinhq/kit/dist/web/authentication.d.ts), [`useWebAuthentication`](node_modules/@satinhq/kit/dist/web/useWebAuthentication.d.ts) | Prepare a durable authorization-code sign-in with PKCE, start it from a gesture as a popup or redirect, and finish it when the app returns. | Needs a secure context, local storage, Web Locks, a dedicated uncached callback page and a server exchange. Bridge reads need a private transaction proof. Your server validates tokens and OpenID Connect. Completion in the background is not guaranteed. |
| [`cornerClipPath`](node_modules/@satinhq/kit/dist/shapes/corners.d.ts) | Return a CSS clip path for an explicit width and height: continuous or circular rounded corners, a capsule or an ellipse. Swipe action configurations take the same shapes for the revealed row face. | You size it yourself outside framework rows. It does not change a glass mask. Continuous corners follow the iOS 27 corner curve. |
| [`useGlassErrors`](node_modules/@satinhq/kit/dist/public/environment.d.ts) | Read installation failures, appearance records and glass errors from Satin's diagnostics. | Diagnostics show what failed; they do not prove the app looks or behaves right on a device. |
| [`useKeyboardMetrics`](node_modules/@satinhq/kit/dist/public/keyboard.d.ts) | Read the keyboard geometry Satin uses for editing layouts. | It reads the keyboard; it cannot change the keyboard or add a separate keyboard lifecycle. |
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
