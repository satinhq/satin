# Satin API reference

Search by Satin export name. Each entry describes its behavior and limits and links to its exact declaration. Plain-language search terms are included where they help find a control or capability.

Generated from package declarations and reviewed behavior metadata. Run `pnpm --filter @satinhq/kit api:write` after building. Signature, export and source changes invalidate this reference; changes to behavior descriptions require review.

Coverage: 942 named exports across 9 declaration entry points. 155 exports have reviewed behavior metadata. 787 type and integration declarations are identified separately in the behavior review inventory. CSS is a stylesheet, not a named export.

An API description establishes the supported contract. It does not certify pixels, motion, touch or installed-app lifecycle behavior. Experimental entry points remain experimental. An empty Limits cell means there are no limits beyond what the declaration states.

## Core API

Module: `@satinhq/kit`

Components, hooks and types for building the app.

| Satin export | Behavior | Limits | Also known as |
| --- | --- | --- | --- |
| [`Action`](../actions/types.d.ts) | An entry in a menu, context menu or swipe action list: a command, a titled section of entries, or a submenu. | Actions have accessible names, but they do not appear in the VoiceOver Actions rotor. |  |
| [`ActionItem`](../actions/types.d.ts) | A single command with an id, a label, an optional symbol and role, and an `onPress` handler. Menus, swipe actions, alerts and confirmation dialogs all use it. |  |  |
| [`AdaptiveGridItemOptions`](../content/content.d.ts) | Bounds for an adaptive track, which repeats to fit as many columns or rows as the space allows. A grid with an adaptive track can have no other track. |  |  |
| [`Alert`](../presentation/Presentation.d.ts) | A centred alert with a title, an optional message, up to three actions and an optional text field. | Alerts and confirmation dialogs start closed after a relaunch, so a destructive confirmation is never restored open. | alert; dialog; popup |
| [`AlertProps`](../presentation/Presentation.d.ts) | An alert's presentation binding, title, message, actions and optional text field. |  |  |
| [`AlertTextFieldProps`](../presentation/Presentation.d.ts) | The text field inside an alert: its label, controlled text, prompt and keyboard intent. |  |  |
| [`Animation`](../motion/animationValue.d.ts) | An opaque spring timing value for `withAnimation`. Use a named value or `Animation.spring`. | Other state and style changes do not animate. There is no null animation, easing curve, repeat, delay, completion callback or per-update timing; use one outer synchronous update. Bounce cannot be negative. |  |
| [`AppCapability`](../app/definition.d.ts) | A capability the app declares so Satin sets up its runtime support: `push`, `badging` or `background-work`. |  |  |
| [`AppDefinition`](../app/definition.d.ts) | A validated app definition, returned by `defineApp`. Pass it to `runApp` and to the Vite plugin. |  |  |
| [`AppDefinitionInput`](../public/definition.d.ts) | What an app declares about itself: identity, install metadata and launch appearance. |  |  |
| [`AppIcon`](../app/definition.d.ts) | One generated app icon file: its URL, pixel sizes, image type and purpose. |  |  |
| [`AppOrientation`](../app/definition.d.ts) | An orientation that the app supports. |  |  |
| [`AsyncImage`](../image/Image.d.ts) | Loads an image from a URL. It keeps its placeholder if loading fails, never holds up navigation, and reports progress through `onPhaseChange`. | Remote images use the browser's HTTP cache. onPhaseChange reports loading state; it does not swap in other content. There is no Photos library access. | remote image; image URL |
| [`AsyncImagePhase`](../image/Image.d.ts) | The loading state an `AsyncImage` reports: `empty` while loading, then `success` with the image element or `failure` with the error. |  |  |
| [`AsyncImageProps`](../image/Image.d.ts) | An `ImageProps` whose source is a remote URL. |  |  |
| [`BuildInfo`](../app/buildInfo.d.ts) | The framework version, build id, build time and build kind baked into the running bundle. The build id is unique per build. | The build id is not a git revision or a service worker cache hash. Builds made without satinApp report "unavailable". What the server last served says nothing about which cached bundle is running. |  |
| [`BuiltInButtonStyle`](../public/controlStyle.d.ts) | The built-in button styles, by their `buttonStyle` names. `automatic` picks one for the context. |  |  |
| [`BuiltInLabelStyle`](../public/controlStyle.d.ts) | The built-in label styles: the title, the icon or both. `automatic` picks for the context. |  |  |
| [`BuiltInToggleStyle`](../public/controlStyle.d.ts) | The built-in toggle styles: `switch` or `button`. `automatic` picks for the context. |  |  |
| [`Button`](../public/controls.d.ts) | A pressable control that adapts to where it is: a tinted row in a `List`, a glass button in a toolbar, otherwise the `buttonStyle` you choose. `role="destructive"` carries into every context. | Only the listed button styles exist. There are no circle or container-concentric borders, and plain and list-row buttons draw no border. A custom ButtonStyle draws the content; Satin keeps the press handling and accessibility. | button; tap |
| [`ButtonBorderShape`](../public/buttonBorderShape.d.ts) | The outline of a bordered button: `automatic`, `capsule`, or a rounded rectangle with a fixed corner radius in points. |  |  |
| [`ButtonProps`](../public/controls.d.ts) | Button's action, label and control properties. An `iconOnly` button needs an `aria-label`. |  |  |
| [`ButtonRole`](../public/controlStyle.d.ts) | A button's role. `destructive` draws it in red; `cancel` marks the action that backs out. |  |  |
| [`ButtonStyle`](../public/controlStyle.d.ts) | A custom look for `Button`. `makeBody` returns noninteractive content; Satin still owns the button's press handling and accessibility. |  |  |
| [`ButtonStyleConfiguration`](../public/controlStyle.d.ts) | What a custom `ButtonStyle` draws from: the label, the pressed state and the role, plus the shared control values. |  |  |
| [`Choice`](../list-form/ListForm.d.ts) | One option of a `Picker`. | Only the menu, navigationLink, inline and segmented styles exist. |  |
| [`collection`](../data/database.d.ts) | Declares a collection of records keyed by one unique string field. The curried form, `collection<Note>()({ key, indexes })`, infers index names. | Data lives in IndexedDB on this device. The browser may evict it, and writes can fail. |  |
| [`Collection`](../data/database.d.ts) | One collection of a database (`db.notes`). Once loaded, writes publish to memory at once, so `useQuery` sees them immediately; the returned promise settles after the durable commit. |  |  |
| [`CollectionDefinition`](../data/database.d.ts) | A collection's record type, key and indexes, made by `collection` for `defineDatabase`. |  |  |
| [`CollectionIndexes`](../data/database.d.ts) | A mapping from declared index names to record properties. |  |  |
| [`CollectionSchema`](../data/database.d.ts) | The named collections in a database declaration. |  |  |
| [`CollectionUpdateMethods`](../data/database.d.ts) | A collection's `update` method: a partial record to merge, or a function that returns the new record. |  |  |
| [`ColorPicker`](../controls/ColorPicker.d.ts) | A row with a colour well that opens the system colour picker: grid, spectrum, sliders, eyedropper and, with `supportsOpacity`, opacity. | The system picker is titled "Colors", not with the label. Output is sRGB hex; Display P3 choices are converted to sRGB. See controls.md. | color picker; color well |
| [`ColorPickerProps`](../controls/ColorPicker.d.ts) | ColorPicker's label and controlled colour. |  |  |
| [`ColorScheme`](../public/environment.d.ts) | A light or dark appearance. |  |  |
| [`ConfirmationDialog`](../presentation/Presentation.d.ts) | A titled set of actions, such as Delete and Cancel, shown next to the control that opened it. | Alerts and confirmation dialogs start closed after a relaunch, so a destructive confirmation is never restored open. | action sheet; delete confirmation |
| [`ConfirmationDialogProps`](../presentation/Presentation.d.ts) | A confirmation dialog's presentation binding, title, message, actions and optional anchor. |  |  |
| [`ContentAlignment`](../content/content.d.ts) | Where content sits inside a larger frame. Used by `frame` and `ZStack`. |  |  |
| [`ContentFrame`](../content/content.d.ts) | A fixed size or size bounds for a view, in points, and how its content aligns inside. `'infinity'` fills the available space. |  |  |
| [`ContentMargins`](../safe-area/modifiers.d.ts) | Sets content margins for every scroll view inside it. A `List` takes a horizontal margin as its layout margin. The innermost value for each edge wins. | placement="scrollIndicators" has no effect: Satin draws the scroll indicator in the screen frame. | content inset |
| [`ContentMarginsProps`](../safe-area/modifiers.d.ts) | Which edges get a margin, how much, and whether it applies to content or indicators. |  |  |
| [`ContentPadding`](../content/content.d.ts) | The `padding` prop. `true` adds the default 16 pt on every edge, a number pads every edge, and an object pads the edges it names. |  |  |
| [`ContentProps`](../content/content.d.ts) | The padding, frame and background props shared by text and stacks. Plain HTML attributes, `style` included, still apply. |  |  |
| [`ContentUnavailableView`](../public/controls.d.ts) | An empty state: an icon, a title, an optional description and optional action children. | Takes an explicit title, icon, description and actions; there is no built-in search variant. | empty state; no results |
| [`ContentUnavailableViewProps`](../public/controls.d.ts) | The empty state's title, optional description and icon (a tray by default). |  |  |
| [`ContextMenu`](../actions/RowActions.d.ts) | Opens a menu of actions when the user long-presses its content, with an optional custom `preview`. Rows in a `List` take a `contextMenu` prop instead. | Actions have accessible names, but they do not appear in the VoiceOver Actions rotor. | long press menu |
| [`ContextMenuConfiguration`](../actions/types.d.ts) | The `contextMenu` prop of a row: a list of actions, or actions with a custom `preview`. |  |  |
| [`ControlConfiguration`](../public/controlStyle.d.ts) | What every custom control style receives: enabled state, control size and tint. |  |  |
| [`ControlSize`](../public/controlStyle.d.ts) | A control's size, from `mini` to `extraLarge`. `regular` is the default. |  |  |
| [`ControlStyleProvider`](../public/controlStyle.d.ts) | Sets control defaults for a subtree through `buttonStyle`, `toggleStyle`, `labelStyle`, `controlSize`, `tint` and `disabled`. A control's own props win over the provider, except that a disabled ancestor cannot be re-enabled by a child. | Only the listed button styles exist. There are no circle or container-concentric borders, and plain and list-row buttons draw no border. A custom ButtonStyle draws the content; Satin keeps the press handling and accessibility. |  |
| [`ControlStyleValues`](../public/controlStyle.d.ts) | The control environment a `ControlStyleProvider` sets for its subtree. |  |  |
| [`CoreSymbolName`](../symbols/catalogue.d.ts) | Every symbol name in the bundled catalogue. |  |  |
| [`cornerClipPath`](../shapes/corners.d.ts) | Returns a CSS `clip-path` for a shape at an explicit width and height. Radii are in points. | You size it yourself outside framework rows. It does not change a glass mask. Continuous corners follow the iOS 27 corner curve. |  |
| [`CornerShape`](../shapes/corners.d.ts) | A shape for `cornerClipPath` and swipe action faces: a capsule, an ellipse, a rounded rectangle or a custom clip path. Choosing one overrides the framework's default shape. |  |  |
| [`DatabaseMigration`](../data/database.d.ts) | A schema migration. It runs inside one transaction and may be async. |  |  |
| [`DatabaseRecord`](../data/database.d.ts) | A stored record with named values. |  |  |
| [`DatePicker`](../controls/DatePicker.d.ts) | A row for picking a date, a time or both. Its grey value capsules open the system date or time picker. Use a civil string selection (`'2026-10-14'`) for a day that must stay the same day in every time zone, such as a due date; use a `Date` for a moment in time. | No graphical or wheel style. WebKit adds Reset and Done buttons to the system picker, centres it instead of anchoring it to the capsule, and does not grey out days outside the range. See controls.md. | date picker; time picker; calendar |
| [`DatePickerComponent`](../controls/DatePicker.d.ts) | A part of the value a `DatePicker` edits: the `date`, or the `hourAndMinute`. |  |  |
| [`DatePickerProps`](../controls/DatePicker.d.ts) | DatePicker's label, controlled selection, range and the components it edits. `selection` is a `Date`, or a civil string with no time zone: `'2026-10-14'` for a date, `'09:41'` for a time, `'2026-10-14T09:41'` for both. The callback returns the same kind. |  |  |
| [`DatePickerRange`](../controls/DatePicker.d.ts) | A DatePicker's selectable range. Omit a bound for a one-sided range (`start...` or `...end`). Bounds use the same kind of value as the selection. |  |  |
| [`DatePickerStyle`](../controls/DatePicker.d.ts) | How a `DatePicker` draws. Only the compact style exists; `automatic` is `compact`. |  |  |
| [`DefaultToolbarItem`](../public/toolbar.d.ts) | Places the screen's search field among its bottom toolbar items. The screen must be `searchable`. | Only kind="search". Without a ToolbarSpacer the next item is not merged into the search capsule. iPad keeps the drawer. | bottom search bar |
| [`DefaultToolbarItemProps`](../public/toolbar.d.ts) | Which system item to place, and where. Only `search` exists. |  |  |
| [`defineApp`](../public/definition.d.ts) | Declares app identity, install metadata and capabilities once. Pass the result to `runApp` and to the `@satinhq/kit/vite` plugin. Everything not given is defaulted and the whole definition is validated, so a bad id or icon fails at build time rather than after install. | One app root per page, for iPhone and iPad WebKit. There are no multiple windows. | app manifest; app config |
| [`defineDatabase`](../data/database.d.ts) | Opens the app's local database, stored in IndexedDB. Each collection becomes a property of the result. Bump `version` with a migration whenever the schema changes. Export and import are built in, so offer them to the user. | Data lives in IndexedDB on this device. The browser may evict it, and writes can fail. | local database; offline storage; IndexedDB |
| [`defineNamespace`](../motion/matchedGeometry.d.ts) | A namespace declared once at module scope, for views that share no parent component: a `MatchedTransitionSource` in one route and the screen it zooms into in another. Inside one component, use `useNamespace()`. | Pushed screens only; sheets and full-screen covers do not zoom. The source must be on screen, or the push slides. A downward dismiss must start within about 27 degrees of vertical. |  |
| [`defineNavigation`](../public/structure.d.ts) | Declares the app's primary tabs or its single stack before anything renders, so every stack and tab id exists (and is typed) from the first frame. Pass the result to `runApp`; `TabView`, `Tab` and `NavigationStack` then render it. Components may freely wrap those views. | One app root per page, for iPhone and iPad WebKit. There are no multiple windows. |  |
| [`defineResource`](../data/resource.d.ts) | Define one keyed memory resource shared by screens. Loads survive screen cover/unmount; useResource reads retained content on its first render and revalidates stale content. The loader owns transport, validation and HTTP cache policy. Satin never persists values. | No automatic persistence, transport or background execution. Include account identity in keys and clear resources on sign-out. Cold, unseeded reads still need loading UI. |  |
| [`defineRoutes`](../public/routes.d.ts) | Declares every destination once. The same schema types `useNavigation` and `NavigationLink`, validates restored paths and checks notification deep links, so a route id or param is never a free-form string. | Navigation does not use browser history. Route params must match the declared schema. | router; routes; deep links |
| [`defineWebAuthentication`](../web/authentication.d.ts) | Sets up an OAuth authorization-code sign-in with PKCE. The transaction is stored durably, so it survives a redirect or a suspended app. Your server redeems the code. | Needs a secure context, local storage, Web Locks, a dedicated uncached callback page and a server exchange. Bridge reads need a private transaction proof. Your server validates tokens and OpenID Connect. Completion in the background is not guaranteed. | OAuth; sign in; PKCE |
| [`Divider`](../content/content.d.ts) | A hairline across its parent stack's axis. It is decorative, so assistive technology skips it. | Default spacing and frame differences are listed in content.md. Props apply in a fixed order, not the order you write them. | separator; hairline |
| [`Edge`](../safe-area/context.d.ts) | A logical edge. `leading` and `trailing` follow the layout direction. |  |  |
| [`EdgeInsets`](../public/environment.d.ts) | Insets on each edge in points. `leading` and `trailing` follow the layout direction. |  |  |
| [`EdgeLengths`](../safe-area/context.d.ts) | Optional lengths per logical edge, in points. |  |  |
| [`EdgeSet`](../safe-area/modifiers.d.ts) | One edge group or a list of them. |  |  |
| [`EdgeSetMember`](../safe-area/modifiers.d.ts) | A logical edge, an axis pair or all edges. |  |  |
| [`EditButton`](../public/controls.d.ts) | Toggles the screen's edit mode. In a toolbar it reads Edit, then becomes a prominent checkmark (Done) while editing. | Rows are identified by their ForEach ids. Edit mode belongs to each screen and cannot be set from outside it. Outside edit mode, plain rows cannot be selected with the keyboard. | edit mode; Edit and Done |
| [`EditMode`](../list-form/editing.d.ts) | Whether a screen's lists show their editing controls: `active` or `inactive`. |  |  |
| [`ExportDocument`](../data/database.d.ts) | The JSON document `exportJSON` writes and `importJSON` reads. |  |  |
| [`FileImporter`](../public/filePickers.d.ts) | A button that opens the system file chooser and returns the chosen files. Cancelling keeps the current selection. | MIME types are hints, not validation. There is no photo library identifier and no lasting file access, and overlapping choosers cannot always be told apart. Not yet verified in an installed app. | file upload; document picker |
| [`FileImporterProps`](../public/filePickers.d.ts) | The importer's label, the selected files and the content types it accepts, as MIME types or extensions. | MIME types are hints, not validation. There is no photo library identifier and no lasting file access, and overlapping choosers cannot always be told apart. Not yet verified in an installed app. |  |
| [`FixedGridItemOptions`](../content/content.d.ts) | A fixed track's size in points. |  |  |
| [`FlexibleGridItemOptions`](../content/content.d.ts) | Bounds for a flexible track; the minimum defaults to 10 points. |  |  |
| [`FocusChainField`](../text-input/focusChain.d.ts) | The parts of a field element that `useFocusChain` uses to move focus. |  |  |
| [`FontWeight`](../content/content.d.ts) | A font weight, from `ultraLight` to `black`. |  |  |
| [`ForEach`](../list-form/editing.d.ts) | Makes one row per element of `data`, identified by its `id` (or an `id` function). In a `List`, `onDelete` adds swipe-to-delete and the editing delete control; `onMove` adds the reorder handle. Both receive offsets into `data`; apply them with `removing` and `moving`. Put `ForEach` directly in a `List` or `Section`: the list reads it to know each row's identity. | ForEach must sit directly in a List or Section. Moving a selected group, two-finger selection and VoiceOver move actions are not available. | swipe to delete; reorder rows |
| [`ForEachProps`](../list-form/editing.d.ts) | The collection, how to identify each element, the row each element becomes and its editing actions. `id` may be omitted when the elements have an `id` field. |  |  |
| [`Form`](../public/controls.d.ts) | An inset grouped `List` for settings and data entry. Scrolling it dismisses the keyboard at once. | A ListRow is always one row: its children sit side by side. Use one ListRow per row. A numeric gap changes the space between sections; header and footer space stays. visible keeps the default background; it does not make a sheet opaque. | settings screen; form |
| [`FormProps`](../public/controls.d.ts) | The scroll, search and section options `Form` and `List` share. `style` is inline CSS. |  |  |
| [`FullScreenCover`](../public/presentation.d.ts) | An opaque presentation that slides up over the whole screen. It has no interactive dismissal; close it through its binding or `useDismiss()`. | Covers cannot be swiped away. They start closed after a relaunch. | full screen presentation; modal |
| [`FullScreenCoverProps`](../public/presentation.d.ts) | A full-screen cover's presentation binding and accessible title. |  |  |
| [`GeometryFrame`](../content/layout.d.ts) | A rectangle in points: origin `x` and `y` plus a size. |  |  |
| [`GeometryProxy`](../content/layout.d.ts) | What a `GeometryReader` passes to its children: its size and a way to read its frame. |  |  |
| [`GeometryReader`](../content/layout.d.ts) | Fills the space it is offered and calls its children with that size. Its content renders once the first measurement is in. | Inside a scroll view, give it a definite height. The proxy reports no safe-area insets. | measure size |
| [`GeometryReaderProps`](../content/layout.d.ts) | A `GeometryReader`'s render function, plus plain div attributes. |  |  |
| [`GeometrySize`](../content/layout.d.ts) | A width and height in points. |  |  |
| [`Glass`](../public/glassValue.d.ts) | The glass material for a `GlassEffect`. Start from `Glass.regular` or `Glass.clear` and refine it with a tint or `interactive()`; each call returns a new value. | If WebGPU fails for good, release builds fall back to a blur-and-tint material unless strict glass is on; development builds report the failure. |  |
| [`GlassEffect`](../public/glass.d.ts) | Draws glass behind its content in the given shape, a capsule by default. Inside a `GlassEffectContainer`, effects with ids morph into one another. | If WebGPU fails for good, release builds fall back to a blur-and-tint material unless strict glass is on; development builds report the failure. | glass; refraction |
| [`GlassEffectContainer`](../glass/GlassEffect.d.ts) | Groups nearby glass effects so they render together and blend or morph into one another. `spacing`, 20 pt by default, sets how close effects must be to merge. | If WebGPU fails for good, release builds fall back to a blur-and-tint material unless strict glass is on; development builds report the failure. | glass morph; glass group |
| [`GlassEffectProps`](../public/glass.d.ts) | The glass material and shape, plus the namespace and id that let effects morph into each other. Plain div attributes also apply. |  |  |
| [`GlassError`](../glass/errors.d.ts) | One glass renderer failure: its code, message, the stage it happened in and when. |  |  |
| [`GlassErrorCode`](../glass/errors.d.ts) | Why the glass renderer failed, such as `gpu-unavailable` or `device-lost`. Releases can recover with fallback; development only tolerates missing startup capability. |  |  |
| [`GlassShape`](../public/glass.d.ts) | The outline of a glass effect: `capsule`, `circle` or a rounded rectangle with a corner radius in points. |  |  |
| [`GlassTint`](../glass/regions.d.ts) | A glass tint as red, green, blue and alpha channels from 0 to 1. `Glass.tintRGBA` rejects values outside that range. |  |  |
| [`GridItem`](../content/content.d.ts) | Makes grid tracks for `LazyVGrid` and `LazyHGrid`: `fixed`, `flexible` or `adaptive`. Each call validates its options and throws a `RangeError` for bad bounds or spacing. | Every child renders at once; there is no virtualization. An adaptive track must be the only track, and there is no Grid or GridRow. |  |
| [`GridItemOptions`](../content/content.d.ts) | Options every grid track takes. `spacing` is the gap after this track; `alignment` places content within each cell. |  |  |
| [`GridItemValue`](../content/content.d.ts) | A validated grid track. Make one with `GridItem.fixed`, `.flexible` or `.adaptive`. |  |  |
| [`HorizontalTextFieldProps`](../public/controls.d.ts) | Horizontal TextField's controlled text and keyboard intent. |  |  |
| [`HStack`](../content/content.d.ts) | Arranges its children in a row. Add a `Spacer` to push content to the edges. | Default spacing and frame differences are listed in content.md. Props apply in a fixed order, not the order you write them. | row; horizontal layout |
| [`HStackProps`](../content/content.d.ts) | HStack's vertical alignment and spacing in points. |  |  |
| [`IgnoresSafeArea`](../safe-area/modifiers.d.ts) | Lets content extend through the safe area on the chosen edges, for full-bleed backgrounds and media. The container edges and keyboard avoidance can be ignored separately. | Only a view at the start of the screen content extends upward. Content that does not scroll does not extend through the bottom edge. | full bleed; edge to edge |
| [`IgnoresSafeAreaProps`](../safe-area/modifiers.d.ts) | Which safe-area regions and edges the content ignores. |  |  |
| [`Image`](../image/Image.d.ts) | Shows a bundled or local image. It reserves its size so layout never jumps, and `priority` loads it ahead of other images. Use `alt=""` for decoration. | Remote images use the browser's HTTP cache. onPhaseChange reports loading state; it does not swap in other content. There is no Photos library access. | image; picture |
| [`ImageAsset`](../image/asset.d.ts) | A responsive image with its size, `srcSet` and a tiny placeholder. The Vite plugin produces one for each import ending in `?satin-image`. |  |  |
| [`ImageProps`](../image/Image.d.ts) | An image's source, required alt text and aspect-ratio content mode. |  |  |
| [`IndexesOfCollection`](../data/database.d.ts) | The index names declared by a collection. |  |  |
| [`JustUpdated`](../app/coldLaunchUpdate.d.ts) | The previous and current build identifiers after an app update. |  |  |
| [`KeyboardGeometry`](../keyboard/geometry.d.ts) | How much the keyboard covers, whether it shows, and the viewport size, in points. |  |  |
| [`KeyboardMetrics`](../public/keyboard.d.ts) | The keyboard's current geometry in points, plus the software keyboard height to plan for at this window size. |  |  |
| [`Label`](../public/Label.d.ts) | A title with an icon. In a toolbar a label with an icon shows the icon alone; a hidden title stays available to assistive technology. | Labels are not interactive, and a custom LabelStyle must return noninteractive content. |  |
| [`LabeledContent`](../public/controls.d.ts) | A row with a label and a trailing value in secondary text. | Labels are not interactive, and a custom LabelStyle must return noninteractive content. | value row; detail row |
| [`LabeledContentProps`](../public/controls.d.ts) | The row's label and the trailing value it shows. |  |  |
| [`LabelProps`](../public/Label.d.ts) | A label's title (children) and its icon: a `symbol` name or any `icon` node. |  |  |
| [`LabelStyle`](../public/controlStyle.d.ts) | A custom arrangement of a label's title and icon. |  |  |
| [`LabelStyleConfiguration`](../public/controlStyle.d.ts) | What a custom `LabelStyle` draws from: the label's title and icon. |  |  |
| [`LaunchScreenSlot`](../app/launchScreen.d.ts) | The launch screen's icon and optional label. The inline environment paints it before application JavaScript loads, so both must be plain strings. |  |  |
| [`LayoutModifierProps`](../safe-area/modifiers.d.ts) | The children and plain div attributes every layout wrapper takes. |  |  |
| [`LazyHGrid`](../content/content.d.ts) | A grid with fixed rows that grows sideways. Every child renders at once; use `List` for long data. | Every child renders at once; there is no virtualization. An adaptive track must be the only track, and there is no Grid or GridRow. | horizontal grid |
| [`LazyHGridProps`](../content/content.d.ts) | The grid's rows and the spacing between columns. Each row sets the gap after itself. |  |  |
| [`LazyHStack`](../content/content.d.ts) | Lays out its children like `HStack`. Every child mounts at once and keeps its state. | Every child renders at once; there is no virtualization. |  |
| [`LazyHStackProps`](../content/content.d.ts) | LazyHStack's layout props. Every child mounts eagerly; use List for long data. |  |  |
| [`LazyVGrid`](../content/content.d.ts) | A grid with fixed columns that grows downward. Every child renders at once; use `List` for long data. | Every child renders at once; there is no virtualization. An adaptive track must be the only track, and there is no Grid or GridRow. | grid; columns |
| [`LazyVGridProps`](../content/content.d.ts) | The grid's columns and the spacing between rows. Each column sets the gap after itself. |  |  |
| [`LazyVStack`](../content/content.d.ts) | Lays out its children like `VStack`. Every child mounts at once and keeps its state, so use `List` for long data. | Every child renders at once; there is no virtualization. |  |
| [`LazyVStackProps`](../content/content.d.ts) | LazyVStack's layout props. Every child mounts eagerly; use List for long data. |  |  |
| [`LineLimit`](../public/controls.d.ts) | A number caps growth; a range also reserves its minimum number of lines. |  |  |
| [`Link`](../web/openURL.d.ts) | Opens a URL when pressed, like `useOpenURL`. A press that turns into a scroll does not open it. | You cannot force the external browser. A dispatched URL is not a loaded page. Cross-origin or blocked frames report unverified, and only same-origin frames can be reloaded or stopped. | link; open URL |
| [`LinkProps`](../web/openURL.d.ts) | The link's destination URL, its content and an optional result callback. |  |  |
| [`List`](../public/controls.d.ts) | A scrolling column of rows, inset grouped by default. Controls inside it render as rows. Its `id` keys scroll restoration, so keep it stable. With `selection`, rows from a `ForEach` become selectable; with an `EditButton` in the screen's toolbar, `ForEach`'s `onDelete` and `onMove` add the editing controls. | The refresh indicator holds a 60 pt inset while the action runs. A ListRow is always one row: its children sit side by side. Use one ListRow per row. A numeric gap changes the space between sections; header and footer space stays. visible keeps the default background; it does not make a sheet opaque. Rows are identified by their ForEach ids. Edit mode belongs to each screen and cannot be set from outside it. Outside edit mode, plain rows cannot be selected with the keyboard. | list; rows; pull to refresh; swipe actions |
| [`ListItemID`](../list-form/editing.d.ts) | A row's identity in `List` selection: the `ForEach` id. |  |  |
| [`ListProps`](../public/controls.d.ts) | A `List` takes a `Form`'s options, its `listStyle` and an optional `selection`. | A numeric gap changes the space between sections; header and footer space stays. visible keeps the default background; it does not make a sheet opaque. |  |
| [`ListRow`](../list-form/ListForm.d.ts) | One row with custom content or per-row overrides. A ListRow is always one row. Several children share it side by side, laid out as an HStack would (centred, 8 pt apart, a NavigationLink filling the rest); each separate row needs its own ListRow. | A ListRow is always one row: its children sit side by side. Use one ListRow per row. Satin still owns row geometry. Do not use raw viewport or safe-area CSS in rows. ForEach must sit directly in a List or Section. Moving a selected group, two-finger selection and VoiceOver move actions are not available. Rows are identified by their ForEach ids. Edit mode belongs to each screen and cannot be set from outside it. Outside edit mode, plain rows cannot be selected with the keyboard. | swipe actions; row insets |
| [`ListRowProps`](../list-form/ListForm.d.ts) | One row's content and its overrides: insets in points, background, separator, swipe actions, context menu and editing opt-outs. |  |  |
| [`ListSelectionProps`](../public/controls.d.ts) | Row selection for a `List`. An optional id selects one row: tapping a row selects it. A `Set` selects many: while editing, rows show selection circles and taps toggle them. Rows are identified by their `ForEach` ids. |  |  |
| [`ListStyle`](../public/controls.d.ts) | How a `List` draws its rows and sections. `insetGrouped` is the default. |  |  |
| [`LocalReachabilityState`](../reachability/model.d.ts) | The reachability state of an app that needs no app server. Its status is always `local`. |  |  |
| [`MatchedTransitionSource`](../public/navigationTransition.d.ts) | Marks the view a zoom transition starts from and returns to. A push zooms only while its source is on screen; otherwise it slides as usual. | Pushed screens only; sheets and full-screen covers do not zoom. The source must be on screen, or the push slides. A downward dismiss must start within about 27 degrees of vertical. | zoom transition |
| [`MatchedTransitionSourceProps`](../public/navigationTransition.d.ts) | The source's id and namespace, and the one element the screen zooms out of. |  |  |
| [`MediaCommandResult`](../media/types.d.ts) | How a media command ended. `needs-user-activation` means WebKit wants a tap first. |  |  |
| [`MediaController`](../media/types.d.ts) | The audio player's commands: queue editing, transport, seek, repeat and shuffle. Queue commands resolve once the change is made; `play` and `seek` resolve once playback is seen to respond. |  |  |
| [`MediaPlayer`](../media/types.d.ts) | `useMediaPlayer`'s result: the commands and the live state. | Audio only, with no video player and no background playback beyond what WebKit allows. Playback depends on WebKit codec support and a server that serves byte ranges. |  |
| [`MediaQueueEntry`](../media/types.d.ts) | One item in the audio queue: its source URL, media id and display metadata. Each occurrence has its own `entryId`, so a repeated song appears twice. |  |  |
| [`MediaQueueOptions`](../media/types.d.ts) | Where a replaced queue starts, and whether it plays. |  |  |
| [`MediaRepeat`](../media/types.d.ts) | The queue's repeat mode: `off`, `one` or `all`. |  |  |
| [`MediaSnapshot`](../media/types.d.ts) | Everything the player shows: the queue, the current entry, status, position and modes. |  |  |
| [`Menu`](../public/actions.d.ts) | A button that opens a menu of actions. In a toolbar a symbol label draws an icon button and a text label draws a capsule. | Actions have accessible names, but they do not appear in the VoiceOver Actions rotor. | dropdown menu; more button |
| [`MenuProps`](../public/actions.d.ts) | A menu's label and its actions. |  |  |
| [`MenuTriggerProps`](../glass/menuPresenter.d.ts) | The props a custom `Menu` trigger receives. Forward all of them to the element that opens the menu. |  |  |
| [`moving`](../list-form/offsets.d.ts) | Returns a new array: the elements at `fromOffsets` move, in their original order, to just before the element that was at `toOffset`. Pass it exactly what `ForEach`'s `onMove` reports. `toOffset` counts positions in the original array: moving the first of three rows below the second reports `toOffset` 2, not 1. Use `items.length` to move to the end. | Each returns a new array; store the result in state to update the rows. | reorder rows |
| [`NamespaceID`](../motion/matchedGeometry.d.ts) | A scope for matched-geometry ids. Two views match only if they share an id and a namespace. |  |  |
| [`Navigation`](../public/runtime.d.ts) | The actions `useNavigation` returns: `push`, `replace`, `pop`, `popToRoot` and `showAcknowledgements`, typed against the routes. |  |  |
| [`NavigationArguments`](../public/runtime.d.ts) | The typed parameter tuple accepted by push and replace. |  |  |
| [`NavigationBackButtonBehavior`](../navigation/types.d.ts) | Whether a pushed screen shows its back button. `automatic` shows it; `hidden` removes it. |  |  |
| [`NavigationDeclaration`](../public/structure.d.ts) | An app's primary navigation: either tabs, each owning a stack, or one stack. |  |  |
| [`NavigationLink`](../public/controls.d.ts) | Pushes a declared route. In a `List` it draws a disclosure row; elsewhere it is a plain pressable. Use `prefetch={signal => resource.prefetch(key, signal)}` to start loading on press-down; scrolling or swiping cancels speculative work. | Navigation does not use browser history. Route params must match the declared schema. | push; disclosure row |
| [`NavigationLinkProps`](../public/controls.d.ts) | A destination route and its params (typed against the registered routes), plus the row's label and accessories. |  |  |
| [`NavigationSplitView`](../public/runtime.d.ts) | Shows the declared root as a sidebar and pushes into a retained detail column. At compact width it collapses to a plain stack. A `NavigationStack` never splits by itself. | It renders an existing declared stack; it takes no modal or ad hoc root. | sidebar and detail; split view |
| [`NavigationSplitViewProps`](../public/runtime.d.ts) | Selects which declared primary stack the split view renders; inside a `Tab`, its own. |  |  |
| [`NavigationStack`](../public/runtime.d.ts) | Renders an in-memory navigation stack. A primary stack's root comes from `defineNavigation`, never from JSX. Inside a `Sheet`, `modal` with a `root` makes a stack the sheet owns. | Navigation does not use browser history. Route params must match the declared schema. | navigation stack; push; back button |
| [`NavigationStackProps`](../public/runtime.d.ts) | Either a declared primary stack (optionally naming its tab), or a modal stack inside a `Sheet` that declares its own root. |  |  |
| [`NavigationTransition`](../public/navigationTransition.d.ts) | How a pushed screen arrives and leaves: `automatic` (a slide) or `zoom`. Give one to `Screen`'s `navigationTransition`. | Pushed screens only; sheets and full-screen covers do not zoom. The source must be on screen, or the push slides. A downward dismiss must start within about 27 degrees of vertical. | zoom transition |
| [`newId`](../data/database.d.ts) | A new unique record id that sorts by creation time. | Data lives in IndexedDB on this device. The browser may evict it, and writes can fail. |  |
| [`NotificationAuthorizationStatus`](../public/environment.d.ts) | Notification permission, independent of subscription setup and token rotation. |  |  |
| [`NotificationPermissionExplainer`](../public/environment.d.ts) | Explains what notifications are for before the user asks for them; its button requests authorization from that gesture. | Permission requires the app to be installed on the Home Screen. Local scheduled notifications are unavailable; schedule them from your own authenticated server. | notification permission prompt |
| [`NotificationPermissionExplainerProps`](../public/environment.d.ts) | The notification permission explanation's title and app-authored content. |  |  |
| [`OfflinePresentationProps`](../reachability/react.d.ts) | What the offline view shows: why the server is unavailable, how it is presented, and the recheck and back actions. |  |  |
| [`OpenURLAction`](../web/openURL.d.ts) | The function `useOpenURL` returns. It opens a URL and reports the result at once. |  |  |
| [`OpenURLOptions`](../web/openURL.d.ts) | How to open a web page. `prefersInApp` is a preference; the browser decides how the page is presented. |  |  |
| [`OpenURLResult`](../web/openURL.d.ts) | What happened to an open request: `handled` in the app, `dispatched` to the browser, or `unavailable` with a reason. `dispatched` does not mean the page loaded. |  |  |
| [`OrientationFallback`](../app/definition.d.ts) | What the app shows when the device is in an orientation it does not support: a rotation prompt, a letterboxed layout, a responsive layout, or nothing. |  |  |
| [`Overlay`](../safe-area/Overlay.d.ts) | Layers `content` over its children without changing their frame. Inside a `SafeAreaInset`, the overlay keeps to the reduced safe area and moves with the keyboard, like the composer. | Only views can be overlaid; there is no shape or style overlay. |  |
| [`OverlayProps`](../safe-area/Overlay.d.ts) | The layered `content` and its alignment. The children set the frame. |  |  |
| [`param`](../push/schema.d.ts) | Route parameter types: `string`, `int`, `number` (finite), `boolean` and `enum`, each with `.optional()`. The same schema validates navigation, restoration and notification deep links. | Navigation does not use browser history. Route params must match the declared schema. |  |
| [`Parameter`](../push/schema.d.ts) | One route parameter's validator, made by `param`. |  |  |
| [`ParameterSchema`](../push/schema.d.ts) | A route's parameters by name. |  |  |
| [`PasteButton`](../public/deviceActions.d.ts) | A button that pastes plain text from the clipboard when pressed. It never reads the clipboard before the press. The browser may ask the user to confirm. | Plain text only. Dismissal and denial look the same. WebKit may show an extra Paste confirmation. Not yet verified in an installed app. | paste; clipboard |
| [`PasteButtonProps`](../public/deviceActions.d.ts) | The button content and the callbacks that receive the pasted text or the error. | Plain text only. Dismissal and denial look the same. WebKit may show an extra Paste confirmation. Not yet verified in an installed app. |  |
| [`PhotosPicker`](../public/filePickers.d.ts) | A button that opens the system photo chooser and returns one photo or video as a `File`. | MIME types are hints, not validation. There is no photo library identifier and no lasting file access, and overlapping choosers cannot always be told apart. Not yet verified in an installed app. | photo picker; image upload |
| [`PhotosPickerProps`](../public/filePickers.d.ts) | The picker's label, the selected file and the kind of media it accepts. | MIME types are hints, not validation. There is no photo library identifier and no lasting file access, and overlapping choosers cannot always be told apart. Not yet verified in an installed app. |  |
| [`Picker`](../public/controls.d.ts) | Chooses one option. `menu` (the default) opens a menu from the row, `navigationLink` pushes a list of options, `inline` lists them in place and `segmented` draws a segmented control. An option can carry a `symbol` (or `icon`) and a `color`. Icons draw in colour in an inline or navigationLink list, in the label colour inside the open menu, and not at all when segmented. | Only the menu, navigationLink, inline and segmented styles exist. | dropdown; select; segmented control |
| [`PickerProps`](../public/controls.d.ts) | Picker's options, controlled value and `pickerStyle`. |  |  |
| [`preferredColorScheme`](../app/appearance.d.ts) | Forces the whole app into `light` or `dark`. `system` or null follows the system again. The override lasts until the page reloads, so store the user's choice with `useAppStorage` and apply it at launch. | The override covers the whole app, presentations included; one view or sheet cannot differ. Persist the choice with useAppStorage and apply it at launch. | dark mode; light mode |
| [`PreferredColorScheme`](../app/appearanceStore.d.ts) | An appearance override for the whole app: `light`, `dark`, or `system` (or null) to follow the system. | The override covers the whole app, presentations included; one view or sheet cannot differ. Persist the choice with useAppStorage and apply it at launch. |  |
| [`PresentationDetent`](../presentation/model.d.ts) | A height a sheet can rest at: `medium`, `large`, a fixed `height` in points or a `fraction` of the available height. |  |  |
| [`PresentationProps`](../presentation/Presentation.d.ts) | The presentation binding, accessible title and dismissal callback shared by presentations. |  |  |
| [`Pressable`](../press/Pressable.d.ts) | A plain tap target with no button chrome. It dims while pressed, and a touch that turns into a scroll does not fire `onPress`. Use it for custom tappable content. | An icon-only Pressable needs an aria-label. |  |
| [`PressableOwnedHandlers`](../press/Pressable.d.ts) | The DOM event handlers `Pressable` owns. Use `onPress` and `onPressStateChange` instead. |  |  |
| [`PressableProps`](../press/Pressable.d.ts) | A pressable's `onPress` action, content and press feedback. An `iconOnly` pressable needs an `aria-label`. |  |  |
| [`PressState`](../press/stateMachine.d.ts) | Whether a press is `idle`, held down (`pressed`) or cancelled (`deactivated`). |  |  |
| [`ProgressView`](../controls/ProgressView.d.ts) | A spinning activity indicator, or a linear bar showing `value` out of `total` (1 by default). | Circular progress always spins; it does not show a value. Indeterminate linear progress draws an empty track. See controls.md. | spinner; activity indicator; progress bar; loading |
| [`ProgressViewProps`](../controls/ProgressView.d.ts) | ProgressView's optional label and progress; without `value` it is indeterminate. |  |  |
| [`ProgressViewStyle`](../controls/ProgressView.d.ts) | How a `ProgressView` draws: `linear`, `circular` or `automatic`, which is linear with a value and circular without. |  |  |
| [`Query`](../data/database.d.ts) | An immutable query over a collection: `index`, `keyRange`, `reverse`, `limit` and `filter` each return a new query. `useQuery` hands one to its configure callback. | Data lives in IndexedDB on this device. The browser may evict it, and writes can fail. |  |
| [`ReachabilityPresentation`](../reachability/model.d.ts) | The connectivity presentation currently shown to the user. |  |  |
| [`ReachabilityProbeConfig`](../reachability/model.d.ts) | The endpoint and deadlines used to probe the app server. |  |  |
| [`ReachabilityRoutePolicy`](../reachability/model.d.ts) | Whether a destination remains usable without the app server. |  |  |
| [`ReachabilityState`](../reachability/model.d.ts) | The full reachability state: local for apps without a server, or the server probe state. |  |  |
| [`ReachabilityStateStatus`](../reachability/model.d.ts) | The server probe result, including an unknown initial state. |  |  |
| [`ReachabilityStatus`](../reachability/model.d.ts) | Whether the app server answered: `reachable`, `server-unreachable` or `device-offline`. |  |  |
| [`ReachabilitySurface`](../reachability/model.d.ts) | How Satin shows a failed probe: a `banner`, a `full-screen` offline view, or `none`. |  |  |
| [`RecordOfCollection`](../data/database.d.ts) | The record type stored by a collection declaration. |  |  |
| [`Register`](../public/routes.d.ts) | Augment once in the app to type bare `NavigationLink`, `NavigationStack`, `TabView` and `useNavigation` without generics. |  |  |
| [`RegisteredNavigation`](../public/structure.d.ts) | The navigation declared through `Register`, which types bare `TabView`, `Tab` and `NavigationStack`; `never` when the app has not registered one. |  |  |
| [`RegisteredRoutes`](../public/routes.d.ts) | The routes declared through `Register`; an empty route set when the app has not registered. |  |  |
| [`removing`](../list-form/offsets.d.ts) | Returns a new array without the elements at `offsets`. Pass it exactly what `ForEach`'s `onDelete` reports. | Each returns a new array; store the result in state to update the rows. | delete rows |
| [`Resource`](../data/resource.d.ts) | A shared remote-data cache. Define it outside React and include account identity in keys. |  |  |
| [`ResourceOptions`](../data/resource.d.ts) | Freshness and inactive-entry retention for a resource. Neither option writes to disk. |  |  |
| [`ResourceResult`](../data/useResource.d.ts) | Retained content plus an explicit retry/pull-to-refresh action. |  |  |
| [`ResourceSnapshot`](../data/resource.d.ts) | The current value and request state of one in-memory remote resource. |  |  |
| [`route`](../public/routes.d.ts) | Binds a screen component to its parameter schema and static chrome. Declare the params first, then type the component with `RouteParameters<typeof params>`; this order avoids inference cycles. | Navigation does not use browser history. Route params must match the declared schema. |  |
| [`RouteDefinition`](../public/routes.d.ts) | A screen bound to its parameter schema; made by `route`, collected by `defineRoutes`. |  |  |
| [`RouteOptions`](../public/routes.d.ts) | A destination's static chrome: what its bar shows from the first frame of the push. `Screen` overrides any of these once the screen has its data. |  |  |
| [`RouteParameters`](../push/schema.d.ts) | The props a route component receives for a parameter schema; optional params are optional. |  |  |
| [`RouteParameterValue`](../push/schema.d.ts) | The value described by a route parameter declaration. |  |  |
| [`RouteProps`](../public/routes.d.ts) | The params of one route, as its component receives them. |  |  |
| [`Routes`](../public/routes.d.ts) | Every destination of an app, made by `defineRoutes`. |  |  |
| [`RowActionsProps`](../actions/types.d.ts) | Row swipe actions and context-menu commands. |  |  |
| [`RowIcon`](../list-form/ListForm.d.ts) | A Settings-style icon: a white symbol on a rounded colour tile, for a row's leading edge. | Labels are not interactive, and a custom LabelStyle must return noninteractive content. | settings icon |
| [`RowIconProps`](../list-form/ListForm.d.ts) | The symbol and its tile colour: a system colour name or any CSS colour. |  |  |
| [`RowInteractionProps`](../public/controls.d.ts) | The `swipeActions` and `contextMenu` props of a row in a `List`. |  |  |
| [`RowLabel`](../public/controls.d.ts) | A row title with a secondary `detail` line under it. The framework owns its layout. | Labels are not interactive, and a custom LabelStyle must return noninteractive content. |  |
| [`RowLabelProps`](../public/controls.d.ts) | A row title and its secondary line. |  |  |
| [`runApp`](../public/runtime.d.ts) | Mounts the app into `#root`. Satin creates every primary stack and restores the scene and its launch route before React's first commit, then owns navigation, restoration, notifications and the app shell. Call it once. `Content` replaces the default root, usually to add app-wide providers; it renders `TabView` or `NavigationStack` itself. Without it Satin renders the declaration directly. | One app root per page, for iPhone and iPad WebKit. There are no multiple windows. | mount app; entry point |
| [`RunAppConfiguration`](../public/runtime.d.ts) | The app, routes, navigation and optional root content mounted by runApp. |  |  |
| [`RunAppOptions`](../public/runtime.d.ts) | App-wide runtime options for `runApp`. Every one is optional. |  |  |
| [`SafeAreaBar`](../safe-area/modifiers.d.ts) | A bar on the top or bottom edge that content scrolls under. It is a `SafeAreaInset` with no spacing and its own scroll-edge blur. | The bar uses a CSS backdrop blur, not the navigation bar edge effect, and does not extend the navigation bar. | bottom bar; top bar |
| [`SafeAreaBarProps`](../safe-area/modifiers.d.ts) | A `SafeAreaInset` limited to the top or bottom edge, with no spacing. |  |  |
| [`SafeAreaInset`](../safe-area/SafeAreaInset.d.ts) | Pins an accessory, such as a composer or a filter bar, to one edge of its content. The accessory takes room from the content's safe area on its edge; a scroll view inside still spans the whole frame and scrolls under it. At the bottom, content scrolls under the accessory and its last item stays clear of it. When the accessory resizes, the scroll inset changes in the same frame (through `--satin-inset-accessory-height`), so a composer that grows by a line keeps the newest message in view. | A top inset under a large title stays at the expanded title edge while the title collapses. On an installed iPhone the status bar area is a flat fill (see top-edge-limitation.md). | safe area; accessory; composer bar |
| [`SafeAreaInsetEdge`](../safe-area/SafeAreaInset.d.ts) | The edge a `SafeAreaInset` accessory sits on. `leading` and `trailing` follow the layout direction. |  |  |
| [`SafeAreaInsetProps`](../safe-area/SafeAreaInset.d.ts) | The edge, the accessory (`content`) and its spacing; `children` is the content it insets. |  |  |
| [`SafeAreaPadding`](../safe-area/modifiers.d.ts) | Grows the safe area of the content inside it. Scroll views keep their frame and inset their content; other content is padded. Nested padding adds up. | On a scroll view, bottom padding is a spacer at the end of the content. Nested padding adds up. |  |
| [`SafeAreaPaddingProps`](../safe-area/modifiers.d.ts) | Which edges to pad, and by how much. |  |  |
| [`ScenePhase`](../public/environment.d.ts) | Whether the app is in the foreground with focus (`active`), without focus (`inactive`) or hidden (`background`). |  |  |
| [`Screen`](../public/Screen.d.ts) | A route component's navigation chrome: title, toolbar, search and related options, declared by the screen that owns them. Use it when the title or toolbar depends on the screen's data; static chrome belongs in the route's options. | Title fonts and sizes follow the system; there is no custom title style. Navigation bar minimization is opt-in; never keeps the bar expanded. | navigation bar; title; toolbar |
| [`ScreenLifecycle`](../navigation/types.d.ts) | Whether a screen is covered by another, and the phase of its current transition. |  |  |
| [`ScreenLifecycleCallbacks`](../navigation/types.d.ts) | The `appear` and `disappear` callbacks for `useScreenLifecycle`. |  |  |
| [`ScreenProps`](../public/Screen.d.ts) | A screen's own chrome, overriding its route's static options. |  |  |
| [`ScrollAnchor`](../scroll/position.d.ts) | Where a scroll target lines up in the viewport: `top`, `center` or `bottom`. |  |  |
| [`ScrollAxis`](../scroll/types.d.ts) | The axis along which a scroll surface accepts scrolling. |  |  |
| [`ScrollDismissesKeyboardMode`](../keyboard/adapter.d.ts) | When scrolling dismisses the keyboard: `never`; `immediately`, as soon as a drag on the surface starts; or `interactively`, when a drag reaches the keyboard. WebKit's keyboard cannot follow the finger, so it then slides away on its own curve and the bottom inset follows it. |  |  |
| [`ScrollEdge`](../scroll/edgePolicy.d.ts) | A logical edge of a scroll view. |  |  |
| [`ScrollEdgeEffectHidden`](../scroll/edgePolicy.d.ts) | Whether to hide scroll edge material, optionally for specific edges. | The hard style throws an unsupported error. Only the top edge draws material; other edges draw none. |  |
| [`ScrollEdgeEffectStyle`](../scroll/edgePolicy.d.ts) | The material under bars at a scroll view's edge: `soft`, `hard` or `automatic`. | The hard style throws an unsupported error. Only the top edge draws material; other edges draw none. |  |
| [`ScrollEdgeEffectStyleSelection`](../scroll/edgePolicy.d.ts) | The scroll edge treatment and the edges to which it applies. |  |  |
| [`ScrollEdgeSelection`](../scroll/edgePolicy.d.ts) | One or more scroll edges, or all edges. | The hard style throws an unsupported error. Only the top edge draws material; other edges draw none. |  |
| [`ScrollOffset`](../scroll/types.d.ts) | The scroll position in points along the physical x and y axes. |  |  |
| [`ScrollPositionBinding`](../scroll/position.d.ts) | A controlled scroll position: the id of the target in view, its anchor and the callback that receives changes. |  |  |
| [`ScrollPositionOptions`](../scroll/position.d.ts) | The scroll view's position options: where it starts, whether it keeps visible content in place, a controlled position and a geometry callback. |  |  |
| [`ScrollTarget`](../scroll/ScrollTarget.d.ts) | Marks content a vertical `ScrollView` can scroll to by `id`. | Scroll targets, pull to refresh and scroll geometry work only on the vertical axis. |  |
| [`ScrollToTopOptions`](../scroll/types.d.ts) | Options for `scrollToTop`: whether to animate. |  |  |
| [`ScrollView`](../public/scroll.d.ts) | A scrolling region, vertical by default. Inside a screen its `id` keys scroll restoration, so keep it stable. `refreshable` adds pull to refresh, and a ref handle scrolls to a `ScrollTarget`. | The refresh indicator holds a 60 pt inset while the action runs. Scroll targets, pull to refresh and scroll geometry work only on the vertical axis. The hard style throws an unsupported error. Only the top edge draws material; other edges draw none. | scrolling; pull to refresh; scroll to |
| [`ScrollViewHandle`](../public/scroll.d.ts) | A scroll view's ref handle: its current offset, `scrollTo` a target and `scrollToTop`. |  |  |
| [`ScrollViewProps`](../public/scroll.d.ts) | A scroll view's id, axis, refresh action, keyboard dismissal, edge material and position options. Targets, refresh and geometry work only on the vertical axis. |  |  |
| [`Searchable`](../search/searchable.d.ts) | A search field for a screen or list: its controlled text, prompt, placement, scopes and suggestions. The bar owns the field: its capsule, magnifier, clear button, close button, scope bar and collapse on scroll. In the bottom toolbar, the presented field rides above the keyboard with a close button, and the bar and title give way. Place `<DefaultToolbarItem kind="search" placement="bottomBar" />` to put it beside other bottom bar items. | The app supplies actual search results and recent queries. Submission dismisses the keyboard without exiting search. Scoped phone fields stay in the drawer. Minimized search-button behavior and exact installed-runtime timing remain under qualification; do not replace the framework field with an app-owned keyboard accessory. | search bar; search field |
| [`SearchFieldPlacement`](../search/searchable.d.ts) | Where the search field goes. On iPhone, `'automatic'` uses the bottom toolbar outside a `TabView` when the screen has no other bottom bar items or scopes; otherwise it uses a drawer that scrolls away with the content. On iPad, automatic search belongs to the trailing navigation toolbar, or below the sidebar toolbar in a split view. Explicit toolbar placement stays trailing on iPad, including narrow windows. | The app supplies actual search results and recent queries. Submission dismisses the keyboard without exiting search. Scoped phone fields stay in the drawer. Minimized search-button behavior and exact installed-runtime timing remain under qualification; do not replace the framework field with an app-owned keyboard accessory. |  |
| [`SearchScopes`](../search/searchable.d.ts) | A controlled scope bar, shown under the search field while search is presented. | The app supplies actual search results and recent queries. Submission dismisses the keyboard without exiting search. Scoped phone fields stay in the drawer. Minimized search-button behavior and exact installed-runtime timing remain under qualification; do not replace the framework field with an app-owned keyboard accessory. |  |
| [`SearchSuggestion`](../search/searchable.d.ts) | A suggestion shown under the search field. Choosing one replaces the search text; it does not submit. | The app supplies actual search results and recent queries. Submission dismisses the keyboard without exiting search. Scoped phone fields stay in the drawer. Minimized search-button behavior and exact installed-runtime timing remain under qualification; do not replace the framework field with an app-owned keyboard accessory. |  |
| [`Section`](../list-form/ListForm.d.ts) | A group of rows in a `List` or `Form`, with an optional header and footer. | A ListRow is always one row: its children sit side by side. Use one ListRow per row. |  |
| [`SectionProps`](../list-form/ListForm.d.ts) | A section's rows and its optional header and footer. |  |  |
| [`SecureField`](../public/controls.d.ts) | Password entry through secure system input. In a `List` or `Form` it becomes the row. | Password manager support is limited to autofill. | password field |
| [`SecureFieldProps`](../public/controls.d.ts) | SecureField's controlled text, label and prompt. |  |  |
| [`Selectable`](../root/SatinRoot.d.ts) | Lets the user select and copy the text inside it. App chrome turns text selection off everywhere else, so wrap user-authored content such as notes or messages. | Zoomable is the only region that zooms; the page itself never does. There is no general gesture composition. | text selection; copy text |
| [`SelectableProps`](../root/SatinRoot.d.ts) | The wrapped content and plain div attributes. |  |  |
| [`semanticColor`](../public/colors.d.ts) | Returns a semantic colour, such as `label` or `systemGroupedBackground`, as a CSS colour that follows light and dark appearance. It also resolves inside portals. | Values match iOS 27 at normal contrast. Increased contrast and Display P3 are not supported. Semantic label colours and layered secondary or tertiary text can differ slightly from iOS. |  |
| [`SemanticColorName`](../public/colors.d.ts) | The names of the iOS semantic colours for text, fills, backgrounds, separators and tint (`label`, `secondarySystemBackground`, …). |  |  |
| [`SensoryButton`](../haptics/SensoryButton.d.ts) | A tap target that plays the system selection tick where the browser supports it. There is no other way to trigger haptics. Use plain content only: links, buttons and other form controls cannot be nested. | Only selection or false. Keyboard and assistive activation may not tick. | haptics; vibration |
| [`SensoryButtonProps`](../haptics/SensoryButton.d.ts) | A tap target's action, content and the feedback it plays. |  |  |
| [`SensoryFeedback`](../haptics/SensoryButton.d.ts) | The feedback a `SensoryButton` plays. Only `selection`, the switch tick, exists. |  |  |
| [`ServerReachabilityConfig`](../reachability/model.d.ts) | The server probe and presentation policy for an app that requires connectivity. |  |  |
| [`ServerReachabilityState`](../reachability/model.d.ts) | The last server probe, retry and connectivity presentation state. |  |  |
| [`ShareLink`](../public/deviceActions.d.ts) | A button that opens the system share sheet. Prepare file bytes before rendering, because the sheet must open during the press. | No drag and drop or file provider integration. Completion means the system took the share, not that anyone received it; AbortError also covers having no suitable target. Not yet verified in an installed app. | share sheet; share button |
| [`ShareLinkProps`](../public/deviceActions.d.ts) | The text, URL or files to share, the button content and the completion and error callbacks. | No drag and drop or file provider integration. Completion means the system took the share, not that anyone received it; AbortError also covers having no suitable target. Not yet verified in an installed app. |  |
| [`Sheet`](../public/presentation.d.ts) | A card that slides up over the current screen and can rest at several heights. It can host its own `NavigationStack modal`. Keep `isPresented` in plain React state: presentations start closed after a relaunch. | Sheets start closed after a relaunch. Persist drafts separately, never the presentation flag. | sheet; modal presentation; bottom sheet |
| [`SheetProps`](../public/presentation.d.ts) | A sheet's presentation binding, title, detents and drag behaviour. Supplying `selection` requires `onSelectionChange`. |  |  |
| [`Slider`](../public/controls.d.ts) | Drags a controlled number between `min` and `max`, continuously or in steps. In a `List` or `Form` it fills its own 60 pt row. | No minimum or maximum value labels and no custom tick marks. The label is for accessibility only, and only the thumb can be dragged. | slider; range input |
| [`SliderProps`](../public/controls.d.ts) | Slider's controlled value, range, step and accessibility label. |  |  |
| [`Spacer`](../content/content.d.ts) | Takes up the free space along its parent stack's axis. | Default spacing and frame differences are listed in content.md. Props apply in a fixed order, not the order you write them. | flexible space |
| [`SpacerProps`](../content/content.d.ts) | Spacer's minimum length in points. |  |  |
| [`SpringOptions`](../motion/animationValue.d.ts) | A spring's duration in milliseconds and its bounce, for `Animation.spring`. | Other state and style changes do not animate. There is no null animation, easing curve, repeat, delay, completion callback or per-update timing; use one outer synchronous update. Bounce cannot be negative. |  |
| [`StackDeclaration`](../public/structure.d.ts) | A primary stack: its root route and, when that route requires them, the root's params. |  |  |
| [`Stepper`](../public/controls.d.ts) | Increments or decrements a controlled number within its bounds. It draws a row in a `List` and the bare control elsewhere. | Controlled only: pass value and onChange. | stepper; plus and minus buttons |
| [`StepperProps`](../public/controls.d.ts) | Stepper's controlled value, bounds and step. |  |  |
| [`storageQuota`](../public/storage.d.ts) | The app's storage quota: `estimate()` reports usage, and `requestPersistence()` asks WebKit not to evict the app's data. Request persistence after the user saves something meaningful. | Data lives in IndexedDB on this device. The browser may evict it, and writes can fail. |  |
| [`StringPropertyKey`](../data/database.d.ts) | The property keys whose values are strings. |  |  |
| [`SubmitLabel`](../text-input/kinds.d.ts) | The return key's title: `done`, `go`, `next`, `search` or `send`. |  |  |
| [`SwipeAction`](../actions/types.d.ts) | An entry in a row's swipe actions: any menu entry, or a swipe command that shows only a symbol. |  |  |
| [`SwipeActionItem`](../actions/types.d.ts) | A swipe action command. It may drop its visible label if it has a symbol or icon and an `accessibilityLabel`. |  |  |
| [`SwipeActions`](../actions/types.d.ts) | The `swipeActions` prop of a row: actions for one edge, or a list with one entry per edge. |  | swipe actions; swipe to delete |
| [`SwipeActionsConfiguration`](../actions/types.d.ts) | The swipe actions on one row edge, `trailing` by default. A full swipe runs the first action unless `allowsFullSwipe` is false. |  |  |
| [`SymbolGlyph`](../symbols/types.d.ts) | A symbol's artwork: filled SVG paths on a 56-unit grid, with optional layers for hierarchical and palette rendering, and its provenance. No font, HTML or external resource. |  |  |
| [`SymbolImage`](../symbols/Symbol.d.ts) | Draws a named vector symbol that sizes with the surrounding font and takes its colour. A `.fill` variant is chosen automatically where the context calls for it, such as a selected tab. | The bundled symbols are Framework7 Icons 5.0.5 (MIT) plus clean-room glyphs drawn for Satin, not Apple SF Symbols. Keep their copyright and license notices. Provider glyphs need their own provenance. Only shipped or registered names draw. | icon; glyph |
| [`SymbolImageProps`](../symbols/Symbol.d.ts) | The symbol's name, symbol properties and an optional accessible label. |  |  |
| [`SymbolName`](../symbols/Symbol.d.ts) | A symbol name, such as `'plus'` or `'trash.fill'`. The bundled names autocomplete; any string is accepted for glyphs added through `SymbolProvider`. |  |  |
| [`SymbolProvider`](../symbols/Symbol.d.ts) | Adds or replaces symbol glyphs for everything inside it. Paths must be original, or redistributable with their provenance recorded. | The bundled symbols are Framework7 Icons 5.0.5 (MIT) plus clean-room glyphs drawn for Satin, not Apple SF Symbols. Keep their copyright and license notices. Provider glyphs need their own provenance. Only shipped or registered names draw. |  |
| [`SymbolRenderingMode`](../symbols/types.d.ts) | How a symbol's layers are coloured: `monochrome` in one colour, `hierarchical` in shades of one colour, or `palette` with a colour per layer. |  |  |
| [`SymbolScale`](../symbols/types.d.ts) | A symbol's size relative to the text around it: `small`, `medium` or `large`. |  |  |
| [`SymbolSource`](../symbols/types.d.ts) | Glyphs by symbol name, for `SymbolProvider`. |  |  |
| [`SymbolWeight`](../symbols/types.d.ts) | The weight a symbol is drawn at. It uses the same names as font weights. |  |  |
| [`systemColor`](../public/colors.d.ts) | Returns a system colour as a CSS colour that follows light and dark appearance. | Values match iOS 27 at normal contrast. Increased contrast and Display P3 are not supported. Semantic label colours and layered secondary or tertiary text can differ slightly from iOS. |  |
| [`SystemColorName`](../public/colors.d.ts) | The names of the iOS system colours. Each has a light and a dark value. Plain CSS colours work too. |  |  |
| [`Tab`](../public/runtime.d.ts) | Renders one declared tab inside a `TabView`. Its id, label and root stack come from `defineNavigation`. | Only the declared tab styles exist. Desktop browsers are not supported. |  |
| [`TabDeclaration`](../public/structure.d.ts) | One tab in `defineNavigation`: its id, label, symbol or icon, and the root of its stack. |  |  |
| [`TabId`](../public/structure.d.ts) | The union of a navigation declaration's tab ids. |  |  |
| [`TabProps`](../public/runtime.d.ts) | Names the declared tab to render. |  |  |
| [`TabSection`](../tabs/TabSection.d.ts) | Groups `Tab`s under a collapsible header in the `TabView` sidebar. It adds no navigator of its own. | Only sidebarOnly placement exists: no automatic sections in the top bar, no tab customization and no section header actions. Expansion lasts while the TabView is mounted. With no sidebar, a sidebar-only selection shows the first primary tab. |  |
| [`TabSectionProps`](../tabs/TabSection.d.ts) | A sidebar group's title, optional id and placement, and its `Tab` children. |  |  |
| [`TabView`](../public/runtime.d.ts) | Renders the tabs from `defineNavigation`. Each tab keeps its own stack, and the selected tab is restored with the scene. Pass `selection` and `onSelectionChange` to control it; a controlled tab press only requests the change. | Only the declared tab styles exist. Desktop browsers are not supported. There is no minimize behavior or placement hook yet, and the collapse into the tab bar is incomplete. | tab bar; tabs |
| [`TabViewProps`](../public/runtime.d.ts) | TabView's selection binding and bar behaviour; its tabs come from `defineNavigation`. |  |  |
| [`TaskAction`](../tasks/useTask.d.ts) | The work `useTask` runs: pass `signal` to fetches and publish state through `commit`. |  |  |
| [`TaskCommit`](../tasks/useTask.d.ts) | Publish synchronous state updates only while this invocation is current. |  |  |
| [`TaskOptions`](../tasks/useTask.d.ts) | Options for `useTask`. A change of `id` cancels the current run and starts a new one. |  |  |
| [`TaskRunner`](../tasks/useTask.d.ts) | Cancels the current run and starts the task again; resolves when that run ends. |  |  |
| [`Text`](../content/content.d.ts) | Inline text in a system text style. Nested Text inherits its enclosing style unless it sets its own. A `lineLimit` truncates with an ellipsis. | Default spacing and frame differences are listed in content.md. Props apply in a fixed order, not the order you write them. | text; font; typography |
| [`TextEditor`](../public/controls.d.ts) | Multiline text entry. In a `List` or `Form` it becomes the row; elsewhere it shows three lines by default. | Text layout cannot be customized. | multiline text; text area |
| [`TextEditorProps`](../public/controls.d.ts) | TextEditor's controlled text, label and prompt. |  |  |
| [`TextField`](../public/controls.d.ts) | Single-line controlled text with a label, an optional `prompt` and keyboard intent from `kind`. In a `List` or `Form` it becomes the row; elsewhere it draws a standalone field. `axis="vertical"` grows with its content. | textFieldStyle="plain" removes the field chrome. WebKit owns the system keyboard, and text layout cannot be customized. | text field; text input |
| [`TextFieldKind`](../text-input/kinds.d.ts) | What a field holds, setting its keyboard, autofill and autocorrection together. |  |  |
| [`TextFieldProps`](../public/controls.d.ts) | A single-line field, or with `axis="vertical"` a field that grows to its `lineLimit`. |  |  |
| [`TextFieldStyle`](../public/controls.d.ts) | How a text field draws. `automatic` adapts to its container; `plain` draws no field chrome. |  |  |
| [`TextProps`](../content/content.d.ts) | Text's font, weight, design, line limit and alignment. |  |  |
| [`TextStyle`](../content/content.d.ts) | The system text styles, sized as iOS draws them at the default text size. |  |  |
| [`TitleDisplayMode`](../navigation/types.d.ts) | How a screen title is drawn: `inline` in the bar, `large` below it, `inlineLarge` large inside the bar row, or `none`. |  |  |
| [`Toggle`](../public/controls.d.ts) | A controlled on/off value. It draws a switch row in a `List` or `Form` and a bare switch elsewhere. `toggleStyle` can make it a button or a custom `ToggleStyle`. | Only the switch and button styles are built in; anything else needs a custom ToggleStyle. | switch; checkbox |
| [`ToggleProps`](../public/controls.d.ts) | Toggle's controlled value, label and control properties. |  |  |
| [`ToggleStyle`](../public/controlStyle.d.ts) | A custom look for `Toggle`. Satin applies the declared `semantics` (switch, checkbox or button) to the element it owns; `makeBody` draws the appearance. |  |  |
| [`ToggleStyleConfiguration`](../public/controlStyle.d.ts) | What a custom `ToggleStyle` draws from: the label, the on state and the pressed state, plus the shared control values. |  |  |
| [`ToolbarItem`](../public/toolbar.d.ts) | Places one item in the navigation bar or the bottom toolbar. Adjacent actions share a glass capsule; a `ToolbarSpacer` separates groups. | Only the placements in ToolbarItemProps exist. | toolbar button; bar button |
| [`ToolbarItemGroup`](../public/toolbar.d.ts) | Groups several items under one placement. They render as consecutive `ToolbarItem`s and share one glass capsule. | Only the placements in ToolbarItemProps exist. |  |
| [`ToolbarItemProps`](../public/toolbar.d.ts) | A toolbar item's placement and content. `automatic` lets the bar choose; `bottomBar` puts it in the bottom toolbar. |  |  |
| [`ToolbarMinimizationBehavior`](../navigation/toolbarMinimization.d.ts) | When the navigation bar minimizes: `onScrollDown`, `onScrollUp` or `never`. | Navigation bar minimization is opt-in; never keeps the bar expanded. |  |
| [`ToolbarMinimizationRestoration`](../navigation/toolbarMinimization.d.ts) | What brings back a minimized bar: `automatic`, or only reaching the scroll edge (`atScrollEdge`). | Navigation bar minimization is opt-in; never keeps the bar expanded. |  |
| [`ToolbarMinimizationSafeAreaAdjustment`](../navigation/toolbarMinimization.d.ts) | Whether the content inset shrinks when the bar minimizes. | Navigation bar minimization is opt-in; never keeps the bar expanded. |  |
| [`ToolbarSpacer`](../public/toolbar.d.ts) | Splits toolbar items into separate glass capsules. Consecutive items of one placement share one capsule; a spacer between them splits it. Place it directly in `toolbar`, next to the items. | Only the placements in ToolbarItemProps exist. |  |
| [`ToolbarSpacerProps`](../public/toolbar.d.ts) | The spacer's sizing and placement. |  |  |
| [`TransactionCollection`](../data/database.d.ts) | A collection as seen inside `db.transaction`: its writes commit together or not at all. |  |  |
| [`TransactionCollections`](../data/database.d.ts) | The typed collection handles available inside a database transaction. |  |  |
| [`TransitionPhase`](../navigation/types.d.ts) | Where a screen is in a navigation transition: `entering`, `exiting` or `settled`. |  |  |
| [`UpdateActivation`](../app/definition.d.ts) | When a downloaded update may apply: `cold-launch`, the default, or `cold-launch-or-explicit`, which also lets it apply on request, as the development menu does. |  |  |
| [`useAppStorage`](../public/environment.d.ts) | A small preference kept in local storage across launches. Every component that reads the same key sees the same value. Values must be JSON-serializable. | Stored in the origin's local storage on this device. It does not sync across devices. | persistent settings; preferences; local storage |
| [`useAppUpdate`](../public/environment.d.ts) | Reports whether this launch applied an app update: `justUpdated` holds the previous and current build ids after an update, null otherwise (and until launch settles). Release updates apply at launch, before first input after foregrounding, or at a clean suspension. | Preview builds may reload on update. Release, the default, applies updates only at safe moments. |  |
| [`useBuildInfo`](../app/buildInfo.d.ts) | Returns the build that is running, even offline. The values are written by `satinApp` at build time; it never asks the server for the latest deployment. | The build id is not a git revision or a service worker cache hash. Builds made without satinApp report "unavailable". What the server last served says nothing about which cached bundle is running. |  |
| [`useColorScheme`](../public/environment.d.ts) | The appearance Satin is drawing right now, `light` or `dark`. | Increased contrast is not reported. Size classes are compact or regular only. | dark mode |
| [`useDismiss`](../presentation/dismiss.d.ts) | Closes the screen or presentation that contains the caller. In a pushed screen it pops that screen; at the root of a Sheet or FullScreenCover it dismisses the presentation, even when interactive dismissal is disabled. Elsewhere it does nothing. | Covers cannot be swiped away. They start closed after a relaunch. | close; go back |
| [`useDismissSearch`](../search/SearchEnvironment.d.ts) | Leave the enclosing search mode, clear its query, and dismiss its keyboard. | The app supplies actual search results and recent queries. Submission dismisses the keyboard without exiting search. Scoped phone fields stay in the drawer. Minimized search-button behavior and exact installed-runtime timing remain under qualification; do not replace the framework field with an app-owned keyboard accessory. |  |
| [`useEditMode`](../list-form/editing.d.ts) | Returns this screen's edit mode and a setter. `EditButton` toggles the same value, so a toolbar or bottom bar can follow it. | Rows are identified by their ForEach ids. Edit mode belongs to each screen and cannot be set from outside it. Outside edit mode, plain rows cannot be selected with the keyboard. |  |
| [`useFocusChain`](../text-input/focusChain.d.ts) | Moves focus through a form's fields in `order`. The return key goes to the next field and the last one dismisses the keyboard. Disabled and unmounted fields are skipped. Spread `field(key)` onto each field. | Focus moves only through the fields you register. A custom keyboard is not possible. | next field; return key |
| [`useGlassErrors`](../public/environment.d.ts) | Every glass renderer error so far, re-rendering when one is added. For diagnostics screens; `runApp`'s `onGlassError` is the way to report them. | Diagnostics show what failed; they do not prove the app looks or behaves right on a device. |  |
| [`useHorizontalSizeClass`](../public/environment.d.ts) | The horizontal size class: `compact` or `regular`. Inside a presentation it is the presentation's own class; elsewhere, the window's. | Increased contrast is not reported. Size classes are compact or regular only. | iPad layout; responsive layout |
| [`useIsSearching`](../search/SearchEnvironment.d.ts) | Whether the enclosing searchable screen is in search mode, including after submission. | The app supplies actual search results and recent queries. Submission dismisses the keyboard without exiting search. Scoped phone fields stay in the drawer. Minimized search-button behavior and exact installed-runtime timing remain under qualification; do not replace the framework field with an app-owned keyboard accessory. |  |
| [`useKeyboardMetrics`](../public/keyboard.d.ts) | Returns the keyboard's geometry in points and re-renders as it changes. `expectedHeight` is the keyboard height to plan for before the keyboard has shown. | It reads the keyboard; it cannot change the keyboard or add a separate keyboard lifecycle. | keyboard height |
| [`useMediaPlayer`](../media/react.d.ts) | Returns the app's audio player: its commands and its live state. The system's Lock Screen media controls drive the same player. Audio only; there is no video playback. | Audio only, with no video player and no background playback beyond what WebKit allows. Playback depends on WebKit codec support and a server that serves byte ranges. | audio player; music player |
| [`useNamespace`](../motion/matchedGeometry.d.ts) | Returns a namespace that stays the same for the life of the component. Pass it to `MatchedGeometryEffect` and `MatchedTransitionSource`. | Matches frames only, around the centre. Corner radius scales with the frame during the flight instead of staying fixed. A non-source view does not follow its source outside an animation. Glass does not travel with a removed view. |  |
| [`useNavigation`](../public/runtime.d.ts) | Returns the enclosing stack's navigation actions, typed against the registered routes. A wrong route id or a missing param is a compile error. | Navigation does not use browser history. Route params must match the declared schema. |  |
| [`useNotifications`](../public/environment.d.ts) | The app's notification permission and badge. Call `requestAuthorization` from a user gesture, after explaining why (see `NotificationPermissionExplainer`). Without `runApp`'s `notifications` option the status is `unsupported`. | Permission requires the app to be installed on the Home Screen. Local scheduled notifications are unavailable; schedule them from your own authenticated server. | push notifications; badge |
| [`useOpenURL`](../web/openURL.d.ts) | Returns a function that opens a URL from an action. App URLs that match a registered route navigate inside the app; other URLs go to the browser. | You cannot force the external browser. A dispatched URL is not a loaded page. Cross-origin or blocked frames report unverified, and only same-origin frames can be reloaded or stopped. | open link; open URL |
| [`useQuery`](../data/database.d.ts) | Reads a collection's records as `{ data, loading, error }` and keeps them live. Local writes show up synchronously, before they persist. | Data lives in IndexedDB on this device. The browser may evict it, and writes can fail. | live query |
| [`useReachability`](../reachability/react.d.ts) | The app server's status and the offline view currently shown, with `fetch` and `recheck` helpers that feed the status. | It cannot promise that a request will succeed. | offline; network status |
| [`useRecord`](../data/database.d.ts) | One record by key, kept live; `data` is undefined while loading and when no record exists. | Data lives in IndexedDB on this device. The browser may evict it, and writes can fail. |  |
| [`useResource`](../data/useResource.d.ts) | Read shared content synchronously; load missing or stale data when the screen shows. Refresh errors preserve content and appear in error. Covering or popping a screen never cancels a shared request. Use useTask for work that must stop with its screen. | No automatic persistence, transport or background execution. Include account identity in keys and clear resources on sign-out. Cold, unseeded reads still need loading UI. |  |
| [`UserInterfaceSizeClass`](../public/environment.d.ts) | How much room there is along one axis: `compact` or `regular`. |  |  |
| [`useSafeAreaInsets`](../public/environment.d.ts) | The live safe-area insets in CSS pixels. Use them instead of `env(safe-area-inset-*)`. | A top inset under a large title stays at the expanded title edge while the title collapses. On an installed iPhone the status bar area is a flat fill (see top-edge-limitation.md). | safe area insets; notch; home indicator |
| [`useScaledMetric`](../content/scaledMetric.d.ts) | Scales a dimension with the user's text size, relative to a text style (`body` by default). Use it for spacing or icon sizes that should grow with text. | largeTitle and callout scale by fixed fallbacks, because WebKit has no system font keyword for them. | text size scaling |
| [`useScenePhase`](../public/environment.d.ts) | Whether the app is in use: `active` in the foreground with focus, `inactive` without focus, `background` when hidden. | The browser may stop running the app while it is suspended. A screen's lifecycle is separate from the app's foreground state. | foreground; background; app state |
| [`useSceneStorage`](../public/environment.d.ts) | State kept with the current navigation entry, so a draft survives a relaunch. Each pushed entry owns its own value. Values must be JSON-serializable. Keep saved records in a collection, not here. | Do not store presentation visibility here. A checkpoint can be lost if the browser evicts storage or the process crashes. | restorable screen state; draft |
| [`useScreenLifecycle`](../navigation/navigationContext.d.ts) | Runs `appear` and `disappear` callbacks as the screen is shown and covered or removed, and returns whether it is covered and its transition phase. | The browser may stop running the app while it is suspended. A screen's lifecycle is separate from the app's foreground state. |  |
| [`useTask`](../tasks/useTask.d.ts) | For shared remote data, use defineResource/useResource so revisits retain content. Runs async work while its screen is showing. It cancels the run when the screen is covered, its tab is hidden or the component unmounts, and starts again when it shows. Pass `signal` to `fetch` and publish results through `commit`. An error the task throws reaches the nearest error boundary. The returned runner cancels and replaces the current run. | Cancellation is cooperative: state set outside commit cannot be stopped. The work runs in the foreground only; it is not a Web Worker or a background scheduler. | cancellable task; data loading |
| [`useUnsavedChanges`](../root/runtimeContext.d.ts) | Tells Satin the app has unsaved work while `unsaved` is true, so a pending app update waits instead of reloading over it. Edits in text fields are detected without this hook. | It only delays app updates; it does not stop the user from dismissing a sheet. | unsaved changes |
| [`useVerticalSizeClass`](../public/environment.d.ts) | The vertical size class: `compact` or `regular`. Inside a presentation it is the presentation's own class; elsewhere, the window's. | Increased contrast is not reported. Size classes are compact or regular only. |  |
| [`useWebAuthentication`](../web/useWebAuthentication.d.ts) | Returns a sign-in flow's current state and re-renders when it changes. It checks for a finished sign-in on launch and when the app returns to the foreground. | Needs a secure context, local storage, Web Locks, a dedicated uncached callback page and a server exchange. Bridge reads need a private transaction proof. Your server validates tokens and OpenID Connect. Completion in the background is not guaranteed. |  |
| [`useWebFrame`](../web/WebView.d.ts) | Makes a controller to pass to a `WebView`, for reading its state and reloading or stopping it. | You cannot force the external browser. A dispatched URL is not a loaded page. Cross-origin or blocked frames report unverified, and only same-origin frames can be reloaded or stopped. |  |
| [`VerticalScrollGeometry`](../scroll/position.d.ts) | Vertical scroll geometry: the current viewport and content offset in points. |  |  |
| [`VerticalTextFieldProps`](../public/controls.d.ts) | Vertical TextField's controlled text, growth limits and keyboard intent. |  |  |
| [`ViewportFitPolicy`](../app/viewportValue.d.ts) | How the app fits the screen around the notch and home indicator. `adaptive` picks a fit per device before the app renders. |  |  |
| [`ViewThatFits`](../content/layout.d.ts) | Shows the first child whose natural size fits the space, or the last child when none fits. It measures again when the space or a child resizes. | Give it a definite height when it checks the vertical axis. Every child stays mounted: hidden children are inert and pause Satin tasks and activity indicators, but their own effects keep running. | responsive layout; fallback layout |
| [`ViewThatFitsAxis`](../content/layout.d.ts) | The axes a `ViewThatFits` candidate must fit along. |  |  |
| [`ViewThatFitsProps`](../content/layout.d.ts) | The axes to check, `both` by default, plus plain div attributes. |  |  |
| [`Visibility`](../navigation/types.d.ts) | Whether the navigation bar shows. A hidden bar reserves no row. |  |  |
| [`VStack`](../content/content.d.ts) | Arranges its children in a column. Set `spacing` where it matters: wrappers and custom controls do not pass their children's preferred spacing up to the stack. | Default spacing and frame differences are listed in content.md. Props apply in a fixed order, not the order you write them. | column; vertical layout |
| [`VStackProps`](../content/content.d.ts) | VStack's horizontal alignment and spacing in points. |  |  |
| [`WebAuthentication`](../web/authentication.d.ts) | A sign-in flow made by `defineWebAuthentication`: prepare, start, complete and resume it, or subscribe to its state. |  |  |
| [`WebAuthenticationCallbackResult`](../web/authentication.d.ts) | The outcome of `complete` on the callback page: the URL to return to, or why it was rejected. |  |  |
| [`WebAuthenticationConfiguration`](../web/authentication.d.ts) | The OAuth provider, client, callback and app URLs for `defineWebAuthentication`, and the `exchange` function that finishes sign-in on your server. |  |  |
| [`WebAuthenticationExchange`](../web/authentication.d.ts) | What `exchange` receives: the authorization code, the PKCE verifier and the values your server needs to redeem and check it. |  |  |
| [`WebAuthenticationRequest`](../web/authentication.d.ts) | A prepared sign-in. Call `start` from the user's press. |  |  |
| [`WebAuthenticationStartResult`](../web/authentication.d.ts) | Whether `start` opened the provider in a popup or a redirect, or why it could not. |  |  |
| [`WebAuthenticationState`](../web/authentication.d.ts) | Where a sign-in stands, from `idle` through `pending` and `completing` to a final status. |  |  |
| [`WebFrameActionResult`](../web/WebView.d.ts) | Whether a `reload` or `stop` request was sent to the frame, or why not. |  |  |
| [`WebFrameController`](../web/WebView.d.ts) | Reads a `WebView`'s state and sends it `reload` and `stop`. Only same-origin frames expose their current page or accept these commands. |  |  |
| [`WebFrameState`](../web/WebView.d.ts) | The embedded page's load state. A cross-origin page reports `unverified`, because its contents cannot be read. |  |  |
| [`WebView`](../web/WebView.d.ts) | Embeds a web page in a sandboxed frame. The browser decides whether the page may be framed, and the frame's storage is partitioned from the app's. | You cannot force the external browser. A dispatched URL is not a loaded page. Cross-origin or blocked frames report unverified, and only same-origin frames can be reloaded or stopped. | iframe; embedded web page |
| [`WebViewLink`](../web/frameDocument.d.ts) | A link's authored browsing-context target, supplied when link interception is available. |  |  |
| [`WebViewProps`](../web/WebView.d.ts) | The page URL, its accessible title, an optional controller, and what the page may run. Scripts and forms are off by default. |  |  |
| [`withAnimation`](../motion/matchedGeometry.d.ts) | Applies the state changes in `update`, then animates the `MatchedGeometryEffect` views they move, insert or remove. Call it from an event handler. Keyed List rows also move to their new positions. Other views take their new layout at once. Returns the callback result and passes errors through. Only synchronous updates take part, and nested calls join the outer one. | Other state and style changes do not animate. There is no null animation, easing curve, repeat, delay, completion callback or per-update timing; use one outer synchronous update. Bounce cannot be negative. | animated state update |
| [`WriteFailure`](../data/write-store.d.ts) | A durable write that failed after it was published to memory, reported to `db.onError`. |  |  |
| [`Zoomable`](../zoom/Zoomable.d.ts) | A region the user can pinch to zoom and pan, such as a photo or a map. The + and - keys zoom about the centre and 0 resets. Give it an accessible label. | Zoomable is the only region that zooms; the page itself never does. There is no general gesture composition. | pinch to zoom |
| [`ZoomableProps`](../zoom/Zoomable.d.ts) | The maximum zoom (4 by default) and a scale callback. Satin owns the pointer handlers. |  |  |
| [`ZoomTransitionOptions`](../public/navigationTransition.d.ts) | The source identity and namespace for `NavigationTransition.zoom`. |  |  |
| [`ZStack`](../content/content.d.ts) | Layers its children in one cell, later children on top. Assistive technology reads them in source order. | Default spacing and frame differences are listed in content.md. Props apply in a fixed order, not the order you write them. | layers; overlay |
| [`ZStackProps`](../content/content.d.ts) | How ZStack aligns its layers. |  |  |

