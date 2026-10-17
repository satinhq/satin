# Satin API reference

Search by Satin export name. Each entry describes its behavior and limits and links to its exact declaration. Plain-language search terms are included where they help find a control or capability.

Generated from package declarations and reviewed behavior metadata. Run `pnpm --filter @satinhq/kit api:write` after building. Signature, export and source changes invalidate this reference; changes to behavior descriptions require review.

Coverage: 943 named exports across 9 declaration entry points. 151 exports have reviewed behavior metadata. 792 type and integration declarations are identified separately in the behavior review inventory. CSS is a stylesheet, not a named export.

An API description establishes the supported contract. It does not certify pixels, motion, touch or installed-app lifecycle behavior. Experimental entry points remain experimental.

## Core API

Module: `@satinhq/kit`

| Satin export | Behavior | Limits | Also known as |
| --- | --- | --- | --- |
| [`Action`](../actions/types.d.ts) | Shared by menus, context menus and row swipe actions. | Native VoiceOver Actions rotor entries are unavailable; accessible named actions exist. |  |
| [`ActionItem`](../actions/types.d.ts) | A leaf command shared by menus, swipe actions, alerts and confirmation dialogs. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`AdaptiveGridItemOptions`](../content/content.d.ts) | Bounds for repeated adaptive tracks. Only one adaptive descriptor is supported. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`Alert`](../presentation/Presentation.d.ts) | `alert`: a titled presentation with up to three leaf actions and an optional text field. | Cold launch closes legacy restored flags. Destructive confirmations must start closed. |  |
| [`AlertProps`](../presentation/Presentation.d.ts) | An alert's presentation binding, message and leaf actions. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`AlertTextFieldProps`](../presentation/Presentation.d.ts) | The controlled text and keyboard intent of an alert's embedded field. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`Animation`](../motion/animationValue.d.ts) | An opaque spring timing value for `withAnimation`. Use a named value or `Animation.spring`. | Other state and style changes do not animate. Use ForEach identities for keyed List animation. No null animation, easing curves, repeatCount, delay, completion or per-update nested timing. Use one outer synchronous update. Negative bounces are not offered. |  |
| [`AppCapability`](../app/definition.d.ts) | A declared app capability that requires framework-owned runtime support. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`AppDefinition`](../app/definition.d.ts) | Defines the `AppDefinition` type in `@satinhq/kit`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`AppDefinitionInput`](../public/definition.d.ts) | What an app declares about itself: identity, install metadata and launch appearance. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`AppIcon`](../app/definition.d.ts) | Defines the `AppIcon` type in `@satinhq/kit`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`AppOrientation`](../app/definition.d.ts) | An orientation that the app supports. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`AsyncImage`](../image/Image.d.ts) | Remote artwork keeps its placeholder on failure and never blocks navigation. | Remote loading is not a native URLSession cache. The phase callback reports loading state; it does not build alternate content. No Photos library authorization API. |  |
| [`AsyncImagePhase`](../image/Image.d.ts) | Defines the `AsyncImagePhase` type in `@satinhq/kit`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`AsyncImageProps`](../image/Image.d.ts) | An `ImageProps` whose source is a remote URL. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`BuildInfo`](../app/buildInfo.d.ts) | Identity embedded in the running app's JavaScript bundle. The app build ID is a unique build identifier, not a git revision or the service worker's cache hash. | The app build ID is not a git revision or service-worker cache hash. Builds that bypass satinApp report unavailable metadata. Server fetch receipts are separate evidence, not proof of which cached bundle is running. |  |
| [`BuiltInButtonStyle`](../public/controlStyle.d.ts) | Built-in button styles, by their `buttonStyle` names. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`BuiltInLabelStyle`](../public/controlStyle.d.ts) | Built-in label styles. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`BuiltInToggleStyle`](../public/controlStyle.d.ts) | Built-in toggle styles. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`Button`](../public/controls.d.ts) | Use onPress and framework control styles, size and inherited disabled state. buttonBorderShape selects automatic, capsule or a fixed roundedRectangle radius through the shared material shape. | Native style names apply only to the supported styles. Circle and container-concentric button borders are not exposed; plain and List-row buttons have no painted border. Custom ButtonStyle.makeBody controls the visual content; Satin retains button interaction and accessibility. |  |
| [`ButtonBorderShape`](../public/buttonBorderShape.d.ts) | `buttonBorderShape`. Fixed radii are measured in points. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ButtonProps`](../public/controls.d.ts) | Button's action, label and control properties. An `iconOnly` button needs an `aria-label`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ButtonRole`](../public/controlStyle.d.ts) | `ButtonRole`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ButtonStyle`](../public/controlStyle.d.ts) | A custom framework `ButtonStyle`. Appearance only: return noninteractive content; Satin owns the button. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ButtonStyleConfiguration`](../public/controlStyle.d.ts) | `ButtonStyleConfiguration`: what a custom `ButtonStyle` draws from. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`Choice`](../list-form/ListForm.d.ts) | One option of a `Picker`. | Supported option values and styles come from PickerProps. |  |
| [`collection`](../data/database.d.ts) | Declares a collection of records keyed by one string field, like a SwiftData `@Model` with a unique attribute. The curried form, `collection<Note>()({ key, indexes })`, infers index names. | This is IndexedDB, not SwiftData, Core Data or CloudKit. Storage may be evicted; writes can fail. |  |
| [`Collection`](../data/database.d.ts) | One collection of a database (`db.notes`). Once loaded, writes publish to memory at once, so `useQuery` sees them immediately; the returned promise settles after the durable commit. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`CollectionDefinition`](../data/database.d.ts) | A collection's record type, key and indexes, made by `collection` for `defineDatabase`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`CollectionIndexes`](../data/database.d.ts) | A mapping from declared index names to record properties. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`CollectionSchema`](../data/database.d.ts) | The named collections in a database declaration. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`CollectionUpdateMethods`](../data/database.d.ts) | The accepted record updates for a collection. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ColorPicker`](../controls/ColorPicker.d.ts) | `ColorPicker`: a row with a colour well that opens the system colour picker (grid, spectrum, sliders, eyedropper and, with `supportsOpacity`, opacity). The system picker is titled "Colors", not with the label. | The system picker is titled "Colors" instead of the label. Output is sRGB hex; Display P3 choices are converted to sRGB. See controls.md. |  |
| [`ColorPickerProps`](../controls/ColorPicker.d.ts) | ColorPicker's label and controlled colour. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ColorScheme`](../public/environment.d.ts) | `ColorScheme`: the appearance currently drawn by the scene. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ConfirmationDialog`](../presentation/Presentation.d.ts) | `confirmationDialog`: a titled action presentation anchored to its initiating control. | Cold launch closes legacy restored flags. Destructive confirmations must start closed. |  |
| [`ConfirmationDialogProps`](../presentation/Presentation.d.ts) | A confirmation dialog's presentation binding, leaf actions and optional anchor. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ContentAlignment`](../content/content.d.ts) | `Alignment`, for `frame` and `ZStack`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ContentFrame`](../content/content.d.ts) | `frame(width:height:alignment:)` and `frame(minWidth:maxWidth:…)`, in points. `'infinity'` fills the available space. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ContentMargins`](../safe-area/modifiers.d.ts) | Sets margins for descendant scroll views. Lists use horizontal layout margins; the innermost value for each edge wins. | placement scrollIndicators has no effect: Satin draws the indicator in the screen frame. |  |
| [`ContentMarginsProps`](../safe-area/modifiers.d.ts) | Which edges get a margin, how much, and whether it applies to content or indicators. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ContentPadding`](../content/content.d.ts) | `padding`: `true` is the default 16 pt on every edge, a number pads every edge, and an object pads chosen edges. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ContentProps`](../content/content.d.ts) | Shared content properties for the framework components. Plain HTML attributes, `style` included, still apply. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ContentUnavailableView`](../public/controls.d.ts) | `ContentUnavailableView`: an icon, title and description shown for empty content. | Supports the explicit title, icon, description and actions composition; no automatic search variant. |  |
| [`ContentUnavailableViewProps`](../public/controls.d.ts) | The empty state's title, optional description and icon (a tray by default). | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ContextMenu`](../actions/RowActions.d.ts) | `contextMenu`: long-pressing the content opens the glass menu of its actions, with an optional custom `preview`. Rows in a `List` take a `contextMenu` prop instead. | Native VoiceOver Actions rotor entries are unavailable; accessible named actions exist. |  |
| [`ContextMenuConfiguration`](../actions/types.d.ts) | `contextMenu`: row commands and an optional preview. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ControlConfiguration`](../public/controlStyle.d.ts) | The environment every custom control style receives. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ControlSize`](../public/controlStyle.d.ts) | `ControlSize`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ControlStyleProvider`](../public/controlStyle.d.ts) | Sets control defaults for a subtree through `buttonStyle`, `toggleStyle`, `labelStyle`, `controlSize`, `tint` and `disabled`. A control's own props win over the provider, except that a disabled ancestor cannot be re-enabled by a child. | Native style names apply only to the supported styles. Circle and container-concentric button borders are not exposed; plain and List-row buttons have no painted border. Custom ButtonStyle.makeBody controls the visual content; Satin retains button interaction and accessibility. |  |
| [`ControlStyleValues`](../public/controlStyle.d.ts) | The control environment a `ControlStyleProvider` sets for its subtree. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`CoreSymbolName`](../symbols/catalogue.d.ts) | The core symbol name contract used by public app declarations. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`cornerClipPath`](../shapes/corners.d.ts) | CSS clip for an explicitly sized shape. Radii are CSS points; ellipse and capsule are intentional alternatives, not native-default validation errors. | The caller owns sizing outside framework rows. This helper does not change a glass renderer mask. Continuous path coordinates use the measured iOS 27 corner profile. |  |
| [`CornerShape`](../shapes/corners.d.ts) | A deliberate shape choice overrides the framework's semantic default. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`DatabaseMigration`](../data/database.d.ts) | An awaited migration over the database transaction collections. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`DatabaseRecord`](../data/database.d.ts) | A stored record with named values. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`DatePicker`](../controls/DatePicker.d.ts) | `DatePicker` in its compact style: the row's grey value capsules open the system date or time picker. Use a civil string selection (`'2026-10-14'`) for a day that must stay the same day in every time zone, such as a due date; use a `Date` for a moment in time. | graphical and wheel styles are unsupported. The open picker is the system UIDatePicker but WebKit adds Reset and Done buttons, centres it rather than anchoring it under the capsule, and does not grey out days outside the range (choices are clamped). See controls.md. |  |
| [`DatePickerComponent`](../controls/DatePicker.d.ts) | `DatePickerComponents`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`DatePickerProps`](../controls/DatePicker.d.ts) | DatePicker's label, controlled selection, range and the components it edits. `selection` is a `Date`, or a civil string with no time zone: `'2026-10-14'` for a date, `'09:41'` for a time, `'2026-10-14T09:41'` for both. The callback returns the same kind. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`DatePickerRange`](../controls/DatePicker.d.ts) | A DatePicker's selectable range. Omit a bound for a one-sided range (`start...` or `...end`). Bounds use the same kind of value as the selection. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`DatePickerStyle`](../controls/DatePicker.d.ts) | `DatePickerStyle`. `automatic` is `compact`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`DefaultToolbarItem`](../public/toolbar.d.ts) | Places the screen search field among bottom-bar items. Requires Screen searchable. | Only kind search. Without a ToolbarSpacer the neighbouring item is not merged into the search capsule as natively; iPad keeps the drawer. |  |
| [`DefaultToolbarItemProps`](../public/toolbar.d.ts) | Which system item to place, and where. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`defineApp`](../public/definition.d.ts) | Declares app identity, install metadata and capabilities once. Pass the result to `runApp` and to the `@satinhq/kit/vite` plugin. Everything not given is defaulted and the whole definition is validated, so a bad id or icon fails at build time rather than after install. | One app root and the Home Screen WebKit target. No native multi-window Scene builder. |  |
| [`defineDatabase`](../data/database.d.ts) | Opens the app's local database (IndexedDB), like a SwiftData `ModelContainer`. Each collection becomes a property of the result. Bump `version` with a migration whenever the schema changes. Export and import are built in, so offer them to the user. | This is IndexedDB, not SwiftData, Core Data or CloudKit. Storage may be evicted; writes can fail. |  |
| [`defineNamespace`](../motion/matchedGeometry.d.ts) | A namespace declared once at module scope, for views that share no parent component: a `MatchedTransitionSource` in one route and the screen it zooms into in another. Inside one component, use `useNamespace()`. | Pushed screens only: FullScreenCover and Sheet zooms are not available. The source must be on screen in the covered screen, otherwise the push slides. Downward dismissal accepts initial travel within about 26.6 degrees of vertical. Zoom glass uses the projected navigation route atlas. |  |
| [`defineNavigation`](../public/structure.d.ts) | Declares the app's primary tabs or its single stack before anything renders, so every stack and tab id exists (and is typed) from the first frame. Pass the result to `runApp`; `TabView`, `Tab` and `NavigationStack` then render it. Components may freely wrap those views. | One app root and the Home Screen WebKit target. No native multi-window Scene builder. |  |
| [`defineRoutes`](../public/routes.d.ts) | Declares every destination once. The same schema types `useNavigation` and `NavigationLink`, validates restored paths and checks notification deep links, so a route id or param is never a free-form string. | No browser-history router. Route parameters must satisfy the declared schema. |  |
| [`defineWebAuthentication`](../web/authentication.d.ts) | Durable authorization-code + PKCE handoff. This does not implement a native authentication session. | Requires secure context, local storage, Web Locks, dedicated uncached callback and server exchange. Bridge reads require a private transaction proof. Token and OpenID Connect validation belong to the server. No native-session or background-completion guarantee. |  |
| [`Divider`](../content/content.d.ts) | `Divider`: a hairline across its parent stack's axis. Decorative, so hidden from assistive technology. | Default spacing and frame proposal differences are documented in content.md. No arbitrary modifier ordering. |  |
| [`Edge`](../safe-area/context.d.ts) | `Edge`. `leading` and `trailing` follow the layout direction. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`EdgeInsets`](../public/environment.d.ts) | `EdgeInsets`: logical safe-area padding in points. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`EdgeLengths`](../safe-area/context.d.ts) | `EdgeInsets` in points, by layout direction. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`EdgeSet`](../safe-area/modifiers.d.ts) | `Edge.Set`: one member or several. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`EdgeSetMember`](../safe-area/modifiers.d.ts) | A logical edge, an axis pair or all edges. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`EditButton`](../public/controls.d.ts) | `EditButton`: toggles the screen's edit mode. In a toolbar it reads Edit, then becomes the prominent checkmark (Done) while editing, as in iOS 27. | Selection identity comes from ForEach ids (no tag). Edit mode is per screen; there is no environment override binding. Plain rows outside edit mode are not keyboard-focusable for selection. |  |
| [`EditMode`](../list-form/editing.d.ts) | `EditMode`: whether a screen's lists show their editing controls. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ExportDocument`](../data/database.d.ts) | The JSON document `exportJSON` writes and `importJSON` reads. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`FileImporter`](../public/filePickers.d.ts) | Open the system file chooser from a user gesture. Cancel preserves selection. | FileImporter uses React component spelling. MIME hints are not content validation. No PhotosPickerItem identity, persistent file access or exact overlapping chooser attribution. Installed acceptance remains pending. |  |
| [`FileImporterProps`](../public/filePickers.d.ts) | Import files from the system chooser. Content types are MIME types or extensions. | FileImporter uses React component spelling. MIME hints are not content validation. No PhotosPickerItem identity, persistent file access or exact overlapping chooser attribution. Installed acceptance remains pending. |  |
| [`FixedGridItemOptions`](../content/content.d.ts) | A fixed track's dimension in points. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`FlexibleGridItemOptions`](../content/content.d.ts) | Bounds for a flexible track; the minimum defaults to 10 points. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`FocusChainField`](../text-input/focusChain.d.ts) | The focusable field capabilities accepted by a declared editing order. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`FontWeight`](../content/content.d.ts) | `Font.Weight`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ForEach`](../list-form/editing.d.ts) | `ForEach`: one row per element of `data`, identified by its `id` (or `id` function). In a `List`, `onDelete` adds swipe-to-delete and the editing delete control; `onMove` adds the reorder handle. Both receive offsets into `data`; apply them with `removing` and `moving`. Put `ForEach` directly in a `List` or `Section`: the list reads it to know each row's identity. | ForEach must sit directly in a List or Section. Selected-group moves, two-finger selection and VoiceOver move actions are not implemented. |  |
| [`ForEachProps`](../list-form/editing.d.ts) | The collection, how to identify each element, the row each element becomes and its editing actions. `id` may be omitted when the elements have an `id` field. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`Form`](../public/controls.d.ts) | `Form`: an inset grouped `List` for settings and data entry, whose scroll dismisses the keyboard immediately. | ListRow siblings compose within one row. Use separate ListRow elements for separate rows. Compact spacing uses inset-grouped allocations. Numeric gaps change the margin between sections while retaining header/footer allocations. visible retains style and presentation defaults; it does not force an opaque sheet. |  |
| [`FormProps`](../public/controls.d.ts) | The scroll, search and section options `Form` and `List` share. `style` is inline CSS. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`FullScreenCover`](../public/presentation.d.ts) | `fullScreenCover`: an opaque presentation over the whole screen, closed through its binding or `useDismiss()`. | No interactive dismissal on covers. Visibility starts closed after relaunch. | full screen presentation |
| [`FullScreenCoverProps`](../public/presentation.d.ts) | FullScreenCover's presentation binding and accessible title. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`GeometryFrame`](../content/layout.d.ts) | Defines the `GeometryFrame` type in `@satinhq/kit`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`GeometryProxy`](../content/layout.d.ts) | Defines the `GeometryProxy` type in `@satinhq/kit`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`GeometryReader`](../content/layout.d.ts) | A greedy layout container. Give a reader in a scroll view a definite height. | CSS needs a definite proposal on scrolling axes. Native safeAreaInsets and transformed proposal semantics are unsupported. |  |
| [`GeometryReaderProps`](../content/layout.d.ts) | Defines the props accepted by `GeometryReader`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`GeometrySize`](../content/layout.d.ts) | Defines the `GeometrySize` type in `@satinhq/kit`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`Glass`](../public/glassValue.d.ts) | `Glass`: the material intent for a `GlassEffect`. Start from `Glass.regular` or `Glass.clear` and refine it; each call returns a new value. The renderer's treatment stays internal. | Low-level field/outline helpers compute geometry, not a general view modifier. Released apps use blur-and-tint fallback material for unrecoverable WebGPU failures unless strict glass is requested; development builds report the failure. |  |
| [`GlassEffect`](../public/glass.d.ts) | Draws glass behind its content in the given shape, using a capsule by default. Inside a `GlassEffectContainer`, effects with ids morph into one another. | Low-level field/outline helpers compute geometry, not a general view modifier. Released apps use blur-and-tint fallback material for unrecoverable WebGPU failures unless strict glass is requested; development builds report the failure. | glass; refraction |
| [`GlassEffectContainer`](../glass/GlassEffect.d.ts) | `GlassEffectContainer`: groups related glass outlines into one field. | Low-level field/outline helpers compute geometry, not a general view modifier. Released apps use blur-and-tint fallback material for unrecoverable WebGPU failures unless strict glass is requested; development builds report the failure. |  |
| [`GlassEffectProps`](../public/glass.d.ts) | The glass material, shape, DOM attributes and independent morph identity. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`GlassError`](../glass/errors.d.ts) | Defines the `GlassError` type in `@satinhq/kit`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`GlassErrorCode`](../glass/errors.d.ts) | Serializable across the renderer worker boundary. Release failures may select the fallback material. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`GlassShape`](../public/glass.d.ts) | Public glass outlines. Sheet-specific corner geometry stays internal. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`GlassTint`](../glass/regions.d.ts) | Normalized RGBA channels in 0...1. Glass.tintRGBA rejects nonfinite or out-of-range channels. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`GridItem`](../content/content.d.ts) | Stable eager layouts propose track widths with per-track spacing and alignment. Import these layouts and their types from @satinhq/kit. Use List for long data. | Eager rendering without virtualization. Mixed adaptive tracks and Grid/GridRow are deferred. |  |
| [`GridItemOptions`](../content/content.d.ts) | Track spacing follows this track; alignment places content within each cell. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`GridItemValue`](../content/content.d.ts) | A frozen validated grid track, constructed through GridItem. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`HorizontalTextFieldProps`](../public/controls.d.ts) | Horizontal TextField's controlled text and keyboard intent. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`HStack`](../content/content.d.ts) | `HStack`: arranges its children horizontally. Pair it with `Spacer` to push content to the edges. | Default spacing and frame proposal differences are documented in content.md. No arbitrary modifier ordering. |  |
| [`HStackProps`](../content/content.d.ts) | HStack's vertical alignment and spacing in points. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`IgnoresSafeArea`](../safe-area/modifiers.d.ts) | Extends content through selected safe-area edges. Container edges and keyboard avoidance can be controlled independently. | Only a view that starts the screen content extends upward. The bottom edge of non-scroll content is not extended. |  |
| [`IgnoresSafeAreaProps`](../safe-area/modifiers.d.ts) | Which safe-area regions and edges the content ignores. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`Image`](../image/Image.d.ts) | `Image` for a bundled or local asset: it reserves its size so layout never jumps, and `priority` loads it ahead of other images. Use `alt=""` for decoration. | Remote loading is not a native URLSession cache. The phase callback reports loading state; it does not build alternate content. No Photos library authorization API. |  |
| [`ImageAsset`](../image/asset.d.ts) | Produced by the Satin Vite plugin for imports ending in ?satin-image. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ImageProps`](../image/Image.d.ts) | An image's source, required alt text and aspect-ratio content mode. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`IndexesOfCollection`](../data/database.d.ts) | The index names declared by a collection. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`JustUpdated`](../app/coldLaunchUpdate.d.ts) | The previous and current build identifiers after an app update. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`KeyboardGeometry`](../keyboard/geometry.d.ts) | The keyboard overlap and viewport dimensions in points. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`KeyboardMetrics`](../public/keyboard.d.ts) | Defines the `KeyboardMetrics` type in `@satinhq/kit`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`Label`](../public/Label.d.ts) | Combines a semantic title and icon. Hidden titles remain available to assistive technology; toolbar labels with icons show the icon alone. | Custom labels must obey the public noninteractive label contract. |  |
| [`LabeledContent`](../public/controls.d.ts) | `LabeledContent`: a row with a label and a secondary trailing value. | Custom labels must obey the public noninteractive label contract. |  |
| [`LabeledContentProps`](../public/controls.d.ts) | The row's label and the trailing value it shows. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`LabelProps`](../public/Label.d.ts) | A label's title (children) and its icon: a `symbol` name or any `icon` node. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`LabelStyle`](../public/controlStyle.d.ts) | A custom framework `LabelStyle` that arranges a label's title and icon. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`LabelStyleConfiguration`](../public/controlStyle.d.ts) | `LabelStyleConfiguration`: the label's title and icon. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`LaunchScreenSlot`](../app/launchScreen.d.ts) | Serializable so the same slot paints before JavaScript modules load. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`LayoutModifierProps`](../safe-area/modifiers.d.ts) | The content and standard DOM attributes of a layout modifier wrapper. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`LazyHGrid`](../content/content.d.ts) | Rows growing horizontally. Renders every child eagerly; use List for long data. | Eager rendering without virtualization. Mixed adaptive tracks and Grid/GridRow are deferred. |  |
| [`LazyHGridProps`](../content/content.d.ts) | Rows define row spacing; spacing here is the distance between columns. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`LazyHStack`](../content/content.d.ts) | Horizontal stack with eager mounting and retained child state. No viewport virtualization. | Eager rendering without virtualization. Mixed adaptive tracks and Grid/GridRow are deferred. |  |
| [`LazyHStackProps`](../content/content.d.ts) | LazyHStack's layout props. Every child mounts eagerly; use List for long data. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`LazyVGrid`](../content/content.d.ts) | Columns growing vertically. Renders every child eagerly; use List for long data. | Eager rendering without virtualization. Mixed adaptive tracks and Grid/GridRow are deferred. |  |
| [`LazyVGridProps`](../content/content.d.ts) | Columns define column spacing; spacing here is the distance between rows. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`LazyVStack`](../content/content.d.ts) | Vertical stack with eager mounting and retained child state. No viewport virtualization. | Eager rendering without virtualization. Mixed adaptive tracks and Grid/GridRow are deferred. |  |
| [`LazyVStackProps`](../content/content.d.ts) | LazyVStack's layout props. Every child mounts eagerly; use List for long data. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`LineLimit`](../public/controls.d.ts) | A number caps growth; a range also reserves its minimum number of lines. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`Link`](../web/openURL.d.ts) | An accessible URL action with the framework's press and scroll-cancellation policy. | External browser selection is unavailable. Web dispatch is not page completion. Cross-origin or denied frames report status unverified; reload and stop require same-origin access. |  |
| [`LinkProps`](../web/openURL.d.ts) | Defines the props accepted by `Link`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`List`](../public/controls.d.ts) | `List`: a named vertical scroll view of rows, inset grouped by default. Controls inside it render as rows. Its `id` keys scroll restoration, so keep it stable. With `selection`, rows from a `ForEach` become selectable; with an `EditButton` in the screen's toolbar, `ForEach`'s `onDelete` and `onMove` add the editing controls. | The refresh indicator holds a 60-point content inset while the action runs. Its activity animation is shared with ProgressView. ListRow siblings compose within one row. Use separate ListRow elements for separate rows. Compact spacing uses inset-grouped allocations. Numeric gaps change the margin between sections while retaining header/footer allocations. visible retains style and presentation defaults; it does not force an opaque sheet. Selection identity comes from ForEach ids (no tag). Edit mode is per screen; there is no environment override binding. Plain rows outside edit mode are not keyboard-focusable for selection. Bottom toolbar presentation is not animated yet and its scope bar is not drawn (scoped fields stay in the drawer). The search tab bottom field is not drawn; a declared tab role="search" is metadata. Never hand-build a search bar. | list; rows; pull to refresh |
| [`ListItemID`](../list-form/editing.d.ts) | A row's identity in `List` selection: the `ForEach` id. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ListProps`](../public/controls.d.ts) | A `List` takes a `Form`'s options, its `listStyle` and an optional `selection`. | Compact spacing uses inset-grouped allocations. Numeric gaps change the margin between sections while retaining header/footer allocations. visible retains style and presentation defaults; it does not force an opaque sheet. |  |
| [`ListRow`](../list-form/ListForm.d.ts) | Explicit framework overrides for a single row, including custom content. A ListRow is always one row. Several children share it side by side, laid out as an HStack would (centred, 8 pt apart, a NavigationLink filling the rest); each separate row needs its own ListRow. | ListRow siblings compose within one row. Use separate ListRow elements for separate rows. Framework geometry ownership still applies. No raw viewport or safe-area CSS. ForEach must sit directly in a List or Section. Selected-group moves, two-finger selection and VoiceOver move actions are not implemented. Selection identity comes from ForEach ids (no tag). Edit mode is per screen; there is no environment override binding. Plain rows outside edit mode are not keyboard-focusable for selection. |  |
| [`ListRowProps`](../list-form/ListForm.d.ts) | Per-row list properties. Insets are in points. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ListSelectionProps`](../public/controls.d.ts) | `List(selection:)`. An optional id selects one row: tapping a row selects it. A `Set` selects many: while editing, rows show selection circles and taps toggle them. Rows are identified by their `ForEach` ids. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ListStyle`](../public/controls.d.ts) | `listStyle`: the row chrome of a `List`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`LocalReachabilityState`](../reachability/model.d.ts) | The connectivity state of an app that does not require an app server. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`MatchedTransitionSource`](../public/navigationTransition.d.ts) | `matchedTransitionSource(id:in:)`: marks the view a zoom transition starts from and returns to. A push zooms only while its source is on screen; otherwise it slides as usual. | Pushed screens only: FullScreenCover and Sheet zooms are not available. The source must be on screen in the covered screen, otherwise the push slides. Downward dismissal accepts initial travel within about 26.6 degrees of vertical. Zoom glass uses the projected navigation route atlas. |  |
| [`MatchedTransitionSourceProps`](../public/navigationTransition.d.ts) | Props of `MatchedTransitionSource`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`MediaCommandResult`](../media/types.d.ts) | How a media command ended. `needs-user-activation` means WebKit wants a tap first. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`MediaController`](../media/types.d.ts) | Queue results acknowledge the transaction. Playback and seek results acknowledge observed completion. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`MediaPlayer`](../media/types.d.ts) | `useMediaPlayer`'s result: the commands and the live state. | Audio transport only; no VideoPlayer, AVKit or background audio entitlement. Playback depends on WebKit codec support and the server delivering compatible media with byte-range support. |  |
| [`MediaQueueEntry`](../media/types.d.ts) | Each occurrence has its own entryId, including repeated songs. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`MediaQueueOptions`](../media/types.d.ts) | Where a replaced queue starts, and whether it plays. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`MediaRepeat`](../media/types.d.ts) | The queue's repeat mode. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`MediaSnapshot`](../media/types.d.ts) | Everything the player shows: the queue, the current entry, status, position and modes. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`Menu`](../public/actions.d.ts) | Opens a menu of actions. Toolbar labels with symbols render as icon buttons; text labels render as capsules. | Native VoiceOver Actions rotor entries are unavailable; accessible named actions exist. |  |
| [`MenuProps`](../public/actions.d.ts) | A menu's label and its actions. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`MenuTriggerProps`](../glass/menuPresenter.d.ts) | Defines the props accepted by `MenuTrigger`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`moving`](../list-form/offsets.d.ts) | Returns a new array: the elements at `fromOffsets` move, in their original order, to just before the element that was at `toOffset`. Pass it exactly what `ForEach`'s `onMove` reports. `toOffset` counts positions in the original array: moving the first of three rows below the second reports `toOffset` 2, not 1. Use `items.length` to move to the end. | Returns a new array. Store the result with setState to update the rendered rows. |  |
| [`NamespaceID`](../motion/matchedGeometry.d.ts) | `Namespace.ID`: the scope `MatchedGeometryEffect` ids are matched within. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`Navigation`](../public/runtime.d.ts) | The current stack's typed navigation actions. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`NavigationArguments`](../public/runtime.d.ts) | The typed parameter tuple accepted by push and replace. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`NavigationBackButtonBehavior`](../navigation/types.d.ts) | Defines the `NavigationBackButtonBehavior` type in `@satinhq/kit`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`NavigationDeclaration`](../public/structure.d.ts) | An app's primary navigation: either tabs, each owning a stack, or one stack. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`NavigationLink`](../public/controls.d.ts) | `NavigationLink(value:)`: pushes a declared route. In a `List` it is a disclosure row; elsewhere, a plain pressable. | No browser-history router. Route parameters must satisfy the declared schema. |  |
| [`NavigationLinkProps`](../public/controls.d.ts) | A destination route and its params (typed against the registered routes), plus the row's label and accessories. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`NavigationSplitView`](../public/runtime.d.ts) | `NavigationSplitView`: the declared root becomes the sidebar and pushes become the retained detail stack. It collapses to a plain stack at compact width. A `NavigationStack` never splits by itself. | Select an existing declared tab; modal and ad hoc root props are not supported. | sidebar and detail |
| [`NavigationSplitViewProps`](../public/runtime.d.ts) | Selects which declared primary stack the split view renders; inside a `Tab`, its own. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`NavigationStack`](../public/runtime.d.ts) | Renders an in-memory navigation stack. A primary stack's root comes from `defineNavigation`, never from JSX. Inside a `Sheet`, `modal` with a `root` makes a stack the sheet owns. | No browser-history router. Route parameters must satisfy the declared schema. | navigation stack |
| [`NavigationStackProps`](../public/runtime.d.ts) | Either a declared primary stack (optionally naming its tab), or a modal stack inside a `Sheet` that declares its own root. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`NavigationTransition`](../public/navigationTransition.d.ts) | `NavigationTransition`: how a pushed screen arrives and leaves. Give one to `Screen`'s `navigationTransition`. | Pushed screens only: FullScreenCover and Sheet zooms are not available. The source must be on screen in the covered screen, otherwise the push slides. Downward dismissal accepts initial travel within about 26.6 degrees of vertical. Zoom glass uses the projected navigation route atlas. |  |
| [`newId`](../data/database.d.ts) | A new unique record id that sorts by creation time. | This is IndexedDB, not SwiftData, Core Data or CloudKit. Storage may be evicted; writes can fail. |  |
| [`NotificationAuthorizationStatus`](../public/environment.d.ts) | Notification permission, independent of subscription setup and token rotation. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`NotificationPermissionExplainer`](../public/environment.d.ts) | Explains what notifications are for before the user asks for them; its button requests authorization from that gesture. | Installed Home Screen permission is required. Local scheduled notification delivery is unavailable; use an app-owned authenticated server scheduler. |  |
| [`NotificationPermissionExplainerProps`](../public/environment.d.ts) | The notification permission explanation's title and app-authored content. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`OfflinePresentationProps`](../reachability/react.d.ts) | Defines the props accepted by `OfflinePresentation`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`OpenURLAction`](../web/openURL.d.ts) | Defines the `OpenURLAction` type in `@satinhq/kit`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`OpenURLOptions`](../web/openURL.d.ts) | A preference for the browser-owned presentation, not a Safari launch guarantee. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`OpenURLResult`](../web/openURL.d.ts) | Dispatched means WebKit accepted the action; it does not mean the page loaded. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`OrientationFallback`](../app/definition.d.ts) | The presentation policy when the window uses an unsupported orientation. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`Overlay`](../safe-area/Overlay.d.ts) | An overlay in SafeAreaInset shares its reduced safe area and keyboard carrier with the composer. | Bottom composer geometry shares the existing inset store. This is the view-content overload; shape-style overlay is not implemented. |  |
| [`OverlayProps`](../safe-area/Overlay.d.ts) | `overlay(alignment:content:)`: children determine the frame; content respects its safe area. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`param`](../push/schema.d.ts) | Declare typed destinations and use the framework in-memory navigation stack. | No browser-history router. Route parameters must satisfy the declared schema. |  |
| [`Parameter`](../push/schema.d.ts) | One route parameter's validator, made by `param`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ParameterSchema`](../push/schema.d.ts) | A route's parameters by name. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`PasteButton`](../public/deviceActions.d.ts) | Reads text only when pressed; it never probes clipboard contents while rendering. | No clipboard preflight, arbitrary Transferable content, or reliable distinction between dismissal and denial. WebKit can require an additional Paste confirmation. Installed acceptance remains pending. |  |
| [`PasteButtonProps`](../public/deviceActions.d.ts) | A user-initiated plain-text paste, subject to WebKit's permission UI. | No clipboard preflight, arbitrary Transferable content, or reliable distinction between dismissal and denial. WebKit can require an additional Paste confirmation. Installed acceptance remains pending. |  |
| [`PhotosPicker`](../public/filePickers.d.ts) | Photos-library identifiers and persistent access are not exposed by WebKit. | FileImporter uses React component spelling. MIME hints are not content validation. No PhotosPickerItem identity, persistent file access or exact overlapping chooser attribution. Installed acceptance remains pending. |  |
| [`PhotosPickerProps`](../public/filePickers.d.ts) | Select one photo or video as file bytes through the system chooser. | FileImporter uses React component spelling. MIME hints are not content validation. No PhotosPickerItem identity, persistent file access or exact overlapping chooser attribution. Installed acceptance remains pending. |  |
| [`Picker`](../public/controls.d.ts) | `Picker`: choose one option. `menu` (default) shows a menu from the row, `navigationLink` pushes a list of options, `inline` lists them in place and `segmented` draws a segmented control. An option can carry a `symbol` (or `icon`) and a `color`. Icons draw in colour in an inline or navigationLink list, in the label colour inside the open menu, and not at all when segmented. | Supported option values and styles come from PickerProps. |  |
| [`PickerProps`](../public/controls.d.ts) | Picker's options, controlled value and `pickerStyle`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`preferredColorScheme`](../app/appearance.d.ts) | Set this installed scene's appearance. System or null resumes the retained system trait. Store a user's choice with useAppStorage; the override itself lasts for this document. | System or null clears the override. Persist and reapply the choice with useAppStorage. Whole-scene scope including presentations; no per-view or independent sheet preference. |  |
| [`PreferredColorScheme`](../app/appearanceStore.d.ts) | `preferredColorScheme`: a whole-scene appearance override, or system appearance. | System or null clears the override. Persist and reapply the choice with useAppStorage. Whole-scene scope including presentations; no per-view or independent sheet preference. |  |
| [`PresentationDetent`](../presentation/model.d.ts) | `PresentationDetent`: a sheet's supported resting height. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`PresentationProps`](../presentation/Presentation.d.ts) | The presentation binding, accessible title and dismissal callback shared by presentations. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`Pressable`](../press/Pressable.d.ts) | Use onPress and framework control styles, size and inherited disabled state. buttonBorderShape selects automatic, capsule or a fixed roundedRectangle radius through the shared material shape. | Native style names apply only to the supported styles. Circle and container-concentric button borders are not exposed; plain and List-row buttons have no painted border. Custom ButtonStyle.makeBody controls the visual content; Satin retains button interaction and accessibility. |  |
| [`PressableOwnedHandlers`](../press/Pressable.d.ts) | DOM activation handlers reserved for the Pressable interaction policy. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`PressableProps`](../press/Pressable.d.ts) | Defines the props accepted by `Pressable`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`PressState`](../press/stateMachine.d.ts) | Whether a press is idle, held or cancelled. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ProgressView`](../controls/ProgressView.d.ts) | `ProgressView`: a spinning activity indicator, or a linear bar for `value` of `total` (default 1). | Automatic preserves the value-dependent defaults. Circular progress uses the shared activity indicator; indeterminate linear progress draws an empty track. Shares the activity animation used by the refresh indicator. See controls.md. |  |
| [`ProgressViewProps`](../controls/ProgressView.d.ts) | ProgressView's optional label and progress; without `value` it is indeterminate. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ProgressViewStyle`](../controls/ProgressView.d.ts) | `ProgressViewStyle`: `automatic` is linear with a value, circular without. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`Query`](../data/database.d.ts) | An immutable query over a collection: `index`, `keyRange`, `reverse`, `limit` and `filter` each return a new query. `useQuery` hands one to its configure callback. | This is IndexedDB, not SwiftData, Core Data or CloudKit. Storage may be evicted; writes can fail. |  |
| [`ReachabilityPresentation`](../reachability/model.d.ts) | The connectivity presentation currently shown to the user. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ReachabilityProbeConfig`](../reachability/model.d.ts) | The endpoint and deadlines used to probe the app server. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ReachabilityRoutePolicy`](../reachability/model.d.ts) | Whether a destination remains usable without the app server. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ReachabilityState`](../reachability/model.d.ts) | Defines the `ReachabilityState` type in `@satinhq/kit`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ReachabilityStateStatus`](../reachability/model.d.ts) | The server probe result, including an unknown initial state. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ReachabilityStatus`](../reachability/model.d.ts) | The result of the app server reachability probe. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ReachabilitySurface`](../reachability/model.d.ts) | The framework connectivity presentation to show for a failed probe. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`RecordOfCollection`](../data/database.d.ts) | The record type stored by a collection declaration. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`Register`](../public/routes.d.ts) | Augment once in the app to type bare `NavigationLink`, `NavigationStack`, `TabView` and `useNavigation` without generics. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`RegisteredNavigation`](../public/structure.d.ts) | The navigation declared through `Register`, which types bare `TabView`, `Tab` and `NavigationStack`; `never` when the app has not registered one. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`RegisteredRoutes`](../public/routes.d.ts) | The routes declared through `Register`; an empty route set when the app has not registered. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`removing`](../list-form/offsets.d.ts) | Swift `remove(atOffsets:)`, returning a new array without the elements at `offsets`. Pass it exactly what `ForEach`'s `onDelete` reports. | Returns a new array. Store the result with setState to update the rendered rows. |  |
| [`route`](../public/routes.d.ts) | Binds a screen component to its parameter schema and static chrome. Declare the params first, then type the component with `RouteParameters<typeof params>`; this order avoids inference cycles. | No browser-history router. Route parameters must satisfy the declared schema. |  |
| [`RouteDefinition`](../public/routes.d.ts) | A screen bound to its parameter schema; made by `route`, collected by `defineRoutes`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`RouteOptions`](../public/routes.d.ts) | A destination's static chrome: what its bar shows from the first frame of the push. `Screen` overrides any of these once the screen has its data. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`RouteParameters`](../push/schema.d.ts) | The props a route component receives for a parameter schema; optional params are optional. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`RouteParameterValue`](../push/schema.d.ts) | The value described by a route parameter declaration. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`RouteProps`](../public/routes.d.ts) | The params of one route, as its component receives them. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`Routes`](../public/routes.d.ts) | Every destination of an app, made by `defineRoutes`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`RowActionsProps`](../actions/types.d.ts) | Row swipe actions and context-menu commands. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`RowIcon`](../list-form/ListForm.d.ts) | A Settings-style icon: a white symbol on a rounded colour tile, for a row's leading edge. | Custom labels must obey the public noninteractive label contract. |  |
| [`RowIconProps`](../list-form/ListForm.d.ts) | The symbol and its tile colour: a system colour name or any CSS colour. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`RowInteractionProps`](../public/controls.d.ts) | `swipeActions` and `contextMenu` for a row inside a `List`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`RowLabel`](../public/controls.d.ts) | A row's title with a secondary line under it, with a title and a subheadline. The framework owns its layout. | Custom labels must obey the public noninteractive label contract. |  |
| [`RowLabelProps`](../public/controls.d.ts) | A row title and its secondary line. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`runApp`](../public/runtime.d.ts) | Mounts the app into `#root`. Satin creates every primary stack and restores the scene and its launch route before React's first commit, then owns navigation, restoration, notifications and the app shell. Call it once. `Content` replaces the default root, usually to add app-wide providers; it renders `TabView` or `NavigationStack` itself. Without it Satin renders the declaration directly. | One app root and the Home Screen WebKit target. No native multi-window Scene builder. System or null clears the override. Persist and reapply the choice with useAppStorage. Whole-scene scope including presentations; no per-view or independent sheet preference. |  |
| [`RunAppConfiguration`](../public/runtime.d.ts) | The app, routes, navigation and optional root content mounted by runApp. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`RunAppOptions`](../public/runtime.d.ts) | App-wide runtime options for `runApp`. Every one is optional. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`SafeAreaBar`](../safe-area/modifiers.d.ts) | Places a top or bottom safe-area inset with no spacing and its own scroll-edge material. | The bar material is a CSS backdrop blur, not the navigation bar edge effect; it does not extend the navigation bar edge or its seam. |  |
| [`SafeAreaBarProps`](../safe-area/modifiers.d.ts) | A `SafeAreaInset` limited to the top or bottom edge, with no spacing. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`SafeAreaInset`](../safe-area/SafeAreaInset.d.ts) | `safeAreaInset(edge:spacing:content:)`. The accessory takes room from the content's safe area on its edge; a scroll view inside still spans the whole frame and scrolls under it. Bottom: content can scroll under the accessory; its terminal anchor clears it. The accessory's height reaches the content's scroll inset in the same frame it changes (CSS `--satin-inset-accessory-height`, written by its resize observer), so a composer that grows by a line keeps the newest message above it with no frame between. | A top inset under a large title stays at the expanded title edge while the title collapses. On an installed iPhone the status band is a flat WebKit fill (top-edge-limitation.md). | safe area; accessory |
| [`SafeAreaInsetEdge`](../safe-area/SafeAreaInset.d.ts) | `VerticalEdge`/`HorizontalEdge`: `leading` and `trailing` follow the layout direction. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`SafeAreaInsetProps`](../safe-area/SafeAreaInset.d.ts) | The edge, the accessory (`content`) and its spacing; `children` is the content it insets. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`SafeAreaPadding`](../safe-area/modifiers.d.ts) | Adds to the content safe area. Scroll views keep their frame and inset content; other content is padded. Nested padding adds up. | Bottom padding on a scroll view is a trailing spacer in its content. Nested padding adds up as chained modifiers do. |  |
| [`SafeAreaPaddingProps`](../safe-area/modifiers.d.ts) | Which edges to pad, and by how much. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ScenePhase`](../public/environment.d.ts) | `ScenePhase`: the foreground, focus and suspension state. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`Screen`](../public/Screen.d.ts) | A route component's navigation chrome: title, toolbar, search and related options, declared by the screen that owns them. Use it when the title or toolbar depends on the screen's data; static chrome belongs in the route's options. | Only the options in ScreenProps exist. Use only the props documented in the declaration. Bottom toolbar presentation is not animated yet and its scope bar is not drawn (scoped fields stay in the drawer). The search tab bottom field is not drawn; a declared tab role="search" is metadata. Never hand-build a search bar. Opt-in navigation-bar minimization. Use never to keep the bar expanded. |  |
| [`ScreenLifecycle`](../navigation/types.d.ts) | The lifecycle state of a retained navigation entry. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ScreenLifecycleCallbacks`](../navigation/types.d.ts) | Callbacks for a retained navigation entry appearing, being covered or disappearing. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ScreenProps`](../public/Screen.d.ts) | A screen's own chrome, overriding its route's static options. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ScrollAnchor`](../scroll/position.d.ts) | `UnitPoint`: the vertical alignment of a scroll target. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ScrollAxis`](../scroll/types.d.ts) | The axis along which a scroll surface accepts scrolling. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ScrollDismissesKeyboardMode`](../keyboard/adapter.d.ts) | - `immediately`: a drag on the surface ends editing. - `interactively`: scrolling keeps the keyboard; a drag that reaches the keyboard ends editing. Native tracks the keyboard under the finger from there; WebKit's keyboard cannot follow a finger, so it leaves on its own curve (the bottom inset chain follows it). | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ScrollEdge`](../scroll/edgePolicy.d.ts) | `Edge`: a logical edge of a scroll view. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ScrollEdgeEffectHidden`](../scroll/edgePolicy.d.ts) | Whether to hide scroll edge material, optionally for specific edges. | Hard top material throws an unsupported error. The navigation engine renders only the top edge; selecting other edges creates no material. |  |
| [`ScrollEdgeEffectStyle`](../scroll/edgePolicy.d.ts) | `ScrollEdgeEffectStyle`: the requested edge material treatment. | Hard top material throws an unsupported error. The navigation engine renders only the top edge; selecting other edges creates no material. |  |
| [`ScrollEdgeEffectStyleSelection`](../scroll/edgePolicy.d.ts) | The scroll edge treatment and the edges to which it applies. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ScrollEdgeSelection`](../scroll/edgePolicy.d.ts) | One or more scroll edges, or all edges. | Hard top material throws an unsupported error. The navigation engine renders only the top edge; selecting other edges creates no material. |  |
| [`ScrollOffset`](../scroll/types.d.ts) | The scroll position in points along the physical x and y axes. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ScrollPositionBinding`](../scroll/position.d.ts) | `ScrollPosition`: a target identity and the callback that receives its changes. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ScrollPositionOptions`](../scroll/position.d.ts) | A scroll target binding, anchor and geometry observation policy. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ScrollTarget`](../scroll/ScrollTarget.d.ts) | A stable identity in a vertical ScrollView's normal-flow target layout. | Supported anchoring is in ScrollViewProps, including defaultScrollAnchor and maintainVisibleContentPosition. Only the declared scroll options are supported. |  |
| [`ScrollToTopOptions`](../scroll/types.d.ts) | Options for restoring a named scroll surface to its top. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ScrollView`](../public/scroll.d.ts) | Await a refreshable action on a vertical scroll surface. Own a named scroll region, vertical by default, and address declared targets through its handle or position binding. Standalone views own mount-local scroll state without navigation chrome or scene restoration. Wrap any view: one at the top safe edge draws from the screen top and keeps its layout slot; a primary scroll view inside runs under the bars; the keyboard region keeps a bottom SafeAreaInset above the home indicator. Select soft/automatic top material and edge-specific visibility through ScrollView props. Boolean visibility selects the top edge. | The refresh indicator holds a 60-point content inset while the action runs. Its activity animation is shared with ProgressView. Supported anchoring is in ScrollViewProps, including defaultScrollAnchor and maintainVisibleContentPosition. Only the declared scroll options are supported. Only a view that starts the screen content extends upward. The bottom edge of non-scroll content is not extended. Hard top material throws an unsupported error. The navigation engine renders only the top edge; selecting other edges creates no material. | scrolling; pull to refresh |
| [`ScrollViewHandle`](../public/scroll.d.ts) | The current offset and imperative positioning of a scroll view. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ScrollViewProps`](../public/scroll.d.ts) | Scroll policy. Target positioning, refresh and scalar geometry are vertical-only. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`Searchable`](../search/searchable.d.ts) | `searchable(text:isPresented:placement:prompt:)`. The bar owns the field: its capsule, magnifier, clear button, close button, scope bar and collapse on scroll. In the bottom toolbar, the presented field rides above the keyboard with a close button, and the bar and title give way. Place `<DefaultToolbarItem kind="search" placement="bottomBar" />` to put it beside other bottom bar items (Messages). | Bottom toolbar presentation is not animated yet and its scope bar is not drawn (scoped fields stay in the drawer). The search tab bottom field is not drawn; a declared tab role="search" is metadata. Never hand-build a search bar. |  |
| [`SearchFieldPlacement`](../search/searchable.d.ts) | `SearchFieldPlacement`. `'automatic'` uses platform placement on iPhone: the bottom toolbar outside a TabView when the screen has no other bottom bar items or scopes, else a drawer that scrolls away with content. Regular-width automatic search uses the trailing navigation toolbar. | Bottom toolbar presentation is not animated yet and its scope bar is not drawn (scoped fields stay in the drawer). The search tab bottom field is not drawn; a declared tab role="search" is metadata. Never hand-build a search bar. |  |
| [`SearchScopes`](../search/searchable.d.ts) | `searchScopes(_:activation: .onSearchPresentation)`: a controlled scope bar shown under the field while search is presented. | Bottom toolbar presentation is not animated yet and its scope bar is not drawn (scoped fields stay in the drawer). The search tab bottom field is not drawn; a declared tab role="search" is metadata. Never hand-build a search bar. |  |
| [`SearchSuggestion`](../search/searchable.d.ts) | `searchSuggestions` with `searchCompletion`: choosing one replaces the text. It does not submit. | Bottom toolbar presentation is not animated yet and its scope bar is not drawn (scoped fields stay in the drawer). The search tab bottom field is not drawn; a declared tab role="search" is metadata. Never hand-build a search bar. |  |
| [`Section`](../list-form/ListForm.d.ts) | `Section`: a group of rows in a `List` or `Form`, with an optional header and footer. | ListRow siblings compose within one row. Use separate ListRow elements for separate rows. |  |
| [`SectionProps`](../list-form/ListForm.d.ts) | A section's rows and its optional header and footer. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`SecureField`](../public/controls.d.ts) | Edit controlled password text through secure system input. | No access to system password-manager internals. |  |
| [`SecureFieldProps`](../public/controls.d.ts) | SecureField's controlled text, label and prompt. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`Selectable`](../root/SatinRoot.d.ts) | `textSelection(.enabled)`: restores text selection and system callouts for user-authored content, which app chrome otherwise suppresses. | Page zoom remains disabled by the installed shell; general-purpose gesture composition is unsupported. |  |
| [`SelectableProps`](../root/SatinRoot.d.ts) | A content-role wrapper's children and plain div attributes. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`semanticColor`](../public/colors.d.ts) | UIKit semantic content colors, inherited by app content and portals. | Values follow measured normal-contrast iOS 27 traits. Increased contrast and Display P3 are not supported. Semantic label colors and composited secondary/tertiary foreground can differ. |  |
| [`SemanticColorName`](../public/colors.d.ts) | UIKit's semantic colour names (`label`, `secondarySystemBackground`, …). | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`SensoryButton`](../haptics/SensoryButton.d.ts) | SensoryButton selection uses browser native switch-label activation where available. | Only selection and false are accepted. Other feedback kinds are unsupported. Keyboard/assistive activation do not promise a native tick. |  |
| [`SensoryButtonProps`](../haptics/SensoryButton.d.ts) | A tap target's action, content and the feedback it plays. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`SensoryFeedback`](../haptics/SensoryButton.d.ts) | The native switch selection tick. Other feedback kinds are unsupported. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ServerReachabilityConfig`](../reachability/model.d.ts) | The server probe and presentation policy for an app that requires connectivity. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ServerReachabilityState`](../reachability/model.d.ts) | The last server probe, retry and connectivity presentation state. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ShareLink`](../public/deviceActions.d.ts) | Opens the system share sheet during the press. Prepare file bytes before rendering. | No Transferable or file-provider integration. Completion is platform handoff, not recipient delivery; AbortError also covers no suitable target. Installed acceptance remains pending. |  |
| [`ShareLinkProps`](../public/deviceActions.d.ts) | Prepared text, URL or files to hand to the operating system's share sheet. | No Transferable or file-provider integration. Completion is platform handoff, not recipient delivery; AbortError also covers no suitable target. Installed acceptance remains pending. |  |
| [`Sheet`](../public/presentation.d.ts) | `sheet(isPresented:)`: a card over the current screen, with optional detents. It can host its own `NavigationStack modal`. Keep `isPresented` in plain React state: presentations start closed after a relaunch. | Visibility starts closed after relaunch. Persist editor drafts separately, never presentation flags. | sheet; modal presentation |
| [`SheetProps`](../public/presentation.d.ts) | Sheet's presentation binding, title, detents and drag behaviour. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`Slider`](../public/controls.d.ts) | `Slider(value:in:step:)`: in a List or Form it fills its own 60 pt row. | No minimum/maximum value labels or custom tick content; label is accessibility-only. Only the thumb takes a drag. |  |
| [`SliderProps`](../public/controls.d.ts) | Slider's controlled value, range, step and accessibility label. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`Spacer`](../content/content.d.ts) | `Spacer`: takes the free space along its parent stack's axis. | Default spacing and frame proposal differences are documented in content.md. No arbitrary modifier ordering. |  |
| [`SpacerProps`](../content/content.d.ts) | Spacer's minimum length in points. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`SpringOptions`](../motion/animationValue.d.ts) | Options for a spring defined by duration and bounce. | Other state and style changes do not animate. Use ForEach identities for keyed List animation. No null animation, easing curves, repeatCount, delay, completion or per-update nested timing. Use one outer synchronous update. Negative bounces are not offered. |  |
| [`StackDeclaration`](../public/structure.d.ts) | A primary stack: its root route and, when that route requires them, the root's params. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`Stepper`](../public/controls.d.ts) | `Stepper`: increments or decrements a controlled number within its bounds. A row in a `List`, the bare control elsewhere. | Use a controlled numeric value and the declared Stepper props. |  |
| [`StepperProps`](../public/controls.d.ts) | Stepper's controlled value, bounds and step. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`storageQuota`](../public/storage.d.ts) | Use the reactive local database, schema declarations and explicit durability promises. | This is IndexedDB, not SwiftData, Core Data or CloudKit. Storage may be evicted; writes can fail. |  |
| [`StringPropertyKey`](../data/database.d.ts) | The property keys whose values are strings. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`SubmitLabel`](../text-input/kinds.d.ts) | `SubmitLabel`: the return key's title. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`SwipeAction`](../actions/types.d.ts) | Defines the `SwipeAction` type in `@satinhq/kit`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`SwipeActionItem`](../actions/types.d.ts) | A swipe command may omit its visible title while retaining an accessible name. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`SwipeActions`](../actions/types.d.ts) | `swipeActions`: one or more edge configurations for a row. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`SwipeActionsConfiguration`](../actions/types.d.ts) | Swipe actions on one row edge. Full swipe is enabled unless explicitly disabled. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`SymbolGlyph`](../symbols/types.d.ts) | Filled paths on Framework7's 56-unit grid. No font, HTML or external resource. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`SymbolImage`](../symbols/Symbol.d.ts) | `Image(systemName:)`: a vector symbol that sizes with the surrounding font and takes its colour. A `.fill` variant is chosen automatically where the context selects it (a selected tab). | The bundled catalogue uses Framework7 Icons 5.0.5 (MIT) plus Satin-drawn clean-room additions, not Apple SF Symbols assets. Preserve copyright and license notices. Provider glyphs need their own provenance. Only shipped or registered names exist. |  |
| [`SymbolImageProps`](../symbols/Symbol.d.ts) | The symbol's name, symbol properties and an optional accessible label. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`SymbolName`](../symbols/Symbol.d.ts) | A symbol name in SF Symbols style (`'plus'`, `'trash.fill'`). The bundled names autocomplete; any string is accepted for glyphs added through `SymbolProvider`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`SymbolProvider`](../symbols/Symbol.d.ts) | Extend or override glyphs locally. Paths must be original or redistributable with provenance. | The bundled catalogue uses Framework7 Icons 5.0.5 (MIT) plus Satin-drawn clean-room additions, not Apple SF Symbols assets. Preserve copyright and license notices. Provider glyphs need their own provenance. Only shipped or registered names exist. |  |
| [`SymbolRenderingMode`](../symbols/types.d.ts) | `SymbolRenderingMode`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`SymbolScale`](../symbols/types.d.ts) | `Image.Scale`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`SymbolSource`](../symbols/types.d.ts) | Glyphs by symbol name, for `SymbolProvider`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`SymbolWeight`](../symbols/types.d.ts) | `Font.Weight` as applied to a symbol. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`systemColor`](../public/colors.d.ts) | A named system color as a CSS color that follows the appearance. | Values follow measured normal-contrast iOS 27 traits. Increased contrast and Display P3 are not supported. Semantic label colors and composited secondary/tertiary foreground can differ. |  |
| [`SystemColorName`](../public/colors.d.ts) | Appearance-aware UIKit system palette. Explicit CSS colors remain supported. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`Tab`](../public/runtime.d.ts) | Render one declared tab's content; identities and root stacks come from defineNavigation. | Only declared tab styles are supported; no desktop browser support. |  |
| [`TabDeclaration`](../public/structure.d.ts) | The tab declaration contract used by public app declarations. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`TabId`](../public/structure.d.ts) | The union of a navigation declaration's tab ids. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`TabProps`](../public/runtime.d.ts) | Names the declared tab to render. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`TabSection`](../tabs/TabSection.d.ts) | A collapsible sidebar group. TabView consumes this declaration. | Only explicit sidebarOnly placement is supported; automatic section representation in the top bar, tab customization and section header actions are unavailable. Section expansion is retained for this mounted TabView. With no available sidebar, a sidebar-only selection presents the first available primary tab. |  |
| [`TabSectionProps`](../tabs/TabSection.d.ts) | Groups destinations in the adaptable sidebar without creating another navigator. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`TabView`](../public/runtime.d.ts) | `TabView`: renders the tabs from `defineNavigation`, each retaining its own stack, and restores the selected tab with the scene. Pass `selection` and `onSelectionChange` to control it; a controlled tab press only requests the change. | Only declared tab styles are supported; no desktop browser support. A tab can declare role="search" in defineNavigation. No minimizeBehavior or public useBottomAccessoryPlacement contract exists at this revision. The native collapse/inline morph remains incomplete. |  |
| [`TabViewProps`](../public/runtime.d.ts) | TabView's selection binding and bar behaviour; its tabs come from `defineNavigation`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`TaskAction`](../tasks/useTask.d.ts) | The work `useTask` runs: pass `signal` to fetches and publish state through `commit`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`TaskCommit`](../tasks/useTask.d.ts) | Publish synchronous state updates only while this invocation is current. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`TaskOptions`](../tasks/useTask.d.ts) | `task(id:)`: a change of `id` cancels the current run and starts a new one. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`TaskRunner`](../tasks/useTask.d.ts) | Cancels the current run and starts the task again; resolves when that run ends. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`Text`](../content/content.d.ts) | `Text`: inline text in a system text style. Nested Text inherits its enclosing style unless explicitly overridden. A `lineLimit` truncates with an ellipsis. | Default spacing and frame proposal differences are documented in content.md. No arbitrary modifier ordering. |  |
| [`TextEditor`](../public/controls.d.ts) | Edit controlled multiline text with framework keyboard geometry. | Only TextEditorProps apply; no arbitrary native text-layout engine. |  |
| [`TextEditorProps`](../public/controls.d.ts) | TextEditor's controlled text, label and prompt. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`TextField`](../public/controls.d.ts) | Edit controlled text with prompt, keyboard intent and automatic row placement; vertical axis uses the shared editor with lineLimit. | Plain styling uses textFieldStyle="plain". The style prop accepts inline CSS. WebKit owns the system keyboard; arbitrary native text layout is not exposed. |  |
| [`TextFieldKind`](../text-input/kinds.d.ts) | What a field holds, setting its keyboard, autofill and autocorrection together. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`TextFieldProps`](../public/controls.d.ts) | A single-line field, or with `axis="vertical"` a field that grows to its `lineLimit`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`TextFieldStyle`](../public/controls.d.ts) | `textFieldStyle`: `automatic` adapts to the container; `plain` draws no field chrome. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`TextProps`](../content/content.d.ts) | Text's font, weight, design, line limit and alignment. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`TextStyle`](../content/content.d.ts) | iOS text styles at the measured default Dynamic Type size. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`TitleDisplayMode`](../navigation/types.d.ts) | `toolbarTitleDisplayMode`; `inlineLarge` draws the large title inside the bar row. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`Toggle`](../public/controls.d.ts) | `Toggle`: a controlled boolean. It is a switch row in a `List` or `Form`, a bare switch elsewhere, or a `button` or custom `ToggleStyle`. | This does not provide every platform ToggleStyle. |  |
| [`ToggleProps`](../public/controls.d.ts) | Toggle's controlled value, label and control properties. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ToggleStyle`](../public/controlStyle.d.ts) | A custom framework `ToggleStyle`. Its declared semantics are applied to the framework-owned interactive element. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ToggleStyleConfiguration`](../public/controlStyle.d.ts) | `ToggleStyleConfiguration`: what a custom `ToggleStyle` draws from. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ToolbarItem`](../public/toolbar.d.ts) | Places one navigation or bottom-bar item. Adjacent actions share a glass capsule; ToolbarSpacer separates groups. | Toolbar items use the available capsule and principal placements. Use the declared ToolbarItem props for grouping and sizing. |  |
| [`ToolbarItemGroup`](../public/toolbar.d.ts) | `ToolbarItemGroup`: its items render as consecutive `ToolbarItem`s of the placement, which share one glass capsule (iOS 26+ draws a group and adjacent items identically). | Toolbar items use the available capsule and principal placements. Use the declared ToolbarItem props for grouping and sizing. |  |
| [`ToolbarItemProps`](../public/toolbar.d.ts) | The supported toolbar placement names. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ToolbarMinimizationBehavior`](../navigation/toolbarMinimization.d.ts) | `ToolbarMinimizationBehavior`: when a toolbar may minimize. | Opt-in navigation-bar minimization. Use never to keep the bar expanded. |  |
| [`ToolbarMinimizationRestoration`](../navigation/toolbarMinimization.d.ts) | The interaction that restores a minimized toolbar. | Opt-in navigation-bar minimization. Use never to keep the bar expanded. |  |
| [`ToolbarMinimizationSafeAreaAdjustment`](../navigation/toolbarMinimization.d.ts) | Whether toolbar minimization changes its reserved content inset. | Opt-in navigation-bar minimization. Use never to keep the bar expanded. |  |
| [`ToolbarSpacer`](../public/toolbar.d.ts) | `ToolbarSpacer(_:placement:)`. Consecutive items of one placement share one glass capsule; a spacer between them splits it. Place it directly in `toolbar`, next to the items. | Toolbar items use the available capsule and principal placements. Use the declared ToolbarItem props for grouping and sizing. |  |
| [`ToolbarSpacerProps`](../public/toolbar.d.ts) | The spacer's sizing and placement. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`TransactionCollection`](../data/database.d.ts) | A collection as seen inside `db.transaction`: its writes commit together or not at all. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`TransactionCollections`](../data/database.d.ts) | The typed collection handles available inside a database transaction. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`TransitionPhase`](../navigation/types.d.ts) | The progress phase of a navigation transition. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`UpdateActivation`](../app/definition.d.ts) | When a prepared app update may activate. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`useAppStorage`](../public/environment.d.ts) | `@AppStorage`: a small JSON-serializable preference, kept across launches and shared by every component that reads the same key. | Origin-local WebKit storage, not UserDefaults or an iCloud key-value store. | persistent settings |
| [`useAppUpdate`](../public/environment.d.ts) | Reports whether this launch applied an app update: `justUpdated` holds the previous and current build ids after an update, null otherwise (and until launch settles). Release updates apply at launch, before first input after foregrounding, or at a clean suspension. | Preview may reload on update. Release remains the installed production default. |  |
| [`useBuildInfo`](../app/buildInfo.d.ts) | The build loaded by this app, including offline launches. Metadata comes from satinApp at build time; it never reads the server's latest deployment. | The app build ID is not a git revision or service-worker cache hash. Builds that bypass satinApp report unavailable metadata. Server fetch receipts are separate evidence, not proof of which cached bundle is running. |  |
| [`useColorScheme`](../public/environment.d.ts) | `colorScheme`: the appearance Satin is currently drawing, `light` or `dark`. | System or null clears the override. Persist and reapply the choice with useAppStorage. Whole-scene scope including presentations; no per-view or independent sheet preference. Values follow measured normal-contrast iOS 27 traits. Increased contrast and Display P3 are not supported. Semantic label colors and composited secondary/tertiary foreground can differ. |  |
| [`useDismiss`](../presentation/dismiss.d.ts) | Closes the screen or presentation that contains the caller. In a pushed screen it pops that screen; at the root of a Sheet or FullScreenCover it dismisses the presentation, even when interactive dismissal is disabled. Elsewhere it does nothing. | No interactive dismissal on covers. Visibility starts closed after relaunch. |  |
| [`useEditMode`](../list-form/editing.d.ts) | `@Environment(\.editMode)`: this screen's edit mode and a setter. `EditButton` toggles the same value, so a toolbar or bottom bar can follow it. | Selection identity comes from ForEach ids (no tag). Edit mode is per screen; there is no environment override binding. Plain rows outside edit mode are not keyboard-focusable for selection. |  |
| [`useFocusChain`](../text-input/focusChain.d.ts) | `@FocusState` for a form: the return key moves to the next field in `order` and the last one dismisses the keyboard. Spread `field(key)` onto each field. | Focus registration uses framework hooks; custom keyboard replacement is unsupported. |  |
| [`useGlassErrors`](../public/environment.d.ts) | Every glass renderer error so far, re-rendering when one is added. For diagnostics screens; `runApp`'s `onGlassError` is the way to report them. | Diagnostic receipts are not native fidelity or installed acceptance evidence. |  |
| [`useHorizontalSizeClass`](../public/environment.d.ts) | `horizontalSizeClass`: a presentation's own class inside it, else the window's. | Values follow measured normal-contrast iOS 27 traits. Increased contrast and Display P3 are not supported. Semantic label colors and composited secondary/tertiary foreground can differ. |  |
| [`useKeyboardMetrics`](../public/keyboard.d.ts) | Keyboard geometry in points, including the expected software-keyboard height. | No native keyboard-frame API or permission to add an independent keyboard lifecycle. |  |
| [`useMediaPlayer`](../media/react.d.ts) | Subscribe to the root-owned audio queue and system media commands. Video playback is not supported. | Audio transport only; no VideoPlayer, AVKit or background audio entitlement. Playback depends on WebKit codec support and the server delivering compatible media with byte-range support. |  |
| [`useNamespace`](../motion/matchedGeometry.d.ts) | `@Namespace`: a stable id scope for `MatchedGeometryEffect`, one per component. | Frame matching only (properties .frame, anchor .center). Corner radius scales with the frame during flight rather than remaining fixed in points. A non-source view does not follow its source outside an animation. Removed glass presenters do not travel. |  |
| [`useNavigation`](../public/runtime.d.ts) | Returns the enclosing stack's navigation actions, typed against the registered routes. A wrong route id or a missing param is a compile error. | No browser-history router. Route parameters must satisfy the declared schema. |  |
| [`useNotifications`](../public/environment.d.ts) | The app's notification permission and badge. Call `requestAuthorization` from a user gesture, after explaining why (see `NotificationPermissionExplainer`). Without `runApp`'s `notifications` option the status is `unsupported`. | Installed Home Screen permission is required. Local scheduled notification delivery is unavailable; use an app-owned authenticated server scheduler. |  |
| [`useOpenURL`](../web/openURL.d.ts) | Open a web URL from an action. Registered app URLs stay in the current document. | External browser selection is unavailable. Web dispatch is not page completion. Cross-origin or denied frames report status unverified; reload and stop require same-origin access. |  |
| [`useQuery`](../data/database.d.ts) | SwiftData `@Query`: a collection's records as `{ data, loading, error }`, kept live. Local writes show up synchronously, before they persist. | This is IndexedDB, not SwiftData, Core Data or CloudKit. Storage may be evicted; writes can fail. |  |
| [`useReachability`](../reachability/react.d.ts) | The server status and visible offline presentation, with fetch and retry helpers. | No native Network framework path monitor or guarantee that a request will succeed. |  |
| [`useRecord`](../data/database.d.ts) | One record by key, kept live; `data` is undefined while loading and when no record exists. | This is IndexedDB, not SwiftData, Core Data or CloudKit. Storage may be evicted; writes can fail. |  |
| [`UserInterfaceSizeClass`](../public/environment.d.ts) | `UserInterfaceSizeClass`: the available size along one axis. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`useSafeAreaInsets`](../public/environment.d.ts) | The live safe-area insets in CSS pixels. Use them instead of `env(safe-area-inset-*)`. | A top inset under a large title stays at the expanded title edge while the title collapses. On an installed iPhone the status band is a flat WebKit fill (top-edge-limitation.md). |  |
| [`useScaledMetric`](../content/scaledMetric.d.ts) | Scale a dimension by the target WebKit system text style's Dynamic Type ratio. | System font probes are shared per subscribed style and use the same font definitions as Text. largeTitle and callout use fixed-size fallbacks because WebKit lacks their system font keywords. |  |
| [`useScenePhase`](../public/environment.d.ts) | `scenePhase`: `active` in the foreground with focus, `inactive` without focus, `background` when hidden. | Browser execution can stop when suspended. Screen lifecycle is distinct from app foreground state. |  |
| [`useSceneStorage`](../public/environment.d.ts) | `@SceneStorage`: state kept with the current navigation entry in the scene checkpoint, so a draft survives a relaunch. Each pushed entry owns its own value. Values must be JSON-serializable. Keep saved records in a collection, not here. | Not presentation visibility. Checkpoints cannot guarantee recovery after storage eviction or every process crash. | restorable screen state |
| [`useScreenLifecycle`](../navigation/navigationContext.d.ts) | `onAppear` and `onDisappear`: callbacks for a retained navigation entry's visible lifecycle. | Browser execution can stop when suspended. Screen lifecycle is distinct from app foreground state. |  |
| [`useTask`](../tasks/useTask.d.ts) | A task tied to this view’s lifetime. Pass signal to fetch and publish results through commit. Cancellation is cooperative; arbitrary setters outside commit cannot be intercepted. The returned runner cancels and replaces the current run. | Cancellation is cooperative. Arbitrary setters outside commit cannot be intercepted. Native lifecycle has been measured; this is foreground work, not a Web Worker or background scheduler. | cancellable task |
| [`useUnsavedChanges`](../root/runtimeContext.d.ts) | Register app-managed unsaved state while it exists. Native inputs are checked automatically. | This is a framework guard, not a general native interactiveDismissDisabled guarantee. |  |
| [`useVerticalSizeClass`](../public/environment.d.ts) | `verticalSizeClass`: a presentation's own class inside it, else the window's. | Values follow measured normal-contrast iOS 27 traits. Increased contrast and Display P3 are not supported. Semantic label colors and composited secondary/tertiary foreground can differ. |  |
| [`useWebAuthentication`](../web/useWebAuthentication.d.ts) | Subscribe to durable authentication state and reconcile on launch and resume. | Requires secure context, local storage, Web Locks, dedicated uncached callback and server exchange. Bridge reads require a private transaction proof. Token and OpenID Connect validation belong to the server. No native-session or background-completion guarantee. |  |
| [`useWebFrame`](../web/WebView.d.ts) | Observe a WebView and request the operations its origin permits. | External browser selection is unavailable. Web dispatch is not page completion. Cross-origin or denied frames report status unverified; reload and stop require same-origin access. |  |
| [`VerticalScrollGeometry`](../scroll/position.d.ts) | Vertical scroll geometry: the current viewport and content offset in points. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`VerticalTextFieldProps`](../public/controls.d.ts) | Vertical TextField's controlled text, growth limits and keyboard intent. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ViewportFitPolicy`](../app/viewportValue.d.ts) | The viewport fitting policy selected before rendering an app. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ViewThatFits`](../content/layout.d.ts) | Select the first ideal size that fits, or the last candidate when none does. | Give vertical proposals a definite height. Candidates remain mounted; hidden candidates are inert and pause framework tasks and activity indicators. Arbitrary app effects remain active. Selection uses CSS ideal sizes and retains each candidate; hidden children do not unmount. |  |
| [`ViewThatFitsAxis`](../content/layout.d.ts) | Defines the `ViewThatFitsAxis` type in `@satinhq/kit`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ViewThatFitsProps`](../content/layout.d.ts) | Defines the props accepted by `ViewThatFits`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`Visibility`](../navigation/types.d.ts) | `toolbarVisibility(_:for: .navigationBar)`: a hidden bar reserves no row. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`VStack`](../content/content.d.ts) | `VStack`: arranges its children vertically. Give `spacing` explicitly where it matters; wrappers and custom controls do not propagate measured child spacing preferences. | Default spacing and frame proposal differences are documented in content.md. No arbitrary modifier ordering. |  |
| [`VStackProps`](../content/content.d.ts) | VStack's horizontal alignment and spacing in points. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`WebAuthentication`](../web/authentication.d.ts) | Defines the `WebAuthentication` type in `@satinhq/kit`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`WebAuthenticationCallbackResult`](../web/authentication.d.ts) | Defines the `WebAuthenticationCallbackResult` type in `@satinhq/kit`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`WebAuthenticationConfiguration`](../web/authentication.d.ts) | Defines the `WebAuthenticationConfiguration` type in `@satinhq/kit`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`WebAuthenticationExchange`](../web/authentication.d.ts) | Defines the `WebAuthenticationExchange` type in `@satinhq/kit`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`WebAuthenticationRequest`](../web/authentication.d.ts) | Defines the `WebAuthenticationRequest` type in `@satinhq/kit`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`WebAuthenticationStartResult`](../web/authentication.d.ts) | Defines the `WebAuthenticationStartResult` type in `@satinhq/kit`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`WebAuthenticationState`](../web/authentication.d.ts) | Defines the `WebAuthenticationState` type in `@satinhq/kit`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`WebFrameActionResult`](../web/WebView.d.ts) | Defines the `WebFrameActionResult` type in `@satinhq/kit`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`WebFrameController`](../web/WebView.d.ts) | Only same-origin frames expose their current page or accept reload/stop commands. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`WebFrameState`](../web/WebView.d.ts) | Defines the `WebFrameState` type in `@satinhq/kit`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`WebView`](../web/WebView.d.ts) | A sandboxed embedded page. Framing policy and partitioned storage remain browser-owned. | External browser selection is unavailable. Web dispatch is not page completion. Cross-origin or denied frames report status unverified; reload and stop require same-origin access. |  |
| [`WebViewProps`](../web/WebView.d.ts) | Defines the props accepted by `WebView`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`withAnimation`](../motion/matchedGeometry.d.ts) | Applies the state changes in `update`, then animates the `MatchedGeometryEffect` views they move, insert or remove. Call it from an event handler. Keyed List rows also move to their new positions. Other views take their new layout at once. Returns the callback result and propagates errors. Only synchronous updates participate. Nested calls share the outer List transaction; per-update nested timing is not supported. | Other state and style changes do not animate. Use ForEach identities for keyed List animation. No null animation, easing curves, repeatCount, delay, completion or per-update nested timing. Use one outer synchronous update. Negative bounces are not offered. | animated state update |
| [`WriteFailure`](../data/write-store.d.ts) | A durable write that failed after it was published to memory, reported to `db.onError`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`Zoomable`](../zoom/Zoomable.d.ts) | A bounded image/map viewport. Pinch and pan belong only to this content role. Keyboard + / - zoom about the center; 0 resets. Supply an accessible label. | Page zoom remains disabled by the installed shell; general-purpose gesture composition is unsupported. |  |
| [`ZoomableProps`](../zoom/Zoomable.d.ts) | Zoomable's maximum scale and scale callback; Satin owns its pointer handlers. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ZoomTransitionOptions`](../public/navigationTransition.d.ts) | The source identity and namespace for `NavigationTransition.zoom`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ZStack`](../content/content.d.ts) | `ZStack`: overlays its children in one cell, later children on top, keeping source order for assistive technology. | Default spacing and frame proposal differences are documented in content.md. No arbitrary modifier ordering. |  |
| [`ZStackProps`](../content/content.d.ts) | How ZStack aligns its layers. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |

