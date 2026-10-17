# Finding the right API

## Entry points

| Import | Use it for | Never |
| --- | --- | --- |
| `satin` | Components, hooks and app definition. Mount once with `runApp`. | Mount a second root or call `createRoot`. |
| `@satinhq/kit/styles.css` | Import once in the app entry. | Add a global reset or restyle control internals. |
| `@satinhq/kit/vite` | `satinApp` in `vite.config.ts`, with the same `defineApp` value the runtime uses. It generates the manifest, install page and service worker. | Register another worker or hand-write the document head. |
| `@satinhq/kit/install` | A custom install page: `useInstallContext`, `InstallSteps`, `InstallTip`, `copyInstallLink`. | Use it inside the running app; it throws outside the install page. |
| `@satinhq/kit/server` | Node-only `serveStaticFile` for static files and byte ranges. | Bundle it into the browser, or treat it as a production server (no auth, TLS or cache policy). |
| `@satinhq/kit/testing` | `assertNavigation` and `sendTestNotification` in tests. | Treat a passing test as proof of real touches or delivered notifications. |
| `@satinhq/kit/unstable` | Experimental APIs such as `MatchedGeometryEffect`. | Mix legacy `Sidebar` with stable `NavigationSplitView`. |
| `@satinhq/kit/internal` | Nothing. It is framework-only. | Import it from an app, for any reason. |

## Which component for which job

| You need | Use |
| --- | --- |
| A screen with a title and toolbar | `Screen` with `toolbar`, title from the route |
| Rows of records, settings or a form | `List` or `Form` with `Section`; `ForEach` for editable rows |
| A row that opens a detail | `NavigationLink` |
| A row that performs an action | `Button` inside the list |
| A row that shows a value | `LabeledContent` |
| A row with composed title, subtitle and icon | `RowLabel`, `Label`, `RowIcon` |
| Free-form scrolling content | `ScrollView` with an `id` |
| Text and simple stacks | `Text`, `VStack`, `HStack`, `ZStack`, `Spacer`, `Divider` (plain React is fine too) |
| On/off, choice, number, range | `Toggle`, `Picker` (menu, inline, segmented, navigationLink), `Stepper`, `Slider` |
| Text entry | `TextField` (with `kind`), `SecureField`, `TextEditor` |
| Date or time | `DatePicker` (compact style) |
| Colour | `ColorPicker` |
| Progress | `ProgressView` |
| An empty or unavailable screen | `ContentUnavailableView` |
| Search | `searchable` on `Screen` or `List` |
| Icons | `SymbolImage`, `Button symbol`, tab `symbol` |
| Images | `Image`, `AsyncImage` |
| App-specific floating chrome | `GlassEffect`, `GlassEffectContainer` |
| Menus and row actions | `Menu`, `contextMenu`, `swipeActions`, `ContextMenu` |
| Short edit, message, destructive choice | `Sheet`, `Alert`, `ConfirmationDialog` |
| Full-screen flow | `FullScreenCover` |
| Something attached to an edge (composer, accessory) | `SafeAreaInset`, `Overlay` |
| Appearance-aware colour | `semanticColor`, `systemColor`, `useColorScheme` |
| Animate a state change | `withAnimation` with an `Animation` preset |

For every export the installed `node_modules/@satinhq/kit/dist/docs/reference.md` lists what it
does, its limits and a link to its declaration. Read the declaration for the exact props. Import
type-only exports with `import type`.

## Lint rules

`satin-lint` checks the rules below when it is available. The rule names are also the review
vocabulary. These checks catch recognisable source patterns, not every bypass, so review by hand as
well. Do not add suppressions to get past a rule.

| Rule | Lint names |
| --- | --- |
| Never import the internal entry point. | `no-internal-import` |
| Mount through the framework; configure head and manifest through `defineApp`. | `no-direct-react-root`, `no-handwritten-app-head` |
| No browser history, no `replaceState`, no reloading the running app. | `no-browser-history`, `no-app-reload` |
| Geometry comes from the framework, including bottom chrome. | `no-fixed-document`, `no-raw-viewport-height`, `no-raw-safe-area-env`, `require-bottom-safe-area-inset` |
| Scroll through `List` or `ScrollView`. | `no-raw-css-overflow-scroll`, `no-raw-inline-overflow-scroll`, `no-webkit-overflow-scrolling-css`, `no-webkit-overflow-scrolling-inline` |
| Activate through framework controls and `onPress`; labelled fields; inputs at least 16px. | `no-raw-button`, `no-onclick-activation`, `no-raw-text-input`, `no-small-input-font` |
| Use framework glass; never fake it with CSS filters or another library. | `no-handrolled-glass`, `no-direct-glass-import` |
| Appearance from framework state; zoom only in `Zoomable`; no global selection or touch overrides. | `no-raw-appearance-query`, `no-page-zoom`, `no-global-selection-reset`, `no-global-touch-listener` |
| Keep framework motion and menu interaction. | `no-custom-linear-easing`, `no-native-menu-active`, `no-menu-motion-properties` |
| Unique tab IDs; records in collections; push, badges and worker owned by the framework. | `no-duplicate-tab-id`, `no-raw-persistent-storage`, `no-direct-push-api`, `no-direct-sw-registration` |
| Use framework dialogs, not `alert`, `confirm` or `prompt`. | `no-browser-dialog` |

None of these rules police your visual style. Colours, fonts, corner shapes and illustration are
yours to choose.