## diagnostics API

Module: `@satinhq/kit/diagnostics`

Readers for installation and appearance records, for an optional diagnostics screen.

| Satin export | Behavior | Limits | Also known as |
| --- | --- | --- | --- |
| [`AppearanceEvent`](../app/appearanceStore.d.ts) | One entry in the appearance diagnostics log: what happened and the appearance seen then. |  |  |
| [`InstallationDiagnostics`](../app/InstallationDiagnostics.d.ts) | Shows the app's installation receipts, for an optional diagnostics screen in Settings. Pass the app's scope. |  |  |
| [`InstallationDiagnosticsProps`](../app/InstallationDiagnostics.d.ts) | The app scope whose installation receipts are shown. |  |  |
| [`InstallationFailure`](../app/installationFailure.d.ts) | An installation failure recorded before the app launched: the build, the URL, the reason and whether the network failed. |  |  |
| [`readAppearanceDiagnostics`](../app/appearance.d.ts) | Returns a short log of appearance changes and lifecycle events, for diagnosing appearance after a resume. |  |  |
| [`readInstallationFailure`](../app/installationFailure.d.ts) | Reads the last recorded installation failure for an app scope, or null when there is none. |  |  |

## install API

Module: `@satinhq/kit/install`

Building blocks for a custom install page. They work only on the install page that `satinApp` builds.