## diagnostics API

Module: `@satinhq/kit/diagnostics`

| Satin export | Behavior | Limits | Also known as |
| --- | --- | --- | --- |
| [`AppearanceEvent`](../app/appearanceStore.d.ts) | A diagnostic appearance event and its observed state. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`InstallationDiagnostics`](../app/InstallationDiagnostics.d.ts) | Installation receipts for an optional Settings diagnostics screen. Use the app's scope. | Package integration API. It does not add a separately supported app control. |  |
| [`InstallationDiagnosticsProps`](../app/InstallationDiagnostics.d.ts) | The app scope whose installation receipts are shown. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`InstallationFailure`](../app/installationFailure.d.ts) | A diagnostic installation failure recorded before app launch. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`readAppearanceDiagnostics`](../app/appearance.d.ts) | Provides `readAppearanceDiagnostics` through the `@satinhq/kit/diagnostics` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`readInstallationFailure`](../app/installationFailure.d.ts) | Reads the recorded installation failure for acceptance fixtures. | Package integration API. It does not add a separately supported app control. |  |

## install API

Module: `@satinhq/kit/install`

| Satin export | Behavior | Limits | Also known as |
| --- | --- | --- | --- |
| [`copyInstallLink`](../app/installContext.d.ts) | Copies the install page's address. Never throws: a refusal is reported with the address. | Package integration API. It does not add a separately supported app control. |  |
| [`CopyLinkResult`](../app/installContext.d.ts) | Defines the `CopyLinkResult` type in `@satinhq/kit/install`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`InstallApp`](../app/installContext.d.ts) | Defines the `InstallApp` type in `@satinhq/kit/install`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`InstallBrowser`](../app/installContext.d.ts) | Defines the `InstallBrowser` type in `@satinhq/kit/install`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`InstallContext`](../app/installContext.d.ts) | Defines the `InstallContext` type in `@satinhq/kit/install`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`InstallDevice`](../app/installContext.d.ts) | What a custom install page needs to know (public through `@satinhq/kit/install`). Every value is read from the browser as it is; nothing is inferred. In particular "installed" is only the standalone display mode: a Safari tab cannot tell whether the app is on the Home Screen. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`InstallSteps`](../app/InstallComponents.d.ts) | The three steps, in the words of Satin's page, for this device, browser and Safari layout. | Package integration API. It does not add a separately supported app control. |  |
| [`InstallTip`](../app/InstallComponents.d.ts) | The tip at Safari's real control ("Page Menu, then Share" or "Share"), in Satin's glass. Shown only in Safari 27 on an iPhone or iPad, where the control's place was measured; renders nothing anywhere else. Its glass takes the page's background colour. | Package integration API. It does not add a separately supported app control. |  |
| [`readInstallContext`](../app/installContext.d.ts) | Provides `readInstallContext` through the `@satinhq/kit/install` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`useInstallContext`](../app/InstallComponents.d.ts) | Optional building blocks for a custom install page (public through `@satinhq/kit/install`): the context hook, the steps list and the tip, with the default page's words and look. Styles are scoped to `satin-` classes; `--satin-install-tint` overrides the app's tint. | Package integration API. It does not add a separately supported app control. |  |

