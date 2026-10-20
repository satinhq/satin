export { mountSatin } from './root/mountSatin.ts'
export {
  Chrome,
  SatinRoot,
  Selectable,
  type SatinRootProps,
  type SelectableProps,
} from './root/SatinRoot.tsx'
export { useSatinRuntime, useUnsavedChanges, type SatinRuntime } from './root/runtimeContext.ts'
export {
  registerAppShell,
  type AppShellBuildState,
  type SatinAppShellRegistration,
  type RegisterAppShellOptions,
} from './sw/registerAppShell.ts'
export {
  readSafeAreaMetrics,
  useSafeAreaMetrics,
  type EdgeInsets,
  type SafeAreaMetrics,
} from './safe-area/useSafeAreaMetrics.ts'
export {
  NavigatorHost,
  ScreenContainer,
  type InteractivePopDiagnostic,
  type NavigatorHostProps,
  type ScreenContainerProps,
} from './navigation/NavigatorHost.tsx'
export {
  useNavigator,
  useNavigatorState,
  useParams,
  useScreenLifecycle,
} from './navigation/navigationContext.tsx'
export { createScreenRegistry, defineScreen, type ScreenRegistry } from './navigation/registry.ts'
export {
  cancelStackTransition,
  finishStackTransition,
  popStack,
  popToRootStack,
  pushStack,
  replaceStack,
} from './navigation/stack.ts'
export {
  createAnimatedTransitionController,
  NAVIGATION_DIM_OPACITY,
  NAVIGATION_DIRECTION_LOCK_PX,
  NAVIGATION_DURATION_MS,
  NAVIGATION_EASING,
  NAVIGATION_EDGE_SHADOW_OPACITY,
  NAVIGATION_EDGE_SHADOW_WIDTH_PX,
  NAVIGATION_HORIZONTAL_INTENT_PX,
  NAVIGATION_PARALLAX_FRACTION,
  NAVIGATION_POSITION_THRESHOLD,
  NAVIGATION_VELOCITY_THRESHOLD_PX_PER_SECOND,
  navigationMotionTokens,
  sampleNavigationCurve,
  shouldCompleteInteractivePop,
} from './navigation/motion.ts'
export {
  NAVIGATION_RELEASE_SAMPLE_RATE_HZ,
  NAVIGATION_RELEASE_SPRING_DAMPING,
  NAVIGATION_RELEASE_SPRING_MASS,
  NAVIGATION_RELEASE_SPRING_STIFFNESS,
  createNavigationReleaseTrajectory,
  normalizeNavigationReleaseVelocity,
  type NavigationReleaseSample,
  type NavigationReleaseTrajectory,
} from './navigation/releaseTrajectory.ts'
export {
  NAVIGATION_PREVIOUS_SEGMENT_WEIGHT,
  NAVIGATION_CURRENT_SEGMENT_WEIGHT,
} from './navigation/releaseVelocity.ts'
export {
  createInstantTransitionController,
  createNavigator,
  type CreateNavigatorOptions,
  type NavigatorActions,
  type NavigatorStore,
  type RegistryScreenEntry,
  type ScreenId,
  type ScreenParams,
} from './navigation/store.ts'
export type {
  AnyScreenDefinition,
  EntryTransition,
  NavigatorState,
  NavigationBackButtonBehavior,
  NavigationBarDefinition,
  TitleDisplayMode,
  PresentationKind,
  ScreenDefinition,
  ScreenEntry,
  ScreenLifecycle,
  ScreenLifecycleCallbacks,
  TransitionCompletion,
  TransitionBinding,
  TransitionController,
  TransitionControllerContext,
  TransitionControllerFactory,
  TransitionOperation,
  TransitionPhase,
} from './navigation/types.ts'
export {
  ScrollSurface,
  type ScrollSurfaceHandle,
  type ScrollSurfaceProps,
} from './scroll/ScrollSurface.tsx'
export type {
  ScrollAxis,
  ScrollOffset,
  ScrollSnapshot,
  ScrollToTopOptions,
} from './scroll/types.ts'
export { Pressable, type PressableProps } from './press/Pressable.tsx'
export type { PressState } from './press/stateMachine.ts'
export {
  PRESSABLE_PRESSED_OPACITY,
  PRESSABLE_PRESS_IN_DURATION_MS,
  PRESSABLE_RELEASE_DURATION_MS,
  PRESSABLE_RELEASE_EASING,
  PRESSABLE_RETENTION_OFFSET_PX,
  pressableTokens,
} from './press/tokens.ts'
export {
  SETTINGS_BACK_BUTTON_INLINE_INSET_PX,
  SETTINGS_BACK_BUTTON_SIZE_PX,
  SETTINGS_DETAIL_CONTENT_TOP_OFFSET_PX,
  SETTINGS_DETAIL_INLINE_INSET_PX,
  SETTINGS_DETAIL_ROW_HEIGHT_PX,
  SETTINGS_GROUP_CORNER_RADIUS_PX,
  SETTINGS_GROUP_SPACING_PX,
  SETTINGS_LARGE_TITLE_FONT_SIZE_PX,
  SETTINGS_LARGE_TITLE_LINE_HEIGHT_PX,
  SETTINGS_NAVIGATION_BAR_HEIGHT_PX,
  SETTINGS_ROOT_INLINE_INSET_PX,
  SETTINGS_ROOT_PRO_MAX_INLINE_INSET_PX,
  settingsRootInlineInset,
  SETTINGS_ROOT_LARGE_TITLE_TOP_OFFSET_PX,
  SETTINGS_ROOT_ROW_HEIGHT_PX,
  SETTINGS_DISCLOSURE_DARK_COLOR,
  SETTINGS_DISCLOSURE_HEIGHT_PX,
  SETTINGS_DISCLOSURE_LIGHT_COLOR,
  SETTINGS_DISCLOSURE_OFFSET_X_PX,
  SETTINGS_DISCLOSURE_OFFSET_Y_PX,
  SETTINGS_DISCLOSURE_WIDTH_PX,
  SETTINGS_ROW_TRAILING_INSET_PX,
  SETTINGS_ROW_ICON_CORNER_RADIUS_PX,
  SETTINGS_ROW_ICON_SIZE_PX,
  SETTINGS_SEPARATOR_HAIRLINE_PX,
  SETTINGS_SEPARATOR_LEADING_INSET_PX,
  SETTINGS_SEPARATOR_OFFSET_Y_PX,
  SETTINGS_SEPARATOR_TRAILING_INSET_PX,
  settingsChromeTokens,
} from './settings/tokens.ts'
export {
  DisclosureIndicator,
  type DisclosureIndicatorProps,
} from './settings/DisclosureIndicator.tsx'
export { GlassBar, type GlassBarProps } from './glass/GlassBar.tsx'
export { TabBar, type TabBarItem, type TabBarProps } from './glass/TabBar.tsx'
export { useGlassMaterialDiagnostics, type GlassMaterialDiagnostics } from './glass/context.ts'
export type {
  GlassAccessibilityPreferences,
  GlassCapabilityDecision,
  GlassCapabilityState,
  GlassRenderTestState,
} from './glass/capability.ts'
export type { GlassDisplacementPolicy } from './glass/GlassMaterialRoot.tsx'
export {
  GLASS_BAR_HEIGHT_PX,
  GLASS_BAR_EDGE_HIGHLIGHT_ALPHA,
  GLASS_BAR_SHADOW_ALPHA,
  GLASS_CLEAR_BRIGHTNESS,
  GLASS_CLEAR_SATURATION,
  GLASS_CLEAR_TINT_ALPHA,
  GLASS_CONTROL_SIZE_PX,
  GLASS_REGULAR_BRIGHTNESS,
  GLASS_REGULAR_SATURATION,
  GLASS_REGULAR_TINT_ALPHA,
  GLASS_SELECTION_DURATION_MS,
  GLASS_SELECTION_EASING,
  GLASS_TAB_BAR_BOTTOM_GAP_PX,
  GLASS_TAB_BAR_HEIGHT_PX,
  GLASS_TAB_BAR_INLINE_INSET_PX,
  GLASS_TINT_RGB,
  glassTokens,
  type GlassVariant,
} from './glass/tokens.ts'
export {
  bindMenuGestures,
  MENU_GESTURE_REST,
  MENU_TAP_FEEDBACK_MS,
  menuHighlightAttack,
  menuPanelPull,
  menuPull,
  menuReturn,
} from './menu/menuGesture.ts'
export type {
  MenuGestureDecision,
  MenuGestureFrame,
  MenuGestureMotion,
  MenuPanelBounds,
} from './menu/menuGesture.ts'