| Satin export | Behavior | Limits | Also known as |
| --- | --- | --- | --- |
| [`copyInstallLink`](../app/installContext.d.ts) | Copies the install page's address. Never throws: a refusal is reported with the address. |  |  |
| [`CopyLinkResult`](../app/installContext.d.ts) | Whether `copyInstallLink` copied the address, and the address itself. |  |  |
| [`InstallApp`](../app/installContext.d.ts) | The app being installed: its name, icon, tint and install page address. |  |  |
| [`InstallBrowser`](../app/installContext.d.ts) | The browser the install page is open in. `in-app` is a browser inside another app, which cannot add to the Home Screen. |  |  |
| [`InstallContext`](../app/installContext.d.ts) | What a custom install page knows about where it is open: device, browser, Safari version, standalone mode and the app. A Safari tab cannot tell whether the app is already on the Home Screen. |  |  |
| [`InstallDevice`](../app/installContext.d.ts) | The device the install page is open on: `iphone`, `ipad` or `other`. |  |  |
| [`InstallSteps`](../app/InstallComponents.d.ts) | The three install steps for this device, browser and Safari layout, worded as on Satin's own install page. |  |  |
| [`InstallTip`](../app/InstallComponents.d.ts) | The tip at Safari's real control ("Page Menu, then Share" or "Share"), in Satin's glass. Shown only in Safari 27 on an iPhone or iPad, where the control's place was measured; renders nothing anywhere else. Its glass takes the page's background colour. |  |  |
| [`readInstallContext`](../app/installContext.d.ts) | Reads the install context from the browser. It throws outside the install page that `satinApp` builds. |  |  |
| [`useInstallContext`](../app/InstallComponents.d.ts) | Returns the install context, read once when the page opens. It throws outside the install page. |  |  |