## internal API

Module: `@satinhq/kit/internal`

| Satin export | Behavior | Limits | Also known as |
| --- | --- | --- | --- |
| [`Action`](../actions/types.d.ts) | Shared by menus, context menus and row swipe actions. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ActionItem`](../actions/types.d.ts) | A leaf command shared by menus, swipe actions, alerts and confirmation dialogs. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`Alert`](../presentation/Presentation.d.ts) | `alert`: a titled presentation with up to three leaf actions and an optional text field. | Package integration API. It does not add a separately supported app control. |  |
| [`AlertProps`](../presentation/Presentation.d.ts) | An alert's presentation binding, message and leaf actions. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`AnyScreenDefinition`](../navigation/types.d.ts) | Defines the `AnyScreenDefinition` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`AppDefinition`](../app/definition.d.ts) | Defines the `AppDefinition` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`AppDeploymentInput`](../app/definition.d.ts) | Resolved app deployment fields, including local or server connectivity. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`Appearance`](../glass/lens/theme.d.ts) | Defines the `Appearance` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`AppearanceEvent`](../app/appearanceStore.d.ts) | A diagnostic appearance event and its observed state. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`AppShellBuildState`](../sw/registerAppShell.d.ts) | Defines the `AppShellBuildState` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`AxisLayoutClass`](../layout/layoutClass.d.ts) | Defines the `AxisLayoutClass` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`bindMenuGestures`](../menu/menuGesture.d.ts) | One pointer owns a menu session, including the trigger-to-panel handoff. Native buttons retain their click/keyboard/assistive activation path. Hosts must declare touch-action:none on these gesture owners, never the document. | Package integration API. It does not add a separately supported app control. |  |
| [`BitmapBackdropMode`](../glass/lens/bitmapBackdrop.d.ts) | Measurement fixtures share a decoded bitmap between DOM and GPU sources. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`blendMenuFrames`](../glass/lens/menuMotion.d.ts) | Provides `blendMenuFrames` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`BridgeMode`](../glass/renderSpecs.d.ts) | Defines the `BridgeMode` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ButtonRow`](../list-form/ListForm.d.ts) | Provides `ButtonRow` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`cancelStackTransition`](../navigation/stack.d.ts) | Provides `cancelStackTransition` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`CapsuleShape`](../glass/renderSpecs.d.ts) | Defines the `CapsuleShape` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`Choice`](../list-form/ListForm.d.ts) | One option of a `Picker`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`Chrome`](../root/SatinRoot.d.ts) | Re-enters app-chrome policy inside a Selectable region. | Package integration API. It does not add a separately supported app control. |  |
| [`ChromeBandSpec`](../glass/renderSpecs.d.ts) | Defines the `ChromeBandSpec` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`clampStepper`](../list-form/state.d.ts) | Provides `clampStepper` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`collection`](../data/database.d.ts) | Declares a collection of records keyed by one string field, like a SwiftData `@Model` with a unique attribute. The curried form, `collection<Note>()({ key, indexes })`, infers index names. | Package integration API. It does not add a separately supported app control. |  |
| [`Collection`](../data/database.d.ts) | One collection of a database (`db.notes`). Once loaded, writes publish to memory at once, so `useQuery` sees them immediately; the returned promise settles after the durable commit. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`CollectionDefinition`](../data/database.d.ts) | A collection's record type, key and indexes, made by `collection` for `defineDatabase`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ConfirmationDialog`](../presentation/Presentation.d.ts) | `confirmationDialog`: a titled action presentation anchored to its initiating control. | Package integration API. It does not add a separately supported app control. |  |
| [`ConfirmationDialogProps`](../presentation/Presentation.d.ts) | A confirmation dialog's presentation binding, leaf actions and optional anchor. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`connectPushRoutes`](../push/urlProjection.d.ts) | Pending taps are acknowledged after acceptance and the optional durability gate. | Package integration API. It does not add a separately supported app control. |  |
| [`ContentPage`](../glass/lens/tabPresentation.d.ts) | Defines the `ContentPage` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ContextMenu`](../actions/RowActions.d.ts) | `contextMenu`: long-pressing the content opens the glass menu of its actions, with an optional custom `preview`. Rows in a `List` take a `contextMenu` prop instead. | Package integration API. It does not add a separately supported app control. |  |
| [`ContextMenuConfiguration`](../actions/types.d.ts) | `contextMenu`: row commands and an optional preview. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`createAnimatedTransitionController`](../navigation/motion.d.ts) | State, besides the lifecycle: - `interactionPhase` (interactive pops): 'held' while the finger owns the page, then 'completing' or 'cancelling' once released. A cancelling pop can be caught again (resumeInteractive) and returns to 'held'. - Who moves the page: a native scroll scrub (`scrollSource`, the private scroller drives scroll-timeline tracks), the frame loop (setProgress writes a pose), or the release and automatic tracks in `activeAnimations`. - `binding`: the elements of the screens it moves, bound after React commits them. A release that arrives before the first binding waits in `pendingRelease`. | Package integration API. It does not add a separately supported app control. |  |
| [`createInstantTransitionController`](../navigation/store.d.ts) | Provides `createInstantTransitionController` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`createNavigationReleaseTrajectory`](../navigation/releaseTrajectory.d.ts) | Provides `createNavigationReleaseTrajectory` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`createNavigator`](../navigation/store.d.ts) | Provides `createNavigator` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`CreateNavigatorOptions`](../navigation/store.d.ts) | Defines the `CreateNavigatorOptions` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`createPushNotifications`](../push/notifications.d.ts) | Create once outside React. Only enable() requests permission, synchronously from a gesture. | Package integration API. It does not add a separately supported app control. |  |
| [`createPushRelayAdapter`](../push/notifications.d.ts) | Obtain a user-scoped token at runtime. Never bundle the relay sender token. | Package integration API. It does not add a separately supported app control. |  |
| [`createRenderSpecs`](../glass/renderSpecs.d.ts) | Provides `createRenderSpecs` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`createRouteCodec`](../navigation/routeCodec.d.ts) | Each route is independently versioned so updates keep the deepest valid ancestor. | Package integration API. It does not add a separately supported app control. |  |
| [`createSceneRestoration`](../restoration/scene.d.ts) | Provides `createSceneRestoration` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`createScreenRegistry`](../navigation/registry.d.ts) | Provides `createScreenRegistry` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`createSurfaceClipPath`](../glass/renderSpecs.d.ts) | Provides `createSurfaceClipPath` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`decodePushRoute`](../push/routes.d.ts) | Provides `decodePushRoute` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`defineApp`](../app/definition.d.ts) | Provides `defineApp` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`defineDatabase`](../data/database.d.ts) | Opens the app's local database (IndexedDB), like a SwiftData `ModelContainer`. Each collection becomes a property of the result. Bump `version` with a migration whenever the schema changes. Export and import are built in, so offer them to the user. | Package integration API. It does not add a separately supported app control. |  |
| [`defineScreen`](../navigation/registry.d.ts) | Provides `defineScreen` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`DetailList`](../navigation/DetailList.d.ts) | Regular-width grouped detail content beneath NavigatorHost's inline title. | Package integration API. It does not add a separately supported app control. |  |
| [`DirectCanvasElements`](../glass/renderSpecs.d.ts) | Defines the `DirectCanvasElements` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`DisclosureIndicator`](../settings/DisclosureIndicator.d.ts) | Framework7 disclosure artwork; framework layout still owns the row aperture. | Package integration API. It does not add a separately supported app control. |  |
| [`DisclosureIndicatorProps`](../settings/DisclosureIndicator.d.ts) | Defines the props accepted by `DisclosureIndicator`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`dismissKeyboard`](../keyboard/adapter.d.ts) | Provides `dismissKeyboard` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`DisplayCornerMetrics`](../safe-area/displayCorners.d.ts) | The screen's corner radius in points, with how sure Satin is of the model. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`DisplayGeometry`](../safe-area/displayCorners.d.ts) | Display geometry in CSS points. Supply the physical screen, not the app window. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`drawGlassBitmapBackdrop`](../glass/lens/bitmapBackdrop.d.ts) | Provides `drawGlassBitmapBackdrop` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`drawReferenceBackground`](../glass/lens/referenceBackground.d.ts) | Provides `drawReferenceBackground` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`EdgeInsets`](../safe-area/useSafeAreaMetrics.d.ts) | Insets in CSS pixels, by physical edge. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`encodePushRoute`](../push/routes.d.ts) | Provides `encodePushRoute` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`EntryTransition`](../navigation/types.d.ts) | Defines the `EntryTransition` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`estimateStorage`](../data/database.d.ts) | The app's storage usage and quota in bytes, when WebKit reports them. | Package integration API. It does not add a separately supported app control. |  |
| [`evaluateTemporalSpline`](../glass/lens/liquidMotion.d.ts) | Provides `evaluateTemporalSpline` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`ExportDocument`](../data/database.d.ts) | The JSON document `exportJSON` writes and `importJSON` reads. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`finishStackTransition`](../navigation/stack.d.ts) | Provides `finishStackTransition` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`getGlassErrors`](../glass/errors.d.ts) | Provides `getGlassErrors` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`Glass`](../glass/regions.d.ts) | Immutable glass material values. RGBA channels use the range 0...1. | Package integration API. It does not add a separately supported app control. |  |
| [`GLASS_BAR_EDGE_HIGHLIGHT_ALPHA`](../glass/tokens.d.ts) | Provides `GLASS_BAR_EDGE_HIGHLIGHT_ALPHA` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GLASS_BAR_HEIGHT_PX`](../glass/tokens.d.ts) | Provides `GLASS_BAR_HEIGHT_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GLASS_BAR_SHADOW_ALPHA`](../glass/tokens.d.ts) | Provides `GLASS_BAR_SHADOW_ALPHA` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GLASS_CIRCLE_INLINE_INSET_PX`](../glass/lens/Scene.d.ts) | Provides `GLASS_CIRCLE_INLINE_INSET_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GLASS_CIRCLE_SIZE_PX`](../glass/lens/Scene.d.ts) | Provides `GLASS_CIRCLE_SIZE_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GLASS_CIRCLE_TOP_PX`](../glass/lens/Scene.d.ts) | Provides `GLASS_CIRCLE_TOP_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GLASS_CLEAR_BRIGHTNESS`](../glass/tokens.d.ts) | Provides `GLASS_CLEAR_BRIGHTNESS` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GLASS_CLEAR_SATURATION`](../glass/tokens.d.ts) | Provides `GLASS_CLEAR_SATURATION` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GLASS_CLEAR_TINT_ALPHA`](../glass/tokens.d.ts) | Provides `GLASS_CLEAR_TINT_ALPHA` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GLASS_CONTROL_SIZE_PX`](../glass/tokens.d.ts) | Provides `GLASS_CONTROL_SIZE_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GLASS_DOCK_BOTTOM_GAP_PX`](../glass/lens/Scene.d.ts) | Provides `GLASS_DOCK_BOTTOM_GAP_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GLASS_DOCK_HEIGHT_PX`](../glass/lens/Scene.d.ts) | Provides `GLASS_DOCK_HEIGHT_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GLASS_DOCK_RADIUS_PX`](../glass/lens/Scene.d.ts) | Provides `GLASS_DOCK_RADIUS_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GLASS_DOCK_SIDE_INSET_PX`](../glass/lens/Scene.d.ts) | Provides `GLASS_DOCK_SIDE_INSET_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GLASS_DOCK_WIDTH_PX`](../glass/lens/Scene.d.ts) | Provides `GLASS_DOCK_WIDTH_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GLASS_LENS_BLUR_PX`](../glass/tokens.d.ts) | Provides `GLASS_LENS_BLUR_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GLASS_LENS_CHROMATIC_ABERRATION`](../glass/tokens.d.ts) | Provides `GLASS_LENS_CHROMATIC_ABERRATION` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GLASS_LENS_CURVATURE`](../glass/tokens.d.ts) | Provides `GLASS_LENS_CURVATURE` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GLASS_LENS_DEPTH_PX`](../glass/tokens.d.ts) | Provides `GLASS_LENS_DEPTH_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GLASS_LENS_EDGE_EXPONENT`](../glass/tokens.d.ts) | Provides `GLASS_LENS_EDGE_EXPONENT` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GLASS_LENS_EDGE_HIGHLIGHT`](../glass/tokens.d.ts) | Provides `GLASS_LENS_EDGE_HIGHLIGHT` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GLASS_LENS_EDGE_WIDTH_PX`](../glass/tokens.d.ts) | Provides `GLASS_LENS_EDGE_WIDTH_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GLASS_LENS_GLOW`](../glass/tokens.d.ts) | Provides `GLASS_LENS_GLOW` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GLASS_LENS_GLOW_EXPONENT`](../glass/tokens.d.ts) | Provides `GLASS_LENS_GLOW_EXPONENT` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GLASS_LENS_GLOW_SPREAD`](../glass/tokens.d.ts) | Provides `GLASS_LENS_GLOW_SPREAD` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GLASS_LENS_SPECULAR`](../glass/tokens.d.ts) | Provides `GLASS_LENS_SPECULAR` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GLASS_LENS_SPECULAR_ANGLE_DEG`](../glass/tokens.d.ts) | Provides `GLASS_LENS_SPECULAR_ANGLE_DEG` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GLASS_LENS_SPLAY`](../glass/tokens.d.ts) | Provides `GLASS_LENS_SPLAY` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GLASS_LENS_STRENGTH`](../glass/tokens.d.ts) | Provides `GLASS_LENS_STRENGTH` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GLASS_OVERSCAN_X_PX`](../glass/lens/Scene.d.ts) | Provides `GLASS_OVERSCAN_X_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GLASS_OVERSCAN_Y_PX`](../glass/lens/Scene.d.ts) | Provides `GLASS_OVERSCAN_Y_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GLASS_REGION_LIMIT`](../glass/regions.d.ts) | Provides `GLASS_REGION_LIMIT` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GLASS_REGION_PIXEL_LIMIT`](../glass/regions.d.ts) | Provides `GLASS_REGION_PIXEL_LIMIT` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GLASS_REGULAR_BRIGHTNESS`](../glass/tokens.d.ts) | Provides `GLASS_REGULAR_BRIGHTNESS` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GLASS_REGULAR_SATURATION`](../glass/tokens.d.ts) | Provides `GLASS_REGULAR_SATURATION` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GLASS_REGULAR_TINT_ALPHA`](../glass/tokens.d.ts) | Provides `GLASS_REGULAR_TINT_ALPHA` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GLASS_RIM_HIGHLIGHT_ALPHA`](../glass/tokens.d.ts) | Provides `GLASS_RIM_HIGHLIGHT_ALPHA` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GLASS_RIM_SHADOW_ALPHA`](../glass/tokens.d.ts) | Provides `GLASS_RIM_SHADOW_ALPHA` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GLASS_SELECTION_DURATION_MS`](../glass/tokens.d.ts) | Provides `GLASS_SELECTION_DURATION_MS` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GLASS_SELECTION_EASING`](../glass/tokens.d.ts) | Provides `GLASS_SELECTION_EASING` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GLASS_TAB_BAR_BOTTOM_GAP_PX`](../glass/tokens.d.ts) | Provides `GLASS_TAB_BAR_BOTTOM_GAP_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GLASS_TAB_BAR_HEIGHT_PX`](../glass/tokens.d.ts) | Provides `GLASS_TAB_BAR_HEIGHT_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GLASS_TAB_BAR_INLINE_INSET_PX`](../glass/tokens.d.ts) | Provides `GLASS_TAB_BAR_INLINE_INSET_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GLASS_TINT_RGB`](../glass/tokens.d.ts) | Provides `GLASS_TINT_RGB` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GlassAccessibilityPreferences`](../glass/capability.d.ts) | Defines the `GlassAccessibilityPreferences` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`GlassBackground`](../glass/GlassEffect.d.ts) | Framework chrome can keep its existing DOM geometry and transition refs. An `interactive` chrome button's glass (back, close, sidebar) takes the finger through the same contact path as every interactive glass, as a bar button: the touch anywhere on its button presses it. | Package integration API. It does not add a separately supported app control. |  |
| [`GlassBar`](../glass/GlassBar.d.ts) | Provides `GlassBar` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GlassBarProps`](../glass/GlassBar.d.ts) | Defines the props accepted by `GlassBar`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`glassBlendRadius`](../glass/fieldGeometry.d.ts) | Sequential native frames bracket contact at 4.50–5.04, 9.23–10.57, 18.53–20.94, 36.56–41.92 pt. See phase-morph-engine-notes.md. Polynomial smooth-min joins equal members at gap = k/2. | Package integration API. It does not add a separately supported app control. |  |
| [`GlassButton`](../glass/GlassEffect.d.ts) | Provides `GlassButton` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GlassCapabilityDecision`](../glass/capability.d.ts) | Defines the `GlassCapabilityDecision` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`GlassCapabilityState`](../glass/capability.d.ts) | Defines the `GlassCapabilityState` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`GlassConfusionReview`](../glass/GlassConfusionReview.d.ts) | Provides `GlassConfusionReview` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GlassContainer`](../glass/GlassEffect.d.ts) | Provides `GlassContainer` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GlassDisplacementPolicy`](../glass/GlassMaterialRoot.d.ts) | Defines the `GlassDisplacementPolicy` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`glassDockHeight`](../glass/lens/Scene.d.ts) | Provides `glassDockHeight` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`glassDockWidth`](../glass/lens/Scene.d.ts) | The tab platter's width: the one rule for the glass renderer and the tab slot it reads. | Package integration API. It does not add a separately supported app control. |  |
| [`GlassEffect`](../glass/GlassEffect.d.ts) | Local content remains DOM-owned; only the material canvas is painted by reference. | Package integration API. It does not add a separately supported app control. | glass; refraction |
| [`GlassEffectContainer`](../glass/GlassEffect.d.ts) | `GlassEffectContainer`: groups related glass outlines into one field. | Package integration API. It does not add a separately supported app control. |  |
| [`GlassEffectProps`](../glass/GlassEffect.d.ts) | Defines the props accepted by `GlassEffect`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`GlassError`](../glass/errors.d.ts) | Defines the `GlassError` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`GlassErrorCode`](../glass/errors.d.ts) | Serializable across the renderer worker boundary. Release failures may select the fallback material. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`glassFieldDistance`](../glass/fieldGeometry.d.ts) | Returns the signed distance to the diagnostic glass union in points. | Package integration API. It does not add a separately supported app control. |  |
| [`GlassFieldMember`](../glass/fieldGeometry.d.ts) | Geometry in frame-local CSS pixels; independent of any renderer. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`GlassFrameTrace`](../glass/renderSpecs.d.ts) | Defines the `GlassFrameTrace` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`GlassInteraction`](../glass/rendererContract.d.ts) | Defines the `GlassInteraction` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`GlassLayer`](../glass/GlassEffect.d.ts) | Place this inside the matching ScrollSurface for scroll attachment. | Package integration API. It does not add a separately supported app control. |  |
| [`GlassLayerDescriptor`](../glass/regions.d.ts) | Serializable renderer contract. No DOM, Pixi, or GPU handles cross this boundary. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`GlassMaterial`](../glass/regions.d.ts) | Defines the `GlassMaterial` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`GlassMaterialDiagnostics`](../glass/context.d.ts) | Defines the `GlassMaterialDiagnostics` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`GlassMaterialResponse`](../glass/rendererContract.d.ts) | Defines the `GlassMaterialResponse` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`GlassOutlinePoint`](../glass/unionOutline.d.ts) | One point in a diagnostic glass outline, in field coordinates. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`GlassPresenter`](../glass/rendererContract.d.ts) | Defines the `GlassPresenter` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`GlassRegion`](../glass/regions.d.ts) | Defines the `GlassRegion` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`GlassRendererDiagnostics`](../glass/rendererContract.d.ts) | Defines the `GlassRendererDiagnostics` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`GlassRendererReply`](../glass/rendererContract.d.ts) | Worker failures must retain raw messages and device-loss reasons. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`GlassRendererRequest`](../glass/rendererContract.d.ts) | Defines the `GlassRendererRequest` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`GlassRenderTestState`](../glass/capability.d.ts) | Defines the `GlassRenderTestState` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`GlassSceneSnapshot`](../glass/regions.d.ts) | Each layer can own multiple presenters. WebGPU shares one device across canvases. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`GlassScrollSnapshot`](../glass/regions.d.ts) | Defines the `GlassScrollSnapshot` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`GlassSearchField`](../glass/GlassTextField.d.ts) | Provides `GlassSearchField` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GlassShape`](../glass/regions.d.ts) | Defines the `GlassShape` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`GlassSource`](../glass/rendererContract.d.ts) | Defines the `GlassSource` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`GlassSpecimen`](../glass/GlassPresentation.d.ts) | Shared semantic DOM and runtime ownership. Probe controls are testing-only. | Package integration API. It does not add a separately supported app control. |  |
| [`GlassTextField`](../glass/GlassTextField.d.ts) | Provides `GlassTextField` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GlassTextFieldProps`](../glass/GlassTextField.d.ts) | Defines the props accepted by `GlassTextField`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`GlassTint`](../glass/regions.d.ts) | Normalized RGBA channels in 0...1. Glass.tintRGBA rejects nonfinite or out-of-range channels. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`glassTokens`](../glass/tokens.d.ts) | Provides `glassTokens` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`GlassTouchLight`](../glass/renderSpecs.d.ts) | A sampled light field, independent of the renderer and of row selection. Coordinates and radius are CSS pixels relative to the surface frame. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`GlassUnionFrame`](../glass/fieldGeometry.d.ts) | A diagnostic glass union outline and its bounds in field coordinates. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`glassUnionOutline`](../glass/unionOutline.d.ts) | Closed contours, including disconnected members. Coordinates use the frame's local CSS pixels. Diagnostic/export operation: never run it in the render loop. Marching triangles avoid ambiguous saddle cells; roots use the shader's field. | Package integration API. It does not add a separately supported app control. |  |
| [`GlassVariant`](../glass/tokens.d.ts) | Defines the `GlassVariant` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ICON_GRADIENTS`](../glass/lens/theme.d.ts) | Provides `ICON_GRADIENTS` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`ICON_SVG`](../glass/lens/icons.d.ts) | Provides `ICON_SVG` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`InstallationDiagnostics`](../app/InstallationDiagnostics.d.ts) | Installation receipts for an optional Settings diagnostics screen. Use the app's scope. | Package integration API. It does not add a separately supported app control. |  |
| [`InstallationFailure`](../app/installationFailure.d.ts) | A diagnostic installation failure recorded before app launch. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`installMotionProbe`](../motionProbe.d.ts) | Install once before app mount; dispose restores the original rAF function. | Package integration API. It does not add a separately supported app control. |  |
| [`InteractivePopDiagnostic`](../navigation/interactivePopTypes.d.ts) | Defines the `InteractivePopDiagnostic` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`isBitmapBackdrop`](../glass/lens/bitmapBackdrop.d.ts) | Provides `isBitmapBackdrop` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`isCalibratedMaxLayout`](../glass/lens/Scene.d.ts) | Provides `isCalibratedMaxLayout` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`isTintBackgroundMode`](../glass/lens/referenceBackground.d.ts) | Provides `isTintBackgroundMode` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`KeyboardGeometry`](../keyboard/geometry.d.ts) | The keyboard overlap and viewport dimensions in points. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`lastUnstableMeasurement`](../glass/lens/Scene.d.ts) | Provides `lastUnstableMeasurement` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`LayoutClass`](../layout/layoutClass.d.ts) | Defines the `LayoutClass` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`LensMode`](../glass/renderSpecs.d.ts) | Defines the `LensMode` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`LIQUID_ENVELOPES`](../glass/lens/liquidMotion.d.ts) | Provides `LIQUID_ENVELOPES` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`LIQUID_PILL_BAR`](../glass/lens/liquidMotion.d.ts) | Provides `LIQUID_PILL_BAR` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`LIQUID_SCRIPT`](../glass/lens/liquidMotion.d.ts) | Provides `LIQUID_SCRIPT` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`liquidAnimationActive`](../glass/lens/liquidMotion.d.ts) | Provides `liquidAnimationActive` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`LiquidMotionMode`](../glass/lens/liquidMotion.d.ts) | Defines the `LiquidMotionMode` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`liquidScriptDuration`](../glass/lens/liquidMotion.d.ts) | Provides `liquidScriptDuration` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`List`](../list-form/ListForm.d.ts) | Provides `List` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. | list; rows; pull to refresh |
| [`ListEngineProps`](../list-form/ListForm.d.ts) | Defines the props accepted by `ListEngine`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`makeReferenceBackgroundCanvas`](../glass/lens/referenceBackground.d.ts) | Provides `makeReferenceBackgroundCanvas` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`MARKER_INTERVAL_PX`](../glass/lens/mirrorConstants.d.ts) | Provides `MARKER_INTERVAL_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`measureMirrorLayout`](../glass/lens/Scene.d.ts) | Provides `measureMirrorLayout` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`measureMirrorLayoutRelative`](../glass/lens/Scene.d.ts) | A host whose origin moves on every read (a route inside a running navigation transform) never passes the absolute-origin check. Its own layout is still stable: two consecutive snapshots with identical host-relative geometry are a consistent reading, whatever the origin did. Additive; measureMirrorLayout is unchanged. | Package integration API. It does not add a separately supported app control. |  |
| [`Menu`](../glass/Menu.d.ts) | Provides `Menu` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`MENU_BUTTON`](../glass/lens/menuMotion.d.ts) | Provides `MENU_BUTTON` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`MENU_CADENCE`](../glass/lens/menuMotion.d.ts) | Provides `MENU_CADENCE` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`MENU_ENVELOPE`](../glass/lens/menuMotion.d.ts) | Provides `MENU_ENVELOPE` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`MENU_GESTURE_REST`](../menu/menuGesture.d.ts) | Provides `MENU_GESTURE_REST` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`MENU_ICON_SVG`](../glass/lens/icons.d.ts) | Provides `MENU_ICON_SVG` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`MENU_MOTION_DURATIONS`](../glass/lens/menuMotion.d.ts) | Provides `MENU_MOTION_DURATIONS` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`MENU_PANEL`](../glass/lens/menuMotion.d.ts) | Provides `MENU_PANEL` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`MENU_TAP_FEEDBACK_MS`](../menu/menuGesture.d.ts) | Provides `MENU_TAP_FEEDBACK_MS` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`menuCadenceDuration`](../glass/lens/menuMotion.d.ts) | Provides `menuCadenceDuration` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`MenuDirection`](../glass/lens/menuMotion.d.ts) | Defines the `MenuDirection` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`MenuGestureDecision`](../menu/menuGesture.d.ts) | Defines the `MenuGestureDecision` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`MenuGestureFrame`](../menu/menuGesture.d.ts) | Defines the `MenuGestureFrame` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`MenuGestureMotion`](../menu/menuGesture.d.ts) | Defines the `MenuGestureMotion` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`menuHighlightAttack`](../menu/menuGesture.d.ts) | Provides `menuHighlightAttack` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`MenuInteraction`](../menu/menuInteraction.d.ts) | Provides `MenuInteraction` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`MenuInteractionPhase`](../menu/menuInteraction.d.ts) | Synchronous ownership of a menu transition. React renders its snapshot; event handlers use this model so two events in one task cannot both submit. Completion tokens prevent an interrupted window's timer settling its successor. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`menuMaterialProgress`](../glass/lens/menuMotion.d.ts) | Provides `menuMaterialProgress` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`MenuMotionFrame`](../glass/lens/menuMotion.d.ts) | Defines the `MenuMotionFrame` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`MenuPanelBounds`](../menu/menuGesture.d.ts) | Defines the `MenuPanelBounds` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`menuPanelPull`](../menu/menuGesture.d.ts) | Fit to axis controls plus the held diagonal, with its origin in the panel's resting coordinate space. Over-pull begins outside the panel; the anchored right edge couples vertical stretch to horizontal displacement. | Package integration API. It does not add a separately supported app control. |  |
| [`MenuProps`](../glass/menuPresenter.d.ts) | Defines the props accepted by `Menu`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`menuPull`](../glass/contactPhysics.d.ts) | Provides `menuPull` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`menuRetargetTime`](../glass/lens/menuMotion.d.ts) | Restart an interrupted transition near the current geometry, not at its opposite endpoint. This is an interruption policy, not a native timing fit. | Package integration API. It does not add a separately supported app control. |  |
| [`menuReturn`](../glass/contactPhysics.d.ts) | Provides `menuReturn` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`MenuTriggerProps`](../glass/menuPresenter.d.ts) | Defines the props accepted by `MenuTrigger`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`MirrorCaptureRange`](../glass/lens/Scene.d.ts) | DOM geometry is authoritative. This function is only called after layout changes. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`MirrorLayout`](../glass/lens/Scene.d.ts) | Defines the `MirrorLayout` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`MirrorNode`](../glass/lens/Scene.d.ts) | Defines the `MirrorNode` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`MorphEllipsisArtwork`](../glass/MorphEllipsisArtwork.d.ts) | The enclosing control owns the accessible label. | Package integration API. It does not add a separately supported app control. |  |
| [`MOTION_SPEC`](../glass/lens/motion.d.ts) | Provides `MOTION_SPEC` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`MotionRun`](../glass/lens/motion.d.ts) | Defines the `MotionRun` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`MotionSample`](../glass/lens/motion.d.ts) | Defines the `MotionSample` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`mountGlassWorkerExperiment`](../glass/worker/experiment.d.ts) | Provides `mountGlassWorkerExperiment` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`mountSatin`](../root/mountSatin.d.ts) | Mount once from the app entry point, after resolving its initial screen. The first commit runs in this task so installed WebKit cannot defer it behind its launch presentation. Later updates retain React's normal scheduling. Do not call from a component or an effect, or suspend the initial screen. | Package integration API. It does not add a separately supported app control. |  |
| [`NATIVE_WIDGET_Y_REGISTRATION_PX`](../glass/lens/motion.d.ts) | Provides `NATIVE_WIDGET_Y_REGISTRATION_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`NAVIGATION_CURRENT_SEGMENT_WEIGHT`](../navigation/releaseVelocity.d.ts) | Provides `NAVIGATION_CURRENT_SEGMENT_WEIGHT` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`NAVIGATION_DIM_OPACITY`](../navigation/motionTokens.d.ts) | Provides `NAVIGATION_DIM_OPACITY` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`NAVIGATION_DIRECTION_LOCK_PX`](../navigation/motionTokens.d.ts) | Provides `NAVIGATION_DIRECTION_LOCK_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`NAVIGATION_DURATION_MS`](../navigation/motionTokens.d.ts) | Provides `NAVIGATION_DURATION_MS` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`NAVIGATION_EASING`](../navigation/motionTokens.d.ts) | Provides `NAVIGATION_EASING` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`NAVIGATION_EDGE_SHADOW_OPACITY`](../navigation/motionTokens.d.ts) | Provides `NAVIGATION_EDGE_SHADOW_OPACITY` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`NAVIGATION_EDGE_SHADOW_WIDTH_PX`](../navigation/motionTokens.d.ts) | Provides `NAVIGATION_EDGE_SHADOW_WIDTH_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`NAVIGATION_HORIZONTAL_INTENT_PX`](../navigation/motionTokens.d.ts) | Provides `NAVIGATION_HORIZONTAL_INTENT_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`NAVIGATION_PARALLAX_FRACTION`](../navigation/motionTokens.d.ts) | Provides `NAVIGATION_PARALLAX_FRACTION` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`NAVIGATION_POSITION_THRESHOLD`](../navigation/motionTokens.d.ts) | Provides `NAVIGATION_POSITION_THRESHOLD` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`NAVIGATION_PREVIOUS_SEGMENT_WEIGHT`](../navigation/releaseVelocity.d.ts) | Provides `NAVIGATION_PREVIOUS_SEGMENT_WEIGHT` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`NAVIGATION_RELEASE_SAMPLE_RATE_HZ`](../navigation/releaseTrajectory.d.ts) | Provides `NAVIGATION_RELEASE_SAMPLE_RATE_HZ` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`NAVIGATION_RELEASE_SPRING_DAMPING`](../navigation/releaseTrajectory.d.ts) | Provides `NAVIGATION_RELEASE_SPRING_DAMPING` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`NAVIGATION_RELEASE_SPRING_MASS`](../navigation/releaseTrajectory.d.ts) | Provides `NAVIGATION_RELEASE_SPRING_MASS` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`NAVIGATION_RELEASE_SPRING_STIFFNESS`](../navigation/releaseTrajectory.d.ts) | Provides `NAVIGATION_RELEASE_SPRING_STIFFNESS` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`NAVIGATION_VELOCITY_THRESHOLD_PX_PER_SECOND`](../navigation/motionTokens.d.ts) | Provides `NAVIGATION_VELOCITY_THRESHOLD_PX_PER_SECOND` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`NavigationBackButtonBehavior`](../navigation/types.d.ts) | Defines the `NavigationBackButtonBehavior` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`NavigationBarDefinition`](../navigation/types.d.ts) | Defines the `NavigationBarDefinition` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`navigationMotionTokens`](../navigation/motionTokens.d.ts) | Provides `navigationMotionTokens` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`NavigationReleaseSample`](../navigation/releaseTrajectory.d.ts) | Defines the `NavigationReleaseSample` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`NavigationReleaseTrajectory`](../navigation/releaseTrajectory.d.ts) | Defines the `NavigationReleaseTrajectory` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`NavigationRow`](../list-form/ListForm.d.ts) | Provides `NavigationRow` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`NavigatorActions`](../navigation/store.d.ts) | Defines the `NavigatorActions` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`NavigatorHost`](../navigation/NavigatorHost.d.ts) | Provides `NavigatorHost` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`NavigatorHostProps`](../navigation/NavigatorHost.d.ts) | Defines the props accepted by `NavigatorHost`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`NavigatorState`](../navigation/types.d.ts) | Defines the `NavigatorState` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`NavigatorStore`](../navigation/store.d.ts) | Defines the `NavigatorStore` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`newId`](../data/database.d.ts) | A new unique record id that sorts by creation time. | Package integration API. It does not add a separately supported app control. |  |
| [`normalizeNavigationReleaseVelocity`](../navigation/releaseTrajectory.d.ts) | UIKit's convention: axis velocity divided by signed distance to target. | Package integration API. It does not add a separately supported app control. |  |
| [`OfflinePresentation`](../reachability/react.d.ts) | Provides `OfflinePresentation` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`OfflinePresentationProps`](../reachability/react.d.ts) | Defines the props accepted by `OfflinePresentation`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`PALETTES`](../glass/lens/theme.d.ts) | Provides `PALETTES` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`PickerOptions`](../list-form/ListForm.d.ts) | Provides `PickerOptions` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`PickerRow`](../list-form/ListForm.d.ts) | Provides `PickerRow` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`PickerRowProps`](../list-form/ListForm.d.ts) | Defines the props accepted by `PickerRow`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`popStack`](../navigation/stack.d.ts) | Provides `popStack` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`popToRootStack`](../navigation/stack.d.ts) | Provides `popToRootStack` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`prepareGlassBitmapBackdrop`](../glass/lens/bitmapBackdrop.d.ts) | Provides `prepareGlassBitmapBackdrop` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`prepareSceneRoutes`](../restoration/routes.d.ts) | Call before mount. Explicit launch intent wins over the checkpoint. | Package integration API. It does not add a separately supported app control. |  |
| [`PresentationDetent`](../presentation/model.d.ts) | `PresentationDetent`: a sheet's supported resting height. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`PresentationKind`](../navigation/types.d.ts) | Defines the `PresentationKind` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`PresentationProps`](../presentation/Presentation.d.ts) | The presentation binding, accessible title and dismissal callback shared by presentations. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`Pressable`](../press/Pressable.d.ts) | Provides `Pressable` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`PRESSABLE_PRESS_IN_DURATION_MS`](../press/tokens.d.ts) | Provides `PRESSABLE_PRESS_IN_DURATION_MS` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`PRESSABLE_PRESSED_OPACITY`](../press/tokens.d.ts) | Provides `PRESSABLE_PRESSED_OPACITY` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`PRESSABLE_RELEASE_DURATION_MS`](../press/tokens.d.ts) | Provides `PRESSABLE_RELEASE_DURATION_MS` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`PRESSABLE_RELEASE_EASING`](../press/tokens.d.ts) | Provides `PRESSABLE_RELEASE_EASING` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`PRESSABLE_RETENTION_OFFSET_PX`](../press/tokens.d.ts) | Provides `PRESSABLE_RETENTION_OFFSET_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`PressableProps`](../press/Pressable.d.ts) | Defines the props accepted by `Pressable`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`pressableTokens`](../press/tokens.d.ts) | Provides `pressableTokens` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`PressState`](../press/stateMachine.d.ts) | Whether a press is idle, held or cancelled. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`previousTrace`](../glass/lens/trace.d.ts) | Provides `previousTrace` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`PushNotifications`](../push/notifications.d.ts) | Defines the `PushNotifications` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`PushNotificationsLifecycle`](../push/PushPermissionExplainer.d.ts) | Mount at the app root so renewals reconcile even when Settings is not visible. | Package integration API. It does not add a separately supported app control. |  |
| [`PushNotificationState`](../push/notifications.d.ts) | Defines the `PushNotificationState` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`PushPermissionExplainer`](../push/PushPermissionExplainer.d.ts) | Provides `PushPermissionExplainer` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`PushRelayTokenField`](../push/PushPermissionExplainer.d.ts) | A runtime user credential, never a build-time VITE secret. Keep its value in memory. | Package integration API. It does not add a separately supported app control. |  |
| [`PushRoute`](../push/routes.d.ts) | Shared, validated route codec. No navigation or browser history side effects. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`PushRouteRules`](../push/routes.d.ts) | Defines the `PushRouteRules` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`PushServerAdapter`](../push/notifications.d.ts) | Defines the `PushServerAdapter` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`pushStack`](../navigation/stack.d.ts) | Provides `pushStack` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`PushSubscriptionPayload`](../push/notifications.d.ts) | Defines the `PushSubscriptionPayload` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`Query`](../data/database.d.ts) | An immutable query over a collection: `index`, `keyRange`, `reverse`, `limit` and `filter` each return a new query. `useQuery` hands one to its configure callback. | Package integration API. It does not add a separately supported app control. |  |
| [`readAppearanceDiagnostics`](../app/appearance.d.ts) | Provides `readAppearanceDiagnostics` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`readDisplayCornerMetrics`](../safe-area/displayCorners.d.ts) | Framework token for the screen containing this app. Display Zoom and unknown models fall back to zero. | Package integration API. It does not add a separately supported app control. |  |
| [`readInstallationFailure`](../app/installationFailure.d.ts) | Reads the recorded installation failure for acceptance fixtures. | Package integration API. It does not add a separately supported app control. |  |
| [`readSafeAreaMetrics`](../safe-area/useSafeAreaMetrics.d.ts) | Provides `readSafeAreaMetrics` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`readSceneValue`](../restoration/scene.d.ts) | Provides `readSceneValue` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`REFERENCE_CONTENT_HEIGHT_PX`](../glass/lens/referenceBackground.d.ts) | Provides `REFERENCE_CONTENT_HEIGHT_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`ReferenceBackgroundMode`](../glass/lens/referenceBackground.d.ts) | Defines the `ReferenceBackgroundMode` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ReferenceBackgroundScene`](../glass/lens/Scene.d.ts) | Provides `ReferenceBackgroundScene` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`registerAppShell`](../sw/registerAppShell.d.ts) | Provides `registerAppShell` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`RegisterAppShellOptions`](../sw/registerAppShell.d.ts) | Defines the `RegisterAppShellOptions` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`registerGlassBitmapBackdrop`](../glass/lens/bitmapBackdrop.d.ts) | Provides `registerGlassBitmapBackdrop` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`RegistryScreenEntry`](../navigation/store.d.ts) | Defines the `RegistryScreenEntry` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`REGULAR_TRIGGER_MATERIAL`](../glass/regularTriggerMaterial.d.ts) | Provides `REGULAR_TRIGGER_MATERIAL` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`REGULAR_TRIGGER_MATERIAL_GLSL`](../glass/regularTriggerMaterial.d.ts) | Provides `REGULAR_TRIGGER_MATERIAL_GLSL` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`REGULAR_TRIGGER_RIM_CURVES`](../glass/regularTriggerRim.d.ts) | Provides `REGULAR_TRIGGER_RIM_CURVES` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`RegularMaterialContext`](../glass/regularMaterialContext.d.ts) | A retained source-image index. No DOM reads, GPU readbacks or canvas writes occur when an aperture moves. Disc rows are clipped and renormalized against the visible window, not extended by repeating the boundary pixel. | Package integration API. It does not add a separately supported app control. |  |
| [`regularTriggerRegime`](../glass/regularTriggerMaterial.d.ts) | Provides `regularTriggerRegime` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`regularTriggerRimResponse`](../glass/regularTriggerRim.d.ts) | Provides `regularTriggerRimResponse` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`releaseWarmedAppImages`](../app/warmImage.d.ts) | Release URLs when the app document closes, or explicitly when its image set changes. | Package integration API. It does not add a separately supported app control. |  |
| [`replaceStack`](../navigation/stack.d.ts) | Provides `replaceStack` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`reportGlassError`](../glass/errors.d.ts) | Provides `reportGlassError` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`requestPersistentStorage`](../data/database.d.ts) | Asks WebKit not to evict the app's data under storage pressure; true when granted. | Package integration API. It does not add a separately supported app control. |  |
| [`resolveDisplayCornerMetrics`](../safe-area/displayCorners.d.ts) | Resolution is not a model identifier. Unknown and asymmetric displays use the scalar fallback. | Package integration API. It does not add a separately supported app control. |  |
| [`ReturningMenuTrigger`](../glass/renderSpecs.d.ts) | Defines the `ReturningMenuTrigger` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`RouteSchema`](../navigation/routeCodec.d.ts) | Defines the `RouteSchema` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`Row`](../list-form/ListForm.d.ts) | Provides `Row` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`RowActions`](../actions/RowActions.d.ts) | A row's swipe actions and context menu. Inside an editable `List` item, the item owns the row's one gesture host (it adds swipe-to-delete), so the row hands its actions to the item instead of hosting a second recognizer. Swipe actions are unavailable while the list is editing, as in selection; the context menu stays. | Package integration API. It does not add a separately supported app control. |  |
| [`RowActionsProps`](../actions/types.d.ts) | Row swipe actions and context-menu commands. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`RowIcon`](../list-form/ListForm.d.ts) | A Settings-style icon: a white symbol on a rounded colour tile, for a row's leading edge. | Package integration API. It does not add a separately supported app control. |  |
| [`RowIconProps`](../list-form/ListForm.d.ts) | The symbol and its tile colour: a system colour name or any CSS colour. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`RowProps`](../list-form/ListForm.d.ts) | Defines the props accepted by `Row`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`runScriptedDrag`](../glass/lens/motion.d.ts) | Provides `runScriptedDrag` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`runScriptedScroll`](../glass/lens/motion.d.ts) | Provides `runScriptedScroll` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`RuntimeElements`](../glass/renderSpecs.d.ts) | Defines the `RuntimeElements` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`RuntimeGeometry`](../glass/renderSpecs.d.ts) | Defines the `RuntimeGeometry` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`RuntimeOptions`](../glass/renderSpecs.d.ts) | Defines the `RuntimeOptions` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`RuntimeSnapshot`](../glass/renderSpecs.d.ts) | Probe telemetry shape. The WebGPU runtime does not emit snapshots; GlassPresentation's probe panel still types against it. Fields typed by removed WebGL classes are `unknown`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`SafeAreaMetrics`](../safe-area/useSafeAreaMetrics.d.ts) | The full safe-area and viewport geometry Satin works from, including the diagnostic coordinate spaces installed-app fixtures compare. Apps want only `insets`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`SampledMotion`](../menu/sampledMotion.d.ts) | A document-timeline animation, submitted once per input or state transition. Sampling density controls interpolation error, not the display refresh rate. Keep accelerated properties in separate effects from paint-bound properties. | Package integration API. It does not add a separately supported app control. |  |
| [`sampleLiquidShape`](../glass/lens/liquidMotion.d.ts) | Provides `sampleLiquidShape` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`sampleMenuCadence`](../glass/lens/menuMotion.d.ts) | Provides `sampleMenuCadence` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`sampleMenuMotion`](../glass/lens/menuMotion.d.ts) | Provides `sampleMenuMotion` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`sampleNavigationCurve`](../navigation/motionTokens.d.ts) | Provides `sampleNavigationCurve` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`SatinAppShellRegistration`](../sw/registerAppShell.d.ts) | Defines the `SatinAppShellRegistration` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`SatinRoot`](../root/SatinRoot.d.ts) | Provides `SatinRoot` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`SatinRootProps`](../root/SatinRoot.d.ts) | Defines the props accepted by `SatinRoot`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`SatinRuntime`](../root/runtimeContext.d.ts) | Defines the `SatinRuntime` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`Scenario`](../glass/renderSpecs.d.ts) | Defines the `Scenario` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ScenarioMetrics`](../glass/renderSpecs.d.ts) | Defines the `ScenarioMetrics` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`SCENE_STYLE`](../glass/lens/Scene.d.ts) | Provides `SCENE_STYLE` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`SceneRestoration`](../restoration/scene.d.ts) | Defines the `SceneRestoration` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ScreenContainer`](../navigation/ScreenContainer.d.ts) | Provides `ScreenContainer` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`ScreenContainerProps`](../navigation/ScreenContainer.d.ts) | Defines the props accepted by `ScreenContainer`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ScreenDefinition`](../navigation/types.d.ts) | Defines the `ScreenDefinition` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ScreenEntry`](../navigation/types.d.ts) | Defines the `ScreenEntry` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ScreenId`](../navigation/store.d.ts) | Defines the `ScreenId` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ScreenLifecycle`](../navigation/types.d.ts) | The lifecycle state of a retained navigation entry. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ScreenLifecycleCallbacks`](../navigation/types.d.ts) | Callbacks for a retained navigation entry appearing, being covered or disappearing. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ScreenParams`](../navigation/store.d.ts) | Defines the `ScreenParams` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ScreenRegistry`](../navigation/registry.d.ts) | Defines the `ScreenRegistry` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`scriptedDragFrames`](../glass/lens/motion.d.ts) | Provides `scriptedDragFrames` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`scriptedDragProgress`](../glass/lens/motion.d.ts) | Provides `scriptedDragProgress` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`ScriptedMotionMode`](../glass/lens/motion.d.ts) | Defines the `ScriptedMotionMode` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ScriptedScrollMode`](../glass/lens/motion.d.ts) | Defines the `ScriptedScrollMode` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`scriptedScrollOffset`](../glass/lens/motion.d.ts) | Provides `scriptedScrollOffset` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`ScrollAxis`](../scroll/types.d.ts) | The axis along which a scroll surface accepts scrolling. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ScrollDismissesKeyboardMode`](../keyboard/adapter.d.ts) | - `immediately`: a drag on the surface ends editing. - `interactively`: scrolling keeps the keyboard; a drag that reaches the keyboard ends editing. Native tracks the keyboard under the finger from there; WebKit's keyboard cannot follow a finger, so it leaves on its own curve (the bottom inset chain follows it). | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ScrollOffset`](../scroll/types.d.ts) | The scroll position in points along the physical x and y axes. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ScrollSnapshot`](../scroll/types.d.ts) | Defines the `ScrollSnapshot` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ScrollSurface`](../scroll/ScrollSurface.d.ts) | Provides `ScrollSurface` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`ScrollSurfaceHandle`](../scroll/ScrollSurface.d.ts) | Imperative scroll positioning for a named scroll view. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ScrollSurfaceProps`](../scroll/ScrollSurface.d.ts) | A scroll view's content, scroll binding and keyboard dismissal policy. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ScrollToTopOptions`](../scroll/types.d.ts) | Options for restoring a named scroll surface to its top. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`Section`](../list-form/ListForm.d.ts) | `Section`: a group of rows in a `List` or `Form`, with an optional header and footer. | Package integration API. It does not add a separately supported app control. |  |
| [`SectionProps`](../list-form/ListForm.d.ts) | A section's rows and its optional header and footer. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`SecureField`](../text-input/TextField.d.ts) | Provides `SecureField` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`SecureFieldProps`](../text-input/TextField.d.ts) | Defines the props accepted by `SecureField`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`SegmentedControl`](../list-form/ListForm.d.ts) | Provides `SegmentedControl` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`Selectable`](../root/SatinRoot.d.ts) | `textSelection(.enabled)`: restores text selection and system callouts for user-authored content, which app chrome otherwise suppresses. | Package integration API. It does not add a separately supported app control. |  |
| [`SelectableProps`](../root/SatinRoot.d.ts) | A content-role wrapper's children and plain div attributes. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`SerializedRoute`](../navigation/routeCodec.d.ts) | Defines the `SerializedRoute` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`setAppBadge`](../push/notifications.d.ts) | Provides `setAppBadge` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`SETTINGS_BACK_BUTTON_INLINE_INSET_PX`](../settings/tokens.d.ts) | Provides `SETTINGS_BACK_BUTTON_INLINE_INSET_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`SETTINGS_BACK_BUTTON_SIZE_PX`](../settings/tokens.d.ts) | Provides `SETTINGS_BACK_BUTTON_SIZE_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`SETTINGS_DETAIL_CONTENT_TOP_OFFSET_PX`](../settings/tokens.d.ts) | Provides `SETTINGS_DETAIL_CONTENT_TOP_OFFSET_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`SETTINGS_DETAIL_INLINE_INSET_PX`](../settings/tokens.d.ts) | Provides `SETTINGS_DETAIL_INLINE_INSET_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`SETTINGS_DETAIL_ROW_HEIGHT_PX`](../settings/tokens.d.ts) | Provides `SETTINGS_DETAIL_ROW_HEIGHT_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`SETTINGS_DISCLOSURE_DARK_COLOR`](../settings/tokens.d.ts) | Provides `SETTINGS_DISCLOSURE_DARK_COLOR` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`SETTINGS_DISCLOSURE_HEIGHT_PX`](../settings/tokens.d.ts) | Provides `SETTINGS_DISCLOSURE_HEIGHT_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`SETTINGS_DISCLOSURE_LIGHT_COLOR`](../settings/tokens.d.ts) | Provides `SETTINGS_DISCLOSURE_LIGHT_COLOR` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`SETTINGS_DISCLOSURE_OFFSET_X_PX`](../settings/tokens.d.ts) | Provides `SETTINGS_DISCLOSURE_OFFSET_X_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`SETTINGS_DISCLOSURE_OFFSET_Y_PX`](../settings/tokens.d.ts) | Provides `SETTINGS_DISCLOSURE_OFFSET_Y_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`SETTINGS_DISCLOSURE_WIDTH_PX`](../settings/tokens.d.ts) | Provides `SETTINGS_DISCLOSURE_WIDTH_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`SETTINGS_GROUP_CORNER_RADIUS_PX`](../settings/tokens.d.ts) | Provides `SETTINGS_GROUP_CORNER_RADIUS_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`SETTINGS_GROUP_SPACING_PX`](../settings/tokens.d.ts) | Provides `SETTINGS_GROUP_SPACING_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`SETTINGS_LARGE_TITLE_FONT_SIZE_PX`](../settings/tokens.d.ts) | Provides `SETTINGS_LARGE_TITLE_FONT_SIZE_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`SETTINGS_LARGE_TITLE_LINE_HEIGHT_PX`](../settings/tokens.d.ts) | Provides `SETTINGS_LARGE_TITLE_LINE_HEIGHT_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`SETTINGS_NAVIGATION_BAR_HEIGHT_PX`](../settings/tokens.d.ts) | Provides `SETTINGS_NAVIGATION_BAR_HEIGHT_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`SETTINGS_ROOT_INLINE_INSET_PX`](../settings/tokens.d.ts) | Provides `SETTINGS_ROOT_INLINE_INSET_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`SETTINGS_ROOT_LARGE_TITLE_TOP_OFFSET_PX`](../settings/tokens.d.ts) | Provides `SETTINGS_ROOT_LARGE_TITLE_TOP_OFFSET_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`SETTINGS_ROOT_PRO_MAX_INLINE_INSET_PX`](../settings/tokens.d.ts) | Provides `SETTINGS_ROOT_PRO_MAX_INLINE_INSET_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`SETTINGS_ROOT_ROW_HEIGHT_PX`](../settings/tokens.d.ts) | Provides `SETTINGS_ROOT_ROW_HEIGHT_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`SETTINGS_ROW_ICON_CORNER_RADIUS_PX`](../settings/tokens.d.ts) | Provides `SETTINGS_ROW_ICON_CORNER_RADIUS_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`SETTINGS_ROW_ICON_SIZE_PX`](../settings/tokens.d.ts) | Provides `SETTINGS_ROW_ICON_SIZE_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`SETTINGS_ROW_TRAILING_INSET_PX`](../settings/tokens.d.ts) | Provides `SETTINGS_ROW_TRAILING_INSET_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`SETTINGS_SEPARATOR_HAIRLINE_PX`](../settings/tokens.d.ts) | Provides `SETTINGS_SEPARATOR_HAIRLINE_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`SETTINGS_SEPARATOR_LEADING_INSET_PX`](../settings/tokens.d.ts) | Provides `SETTINGS_SEPARATOR_LEADING_INSET_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`SETTINGS_SEPARATOR_OFFSET_Y_PX`](../settings/tokens.d.ts) | Provides `SETTINGS_SEPARATOR_OFFSET_Y_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`SETTINGS_SEPARATOR_TRAILING_INSET_PX`](../settings/tokens.d.ts) | Provides `SETTINGS_SEPARATOR_TRAILING_INSET_PX` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`settingsChromeTokens`](../settings/tokens.d.ts) | Provides `settingsChromeTokens` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`SettingsDomScene`](../glass/lens/Scene.d.ts) | Provides `SettingsDomScene` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`SettingsPalette`](../glass/lens/theme.d.ts) | Defines the `SettingsPalette` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`settingsRootInlineInset`](../settings/tokens.d.ts) | Provides `settingsRootInlineInset` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`Sheet`](../presentation/Presentation.d.ts) | Provides `Sheet` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. | sheet; modal presentation |
| [`SheetProps`](../presentation/Presentation.d.ts) | Defines the props accepted by `Sheet`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`shouldCompleteInteractivePop`](../navigation/motionTokens.d.ts) | Provides `shouldCompleteInteractivePop` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`Sidebar`](../navigation/Sidebar.d.ts) | Ordered sidebar destinations, sharing NavigatorHost's canonical detail selection. | Package integration API. It does not add a separately supported app control. |  |
| [`SidebarEntry`](../navigation/Sidebar.d.ts) | Defines the `SidebarEntry` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`SidebarProps`](../navigation/Sidebar.d.ts) | Defines the props accepted by `Sidebar`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`SidebarSymbol`](../navigation/SidebarSymbol.d.ts) | Framework7 Icons (MIT), through the shared SymbolImage renderer. | Package integration API. It does not add a separately supported app control. |  |
| [`sidebarTokens`](../settings/tokens.d.ts) | Provides `sidebarTokens` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`SplitSelection`](../navigation/splitContext.d.ts) | Defines the `SplitSelection` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`springStep`](../glass/lens/liquidMotion.d.ts) | Provides `springStep` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`stableTabSelection`](../glass/lens/tabSelectionMaterial.d.ts) | Provides `stableTabSelection` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`StateSchema`](../restoration/scene.d.ts) | Small UI checkpoints, read before mount and written in quiet tasks. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`StepperProps`](../list-form/ListForm.d.ts) | Defines the props accepted by `Stepper`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`StepperRow`](../list-form/ListForm.d.ts) | Provides `StepperRow` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`STRIPE_BACKGROUND_MODES`](../glass/lens/referenceBackground.d.ts) | Provides `STRIPE_BACKGROUND_MODES` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`SubmitLabel`](../text-input/kinds.d.ts) | `SubmitLabel`: the return key's title. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`subscribeGlassErrors`](../glass/errors.d.ts) | Provides `subscribeGlassErrors` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`summarize`](../glass/worker/experiment.d.ts) | Provides `summarize` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`SurfaceId`](../glass/renderSpecs.d.ts) | Defines the `SurfaceId` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`SurfaceRenderSpec`](../glass/renderSpecs.d.ts) | Defines the `SurfaceRenderSpec` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`SurfaceShape`](../glass/renderSpecs.d.ts) | Defines the `SurfaceShape` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`SwipeActions`](../actions/types.d.ts) | `swipeActions`: one or more edge configurations for a row. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`SwipeActionsConfiguration`](../actions/types.d.ts) | Swipe actions on one row edge. Full swipe is enabled unless explicitly disabled. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`Tab`](../tabs/TabView.d.ts) | Declaration consumed by TabView. Each tab owns its content and navigator. | Package integration API. It does not add a separately supported app control. |  |
| [`TAB_BAR_BLUR_SIGMA`](../glass/lens/tabSelectionMaterial.d.ts) | Provides `TAB_BAR_BLUR_SIGMA` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`TAB_BAR_LOCAL_CENTRES`](../glass/lens/tabSelectionMaterial.d.ts) | Provides `TAB_BAR_LOCAL_CENTRES` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`TAB_ICON_SVG`](../glass/lens/icons.d.ts) | Provides `TAB_ICON_SVG` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`TAB_SELECTION_HEIGHT`](../glass/lens/tabSelectionMaterial.d.ts) | Provides `TAB_SELECTION_HEIGHT` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`TAB_SELECTION_WIDTH`](../glass/lens/tabSelectionMaterial.d.ts) | Provides `TAB_SELECTION_WIDTH` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`TabBar`](../glass/TabBar.d.ts) | Provides `TabBar` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`TabBarItem`](../glass/TabBar.d.ts) | Defines the `TabBarItem` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`TabBarProps`](../glass/TabBar.d.ts) | Defines the props accepted by `TabBar`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`tabGlyphStyle`](../glass/lens/tabGlyphColours.d.ts) | Provides `tabGlyphStyle` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`tabPresentation`](../glass/lens/tabPresentation.d.ts) | Backdrops change what is behind the tabs, not whether the tabs exist. Explicit optical probes can still request bare glass. The separate drag and liquid specimens retain their original presentation. | Package integration API. It does not add a separately supported app control. |  |
| [`tabProbeOverride`](../glass/lens/tabPresentation.d.ts) | Provides `tabProbeOverride` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`TabProps`](../tabs/TabView.d.ts) | Defines the props accepted by `Tab`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`tabSelectionCapsule`](../glass/lens/tabSelectionMaterial.d.ts) | Provides `tabSelectionCapsule` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`TabSelectionShape`](../glass/renderSpecs.d.ts) | Defines the `TabSelectionShape` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`TabView`](../tabs/TabView.d.ts) | Lazy, retained tabs. Hidden app effects remain app-owned; Satin work pauses. | Package integration API. It does not add a separately supported app control. |  |
| [`TabViewProps`](../tabs/TabView.d.ts) | Defines the props accepted by `TabView`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`TextEditor`](../text-input/TextEditor.d.ts) | Provides `TextEditor` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`TextEditorProps`](../text-input/TextEditor.d.ts) | Defines the props accepted by `TextEditor`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`TextField`](../text-input/TextField.d.ts) | Provides `TextField` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`TextFieldKind`](../text-input/kinds.d.ts) | What a field holds, setting its keyboard, autofill and autocorrection together. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`TextFieldProps`](../text-input/TextField.d.ts) | Defines the props accepted by `TextField`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`TINT_BACKGROUND_MODES`](../glass/lens/referenceBackground.d.ts) | Provides `TINT_BACKGROUND_MODES` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`TintBackgroundMode`](../glass/lens/referenceBackground.d.ts) | Defines the `TintBackgroundMode` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`TitleDisplayMode`](../navigation/types.d.ts) | `toolbarTitleDisplayMode`; `inlineLarge` draws the large title inside the bar row. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`Toggle`](../list-form/Toggle.d.ts) | Provides `Toggle` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`ToggleProps`](../list-form/Toggle.d.ts) | Defines the props accepted by `Toggle`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`ToggleRow`](../list-form/Toggle.d.ts) | Provides `ToggleRow` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`ToolbarGroup`](../glass/GlassEffect.d.ts) | A toolbar group is one glass button: pressing any item lifts the whole group (native). | Package integration API. It does not add a separately supported app control. |  |
| [`ToolbarSpacer`](../glass/GlassEffect.d.ts) | Provides `ToolbarSpacer` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`trace`](../glass/lens/trace.d.ts) | Provides `trace` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`TransactionCollection`](../data/database.d.ts) | A collection as seen inside `db.transaction`: its writes commit together or not at all. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`TransitionBinding`](../navigation/types.d.ts) | Defines the `TransitionBinding` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`TransitionCompletion`](../navigation/types.d.ts) | Defines the `TransitionCompletion` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`TransitionController`](../navigation/types.d.ts) | Defines the `TransitionController` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`TransitionControllerContext`](../navigation/types.d.ts) | Defines the `TransitionControllerContext` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`TransitionControllerFactory`](../navigation/types.d.ts) | Defines the `TransitionControllerFactory` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`TransitionOperation`](../navigation/types.d.ts) | Defines the `TransitionOperation` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`TransitionPhase`](../navigation/types.d.ts) | The progress phase of a navigation transition. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`TypedRoute`](../navigation/routeCodec.d.ts) | Defines the `TypedRoute` type in `@satinhq/kit/internal`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`useFocusChain`](../text-input/focusChain.d.ts) | `@FocusState` for a form: the return key moves to the next field in `order` and the last one dismisses the keyboard. Spread `field(key)` onto each field. | Package integration API. It does not add a separately supported app control. |  |
| [`useGlassMaterialDiagnostics`](../glass/context.d.ts) | Provides `useGlassMaterialDiagnostics` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`useKeyboardMetrics`](../keyboard/adapter.d.ts) | The software keyboard's live geometry. Most apps never need it: Satin keeps focused fields, bottom insets and bars above the keyboard. | Package integration API. It does not add a separately supported app control. |  |
| [`useLayoutClass`](../root/runtimeContext.d.ts) | Classes follow the layout viewport; keyboard occlusion and zoom do not select panes. | Package integration API. It does not add a separately supported app control. |  |
| [`useNavigator`](../navigation/navigationContext.d.ts) | Provides `useNavigator` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`useNavigatorState`](../navigation/navigationContext.d.ts) | Provides `useNavigatorState` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`useParams`](../navigation/navigationContext.d.ts) | Provides `useParams` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`usePushNotifications`](../push/notifications.d.ts) | Provides `usePushNotifications` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`useQuery`](../data/database.d.ts) | SwiftData `@Query`: a collection's records as `{ data, loading, error }`, kept live. Local writes show up synchronously, before they persist. | Package integration API. It does not add a separately supported app control. |  |
| [`useReachability`](../reachability/react.d.ts) | The server status and visible offline presentation, with fetch and retry helpers. | Package integration API. It does not add a separately supported app control. |  |
| [`useRecord`](../data/database.d.ts) | One record by key, kept live; `data` is undefined while loading and when no record exists. | Package integration API. It does not add a separately supported app control. |  |
| [`useRestoredState`](../restoration/react.d.ts) | Application/scene values such as the selected tab. Declare schemas outside render. | Package integration API. It does not add a separately supported app control. |  |
| [`useSafeAreaMetrics`](../safe-area/useSafeAreaMetrics.d.ts) | Full diagnostic geometry, including visual viewport changes. | Package integration API. It does not add a separately supported app control. |  |
| [`useSatinRuntime`](../root/runtimeContext.d.ts) | Diagnostic readers receive every live coordinate space, independently of root layout. | Package integration API. It does not add a separately supported app control. |  |
| [`useSceneStorage`](../restoration/react.d.ts) | Entry-scoped state: repeated pushes of the same screen keep independent drafts. | Package integration API. It does not add a separately supported app control. | restorable screen state |
| [`useScreenLifecycle`](../navigation/navigationContext.d.ts) | `onAppear` and `onDisappear`: callbacks for a retained navigation entry's visible lifecycle. | Package integration API. It does not add a separately supported app control. |  |
| [`useSplitSelection`](../navigation/splitContext.d.ts) | Entry identity owns navigation/scroll; identity is the registry's semantic row key. | Package integration API. It does not add a separately supported app control. |  |
| [`useUnsavedChanges`](../root/runtimeContext.d.ts) | Register app-managed unsaved state while it exists. Native inputs are checked automatically. | Package integration API. It does not add a separately supported app control. |  |
| [`validatePushRoute`](../push/routes.d.ts) | Provides `validatePushRoute` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`ValueRow`](../list-form/ListForm.d.ts) | Provides `ValueRow` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`warmAppImageWhenIdle`](../app/warmImage.d.ts) | Provides `warmAppImageWhenIdle` through the `@satinhq/kit/internal` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`Zoomable`](../zoom/Zoomable.d.ts) | A bounded image/map viewport. Pinch and pan belong only to this content role. Keyboard + / - zoom about the center; 0 resets. Supply an accessible label. | Package integration API. It does not add a separately supported app control. |  |
| [`ZoomableProps`](../zoom/Zoomable.d.ts) | Zoomable's maximum scale and scale callback; Satin owns its pointer handlers. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |

## internal vite API

Module: `@satinhq/kit/internal/vite`

| Satin export | Behavior | Limits | Also known as |
| --- | --- | --- | --- |
| [`AppFixture`](../app/head.d.ts) | Defines the `AppFixture` type in `@satinhq/kit/internal/vite`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`defineApp`](../public/definition.d.ts) | Declares app identity, install metadata and capabilities once. Pass the result to `runApp` and to the `@satinhq/kit/vite` plugin. Everything not given is defaulted and the whole definition is validated, so a bad id or icon fails at build time rather than after install. | Package integration API. It does not add a separately supported app control. |  |
| [`defineAppFixture`](../app/definition.d.ts) | Provides `defineAppFixture` through the `@satinhq/kit/internal/vite` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`satinApp`](../app/vite.d.ts) | Provides `satinApp` through the `@satinhq/kit/internal/vite` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`satinAppFixtures`](../app/vite.d.ts) | Multi-install lab fixture only. Production apps use satinApp(app). | Package integration API. It does not add a separately supported app control. |  |
| [`SatinAppOptions`](../app/vite.d.ts) | Defines the `SatinAppOptions` type in `@satinhq/kit/internal/vite`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`satinAppShell`](../sw/vite.d.ts) | Provides `satinAppShell` through the `@satinhq/kit/internal/vite` module. Read its linked declaration before use. | Package integration API. It does not add a separately supported app control. |  |
| [`SatinAppShellPluginOptions`](../sw/vite.d.ts) | Defines the `SatinAppShellPluginOptions` type in `@satinhq/kit/internal/vite`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |

## server API

Module: `@satinhq/kit/server`

| Satin export | Behavior | Limits | Also known as |
| --- | --- | --- | --- |
| [`serveStaticFile`](../server.d.ts) | Node static adapter. Stream GET/HEAD with single byte ranges, no cache or compression. A fallback is used only for missing extensionless routes. Other methods are left to the caller. Root and every file must resolve inside the same real directory, including symlink targets. | Package integration API. It does not add a separately supported app control. |  |

## testing API

Module: `@satinhq/kit/testing`

| Satin export | Behavior | Limits | Also known as |
| --- | --- | --- | --- |
| [`assertNavigation`](../testing.d.ts) | App-test assertion without exposing navigation engine objects. | Package integration API. It does not add a separately supported app control. |  |
| [`sendTestNotification`](../testing.d.ts) | Explicit diagnostic action. The token is requested at call time and never persisted. | Package integration API. It does not add a separately supported app control. |  |

## unstable API

Module: `@satinhq/kit/unstable`

| Satin export | Behavior | Limits | Also known as |
| --- | --- | --- | --- |
| [`Animation`](../motion/animationValue.d.ts) | An opaque spring timing value for `withAnimation`. Use a named value or `Animation.spring`. | Experimental API; its contract may change between beta releases. |  |
| [`concentricRadius`](../safe-area/displayCorners.d.ts) | Radius for a shape inset equally from a rounded container. Insets consume, never invert, corners. | Experimental API; its contract may change between beta releases. |  |
| [`DetailList`](../navigation/DetailList.d.ts) | Regular-width grouped detail content beneath NavigatorHost's inline title. | Experimental API; its contract may change between beta releases. |  |
| [`DragGesture`](../gestures/gesture.d.ts) | Provides `DragGesture` through the `@satinhq/kit/unstable` module. Read its linked declaration before use. | Experimental API; its contract may change between beta releases. |  |
| [`DragGestureOptions`](../gestures/gesture.d.ts) | Defines the `DragGestureOptions` type in `@satinhq/kit/unstable`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`DragGestureValue`](../gestures/gesture.d.ts) | Defines the `DragGestureValue` type in `@satinhq/kit/unstable`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`Gesture`](../gestures/gesture.d.ts) | Defines the `Gesture` type in `@satinhq/kit/unstable`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`GesturePoint`](../gestures/gesture.d.ts) | Defines the `GesturePoint` type in `@satinhq/kit/unstable`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`GestureState`](../gestures/gesture.d.ts) | Defines the `GestureState` type in `@satinhq/kit/unstable`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`GestureView`](../gestures/GestureView.d.ts) | A scoped gesture region. Scroll and navigation retain their own ownership. | Experimental API; its contract may change between beta releases. |  |
| [`GestureViewProps`](../gestures/GestureView.d.ts) | Defines the props accepted by `GestureView`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`LongPressGesture`](../gestures/gesture.d.ts) | Provides `LongPressGesture` through the `@satinhq/kit/unstable` module. Read its linked declaration before use. | Experimental API; its contract may change between beta releases. |  |
| [`LongPressGestureOptions`](../gestures/gesture.d.ts) | Defines the `LongPressGestureOptions` type in `@satinhq/kit/unstable`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`MagnifyGesture`](../gestures/gesture.d.ts) | Provides `MagnifyGesture` through the `@satinhq/kit/unstable` module. Read its linked declaration before use. | Experimental API; its contract may change between beta releases. |  |
| [`MagnifyGestureOptions`](../gestures/gesture.d.ts) | Defines the `MagnifyGestureOptions` type in `@satinhq/kit/unstable`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`MagnifyGestureValue`](../gestures/gesture.d.ts) | Defines the `MagnifyGestureValue` type in `@satinhq/kit/unstable`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`MatchedGeometryEffect`](../motion/matchedGeometry.d.ts) | When a `withAnimation` change removes this view and inserts another with the same id, the new one moves from the old one's frame to its own while the two cross-fade. A view that only moves or resizes animates from where it was. A matched view with no partner fades in or out. Wrap one element that has no transform of its own. Changes made outside `withAnimation` apply at once. | Experimental API; its contract may change between beta releases. |  |
| [`MatchedGeometryEffectProps`](../motion/matchedGeometry.d.ts) | Props of `MatchedGeometryEffect`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`Sidebar`](../navigation/Sidebar.d.ts) | Ordered sidebar destinations, sharing NavigatorHost's canonical detail selection. | Experimental API; its contract may change between beta releases. |  |
| [`SidebarEntry`](../navigation/Sidebar.d.ts) | Defines the `SidebarEntry` type in `@satinhq/kit/unstable`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`SidebarProps`](../navigation/Sidebar.d.ts) | Defines the props accepted by `Sidebar`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`SidebarSymbol`](../navigation/SidebarSymbol.d.ts) | Framework7 Icons (MIT), through the shared SymbolImage renderer. | Experimental API; its contract may change between beta releases. |  |
| [`SpringOptions`](../motion/animationValue.d.ts) | Options for a spring defined by duration and bounce. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`TapGesture`](../gestures/gesture.d.ts) | Provides `TapGesture` through the `@satinhq/kit/unstable` module. Read its linked declaration before use. | Experimental API; its contract may change between beta releases. |  |
| [`TapGestureOptions`](../gestures/gesture.d.ts) | Defines the `TapGestureOptions` type in `@satinhq/kit/unstable`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`Transition`](../motion/transition.d.ts) | Immutable insertion and removal effects. Timing belongs to withAnimation. | Experimental API; its contract may change between beta releases. |  |
| [`TransitionEdge`](../motion/transition.d.ts) | The edge a view moves through, resolved against its own layout direction. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`TransitionView`](../motion/TransitionView.d.ts) | Keep this boundary mounted; change visible inside withAnimation. Removed content stays mounted and inert until its exit finishes. Initial content does not animate. | Experimental API; its contract may change between beta releases. |  |
| [`TransitionViewProps`](../motion/TransitionView.d.ts) | Defines the props accepted by `TransitionView`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |
| [`useDisplayCornerRadius`](../safe-area/displayCorners.d.ts) | Updates after rotation, window moves and DPR changes announced by a resize. | Experimental API; its contract may change between beta releases. |  |
| [`useGestureState`](../gestures/gesture.d.ts) | A React value plus a gesture-owned update/reset binding. Cancellation and release restore the initial value; no mutable proxy is exposed to application code. | Experimental API; its contract may change between beta releases. |  |
| [`useSplitSelection`](../navigation/splitContext.d.ts) | Entry identity owns navigation/scroll; identity is the registry's semantic row key. | Experimental API; its contract may change between beta releases. |  |
| [`withAnimation`](../motion/matchedGeometry.d.ts) | Applies the state changes in `update`, then animates the `MatchedGeometryEffect` views they move, insert or remove. Call it from an event handler. Keyed List rows also move to their new positions. Other views take their new layout at once. Returns the callback result and propagates errors. Only synchronous updates participate. Nested calls share the outer List transaction; per-update nested timing is not supported. | Experimental API; its contract may change between beta releases. | animated state update |