export { SampledMotion } from './menu/sampledMotion.ts'

export { MenuInteraction } from './menu/menuInteraction.ts'
export type { MenuInteractionPhase } from './menu/menuInteraction.ts'
export { RegularMaterialContext } from './glass/regularMaterialContext.ts'
export {
  REGULAR_TRIGGER_MATERIAL,
  REGULAR_TRIGGER_MATERIAL_GLSL,
  regularTriggerRegime,
} from './glass/regularTriggerMaterial.ts'
export { REGULAR_TRIGGER_RIM_CURVES, regularTriggerRimResponse } from './glass/regularTriggerRim.ts'

// measured-reference: app definition and transport reachability.
export { defineSatinApp as defineApp } from './app/definition.ts'
export type { AppDefinition, AppDeploymentInput } from './app/definition.ts'
export { useReachability, OfflinePresentation } from './reachability/react.tsx'
export type { OfflinePresentationProps } from './reachability/react.tsx'
// measured-reference: adaptive runtime and semantic split selection.
export { useLayoutClass } from './root/runtimeContext.ts'
export type { AxisLayoutClass, LayoutClass } from './layout/layoutClass.ts'
export { useSplitSelection } from './navigation/splitContext.ts'
export type { SplitSelection } from './navigation/splitContext.ts'
// End measured-reference.
export { Zoomable, type ZoomableProps } from './zoom/Zoomable.tsx'