## internal API

Module: `@satinhq/kit/internal`

Framework internals for Satin tooling and tests. App code must not import them; app lint rejects this module, and it changes without notice.

| Satin export | Behavior | Limits | Also known as |
| --- | --- | --- | --- |
| [`Action`](../actions/types.d.ts) | An entry in a menu, context menu or swipe action list: a command, a titled section of entries, or a submenu. |  |  |
| [`ActionItem`](../actions/types.d.ts) | A single command with an id, a label, an optional symbol and role, and an `onPress` handler. Menus, swipe actions, alerts and confirmation dialogs all use it. |  |  |
| [`Alert`](../presentation/Presentation.d.ts) | A centred alert with a title, an optional message, up to three actions and an optional text field. |  | alert; dialog; popup |
| [`AlertProps`](../presentation/Presentation.d.ts) | An alert's presentation binding, title, message, actions and optional text field. |  |  |
| [`AnyScreenDefinition`](../navigation/types.d.ts) |  |  |  |
| [`AppDefinition`](../app/definition.d.ts) | A validated app definition, returned by `defineApp`. Pass it to `runApp` and to the Vite plugin. |  |  |
| [`AppDeploymentInput`](../app/definition.d.ts) | Resolved app deployment fields, including local or server connectivity. |  |  |
| [`Appearance`](../glass/lens/theme.d.ts) |  |  |  |
| [`AppearanceEvent`](../app/appearanceStore.d.ts) | One entry in the appearance diagnostics log: what happened and the appearance seen then. |  |  |
| [`AppShellBuildState`](../sw/registerAppShell.d.ts) |  |  |  |
| [`AxisLayoutClass`](../layout/layoutClass.d.ts) |  |  |  |
| [`bindMenuGestures`](../menu/menuGesture.d.ts) | One pointer owns a menu session, including the trigger-to-panel handoff. Native buttons retain their click/keyboard/assistive activation path. Hosts must declare touch-action:none on these gesture owners, never the document. |  |  |
| [`BitmapBackdropMode`](../glass/lens/bitmapBackdrop.d.ts) | Measurement fixtures share a decoded bitmap between DOM and GPU sources. |  |  |
| [`blendMenuFrames`](../glass/lens/menuMotion.d.ts) |  |  |  |
| [`BridgeMode`](../glass/renderSpecs.d.ts) |  |  |  |
| [`ButtonRow`](../list-form/ListForm.d.ts) |  |  |  |
| [`cancelStackTransition`](../navigation/stack.d.ts) |  |  |  |
| [`CapsuleShape`](../glass/renderSpecs.d.ts) |  |  |  |
| [`Choice`](../list-form/ListForm.d.ts) | One option of a `Picker`. |  |  |
| [`Chrome`](../root/SatinRoot.d.ts) | Re-enters app-chrome policy inside a Selectable region. |  |  |
| [`ChromeBandSpec`](../glass/renderSpecs.d.ts) |  |  |  |
| [`clampStepper`](../list-form/state.d.ts) |  |  |  |
| [`collection`](../data/database.d.ts) | Declares a collection of records keyed by one unique string field. The curried form, `collection<Note>()({ key, indexes })`, infers index names. |  |  |
| [`Collection`](../data/database.d.ts) | One collection of a database (`db.notes`). Once loaded, writes publish to memory at once, so `useQuery` sees them immediately; the returned promise settles after the durable commit. |  |  |
| [`CollectionDefinition`](../data/database.d.ts) | A collection's record type, key and indexes, made by `collection` for `defineDatabase`. |  |  |
| [`ConfirmationDialog`](../presentation/Presentation.d.ts) | A titled set of actions, such as Delete and Cancel, shown next to the control that opened it. |  | action sheet; delete confirmation |
| [`ConfirmationDialogProps`](../presentation/Presentation.d.ts) | A confirmation dialog's presentation binding, title, message, actions and optional anchor. |  |  |
| [`connectPushRoutes`](../push/urlProjection.d.ts) | Pending taps are acknowledged after acceptance and the optional durability gate. |  |  |
| [`ContentPage`](../glass/lens/tabPresentation.d.ts) |  |  |  |
| [`ContextMenu`](../actions/RowActions.d.ts) | Opens a menu of actions when the user long-presses its content, with an optional custom `preview`. Rows in a `List` take a `contextMenu` prop instead. |  | long press menu |
| [`ContextMenuConfiguration`](../actions/types.d.ts) | The `contextMenu` prop of a row: a list of actions, or actions with a custom `preview`. |  |  |
| [`createAnimatedTransitionController`](../navigation/motion.d.ts) | State, besides the lifecycle: - `interactionPhase` (interactive pops): 'held' while the finger owns the page, then 'completing' or 'cancelling' once released. A cancelling pop can be caught again (resumeInteractive) and returns to 'held'. - Who moves the page: a native scroll scrub (`scrollSource`, the private scroller drives scroll-timeline tracks), the frame loop (setProgress writes a pose), or the release and automatic tracks in `activeAnimations`. - `binding`: the elements of the screens it moves, bound after React commits them. A release that arrives before the first binding waits in `pendingRelease`. |  |  |
| [`createInstantTransitionController`](../navigation/store.d.ts) |  |  |  |
| [`createNavigationReleaseTrajectory`](../navigation/releaseTrajectory.d.ts) |  |  |  |
| [`createNavigator`](../navigation/store.d.ts) |  |  |  |
| [`CreateNavigatorOptions`](../navigation/store.d.ts) |  |  |  |
| [`createPushNotifications`](../push/notifications.d.ts) | Create once outside React. Only enable() requests permission, synchronously from a gesture. |  |  |
| [`createPushRelayAdapter`](../push/notifications.d.ts) | Obtain a user-scoped token at runtime. Never bundle the relay sender token. |  |  |
| [`createRenderSpecs`](../glass/renderSpecs.d.ts) |  |  |  |
| [`createRouteCodec`](../navigation/routeCodec.d.ts) | Each route is independently versioned so updates keep the deepest valid ancestor. |  |  |
| [`createSceneRestoration`](../restoration/scene.d.ts) |  |  |  |
| [`createScreenRegistry`](../navigation/registry.d.ts) |  |  |  |
| [`createSurfaceClipPath`](../glass/renderSpecs.d.ts) |  |  |  |
| [`decodePushRoute`](../push/routes.d.ts) |  |  |  |
| [`defineApp`](../app/definition.d.ts) | Validates a full app definition and fills in its defaults. `defineApp` uses it; lab fixtures call it directly. |  | app manifest; app config |
| [`defineDatabase`](../data/database.d.ts) | Opens the app's local database, stored in IndexedDB. Each collection becomes a property of the result. Bump `version` with a migration whenever the schema changes. Export and import are built in, so offer them to the user. |  | local database; offline storage; IndexedDB |
| [`defineScreen`](../navigation/registry.d.ts) |  |  |  |
| [`DetailList`](../navigation/DetailList.d.ts) | A grouped list of rows for a split view's detail column at regular width. |  |  |
| [`DirectCanvasElements`](../glass/renderSpecs.d.ts) |  |  |  |
| [`DisclosureIndicator`](../settings/DisclosureIndicator.d.ts) | Framework7 disclosure artwork; framework layout still owns the row aperture. |  |  |
| [`DisclosureIndicatorProps`](../settings/DisclosureIndicator.d.ts) | Props for `DisclosureIndicator`. |  |  |
| [`dismissKeyboard`](../keyboard/adapter.d.ts) |  |  |  |
| [`DisplayCornerMetrics`](../safe-area/displayCorners.d.ts) | The screen's corner radius in points, with how sure Satin is of the model. |  |  |
| [`DisplayGeometry`](../safe-area/displayCorners.d.ts) | Display geometry in CSS points. Supply the physical screen, not the app window. |  |  |
| [`drawGlassBitmapBackdrop`](../glass/lens/bitmapBackdrop.d.ts) |  |  |  |
| [`drawReferenceBackground`](../glass/lens/referenceBackground.d.ts) |  |  |  |
| [`EdgeInsets`](../safe-area/useSafeAreaMetrics.d.ts) | Insets in CSS pixels, by physical edge. |  |  |
| [`encodePushRoute`](../push/routes.d.ts) |  |  |  |
| [`EntryTransition`](../navigation/types.d.ts) |  |  |  |
| [`estimateStorage`](../data/database.d.ts) | The app's storage usage and quota in bytes, when WebKit reports them. |  |  |
| [`evaluateTemporalSpline`](../glass/lens/liquidMotion.d.ts) |  |  |  |
| [`ExperimentalDrawer`](../drawer/ExperimentalDrawer.d.ts) |  |  |  |
| [`ExperimentalDrawerHandle`](../drawer/drawerHandle.d.ts) |  |  |  |
| [`ExperimentalDrawerProps`](../drawer/ExperimentalDrawer.d.ts) | Props for `ExperimentalDrawer`. |  |  |
| [`ExperimentalThreePane`](../drawer/ExperimentalThreePane.d.ts) |  |  |  |
| [`ExperimentalThreePaneProps`](../drawer/ExperimentalThreePane.d.ts) | Props for `ExperimentalThreePane`. |  |  |
| [`ExportDocument`](../data/database.d.ts) | The JSON document `exportJSON` writes and `importJSON` reads. |  |  |
| [`finishStackTransition`](../navigation/stack.d.ts) |  |  |  |
| [`getGlassErrors`](../glass/errors.d.ts) |  |  |  |
| [`Glass`](../glass/regions.d.ts) | Immutable glass material values. RGBA channels use the range 0...1. |  |  |
| [`GLASS_BAR_EDGE_HIGHLIGHT_ALPHA`](../glass/tokens.d.ts) |  |  |  |
| [`GLASS_BAR_HEIGHT_PX`](../glass/tokens.d.ts) |  |  |  |
| [`GLASS_BAR_SHADOW_ALPHA`](../glass/tokens.d.ts) |  |  |  |
| [`GLASS_CIRCLE_INLINE_INSET_PX`](../glass/lens/Scene.d.ts) |  |  |  |
| [`GLASS_CIRCLE_SIZE_PX`](../glass/lens/Scene.d.ts) |  |  |  |
| [`GLASS_CIRCLE_TOP_PX`](../glass/lens/Scene.d.ts) |  |  |  |
| [`GLASS_CLEAR_BRIGHTNESS`](../glass/tokens.d.ts) |  |  |  |
| [`GLASS_CLEAR_SATURATION`](../glass/tokens.d.ts) |  |  |  |
| [`GLASS_CLEAR_TINT_ALPHA`](../glass/tokens.d.ts) |  |  |  |
| [`GLASS_CONTROL_SIZE_PX`](../glass/tokens.d.ts) |  |  |  |
| [`GLASS_DOCK_BOTTOM_GAP_PX`](../glass/lens/Scene.d.ts) |  |  |  |
| [`GLASS_DOCK_HEIGHT_PX`](../glass/lens/Scene.d.ts) |  |  |  |
| [`GLASS_DOCK_RADIUS_PX`](../glass/lens/Scene.d.ts) |  |  |  |
| [`GLASS_DOCK_SIDE_INSET_PX`](../glass/lens/Scene.d.ts) |  |  |  |
| [`GLASS_DOCK_WIDTH_PX`](../glass/lens/Scene.d.ts) |  |  |  |
| [`GLASS_OVERSCAN_X_PX`](../glass/lens/Scene.d.ts) |  |  |  |
| [`GLASS_OVERSCAN_Y_PX`](../glass/lens/Scene.d.ts) |  |  |  |
| [`GLASS_REGION_LIMIT`](../glass/regions.d.ts) | Provisional allocation guard, not a measured device performance promise. Two 440×894 sheets at 3× with 20pt sample margins need 8,069,760 pixels. The 12M guard permits that stack plus chrome; it is not a memory benchmark. |  |  |
| [`GLASS_REGION_PIXEL_LIMIT`](../glass/regions.d.ts) |  |  |  |
| [`GLASS_REGULAR_BRIGHTNESS`](../glass/tokens.d.ts) |  |  |  |
| [`GLASS_REGULAR_SATURATION`](../glass/tokens.d.ts) |  |  |  |
| [`GLASS_REGULAR_TINT_ALPHA`](../glass/tokens.d.ts) |  |  |  |
| [`GLASS_SELECTION_DURATION_MS`](../glass/tokens.d.ts) |  |  |  |
| [`GLASS_SELECTION_EASING`](../glass/tokens.d.ts) |  |  |  |
| [`GLASS_TAB_BAR_BOTTOM_GAP_PX`](../glass/tokens.d.ts) |  |  |  |
| [`GLASS_TAB_BAR_HEIGHT_PX`](../glass/tokens.d.ts) |  |  |  |
| [`GLASS_TAB_BAR_INLINE_INSET_PX`](../glass/tokens.d.ts) |  |  |  |
| [`GLASS_TINT_RGB`](../glass/tokens.d.ts) |  |  |  |
| [`GlassAccessibilityPreferences`](../glass/capability.d.ts) |  |  |  |
| [`GlassBackground`](../glass/GlassEffect.d.ts) | Framework chrome can keep its existing DOM geometry and transition refs. An `interactive` chrome button's glass (back, close, sidebar) takes the finger through the same contact path as every interactive glass, as a bar button: the touch anywhere on its button presses it. |  |  |
| [`GlassBar`](../glass/GlassBar.d.ts) |  |  |  |
| [`GlassBarProps`](../glass/GlassBar.d.ts) | Props for `GlassBar`. |  |  |
| [`glassBlendRadius`](../glass/fieldGeometry.d.ts) | Sequential native frames bracket contact at 4.50–5.04, 9.23–10.57, 18.53–20.94, 36.56–41.92 pt. See phase-morph-engine-notes.md. Polynomial smooth-min joins equal members at gap = k/2. |  |  |
| [`GlassButton`](../glass/GlassEffect.d.ts) |  |  |  |
| [`GlassCapabilityDecision`](../glass/capability.d.ts) |  |  |  |
| [`GlassCapabilityState`](../glass/capability.d.ts) |  |  |  |
| [`GlassConfusionReview`](../glass/GlassConfusionReview.d.ts) |  |  |  |
| [`GlassContainer`](../glass/GlassEffect.d.ts) |  |  |  |
| [`GlassDisplacementPolicy`](../glass/GlassMaterialRoot.d.ts) |  |  |  |
| [`glassDockHeight`](../glass/lens/Scene.d.ts) |  |  |  |
| [`glassDockWidth`](../glass/lens/Scene.d.ts) | The tab platter's width: the one rule for the glass renderer and the tab slot it reads. |  |  |
| [`GlassEffect`](../glass/GlassEffect.d.ts) | Local content remains DOM-owned; only the material canvas is painted by reference. |  | glass; refraction |
| [`GlassEffectContainer`](../glass/GlassEffect.d.ts) | Groups nearby glass effects so they render together and blend or morph into one another. `spacing`, 20 pt by default, sets how close effects must be to merge. |  | glass morph; glass group |
| [`GlassEffectProps`](../glass/GlassEffect.d.ts) | Props for `GlassEffect`. |  |  |
| [`GlassError`](../glass/errors.d.ts) | One glass renderer failure: its code, message, the stage it happened in and when. |  |  |
| [`GlassErrorCode`](../glass/errors.d.ts) | Why the glass renderer failed, such as `gpu-unavailable` or `device-lost`. Releases can recover with fallback; development only tolerates missing startup capability. |  |  |
| [`glassFieldDistance`](../glass/fieldGeometry.d.ts) | Returns the signed distance to the diagnostic glass union in points. |  |  |
| [`GlassFieldMember`](../glass/fieldGeometry.d.ts) | Geometry in frame-local CSS pixels; independent of any renderer. |  |  |
| [`GlassFrameTrace`](../glass/renderSpecs.d.ts) |  |  |  |
| [`GlassInteraction`](../glass/rendererContract.d.ts) |  |  |  |
| [`GlassLayer`](../glass/GlassEffect.d.ts) | Place this inside the matching ScrollSurface for scroll attachment. |  |  |
| [`GlassLayerDescriptor`](../glass/regions.d.ts) | Serializable renderer contract. No DOM, Pixi, or GPU handles cross this boundary. |  |  |
| [`GlassMaterial`](../glass/regions.d.ts) |  |  |  |
| [`GlassMaterialDiagnostics`](../glass/context.d.ts) |  |  |  |
| [`GlassMaterialResponse`](../glass/rendererContract.d.ts) |  |  |  |
| [`GlassOutlinePoint`](../glass/unionOutline.d.ts) | One point in a diagnostic glass outline, in field coordinates. |  |  |
| [`GlassPresenter`](../glass/rendererContract.d.ts) |  |  |  |
| [`GlassRegion`](../glass/regions.d.ts) |  |  |  |
| [`GlassRendererDiagnostics`](../glass/rendererContract.d.ts) |  |  |  |
| [`GlassRendererReply`](../glass/rendererContract.d.ts) | Worker failures must retain raw messages and device-loss reasons. |  |  |
| [`GlassRendererRequest`](../glass/rendererContract.d.ts) |  |  |  |
| [`GlassRenderTestState`](../glass/capability.d.ts) |  |  |  |
| [`GlassSceneSnapshot`](../glass/regions.d.ts) | Each layer can own multiple presenters. WebGPU shares one device across canvases. |  |  |
| [`GlassScrollSnapshot`](../glass/regions.d.ts) |  |  |  |
| [`GlassSearchField`](../glass/GlassTextField.d.ts) |  |  |  |
| [`GlassShape`](../glass/regions.d.ts) |  |  |  |
| [`GlassSource`](../glass/rendererContract.d.ts) |  |  |  |
| [`GlassSpecimen`](../glass/GlassPresentation.d.ts) | Shared semantic DOM and runtime ownership. Probe controls are testing-only. |  |  |
| [`GlassTextField`](../glass/GlassTextField.d.ts) | Shares the 12b editing/IME/keyboard-intent contract. Glass never captures field touches. |  |  |
| [`GlassTextFieldProps`](../glass/GlassTextField.d.ts) | Props for `GlassTextField`. |  |  |
| [`GlassTint`](../glass/regions.d.ts) | A glass tint as red, green, blue and alpha channels from 0 to 1. `Glass.tintRGBA` rejects values outside that range. |  |  |
| [`glassTokens`](../glass/tokens.d.ts) |  |  |  |
| [`GlassTouchLight`](../glass/renderSpecs.d.ts) | A sampled light field, independent of the renderer and of row selection. Coordinates and radius are CSS pixels relative to the surface frame. |  |  |
| [`GlassUnionFrame`](../glass/fieldGeometry.d.ts) | A diagnostic glass union outline and its bounds in field coordinates. |  |  |
| [`glassUnionOutline`](../glass/unionOutline.d.ts) | Closed contours, including disconnected members. Coordinates use the frame's local CSS pixels. Diagnostic/export operation: never run it in the render loop. Marching triangles avoid ambiguous saddle cells; roots use the shader's field. |  |  |
| [`GlassVariant`](../glass/tokens.d.ts) |  |  |  |
| [`ICON_GRADIENTS`](../glass/lens/theme.d.ts) |  |  |  |
| [`ICON_SVG`](../glass/lens/icons.d.ts) |  |  |  |
| [`InstallationDiagnostics`](../app/InstallationDiagnostics.d.ts) | Shows the app's installation receipts, for an optional diagnostics screen in Settings. Pass the app's scope. |  |  |
| [`InstallationFailure`](../app/installationFailure.d.ts) | An installation failure recorded before the app launched: the build, the URL, the reason and whether the network failed. |  |  |
| [`installMotionProbe`](../motionProbe.d.ts) | Install once before app mount; dispose restores the original rAF function. |  |  |
| [`InteractivePopDiagnostic`](../navigation/interactivePopTypes.d.ts) |  |  |  |
| [`isBitmapBackdrop`](../glass/lens/bitmapBackdrop.d.ts) |  |  |  |
| [`isCalibratedMaxLayout`](../glass/lens/Scene.d.ts) |  |  |  |
| [`isTintBackgroundMode`](../glass/lens/referenceBackground.d.ts) |  |  |  |
| [`KeyboardGeometry`](../keyboard/geometry.d.ts) | How much the keyboard covers, whether it shows, and the viewport size, in points. |  |  |
| [`lastUnstableMeasurement`](../glass/lens/Scene.d.ts) |  |  |  |
| [`LayoutClass`](../layout/layoutClass.d.ts) |  |  |  |
| [`LensMode`](../glass/renderSpecs.d.ts) |  |  |  |
| [`LIQUID_ENVELOPES`](../glass/lens/liquidMotion.d.ts) |  |  |  |
| [`LIQUID_PILL_BAR`](../glass/lens/liquidMotion.d.ts) |  |  |  |
| [`LIQUID_SCRIPT`](../glass/lens/liquidMotion.d.ts) |  |  |  |
| [`liquidAnimationActive`](../glass/lens/liquidMotion.d.ts) |  |  |  |
| [`LiquidMotionMode`](../glass/lens/liquidMotion.d.ts) |  |  |  |
| [`liquidScriptDuration`](../glass/lens/liquidMotion.d.ts) |  |  |  |
| [`List`](../list-form/ListForm.d.ts) |  |  | list; rows; pull to refresh; swipe actions |
| [`ListEngineProps`](../list-form/ListForm.d.ts) | Props for `ListEngine`. |  |  |
| [`makeReferenceBackgroundCanvas`](../glass/lens/referenceBackground.d.ts) |  |  |  |
| [`MARKER_INTERVAL_PX`](../glass/lens/mirrorConstants.d.ts) |  |  |  |
| [`measureMirrorLayout`](../glass/lens/Scene.d.ts) |  |  |  |
| [`measureMirrorLayoutRelative`](../glass/lens/Scene.d.ts) | A host whose origin moves on every read (a route inside a running navigation transform) never passes the absolute-origin check. Its own layout is still stable: two consecutive snapshots with identical host-relative geometry are a consistent reading, whatever the origin did. Additive; measureMirrorLayout is unchanged. |  |  |
| [`Menu`](../glass/Menu.d.ts) |  |  | dropdown menu; more button |
| [`MENU_BUTTON`](../glass/lens/menuMotion.d.ts) |  |  |  |
| [`MENU_CADENCE`](../glass/lens/menuMotion.d.ts) |  |  |  |
| [`MENU_ENVELOPE`](../glass/lens/menuMotion.d.ts) |  |  |  |
| [`MENU_GESTURE_REST`](../menu/menuGesture.d.ts) |  |  |  |
| [`MENU_ICON_SVG`](../glass/lens/icons.d.ts) |  |  |  |
| [`MENU_MOTION_DURATIONS`](../glass/lens/menuMotion.d.ts) |  |  |  |
| [`MENU_PANEL`](../glass/lens/menuMotion.d.ts) |  |  |  |
| [`MENU_TAP_FEEDBACK_MS`](../menu/menuGesture.d.ts) |  |  |  |
| [`menuCadenceDuration`](../glass/lens/menuMotion.d.ts) |  |  |  |
| [`MenuDirection`](../glass/lens/menuMotion.d.ts) |  |  |  |
| [`MenuGestureDecision`](../menu/menuGesture.d.ts) |  |  |  |
| [`MenuGestureFrame`](../menu/menuGesture.d.ts) |  |  |  |
| [`MenuGestureMotion`](../menu/menuGesture.d.ts) |  |  |  |
| [`menuHighlightAttack`](../menu/menuGesture.d.ts) |  |  |  |
| [`MenuInteraction`](../menu/menuInteraction.d.ts) |  |  |  |
| [`MenuInteractionPhase`](../menu/menuInteraction.d.ts) | Synchronous ownership of a menu transition. React renders its snapshot; event handlers use this model so two events in one task cannot both submit. Completion tokens prevent an interrupted window's timer settling its successor. |  |  |
| [`menuMaterialProgress`](../glass/lens/menuMotion.d.ts) |  |  |  |
| [`MenuMotionFrame`](../glass/lens/menuMotion.d.ts) |  |  |  |
| [`MenuPanelBounds`](../menu/menuGesture.d.ts) |  |  |  |
| [`menuPanelPull`](../menu/menuGesture.d.ts) | Fit to axis controls plus the held diagonal, with its origin in the panel's resting coordinate space. Over-pull begins outside the panel; the anchored right edge couples vertical stretch to horizontal displacement. |  |  |
| [`MenuProps`](../glass/menuPresenter.d.ts) | Props for `Menu`. |  |  |
| [`menuPull`](../glass/contactPhysics.d.ts) |  |  |  |
| [`menuRetargetTime`](../glass/lens/menuMotion.d.ts) | Restart an interrupted transition near the current geometry, not at its opposite endpoint. This is an interruption policy, not a native timing fit. |  |  |
| [`menuReturn`](../glass/contactPhysics.d.ts) |  |  |  |
| [`MenuTriggerProps`](../glass/menuPresenter.d.ts) | The props a custom `Menu` trigger receives. Forward all of them to the element that opens the menu. |  |  |
| [`MirrorCaptureRange`](../glass/lens/Scene.d.ts) | DOM geometry is authoritative. This function is only called after layout changes. |  |  |
| [`MirrorLayout`](../glass/lens/Scene.d.ts) |  |  |  |
| [`MirrorNode`](../glass/lens/Scene.d.ts) |  |  |  |
| [`MorphEllipsisArtwork`](../glass/MorphEllipsisArtwork.d.ts) | The enclosing control owns the accessible label. |  |  |
| [`MOTION_SPEC`](../glass/lens/motion.d.ts) |  |  |  |
| [`MotionRun`](../glass/lens/motion.d.ts) |  |  |  |
| [`MotionSample`](../glass/lens/motion.d.ts) |  |  |  |
| [`mountGlassWorkerExperiment`](../glass/worker/experiment.d.ts) |  |  |  |
| [`mountSatin`](../root/mountSatin.d.ts) | Mount once from the app entry point, after resolving its initial screen. The first commit runs synchronously so WebKit cannot defer it behind its launch presentation. Later updates retain React's normal scheduling. Do not call from a component or an effect, or suspend the initial screen. |  |  |
| [`NATIVE_WIDGET_Y_REGISTRATION_PX`](../glass/lens/motion.d.ts) |  |  |  |
| [`NAVIGATION_CURRENT_SEGMENT_WEIGHT`](../navigation/releaseVelocity.d.ts) |  |  |  |
| [`NAVIGATION_DIM_OPACITY`](../navigation/motionTokens.d.ts) |  |  |  |
| [`NAVIGATION_DIRECTION_LOCK_PX`](../navigation/motionTokens.d.ts) | Chosen inside UIKit's observed 10-12 point direction-lock window. |  |  |
| [`NAVIGATION_DURATION_MS`](../navigation/motionTokens.d.ts) | Measured from the iOS 26.5 Settings app on iPhone 17 Pro. |  |  |
| [`NAVIGATION_EASING`](../navigation/motionTokens.d.ts) |  |  |  |
| [`NAVIGATION_EDGE_SHADOW_OPACITY`](../navigation/motionTokens.d.ts) |  |  |  |
| [`NAVIGATION_EDGE_SHADOW_WIDTH_PX`](../navigation/motionTokens.d.ts) |  |  |  |
| [`NAVIGATION_HORIZONTAL_INTENT_PX`](../navigation/motionTokens.d.ts) |  |  |  |
| [`NAVIGATION_PARALLAX_FRACTION`](../navigation/motionTokens.d.ts) |  |  |  |
| [`NAVIGATION_POSITION_THRESHOLD`](../navigation/motionTokens.d.ts) | Legacy non-touch fallback. Installed touch uses releaseDecision statistics. |  |  |
| [`NAVIGATION_PREVIOUS_SEGMENT_WEIGHT`](../navigation/releaseVelocity.d.ts) |  |  |  |
| [`NAVIGATION_RELEASE_SAMPLE_RATE_HZ`](../navigation/releaseTrajectory.d.ts) |  |  |  |
| [`NAVIGATION_RELEASE_SPRING_DAMPING`](../navigation/releaseTrajectory.d.ts) |  |  |  |
| [`NAVIGATION_RELEASE_SPRING_MASS`](../navigation/releaseTrajectory.d.ts) |  |  |  |
| [`NAVIGATION_RELEASE_SPRING_STIFFNESS`](../navigation/releaseTrajectory.d.ts) | iOS 27 fluid parallax settings; recorded and independently fitted in 11d. |  |  |
| [`NAVIGATION_VELOCITY_THRESHOLD_PX_PER_SECOND`](../navigation/motionTokens.d.ts) |  |  |  |
| [`NavigationBackButtonBehavior`](../navigation/types.d.ts) | Whether a pushed screen shows its back button. `automatic` shows it; `hidden` removes it. |  |  |
| [`NavigationBarDefinition`](../navigation/types.d.ts) |  |  |  |
| [`navigationMotionTokens`](../navigation/motionTokens.d.ts) |  |  |  |
| [`NavigationReleaseSample`](../navigation/releaseTrajectory.d.ts) |  |  |  |
| [`NavigationReleaseTrajectory`](../navigation/releaseTrajectory.d.ts) |  |  |  |
| [`NavigationRow`](../list-form/ListForm.d.ts) |  |  |  |
| [`NavigatorActions`](../navigation/store.d.ts) |  |  |  |
| [`NavigatorHost`](../navigation/NavigatorHost.d.ts) |  |  |  |
| [`NavigatorHostProps`](../navigation/NavigatorHost.d.ts) | Props for `NavigatorHost`. |  |  |
| [`NavigatorState`](../navigation/types.d.ts) |  |  |  |
| [`NavigatorStore`](../navigation/store.d.ts) |  |  |  |
| [`newId`](../data/database.d.ts) | A new unique record id that sorts by creation time. |  |  |
| [`normalizeNavigationReleaseVelocity`](../navigation/releaseTrajectory.d.ts) | UIKit's convention: axis velocity divided by signed distance to target. |  |  |
| [`OfflinePresentation`](../reachability/react.d.ts) |  |  |  |
| [`OfflinePresentationProps`](../reachability/react.d.ts) | What the offline view shows: why the server is unavailable, how it is presented, and the recheck and back actions. |  |  |
| [`PALETTES`](../glass/lens/theme.d.ts) |  |  |  |
| [`PickerOptions`](../list-form/ListForm.d.ts) |  |  |  |
| [`PickerRow`](../list-form/ListForm.d.ts) |  |  |  |
| [`PickerRowProps`](../list-form/ListForm.d.ts) | Props for `PickerRow`. |  |  |
| [`popStack`](../navigation/stack.d.ts) |  |  |  |
| [`popToRootStack`](../navigation/stack.d.ts) |  |  |  |
| [`prepareGlassBitmapBackdrop`](../glass/lens/bitmapBackdrop.d.ts) |  |  |  |
| [`prepareSceneRoutes`](../restoration/routes.d.ts) | Call before mount. Explicit launch intent wins over the checkpoint. |  |  |
| [`PresentationDetent`](../presentation/model.d.ts) | A height a sheet can rest at: `medium`, `large`, a fixed `height` in points or a `fraction` of the available height. |  |  |
| [`PresentationKind`](../navigation/types.d.ts) |  |  |  |
| [`PresentationProps`](../presentation/Presentation.d.ts) | The presentation binding, accessible title and dismissal callback shared by presentations. |  |  |
| [`Pressable`](../press/Pressable.d.ts) | A plain tap target with no button chrome. It dims while pressed, and a touch that turns into a scroll does not fire `onPress`. Use it for custom tappable content. |  |  |
| [`PRESSABLE_PRESS_IN_DURATION_MS`](../press/tokens.d.ts) | The first changed reference frame was already at the pressed plateau. |  |  |
| [`PRESSABLE_PRESSED_OPACITY`](../press/tokens.d.ts) | Measured from PressableReference on iPhone 17 Pro / iOS 26.5. |  |  |
| [`PRESSABLE_RELEASE_DURATION_MS`](../press/tokens.d.ts) | native reference release returned to rest in 400-418 ms at 60 Hz. |  |  |
| [`PRESSABLE_RELEASE_EASING`](../press/tokens.d.ts) | Closest named curve to the measured decelerating release envelope. |  |  |
| [`PRESSABLE_RETENTION_OFFSET_PX`](../press/tokens.d.ts) | Native plain-Button retention measured 69 points beyond the label bounds. |  |  |
| [`PressableProps`](../press/Pressable.d.ts) | A pressable's `onPress` action, content and press feedback. An `iconOnly` pressable needs an `aria-label`. |  |  |
| [`pressableTokens`](../press/tokens.d.ts) |  |  |  |
| [`PressState`](../press/stateMachine.d.ts) | Whether a press is `idle`, held down (`pressed`) or cancelled (`deactivated`). |  |  |
| [`previousTrace`](../glass/lens/trace.d.ts) |  |  |  |
| [`PushNotifications`](../push/notifications.d.ts) |  |  |  |
| [`PushNotificationsLifecycle`](../push/PushPermissionExplainer.d.ts) | Mount at the app root so renewals reconcile even when Settings is not visible. |  |  |
| [`PushNotificationState`](../push/notifications.d.ts) |  |  |  |
| [`PushPermissionExplainer`](../push/PushPermissionExplainer.d.ts) |  |  |  |
| [`PushRelayTokenField`](../push/PushPermissionExplainer.d.ts) | A runtime user credential, never a build-time VITE secret. Keep its value in memory. |  |  |
| [`PushRoute`](../push/routes.d.ts) | Shared, validated route codec. No navigation or browser history side effects. |  |  |
| [`PushRouteRules`](../push/routes.d.ts) |  |  |  |
| [`PushServerAdapter`](../push/notifications.d.ts) |  |  |  |
| [`pushStack`](../navigation/stack.d.ts) |  |  |  |
| [`PushSubscriptionPayload`](../push/notifications.d.ts) |  |  |  |
| [`Query`](../data/database.d.ts) | An immutable query over a collection: `index`, `keyRange`, `reverse`, `limit` and `filter` each return a new query. `useQuery` hands one to its configure callback. |  |  |
| [`readAppearanceDiagnostics`](../app/appearance.d.ts) | Returns a short log of appearance changes and lifecycle events, for diagnosing appearance after a resume. |  |  |
| [`readDisplayCornerMetrics`](../safe-area/displayCorners.d.ts) | Framework token for the screen containing this app. Display Zoom and unknown models fall back to zero. |  |  |
| [`readInstallationFailure`](../app/installationFailure.d.ts) | Reads the last recorded installation failure for an app scope, or null when there is none. |  |  |
| [`readSafeAreaMetrics`](../safe-area/useSafeAreaMetrics.d.ts) |  |  |  |
| [`readSceneValue`](../restoration/scene.d.ts) |  |  |  |
| [`REFERENCE_CONTENT_HEIGHT_PX`](../glass/lens/referenceBackground.d.ts) |  |  |  |
| [`ReferenceBackgroundMode`](../glass/lens/referenceBackground.d.ts) |  |  |  |
| [`ReferenceBackgroundScene`](../glass/lens/Scene.d.ts) |  |  |  |
| [`registerAppShell`](../sw/registerAppShell.d.ts) |  |  |  |
| [`RegisterAppShellOptions`](../sw/registerAppShell.d.ts) |  |  |  |
| [`registerGlassBitmapBackdrop`](../glass/lens/bitmapBackdrop.d.ts) |  |  |  |
| [`RegistryScreenEntry`](../navigation/store.d.ts) |  |  |  |
| [`REGULAR_TRIGGER_MATERIAL`](../glass/regularTriggerMaterial.d.ts) |  |  |  |
| [`REGULAR_TRIGGER_MATERIAL_GLSL`](../glass/regularTriggerMaterial.d.ts) |  |  |  |
| [`REGULAR_TRIGGER_RIM_CURVES`](../glass/regularTriggerRim.d.ts) |  |  |  |
| [`RegularMaterialContext`](../glass/regularMaterialContext.d.ts) | A retained source-image index. No DOM reads, GPU readbacks or canvas writes occur when an aperture moves. Disc rows are clipped and renormalized against the visible window, not extended by repeating the boundary pixel. |  |  |
| [`regularTriggerRegime`](../glass/regularTriggerMaterial.d.ts) |  |  |  |
| [`regularTriggerRimResponse`](../glass/regularTriggerRim.d.ts) |  |  |  |
| [`releaseWarmedAppImages`](../app/warmImage.d.ts) | Release URLs when the app document closes, or explicitly when its image set changes. |  |  |
| [`replaceStack`](../navigation/stack.d.ts) |  |  |  |
| [`reportGlassError`](../glass/errors.d.ts) |  |  |  |
| [`requestPersistentStorage`](../data/database.d.ts) | Asks WebKit not to evict the app's data under storage pressure; true when granted. |  |  |
| [`resolveDisplayCornerMetrics`](../safe-area/displayCorners.d.ts) | Resolution is not a model identifier. Unknown and asymmetric displays use the scalar fallback. |  |  |
| [`ReturningMenuTrigger`](../glass/renderSpecs.d.ts) |  |  |  |
| [`RouteSchema`](../navigation/routeCodec.d.ts) |  |  |  |
| [`Row`](../list-form/ListForm.d.ts) |  |  |  |
| [`RowActions`](../actions/RowActions.d.ts) | A row's swipe actions and context menu. Inside an editable `List` item, the item owns the row's one gesture host (it adds swipe-to-delete), so the row hands its actions to the item instead of hosting a second recognizer. Swipe actions are unavailable while the list is editing, as in selection; the context menu stays. |  |  |
| [`RowActionsProps`](../actions/types.d.ts) | Row swipe actions and context-menu commands. |  |  |
| [`RowIcon`](../list-form/ListForm.d.ts) | A Settings-style icon: a white symbol on a rounded colour tile, for a row's leading edge. |  | settings icon |
| [`RowIconProps`](../list-form/ListForm.d.ts) | The symbol and its tile colour: a system colour name or any CSS colour. |  |  |
| [`RowProps`](../list-form/ListForm.d.ts) | Props for `Row`. |  |  |
| [`runScriptedDrag`](../glass/lens/motion.d.ts) |  |  |  |
| [`runScriptedScroll`](../glass/lens/motion.d.ts) |  |  |  |
| [`RuntimeElements`](../glass/renderSpecs.d.ts) |  |  |  |
| [`RuntimeGeometry`](../glass/renderSpecs.d.ts) |  |  |  |
| [`RuntimeOptions`](../glass/renderSpecs.d.ts) |  |  |  |
| [`RuntimeSnapshot`](../glass/renderSpecs.d.ts) | Probe telemetry shape. The WebGPU runtime does not emit snapshots; GlassPresentation's probe panel still types against it. Fields typed by removed WebGL classes are `unknown`. |  |  |
| [`SafeAreaMetrics`](../safe-area/useSafeAreaMetrics.d.ts) | The full safe-area and viewport geometry Satin works from, including the diagnostic coordinate spaces installed-app fixtures compare. Apps want only `insets`. |  |  |
| [`SampledMotion`](../menu/sampledMotion.d.ts) | A document-timeline animation, submitted once per input or state transition. Sampling density controls interpolation error, not the display refresh rate. Keep accelerated properties in separate effects from paint-bound properties. |  |  |
| [`sampleLiquidShape`](../glass/lens/liquidMotion.d.ts) |  |  |  |
| [`sampleMenuCadence`](../glass/lens/menuMotion.d.ts) |  |  |  |
| [`sampleMenuMotion`](../glass/lens/menuMotion.d.ts) |  |  |  |
| [`sampleNavigationCurve`](../navigation/motionTokens.d.ts) |  |  |  |
| [`SatinAppShellRegistration`](../sw/registerAppShell.d.ts) |  |  |  |
| [`SatinRoot`](../root/SatinRoot.d.ts) |  |  |  |
| [`SatinRootProps`](../root/SatinRoot.d.ts) | Props for `SatinRoot`. |  |  |
| [`SatinRuntime`](../root/runtimeContext.d.ts) |  |  |  |
| [`Scenario`](../glass/renderSpecs.d.ts) |  |  |  |
| [`ScenarioMetrics`](../glass/renderSpecs.d.ts) |  |  |  |
| [`SCENE_STYLE`](../glass/lens/Scene.d.ts) |  |  |  |
| [`SceneRestoration`](../restoration/scene.d.ts) |  |  |  |
| [`ScreenContainer`](../navigation/ScreenContainer.d.ts) |  |  |  |
| [`ScreenContainerProps`](../navigation/ScreenContainer.d.ts) | Props for `ScreenContainer`. |  |  |
| [`ScreenDefinition`](../navigation/types.d.ts) |  |  |  |
| [`ScreenEntry`](../navigation/types.d.ts) |  |  |  |
| [`ScreenId`](../navigation/store.d.ts) |  |  |  |
| [`ScreenLifecycle`](../navigation/types.d.ts) | Whether a screen is covered by another, and the phase of its current transition. |  |  |
| [`ScreenLifecycleCallbacks`](../navigation/types.d.ts) | The `appear` and `disappear` callbacks for `useScreenLifecycle`. |  |  |
| [`ScreenParams`](../navigation/store.d.ts) |  |  |  |
| [`ScreenRegistry`](../navigation/registry.d.ts) |  |  |  |
| [`scriptedDragFrames`](../glass/lens/motion.d.ts) |  |  |  |
| [`scriptedDragProgress`](../glass/lens/motion.d.ts) |  |  |  |
| [`ScriptedMotionMode`](../glass/lens/motion.d.ts) |  |  |  |
| [`ScriptedScrollMode`](../glass/lens/motion.d.ts) |  |  |  |
| [`scriptedScrollOffset`](../glass/lens/motion.d.ts) |  |  |  |
| [`ScrollAxis`](../scroll/types.d.ts) | The axis along which a scroll surface accepts scrolling. |  |  |
| [`ScrollDismissesKeyboardMode`](../keyboard/adapter.d.ts) | When scrolling dismisses the keyboard: `never`; `immediately`, as soon as a drag on the surface starts; or `interactively`, when a drag reaches the keyboard. WebKit's keyboard cannot follow the finger, so it then slides away on its own curve and the bottom inset follows it. |  |  |
| [`ScrollOffset`](../scroll/types.d.ts) | The scroll position in points along the physical x and y axes. |  |  |
| [`ScrollSnapshot`](../scroll/types.d.ts) |  |  |  |
| [`ScrollSurface`](../scroll/ScrollSurface.d.ts) | A named scroll surface whose position is retained by the framework. |  |  |
| [`ScrollSurfaceHandle`](../scroll/ScrollSurface.d.ts) | Imperative scroll positioning for a named scroll view. |  |  |
| [`ScrollSurfaceProps`](../scroll/ScrollSurface.d.ts) | A scroll view's content, scroll binding and keyboard dismissal policy. |  |  |
| [`ScrollToTopOptions`](../scroll/types.d.ts) | Options for `scrollToTop`: whether to animate. |  |  |
| [`Section`](../list-form/ListForm.d.ts) | A group of rows in a `List` or `Form`, with an optional header and footer. |  |  |
| [`SectionProps`](../list-form/ListForm.d.ts) | A section's rows and its optional header and footer. |  |  |
| [`SecureField`](../text-input/TextField.d.ts) |  |  | password field |
| [`SecureFieldProps`](../text-input/TextField.d.ts) | Props for `SecureField`. |  |  |
| [`SegmentedControl`](../list-form/ListForm.d.ts) |  |  |  |
| [`Selectable`](../root/SatinRoot.d.ts) | Lets the user select and copy the text inside it. App chrome turns text selection off everywhere else, so wrap user-authored content such as notes or messages. |  | text selection; copy text |
| [`SelectableProps`](../root/SatinRoot.d.ts) | The wrapped content and plain div attributes. |  |  |
| [`SerializedRoute`](../navigation/routeCodec.d.ts) |  |  |  |
| [`setAppBadge`](../push/notifications.d.ts) |  |  |  |
| [`SETTINGS_BACK_BUTTON_INLINE_INSET_PX`](../settings/tokens.d.ts) |  |  |  |
| [`SETTINGS_BACK_BUTTON_SIZE_PX`](../settings/tokens.d.ts) |  |  |  |
| [`SETTINGS_DETAIL_CONTENT_TOP_OFFSET_PX`](../settings/tokens.d.ts) |  |  |  |
| [`SETTINGS_DETAIL_INLINE_INSET_PX`](../settings/tokens.d.ts) |  |  |  |
| [`SETTINGS_DETAIL_ROW_HEIGHT_PX`](../settings/tokens.d.ts) |  |  |  |
| [`SETTINGS_DISCLOSURE_DARK_COLOR`](../settings/tokens.d.ts) |  |  |  |
| [`SETTINGS_DISCLOSURE_HEIGHT_PX`](../settings/tokens.d.ts) |  |  |  |
| [`SETTINGS_DISCLOSURE_LIGHT_COLOR`](../settings/tokens.d.ts) |  |  |  |
| [`SETTINGS_DISCLOSURE_OFFSET_X_PX`](../settings/tokens.d.ts) |  |  |  |
| [`SETTINGS_DISCLOSURE_OFFSET_Y_PX`](../settings/tokens.d.ts) |  |  |  |
| [`SETTINGS_DISCLOSURE_WIDTH_PX`](../settings/tokens.d.ts) |  |  |  |
| [`SETTINGS_GROUP_CORNER_RADIUS_PX`](../settings/tokens.d.ts) |  |  |  |
| [`SETTINGS_GROUP_SPACING_PX`](../settings/tokens.d.ts) |  |  |  |
| [`SETTINGS_LARGE_TITLE_FONT_SIZE_PX`](../settings/tokens.d.ts) |  |  |  |
| [`SETTINGS_LARGE_TITLE_LINE_HEIGHT_PX`](../settings/tokens.d.ts) |  |  |  |
| [`SETTINGS_NAVIGATION_BAR_HEIGHT_PX`](../settings/tokens.d.ts) |  |  |  |
| [`SETTINGS_ROOT_INLINE_INSET_PX`](../settings/tokens.d.ts) |  |  |  |
| [`SETTINGS_ROOT_LARGE_TITLE_TOP_OFFSET_PX`](../settings/tokens.d.ts) |  |  |  |
| [`SETTINGS_ROOT_PRO_MAX_INLINE_INSET_PX`](../settings/tokens.d.ts) |  |  |  |
| [`SETTINGS_ROOT_ROW_HEIGHT_PX`](../settings/tokens.d.ts) |  |  |  |
| [`SETTINGS_ROW_ICON_CORNER_RADIUS_PX`](../settings/tokens.d.ts) |  |  |  |
| [`SETTINGS_ROW_ICON_SIZE_PX`](../settings/tokens.d.ts) |  |  |  |
| [`SETTINGS_ROW_TRAILING_INSET_PX`](../settings/tokens.d.ts) |  |  |  |
| [`SETTINGS_SEPARATOR_HAIRLINE_PX`](../settings/tokens.d.ts) |  |  |  |
| [`SETTINGS_SEPARATOR_LEADING_INSET_PX`](../settings/tokens.d.ts) |  |  |  |
| [`SETTINGS_SEPARATOR_OFFSET_Y_PX`](../settings/tokens.d.ts) |  |  |  |
| [`SETTINGS_SEPARATOR_TRAILING_INSET_PX`](../settings/tokens.d.ts) |  |  |  |
| [`settingsChromeTokens`](../settings/tokens.d.ts) |  |  |  |
| [`SettingsDomScene`](../glass/lens/Scene.d.ts) |  |  |  |
| [`SettingsPalette`](../glass/lens/theme.d.ts) |  |  |  |
| [`settingsRootInlineInset`](../settings/tokens.d.ts) |  |  |  |
| [`Sheet`](../presentation/Presentation.d.ts) |  |  | sheet; modal presentation; bottom sheet |
| [`SheetProps`](../presentation/Presentation.d.ts) | Props for `Sheet`. |  |  |
| [`shouldCompleteInteractivePop`](../navigation/motionTokens.d.ts) |  |  |  |
| [`Sidebar`](../navigation/Sidebar.d.ts) | A list of sidebar destinations. Selecting one shows it in the split view's detail column. |  |  |
| [`SidebarEntry`](../navigation/Sidebar.d.ts) | One sidebar destination: its id, label, optional icon and disabled state. |  |  |
| [`SidebarProps`](../navigation/Sidebar.d.ts) | The sidebar's entries, the selection callback and which entry starts selected. |  |  |
| [`SidebarSymbol`](../navigation/SidebarSymbol.d.ts) | Draws the sidebar's `gearshape` or `sidebar.left` icon with `SymbolImage`. The artwork is from Framework7 Icons (MIT). |  |  |
| [`sidebarTokens`](../settings/tokens.d.ts) |  |  |  |
| [`SplitSelection`](../navigation/splitContext.d.ts) |  |  |  |
| [`springStep`](../glass/lens/liquidMotion.d.ts) |  |  |  |
| [`stableTabSelection`](../glass/lens/tabSelectionMaterial.d.ts) |  |  |  |
| [`StateSchema`](../restoration/scene.d.ts) | Small UI checkpoints, read before mount and written in quiet tasks. |  |  |
| [`StepperProps`](../list-form/ListForm.d.ts) | Props for `Stepper`. |  |  |
| [`StepperRow`](../list-form/ListForm.d.ts) |  |  |  |
| [`STRIPE_BACKGROUND_MODES`](../glass/lens/referenceBackground.d.ts) |  |  |  |
| [`SubmitLabel`](../text-input/kinds.d.ts) | The return key's title: `done`, `go`, `next`, `search` or `send`. |  |  |
| [`subscribeGlassErrors`](../glass/errors.d.ts) |  |  |  |
| [`summarize`](../glass/worker/experiment.d.ts) |  |  |  |
| [`SurfaceId`](../glass/renderSpecs.d.ts) |  |  |  |
| [`SurfaceRenderSpec`](../glass/renderSpecs.d.ts) |  |  |  |
| [`SurfaceShape`](../glass/renderSpecs.d.ts) |  |  |  |
| [`SwipeActions`](../actions/types.d.ts) | The `swipeActions` prop of a row: actions for one edge, or a list with one entry per edge. |  | swipe actions; swipe to delete |
| [`SwipeActionsConfiguration`](../actions/types.d.ts) | The swipe actions on one row edge, `trailing` by default. A full swipe runs the first action unless `allowsFullSwipe` is false. |  |  |
| [`Tab`](../tabs/TabView.d.ts) | Declaration consumed by TabView. Each tab owns its content and navigator. |  |  |
| [`TAB_BAR_BLUR_SIGMA`](../glass/lens/tabSelectionMaterial.d.ts) |  |  |  |
| [`TAB_BAR_LOCAL_CENTRES`](../glass/lens/tabSelectionMaterial.d.ts) |  |  |  |
| [`TAB_ICON_SVG`](../glass/lens/icons.d.ts) |  |  |  |
| [`TAB_SELECTION_HEIGHT`](../glass/lens/tabSelectionMaterial.d.ts) |  |  |  |
| [`TAB_SELECTION_WIDTH`](../glass/lens/tabSelectionMaterial.d.ts) |  |  |  |
| [`TabBar`](../glass/TabBar.d.ts) |  |  |  |
| [`TabBarItem`](../glass/TabBar.d.ts) |  |  |  |
| [`TabBarProps`](../glass/TabBar.d.ts) | Props for `TabBar`. |  |  |
| [`tabGlyphStyle`](../glass/lens/tabGlyphColours.d.ts) |  |  |  |
| [`tabPresentation`](../glass/lens/tabPresentation.d.ts) | Backdrops change what is behind the tabs, not whether the tabs exist. Explicit optical probes can still request bare glass. The separate drag and liquid specimens retain their original presentation. |  |  |
| [`tabProbeOverride`](../glass/lens/tabPresentation.d.ts) |  |  |  |
| [`TabProps`](../tabs/TabView.d.ts) | Props for `Tab`. |  |  |
| [`tabSelectionCapsule`](../glass/lens/tabSelectionMaterial.d.ts) |  |  |  |
| [`TabSelectionShape`](../glass/renderSpecs.d.ts) |  |  |  |
| [`TabView`](../tabs/TabView.d.ts) | Lazy, retained tabs. Hidden app effects remain app-owned; Satin work pauses. |  | tab bar; tabs |
| [`TabViewProps`](../tabs/TabView.d.ts) | Props for `TabView`. |  |  |
| [`TextEditor`](../text-input/TextEditor.d.ts) |  |  | multiline text; text area |
| [`TextEditorProps`](../text-input/TextEditor.d.ts) | Props for `TextEditor`. |  |  |
| [`TextField`](../text-input/TextField.d.ts) |  |  | text field; text input |
| [`TextFieldKind`](../text-input/kinds.d.ts) | What a field holds, setting its keyboard, autofill and autocorrection together. |  |  |
| [`TextFieldProps`](../text-input/TextField.d.ts) | Props for `TextField`. |  |  |
| [`TINT_BACKGROUND_MODES`](../glass/lens/referenceBackground.d.ts) |  |  |  |
| [`TintBackgroundMode`](../glass/lens/referenceBackground.d.ts) |  |  |  |
| [`TitleDisplayMode`](../navigation/types.d.ts) | How a screen title is drawn: `inline` in the bar, `large` below it, `inlineLarge` large inside the bar row, or `none`. |  |  |
| [`Toggle`](../list-form/Toggle.d.ts) |  |  | switch; checkbox |
| [`ToggleProps`](../list-form/Toggle.d.ts) | Props for `Toggle`. |  |  |
| [`ToggleRow`](../list-form/Toggle.d.ts) |  |  |  |
| [`ToolbarGroup`](../glass/GlassEffect.d.ts) | A toolbar group is one glass button: pressing any item lifts the whole group (native). |  |  |
| [`ToolbarSpacer`](../glass/GlassEffect.d.ts) |  |  |  |
| [`trace`](../glass/lens/trace.d.ts) |  |  |  |
| [`TransactionCollection`](../data/database.d.ts) | A collection as seen inside `db.transaction`: its writes commit together or not at all. |  |  |
| [`TransitionBinding`](../navigation/types.d.ts) |  |  |  |
| [`TransitionCompletion`](../navigation/types.d.ts) |  |  |  |
| [`TransitionController`](../navigation/types.d.ts) |  |  |  |
| [`TransitionControllerContext`](../navigation/types.d.ts) |  |  |  |
| [`TransitionControllerFactory`](../navigation/types.d.ts) |  |  |  |
| [`TransitionOperation`](../navigation/types.d.ts) |  |  |  |
| [`TransitionPhase`](../navigation/types.d.ts) | Where a screen is in a navigation transition: `entering`, `exiting` or `settled`. |  |  |
| [`TypedRoute`](../navigation/routeCodec.d.ts) |  |  |  |
| [`useExperimentalDrawer`](../drawer/drawerHandle.d.ts) | The nearest experimental drawer, for a toolbar control. |  |  |
| [`useFocusChain`](../text-input/focusChain.d.ts) | Moves focus through a form's fields in `order`. The return key goes to the next field and the last one dismisses the keyboard. Disabled and unmounted fields are skipped. Spread `field(key)` onto each field. |  | next field; return key |
| [`useGlassMaterialDiagnostics`](../glass/context.d.ts) |  |  |  |
| [`useKeyboardMetrics`](../keyboard/adapter.d.ts) | The software keyboard's live geometry. Most apps never need it: Satin keeps focused fields, bottom insets and bars above the keyboard. |  | keyboard height |
| [`useLayoutClass`](../root/runtimeContext.d.ts) | Classes follow the layout viewport; keyboard occlusion and zoom do not select panes. |  |  |
| [`useNavigator`](../navigation/navigationContext.d.ts) |  |  |  |
| [`useNavigatorState`](../navigation/navigationContext.d.ts) |  |  |  |
| [`useParams`](../navigation/navigationContext.d.ts) |  |  |  |
| [`usePushNotifications`](../push/notifications.d.ts) |  |  |  |
| [`useQuery`](../data/database.d.ts) | Reads a collection's records as `{ data, loading, error }` and keeps them live. Local writes show up synchronously, before they persist. |  | live query |
| [`useReachability`](../reachability/react.d.ts) | The app server's status and the offline view currently shown, with `fetch` and `recheck` helpers that feed the status. |  | offline; network status |
| [`useRecord`](../data/database.d.ts) | One record by key, kept live; `data` is undefined while loading and when no record exists. |  |  |
| [`useRestoredState`](../restoration/react.d.ts) | Application/scene values such as the selected tab. Declare schemas outside render. |  |  |
| [`useSafeAreaMetrics`](../safe-area/useSafeAreaMetrics.d.ts) | Full diagnostic geometry, including visual viewport changes. |  |  |
| [`useSatinRuntime`](../root/runtimeContext.d.ts) | Diagnostic readers receive every live coordinate space, independently of root layout. |  |  |
| [`useSceneStorage`](../restoration/react.d.ts) | Entry-scoped state: repeated pushes of the same screen keep independent drafts. |  | restorable screen state; draft |
| [`useScreenLifecycle`](../navigation/navigationContext.d.ts) | Runs `appear` and `disappear` callbacks as the screen is shown and covered or removed, and returns whether it is covered and its transition phase. |  |  |
| [`useSplitSelection`](../navigation/splitContext.d.ts) | Returns the split view's mode and the entry shown in its detail column. It throws outside a split view. |  |  |
| [`useUnsavedChanges`](../root/runtimeContext.d.ts) | Tells Satin the app has unsaved work while `unsaved` is true, so a pending app update waits instead of reloading over it. Edits in text fields are detected without this hook. |  | unsaved changes |
| [`validatePushRoute`](../push/routes.d.ts) |  |  |  |
| [`ValueRow`](../list-form/ListForm.d.ts) |  |  |  |
| [`warmAppImageWhenIdle`](../app/warmImage.d.ts) |  |  |  |
| [`Zoomable`](../zoom/Zoomable.d.ts) | A region the user can pinch to zoom and pan, such as a photo or a map. The + and - keys zoom about the centre and 0 resets. Give it an accessible label. |  | pinch to zoom |
| [`ZoomableProps`](../zoom/Zoomable.d.ts) | The maximum zoom (4 by default) and a scale callback. Satin owns the pointer handlers. |  |  |

