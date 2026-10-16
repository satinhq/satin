# Satin API reference

Generated from public package declarations and reviewed behavior metadata. Run `pnpm --filter @satinhq/kit api:write` after building. The check rejects removed exports and stale generated output, including transitive signature changes and changes to framework TS/TSX/CSS sources. Source fingerprints require a visible reference regeneration; behavior descriptions still need human review.

This finite index covers the concepts listed below. It lists the supported contracts and known gaps. A mapping describes the available React contract; it does not certify native pixels, motion, touch, lifecycle or installed-device fidelity. Internal and experimental modules are inventoried explicitly and are not stable app APIs.

Coverage: 86 indexed API concepts; 75 mapped; 11 explicitly unavailable; 4 Satin-only extension entries. 943 named exports across 9 declaration entry points; 151 unique exports mapped to concepts; 792 exports without a reviewed API description. Type-only and tooling exports remain in that missing inventory rather than receiving invented behavior. CSS is a stylesheet, not a named declaration export.

## Mapped concepts

| API concept | Satin contract | Actual behavior | Limitations |
| --- | --- | --- | --- |
| overlay(alignment:content:) | [`Overlay`](../safe-area/Overlay.d.ts) | Layer content over a view without changing its frame. Overlay content respects the enclosing SafeAreaInset and follows the composer on its existing keyboard carrier. | Bottom composer geometry shares the existing inset store. This is the view-content overload; shape-style overlay is not implemented. |
| progressViewStyle | [`ProgressView`](../controls/ProgressView.d.ts) | Choose linear, circular or automatic through progressViewStyle. iOS circular uses the shared activity indicator even with a value; indeterminate linear draws an empty track. | Automatic preserves the value-dependent defaults. Circular progress uses the shared activity indicator; indeterminate linear progress draws an empty track. |
| GeometryReader | [`GeometryReader`](../content/layout.d.ts) | Report allocated size through a render-prop proxy; frame reads current viewport or element-relative coordinates. | CSS needs a definite proposal on scrolling axes. Native safeAreaInsets and transformed proposal semantics are unsupported. |
| ViewThatFits | [`ViewThatFits`](../content/layout.d.ts) | Select the first child whose CSS ideal size fits the constrained axes, or the last child when none fits. | Give vertical proposals a definite height. Candidates remain mounted; hidden candidates are inert and pause framework tasks and activity indicators. Arbitrary app effects remain active. Selection uses CSS ideal sizes and retains each candidate without promising native lifecycle semantics. |
| @ScaledMetric | [`useScaledMetric`](../content/scaledMetric.d.ts) | Scale a finite dimension relative to a WebKit system text style and the measured default system text size. | System font probes are shared per subscribed style and use the same font definitions as Text. largeTitle and callout use fixed-size fallbacks because WebKit lacks their system font keywords. |
| Text / VStack / HStack / ZStack / Spacer / Divider | [`Text`](../content/content.d.ts), [`VStack`](../content/content.d.ts), [`HStack`](../content/content.d.ts), [`ZStack`](../content/content.d.ts), [`Spacer`](../content/content.d.ts), [`Divider`](../content/content.d.ts) | Compose content with system text styles, semantic colors, padding and frame props. Plain React and HTML remain supported. | Default spacing and frame proposal differences are documented in content.md. No arbitrary modifier ordering. |
| LazyVStack / LazyHStack / LazyVGrid / LazyHGrid / GridItem | [`LazyVStack`](../content/content.d.ts), [`LazyHStack`](../content/content.d.ts), [`LazyVGrid`](../content/content.d.ts), [`LazyHGrid`](../content/content.d.ts), [`GridItem`](../content/content.d.ts) | Stable eager layouts propose track widths with per-track spacing and alignment. Import these layouts and their types from @satinhq/kit. Use List for long data. | Eager rendering without virtualization. Mixed adaptive tracks and Grid/GridRow are deferred. |
| task / task(id:) | [`useTask`](../tasks/useTask.d.ts) | Run cancellable appearance work; an id change or returned runner replaces the current run. Pass the AbortSignal to fetch and publish through commit. | Cancellation is cooperative. Arbitrary setters outside commit cannot be intercepted. Native lifecycle has been measured; this is foreground work, not a Web Worker or background scheduler. |
| refreshable | [`List`](../public/controls.d.ts), [`ScrollView`](../public/scroll.d.ts) | Await a refreshable action on a vertical scroll surface. | The refresh indicator holds a 60-point content inset while the action runs. Its activity animation is shared with ProgressView. |
| App / Scene | [`defineApp`](../public/definition.d.ts), [`runApp`](../public/runtime.d.ts), [`defineNavigation`](../public/structure.d.ts) | Declare install metadata and primary navigation, then mount through runApp once. | One app root and the Home Screen WebKit target. No native multi-window Scene builder. |
| preferredColorScheme | [`preferredColorScheme`](../app/appearance.d.ts), [`PreferredColorScheme`](../app/appearanceStore.d.ts), [`runApp`](../public/runtime.d.ts), [`useColorScheme`](../public/environment.d.ts) | Set the document scene to light, dark or system through the shared appearance store; runApp accepts an initial preferredColorScheme option. | System or null clears the override. Persist and reapply the choice with useAppStorage. Whole-scene scope including presentations; no per-view or independent sheet preference. |
| NavigationStack / navigationDestination | [`NavigationStack`](../public/runtime.d.ts), [`defineRoutes`](../public/routes.d.ts), [`route`](../public/routes.d.ts), [`param`](../push/schema.d.ts), [`useNavigation`](../public/runtime.d.ts), [`NavigationLink`](../public/controls.d.ts) | Declare typed destinations and use the framework in-memory navigation stack. | No browser-history router. Route parameters must satisfy the declared schema. |
| TabView / Tab | [`TabView`](../public/runtime.d.ts), [`Tab`](../public/runtime.d.ts) | Retain independent declared tab stacks and restore the selected tab. Optional Tab and TabSection children compose every declared ID once. | Only declared tab styles are supported; no desktop browser support. |
| TabSection / tabPlacement | [`TabSection`](../tabs/TabSection.d.ts) | Group declared Tab destinations under collapsible sidebar headers. tabPlacement=sidebarOnly excludes group members from floating and compact bars while retaining their stack identities. | Only explicit sidebarOnly placement is supported; automatic section representation in the top bar, tab customization and section header actions are unavailable. Section expansion is retained for this mounted TabView. With no available sidebar, a sidebar-only selection presents the first available primary tab. |
| navigationTitle / navigationBarTitleDisplayMode | [`Screen`](../public/Screen.d.ts) | Set the retained entry title and titleDisplay through Screen. An automatic untitled root omits its bar unless toolbar or back controls need it. | Only the options in ScreenProps exist. Use only the props documented in the declaration. |
| toolbar / ToolbarItem / ToolbarSpacer | [`ToolbarItem`](../public/toolbar.d.ts), [`ToolbarItemGroup`](../public/toolbar.d.ts), [`ToolbarSpacer`](../public/toolbar.d.ts) | Declare toolbar content through Screen. subtitle replaces inline subtitle content without growing the bar; largeTitle and largeSubtitle replace intrinsically sized expanded rows that scroll away. | Toolbar items use the available capsule and principal placements. Use the declared ToolbarItem props for grouping and sizing. |
| List / Form / Section | [`List`](../public/controls.d.ts), [`Form`](../public/controls.d.ts), [`Section`](../list-form/ListForm.d.ts), [`ListRow`](../list-form/ListForm.d.ts) | Own vertical scrolling, grouped or plain rows and section headers and footers. | ListRow siblings compose within one row. Use separate ListRow elements for separate rows. |
| listSectionSpacing / scrollContentBackground | [`List`](../public/controls.d.ts), [`Form`](../public/controls.d.ts), [`ListProps`](../public/controls.d.ts) | Choose default or compact section spacing, or specify a finite nonnegative gap in points. Hide the scroll surface background while retaining row fills. | Compact spacing uses inset-grouped allocations. Numeric gaps change the margin between sections while retaining header/footer allocations. visible retains style and presentation defaults; it does not force an opaque sheet. |
| listRowInsets / listRowBackground / listRowSeparator | [`ListRow`](../list-form/ListForm.d.ts) | Set per-row insets, background and separators through ListRowProps. | Framework geometry ownership still applies. No raw viewport or safe-area CSS. |
| ForEach / onDelete / onMove / moveDisabled / deleteDisabled | [`ForEach`](../list-form/editing.d.ts), [`ListRow`](../list-form/ListForm.d.ts) | Identify rows by id. onDelete adds swipe-to-delete and the edit-mode delete control; onMove adds the reorder handle and drag. Both receive offsets into the declared row sequence. | ForEach must sit directly in a List or Section. Selected-group moves, two-finger selection and VoiceOver move actions are not implemented. |
| move(fromOffsets:toOffset:) / remove(atOffsets:) | [`moving`](../list-form/offsets.d.ts), [`removing`](../list-form/offsets.d.ts) | Apply ForEach onMove and onDelete offsets to the data: moving(items, { fromOffsets, toOffset }) and removing(items, offsets) return a new array. | Non-mutating, so the result must be stored (setState); Swift mutates the array in place. |
| List(selection:) / EditButton / editMode / selectionDisabled | [`List`](../public/controls.d.ts), [`EditButton`](../public/controls.d.ts), [`useEditMode`](../list-form/editing.d.ts), [`ListRow`](../list-form/ListForm.d.ts) | Select one optional id or a Set of ids; EditButton toggles the screen edit mode, showing selection circles for a Set. | Selection identity comes from ForEach ids (no tag). Edit mode is per screen; there is no environment override binding. Plain rows outside edit mode are not keyboard-focusable for selection. |
| ScrollView / ScrollViewReader / ScrollPosition | [`ScrollView`](../public/scroll.d.ts), [`ScrollTarget`](../scroll/ScrollTarget.d.ts) | Own a named scroll region, vertical by default, and address declared targets through its handle or position binding. Standalone views own mount-local scroll state without navigation chrome or scene restoration. | Supported anchoring is in ScrollViewProps, including defaultScrollAnchor and maintainVisibleContentPosition. Only the declared scroll options are supported. |
| safeAreaInset | [`SafeAreaInset`](../safe-area/SafeAreaInset.d.ts), [`useSafeAreaInsets`](../public/environment.d.ts) | Place an accessory on any edge with SafeAreaInset; it joins the one inset chain with the bar, the tab bar, bottom bars and the keyboard. A top accessory sits below the bar (or the large title) and its root background reaches the screen top. | A top inset under a large title stays at the expanded title edge while the title collapses. On an installed iPhone the status band is a flat WebKit fill (top-edge-limitation.md). |
| safeAreaPadding | [`SafeAreaPadding`](../safe-area/modifiers.d.ts) | Grow the safe area of the content below: scroll views inset their content, Lists lay out their cards inside the padded width, other content is padded. | Bottom padding on a scroll view is a trailing spacer in its content. Nested padding adds up as chained modifiers do. |
| contentMargins | [`ContentMargins`](../safe-area/modifiers.d.ts) | Margin the content of every scroll view below; a List takes a horizontal margin as its layout margin. | placement scrollIndicators has no effect: Satin draws the indicator in the screen frame. |
| safeAreaBar | [`SafeAreaBar`](../safe-area/modifiers.d.ts) | A top or bottom safeAreaInset with no spacing and its own scroll edge blur. | The bar material is a CSS backdrop blur, not the navigation bar edge effect; it does not extend the navigation bar edge or its seam. |
| ignoresSafeArea | [`IgnoresSafeArea`](../safe-area/modifiers.d.ts), [`ScrollView`](../public/scroll.d.ts) | Wrap any view: one at the top safe edge draws from the screen top and keeps its layout slot; a primary scroll view inside runs under the bars; the keyboard region keeps a bottom SafeAreaInset above the home indicator. | Only a view that starts the screen content extends upward. The bottom edge of non-scroll content is not extended. |
| Button / buttonStyle / buttonBorderShape / controlSize / disabled | [`Button`](../public/controls.d.ts), [`Pressable`](../press/Pressable.d.ts), [`ControlStyleProvider`](../public/controlStyle.d.ts) | Use onPress and framework control styles, size and inherited disabled state. buttonBorderShape selects automatic, capsule or a fixed roundedRectangle radius through the shared material shape. | Native style names apply only to the supported styles. Circle and container-concentric button borders are not exposed; plain and List-row buttons have no painted border. Custom ButtonStyle.makeBody controls the visual content; Satin retains button interaction and accessibility. |
| Label / LabeledContent / labelStyle | [`Label`](../public/Label.d.ts), [`LabeledContent`](../public/controls.d.ts), [`RowLabel`](../public/controls.d.ts), [`RowIcon`](../list-form/ListForm.d.ts) | Compose accessible titles, symbols and values with framework row and label styles. Automatic leading List Label symbols inherit app or control tint; explicit symbol colors remain authored. | Custom labels must obey the public noninteractive label contract. |
| Toggle / toggleStyle | [`Toggle`](../public/controls.d.ts) | Edit a controlled boolean through a framework switch or supported toggle style. | This does not provide every platform ToggleStyle. |
| Picker / pickerStyle | [`Picker`](../public/controls.d.ts), [`Choice`](../list-form/ListForm.d.ts) | Select controlled options using menu, navigationLink, inline or segmented style. | Supported option values and styles come from PickerProps. |
| Stepper | [`Stepper`](../public/controls.d.ts) | Increment or decrement a controlled value within declared bounds. | Use a controlled numeric value and the declared Stepper props. |
| Slider | [`Slider`](../public/controls.d.ts) | Drag a controlled value within min...max (default 0...1), continuous or snapped to step, with optional tick marks; the held thumb lifts into the glass control lens. | No minimum/maximum value labels or custom tick content; label is accessibility-only. Only the thumb takes a drag. |
| TextField | [`TextField`](../public/controls.d.ts) | Edit controlled text with prompt, keyboard intent and automatic row placement; vertical axis uses the shared editor with lineLimit. | Plain styling uses textFieldStyle="plain". The style prop accepts inline CSS. WebKit owns the system keyboard; arbitrary native text layout is not exposed. |
| SecureField | [`SecureField`](../public/controls.d.ts) | Edit controlled password text through secure system input. | No access to system password-manager internals. |
| TextEditor | [`TextEditor`](../public/controls.d.ts) | Edit controlled multiline text with framework keyboard geometry. | Only TextEditorProps apply; no arbitrary native text-layout engine. |
| FocusState / submitLabel | [`useFocusChain`](../text-input/focusChain.d.ts) | Register and traverse named text-input focus targets with the framework focus chain. | Focus registration uses framework hooks; custom keyboard replacement is unsupported. |
| sheet / presentationDetents | [`Sheet`](../public/presentation.d.ts) | Bind sheet visibility and use supported detents and modal navigation. Supplying selection requires onSelectionChange; omitting selection keeps the detent uncontrolled. | Visibility starts closed after relaunch. Persist editor drafts separately, never presentation flags. |
| fullScreenCover / dismiss | [`FullScreenCover`](../public/presentation.d.ts), [`useDismiss`](../presentation/dismiss.d.ts) | Bind cover visibility; useDismiss pops a pushed screen or dismisses the enclosing presentation. | No interactive dismissal on covers. Visibility starts closed after relaunch. |
| alert / confirmationDialog | [`Alert`](../presentation/Presentation.d.ts), [`ConfirmationDialog`](../presentation/Presentation.d.ts) | Bind framework-owned presentations and declare shared ActionItem actions. Alert text fields use prompt with value/onChange. | Cold launch closes legacy restored flags. Destructive confirmations must start closed. |
| Menu / contextMenu / swipeActions | [`Menu`](../public/actions.d.ts), [`ContextMenu`](../actions/RowActions.d.ts), [`Action`](../actions/types.d.ts) | Use one shared action contract for menus and supported list row interactions. | Native VoiceOver Actions rotor entries are unavailable; accessible named actions exist. |
| Image / AsyncImage | [`Image`](../image/Image.d.ts), [`AsyncImage`](../image/Image.d.ts) | Render packaged or remote artwork with framework-owned geometry, placeholders and failed-content handling. AsyncImage publishes empty, success and failure phases through onPhaseChange. | Remote loading is not a native URLSession cache. The phase callback reports loading state; it does not build alternate content. No Photos library authorization API. |
| Image(systemName:) / symbolRenderingMode | [`SymbolImage`](../symbols/Symbol.d.ts), [`SymbolProvider`](../symbols/Symbol.d.ts) | Resolve a named catalogue glyph or provider glyph with supported weight, scale and rendering mode. | The bundled catalogue uses Framework7 Icons 5.0.5 (MIT) plus Satin-drawn clean-room additions, not Apple SF Symbols assets. Preserve copyright and license notices. Provider glyphs need their own provenance. Only shipped or registered names exist. |
| glassEffect / glassEffectContainer | [`Glass`](../public/glassValue.d.ts), [`GlassEffect`](../public/glass.d.ts), [`GlassEffectContainer`](../glass/GlassEffect.d.ts) | Use the shared WebGPU glass material and grouped region contract. | Low-level field/outline helpers compute geometry, not a general view modifier. Released apps use blur-and-tint fallback material for unrecoverable WebGPU failures unless strict glass is requested; development builds report the failure. |
| scenePhase | [`useScenePhase`](../public/environment.d.ts), [`useScreenLifecycle`](../navigation/navigationContext.d.ts) | Read app foreground state and retained screen lifecycle through framework hooks. | Browser execution can stop when suspended. Screen lifecycle is distinct from app foreground state. |
| SceneStorage | [`useSceneStorage`](../public/environment.d.ts) | Checkpoint an entry-scoped JSON-serializable draft; repeated pushes have independent state. Nullable transitions are supported when allowed by the TypeScript type; runtime validation checks serializability only. | Not presentation visibility. Checkpoints cannot guarantee recovery after storage eviction or every process crash. |
| AppStorage | [`useAppStorage`](../public/environment.d.ts) | Persist a small app preference across relaunches. | Origin-local WebKit storage, not UserDefaults or an iCloud key-value store. |
| colorScheme / horizontalSizeClass / verticalSizeClass | [`useColorScheme`](../public/environment.d.ts), [`useHorizontalSizeClass`](../public/environment.d.ts), [`useVerticalSizeClass`](../public/environment.d.ts), [`systemColor`](../public/colors.d.ts), [`semanticColor`](../public/colors.d.ts) | Read accepted appearance and adaptive size classes. systemColor resolves the 18 UIKit system colors; semanticColor resolves document content, fill, background, separator and tint roles, including body portals. | Values follow measured normal-contrast iOS 27 traits. Increased contrast and Display P3 are not supported. Semantic label colors and composited secondary/tertiary foreground can differ. |
| sensoryFeedback | [`SensoryButton`](../haptics/SensoryButton.d.ts) | SensoryButton selection uses browser native switch-label activation where available. | Only selection and false are accepted. Other feedback kinds are unsupported. Keyboard/assistive activation do not promise a native tick. |
| Query / model persistence | [`collection`](../data/database.d.ts), [`defineDatabase`](../data/database.d.ts), [`newId`](../data/database.d.ts), [`useQuery`](../data/database.d.ts), [`useRecord`](../data/database.d.ts), [`Query`](../data/database.d.ts), [`storageQuota`](../public/storage.d.ts) | Use the reactive local database, schema declarations and explicit durability promises. | This is IndexedDB, not SwiftData, Core Data or CloudKit. Storage may be evicted; writes can fail. |
| Audio playback state | [`MediaPlayer`](../media/types.d.ts), [`useMediaPlayer`](../media/react.d.ts) | Control an app-root media queue and its exposed playback snapshot. | Audio transport only; no VideoPlayer, AVKit or background audio entitlement. Playback depends on WebKit codec support and the server delivering compatible media with byte-range support. |
| Notification authorization / badge | [`useNotifications`](../public/environment.d.ts), [`NotificationPermissionExplainer`](../public/environment.d.ts) | Request permission from a gesture and use the supported push and badge contract. | Installed Home Screen permission is required. Local scheduled notification delivery is unavailable; use an app-owned authenticated server scheduler. |
| Unsaved editor dismissal | [`useUnsavedChanges`](../root/runtimeContext.d.ts) | Register unsaved work with the framework navigation and update guard. | This is a framework guard, not a general native interactiveDismissDisabled guarantee. |
| App update / preview tooling | [`useAppUpdate`](../public/environment.d.ts) | Read the completed update outcome after app launch readiness. defineApp advanced.updateProfile preview admits iOS Safari tabs and live updates. | Preview may reload on update. Release remains the installed production default. |
| Reachability | [`useReachability`](../reachability/react.d.ts) | Read framework network and configured server reachability. | No native Network framework path monitor or guarantee that a request will succeed. |
| Selectable content / magnification | [`Selectable`](../root/SatinRoot.d.ts), [`Zoomable`](../zoom/Zoomable.d.ts) | Declare text selection or an owned zoomable content region. | Page zoom remains disabled by the installed shell; general-purpose gesture composition is unsupported. |
| ContentUnavailableView | [`ContentUnavailableView`](../public/controls.d.ts) | Compose an unavailable-content title, symbol, optional description and actions. Required offline routes use this view. | Supports the explicit title, icon, description and actions composition; no automatic search variant. |
| NavigationSplitView | [`NavigationSplitView`](../public/runtime.d.ts) | Render the declared primary sidebar root and retained detail stack; compact width collapses to a stack. | Select an existing declared tab; modal and ad hoc root props are not supported. |
| searchable / searchScopes / searchSuggestions | [`Screen`](../public/Screen.d.ts), [`List`](../public/controls.d.ts), [`Searchable`](../search/searchable.d.ts), [`SearchScopes`](../search/searchable.d.ts), [`SearchSuggestion`](../search/searchable.d.ts), [`SearchFieldPlacement`](../search/searchable.d.ts) | Pass searchable={{ text, onChange, prompt, placement, scopes, suggestions, onSubmit }} to Screen or List. placement automatic (default) uses platform placement: on iPhone the bottom toolbar when the screen has no other bottom bar items, else the navigation bar drawer; iPad and scoped fields use the drawer. The drawer owns the field, clear and close buttons, scope bar, suggestions and collapse on scroll; the bottom field rides above the keyboard with a close button while presented. isPresented/onPresentedChange mirror isPresented:. | Bottom toolbar presentation is not animated yet and its scope bar is not drawn (scoped fields stay in the drawer). The search tab bottom field is not drawn; a declared tab role="search" is metadata. Never hand-build a search bar. |
| DefaultToolbarItem(kind: .search) | [`DefaultToolbarItem`](../public/toolbar.d.ts) | Place <DefaultToolbarItem kind="search" placement="bottomBar" /> in a Screen toolbar to put its searchable field in the bottom bar beside other bottom items (Messages: search, ToolbarSpacer, compose). | Only kind search. Without a ToolbarSpacer the neighbouring item is not merged into the search capsule as natively; iPad keeps the drawer. |
| DatePicker | [`DatePicker`](../controls/DatePicker.d.ts) | Compact (automatic) style: grey value capsules open the system date or time picker. selection is a Date, or a civil string with no time zone (YYYY-MM-DD, HH:mm, YYYY-MM-DDTHH:mm) for days that must not move across time zones. displayedComponents and in (lowerBound/upperBound, clamped like UIDatePicker). | graphical and wheel styles are unsupported. The open picker is the system UIDatePicker but WebKit adds Reset and Done buttons, centres it rather than anchoring it under the capsule, and does not grey out days outside the range (choices are clamped). See controls.md. |
| ColorPicker | [`ColorPicker`](../controls/ColorPicker.d.ts) | A row with the native colour well; tapping it opens the system colour picker (grid, spectrum, sliders, eyedropper, saved colours). supportsOpacity shows its opacity slider. selection is #RRGGBB or #RRGGBBAA. | The system picker is titled "Colors" instead of the label. Output is sRGB hex; Display P3 choices are converted to sRGB. See controls.md. |
| ProgressView | [`ProgressView`](../controls/ProgressView.d.ts) | Render labeled indeterminate activity or clamped determinate linear progress with inherited tint and accessible progress values. | Shares the activity animation used by the refresh indicator. See controls.md. |
| PhotosPicker / fileImporter | [`PhotosPicker`](../public/filePickers.d.ts), [`PhotosPickerProps`](../public/filePickers.d.ts), [`FileImporter`](../public/filePickers.d.ts), [`FileImporterProps`](../public/filePickers.d.ts) | Use the system file chooser to receive photo or document bytes. Cancel preserves accepted selection; observed owner changes reject stale delivery. | FileImporter uses React component spelling. MIME hints are not content validation. No PhotosPickerItem identity, persistent file access or exact overlapping chooser attribution. Installed acceptance remains pending. |
| scrollEdgeEffectStyle / scrollEdgeEffectHidden | [`ScrollView`](../public/scroll.d.ts), [`ScrollEdgeEffectStyle`](../scroll/edgePolicy.d.ts), [`ScrollEdgeEffectHidden`](../scroll/edgePolicy.d.ts), [`ScrollEdgeSelection`](../scroll/edgePolicy.d.ts) | Select soft/automatic top material and edge-specific visibility through ScrollView props. Boolean visibility selects the top edge. | Hard top material throws an unsupported error. The navigation engine renders only the top edge; selecting other edges creates no material. |
| toolbarMinimizationBehavior / toolbarMinimizationRestoration / toolbarMinimizationSafeAreaAdjustment | [`Screen`](../public/Screen.d.ts), [`ToolbarMinimizationBehavior`](../navigation/toolbarMinimization.d.ts), [`ToolbarMinimizationRestoration`](../navigation/toolbarMinimization.d.ts), [`ToolbarMinimizationSafeAreaAdjustment`](../navigation/toolbarMinimization.d.ts) | Opt into navigation-bar minimization on scroll down/up, reversal or atScrollEdge restoration, and automatic/enabled/disabled safe-area adjustment through Screen or route options. | Opt-in navigation-bar minimization. Use never to keep the bar expanded. |
| tabViewBottomAccessory | [`TabView`](../public/runtime.d.ts) | Render bottomAccessory content in the retained TabView bottom inset slot. TabView supplies capsule glass by default; set bottomAccessoryMaterial="custom" when the app draws its own material. | A tab can declare role="search" in defineNavigation. No minimizeBehavior or public useBottomAccessoryPlacement contract exists at this revision. The native collapse/inline morph remains incomplete. |
| ShareLink / document export | [`ShareLink`](../public/deviceActions.d.ts), [`ShareLinkProps`](../public/deviceActions.d.ts) | Share prepared text, URLs or files through the system share sheet during activation; check file sharing support before handing off. | No Transferable or file-provider integration. Completion is platform handoff, not recipient delivery; AbortError also covers no suitable target. Installed acceptance remains pending. |
| PasteButton | [`PasteButton`](../public/deviceActions.d.ts), [`PasteButtonProps`](../public/deviceActions.d.ts) | Read plain text during the user press, with browser permission UI and owner-scoped asynchronous delivery. | No clipboard preflight, arbitrary Transferable content, or reliable distinction between dismissal and denial. WebKit can require an additional Paste confirmation. Installed acceptance remains pending. |
| @Namespace | [`useNamespace`](../motion/matchedGeometry.d.ts) | Wrap one element with an id and a namespace. In a withAnimation change, a view whose id is removed and re-inserted moves from the old frame to the new one while the pair cross-fades; a matched view that moves animates from its presented frame; an unpaired one fades. Motion is transform and opacity on the compositor; the removed view stays on screen as its own decoded node until the fade ends. | Frame matching only (properties .frame, anchor .center). Corner radius scales with the frame during flight rather than remaining fixed in points. A non-source view does not follow its source outside an animation. Removed glass presenters do not travel. |
| matchedTransitionSource / navigationTransition(.zoom) | [`MatchedTransitionSource`](../public/navigationTransition.d.ts), [`NavigationTransition`](../public/navigationTransition.d.ts), [`defineNamespace`](../motion/matchedGeometry.d.ts) | Mark the view a push starts from with MatchedTransitionSource (id, namespace) and give the pushed Screen navigationTransition={NavigationTransition.zoom({ sourceID, in })}. The screen grows out of the source on push and shrinks back into it on Back, on the edge back swipe and on a downward drag (scrolled to top); the screen behind dims and recedes. Motion is fitted to an iOS 27 stock native fixture (centre and size springs, tile cross-fade, dim, corner radius, drag geometry) and runs as compositor transforms; only the corner radius is a main-thread value. defineNamespace() shares a namespace between routes. When multiple visible sources share an ID, a user activation selects that copy for both push and return; if it disappears, navigation falls back to the ordinary transition instead of choosing another copy. | Pushed screens only: FullScreenCover and Sheet zooms are not available. The source must be on screen in the covered screen, otherwise the push slides. Downward dismissal accepts initial travel within about 26.6 degrees of vertical. Zoom glass uses the projected navigation route atlas. |
| withAnimation / Animation | [`withAnimation`](../motion/matchedGeometry.d.ts), [`Animation`](../motion/animationValue.d.ts), [`SpringOptions`](../motion/animationValue.d.ts) | Stable Satin exports apply synchronous state changes from an event handler, return the callback result and propagate errors. Keyed ForEach rows in List animate reorders; experimental MatchedGeometryEffect views also participate. Animation provides opaque default, smooth, snappy, bouncy and spring({ durationMs, bounce }) values. Existing unstable imports remain compatible. | Other state and style changes do not animate. Use ForEach identities for keyed List animation. No null animation, easing curves, repeatCount, delay, completion or per-update nested timing. Use one outer synchronous update. Negative bounces are not offered. |
| Web handoff | [`Link`](../web/openURL.d.ts), [`useOpenURL`](../web/openURL.d.ts), [`WebView`](../web/WebView.d.ts), [`useWebFrame`](../web/WebView.d.ts) | Open registered app URLs through in-memory navigation, request an auxiliary web page, or embed an explicitly permissioned frame. | External browser selection is unavailable. Web dispatch is not page completion. Cross-origin or denied frames report status unverified; reload and stop require same-origin access. |
| Web authentication | [`defineWebAuthentication`](../web/authentication.d.ts), [`useWebAuthentication`](../web/useWebAuthentication.d.ts) | Prepare a durable authorization-code transaction with PKCE, dispatch popup or redirect from a gesture, and reconcile its callback on return. | Requires secure context, local storage, Web Locks, dedicated uncached callback and server exchange. Bridge reads require a private transaction proof. Token and OpenID Connect validation belong to the server. No native-session or background-completion guarantee. |

