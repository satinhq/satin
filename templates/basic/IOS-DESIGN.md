# Designing a personal iOS 27 app with Satin

Start with the owner's repeated task. For "make me a workout tracker", show today's session and a Start workout action, not a dashboard of charts. A second History tab earns its place when completed sessions exist. Settings can be a destination in a menu until it deserves a tab.

## Build the screen from its content

Use `List` and `Section` for repeated records, settings and forms. A workout's exercise rows belong in one group; its notes belong in another. `NavigationLink` opens an exercise, `Stepper` changes a bounded set count, `LabeledContent` shows a completed result, and `Button` saves. Use `ListRow` for explicit row composition; siblings inside it remain one row. `RowIcon` gives a Settings icon its tile.

Cards are for a distinct object with its own content, such as a session summary. Do not put every setting in a separate card, nest cards inside grouped rows, or add shadows to every section. Keep a single primary `List` or `ScrollView`, with a stable ID, in each screen. Lists already own scrolling, separators, insets and row spacing. Avoid adding duplicate padding around them.

For custom content, use the shipped geometry tokens and the native structure for the requested screen. Let safe-area tokens and framework bars place chrome. On wide screens constrain prose to a readable column; let navigation choose its regular-width presentation instead of stretching a phone layout across iPad.

Use the system font stack already in the starter. Give a root one large title and detail pages an inline navigation title. Keep the large heading in the primary scroller so `NavigationStack` can collapse it. Body text should be comfortable at the starter's default size; secondary text uses semantic color before smaller type. Editable text stays at least 16px. Avoid all-cap headings, excessive weights, clipped labels and fixed-height text containers. Check large text and VoiceOver reading order.

## Choose push, tab or an editing flow

Push for a record and its detail, deeper settings, or a long picker. Use a registered screen and the framework Back control. Keep typed route parameters small, usually the record ID. Read the record through `useRecord`; do not pass a copied record that can become stale.

Tabs are enduring destinations, not filters or actions. Use `TabView`/`Tab` and one navigator per tab. A tab changes on finger-up. Selecting another retains the previous stack and offset. Re-tapping pops to root, and re-tapping at root scrolls up. A Week/Month filter can use `Picker pickerStyle="segmented"`. Pause screen-specific work through `useScreenLifecycle`; hidden React effects do not automatically stop.

NavigationStack stays a single stack. Declare `NavigationSplitView` explicitly for a sidebar and detail stack. `TabView tabViewStyle="sidebarAdaptable"` opts into the separate iPad tab sidebar; it does not turn every stack into columns. Keep legacy `Sidebar`, `DetailList` and `useSplitSelection` composition in `@satinhq/kit/unstable` separate from stable split navigation. Follow AGENTS.md for column and toolbar ownership, and verify the installed behavior on iPad.

Use `Sheet` for a short independent edit and `Alert` for a brief message, with at most three actions. Use `ConfirmationDialog` for destructive choices. Name the affected data, provide Cancel, and perform the write only in the destructive action. Keep presentation state in the owning screen. Sheet detents accept `medium`, `large`, `{ height: 320 }` or `{ fraction: 0.4 }`; use `interactiveDismissDisabled` while losing a draft would be harmful, with an explicit Cancel or Save control. Put a separate `<NavigationStack modal root="editor" />` inside a sheet that needs its own navigation, with a registered editor route. Pass a trigger ref as `anchor` to confirmation dialogs for iPad placement.

## Put glass on controls above content

Use `TabView`, `Button` and `ToolbarItemGroup` for chrome. Put per-screen toolbar content in `Screen toolbar`. Ordinary form entry uses `TextField`. Content rows, paragraphs, settings groups and error messages need readable solid surfaces.

Use `GlassEffect` with `Glass.regular` or `Glass.clear` for app-specific chrome, and `GlassEffectContainer` for grouped regions. Read their shipped declarations for attachment and grouping options. Use public `Menu` for actions; do not import removed `GlassMenu`, `GlassContainer` or `GlassLayer` APIs from old examples. Do not tune blur, tint or a spring to change framework glass or menu motion.

WebGPU draws framework glass. If it cannot render, a released app switches to a simpler CSS material by itself and records a diagnostic; development and strict builds show the error. Observe `onGlassError` for reporting. Never substitute your own `backdrop-filter` material.

## Make every state useful

For an empty reading list, write "No saved articles" with one Add article action. After filtering, say "No articles match this search" and offer Clear search. Do not show the onboarding empty state when a query failed.

Check `loading` before interpreting empty query data. Keep stable content while refreshing, show a short status label when needed, and avoid a full-screen spinner for each local write. Use `ProgressView` for determinate progress or an indeterminate activity indicator, with the timing and accessibility limits in the controls guide. A skeleton component is unavailable; use concise status text instead of fabricating native controls. `useReachability` describes transport, not whether the user's data saved; there is no public `OfflinePresentation` component.

Await writes before saying "Saved". On failure keep the entered values and show an actionable error with Retry. Mark drafts with `useUnsavedChanges`. Request persistent storage after the first meaningful save, and put storage estimates and JSON export/import in Your data. A denied persistence request does not undo the save. Explain that data lives on this device; local-first does not mean sync or guaranteed backup. Import replacement needs a clear confirmation and app-level validation of fields.

Use `TextField.kind` for email, URL and numeric keyboards, `SecureField` for secrets, and `TextEditor` for notes. Values are strings while editing. `useFocusChain` follows visual order; keep editor Return as a newline. Put fields in the declared vertical scroller and use the keyboard adapter rather than moving the whole page yourself.

## Copy, icons and motion