## internal vite API

Module: `@satinhq/kit/internal/vite`

Lower-level build tools for Satin tooling and tests. Apps use `satinApp` from `@satinhq/kit/vite`.

| Satin export | Behavior | Limits | Also known as |
| --- | --- | --- | --- |
| [`AppFixture`](../app/head.d.ts) | One app definition in a multi-install lab build, chosen by exact query parameters. |  |  |
| [`defineApp`](../public/definition.d.ts) | Declares app identity, install metadata and capabilities once. Pass the result to `runApp` and to the `@satinhq/kit/vite` plugin. Everything not given is defaulted and the whole definition is validated, so a bad id or icon fails at build time rather than after install. |  | app manifest; app config |
| [`defineAppFixture`](../app/definition.d.ts) | Validates a full app definition and fills in its defaults. `defineApp` uses it; lab fixtures call it directly. |  |  |
| [`satinApp`](../app/vite.d.ts) | Generates the app shell and loads framework CSS once, before app styles. The stylesheet participates in Vite CSS HMR and builds; pre-launch paints independently. |  |  |
| [`satinAppFixtures`](../app/vite.d.ts) | Multi-install lab fixture only. Production apps use satinApp(app). |  |  |
| [`SatinAppOptions`](../app/vite.d.ts) | Build options for `satinApp`: a custom install page, strict glass, the development menu and a media probe. |  |  |
| [`satinAppShell`](../sw/vite.d.ts) | The Vite build plugin that generates the app's service worker and precache list. `satinApp` includes it; use it directly only in Satin tooling. |  |  |
| [`SatinAppShellPluginOptions`](../sw/vite.d.ts) | Options for the service worker build plugin: extra files to precache, public routes, legacy cache names and diagnostic headers. |  |  |