export { Sidebar, type SidebarEntry, type SidebarProps } from './navigation/Sidebar.tsx'
export { sidebarTokens } from './settings/tokens.ts'
export { DetailList } from './navigation/DetailList.tsx'
export { SidebarSymbol } from './navigation/SidebarSymbol.tsx'

export { installMotionProbe } from './motionProbe.ts'

export {
  createPushNotifications,
  createPushRelayAdapter,
  usePushNotifications,
  setAppBadge,
} from './push/notifications.ts'
export type {
  PushNotifications,
  PushNotificationState,
  PushSubscriptionPayload,
  PushServerAdapter,
} from './push/notifications.ts'
export { encodePushRoute, decodePushRoute, validatePushRoute } from './push/routes.ts'
export type { PushRoute, PushRouteRules } from './push/routes.ts'
export { connectPushRoutes } from './push/urlProjection.ts'
export {
  PushNotificationsLifecycle,
  PushPermissionExplainer,
  PushRelayTokenField,
} from './push/PushPermissionExplainer.tsx'
export { Glass, GLASS_REGION_LIMIT, GLASS_REGION_PIXEL_LIMIT } from './glass/regions.ts'
export type {
  GlassShape,
  GlassTint,
  GlassMaterial,
  GlassRegion,
  GlassLayer as GlassLayerDescriptor,
  GlassSceneSnapshot,
  GlassScrollSnapshot,
} from './glass/regions.ts'
export {
  GlassEffect,
  GlassEffectContainer,
  GlassContainer,
  GlassButton,
  ToolbarGroup,
  ToolbarSpacer,
  GlassLayer,
  GlassBackground,
  type GlassEffectProps,
} from './glass/GlassEffect.tsx'
export {
  GlassTextField,
  GlassSearchField,
  type GlassTextFieldProps,
} from './glass/GlassTextField.tsx'

export { Menu, type MenuProps, type MenuTriggerProps } from './glass/Menu.tsx'

export type {
  GlassInteraction,
  GlassPresenter,
  GlassMaterialResponse,
  GlassSource,
  GlassRendererRequest,
  GlassRendererDiagnostics,
  GlassRendererReply,
} from './glass/rendererContract.ts'