## Framework utilities

| Satin extension | Public contract | Actual behavior | Limitations |
| --- | --- | --- | --- |
| App build identity | [`useBuildInfo`](../app/buildInfo.d.ts), [`BuildInfo`](../app/buildInfo.d.ts) | Read the framework version, unique app build identifier and build time embedded in the running app bundle, including offline launches. | The app build ID is not a git revision or service-worker cache hash. Builds that bypass satinApp report unavailable metadata. Server fetch receipts are separate evidence, not proof of which cached bundle is running. |
| Satin explicit corner clips | [`cornerClipPath`](../shapes/corners.d.ts) | Return a CSS clip path for explicit width and height, with continuous or circular rounded corners, a capsule, or an ellipse. Swipe action configurations accept the same shape choices for their revealed row face. | The caller owns sizing outside framework rows. This helper does not change a glass renderer mask. Continuous path coordinates follow measured iOS 27 geometry. |
| Satin diagnostics | [`useGlassErrors`](../public/environment.d.ts) | Inspect scoped installation failures, appearance receipts and glass errors using the existing framework diagnostics. | Diagnostic receipts are not native fidelity or installed acceptance evidence. |
| Satin keyboard metrics | [`useKeyboardMetrics`](../public/keyboard.d.ts) | Read the framework keyboard adapter metrics for supported editing integration. | No native keyboard-frame API or permission to add an independent keyboard lifecycle. |