## server API

Module: `@satinhq/kit/server`

Node helpers for serving a built app. Keep them out of the browser bundle.

| Satin export | Behavior | Limits | Also known as |
| --- | --- | --- | --- |
| [`serveStaticFile`](../server.d.ts) | Serves a built app's static files from Node. It streams GET and HEAD requests and supports single byte ranges, with no caching or compression. The `fallback` file answers only missing extensionless routes; other methods are left to the caller. The root and every file, symlink targets included, must resolve inside the same real directory. |  |  |

## testing API

Module: `@satinhq/kit/testing`

Helpers for app tests. They do not prove real touches or notification delivery.

| Satin export | Behavior | Limits | Also known as |
| --- | --- | --- | --- |
| [`assertNavigation`](../testing.d.ts) | Throws unless the visible screen in `container` is the route `screen`. For app tests. |  |  |
| [`sendTestNotification`](../testing.d.ts) | Sends a test notification through a push relay and returns how many devices accepted it. The token is requested when called and never stored. |  |  |

## unstable API

Module: `@satinhq/kit/unstable`

Experimental API. Its contract may change between beta releases.

| Satin export | Behavior | Limits | Also known as |
| --- | --- | --- | --- |
| [`Animation`](../motion/animationValue.d.ts) | An opaque spring timing value for `withAnimation`. Use a named value or `Animation.spring`. |  |  |
| [`concentricRadius`](../safe-area/displayCorners.d.ts) | The corner radius for a shape inset evenly inside a rounded container, so the two corners stay concentric. The result never goes below 0; a negative or non-finite argument throws. |  |  |
| [`DetailList`](../navigation/DetailList.d.ts) | A grouped list of rows for a split view's detail column at regular width. |  |  |
| [`DragGesture`](../gestures/gesture.d.ts) | A drag that starts after the finger moves `minimumDistance` along the accepted axis. |  |  |
| [`DragGestureOptions`](../gestures/gesture.d.ts) | A drag's callbacks and state, the distance it must travel before it starts (10 by default) and the axis it accepts. |  |  |
| [`DragGestureValue`](../gestures/gesture.d.ts) | A drag's current and start locations, its translation and its velocity. |  |  |
| [`Gesture`](../gestures/gesture.d.ts) | A gesture made by `DragGesture`, `LongPressGesture`, `TapGesture` or `MagnifyGesture`, for a `GestureView`. |  |  |
| [`GesturePoint`](../gestures/gesture.d.ts) | A point in CSS pixels. |  |  |
| [`GestureState`](../gestures/gesture.d.ts) | The binding `useGestureState` returns. A gesture updates it while active and resets it when it ends. |  |  |
| [`GestureView`](../gestures/GestureView.d.ts) | A region that recognizes custom gestures on its children. Scrolling and the back swipe still win the touches they own. |  |  |
| [`GestureViewProps`](../gestures/GestureView.d.ts) | The gestures a `GestureView` recognizes: a normal, a simultaneous and a high-priority gesture. |  |  |
| [`LongPressGesture`](../gestures/gesture.d.ts) | A press held for `minimumDurationMs` without moving more than `maximumDistance`. |  |  |
| [`LongPressGestureOptions`](../gestures/gesture.d.ts) | A long press's callbacks and state, how long it must be held (500 ms by default) and how far the finger may move (10 by default). |  |  |
| [`MagnifyGesture`](../gestures/gesture.d.ts) | A two-finger pinch that starts once the scale changes by `minimumScaleDelta`. |  |  |
| [`MagnifyGestureOptions`](../gestures/gesture.d.ts) | A pinch's callbacks and state, and how far the scale must change before it starts (0.01 by default). |  |  |
| [`MagnifyGestureValue`](../gestures/gesture.d.ts) | A pinch's scale relative to its start, and the point it started around. |  |  |
| [`MatchedGeometryEffect`](../motion/matchedGeometry.d.ts) | When a `withAnimation` change removes this view and inserts another with the same id, the new one moves from the old one's frame to its own while the two cross-fade. A view that only moves or resizes animates from where it was. A matched view with no partner fades in or out. Wrap one element that has no transform of its own. Changes made outside `withAnimation` apply at once. |  |  |
| [`MatchedGeometryEffectProps`](../motion/matchedGeometry.d.ts) | The effect's id and namespace, whether it is the source, and the one element it wraps. |  |  |
| [`Sidebar`](../navigation/Sidebar.d.ts) | A list of sidebar destinations. Selecting one shows it in the split view's detail column. |  |  |
| [`SidebarEntry`](../navigation/Sidebar.d.ts) | One sidebar destination: its id, label, optional icon and disabled state. |  |  |
| [`SidebarProps`](../navigation/Sidebar.d.ts) | The sidebar's entries, the selection callback and which entry starts selected. |  |  |
| [`SidebarSymbol`](../navigation/SidebarSymbol.d.ts) | Draws the sidebar's `gearshape` or `sidebar.left` icon with `SymbolImage`. The artwork is from Framework7 Icons (MIT). |  |  |
| [`SpringOptions`](../motion/animationValue.d.ts) | A spring's duration in milliseconds and its bounce, for `Animation.spring`. |  |  |
| [`TapGesture`](../gestures/gesture.d.ts) | A tap, or `count` taps, that ends without moving more than `maximumDistance`. It reports where the finger lifted. |  |  |
| [`TapGestureOptions`](../gestures/gesture.d.ts) | A tap's callbacks and state, the number of taps (1 by default) and how far the finger may move (10 by default). |  |  |
| [`Transition`](../motion/transition.d.ts) | How a view enters and leaves: opacity, scale and move effects. `withAnimation` sets the timing. |  |  |
| [`TransitionEdge`](../motion/transition.d.ts) | The edge a view moves through, resolved against its own layout direction. |  |  |
| [`TransitionView`](../motion/TransitionView.d.ts) | Shows or hides its content with a transition when `visible` changes inside `withAnimation`. Keep the view itself mounted. Hidden content stays mounted and inert until its exit finishes, and the first render does not animate. |  |  |
| [`TransitionViewProps`](../motion/TransitionView.d.ts) | Whether the content is visible, the transition to use and the content. |  |  |
| [`useDisplayCornerRadius`](../safe-area/displayCorners.d.ts) | The corner radius of the device screen in points, or 0 when the model is unknown. It updates after rotation, window moves and pixel-ratio changes that fire a resize. |  |  |
| [`useGestureState`](../gestures/gesture.d.ts) | Returns a value that a gesture drives, and the binding to pass as the gesture's `state`. The value goes back to `initialValue` when the gesture ends or is cancelled. |  |  |
| [`useSplitSelection`](../navigation/splitContext.d.ts) | Returns the split view's mode and the entry shown in its detail column. It throws outside a split view. |  |  |
| [`withAnimation`](../motion/matchedGeometry.d.ts) | Applies the state changes in `update`, then animates the `MatchedGeometryEffect` views they move, insert or remove. Call it from an event handler. Keyed List rows also move to their new positions. Other views take their new layout at once. Returns the callback result and passes errors through. Only synchronous updates take part, and nested calls join the outer one. |  | animated state update |

## vite API

Module: `@satinhq/kit/vite`

The Vite plugin that builds the app, its install page and its service worker.

| Satin export | Behavior | Limits | Also known as |
| --- | --- | --- | --- |
| [`defineApp`](../public/definition.d.ts) | Declares app identity, install metadata and capabilities once. Pass the result to `runApp` and to the `@satinhq/kit/vite` plugin. Everything not given is defaulted and the whole definition is validated, so a bad id or icon fails at build time rather than after install. |  | app manifest; app config |
| [`satinApp`](../app/vite.d.ts) | Generates the app shell and loads framework CSS once, before app styles. The stylesheet participates in Vite CSS HMR and builds; pre-launch paints independently. |  |  |
| [`SatinAppOptions`](../app/vite.d.ts) | Build options for `satinApp`: a custom install page, strict glass, the development menu and a media probe. |  |  |

## Unsupported capabilities

These capabilities have no public export. The listed alternatives describe supported compositions, not additional props or controls.

| Capability | Supported alternative | Limits |
| --- | --- | --- |
| custom hit shapes | Use Pressable, which responds across its rectangle. | Unsupported. Hit areas are rectangles. |
| custom toolbar backgrounds | Navigation bars keep their standard background. | Unsupported. There is no toolbar background or material override. |
| custom container backgrounds | Navigation stacks and sheets keep their standard backgrounds. | Unsupported. Their backgrounds belong to the containers. |
| multiple-date selection | No multiple-date selection control is shipped. | DatePicker selects one date. |
| collapsible disclosure groups | Keep sections visible until the framework expander is implemented. | Unsupported. No disclosure expander is exported. |
| video playback and audio route selection | Use MediaPlayer only for the supported audio queue. | No video, AirPlay route picker, fullscreen or Picture-in-Picture support yet. |
| gauge indicators | Use ProgressView for linear or circular progress. | No gauge styles are shipped. |
| custom title sizing | Use the Screen title and subtitle and the toolbar title placements. | Title sizes are fixed; there is no custom title font. |
| background work and scheduled local notifications | Use an authenticated server scheduler and Web Push for scheduled reminders. | A suspended web app cannot run timers or background work. |
| additional reactive state primitives | Use React state, props and the exported framework providers and hooks. | Arbitrary environment keys are unsupported; use React context. |
| arbitrary transitions and gesture modifiers | Use withAnimation with MatchedGeometryEffect, or the motion already built into navigation, controls and presentations. | No general transition, implicit animation or gesture modifier. Framework springs keep their measured values. |

See [application recipes](app-recipes.md), [local data](data.md), [geometry tokens](tokens.md) and [messaging scroll](messaging-scroll.md) for supported compositions.

## Entry draft and editor visibility

Render this component within a retained navigation screen. The draft checkpoints independently; the editor starts closed after relaunch.

```tsx
import { useState } from 'react'
import { Button, Sheet, TextField, useSceneStorage } from '@satinhq/kit'

export function DraftEditor() {
  const [draft, setDraft] = useSceneStorage('draft', '')
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onPress={() => setOpen(true)}>Edit draft</Button>
      <Sheet title="Draft" isPresented={open} onPresentedChange={setOpen}>
        <TextField label="Draft" value={draft} onChange={setDraft} />
      </Sheet>
    </>
  )
}
```

## Behavior review inventory

The declarations below have no dedicated reviewed behavior metadata. Type-only declarations are compile-time contracts; integration exports should be used with their module documentation. Adding a stable root value requires a reviewed behavior and limitation before generation can pass.