export { reportGlassError, getGlassErrors } from './glass/errors.ts'
export type { GlassError, GlassErrorCode } from './glass/errors.ts'
export {
  List,
  Section,
  Row,
  RowIcon,
  NavigationRow,
  ValueRow,
  ButtonRow,
  Toggle,
  ToggleRow,
  PickerRow,
  PickerOptions,
  StepperRow,
  SegmentedControl,
} from './list-form/ListForm.tsx'
export type {
  ListEngineProps,
  SectionProps,
  RowProps,
  RowIconProps,
  ToggleProps,
  Choice,
  PickerRowProps,
  StepperProps,
} from './list-form/ListForm.tsx'
export { clampStepper } from './list-form/state.ts'

export {
  collection,
  defineDatabase,
  estimateStorage,
  newId,
  requestPersistentStorage,
  useQuery,
  useRecord,
  Query,
} from './data/database.ts'
export type {
  Collection,
  CollectionDefinition,
  ExportDocument,
  TransactionCollection,
} from './data/database.ts'
export {
  TextField,
  SecureField,
  type TextFieldProps,
  type SecureFieldProps,
} from './text-input/TextField.tsx'
export { TextEditor, type TextEditorProps } from './text-input/TextEditor.tsx'
export { useFocusChain } from './text-input/focusChain.ts'
export { type TextFieldKind, type SubmitLabel } from './text-input/kinds.ts'
export {
  useKeyboardMetrics,
  dismissKeyboard,
  type ScrollDismissesKeyboardMode,
} from './keyboard/adapter.ts'
export { type KeyboardGeometry } from './keyboard/geometry.ts'
export { Tab, TabView, type TabProps, type TabViewProps } from './tabs/TabView.tsx'

export { subscribeGlassErrors } from './glass/errors.ts'
export {
  Sheet,
  Alert,
  ConfirmationDialog,
  type SheetProps,
  type AlertProps,
  type ConfirmationDialogProps,
  type PresentationProps,
} from './presentation/Presentation.tsx'
export { type PresentationDetent } from './presentation/model.ts'

export { createSceneRestoration, readSceneValue } from './restoration/scene.ts'
export type { SceneRestoration, StateSchema } from './restoration/scene.ts'
export { useRestoredState, useSceneStorage } from './restoration/react.ts'
export { createRouteCodec } from './navigation/routeCodec.ts'
export type { RouteSchema, SerializedRoute, TypedRoute } from './navigation/routeCodec.ts'
export { prepareSceneRoutes } from './restoration/routes.ts'

export * from './glass/testing.ts'
export { mountGlassWorkerExperiment, summarize } from './glass/worker/experiment.ts'

export { ContextMenu, RowActions } from './actions/RowActions.tsx'
export type {
  Action,
  ActionItem,
  SwipeActions,
  SwipeActionsConfiguration,
  ContextMenuConfiguration,
  RowActionsProps,
} from './actions/types.ts'
// Idle image warm-up remains an internal API.
export { warmAppImageWhenIdle, releaseWarmedAppImages } from './app/warmImage.ts'

// Measured diagnostic artwork; the owned public icon API remains deferred.
export { MorphEllipsisArtwork } from './glass/MorphEllipsisArtwork.tsx'

export {
  readDisplayCornerMetrics,
  resolveDisplayCornerMetrics,
  type DisplayGeometry,
  type DisplayCornerMetrics,
} from './safe-area/displayCorners.ts'

export { glassUnionOutline, type GlassOutlinePoint } from './glass/unionOutline.ts'

export {
  glassFieldDistance,
  glassBlendRadius,
  type GlassFieldMember,
  type GlassUnionFrame,
} from './glass/fieldGeometry.ts'

export {
  InstallationDiagnostics,
  readInstallationFailure,
  type InstallationFailure,
} from './app/InstallationDiagnostics.tsx'

export { readAppearanceDiagnostics } from './app/appearance.ts'

export { type AppearanceEvent } from './app/appearanceStore.ts'
// EXPERIMENTAL: private gesture ownership, sidebar drawer and three-pane container.
// Not part of the public API; the names and behaviour will change.
export { ExperimentalDrawer, type ExperimentalDrawerProps } from './drawer/ExperimentalDrawer.tsx'
export { useExperimentalDrawer, type ExperimentalDrawerHandle } from './drawer/drawerHandle.ts'
export {
  ExperimentalThreePane,
  type ExperimentalThreePaneProps,
} from './drawer/ExperimentalThreePane.tsx'