## vite API

Module: `@satinhq/kit/vite`

| Satin export | Behavior | Limits | Also known as |
| --- | --- | --- | --- |
| [`defineApp`](../public/definition.d.ts) | Declares app identity, install metadata and capabilities once. Pass the result to `runApp` and to the `@satinhq/kit/vite` plugin. Everything not given is defaulted and the whole definition is validated, so a bad id or icon fails at build time rather than after install. | Vite build integration only; this module does not render a control. |  |
| [`satinApp`](../app/vite.d.ts) | Provides `satinApp` through the `@satinhq/kit/vite` module. Read its linked declaration before use. | Vite build integration only; this module does not render a control. |  |
| [`SatinAppOptions`](../app/vite.d.ts) | Defines the `SatinAppOptions` type in `@satinhq/kit/vite`. | Compile-time contract only. The linked declaration lists its fields, unions and constraints. |  |

## Unsupported capabilities

These capabilities have no public export. The listed alternatives describe supported compositions, not additional props or controls.

| Capability | Supported alternative | Limits |
| --- | --- | --- |
| custom hit shapes | Use existing Pressable rectangular hit geometry. | Unsupported. Hit-only shapes must preserve painted content, underlying targets and gesture arbitration. |
| custom toolbar backgrounds | Existing navigation chrome retains its current background policy. | Unsupported. No toolbar background preference or material override is exposed. |
| custom container backgrounds | Navigation and Sheet retain their existing container backgrounds. | Unsupported. Navigation/sheet placement needs container ownership. WidgetKit placements are outside the installed-PWA target. |
| multiple-date selection | No multiple-date selection control is shipped. | DatePicker selects one Date. |
| collapsible disclosure groups | Keep sections visible until the framework expander is implemented. | Unsupported. No disclosure expander is exported. |
| video playback and audio route selection | Use MediaPlayer only for the supported audio queue transport. | No public video, AirPlay route-picker, fullscreen or Picture-in-Picture contract at this revision. |
| gauge indicators | ProgressView provides linear progress only. | No Gauge styles are shipped. |
| navigation subtitles and custom title sizing | Use the available Screen title and toolbar contracts. | No navigationSubtitle prop promise. Principal sizing defects require framework correction. |
| background work and scheduled local notifications | Use an authenticated server scheduler and Web Push for scheduled reminders. | Suspended WebKit cannot execute arbitrary timers or guaranteed background work. |
| additional reactive state primitives | Use React state, props and the exported framework providers and hooks. | Use the declared providers and hooks; arbitrary environment keys are unsupported. |
| arbitrary transitions and gesture modifiers | Use withAnimation with MatchedGeometryEffect, or the motion already owned by framework navigation, controls and presentations. | No generic transition, implicit animation or gesture modifier API. Framework springs must retain measured parameters. |

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
- `@satinhq/kit/internal:GLASS_LENS_BLUR_PX` (Value)
- `@satinhq/kit/internal:GLASS_LENS_CHROMATIC_ABERRATION` (Value)
- `@satinhq/kit/internal:GLASS_LENS_CURVATURE` (Value)
- `@satinhq/kit/internal:GLASS_LENS_DEPTH_PX` (Value)
- `@satinhq/kit/internal:GLASS_LENS_EDGE_EXPONENT` (Value)
- `@satinhq/kit/internal:GLASS_LENS_EDGE_HIGHLIGHT` (Value)
- `@satinhq/kit/internal:GLASS_LENS_EDGE_WIDTH_PX` (Value)
- `@satinhq/kit/internal:GLASS_LENS_GLOW` (Value)
- `@satinhq/kit/internal:GLASS_LENS_GLOW_EXPONENT` (Value)
- `@satinhq/kit/internal:GLASS_LENS_GLOW_SPREAD` (Value)
- `@satinhq/kit/internal:GLASS_LENS_SPECULAR` (Value)
- `@satinhq/kit/internal:GLASS_LENS_SPECULAR_ANGLE_DEG` (Value)
- `@satinhq/kit/internal:GLASS_LENS_SPLAY` (Value)
- `@satinhq/kit/internal:GLASS_LENS_STRENGTH` (Value)
- `@satinhq/kit/internal:GLASS_OVERSCAN_X_PX` (Value)
- `@satinhq/kit/internal:GLASS_OVERSCAN_Y_PX` (Value)
- `@satinhq/kit/internal:GLASS_REGION_LIMIT` (Value)
- `@satinhq/kit/internal:GLASS_REGION_PIXEL_LIMIT` (Value)
- `@satinhq/kit/internal:GLASS_REGULAR_BRIGHTNESS` (Value)
- `@satinhq/kit/internal:GLASS_REGULAR_SATURATION` (Value)
- `@satinhq/kit/internal:GLASS_REGULAR_TINT_ALPHA` (Value)
- `@satinhq/kit/internal:GLASS_RIM_HIGHLIGHT_ALPHA` (Value)
- `@satinhq/kit/internal:GLASS_RIM_SHADOW_ALPHA` (Value)
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