- `@satinhq/kit:ActionItem` (Type)
- `@satinhq/kit:AdaptiveGridItemOptions` (Type)
- `@satinhq/kit:AlertProps` (Type)
- `@satinhq/kit:AlertTextFieldProps` (Type)
- `@satinhq/kit:AppCapability` (Type)
- `@satinhq/kit:AppDefinition` (Type)
- `@satinhq/kit:AppDefinitionInput` (Type)
- `@satinhq/kit:AppIcon` (Type)
- `@satinhq/kit:AppOrientation` (Type)
- `@satinhq/kit:AsyncImagePhase` (Type)
- `@satinhq/kit:AsyncImageProps` (Type)
- `@satinhq/kit:BuiltInButtonStyle` (Type)
- `@satinhq/kit:BuiltInLabelStyle` (Type)
- `@satinhq/kit:BuiltInToggleStyle` (Type)
- `@satinhq/kit:ButtonBorderShape` (Type)
- `@satinhq/kit:ButtonProps` (Type)
- `@satinhq/kit:ButtonRole` (Type)
- `@satinhq/kit:ButtonStyle` (Type)
- `@satinhq/kit:ButtonStyleConfiguration` (Type)
- `@satinhq/kit:Collection` (Type)
- `@satinhq/kit:CollectionDefinition` (Type)
- `@satinhq/kit:CollectionIndexes` (Type)
- `@satinhq/kit:CollectionSchema` (Type)
- `@satinhq/kit:CollectionUpdateMethods` (Type)
- `@satinhq/kit:ColorPickerProps` (Type)
- `@satinhq/kit:ColorScheme` (Type)
- `@satinhq/kit:ConfirmationDialogProps` (Type)
- `@satinhq/kit:ContentAlignment` (Type)
- `@satinhq/kit:ContentFrame` (Type)
- `@satinhq/kit:ContentMarginsProps` (Type)
- `@satinhq/kit:ContentPadding` (Type)
- `@satinhq/kit:ContentProps` (Type)
- `@satinhq/kit:ContentUnavailableViewProps` (Type)
- `@satinhq/kit:ContextMenuConfiguration` (Type)
- `@satinhq/kit:ControlConfiguration` (Type)
- `@satinhq/kit:ControlSize` (Type)
- `@satinhq/kit:ControlStyleValues` (Type)
- `@satinhq/kit:CoreSymbolName` (Type)
- `@satinhq/kit:CornerShape` (Type)
- `@satinhq/kit:DatabaseMigration` (Type)
- `@satinhq/kit:DatabaseRecord` (Type)
- `@satinhq/kit:DatePickerComponent` (Type)
- `@satinhq/kit:DatePickerProps` (Type)
- `@satinhq/kit:DatePickerRange` (Type)
- `@satinhq/kit:DatePickerStyle` (Type)
- `@satinhq/kit:DefaultToolbarItemProps` (Type)
- `@satinhq/kit:Edge` (Type)
- `@satinhq/kit:EdgeInsets` (Type)
- `@satinhq/kit:EdgeLengths` (Type)
- `@satinhq/kit:EdgeSet` (Type)
- `@satinhq/kit:EdgeSetMember` (Type)
- `@satinhq/kit:EditMode` (Type)
- `@satinhq/kit:ExportDocument` (Type)
- `@satinhq/kit:FixedGridItemOptions` (Type)
- `@satinhq/kit:FlexibleGridItemOptions` (Type)
- `@satinhq/kit:FocusChainField` (Type)
- `@satinhq/kit:FontWeight` (Type)
- `@satinhq/kit:ForEachProps` (Type)
- `@satinhq/kit:FormProps` (Type)
- `@satinhq/kit:FullScreenCoverProps` (Type)
- `@satinhq/kit:GeometryFrame` (Type)
- `@satinhq/kit:GeometryProxy` (Type)
- `@satinhq/kit:GeometryReaderProps` (Type)
- `@satinhq/kit:GeometrySize` (Type)
- `@satinhq/kit:GlassEffectProps` (Type)
- `@satinhq/kit:GlassError` (Type)
- `@satinhq/kit:GlassErrorCode` (Type)
- `@satinhq/kit:GlassShape` (Type)
- `@satinhq/kit:GlassTint` (Type)
- `@satinhq/kit:GridItemOptions` (Type)
- `@satinhq/kit:GridItemValue` (Type)
- `@satinhq/kit:HorizontalTextFieldProps` (Type)
- `@satinhq/kit:HStackProps` (Type)
- `@satinhq/kit:IgnoresSafeAreaProps` (Type)
- `@satinhq/kit:ImageAsset` (Type)
- `@satinhq/kit:ImageProps` (Type)
- `@satinhq/kit:IndexesOfCollection` (Type)
- `@satinhq/kit:JustUpdated` (Type)
- `@satinhq/kit:KeyboardGeometry` (Type)
- `@satinhq/kit:KeyboardMetrics` (Type)
- `@satinhq/kit:LabeledContentProps` (Type)
- `@satinhq/kit:LabelProps` (Type)
- `@satinhq/kit:LabelStyle` (Type)
- `@satinhq/kit:LabelStyleConfiguration` (Type)
- `@satinhq/kit:LaunchScreenSlot` (Type)
- `@satinhq/kit:LayoutModifierProps` (Type)
- `@satinhq/kit:LazyHGridProps` (Type)
- `@satinhq/kit:LazyHStackProps` (Type)
- `@satinhq/kit:LazyVGridProps` (Type)
- `@satinhq/kit:LazyVStackProps` (Type)
- `@satinhq/kit:LineLimit` (Type)
- `@satinhq/kit:LinkProps` (Type)
- `@satinhq/kit:ListItemID` (Type)
- `@satinhq/kit:ListRowProps` (Type)
- `@satinhq/kit:ListSelectionProps` (Type)
- `@satinhq/kit:ListStyle` (Type)
- `@satinhq/kit:LocalReachabilityState` (Type)
- `@satinhq/kit:MatchedTransitionSourceProps` (Type)
- `@satinhq/kit:MediaCommandResult` (Type)
- `@satinhq/kit:MediaController` (Type)
- `@satinhq/kit:MediaQueueEntry` (Type)
- `@satinhq/kit:MediaQueueOptions` (Type)
- `@satinhq/kit:MediaRepeat` (Type)
- `@satinhq/kit:MediaSnapshot` (Type)
- `@satinhq/kit:MenuProps` (Type)
- `@satinhq/kit:MenuTriggerProps` (Type)
- `@satinhq/kit:NamespaceID` (Type)
- `@satinhq/kit:Navigation` (Type)
- `@satinhq/kit:NavigationArguments` (Type)
- `@satinhq/kit:NavigationBackButtonBehavior` (Type)
- `@satinhq/kit:NavigationDeclaration` (Type)
- `@satinhq/kit:NavigationLinkProps` (Type)
- `@satinhq/kit:NavigationSplitViewProps` (Type)
- `@satinhq/kit:NavigationStackProps` (Type)
- `@satinhq/kit:NotificationAuthorizationStatus` (Type)
- `@satinhq/kit:NotificationPermissionExplainerProps` (Type)
- `@satinhq/kit:OfflinePresentationProps` (Type)
- `@satinhq/kit:OpenURLAction` (Type)
- `@satinhq/kit:OpenURLOptions` (Type)
- `@satinhq/kit:OpenURLResult` (Type)
- `@satinhq/kit:OrientationFallback` (Type)
- `@satinhq/kit:OverlayProps` (Type)
- `@satinhq/kit:Parameter` (Type)
- `@satinhq/kit:ParameterSchema` (Type)
- `@satinhq/kit:PickerProps` (Type)
- `@satinhq/kit:PresentationDetent` (Type)
- `@satinhq/kit:PresentationProps` (Type)
- `@satinhq/kit:PressableOwnedHandlers` (Type)
- `@satinhq/kit:PressableProps` (Type)
- `@satinhq/kit:PressState` (Type)
- `@satinhq/kit:ProgressViewProps` (Type)
- `@satinhq/kit:ProgressViewStyle` (Type)
- `@satinhq/kit:ReachabilityPresentation` (Type)
- `@satinhq/kit:ReachabilityProbeConfig` (Type)
- `@satinhq/kit:ReachabilityRoutePolicy` (Type)
- `@satinhq/kit:ReachabilityState` (Type)
- `@satinhq/kit:ReachabilityStateStatus` (Type)
- `@satinhq/kit:ReachabilityStatus` (Type)
- `@satinhq/kit:ReachabilitySurface` (Type)
- `@satinhq/kit:RecordOfCollection` (Type)
- `@satinhq/kit:Register` (Type)
- `@satinhq/kit:RegisteredNavigation` (Type)
- `@satinhq/kit:RegisteredRoutes` (Type)
- `@satinhq/kit:Resource` (Type)
- `@satinhq/kit:ResourceOptions` (Type)
- `@satinhq/kit:ResourceResult` (Type)
- `@satinhq/kit:ResourceSnapshot` (Type)
- `@satinhq/kit:RouteDefinition` (Type)
- `@satinhq/kit:RouteOptions` (Type)
- `@satinhq/kit:RouteParameters` (Type)
- `@satinhq/kit:RouteParameterValue` (Type)
- `@satinhq/kit:RouteProps` (Type)
- `@satinhq/kit:Routes` (Type)
- `@satinhq/kit:RowActionsProps` (Type)
- `@satinhq/kit:RowIconProps` (Type)
- `@satinhq/kit:RowInteractionProps` (Type)
- `@satinhq/kit:RowLabelProps` (Type)
- `@satinhq/kit:RunAppConfiguration` (Type)
- `@satinhq/kit:RunAppOptions` (Type)
- `@satinhq/kit:SafeAreaBarProps` (Type)
- `@satinhq/kit:SafeAreaInsetEdge` (Type)
- `@satinhq/kit:SafeAreaInsetProps` (Type)
- `@satinhq/kit:SafeAreaPaddingProps` (Type)
- `@satinhq/kit:ScenePhase` (Type)
- `@satinhq/kit:ScreenLifecycle` (Type)
- `@satinhq/kit:ScreenLifecycleCallbacks` (Type)
- `@satinhq/kit:ScreenProps` (Type)
- `@satinhq/kit:ScrollAnchor` (Type)
- `@satinhq/kit:ScrollAxis` (Type)
- `@satinhq/kit:ScrollDismissesKeyboardMode` (Type)
- `@satinhq/kit:ScrollEdge` (Type)
- `@satinhq/kit:ScrollEdgeEffectStyleSelection` (Type)
- `@satinhq/kit:ScrollOffset` (Type)
- `@satinhq/kit:ScrollPositionBinding` (Type)
- `@satinhq/kit:ScrollPositionOptions` (Type)
- `@satinhq/kit:ScrollToTopOptions` (Type)
- `@satinhq/kit:ScrollViewHandle` (Type)
- `@satinhq/kit:ScrollViewProps` (Type)
- `@satinhq/kit:SectionProps` (Type)
- `@satinhq/kit:SecureFieldProps` (Type)
- `@satinhq/kit:SelectableProps` (Type)
- `@satinhq/kit:SemanticColorName` (Type)
- `@satinhq/kit:SensoryButtonProps` (Type)
- `@satinhq/kit:SensoryFeedback` (Type)
- `@satinhq/kit:ServerReachabilityConfig` (Type)
- `@satinhq/kit:ServerReachabilityState` (Type)
- `@satinhq/kit:SheetProps` (Type)
- `@satinhq/kit:SliderProps` (Type)
- `@satinhq/kit:SpacerProps` (Type)
- `@satinhq/kit:StackDeclaration` (Type)
- `@satinhq/kit:StepperProps` (Type)
- `@satinhq/kit:StringPropertyKey` (Type)
- `@satinhq/kit:SubmitLabel` (Type)
- `@satinhq/kit:SwipeAction` (Type)
- `@satinhq/kit:SwipeActionItem` (Type)
- `@satinhq/kit:SwipeActions` (Type)
- `@satinhq/kit:SwipeActionsConfiguration` (Type)
- `@satinhq/kit:SymbolGlyph` (Type)
- `@satinhq/kit:SymbolImageProps` (Type)
- `@satinhq/kit:SymbolName` (Type)
- `@satinhq/kit:SymbolRenderingMode` (Type)
- `@satinhq/kit:SymbolScale` (Type)
- `@satinhq/kit:SymbolSource` (Type)
- `@satinhq/kit:SymbolWeight` (Type)
- `@satinhq/kit:SystemColorName` (Type)
- `@satinhq/kit:TabDeclaration` (Type)
- `@satinhq/kit:TabId` (Type)
- `@satinhq/kit:TabProps` (Type)
- `@satinhq/kit:TabSectionProps` (Type)
- `@satinhq/kit:TabViewProps` (Type)
- `@satinhq/kit:TaskAction` (Type)
- `@satinhq/kit:TaskCommit` (Type)
- `@satinhq/kit:TaskOptions` (Type)
- `@satinhq/kit:TaskRunner` (Type)
- `@satinhq/kit:TextEditorProps` (Type)
- `@satinhq/kit:TextFieldKind` (Type)
- `@satinhq/kit:TextFieldProps` (Type)
- `@satinhq/kit:TextFieldStyle` (Type)
- `@satinhq/kit:TextProps` (Type)
- `@satinhq/kit:TextStyle` (Type)
- `@satinhq/kit:TitleDisplayMode` (Type)
- `@satinhq/kit:ToggleProps` (Type)
- `@satinhq/kit:ToggleStyle` (Type)
- `@satinhq/kit:ToggleStyleConfiguration` (Type)
- `@satinhq/kit:ToolbarItemProps` (Type)
- `@satinhq/kit:ToolbarSpacerProps` (Type)
- `@satinhq/kit:TransactionCollection` (Type)
- `@satinhq/kit:TransactionCollections` (Type)
- `@satinhq/kit:TransitionPhase` (Type)
- `@satinhq/kit:UpdateActivation` (Type)
- `@satinhq/kit:UserInterfaceSizeClass` (Type)
- `@satinhq/kit:VerticalScrollGeometry` (Type)
- `@satinhq/kit:VerticalTextFieldProps` (Type)
- `@satinhq/kit:ViewportFitPolicy` (Type)
- `@satinhq/kit:ViewThatFitsAxis` (Type)
- `@satinhq/kit:ViewThatFitsProps` (Type)
- `@satinhq/kit:Visibility` (Type)
- `@satinhq/kit:VStackProps` (Type)
- `@satinhq/kit:WebAuthentication` (Type)
- `@satinhq/kit:WebAuthenticationCallbackResult` (Type)
- `@satinhq/kit:WebAuthenticationConfiguration` (Type)
- `@satinhq/kit:WebAuthenticationExchange` (Type)
- `@satinhq/kit:WebAuthenticationRequest` (Type)
- `@satinhq/kit:WebAuthenticationStartResult` (Type)
- `@satinhq/kit:WebAuthenticationState` (Type)
- `@satinhq/kit:WebFrameActionResult` (Type)
- `@satinhq/kit:WebFrameController` (Type)
- `@satinhq/kit:WebFrameState` (Type)
- `@satinhq/kit:WebViewLink` (Type)
- `@satinhq/kit:WebViewProps` (Type)
- `@satinhq/kit:WriteFailure` (Type)
- `@satinhq/kit:ZoomableProps` (Type)
- `@satinhq/kit:ZoomTransitionOptions` (Type)
- `@satinhq/kit:ZStackProps` (Type)
- `@satinhq/kit/diagnostics:AppearanceEvent` (Type)
- `@satinhq/kit/diagnostics:InstallationDiagnostics` (Value)
- `@satinhq/kit/diagnostics:InstallationDiagnosticsProps` (Type)
- `@satinhq/kit/diagnostics:InstallationFailure` (Type)
- `@satinhq/kit/diagnostics:readAppearanceDiagnostics` (Value)
- `@satinhq/kit/diagnostics:readInstallationFailure` (Value)
- `@satinhq/kit/install:copyInstallLink` (Value)
- `@satinhq/kit/install:CopyLinkResult` (Type)
- `@satinhq/kit/install:InstallApp` (Type)
- `@satinhq/kit/install:InstallBrowser` (Type)
- `@satinhq/kit/install:InstallContext` (Type)
- `@satinhq/kit/install:InstallDevice` (Type)
- `@satinhq/kit/install:InstallSteps` (Value)
- `@satinhq/kit/install:InstallTip` (Value)
- `@satinhq/kit/install:readInstallContext` (Value)
- `@satinhq/kit/install:useInstallContext` (Value)
- `@satinhq/kit/internal:Action` (Type)
- `@satinhq/kit/internal:ActionItem` (Type)
- `@satinhq/kit/internal:Alert` (Value)
- `@satinhq/kit/internal:AlertProps` (Type)
- `@satinhq/kit/internal:AnyScreenDefinition` (Type)
- `@satinhq/kit/internal:AppDefinition` (Type)
- `@satinhq/kit/internal:AppDeploymentInput` (Type)
- `@satinhq/kit/internal:Appearance` (Type)
- `@satinhq/kit/internal:AppearanceEvent` (Type)
- `@satinhq/kit/internal:AppShellBuildState` (Type)
- `@satinhq/kit/internal:AxisLayoutClass` (Type)
- `@satinhq/kit/internal:bindMenuGestures` (Value)
- `@satinhq/kit/internal:BitmapBackdropMode` (Type)
- `@satinhq/kit/internal:blendMenuFrames` (Value)
- `@satinhq/kit/internal:BridgeMode` (Type)
- `@satinhq/kit/internal:ButtonRow` (Value)
- `@satinhq/kit/internal:cancelStackTransition` (Value)
- `@satinhq/kit/internal:CapsuleShape` (Type)
- `@satinhq/kit/internal:Choice` (Type)
- `@satinhq/kit/internal:Chrome` (Value)
- `@satinhq/kit/internal:ChromeBandSpec` (Type)
- `@satinhq/kit/internal:clampStepper` (Value)
- `@satinhq/kit/internal:collection` (Value)
- `@satinhq/kit/internal:Collection` (Type)
- `@satinhq/kit/internal:CollectionDefinition` (Type)
- `@satinhq/kit/internal:ConfirmationDialog` (Value)
- `@satinhq/kit/internal:ConfirmationDialogProps` (Type)
- `@satinhq/kit/internal:connectPushRoutes` (Value)
- `@satinhq/kit/internal:ContentPage` (Type)
- `@satinhq/kit/internal:ContextMenu` (Value)
- `@satinhq/kit/internal:ContextMenuConfiguration` (Type)
- `@satinhq/kit/internal:createAnimatedTransitionController` (Value)
- `@satinhq/kit/internal:createInstantTransitionController` (Value)
- `@satinhq/kit/internal:createNavigationReleaseTrajectory` (Value)
- `@satinhq/kit/internal:createNavigator` (Value)
- `@satinhq/kit/internal:CreateNavigatorOptions` (Type)
- `@satinhq/kit/internal:createPushNotifications` (Value)
- `@satinhq/kit/internal:createPushRelayAdapter` (Value)
- `@satinhq/kit/internal:createRenderSpecs` (Value)
- `@satinhq/kit/internal:createRouteCodec` (Value)
- `@satinhq/kit/internal:createSceneRestoration` (Value)
- `@satinhq/kit/internal:createScreenRegistry` (Value)
- `@satinhq/kit/internal:createSurfaceClipPath` (Value)
- `@satinhq/kit/internal:decodePushRoute` (Value)
- `@satinhq/kit/internal:defineApp` (Value)
- `@satinhq/kit/internal:defineDatabase` (Value)
- `@satinhq/kit/internal:defineScreen` (Value)
- `@satinhq/kit/internal:DetailList` (Value)
- `@satinhq/kit/internal:DirectCanvasElements` (Type)
- `@satinhq/kit/internal:DisclosureIndicator` (Value)
- `@satinhq/kit/internal:DisclosureIndicatorProps` (Type)
- `@satinhq/kit/internal:dismissKeyboard` (Value)
- `@satinhq/kit/internal:DisplayCornerMetrics` (Type)
- `@satinhq/kit/internal:DisplayGeometry` (Type)
- `@satinhq/kit/internal:drawGlassBitmapBackdrop` (Value)
- `@satinhq/kit/internal:drawReferenceBackground` (Value)
- `@satinhq/kit/internal:EdgeInsets` (Type)
- `@satinhq/kit/internal:encodePushRoute` (Value)
- `@satinhq/kit/internal:EntryTransition` (Type)
- `@satinhq/kit/internal:estimateStorage` (Value)
- `@satinhq/kit/internal:evaluateTemporalSpline` (Value)
- `@satinhq/kit/internal:ExperimentalDrawer` (Value)
- `@satinhq/kit/internal:ExperimentalDrawerHandle` (Type)
- `@satinhq/kit/internal:ExperimentalDrawerProps` (Type)
- `@satinhq/kit/internal:ExperimentalThreePane` (Value)
- `@satinhq/kit/internal:ExperimentalThreePaneProps` (Type)
- `@satinhq/kit/internal:ExportDocument` (Type)
- `@satinhq/kit/internal:finishStackTransition` (Value)
- `@satinhq/kit/internal:getGlassErrors` (Value)
- `@satinhq/kit/internal:Glass` (Value)
- `@satinhq/kit/internal:GLASS_BAR_EDGE_HIGHLIGHT_ALPHA` (Value)
- `@satinhq/kit/internal:GLASS_BAR_HEIGHT_PX` (Value)
- `@satinhq/kit/internal:GLASS_BAR_SHADOW_ALPHA` (Value)
- `@satinhq/kit/internal:GLASS_CIRCLE_INLINE_INSET_PX` (Value)
- `@satinhq/kit/internal:GLASS_CIRCLE_SIZE_PX` (Value)
- `@satinhq/kit/internal:GLASS_CIRCLE_TOP_PX` (Value)
- `@satinhq/kit/internal:GLASS_CLEAR_BRIGHTNESS` (Value)
- `@satinhq/kit/internal:GLASS_CLEAR_SATURATION` (Value)
- `@satinhq/kit/internal:GLASS_CLEAR_TINT_ALPHA` (Value)
- `@satinhq/kit/internal:GLASS_CONTROL_SIZE_PX` (Value)
- `@satinhq/kit/internal:GLASS_DOCK_BOTTOM_GAP_PX` (Value)
- `@satinhq/kit/internal:GLASS_DOCK_HEIGHT_PX` (Value)
- `@satinhq/kit/internal:GLASS_DOCK_RADIUS_PX` (Value)
- `@satinhq/kit/internal:GLASS_DOCK_SIDE_INSET_PX` (Value)
- `@satinhq/kit/internal:GLASS_DOCK_WIDTH_PX` (Value)
- `@satinhq/kit/internal:GLASS_OVERSCAN_X_PX` (Value)
- `@satinhq/kit/internal:GLASS_OVERSCAN_Y_PX` (Value)
- `@satinhq/kit/internal:GLASS_REGION_LIMIT` (Value)
- `@satinhq/kit/internal:GLASS_REGION_PIXEL_LIMIT` (Value)
- `@satinhq/kit/internal:GLASS_REGULAR_BRIGHTNESS` (Value)
- `@satinhq/kit/internal:GLASS_REGULAR_SATURATION` (Value)
- `@satinhq/kit/internal:GLASS_REGULAR_TINT_ALPHA` (Value)
- `@satinhq/kit/internal:GLASS_SELECTION_DURATION_MS` (Value)
- `@satinhq/kit/internal:GLASS_SELECTION_EASING` (Value)
- `@satinhq/kit/internal:GLASS_TAB_BAR_BOTTOM_GAP_PX` (Value)
- `@satinhq/kit/internal:GLASS_TAB_BAR_HEIGHT_PX` (Value)
- `@satinhq/kit/internal:GLASS_TAB_BAR_INLINE_INSET_PX` (Value)
- `@satinhq/kit/internal:GLASS_TINT_RGB` (Value)
- `@satinhq/kit/internal:GlassAccessibilityPreferences` (Type)
- `@satinhq/kit/internal:GlassBackground` (Value)
- `@satinhq/kit/internal:GlassBar` (Value)
- `@satinhq/kit/internal:GlassBarProps` (Type)
- `@satinhq/kit/internal:glassBlendRadius` (Value)
- `@satinhq/kit/internal:GlassButton` (Value)
- `@satinhq/kit/internal:GlassCapabilityDecision` (Type)
- `@satinhq/kit/internal:GlassCapabilityState` (Type)
- `@satinhq/kit/internal:GlassConfusionReview` (Value)
- `@satinhq/kit/internal:GlassContainer` (Value)
- `@satinhq/kit/internal:GlassDisplacementPolicy` (Type)
- `@satinhq/kit/internal:glassDockHeight` (Value)
- `@satinhq/kit/internal:glassDockWidth` (Value)
- `@satinhq/kit/internal:GlassEffect` (Value)
- `@satinhq/kit/internal:GlassEffectContainer` (Value)
- `@satinhq/kit/internal:GlassEffectProps` (Type)
- `@satinhq/kit/internal:GlassError` (Type)
- `@satinhq/kit/internal:GlassErrorCode` (Type)
- `@satinhq/kit/internal:glassFieldDistance` (Value)
- `@satinhq/kit/internal:GlassFieldMember` (Type)
- `@satinhq/kit/internal:GlassFrameTrace` (Type)
- `@satinhq/kit/internal:GlassInteraction` (Type)
- `@satinhq/kit/internal:GlassLayer` (Value)
- `@satinhq/kit/internal:GlassLayerDescriptor` (Type)
- `@satinhq/kit/internal:GlassMaterial` (Type)
- `@satinhq/kit/internal:GlassMaterialDiagnostics` (Type)
- `@satinhq/kit/internal:GlassMaterialResponse` (Type)
- `@satinhq/kit/internal:GlassOutlinePoint` (Type)
- `@satinhq/kit/internal:GlassPresenter` (Type)
- `@satinhq/kit/internal:GlassRegion` (Type)
- `@satinhq/kit/internal:GlassRendererDiagnostics` (Type)
- `@satinhq/kit/internal:GlassRendererReply` (Type)
- `@satinhq/kit/internal:GlassRendererRequest` (Type)
- `@satinhq/kit/internal:GlassRenderTestState` (Type)
- `@satinhq/kit/internal:GlassSceneSnapshot` (Type)
- `@satinhq/kit/internal:GlassScrollSnapshot` (Type)
- `@satinhq/kit/internal:GlassSearchField` (Value)
- `@satinhq/kit/internal:GlassShape` (Type)
- `@satinhq/kit/internal:GlassSource` (Type)
- `@satinhq/kit/internal:GlassSpecimen` (Value)
- `@satinhq/kit/internal:GlassTextField` (Value)
- `@satinhq/kit/internal:GlassTextFieldProps` (Type)
- `@satinhq/kit/internal:GlassTint` (Type)
- `@satinhq/kit/internal:glassTokens` (Value)
- `@satinhq/kit/internal:GlassTouchLight` (Type)
- `@satinhq/kit/internal:GlassUnionFrame` (Type)
- `@satinhq/kit/internal:glassUnionOutline` (Value)
- `@satinhq/kit/internal:GlassVariant` (Type)
- `@satinhq/kit/internal:ICON_GRADIENTS` (Value)
- `@satinhq/kit/internal:ICON_SVG` (Value)
- `@satinhq/kit/internal:InstallationDiagnostics` (Value)
- `@satinhq/kit/internal:InstallationFailure` (Type)
- `@satinhq/kit/internal:installMotionProbe` (Value)
- `@satinhq/kit/internal:InteractivePopDiagnostic` (Type)
- `@satinhq/kit/internal:isBitmapBackdrop` (Value)
- `@satinhq/kit/internal:isCalibratedMaxLayout` (Value)
- `@satinhq/kit/internal:isTintBackgroundMode` (Value)
- `@satinhq/kit/internal:KeyboardGeometry` (Type)
- `@satinhq/kit/internal:lastUnstableMeasurement` (Value)
- `@satinhq/kit/internal:LayoutClass` (Type)
- `@satinhq/kit/internal:LensMode` (Type)
- `@satinhq/kit/internal:LIQUID_ENVELOPES` (Value)
- `@satinhq/kit/internal:LIQUID_PILL_BAR` (Value)
- `@satinhq/kit/internal:LIQUID_SCRIPT` (Value)
- `@satinhq/kit/internal:liquidAnimationActive` (Value)
- `@satinhq/kit/internal:LiquidMotionMode` (Type)
- `@satinhq/kit/internal:liquidScriptDuration` (Value)
- `@satinhq/kit/internal:List` (Value)
- `@satinhq/kit/internal:ListEngineProps` (Type)
- `@satinhq/kit/internal:makeReferenceBackgroundCanvas` (Value)
- `@satinhq/kit/internal:MARKER_INTERVAL_PX` (Value)
- `@satinhq/kit/internal:measureMirrorLayout` (Value)
- `@satinhq/kit/internal:measureMirrorLayoutRelative` (Value)
- `@satinhq/kit/internal:Menu` (Value)
- `@satinhq/kit/internal:MENU_BUTTON` (Value)
- `@satinhq/kit/internal:MENU_CADENCE` (Value)
- `@satinhq/kit/internal:MENU_ENVELOPE` (Value)
- `@satinhq/kit/internal:MENU_GESTURE_REST` (Value)
- `@satinhq/kit/internal:MENU_ICON_SVG` (Value)
- `@satinhq/kit/internal:MENU_MOTION_DURATIONS` (Value)
- `@satinhq/kit/internal:MENU_PANEL` (Value)
- `@satinhq/kit/internal:MENU_TAP_FEEDBACK_MS` (Value)
- `@satinhq/kit/internal:menuCadenceDuration` (Value)
- `@satinhq/kit/internal:MenuDirection` (Type)
- `@satinhq/kit/internal:MenuGestureDecision` (Type)
- `@satinhq/kit/internal:MenuGestureFrame` (Type)
- `@satinhq/kit/internal:MenuGestureMotion` (Type)
- `@satinhq/kit/internal:menuHighlightAttack` (Value)
- `@satinhq/kit/internal:MenuInteraction` (Value)
- `@satinhq/kit/internal:MenuInteractionPhase` (Type)
- `@satinhq/kit/internal:menuMaterialProgress` (Value)
- `@satinhq/kit/internal:MenuMotionFrame` (Type)
- `@satinhq/kit/internal:MenuPanelBounds` (Type)
- `@satinhq/kit/internal:menuPanelPull` (Value)
- `@satinhq/kit/internal:MenuProps` (Type)
- `@satinhq/kit/internal:menuPull` (Value)
- `@satinhq/kit/internal:menuRetargetTime` (Value)
- `@satinhq/kit/internal:menuReturn` (Value)
- `@satinhq/kit/internal:MenuTriggerProps` (Type)
- `@satinhq/kit/internal:MirrorCaptureRange` (Type)
- `@satinhq/kit/internal:MirrorLayout` (Type)
- `@satinhq/kit/internal:MirrorNode` (Type)
- `@satinhq/kit/internal:MorphEllipsisArtwork` (Value)
- `@satinhq/kit/internal:MOTION_SPEC` (Value)
- `@satinhq/kit/internal:MotionRun` (Type)
- `@satinhq/kit/internal:MotionSample` (Type)
- `@satinhq/kit/internal:mountGlassWorkerExperiment` (Value)
- `@satinhq/kit/internal:mountSatin` (Value)
- `@satinhq/kit/internal:NATIVE_WIDGET_Y_REGISTRATION_PX` (Value)
- `@satinhq/kit/internal:NAVIGATION_CURRENT_SEGMENT_WEIGHT` (Value)
- `@satinhq/kit/internal:NAVIGATION_DIM_OPACITY` (Value)
- `@satinhq/kit/internal:NAVIGATION_DIRECTION_LOCK_PX` (Value)
- `@satinhq/kit/internal:NAVIGATION_DURATION_MS` (Value)
- `@satinhq/kit/internal:NAVIGATION_EASING` (Value)
- `@satinhq/kit/internal:NAVIGATION_EDGE_SHADOW_OPACITY` (Value)
- `@satinhq/kit/internal:NAVIGATION_EDGE_SHADOW_WIDTH_PX` (Value)
- `@satinhq/kit/internal:NAVIGATION_HORIZONTAL_INTENT_PX` (Value)
- `@satinhq/kit/internal:NAVIGATION_PARALLAX_FRACTION` (Value)
- `@satinhq/kit/internal:NAVIGATION_POSITION_THRESHOLD` (Value)
- `@satinhq/kit/internal:NAVIGATION_PREVIOUS_SEGMENT_WEIGHT` (Value)
- `@satinhq/kit/internal:NAVIGATION_RELEASE_SAMPLE_RATE_HZ` (Value)
- `@satinhq/kit/internal:NAVIGATION_RELEASE_SPRING_DAMPING` (Value)
- `@satinhq/kit/internal:NAVIGATION_RELEASE_SPRING_MASS` (Value)
- `@satinhq/kit/internal:NAVIGATION_RELEASE_SPRING_STIFFNESS` (Value)
- `@satinhq/kit/internal:NAVIGATION_VELOCITY_THRESHOLD_PX_PER_SECOND` (Value)
- `@satinhq/kit/internal:NavigationBackButtonBehavior` (Type)
- `@satinhq/kit/internal:NavigationBarDefinition` (Type)
- `@satinhq/kit/internal:navigationMotionTokens` (Value)
- `@satinhq/kit/internal:NavigationReleaseSample` (Type)
- `@satinhq/kit/internal:NavigationReleaseTrajectory` (Type)
- `@satinhq/kit/internal:NavigationRow` (Value)
- `@satinhq/kit/internal:NavigatorActions` (Type)
- `@satinhq/kit/internal:NavigatorHost` (Value)
- `@satinhq/kit/internal:NavigatorHostProps` (Type)
- `@satinhq/kit/internal:NavigatorState` (Type)
- `@satinhq/kit/internal:NavigatorStore` (Type)
- `@satinhq/kit/internal:newId` (Value)
- `@satinhq/kit/internal:normalizeNavigationReleaseVelocity` (Value)
- `@satinhq/kit/internal:OfflinePresentation` (Value)
- `@satinhq/kit/internal:OfflinePresentationProps` (Type)
- `@satinhq/kit/internal:PALETTES` (Value)
- `@satinhq/kit/internal:PickerOptions` (Value)
- `@satinhq/kit/internal:PickerRow` (Value)
- `@satinhq/kit/internal:PickerRowProps` (Type)
- `@satinhq/kit/internal:popStack` (Value)
- `@satinhq/kit/internal:popToRootStack` (Value)
- `@satinhq/kit/internal:prepareGlassBitmapBackdrop` (Value)
- `@satinhq/kit/internal:prepareSceneRoutes` (Value)
- `@satinhq/kit/internal:PresentationDetent` (Type)
- `@satinhq/kit/internal:PresentationKind` (Type)
- `@satinhq/kit/internal:PresentationProps` (Type)
- `@satinhq/kit/internal:Pressable` (Value)
- `@satinhq/kit/internal:PRESSABLE_PRESS_IN_DURATION_MS` (Value)
- `@satinhq/kit/internal:PRESSABLE_PRESSED_OPACITY` (Value)
- `@satinhq/kit/internal:PRESSABLE_RELEASE_DURATION_MS` (Value)
- `@satinhq/kit/internal:PRESSABLE_RELEASE_EASING` (Value)
- `@satinhq/kit/internal:PRESSABLE_RETENTION_OFFSET_PX` (Value)
- `@satinhq/kit/internal:PressableProps` (Type)
- `@satinhq/kit/internal:pressableTokens` (Value)
- `@satinhq/kit/internal:PressState` (Type)
- `@satinhq/kit/internal:previousTrace` (Value)
- `@satinhq/kit/internal:PushNotifications` (Type)
- `@satinhq/kit/internal:PushNotificationsLifecycle` (Value)
- `@satinhq/kit/internal:PushNotificationState` (Type)
- `@satinhq/kit/internal:PushPermissionExplainer` (Value)
- `@satinhq/kit/internal:PushRelayTokenField` (Value)
- `@satinhq/kit/internal:PushRoute` (Type)
- `@satinhq/kit/internal:PushRouteRules` (Type)
- `@satinhq/kit/internal:PushServerAdapter` (Type)
- `@satinhq/kit/internal:pushStack` (Value)
- `@satinhq/kit/internal:PushSubscriptionPayload` (Type)
- `@satinhq/kit/internal:Query` (Value)
- `@satinhq/kit/internal:readAppearanceDiagnostics` (Value)
- `@satinhq/kit/internal:readDisplayCornerMetrics` (Value)
- `@satinhq/kit/internal:readInstallationFailure` (Value)
- `@satinhq/kit/internal:readSafeAreaMetrics` (Value)
- `@satinhq/kit/internal:readSceneValue` (Value)
- `@satinhq/kit/internal:REFERENCE_CONTENT_HEIGHT_PX` (Value)
- `@satinhq/kit/internal:ReferenceBackgroundMode` (Type)
- `@satinhq/kit/internal:ReferenceBackgroundScene` (Value)
- `@satinhq/kit/internal:registerAppShell` (Value)
- `@satinhq/kit/internal:RegisterAppShellOptions` (Type)
- `@satinhq/kit/internal:registerGlassBitmapBackdrop` (Value)
- `@satinhq/kit/internal:RegistryScreenEntry` (Type)
- `@satinhq/kit/internal:REGULAR_TRIGGER_MATERIAL` (Value)
- `@satinhq/kit/internal:REGULAR_TRIGGER_MATERIAL_GLSL` (Value)
- `@satinhq/kit/internal:REGULAR_TRIGGER_RIM_CURVES` (Value)
- `@satinhq/kit/internal:RegularMaterialContext` (Value)
- `@satinhq/kit/internal:regularTriggerRegime` (Value)
- `@satinhq/kit/internal:regularTriggerRimResponse` (Value)
- `@satinhq/kit/internal:releaseWarmedAppImages` (Value)
- `@satinhq/kit/internal:replaceStack` (Value)
- `@satinhq/kit/internal:reportGlassError` (Value)
- `@satinhq/kit/internal:requestPersistentStorage` (Value)
- `@satinhq/kit/internal:resolveDisplayCornerMetrics` (Value)
- `@satinhq/kit/internal:ReturningMenuTrigger` (Type)
- `@satinhq/kit/internal:RouteSchema` (Type)
- `@satinhq/kit/internal:Row` (Value)
- `@satinhq/kit/internal:RowActions` (Value)
- `@satinhq/kit/internal:RowActionsProps` (Type)
- `@satinhq/kit/internal:RowIcon` (Value)
- `@satinhq/kit/internal:RowIconProps` (Type)
- `@satinhq/kit/internal:RowProps` (Type)
- `@satinhq/kit/internal:runScriptedDrag` (Value)
- `@satinhq/kit/internal:runScriptedScroll` (Value)
- `@satinhq/kit/internal:RuntimeElements` (Type)
- `@satinhq/kit/internal:RuntimeGeometry` (Type)
- `@satinhq/kit/internal:RuntimeOptions` (Type)
- `@satinhq/kit/internal:RuntimeSnapshot` (Type)
- `@satinhq/kit/internal:SafeAreaMetrics` (Type)
- `@satinhq/kit/internal:SampledMotion` (Value)
- `@satinhq/kit/internal:sampleLiquidShape` (Value)
- `@satinhq/kit/internal:sampleMenuCadence` (Value)
- `@satinhq/kit/internal:sampleMenuMotion` (Value)
- `@satinhq/kit/internal:sampleNavigationCurve` (Value)
- `@satinhq/kit/internal:SatinAppShellRegistration` (Type)
- `@satinhq/kit/internal:SatinRoot` (Value)
- `@satinhq/kit/internal:SatinRootProps` (Type)
- `@satinhq/kit/internal:SatinRuntime` (Type)
- `@satinhq/kit/internal:Scenario` (Type)
- `@satinhq/kit/internal:ScenarioMetrics` (Type)
- `@satinhq/kit/internal:SCENE_STYLE` (Value)
- `@satinhq/kit/internal:SceneRestoration` (Type)
- `@satinhq/kit/internal:ScreenContainer` (Value)
- `@satinhq/kit/internal:ScreenContainerProps` (Type)
- `@satinhq/kit/internal:ScreenDefinition` (Type)
- `@satinhq/kit/internal:ScreenEntry` (Type)
- `@satinhq/kit/internal:ScreenId` (Type)
- `@satinhq/kit/internal:ScreenLifecycle` (Type)
- `@satinhq/kit/internal:ScreenLifecycleCallbacks` (Type)
- `@satinhq/kit/internal:ScreenParams` (Type)
- `@satinhq/kit/internal:ScreenRegistry` (Type)
- `@satinhq/kit/internal:scriptedDragFrames` (Value)
- `@satinhq/kit/internal:scriptedDragProgress` (Value)
- `@satinhq/kit/internal:ScriptedMotionMode` (Type)
- `@satinhq/kit/internal:ScriptedScrollMode` (Type)
- `@satinhq/kit/internal:scriptedScrollOffset` (Value)
- `@satinhq/kit/internal:ScrollAxis` (Type)
- `@satinhq/kit/internal:ScrollDismissesKeyboardMode` (Type)
- `@satinhq/kit/internal:ScrollOffset` (Type)
- `@satinhq/kit/internal:ScrollSnapshot` (Type)
- `@satinhq/kit/internal:ScrollSurface` (Value)
- `@satinhq/kit/internal:ScrollSurfaceHandle` (Type)
- `@satinhq/kit/internal:ScrollSurfaceProps` (Type)
- `@satinhq/kit/internal:ScrollToTopOptions` (Type)
- `@satinhq/kit/internal:Section` (Value)
- `@satinhq/kit/internal:SectionProps` (Type)
- `@satinhq/kit/internal:SecureField` (Value)
- `@satinhq/kit/internal:SecureFieldProps` (Type)
- `@satinhq/kit/internal:SegmentedControl` (Value)
- `@satinhq/kit/internal:Selectable` (Value)
- `@satinhq/kit/internal:SelectableProps` (Type)
- `@satinhq/kit/internal:SerializedRoute` (Type)
- `@satinhq/kit/internal:setAppBadge` (Value)
- `@satinhq/kit/internal:SETTINGS_BACK_BUTTON_INLINE_INSET_PX` (Value)
- `@satinhq/kit/internal:SETTINGS_BACK_BUTTON_SIZE_PX` (Value)
- `@satinhq/kit/internal:SETTINGS_DETAIL_CONTENT_TOP_OFFSET_PX` (Value)
- `@satinhq/kit/internal:SETTINGS_DETAIL_INLINE_INSET_PX` (Value)
- `@satinhq/kit/internal:SETTINGS_DETAIL_ROW_HEIGHT_PX` (Value)
- `@satinhq/kit/internal:SETTINGS_DISCLOSURE_DARK_COLOR` (Value)
- `@satinhq/kit/internal:SETTINGS_DISCLOSURE_HEIGHT_PX` (Value)
- `@satinhq/kit/internal:SETTINGS_DISCLOSURE_LIGHT_COLOR` (Value)
- `@satinhq/kit/internal:SETTINGS_DISCLOSURE_OFFSET_X_PX` (Value)
- `@satinhq/kit/internal:SETTINGS_DISCLOSURE_OFFSET_Y_PX` (Value)
- `@satinhq/kit/internal:SETTINGS_DISCLOSURE_WIDTH_PX` (Value)
- `@satinhq/kit/internal:SETTINGS_GROUP_CORNER_RADIUS_PX` (Value)
- `@satinhq/kit/internal:SETTINGS_GROUP_SPACING_PX` (Value)
- `@satinhq/kit/internal:SETTINGS_LARGE_TITLE_FONT_SIZE_PX` (Value)
- `@satinhq/kit/internal:SETTINGS_LARGE_TITLE_LINE_HEIGHT_PX` (Value)
- `@satinhq/kit/internal:SETTINGS_NAVIGATION_BAR_HEIGHT_PX` (Value)
- `@satinhq/kit/internal:SETTINGS_ROOT_INLINE_INSET_PX` (Value)
- `@satinhq/kit/internal:SETTINGS_ROOT_LARGE_TITLE_TOP_OFFSET_PX` (Value)
- `@satinhq/kit/internal:SETTINGS_ROOT_PRO_MAX_INLINE_INSET_PX` (Value)
- `@satinhq/kit/internal:SETTINGS_ROOT_ROW_HEIGHT_PX` (Value)
- `@satinhq/kit/internal:SETTINGS_ROW_ICON_CORNER_RADIUS_PX` (Value)
- `@satinhq/kit/internal:SETTINGS_ROW_ICON_SIZE_PX` (Value)
- `@satinhq/kit/internal:SETTINGS_ROW_TRAILING_INSET_PX` (Value)
- `@satinhq/kit/internal:SETTINGS_SEPARATOR_HAIRLINE_PX` (Value)
- `@satinhq/kit/internal:SETTINGS_SEPARATOR_LEADING_INSET_PX` (Value)
- `@satinhq/kit/internal:SETTINGS_SEPARATOR_OFFSET_Y_PX` (Value)
- `@satinhq/kit/internal:SETTINGS_SEPARATOR_TRAILING_INSET_PX` (Value)
- `@satinhq/kit/internal:settingsChromeTokens` (Value)
- `@satinhq/kit/internal:SettingsDomScene` (Value)
- `@satinhq/kit/internal:SettingsPalette` (Type)
- `@satinhq/kit/internal:settingsRootInlineInset` (Value)
- `@satinhq/kit/internal:Sheet` (Value)
- `@satinhq/kit/internal:SheetProps` (Type)
- `@satinhq/kit/internal:shouldCompleteInteractivePop` (Value)
- `@satinhq/kit/internal:Sidebar` (Value)
- `@satinhq/kit/internal:SidebarEntry` (Type)
- `@satinhq/kit/internal:SidebarProps` (Type)
- `@satinhq/kit/internal:SidebarSymbol` (Value)
- `@satinhq/kit/internal:sidebarTokens` (Value)
- `@satinhq/kit/internal:SplitSelection` (Type)
- `@satinhq/kit/internal:springStep` (Value)
- `@satinhq/kit/internal:stableTabSelection` (Value)
- `@satinhq/kit/internal:StateSchema` (Type)
- `@satinhq/kit/internal:StepperProps` (Type)
- `@satinhq/kit/internal:StepperRow` (Value)
- `@satinhq/kit/internal:STRIPE_BACKGROUND_MODES` (Value)
- `@satinhq/kit/internal:SubmitLabel` (Type)
- `@satinhq/kit/internal:subscribeGlassErrors` (Value)
- `@satinhq/kit/internal:summarize` (Value)
- `@satinhq/kit/internal:SurfaceId` (Type)
- `@satinhq/kit/internal:SurfaceRenderSpec` (Type)
- `@satinhq/kit/internal:SurfaceShape` (Type)
- `@satinhq/kit/internal:SwipeActions` (Type)
- `@satinhq/kit/internal:SwipeActionsConfiguration` (Type)
- `@satinhq/kit/internal:Tab` (Value)
- `@satinhq/kit/internal:TAB_BAR_BLUR_SIGMA` (Value)
- `@satinhq/kit/internal:TAB_BAR_LOCAL_CENTRES` (Value)
- `@satinhq/kit/internal:TAB_ICON_SVG` (Value)
- `@satinhq/kit/internal:TAB_SELECTION_HEIGHT` (Value)
- `@satinhq/kit/internal:TAB_SELECTION_WIDTH` (Value)
- `@satinhq/kit/internal:TabBar` (Value)
- `@satinhq/kit/internal:TabBarItem` (Type)
- `@satinhq/kit/internal:TabBarProps` (Type)
- `@satinhq/kit/internal:tabGlyphStyle` (Value)
- `@satinhq/kit/internal:tabPresentation` (Value)
- `@satinhq/kit/internal:tabProbeOverride` (Value)
- `@satinhq/kit/internal:TabProps` (Type)
- `@satinhq/kit/internal:tabSelectionCapsule` (Value)
- `@satinhq/kit/internal:TabSelectionShape` (Type)
- `@satinhq/kit/internal:TabView` (Value)
- `@satinhq/kit/internal:TabViewProps` (Type)
- `@satinhq/kit/internal:TextEditor` (Value)
- `@satinhq/kit/internal:TextEditorProps` (Type)
- `@satinhq/kit/internal:TextField` (Value)
- `@satinhq/kit/internal:TextFieldKind` (Type)
- `@satinhq/kit/internal:TextFieldProps` (Type)
- `@satinhq/kit/internal:TINT_BACKGROUND_MODES` (Value)
- `@satinhq/kit/internal:TintBackgroundMode` (Type)
- `@satinhq/kit/internal:TitleDisplayMode` (Type)
- `@satinhq/kit/internal:Toggle` (Value)
- `@satinhq/kit/internal:ToggleProps` (Type)
- `@satinhq/kit/internal:ToggleRow` (Value)
- `@satinhq/kit/internal:ToolbarGroup` (Value)
- `@satinhq/kit/internal:ToolbarSpacer` (Value)
- `@satinhq/kit/internal:trace` (Value)
- `@satinhq/kit/internal:TransactionCollection` (Type)
- `@satinhq/kit/internal:TransitionBinding` (Type)
- `@satinhq/kit/internal:TransitionCompletion` (Type)
- `@satinhq/kit/internal:TransitionController` (Type)
- `@satinhq/kit/internal:TransitionControllerContext` (Type)
- `@satinhq/kit/internal:TransitionControllerFactory` (Type)
- `@satinhq/kit/internal:TransitionOperation` (Type)
- `@satinhq/kit/internal:TransitionPhase` (Type)
- `@satinhq/kit/internal:TypedRoute` (Type)
- `@satinhq/kit/internal:useExperimentalDrawer` (Value)
- `@satinhq/kit/internal:useFocusChain` (Value)
- `@satinhq/kit/internal:useGlassMaterialDiagnostics` (Value)
- `@satinhq/kit/internal:useKeyboardMetrics` (Value)
- `@satinhq/kit/internal:useLayoutClass` (Value)
- `@satinhq/kit/internal:useNavigator` (Value)
- `@satinhq/kit/internal:useNavigatorState` (Value)
- `@satinhq/kit/internal:useParams` (Value)
- `@satinhq/kit/internal:usePushNotifications` (Value)
- `@satinhq/kit/internal:useQuery` (Value)
- `@satinhq/kit/internal:useReachability` (Value)
- `@satinhq/kit/internal:useRecord` (Value)
- `@satinhq/kit/internal:useRestoredState` (Value)
- `@satinhq/kit/internal:useSafeAreaMetrics` (Value)
- `@satinhq/kit/internal:useSatinRuntime` (Value)
- `@satinhq/kit/internal:useSceneStorage` (Value)
- `@satinhq/kit/internal:useScreenLifecycle` (Value)
- `@satinhq/kit/internal:useSplitSelection` (Value)
- `@satinhq/kit/internal:useUnsavedChanges` (Value)
- `@satinhq/kit/internal:validatePushRoute` (Value)
- `@satinhq/kit/internal:ValueRow` (Value)
- `@satinhq/kit/internal:warmAppImageWhenIdle` (Value)
- `@satinhq/kit/internal:Zoomable` (Value)
- `@satinhq/kit/internal:ZoomableProps` (Type)
- `@satinhq/kit/internal/vite:AppFixture` (Type)
- `@satinhq/kit/internal/vite:defineApp` (Value)
- `@satinhq/kit/internal/vite:defineAppFixture` (Value)
- `@satinhq/kit/internal/vite:satinApp` (Value)
- `@satinhq/kit/internal/vite:satinAppFixtures` (Value)
- `@satinhq/kit/internal/vite:SatinAppOptions` (Type)
- `@satinhq/kit/internal/vite:satinAppShell` (Value)
- `@satinhq/kit/internal/vite:SatinAppShellPluginOptions` (Type)
- `@satinhq/kit/server:serveStaticFile` (Value)
- `@satinhq/kit/testing:assertNavigation` (Value)
- `@satinhq/kit/testing:sendTestNotification` (Value)
- `@satinhq/kit/unstable:Animation` (Value)
- `@satinhq/kit/unstable:concentricRadius` (Value)
- `@satinhq/kit/unstable:DetailList` (Value)
- `@satinhq/kit/unstable:DragGesture` (Value)
- `@satinhq/kit/unstable:DragGestureOptions` (Type)
- `@satinhq/kit/unstable:DragGestureValue` (Type)
- `@satinhq/kit/unstable:Gesture` (Type)
- `@satinhq/kit/unstable:GesturePoint` (Type)
- `@satinhq/kit/unstable:GestureState` (Type)
- `@satinhq/kit/unstable:GestureView` (Value)
- `@satinhq/kit/unstable:GestureViewProps` (Type)
- `@satinhq/kit/unstable:LongPressGesture` (Value)
- `@satinhq/kit/unstable:LongPressGestureOptions` (Type)
- `@satinhq/kit/unstable:MagnifyGesture` (Value)
- `@satinhq/kit/unstable:MagnifyGestureOptions` (Type)
- `@satinhq/kit/unstable:MagnifyGestureValue` (Type)
- `@satinhq/kit/unstable:MatchedGeometryEffect` (Value)
- `@satinhq/kit/unstable:MatchedGeometryEffectProps` (Type)
- `@satinhq/kit/unstable:Sidebar` (Value)
- `@satinhq/kit/unstable:SidebarEntry` (Type)
- `@satinhq/kit/unstable:SidebarProps` (Type)
- `@satinhq/kit/unstable:SidebarSymbol` (Value)
- `@satinhq/kit/unstable:SpringOptions` (Type)
- `@satinhq/kit/unstable:TapGesture` (Value)
- `@satinhq/kit/unstable:TapGestureOptions` (Type)
- `@satinhq/kit/unstable:Transition` (Value)
- `@satinhq/kit/unstable:TransitionEdge` (Type)
- `@satinhq/kit/unstable:TransitionView` (Value)
- `@satinhq/kit/unstable:TransitionViewProps` (Type)
- `@satinhq/kit/unstable:useDisplayCornerRadius` (Value)
- `@satinhq/kit/unstable:useGestureState` (Value)
- `@satinhq/kit/unstable:useSplitSelection` (Value)
- `@satinhq/kit/unstable:withAnimation` (Value)
- `@satinhq/kit/vite:defineApp` (Value)
- `@satinhq/kit/vite:satinApp` (Value)
- `@satinhq/kit/vite:SatinAppOptions` (Type)