Name actions with verbs: Start workout, Save set, Add article. Name tabs and screens with nouns. Error copy says what failed and what to do next. Avoid "Success!", slogans, exclamation marks and technical server details in ordinary flows. Explain permissions with the exact benefit, such as "Get a reminder at the time you choose".

Use the framework's `SymbolImage`, Button `symbol` and declared tab symbols; only shipped or provider-registered names exist. The bundled catalogue uses Framework7 Icons 5.0.5 (MIT) plus Satin-drawn clean-room additions, not Apple SF Symbols assets. Preserve copyright and license notices. Do not extract reference assets or ship SF Symbols artwork. Use original or compatibly licensed SVGs with recorded provenance and retained notices for provider glyphs and custom content. Label icon-only controls and use `role="presentation"` with `focusable="false"` on decorative SVG that glass must paint. Never hide painted glass content with `aria-hidden`.

Use framework press, navigation and menu motion. Never invent replacement springs; changes need a native recording. Honor Reduce Motion and make the resting state understandable without animation. A desktop animation preview cannot establish iPhone cadence.

## Permissions and scheduled notifications

A scheduling utility needs local schedule records, an authenticated backend scheduler, and visible push payloads. A `setTimeout` in the PWA cannot promise delivery after suspension. Satin supplies push registration and route activation, not the scheduler. Store time zone and schedule intent explicitly, and distinguish local save from server acceptance. Use `DatePicker` for compact WebKit date/time editing, with the range and style limits in the controls guide. A wheel picker is unsupported. Explicit hour/minute entry can instead use labelled `TextField` inputs with `kind="number"` and range validation. Use a navigation `Picker` for time zone or repeat choices.

Show the notification explainer after the owner chooses Enable reminders. `NotificationPermissionExplainer` owns the permission gesture. `useNotifications` exposes notification state and authorization actions. Keep sender credentials on the server; user authentication arrives at runtime. Notification routes name registered screens, never arbitrary URLs. A tap opens the relevant record on the existing navigator without reloading. `useNotifications().setBadge` reports API outcome, not whether iOS displays the badge. Verify delivery and warm/cold taps on the installed phone.

For a reading list, open saved records inside the app and make leaving for the original article explicit. There is no exported `ExternalLink` yet. A labelled external anchor in `Selectable` can offer "Open original in browser" as an intentional exit; check that behavior on the installed device and do not use anchors for internal navigation. Keep URLs validated to allowed web schemes.

## Accessible text and controls

Use `font: -apple-system-body` for body copy, `-apple-system-footnote` for secondary copy and `-apple-system-large-title` for large titles inside an `@supports` rule. These are complete font values. Preserve the starter's ordinary system-font fallback. Do not fix text containers to a single-line height. At larger sizes, keep labels readable beside switches and allow action text to wrap.

NavigationStack focuses a visible Back control after a push, or the real title when there is no Back control and restores the previous control after a pop when it still exists. It waits for overlapping transitions to settle. Modal dialogs contain keyboard focus and restore their trigger. Keep meaningful screen titles and control labels, and test removal of an invoking row while its dialog is open. Tab controls use navigation semantics and expose the current destination; do not add partial tablist roles.

Icon-only actions use `iconOnly` and need an `aria-label` that describes the action, such as "Add entry". Decorative icons that are painted on screen use `role="presentation"` and take their meaning from the control's label; don't put `aria-hidden` on painted content, because glass refracts only what it can sample and skips hidden subtrees. Keep the primary visible title exposed; never create a hidden heading as a focus target. Avoid separate live announcements of navigation titles. Verify actual VoiceOver speech and swipe order on a physical device; DOM focus checks do not prove them.

## Reopen where the owner stopped

Declare primary tabs or a single stack with defineNavigation and pass it to runApp. Render from that declaration. Satin restores before the first paint; do not replay pushes in an effect. Keep tab and route identities stable. Declare params before components and use RouteParameters for screen props.

A draft belongs in `useSceneStorage('draft', '')`, with a stable key and an initial value. Each pushed entry gets separate state. Named ScrollView/List offsets, sidebar visibility and tab selection recover through the framework. Temporary pressed states, keyboard focus and destructive confirmations do not belong in a checkpoint.

Keep presentation flags in React useState(false), including editing sheets. Persist an editing draft separately. After a cold relaunch, sheets, alerts, confirmation dialogs, popovers, menus and context menus are closed before first paint; navigation still restores underneath. Never persist presentation visibility in scene, preference or app-owned storage. A modal NavigationStack is explicit and transient.

Launch intents override the previous scene. Notifications and ordinary launch restoration use the same route validators. A skipped route ends the saved path at its parent. Durable notification acknowledgement requires a recoverable destination checkpoint. A kill before a write, quota failure or cleared storage can permit replay.

Delayed content may restore its saved offset only after enough content exists. Cache domain data for useful cold-launch content and keep long-lived records in collections with an export path. Checkpoint recovery is not a durable-save acknowledgement.

## Swipe actions and context menus

Use `swipeActions` and `contextMenu` on `NavigationLink`, `Button` and `LabeledContent` inside `List`. Use the generic `ContextMenu` wrapper for other content. All share the `Action` type with `Menu`; do not build competing app gestures. Persist deletions in the action callback and handle write failures in app state. Context menus use the shared WebGPU renderer. Native VoiceOver Actions rotor entries and haptics remain unavailable; named accessible buttons are provided.

On iPad, declare each column action through its own `Screen toolbar` and `ToolbarItem placement="primaryAction"` or `"topBarLeading"`. Satin reserves the sidebar toggle. Never position an action over the navigation bar or add sidebar-dependent app offsets. See AGENTS.md, "iPad column toolbars".