- `@satinhq/kit:9a6da9b1ea576e75a5dd991a866768a262eb56a7cdbbd3fe6108836cfb6684cf`
- `@satinhq/kit/vite:63ab5323f1fdbfe3425716de812e63889353f0a7252fdb379ddd29f0113c6c7b`
- `@satinhq/kit/install:85c36af3f6d918e999f65db362675d8982468350930a540177d3d9809c88ca01`
- `@satinhq/kit/internal:3510d0c2f211973c1612ea4e175c751ee3916e9e2201afd7555f351fb350b32d`
- `@satinhq/kit/unstable:10455e7f77ca3285b77714e673e9d7b936265a0d5bde60927f99fdbd034b2315`
- `@satinhq/kit/server:1b9db029ea048edc062313e7116510843dab71d9a5630842f778bc45736e3990`
- `@satinhq/kit/testing:cb9036de4e4b3df41671c759c0fc123b059bd412849ac0796479ead545fa8728`
- `@satinhq/kit/diagnostics:900cab5f712b8a118f361f434848f6a8508b44bc884b9dabcc4687c042d5b79d`
- `@satinhq/kit/internal/vite:a6f1c9264605c2c98fa7816f7e1bf80ad74ae5f8ca8e562b2a1e1bd083a6f502`

## Framework source fingerprint

SHA-256 of sorted TS/TSX/CSS source paths and bytes, excluding tests: 4250b3652ac13e3dbc75b457b66903680f1e77c38089e19536e8f05ff945d1e2