## Declaration graph fingerprints

- `@satinhq/kit:5566a824a0961de2c85058cf287f1f066ff0874ff909cb5c366fdf94b6476102`
- `@satinhq/kit/vite:2a5c37d7a4a86a6f4e93516451716df9b5c73b3c81ac98509061536453d43207`
- `@satinhq/kit/install:e080a0874c9490077cf9cbb117e03d5d58252226e9424d84101be7ee4454a422`
- `@satinhq/kit/internal:db3014211632761557f2b42c73a14562c1a5567a5405a2b48f91637231397e28`
- `@satinhq/kit/unstable:d429053ae5a14e1d724e3feb09226a36847eee07597cbb52aa76611e753e5ff6`
- `@satinhq/kit/server:7d2b996d9541bd82fd0936e0482554f3182ffe004be56928e590ad4c4c8c79bd`
- `@satinhq/kit/testing:04a86ddf0741e53228777bd599cbd00ff503b9e216a1f86a9791fdbee1bd5e12`
- `@satinhq/kit/diagnostics:05327eaa9f5a55ab73834d5abaeaeffd98cfc6294fa5af5d3ba03a8609463eac`
- `@satinhq/kit/internal/vite:e5ab7060ef1d501162d5e487dd7f6b680f754b6c38b3a6868e2f5c911ab1cc3d`

## Framework source fingerprint

SHA-256 of sorted TS/TSX/CSS source paths and bytes, excluding tests: a027210227daab9aabfedd9d0fab73a8ae611af0cca87ee6c63e1bd6e1a180e3