## Explicitly unavailable concepts

| API concept | Supported alternative or blocked capability | Limitations |
| --- | --- | --- |
| contentShape | Use existing Pressable rectangular hit geometry. | Unsupported. Hit-only shapes must preserve painted content, underlying targets and gesture arbitration. |
| toolbarBackground | Existing navigation chrome retains its current background policy. | Unsupported. No toolbar background preference or material override is exposed. |
| containerBackground | Navigation and Sheet retain their existing container backgrounds. | Unsupported. Navigation/sheet placement needs container ownership. WidgetKit placements are outside the installed-PWA target. |
| MultiDatePicker | No multiple-date selection control is shipped. | DatePicker selects one Date. |
| DisclosureGroup | Keep sections visible until the framework expander is implemented. | Unsupported. No disclosure expander is exported. |
| VideoPlayer / RoutePickerButton | Use MediaPlayer only for the supported audio queue transport. | No public video, AirPlay route-picker, fullscreen or Picture-in-Picture contract at this revision. |
| Gauge | ProgressView provides linear progress only. | No Gauge styles are shipped. |
| navigationSubtitle / custom principal sizing | Use the available Screen title and toolbar contracts. | No navigationSubtitle prop promise. Principal sizing defects require framework correction. |
| backgroundTask / local scheduled notifications | Use an authenticated server scheduler and Web Push for scheduled reminders. | Suspended WebKit cannot execute arbitrary timers or guaranteed background work. |
| State / Binding / Observable / Environment | Use React state, props and the exported framework providers and hooks. | Use the declared providers and hooks; arbitrary environment keys are unsupported. |
| transition / animation(_:value:) / gesture modifiers | Use withAnimation with MatchedGeometryEffect, or the motion already owned by framework navigation, controls and presentations. | No generic transition, implicit animation or gesture modifier API. Framework springs must retain measured parameters. |

See [application recipes](app-recipes.md), [local data](data.md), [geometry tokens](tokens.md) and [messaging scroll](messaging-scroll.md) for the supported compositions and restrictions.

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

## Exact public export inventory

| Module | Export | Kind | Reviewed API description |
| --- | --- | --- | --- |
| `@satinhq/kit` | [`Action`](../actions/types.d.ts) | Type | Menu / contextMenu / swipeActions |
| `@satinhq/kit` | [`ActionItem`](../actions/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`AdaptiveGridItemOptions`](../content/content.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`Alert`](../presentation/Presentation.d.ts) | Value | alert / confirmationDialog |
| `@satinhq/kit` | [`AlertProps`](../presentation/Presentation.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`AlertTextFieldProps`](../presentation/Presentation.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`Animation`](../motion/animationValue.d.ts) | Value | withAnimation / Animation |
| `@satinhq/kit` | [`AppCapability`](../app/definition.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`AppDefinition`](../app/definition.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`AppDefinitionInput`](../public/definition.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`AppIcon`](../app/definition.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`AppOrientation`](../app/definition.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`AsyncImage`](../image/Image.d.ts) | Value | Image / AsyncImage |
| `@satinhq/kit` | [`AsyncImagePhase`](../image/Image.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`AsyncImageProps`](../image/Image.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`BuildInfo`](../app/buildInfo.d.ts) | Type | App build identity |
| `@satinhq/kit` | [`BuiltInButtonStyle`](../public/controlStyle.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`BuiltInLabelStyle`](../public/controlStyle.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`BuiltInToggleStyle`](../public/controlStyle.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`Button`](../public/controls.d.ts) | Value | Button / buttonStyle / buttonBorderShape / controlSize / disabled |
| `@satinhq/kit` | [`ButtonBorderShape`](../public/buttonBorderShape.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ButtonProps`](../public/controls.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ButtonRole`](../public/controlStyle.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ButtonStyle`](../public/controlStyle.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ButtonStyleConfiguration`](../public/controlStyle.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`Choice`](../list-form/ListForm.d.ts) | Type | Picker / pickerStyle |
| `@satinhq/kit` | [`collection`](../data/database.d.ts) | Value | Query / model persistence |
| `@satinhq/kit` | [`Collection`](../data/database.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`CollectionDefinition`](../data/database.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`CollectionIndexes`](../data/database.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`CollectionSchema`](../data/database.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`CollectionUpdateMethods`](../data/database.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ColorPicker`](../controls/ColorPicker.d.ts) | Value | ColorPicker |
| `@satinhq/kit` | [`ColorPickerProps`](../controls/ColorPicker.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ColorScheme`](../public/environment.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ConfirmationDialog`](../presentation/Presentation.d.ts) | Value | alert / confirmationDialog |
| `@satinhq/kit` | [`ConfirmationDialogProps`](../presentation/Presentation.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ContentAlignment`](../content/content.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ContentFrame`](../content/content.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ContentMargins`](../safe-area/modifiers.d.ts) | Value | contentMargins |
| `@satinhq/kit` | [`ContentMarginsProps`](../safe-area/modifiers.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ContentPadding`](../content/content.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ContentProps`](../content/content.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ContentUnavailableView`](../public/controls.d.ts) | Value | ContentUnavailableView |
| `@satinhq/kit` | [`ContentUnavailableViewProps`](../public/controls.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ContextMenu`](../actions/RowActions.d.ts) | Value | Menu / contextMenu / swipeActions |
| `@satinhq/kit` | [`ContextMenuConfiguration`](../actions/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ControlConfiguration`](../public/controlStyle.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ControlSize`](../public/controlStyle.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ControlStyleProvider`](../public/controlStyle.d.ts) | Value | Button / buttonStyle / buttonBorderShape / controlSize / disabled |
| `@satinhq/kit` | [`ControlStyleValues`](../public/controlStyle.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`CoreSymbolName`](../symbols/catalogue.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`cornerClipPath`](../shapes/corners.d.ts) | Value | Satin explicit corner clips |
| `@satinhq/kit` | [`CornerShape`](../shapes/corners.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`DatabaseMigration`](../data/database.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`DatabaseRecord`](../data/database.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`DatePicker`](../controls/DatePicker.d.ts) | Value | DatePicker |
| `@satinhq/kit` | [`DatePickerComponent`](../controls/DatePicker.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`DatePickerProps`](../controls/DatePicker.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`DatePickerRange`](../controls/DatePicker.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`DatePickerStyle`](../controls/DatePicker.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`DefaultToolbarItem`](../public/toolbar.d.ts) | Value | DefaultToolbarItem(kind: .search) |
| `@satinhq/kit` | [`DefaultToolbarItemProps`](../public/toolbar.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`defineApp`](../public/definition.d.ts) | Value | App / Scene |
| `@satinhq/kit` | [`defineDatabase`](../data/database.d.ts) | Value | Query / model persistence |
| `@satinhq/kit` | [`defineNamespace`](../motion/matchedGeometry.d.ts) | Value | matchedTransitionSource / navigationTransition(.zoom) |
| `@satinhq/kit` | [`defineNavigation`](../public/structure.d.ts) | Value | App / Scene |
| `@satinhq/kit` | [`defineRoutes`](../public/routes.d.ts) | Value | NavigationStack / navigationDestination |
| `@satinhq/kit` | [`defineWebAuthentication`](../web/authentication.d.ts) | Value | Web authentication |
| `@satinhq/kit` | [`Divider`](../content/content.d.ts) | Value | Text / VStack / HStack / ZStack / Spacer / Divider |
| `@satinhq/kit` | [`Edge`](../safe-area/context.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`EdgeInsets`](../public/environment.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`EdgeLengths`](../safe-area/context.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`EdgeSet`](../safe-area/modifiers.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`EdgeSetMember`](../safe-area/modifiers.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`EditButton`](../public/controls.d.ts) | Value | List(selection:) / EditButton / editMode / selectionDisabled |
| `@satinhq/kit` | [`EditMode`](../list-form/editing.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ExportDocument`](../data/database.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`FileImporter`](../public/filePickers.d.ts) | Value | PhotosPicker / fileImporter |
| `@satinhq/kit` | [`FileImporterProps`](../public/filePickers.d.ts) | Type | PhotosPicker / fileImporter |
| `@satinhq/kit` | [`FixedGridItemOptions`](../content/content.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`FlexibleGridItemOptions`](../content/content.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`FocusChainField`](../text-input/focusChain.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`FontWeight`](../content/content.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ForEach`](../list-form/editing.d.ts) | Value | ForEach / onDelete / onMove / moveDisabled / deleteDisabled |
| `@satinhq/kit` | [`ForEachProps`](../list-form/editing.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`Form`](../public/controls.d.ts) | Value | List / Form / Section; listSectionSpacing / scrollContentBackground |
| `@satinhq/kit` | [`FormProps`](../public/controls.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`FullScreenCover`](../public/presentation.d.ts) | Value | fullScreenCover / dismiss |
| `@satinhq/kit` | [`FullScreenCoverProps`](../public/presentation.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`GeometryFrame`](../content/layout.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`GeometryProxy`](../content/layout.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`GeometryReader`](../content/layout.d.ts) | Value | GeometryReader |
| `@satinhq/kit` | [`GeometryReaderProps`](../content/layout.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`GeometrySize`](../content/layout.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`Glass`](../public/glassValue.d.ts) | Value | glassEffect / glassEffectContainer |
| `@satinhq/kit` | [`GlassEffect`](../public/glass.d.ts) | Value | glassEffect / glassEffectContainer |
| `@satinhq/kit` | [`GlassEffectContainer`](../glass/GlassEffect.d.ts) | Value | glassEffect / glassEffectContainer |
| `@satinhq/kit` | [`GlassEffectProps`](../public/glass.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`GlassError`](../glass/errors.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`GlassErrorCode`](../glass/errors.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`GlassShape`](../public/glass.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`GlassTint`](../glass/regions.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`GridItem`](../content/content.d.ts) | Value | LazyVStack / LazyHStack / LazyVGrid / LazyHGrid / GridItem |
| `@satinhq/kit` | [`GridItemOptions`](../content/content.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`GridItemValue`](../content/content.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`HorizontalTextFieldProps`](../public/controls.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`HStack`](../content/content.d.ts) | Value | Text / VStack / HStack / ZStack / Spacer / Divider |
| `@satinhq/kit` | [`HStackProps`](../content/content.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`IgnoresSafeArea`](../safe-area/modifiers.d.ts) | Value | ignoresSafeArea |
| `@satinhq/kit` | [`IgnoresSafeAreaProps`](../safe-area/modifiers.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`Image`](../image/Image.d.ts) | Value | Image / AsyncImage |
| `@satinhq/kit` | [`ImageAsset`](../image/asset.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ImageProps`](../image/Image.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`IndexesOfCollection`](../data/database.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`JustUpdated`](../app/coldLaunchUpdate.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`KeyboardGeometry`](../keyboard/geometry.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`KeyboardMetrics`](../public/keyboard.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`Label`](../public/Label.d.ts) | Value | Label / LabeledContent / labelStyle |
| `@satinhq/kit` | [`LabeledContent`](../public/controls.d.ts) | Value | Label / LabeledContent / labelStyle |
| `@satinhq/kit` | [`LabeledContentProps`](../public/controls.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`LabelProps`](../public/Label.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`LabelStyle`](../public/controlStyle.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`LabelStyleConfiguration`](../public/controlStyle.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`LaunchScreenSlot`](../app/launchScreen.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`LayoutModifierProps`](../safe-area/modifiers.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`LazyHGrid`](../content/content.d.ts) | Value | LazyVStack / LazyHStack / LazyVGrid / LazyHGrid / GridItem |
| `@satinhq/kit` | [`LazyHGridProps`](../content/content.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`LazyHStack`](../content/content.d.ts) | Value | LazyVStack / LazyHStack / LazyVGrid / LazyHGrid / GridItem |
| `@satinhq/kit` | [`LazyHStackProps`](../content/content.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`LazyVGrid`](../content/content.d.ts) | Value | LazyVStack / LazyHStack / LazyVGrid / LazyHGrid / GridItem |
| `@satinhq/kit` | [`LazyVGridProps`](../content/content.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`LazyVStack`](../content/content.d.ts) | Value | LazyVStack / LazyHStack / LazyVGrid / LazyHGrid / GridItem |
| `@satinhq/kit` | [`LazyVStackProps`](../content/content.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`LineLimit`](../public/controls.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`Link`](../web/openURL.d.ts) | Value | Web handoff |
| `@satinhq/kit` | [`LinkProps`](../web/openURL.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`List`](../public/controls.d.ts) | Value | refreshable; List / Form / Section; listSectionSpacing / scrollContentBackground; List(selection:) / EditButton / editMode / selectionDisabled; searchable / searchScopes / searchSuggestions |
| `@satinhq/kit` | [`ListItemID`](../list-form/editing.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ListProps`](../public/controls.d.ts) | Type | listSectionSpacing / scrollContentBackground |
| `@satinhq/kit` | [`ListRow`](../list-form/ListForm.d.ts) | Value | List / Form / Section; listRowInsets / listRowBackground / listRowSeparator; ForEach / onDelete / onMove / moveDisabled / deleteDisabled; List(selection:) / EditButton / editMode / selectionDisabled |
| `@satinhq/kit` | [`ListRowProps`](../list-form/ListForm.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ListSelectionProps`](../public/controls.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ListStyle`](../public/controls.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`LocalReachabilityState`](../reachability/model.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`MatchedTransitionSource`](../public/navigationTransition.d.ts) | Value | matchedTransitionSource / navigationTransition(.zoom) |
| `@satinhq/kit` | [`MatchedTransitionSourceProps`](../public/navigationTransition.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`MediaCommandResult`](../media/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`MediaController`](../media/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`MediaPlayer`](../media/types.d.ts) | Type | Audio playback state |
| `@satinhq/kit` | [`MediaQueueEntry`](../media/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`MediaQueueOptions`](../media/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`MediaRepeat`](../media/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`MediaSnapshot`](../media/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`Menu`](../public/actions.d.ts) | Value | Menu / contextMenu / swipeActions |
| `@satinhq/kit` | [`MenuProps`](../public/actions.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`MenuTriggerProps`](../glass/menuPresenter.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`moving`](../list-form/offsets.d.ts) | Value | move(fromOffsets:toOffset:) / remove(atOffsets:) |
| `@satinhq/kit` | [`NamespaceID`](../motion/matchedGeometry.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`Navigation`](../public/runtime.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`NavigationArguments`](../public/runtime.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`NavigationBackButtonBehavior`](../navigation/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`NavigationDeclaration`](../public/structure.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`NavigationLink`](../public/controls.d.ts) | Value | NavigationStack / navigationDestination |
| `@satinhq/kit` | [`NavigationLinkProps`](../public/controls.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`NavigationSplitView`](../public/runtime.d.ts) | Value | NavigationSplitView |
| `@satinhq/kit` | [`NavigationSplitViewProps`](../public/runtime.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`NavigationStack`](../public/runtime.d.ts) | Value | NavigationStack / navigationDestination |
| `@satinhq/kit` | [`NavigationStackProps`](../public/runtime.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`NavigationTransition`](../public/navigationTransition.d.ts) | Value | matchedTransitionSource / navigationTransition(.zoom) |
| `@satinhq/kit` | [`newId`](../data/database.d.ts) | Value | Query / model persistence |
| `@satinhq/kit` | [`NotificationAuthorizationStatus`](../public/environment.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`NotificationPermissionExplainer`](../public/environment.d.ts) | Value | Notification authorization / badge |
| `@satinhq/kit` | [`NotificationPermissionExplainerProps`](../public/environment.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`OfflinePresentationProps`](../reachability/react.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`OpenURLAction`](../web/openURL.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`OpenURLOptions`](../web/openURL.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`OpenURLResult`](../web/openURL.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`OrientationFallback`](../app/definition.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`Overlay`](../safe-area/Overlay.d.ts) | Value | overlay(alignment:content:) |
| `@satinhq/kit` | [`OverlayProps`](../safe-area/Overlay.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`param`](../push/schema.d.ts) | Value | NavigationStack / navigationDestination |
| `@satinhq/kit` | [`Parameter`](../push/schema.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ParameterSchema`](../push/schema.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`PasteButton`](../public/deviceActions.d.ts) | Value | PasteButton |
| `@satinhq/kit` | [`PasteButtonProps`](../public/deviceActions.d.ts) | Type | PasteButton |
| `@satinhq/kit` | [`PhotosPicker`](../public/filePickers.d.ts) | Value | PhotosPicker / fileImporter |
| `@satinhq/kit` | [`PhotosPickerProps`](../public/filePickers.d.ts) | Type | PhotosPicker / fileImporter |
| `@satinhq/kit` | [`Picker`](../public/controls.d.ts) | Value | Picker / pickerStyle |
| `@satinhq/kit` | [`PickerProps`](../public/controls.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`preferredColorScheme`](../app/appearance.d.ts) | Value | preferredColorScheme |
| `@satinhq/kit` | [`PreferredColorScheme`](../app/appearanceStore.d.ts) | Type | preferredColorScheme |
| `@satinhq/kit` | [`PresentationDetent`](../presentation/model.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`PresentationProps`](../presentation/Presentation.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`Pressable`](../press/Pressable.d.ts) | Value | Button / buttonStyle / buttonBorderShape / controlSize / disabled |
| `@satinhq/kit` | [`PressableOwnedHandlers`](../press/Pressable.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`PressableProps`](../press/Pressable.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`PressState`](../press/stateMachine.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ProgressView`](../controls/ProgressView.d.ts) | Value | progressViewStyle; ProgressView |
| `@satinhq/kit` | [`ProgressViewProps`](../controls/ProgressView.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ProgressViewStyle`](../controls/ProgressView.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`Query`](../data/database.d.ts) | Value | Query / model persistence |
| `@satinhq/kit` | [`ReachabilityPresentation`](../reachability/model.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ReachabilityProbeConfig`](../reachability/model.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ReachabilityRoutePolicy`](../reachability/model.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ReachabilityState`](../reachability/model.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ReachabilityStateStatus`](../reachability/model.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ReachabilityStatus`](../reachability/model.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ReachabilitySurface`](../reachability/model.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`RecordOfCollection`](../data/database.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`Register`](../public/routes.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`RegisteredNavigation`](../public/structure.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`RegisteredRoutes`](../public/routes.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`removing`](../list-form/offsets.d.ts) | Value | move(fromOffsets:toOffset:) / remove(atOffsets:) |
| `@satinhq/kit` | [`route`](../public/routes.d.ts) | Value | NavigationStack / navigationDestination |
| `@satinhq/kit` | [`RouteDefinition`](../public/routes.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`RouteOptions`](../public/routes.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`RouteParameters`](../push/schema.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`RouteParameterValue`](../push/schema.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`RouteProps`](../public/routes.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`Routes`](../public/routes.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`RowActionsProps`](../actions/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`RowIcon`](../list-form/ListForm.d.ts) | Value | Label / LabeledContent / labelStyle |
| `@satinhq/kit` | [`RowIconProps`](../list-form/ListForm.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`RowInteractionProps`](../public/controls.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`RowLabel`](../public/controls.d.ts) | Value | Label / LabeledContent / labelStyle |
| `@satinhq/kit` | [`RowLabelProps`](../public/controls.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`runApp`](../public/runtime.d.ts) | Value | App / Scene; preferredColorScheme |
| `@satinhq/kit` | [`RunAppConfiguration`](../public/runtime.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`RunAppOptions`](../public/runtime.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`SafeAreaBar`](../safe-area/modifiers.d.ts) | Value | safeAreaBar |
| `@satinhq/kit` | [`SafeAreaBarProps`](../safe-area/modifiers.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`SafeAreaInset`](../safe-area/SafeAreaInset.d.ts) | Value | safeAreaInset |
| `@satinhq/kit` | [`SafeAreaInsetEdge`](../safe-area/SafeAreaInset.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`SafeAreaInsetProps`](../safe-area/SafeAreaInset.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`SafeAreaPadding`](../safe-area/modifiers.d.ts) | Value | safeAreaPadding |
| `@satinhq/kit` | [`SafeAreaPaddingProps`](../safe-area/modifiers.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ScenePhase`](../public/environment.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`Screen`](../public/Screen.d.ts) | Value | navigationTitle / navigationBarTitleDisplayMode; searchable / searchScopes / searchSuggestions; toolbarMinimizationBehavior / toolbarMinimizationRestoration / toolbarMinimizationSafeAreaAdjustment |
| `@satinhq/kit` | [`ScreenLifecycle`](../navigation/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ScreenLifecycleCallbacks`](../navigation/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ScreenProps`](../public/Screen.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ScrollAnchor`](../scroll/position.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ScrollAxis`](../scroll/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ScrollDismissesKeyboardMode`](../keyboard/adapter.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ScrollEdge`](../scroll/edgePolicy.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ScrollEdgeEffectHidden`](../scroll/edgePolicy.d.ts) | Type | scrollEdgeEffectStyle / scrollEdgeEffectHidden |
| `@satinhq/kit` | [`ScrollEdgeEffectStyle`](../scroll/edgePolicy.d.ts) | Type | scrollEdgeEffectStyle / scrollEdgeEffectHidden |
| `@satinhq/kit` | [`ScrollEdgeEffectStyleSelection`](../scroll/edgePolicy.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ScrollEdgeSelection`](../scroll/edgePolicy.d.ts) | Type | scrollEdgeEffectStyle / scrollEdgeEffectHidden |
| `@satinhq/kit` | [`ScrollOffset`](../scroll/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ScrollPositionBinding`](../scroll/position.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ScrollPositionOptions`](../scroll/position.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ScrollTarget`](../scroll/ScrollTarget.d.ts) | Value | ScrollView / ScrollViewReader / ScrollPosition |
| `@satinhq/kit` | [`ScrollToTopOptions`](../scroll/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ScrollView`](../public/scroll.d.ts) | Value | refreshable; ScrollView / ScrollViewReader / ScrollPosition; ignoresSafeArea; scrollEdgeEffectStyle / scrollEdgeEffectHidden |
| `@satinhq/kit` | [`ScrollViewHandle`](../public/scroll.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ScrollViewProps`](../public/scroll.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`Searchable`](../search/searchable.d.ts) | Type | searchable / searchScopes / searchSuggestions |
| `@satinhq/kit` | [`SearchFieldPlacement`](../search/searchable.d.ts) | Type | searchable / searchScopes / searchSuggestions |
| `@satinhq/kit` | [`SearchScopes`](../search/searchable.d.ts) | Type | searchable / searchScopes / searchSuggestions |
| `@satinhq/kit` | [`SearchSuggestion`](../search/searchable.d.ts) | Type | searchable / searchScopes / searchSuggestions |
| `@satinhq/kit` | [`Section`](../list-form/ListForm.d.ts) | Value | List / Form / Section |
| `@satinhq/kit` | [`SectionProps`](../list-form/ListForm.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`SecureField`](../public/controls.d.ts) | Value | SecureField |
| `@satinhq/kit` | [`SecureFieldProps`](../public/controls.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`Selectable`](../root/SatinRoot.d.ts) | Value | Selectable content / magnification |
| `@satinhq/kit` | [`SelectableProps`](../root/SatinRoot.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`semanticColor`](../public/colors.d.ts) | Value | colorScheme / horizontalSizeClass / verticalSizeClass |
| `@satinhq/kit` | [`SemanticColorName`](../public/colors.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`SensoryButton`](../haptics/SensoryButton.d.ts) | Value | sensoryFeedback |
| `@satinhq/kit` | [`SensoryButtonProps`](../haptics/SensoryButton.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`SensoryFeedback`](../haptics/SensoryButton.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ServerReachabilityConfig`](../reachability/model.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ServerReachabilityState`](../reachability/model.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ShareLink`](../public/deviceActions.d.ts) | Value | ShareLink / document export |
| `@satinhq/kit` | [`ShareLinkProps`](../public/deviceActions.d.ts) | Type | ShareLink / document export |
| `@satinhq/kit` | [`Sheet`](../public/presentation.d.ts) | Value | sheet / presentationDetents |
| `@satinhq/kit` | [`SheetProps`](../public/presentation.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`Slider`](../public/controls.d.ts) | Value | Slider |
| `@satinhq/kit` | [`SliderProps`](../public/controls.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`Spacer`](../content/content.d.ts) | Value | Text / VStack / HStack / ZStack / Spacer / Divider |
| `@satinhq/kit` | [`SpacerProps`](../content/content.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`SpringOptions`](../motion/animationValue.d.ts) | Type | withAnimation / Animation |
| `@satinhq/kit` | [`StackDeclaration`](../public/structure.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`Stepper`](../public/controls.d.ts) | Value | Stepper |
| `@satinhq/kit` | [`StepperProps`](../public/controls.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`storageQuota`](../public/storage.d.ts) | Value | Query / model persistence |
| `@satinhq/kit` | [`StringPropertyKey`](../data/database.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`SubmitLabel`](../text-input/kinds.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`SwipeAction`](../actions/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`SwipeActionItem`](../actions/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`SwipeActions`](../actions/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`SwipeActionsConfiguration`](../actions/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`SymbolGlyph`](../symbols/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`SymbolImage`](../symbols/Symbol.d.ts) | Value | Image(systemName:) / symbolRenderingMode |
| `@satinhq/kit` | [`SymbolImageProps`](../symbols/Symbol.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`SymbolName`](../symbols/Symbol.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`SymbolProvider`](../symbols/Symbol.d.ts) | Value | Image(systemName:) / symbolRenderingMode |
| `@satinhq/kit` | [`SymbolRenderingMode`](../symbols/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`SymbolScale`](../symbols/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`SymbolSource`](../symbols/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`SymbolWeight`](../symbols/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`systemColor`](../public/colors.d.ts) | Value | colorScheme / horizontalSizeClass / verticalSizeClass |
| `@satinhq/kit` | [`SystemColorName`](../public/colors.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`Tab`](../public/runtime.d.ts) | Value | TabView / Tab |
| `@satinhq/kit` | [`TabDeclaration`](../public/structure.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`TabId`](../public/structure.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`TabProps`](../public/runtime.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`TabSection`](../tabs/TabSection.d.ts) | Value | TabSection / tabPlacement |
| `@satinhq/kit` | [`TabSectionProps`](../tabs/TabSection.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`TabView`](../public/runtime.d.ts) | Value | TabView / Tab; tabViewBottomAccessory |
| `@satinhq/kit` | [`TabViewProps`](../public/runtime.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`TaskAction`](../tasks/useTask.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`TaskCommit`](../tasks/useTask.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`TaskOptions`](../tasks/useTask.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`TaskRunner`](../tasks/useTask.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`Text`](../content/content.d.ts) | Value | Text / VStack / HStack / ZStack / Spacer / Divider |
| `@satinhq/kit` | [`TextEditor`](../public/controls.d.ts) | Value | TextEditor |
| `@satinhq/kit` | [`TextEditorProps`](../public/controls.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`TextField`](../public/controls.d.ts) | Value | TextField |
| `@satinhq/kit` | [`TextFieldKind`](../text-input/kinds.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`TextFieldProps`](../public/controls.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`TextFieldStyle`](../public/controls.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`TextProps`](../content/content.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`TextStyle`](../content/content.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`TitleDisplayMode`](../navigation/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`Toggle`](../public/controls.d.ts) | Value | Toggle / toggleStyle |
| `@satinhq/kit` | [`ToggleProps`](../public/controls.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ToggleStyle`](../public/controlStyle.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ToggleStyleConfiguration`](../public/controlStyle.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ToolbarItem`](../public/toolbar.d.ts) | Value | toolbar / ToolbarItem / ToolbarSpacer |
| `@satinhq/kit` | [`ToolbarItemGroup`](../public/toolbar.d.ts) | Value | toolbar / ToolbarItem / ToolbarSpacer |
| `@satinhq/kit` | [`ToolbarItemProps`](../public/toolbar.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ToolbarMinimizationBehavior`](../navigation/toolbarMinimization.d.ts) | Type | toolbarMinimizationBehavior / toolbarMinimizationRestoration / toolbarMinimizationSafeAreaAdjustment |
| `@satinhq/kit` | [`ToolbarMinimizationRestoration`](../navigation/toolbarMinimization.d.ts) | Type | toolbarMinimizationBehavior / toolbarMinimizationRestoration / toolbarMinimizationSafeAreaAdjustment |
| `@satinhq/kit` | [`ToolbarMinimizationSafeAreaAdjustment`](../navigation/toolbarMinimization.d.ts) | Type | toolbarMinimizationBehavior / toolbarMinimizationRestoration / toolbarMinimizationSafeAreaAdjustment |
| `@satinhq/kit` | [`ToolbarSpacer`](../public/toolbar.d.ts) | Value | toolbar / ToolbarItem / ToolbarSpacer |
| `@satinhq/kit` | [`ToolbarSpacerProps`](../public/toolbar.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`TransactionCollection`](../data/database.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`TransactionCollections`](../data/database.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`TransitionPhase`](../navigation/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`UpdateActivation`](../app/definition.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`useAppStorage`](../public/environment.d.ts) | Value | AppStorage |
| `@satinhq/kit` | [`useAppUpdate`](../public/environment.d.ts) | Value | App update / preview tooling |
| `@satinhq/kit` | [`useBuildInfo`](../app/buildInfo.d.ts) | Value | App build identity |
| `@satinhq/kit` | [`useColorScheme`](../public/environment.d.ts) | Value | preferredColorScheme; colorScheme / horizontalSizeClass / verticalSizeClass |
| `@satinhq/kit` | [`useDismiss`](../presentation/dismiss.d.ts) | Value | fullScreenCover / dismiss |
| `@satinhq/kit` | [`useEditMode`](../list-form/editing.d.ts) | Value | List(selection:) / EditButton / editMode / selectionDisabled |
| `@satinhq/kit` | [`useFocusChain`](../text-input/focusChain.d.ts) | Value | FocusState / submitLabel |
| `@satinhq/kit` | [`useGlassErrors`](../public/environment.d.ts) | Value | Satin diagnostics |
| `@satinhq/kit` | [`useHorizontalSizeClass`](../public/environment.d.ts) | Value | colorScheme / horizontalSizeClass / verticalSizeClass |
| `@satinhq/kit` | [`useKeyboardMetrics`](../public/keyboard.d.ts) | Value | Satin keyboard metrics |
| `@satinhq/kit` | [`useMediaPlayer`](../media/react.d.ts) | Value | Audio playback state |
| `@satinhq/kit` | [`useNamespace`](../motion/matchedGeometry.d.ts) | Value | @Namespace |
| `@satinhq/kit` | [`useNavigation`](../public/runtime.d.ts) | Value | NavigationStack / navigationDestination |
| `@satinhq/kit` | [`useNotifications`](../public/environment.d.ts) | Value | Notification authorization / badge |
| `@satinhq/kit` | [`useOpenURL`](../web/openURL.d.ts) | Value | Web handoff |
| `@satinhq/kit` | [`useQuery`](../data/database.d.ts) | Value | Query / model persistence |
| `@satinhq/kit` | [`useReachability`](../reachability/react.d.ts) | Value | Reachability |
| `@satinhq/kit` | [`useRecord`](../data/database.d.ts) | Value | Query / model persistence |
| `@satinhq/kit` | [`UserInterfaceSizeClass`](../public/environment.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`useSafeAreaInsets`](../public/environment.d.ts) | Value | safeAreaInset |
| `@satinhq/kit` | [`useScaledMetric`](../content/scaledMetric.d.ts) | Value | @ScaledMetric |
| `@satinhq/kit` | [`useScenePhase`](../public/environment.d.ts) | Value | scenePhase |
| `@satinhq/kit` | [`useSceneStorage`](../public/environment.d.ts) | Value | SceneStorage |
| `@satinhq/kit` | [`useScreenLifecycle`](../navigation/navigationContext.d.ts) | Value | scenePhase |
| `@satinhq/kit` | [`useTask`](../tasks/useTask.d.ts) | Value | task / task(id:) |
| `@satinhq/kit` | [`useUnsavedChanges`](../root/runtimeContext.d.ts) | Value | Unsaved editor dismissal |
| `@satinhq/kit` | [`useVerticalSizeClass`](../public/environment.d.ts) | Value | colorScheme / horizontalSizeClass / verticalSizeClass |
| `@satinhq/kit` | [`useWebAuthentication`](../web/useWebAuthentication.d.ts) | Value | Web authentication |
| `@satinhq/kit` | [`useWebFrame`](../web/WebView.d.ts) | Value | Web handoff |
| `@satinhq/kit` | [`VerticalScrollGeometry`](../scroll/position.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`VerticalTextFieldProps`](../public/controls.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ViewportFitPolicy`](../app/viewportValue.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ViewThatFits`](../content/layout.d.ts) | Value | ViewThatFits |
| `@satinhq/kit` | [`ViewThatFitsAxis`](../content/layout.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ViewThatFitsProps`](../content/layout.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`Visibility`](../navigation/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`VStack`](../content/content.d.ts) | Value | Text / VStack / HStack / ZStack / Spacer / Divider |
| `@satinhq/kit` | [`VStackProps`](../content/content.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`WebAuthentication`](../web/authentication.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`WebAuthenticationCallbackResult`](../web/authentication.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`WebAuthenticationConfiguration`](../web/authentication.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`WebAuthenticationExchange`](../web/authentication.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`WebAuthenticationRequest`](../web/authentication.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`WebAuthenticationStartResult`](../web/authentication.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`WebAuthenticationState`](../web/authentication.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`WebFrameActionResult`](../web/WebView.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`WebFrameController`](../web/WebView.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`WebFrameState`](../web/WebView.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`WebView`](../web/WebView.d.ts) | Value | Web handoff |
| `@satinhq/kit` | [`WebViewProps`](../web/WebView.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`withAnimation`](../motion/matchedGeometry.d.ts) | Value | withAnimation / Animation |
| `@satinhq/kit` | [`WriteFailure`](../data/write-store.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`Zoomable`](../zoom/Zoomable.d.ts) | Value | Selectable content / magnification |
| `@satinhq/kit` | [`ZoomableProps`](../zoom/Zoomable.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ZoomTransitionOptions`](../public/navigationTransition.d.ts) | Type | No reviewed API description |
| `@satinhq/kit` | [`ZStack`](../content/content.d.ts) | Value | Text / VStack / HStack / ZStack / Spacer / Divider |
| `@satinhq/kit` | [`ZStackProps`](../content/content.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/diagnostics` | [`AppearanceEvent`](../app/appearanceStore.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/diagnostics` | [`InstallationDiagnostics`](../app/InstallationDiagnostics.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/diagnostics` | [`InstallationDiagnosticsProps`](../app/InstallationDiagnostics.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/diagnostics` | [`InstallationFailure`](../app/installationFailure.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/diagnostics` | [`readAppearanceDiagnostics`](../app/appearance.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/diagnostics` | [`readInstallationFailure`](../app/installationFailure.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/install` | [`copyInstallLink`](../app/installContext.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/install` | [`CopyLinkResult`](../app/installContext.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/install` | [`InstallApp`](../app/installContext.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/install` | [`InstallBrowser`](../app/installContext.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/install` | [`InstallContext`](../app/installContext.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/install` | [`InstallDevice`](../app/installContext.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/install` | [`InstallSteps`](../app/InstallComponents.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/install` | [`InstallTip`](../app/InstallComponents.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/install` | [`readInstallContext`](../app/installContext.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/install` | [`useInstallContext`](../app/InstallComponents.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`Action`](../actions/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`ActionItem`](../actions/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`Alert`](../presentation/Presentation.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`AlertProps`](../presentation/Presentation.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`AnyScreenDefinition`](../navigation/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`AppDefinition`](../app/definition.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`AppDeploymentInput`](../app/definition.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`Appearance`](../glass/lens/theme.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`AppearanceEvent`](../app/appearanceStore.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`AppShellBuildState`](../sw/registerAppShell.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`AxisLayoutClass`](../layout/layoutClass.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`bindMenuGestures`](../menu/menuGesture.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`BitmapBackdropMode`](../glass/lens/bitmapBackdrop.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`blendMenuFrames`](../glass/lens/menuMotion.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`BridgeMode`](../glass/renderSpecs.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`ButtonRow`](../list-form/ListForm.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`cancelStackTransition`](../navigation/stack.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`CapsuleShape`](../glass/renderSpecs.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`Choice`](../list-form/ListForm.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`Chrome`](../root/SatinRoot.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`ChromeBandSpec`](../glass/renderSpecs.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`clampStepper`](../list-form/state.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`collection`](../data/database.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`Collection`](../data/database.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`CollectionDefinition`](../data/database.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`ConfirmationDialog`](../presentation/Presentation.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`ConfirmationDialogProps`](../presentation/Presentation.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`connectPushRoutes`](../push/urlProjection.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`ContentPage`](../glass/lens/tabPresentation.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`ContextMenu`](../actions/RowActions.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`ContextMenuConfiguration`](../actions/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`createAnimatedTransitionController`](../navigation/motion.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`createInstantTransitionController`](../navigation/store.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`createNavigationReleaseTrajectory`](../navigation/releaseTrajectory.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`createNavigator`](../navigation/store.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`CreateNavigatorOptions`](../navigation/store.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`createPushNotifications`](../push/notifications.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`createPushRelayAdapter`](../push/notifications.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`createRenderSpecs`](../glass/renderSpecs.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`createRouteCodec`](../navigation/routeCodec.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`createSceneRestoration`](../restoration/scene.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`createScreenRegistry`](../navigation/registry.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`createSurfaceClipPath`](../glass/renderSpecs.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`decodePushRoute`](../push/routes.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`defineApp`](../app/definition.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`defineDatabase`](../data/database.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`defineScreen`](../navigation/registry.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`DetailList`](../navigation/DetailList.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`DirectCanvasElements`](../glass/renderSpecs.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`DisclosureIndicator`](../settings/DisclosureIndicator.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`DisclosureIndicatorProps`](../settings/DisclosureIndicator.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`dismissKeyboard`](../keyboard/adapter.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`DisplayCornerMetrics`](../safe-area/displayCorners.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`DisplayGeometry`](../safe-area/displayCorners.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`drawGlassBitmapBackdrop`](../glass/lens/bitmapBackdrop.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`drawReferenceBackground`](../glass/lens/referenceBackground.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`EdgeInsets`](../safe-area/useSafeAreaMetrics.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`encodePushRoute`](../push/routes.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`EntryTransition`](../navigation/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`estimateStorage`](../data/database.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`evaluateTemporalSpline`](../glass/lens/liquidMotion.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`ExportDocument`](../data/database.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`finishStackTransition`](../navigation/stack.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`getGlassErrors`](../glass/errors.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`Glass`](../glass/regions.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GLASS_BAR_EDGE_HIGHLIGHT_ALPHA`](../glass/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GLASS_BAR_HEIGHT_PX`](../glass/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GLASS_BAR_SHADOW_ALPHA`](../glass/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GLASS_CIRCLE_INLINE_INSET_PX`](../glass/lens/Scene.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GLASS_CIRCLE_SIZE_PX`](../glass/lens/Scene.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GLASS_CIRCLE_TOP_PX`](../glass/lens/Scene.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GLASS_CLEAR_BRIGHTNESS`](../glass/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GLASS_CLEAR_SATURATION`](../glass/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GLASS_CLEAR_TINT_ALPHA`](../glass/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GLASS_CONTROL_SIZE_PX`](../glass/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GLASS_DOCK_BOTTOM_GAP_PX`](../glass/lens/Scene.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GLASS_DOCK_HEIGHT_PX`](../glass/lens/Scene.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GLASS_DOCK_RADIUS_PX`](../glass/lens/Scene.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GLASS_DOCK_SIDE_INSET_PX`](../glass/lens/Scene.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GLASS_DOCK_WIDTH_PX`](../glass/lens/Scene.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GLASS_LENS_BLUR_PX`](../glass/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GLASS_LENS_CHROMATIC_ABERRATION`](../glass/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GLASS_LENS_CURVATURE`](../glass/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GLASS_LENS_DEPTH_PX`](../glass/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GLASS_LENS_EDGE_EXPONENT`](../glass/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GLASS_LENS_EDGE_HIGHLIGHT`](../glass/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GLASS_LENS_EDGE_WIDTH_PX`](../glass/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GLASS_LENS_GLOW`](../glass/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GLASS_LENS_GLOW_EXPONENT`](../glass/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GLASS_LENS_GLOW_SPREAD`](../glass/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GLASS_LENS_SPECULAR`](../glass/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GLASS_LENS_SPECULAR_ANGLE_DEG`](../glass/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GLASS_LENS_SPLAY`](../glass/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GLASS_LENS_STRENGTH`](../glass/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GLASS_OVERSCAN_X_PX`](../glass/lens/Scene.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GLASS_OVERSCAN_Y_PX`](../glass/lens/Scene.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GLASS_REGION_LIMIT`](../glass/regions.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GLASS_REGION_PIXEL_LIMIT`](../glass/regions.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GLASS_REGULAR_BRIGHTNESS`](../glass/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GLASS_REGULAR_SATURATION`](../glass/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GLASS_REGULAR_TINT_ALPHA`](../glass/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GLASS_RIM_HIGHLIGHT_ALPHA`](../glass/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GLASS_RIM_SHADOW_ALPHA`](../glass/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GLASS_SELECTION_DURATION_MS`](../glass/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GLASS_SELECTION_EASING`](../glass/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GLASS_TAB_BAR_BOTTOM_GAP_PX`](../glass/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GLASS_TAB_BAR_HEIGHT_PX`](../glass/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GLASS_TAB_BAR_INLINE_INSET_PX`](../glass/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GLASS_TINT_RGB`](../glass/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GlassAccessibilityPreferences`](../glass/capability.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`GlassBackground`](../glass/GlassEffect.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GlassBar`](../glass/GlassBar.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GlassBarProps`](../glass/GlassBar.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`glassBlendRadius`](../glass/fieldGeometry.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GlassButton`](../glass/GlassEffect.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GlassCapabilityDecision`](../glass/capability.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`GlassCapabilityState`](../glass/capability.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`GlassConfusionReview`](../glass/GlassConfusionReview.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GlassContainer`](../glass/GlassEffect.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GlassDisplacementPolicy`](../glass/GlassMaterialRoot.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`glassDockHeight`](../glass/lens/Scene.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`glassDockWidth`](../glass/lens/Scene.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GlassEffect`](../glass/GlassEffect.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GlassEffectContainer`](../glass/GlassEffect.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GlassEffectProps`](../glass/GlassEffect.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`GlassError`](../glass/errors.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`GlassErrorCode`](../glass/errors.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`glassFieldDistance`](../glass/fieldGeometry.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GlassFieldMember`](../glass/fieldGeometry.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`GlassFrameTrace`](../glass/renderSpecs.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`GlassInteraction`](../glass/rendererContract.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`GlassLayer`](../glass/GlassEffect.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GlassLayerDescriptor`](../glass/regions.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`GlassMaterial`](../glass/regions.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`GlassMaterialDiagnostics`](../glass/context.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`GlassMaterialResponse`](../glass/rendererContract.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`GlassOutlinePoint`](../glass/unionOutline.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`GlassPresenter`](../glass/rendererContract.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`GlassRegion`](../glass/regions.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`GlassRendererDiagnostics`](../glass/rendererContract.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`GlassRendererReply`](../glass/rendererContract.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`GlassRendererRequest`](../glass/rendererContract.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`GlassRenderTestState`](../glass/capability.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`GlassSceneSnapshot`](../glass/regions.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`GlassScrollSnapshot`](../glass/regions.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`GlassSearchField`](../glass/GlassTextField.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GlassShape`](../glass/regions.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`GlassSource`](../glass/rendererContract.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`GlassSpecimen`](../glass/GlassPresentation.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GlassTextField`](../glass/GlassTextField.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GlassTextFieldProps`](../glass/GlassTextField.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`GlassTint`](../glass/regions.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`glassTokens`](../glass/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GlassTouchLight`](../glass/renderSpecs.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`GlassUnionFrame`](../glass/fieldGeometry.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`glassUnionOutline`](../glass/unionOutline.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`GlassVariant`](../glass/tokens.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`ICON_GRADIENTS`](../glass/lens/theme.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`ICON_SVG`](../glass/lens/icons.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`InstallationDiagnostics`](../app/InstallationDiagnostics.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`InstallationFailure`](../app/installationFailure.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`installMotionProbe`](../motionProbe.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`InteractivePopDiagnostic`](../navigation/interactivePopTypes.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`isBitmapBackdrop`](../glass/lens/bitmapBackdrop.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`isCalibratedMaxLayout`](../glass/lens/Scene.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`isTintBackgroundMode`](../glass/lens/referenceBackground.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`KeyboardGeometry`](../keyboard/geometry.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`lastUnstableMeasurement`](../glass/lens/Scene.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`LayoutClass`](../layout/layoutClass.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`LensMode`](../glass/renderSpecs.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`LIQUID_ENVELOPES`](../glass/lens/liquidMotion.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`LIQUID_PILL_BAR`](../glass/lens/liquidMotion.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`LIQUID_SCRIPT`](../glass/lens/liquidMotion.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`liquidAnimationActive`](../glass/lens/liquidMotion.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`LiquidMotionMode`](../glass/lens/liquidMotion.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`liquidScriptDuration`](../glass/lens/liquidMotion.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`List`](../list-form/ListForm.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`ListEngineProps`](../list-form/ListForm.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`makeReferenceBackgroundCanvas`](../glass/lens/referenceBackground.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`MARKER_INTERVAL_PX`](../glass/lens/mirrorConstants.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`measureMirrorLayout`](../glass/lens/Scene.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`measureMirrorLayoutRelative`](../glass/lens/Scene.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`Menu`](../glass/Menu.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`MENU_BUTTON`](../glass/lens/menuMotion.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`MENU_CADENCE`](../glass/lens/menuMotion.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`MENU_ENVELOPE`](../glass/lens/menuMotion.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`MENU_GESTURE_REST`](../menu/menuGesture.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`MENU_ICON_SVG`](../glass/lens/icons.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`MENU_MOTION_DURATIONS`](../glass/lens/menuMotion.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`MENU_PANEL`](../glass/lens/menuMotion.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`MENU_TAP_FEEDBACK_MS`](../menu/menuGesture.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`menuCadenceDuration`](../glass/lens/menuMotion.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`MenuDirection`](../glass/lens/menuMotion.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`MenuGestureDecision`](../menu/menuGesture.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`MenuGestureFrame`](../menu/menuGesture.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`MenuGestureMotion`](../menu/menuGesture.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`menuHighlightAttack`](../menu/menuGesture.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`MenuInteraction`](../menu/menuInteraction.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`MenuInteractionPhase`](../menu/menuInteraction.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`menuMaterialProgress`](../glass/lens/menuMotion.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`MenuMotionFrame`](../glass/lens/menuMotion.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`MenuPanelBounds`](../menu/menuGesture.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`menuPanelPull`](../menu/menuGesture.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`MenuProps`](../glass/menuPresenter.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`menuPull`](../glass/contactPhysics.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`menuRetargetTime`](../glass/lens/menuMotion.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`menuReturn`](../glass/contactPhysics.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`MenuTriggerProps`](../glass/menuPresenter.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`MirrorCaptureRange`](../glass/lens/Scene.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`MirrorLayout`](../glass/lens/Scene.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`MirrorNode`](../glass/lens/Scene.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`MorphEllipsisArtwork`](../glass/MorphEllipsisArtwork.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`MOTION_SPEC`](../glass/lens/motion.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`MotionRun`](../glass/lens/motion.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`MotionSample`](../glass/lens/motion.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`mountGlassWorkerExperiment`](../glass/worker/experiment.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`mountSatin`](../root/mountSatin.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`NATIVE_WIDGET_Y_REGISTRATION_PX`](../glass/lens/motion.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`NAVIGATION_CURRENT_SEGMENT_WEIGHT`](../navigation/releaseVelocity.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`NAVIGATION_DIM_OPACITY`](../navigation/motionTokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`NAVIGATION_DIRECTION_LOCK_PX`](../navigation/motionTokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`NAVIGATION_DURATION_MS`](../navigation/motionTokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`NAVIGATION_EASING`](../navigation/motionTokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`NAVIGATION_EDGE_SHADOW_OPACITY`](../navigation/motionTokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`NAVIGATION_EDGE_SHADOW_WIDTH_PX`](../navigation/motionTokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`NAVIGATION_HORIZONTAL_INTENT_PX`](../navigation/motionTokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`NAVIGATION_PARALLAX_FRACTION`](../navigation/motionTokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`NAVIGATION_POSITION_THRESHOLD`](../navigation/motionTokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`NAVIGATION_PREVIOUS_SEGMENT_WEIGHT`](../navigation/releaseVelocity.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`NAVIGATION_RELEASE_SAMPLE_RATE_HZ`](../navigation/releaseTrajectory.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`NAVIGATION_RELEASE_SPRING_DAMPING`](../navigation/releaseTrajectory.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`NAVIGATION_RELEASE_SPRING_MASS`](../navigation/releaseTrajectory.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`NAVIGATION_RELEASE_SPRING_STIFFNESS`](../navigation/releaseTrajectory.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`NAVIGATION_VELOCITY_THRESHOLD_PX_PER_SECOND`](../navigation/motionTokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`NavigationBackButtonBehavior`](../navigation/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`NavigationBarDefinition`](../navigation/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`navigationMotionTokens`](../navigation/motionTokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`NavigationReleaseSample`](../navigation/releaseTrajectory.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`NavigationReleaseTrajectory`](../navigation/releaseTrajectory.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`NavigationRow`](../list-form/ListForm.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`NavigatorActions`](../navigation/store.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`NavigatorHost`](../navigation/NavigatorHost.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`NavigatorHostProps`](../navigation/NavigatorHost.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`NavigatorState`](../navigation/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`NavigatorStore`](../navigation/store.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`newId`](../data/database.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`normalizeNavigationReleaseVelocity`](../navigation/releaseTrajectory.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`OfflinePresentation`](../reachability/react.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`OfflinePresentationProps`](../reachability/react.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`PALETTES`](../glass/lens/theme.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`PickerOptions`](../list-form/ListForm.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`PickerRow`](../list-form/ListForm.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`PickerRowProps`](../list-form/ListForm.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`popStack`](../navigation/stack.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`popToRootStack`](../navigation/stack.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`prepareGlassBitmapBackdrop`](../glass/lens/bitmapBackdrop.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`prepareSceneRoutes`](../restoration/routes.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`PresentationDetent`](../presentation/model.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`PresentationKind`](../navigation/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`PresentationProps`](../presentation/Presentation.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`Pressable`](../press/Pressable.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`PRESSABLE_PRESS_IN_DURATION_MS`](../press/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`PRESSABLE_PRESSED_OPACITY`](../press/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`PRESSABLE_RELEASE_DURATION_MS`](../press/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`PRESSABLE_RELEASE_EASING`](../press/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`PRESSABLE_RETENTION_OFFSET_PX`](../press/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`PressableProps`](../press/Pressable.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`pressableTokens`](../press/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`PressState`](../press/stateMachine.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`previousTrace`](../glass/lens/trace.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`PushNotifications`](../push/notifications.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`PushNotificationsLifecycle`](../push/PushPermissionExplainer.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`PushNotificationState`](../push/notifications.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`PushPermissionExplainer`](../push/PushPermissionExplainer.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`PushRelayTokenField`](../push/PushPermissionExplainer.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`PushRoute`](../push/routes.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`PushRouteRules`](../push/routes.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`PushServerAdapter`](../push/notifications.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`pushStack`](../navigation/stack.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`PushSubscriptionPayload`](../push/notifications.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`Query`](../data/database.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`readAppearanceDiagnostics`](../app/appearance.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`readDisplayCornerMetrics`](../safe-area/displayCorners.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`readInstallationFailure`](../app/installationFailure.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`readSafeAreaMetrics`](../safe-area/useSafeAreaMetrics.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`readSceneValue`](../restoration/scene.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`REFERENCE_CONTENT_HEIGHT_PX`](../glass/lens/referenceBackground.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`ReferenceBackgroundMode`](../glass/lens/referenceBackground.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`ReferenceBackgroundScene`](../glass/lens/Scene.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`registerAppShell`](../sw/registerAppShell.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`RegisterAppShellOptions`](../sw/registerAppShell.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`registerGlassBitmapBackdrop`](../glass/lens/bitmapBackdrop.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`RegistryScreenEntry`](../navigation/store.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`REGULAR_TRIGGER_MATERIAL`](../glass/regularTriggerMaterial.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`REGULAR_TRIGGER_MATERIAL_GLSL`](../glass/regularTriggerMaterial.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`REGULAR_TRIGGER_RIM_CURVES`](../glass/regularTriggerRim.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`RegularMaterialContext`](../glass/regularMaterialContext.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`regularTriggerRegime`](../glass/regularTriggerMaterial.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`regularTriggerRimResponse`](../glass/regularTriggerRim.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`releaseWarmedAppImages`](../app/warmImage.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`replaceStack`](../navigation/stack.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`reportGlassError`](../glass/errors.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`requestPersistentStorage`](../data/database.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`resolveDisplayCornerMetrics`](../safe-area/displayCorners.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`ReturningMenuTrigger`](../glass/renderSpecs.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`RouteSchema`](../navigation/routeCodec.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`Row`](../list-form/ListForm.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`RowActions`](../actions/RowActions.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`RowActionsProps`](../actions/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`RowIcon`](../list-form/ListForm.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`RowIconProps`](../list-form/ListForm.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`RowProps`](../list-form/ListForm.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`runScriptedDrag`](../glass/lens/motion.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`runScriptedScroll`](../glass/lens/motion.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`RuntimeElements`](../glass/renderSpecs.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`RuntimeGeometry`](../glass/renderSpecs.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`RuntimeOptions`](../glass/renderSpecs.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`RuntimeSnapshot`](../glass/renderSpecs.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`SafeAreaMetrics`](../safe-area/useSafeAreaMetrics.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`SampledMotion`](../menu/sampledMotion.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`sampleLiquidShape`](../glass/lens/liquidMotion.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`sampleMenuCadence`](../glass/lens/menuMotion.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`sampleMenuMotion`](../glass/lens/menuMotion.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`sampleNavigationCurve`](../navigation/motionTokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`SatinAppShellRegistration`](../sw/registerAppShell.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`SatinRoot`](../root/SatinRoot.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`SatinRootProps`](../root/SatinRoot.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`SatinRuntime`](../root/runtimeContext.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`Scenario`](../glass/renderSpecs.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`ScenarioMetrics`](../glass/renderSpecs.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`SCENE_STYLE`](../glass/lens/Scene.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`SceneRestoration`](../restoration/scene.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`ScreenContainer`](../navigation/ScreenContainer.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`ScreenContainerProps`](../navigation/ScreenContainer.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`ScreenDefinition`](../navigation/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`ScreenEntry`](../navigation/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`ScreenId`](../navigation/store.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`ScreenLifecycle`](../navigation/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`ScreenLifecycleCallbacks`](../navigation/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`ScreenParams`](../navigation/store.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`ScreenRegistry`](../navigation/registry.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`scriptedDragFrames`](../glass/lens/motion.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`scriptedDragProgress`](../glass/lens/motion.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`ScriptedMotionMode`](../glass/lens/motion.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`ScriptedScrollMode`](../glass/lens/motion.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`scriptedScrollOffset`](../glass/lens/motion.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`ScrollAxis`](../scroll/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`ScrollDismissesKeyboardMode`](../keyboard/adapter.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`ScrollOffset`](../scroll/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`ScrollSnapshot`](../scroll/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`ScrollSurface`](../scroll/ScrollSurface.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`ScrollSurfaceHandle`](../scroll/ScrollSurface.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`ScrollSurfaceProps`](../scroll/ScrollSurface.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`ScrollToTopOptions`](../scroll/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`Section`](../list-form/ListForm.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`SectionProps`](../list-form/ListForm.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`SecureField`](../text-input/TextField.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`SecureFieldProps`](../text-input/TextField.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`SegmentedControl`](../list-form/ListForm.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`Selectable`](../root/SatinRoot.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`SelectableProps`](../root/SatinRoot.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`SerializedRoute`](../navigation/routeCodec.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`setAppBadge`](../push/notifications.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`SETTINGS_BACK_BUTTON_INLINE_INSET_PX`](../settings/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`SETTINGS_BACK_BUTTON_SIZE_PX`](../settings/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`SETTINGS_DETAIL_CONTENT_TOP_OFFSET_PX`](../settings/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`SETTINGS_DETAIL_INLINE_INSET_PX`](../settings/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`SETTINGS_DETAIL_ROW_HEIGHT_PX`](../settings/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`SETTINGS_DISCLOSURE_DARK_COLOR`](../settings/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`SETTINGS_DISCLOSURE_HEIGHT_PX`](../settings/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`SETTINGS_DISCLOSURE_LIGHT_COLOR`](../settings/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`SETTINGS_DISCLOSURE_OFFSET_X_PX`](../settings/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`SETTINGS_DISCLOSURE_OFFSET_Y_PX`](../settings/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`SETTINGS_DISCLOSURE_WIDTH_PX`](../settings/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`SETTINGS_GROUP_CORNER_RADIUS_PX`](../settings/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`SETTINGS_GROUP_SPACING_PX`](../settings/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`SETTINGS_LARGE_TITLE_FONT_SIZE_PX`](../settings/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`SETTINGS_LARGE_TITLE_LINE_HEIGHT_PX`](../settings/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`SETTINGS_NAVIGATION_BAR_HEIGHT_PX`](../settings/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`SETTINGS_ROOT_INLINE_INSET_PX`](../settings/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`SETTINGS_ROOT_LARGE_TITLE_TOP_OFFSET_PX`](../settings/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`SETTINGS_ROOT_PRO_MAX_INLINE_INSET_PX`](../settings/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`SETTINGS_ROOT_ROW_HEIGHT_PX`](../settings/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`SETTINGS_ROW_ICON_CORNER_RADIUS_PX`](../settings/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`SETTINGS_ROW_ICON_SIZE_PX`](../settings/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`SETTINGS_ROW_TRAILING_INSET_PX`](../settings/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`SETTINGS_SEPARATOR_HAIRLINE_PX`](../settings/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`SETTINGS_SEPARATOR_LEADING_INSET_PX`](../settings/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`SETTINGS_SEPARATOR_OFFSET_Y_PX`](../settings/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`SETTINGS_SEPARATOR_TRAILING_INSET_PX`](../settings/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`settingsChromeTokens`](../settings/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`SettingsDomScene`](../glass/lens/Scene.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`SettingsPalette`](../glass/lens/theme.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`settingsRootInlineInset`](../settings/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`Sheet`](../presentation/Presentation.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`SheetProps`](../presentation/Presentation.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`shouldCompleteInteractivePop`](../navigation/motionTokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`Sidebar`](../navigation/Sidebar.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`SidebarEntry`](../navigation/Sidebar.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`SidebarProps`](../navigation/Sidebar.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`SidebarSymbol`](../navigation/SidebarSymbol.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`sidebarTokens`](../settings/tokens.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`SplitSelection`](../navigation/splitContext.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`springStep`](../glass/lens/liquidMotion.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`stableTabSelection`](../glass/lens/tabSelectionMaterial.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`StateSchema`](../restoration/scene.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`StepperProps`](../list-form/ListForm.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`StepperRow`](../list-form/ListForm.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`STRIPE_BACKGROUND_MODES`](../glass/lens/referenceBackground.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`SubmitLabel`](../text-input/kinds.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`subscribeGlassErrors`](../glass/errors.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`summarize`](../glass/worker/experiment.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`SurfaceId`](../glass/renderSpecs.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`SurfaceRenderSpec`](../glass/renderSpecs.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`SurfaceShape`](../glass/renderSpecs.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`SwipeActions`](../actions/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`SwipeActionsConfiguration`](../actions/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`Tab`](../tabs/TabView.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`TAB_BAR_BLUR_SIGMA`](../glass/lens/tabSelectionMaterial.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`TAB_BAR_LOCAL_CENTRES`](../glass/lens/tabSelectionMaterial.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`TAB_ICON_SVG`](../glass/lens/icons.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`TAB_SELECTION_HEIGHT`](../glass/lens/tabSelectionMaterial.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`TAB_SELECTION_WIDTH`](../glass/lens/tabSelectionMaterial.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`TabBar`](../glass/TabBar.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`TabBarItem`](../glass/TabBar.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`TabBarProps`](../glass/TabBar.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`tabGlyphStyle`](../glass/lens/tabGlyphColours.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`tabPresentation`](../glass/lens/tabPresentation.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`tabProbeOverride`](../glass/lens/tabPresentation.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`TabProps`](../tabs/TabView.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`tabSelectionCapsule`](../glass/lens/tabSelectionMaterial.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`TabSelectionShape`](../glass/renderSpecs.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`TabView`](../tabs/TabView.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`TabViewProps`](../tabs/TabView.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`TextEditor`](../text-input/TextEditor.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`TextEditorProps`](../text-input/TextEditor.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`TextField`](../text-input/TextField.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`TextFieldKind`](../text-input/kinds.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`TextFieldProps`](../text-input/TextField.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`TINT_BACKGROUND_MODES`](../glass/lens/referenceBackground.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`TintBackgroundMode`](../glass/lens/referenceBackground.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`TitleDisplayMode`](../navigation/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`Toggle`](../list-form/Toggle.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`ToggleProps`](../list-form/Toggle.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`ToggleRow`](../list-form/Toggle.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`ToolbarGroup`](../glass/GlassEffect.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`ToolbarSpacer`](../glass/GlassEffect.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`trace`](../glass/lens/trace.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`TransactionCollection`](../data/database.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`TransitionBinding`](../navigation/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`TransitionCompletion`](../navigation/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`TransitionController`](../navigation/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`TransitionControllerContext`](../navigation/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`TransitionControllerFactory`](../navigation/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`TransitionOperation`](../navigation/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`TransitionPhase`](../navigation/types.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`TypedRoute`](../navigation/routeCodec.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal` | [`useFocusChain`](../text-input/focusChain.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`useGlassMaterialDiagnostics`](../glass/context.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`useKeyboardMetrics`](../keyboard/adapter.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`useLayoutClass`](../root/runtimeContext.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`useNavigator`](../navigation/navigationContext.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`useNavigatorState`](../navigation/navigationContext.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`useParams`](../navigation/navigationContext.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`usePushNotifications`](../push/notifications.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`useQuery`](../data/database.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`useReachability`](../reachability/react.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`useRecord`](../data/database.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`useRestoredState`](../restoration/react.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`useSafeAreaMetrics`](../safe-area/useSafeAreaMetrics.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`useSatinRuntime`](../root/runtimeContext.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`useSceneStorage`](../restoration/react.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`useScreenLifecycle`](../navigation/navigationContext.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`useSplitSelection`](../navigation/splitContext.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`useUnsavedChanges`](../root/runtimeContext.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`validatePushRoute`](../push/routes.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`ValueRow`](../list-form/ListForm.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`warmAppImageWhenIdle`](../app/warmImage.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`Zoomable`](../zoom/Zoomable.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal` | [`ZoomableProps`](../zoom/Zoomable.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal/vite` | [`AppFixture`](../app/head.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal/vite` | [`defineApp`](../public/definition.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal/vite` | [`defineAppFixture`](../app/definition.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal/vite` | [`satinApp`](../app/vite.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal/vite` | [`satinAppFixtures`](../app/vite.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal/vite` | [`SatinAppOptions`](../app/vite.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/internal/vite` | [`satinAppShell`](../sw/vite.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/internal/vite` | [`SatinAppShellPluginOptions`](../sw/vite.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/server` | [`serveStaticFile`](../server.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/testing` | [`assertNavigation`](../testing.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/testing` | [`sendTestNotification`](../testing.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/unstable` | [`Animation`](../motion/animationValue.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/unstable` | [`concentricRadius`](../safe-area/displayCorners.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/unstable` | [`DetailList`](../navigation/DetailList.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/unstable` | [`DragGesture`](../gestures/gesture.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/unstable` | [`DragGestureOptions`](../gestures/gesture.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/unstable` | [`DragGestureValue`](../gestures/gesture.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/unstable` | [`Gesture`](../gestures/gesture.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/unstable` | [`GesturePoint`](../gestures/gesture.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/unstable` | [`GestureState`](../gestures/gesture.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/unstable` | [`GestureView`](../gestures/GestureView.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/unstable` | [`GestureViewProps`](../gestures/GestureView.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/unstable` | [`LongPressGesture`](../gestures/gesture.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/unstable` | [`LongPressGestureOptions`](../gestures/gesture.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/unstable` | [`MagnifyGesture`](../gestures/gesture.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/unstable` | [`MagnifyGestureOptions`](../gestures/gesture.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/unstable` | [`MagnifyGestureValue`](../gestures/gesture.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/unstable` | [`MatchedGeometryEffect`](../motion/matchedGeometry.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/unstable` | [`MatchedGeometryEffectProps`](../motion/matchedGeometry.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/unstable` | [`Sidebar`](../navigation/Sidebar.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/unstable` | [`SidebarEntry`](../navigation/Sidebar.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/unstable` | [`SidebarProps`](../navigation/Sidebar.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/unstable` | [`SidebarSymbol`](../navigation/SidebarSymbol.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/unstable` | [`SpringOptions`](../motion/animationValue.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/unstable` | [`TapGesture`](../gestures/gesture.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/unstable` | [`TapGestureOptions`](../gestures/gesture.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/unstable` | [`Transition`](../motion/transition.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/unstable` | [`TransitionEdge`](../motion/transition.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/unstable` | [`TransitionView`](../motion/TransitionView.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/unstable` | [`TransitionViewProps`](../motion/TransitionView.d.ts) | Type | No reviewed API description |
| `@satinhq/kit/unstable` | [`useDisplayCornerRadius`](../safe-area/displayCorners.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/unstable` | [`useGestureState`](../gestures/gesture.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/unstable` | [`useSplitSelection`](../navigation/splitContext.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/unstable` | [`withAnimation`](../motion/matchedGeometry.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/vite` | [`defineApp`](../public/definition.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/vite` | [`satinApp`](../app/vite.d.ts) | Value | No reviewed API description |
| `@satinhq/kit/vite` | [`SatinAppOptions`](../app/vite.d.ts) | Type | No reviewed API description |

## Missing mapping inventory

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

- `@satinhq/kit:6b1393b088849383b4d58af841b53afabf734a131abd2a0c51e5e47d76a031ee`
- `@satinhq/kit/vite:63ab5323f1fdbfe3425716de812e63889353f0a7252fdb379ddd29f0113c6c7b`
- `@satinhq/kit/install:85c36af3f6d918e999f65db362675d8982468350930a540177d3d9809c88ca01`
- `@satinhq/kit/internal:debba3992b9960c73ceaa33af510cfd6162fbb3271b7807f1041fd9968c4a6e0`
- `@satinhq/kit/unstable:09d854e967c086ed0eaa8b3decbbd326306e1f35e493b79cc1f375060319a840`
- `@satinhq/kit/server:1b9db029ea048edc062313e7116510843dab71d9a5630842f778bc45736e3990`
- `@satinhq/kit/testing:cb9036de4e4b3df41671c759c0fc123b059bd412849ac0796479ead545fa8728`
- `@satinhq/kit/diagnostics:900cab5f712b8a118f361f434848f6a8508b44bc884b9dabcc4687c042d5b79d`
- `@satinhq/kit/internal/vite:a6f1c9264605c2c98fa7816f7e1bf80ad74ae5f8ca8e562b2a1e1bd083a6f502`

## Framework source fingerprint

SHA-256 of sorted TS/TSX/CSS source paths and bytes, excluding tests: c4f66a9a5ac0b203be131846ee35fd33d9ec84aaf9fbf8a7dacd1c3278f251e3
