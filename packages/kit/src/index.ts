// The public satin API, grouped as an app uses it.
// the implementation contract governs every export.

// App and runtime
export { useBuildInfo, type BuildInfo } from './app/buildInfo.ts'
export { defineApp, type AppDefinitionInput } from './public/definition.ts'
export {
  runApp,
  NavigationStack,
  NavigationSplitView,
  TabView,
  Tab,
  TabSection,
  type TabSectionProps,
  type TabProps,
  type TabViewProps,
  useNavigation,
  type Navigation,
  type RunAppOptions,
  type RunAppConfiguration,
  type NavigationStackProps,
  type NavigationSplitViewProps,
  type NavigationArguments,
} from './public/runtime.tsx'
export {
  useScenePhase,
  useAppUpdate,
  useColorScheme,
  useHorizontalSizeClass,
  useVerticalSizeClass,
  useSafeAreaInsets,
  useGlassErrors,
  useSceneStorage,
  useAppStorage,
  useNotifications,
  NotificationPermissionExplainer,
  type EdgeInsets,
  type UserInterfaceSizeClass,
  type ScenePhase,
  type ColorScheme,
  type NotificationPermissionExplainerProps,
  type NotificationAuthorizationStatus,
} from './public/environment.tsx'
export { useUnsavedChanges } from './root/runtimeContext.ts'
export { preferredColorScheme, type PreferredColorScheme } from './app/appearance.ts'
export {
  type ActionItem,
  type SwipeAction,
  type SwipeActionItem,
  type SwipeActions,
  type SwipeActionsConfiguration,
  type ContextMenuConfiguration,
  type RowActionsProps,
} from './actions/types.ts'
export {
  type AppIcon,
  type AppDefinition,
  type AppCapability,
  type OrientationFallback,
  type AppOrientation,
  type UpdateActivation,
} from './app/definition.ts'
export { type ViewportFitPolicy } from './app/viewportValue.ts'
export { type LaunchScreenSlot } from './app/launchScreen.ts'
export { type JustUpdated } from './app/coldLaunchUpdate.ts'

// Routes and navigation
export {
  defineRoutes,
  route,
  param,
  type Register,
  type RegisteredRoutes,
  type RouteProps,
  type Routes,
  type RouteDefinition,
  type Parameter,
  type ParameterSchema,
  type RouteParameters,
  type RouteOptions,
} from './public/routes.tsx'
export {
  defineNavigation,
  type NavigationDeclaration,
  type StackDeclaration,
  type RegisteredNavigation,
  type TabId,
  type TabDeclaration,
} from './public/structure.ts'
export { useScreenLifecycle } from './navigation/navigationContext.tsx'
export {
  type TitleDisplayMode,
  type Visibility,
  type NavigationBackButtonBehavior,
  type ScreenLifecycleCallbacks,
  type ScreenLifecycle,
  type TransitionPhase,
} from './navigation/types.ts'
export { type RouteParameterValue } from './push/schema.ts'

// Screen chrome and toolbars
export { Screen, type ScreenProps } from './public/Screen.tsx'
export {
  DefaultToolbarItem,
  ToolbarItem,
  ToolbarItemGroup,
  ToolbarSpacer,
  type ToolbarSpacerProps,
  type DefaultToolbarItemProps,
  type ToolbarItemProps,
} from './public/toolbar.tsx'
export {
  type Searchable,
  type SearchFieldPlacement,
  type SearchScopes,
  type SearchSuggestion,
} from './search/searchable.ts'
export {
  type ToolbarMinimizationBehavior,
  type ToolbarMinimizationRestoration,
  type ToolbarMinimizationSafeAreaAdjustment,
} from './navigation/toolbarMinimization.ts'

// Content: text, stacks and grids
export {
  Text,
  VStack,
  HStack,
  ZStack,
  Spacer,
  Divider,
  LazyVStack,
  LazyHStack,
  LazyVGrid,
  LazyHGrid,
  GridItem,
  type LazyVStackProps,
  type LazyHStackProps,
  type LazyVGridProps,
  type LazyHGridProps,
  type GridItemValue,
  type GridItemOptions,
  type FixedGridItemOptions,
  type FlexibleGridItemOptions,
  type AdaptiveGridItemOptions,
  type TextStyle,
  type FontWeight,
  type ContentAlignment,
  type ContentFrame,
  type ContentPadding,
  type ContentProps,
  type TextProps,
  type VStackProps,
  type HStackProps,
  type ZStackProps,
  type SpacerProps,
} from './content/content.tsx'
export {
  GeometryReader,
  ViewThatFits,
  type GeometryReaderProps,
  type GeometryProxy,
  type GeometrySize,
  type GeometryFrame,
  type ViewThatFitsProps,
  type ViewThatFitsAxis,
} from './content/layout.tsx'
export { useScaledMetric } from './content/scaledMetric.ts'
export { Label, type LabelProps } from './public/Label.tsx'
export { Selectable, type SelectableProps } from './root/SatinRoot.tsx'
export { Zoomable, type ZoomableProps } from './zoom/Zoomable.tsx'

// Lists, forms and controls
export {
  List,
  Form,
  NavigationLink,
  Button,
  LabeledContent,
  ContentUnavailableView,
  type ContentUnavailableViewProps,
  RowLabel,
  Toggle,
  Picker,
  Stepper,
  Slider,
  TextField,
  SecureField,
  TextEditor,
  EditButton,
  type ListProps,
  type ListStyle,
  type ListSelectionProps,
  type NavigationLinkProps,
  type ButtonProps,
  type ButtonBorderShape,
  type LabeledContentProps,
  type RowInteractionProps,
  type ToggleProps,
  type PickerProps,
  type StepperProps,
  type SliderProps,
  type TextFieldProps,
  type HorizontalTextFieldProps,
  type VerticalTextFieldProps,
  type TextFieldStyle,
  type LineLimit,
  type SecureFieldProps,
  type TextEditorProps,
  type FormProps,
  type RowLabelProps,
} from './public/controls.tsx'
export {
  Section,
  ListRow,
  RowIcon,
  type ListRowProps,
  type RowIconProps,
  type SectionProps,
  type Choice,
} from './list-form/ListForm.tsx'
export {
  ForEach,
  useEditMode,
  type EditMode,
  type ForEachProps,
  type ListItemID,
} from './list-form/editing.tsx'
export { moving, removing } from './list-form/offsets.ts'
export {
  ProgressView,
  type ProgressViewProps,
  type ProgressViewStyle,
} from './controls/ProgressView.tsx'
export {
  DatePicker,
  type DatePickerProps,
  type DatePickerComponent,
  type DatePickerRange,
  type DatePickerStyle,
} from './controls/DatePicker.tsx'
export { ColorPicker, type ColorPickerProps } from './controls/ColorPicker.tsx'
export { useFocusChain, type FocusChainField } from './text-input/focusChain.ts'
export { type TextFieldKind, type SubmitLabel } from './text-input/kinds.ts'
export { Pressable, type PressableProps, type PressableOwnedHandlers } from './press/Pressable.tsx'
export {
  SensoryButton,
  type SensoryButtonProps,
  type SensoryFeedback,
} from './haptics/SensoryButton.tsx'
export {
  ControlStyleProvider,
  type ControlStyleValues,
  type ControlSize,
  type ButtonRole,
  type ButtonStyle,
  type ButtonStyleConfiguration,
  type BuiltInButtonStyle,
  type LabelStyle,
  type LabelStyleConfiguration,
  type BuiltInLabelStyle,
  type ToggleStyle,
  type ToggleStyleConfiguration,
  type BuiltInToggleStyle,
  type ControlConfiguration,
} from './public/controlStyle.tsx'
export { type PressState } from './press/stateMachine.ts'

// Menus and actions
export { Menu, ContextMenu, type MenuProps, type Action } from './public/actions.tsx'

// Presentations
export {
  FullScreenCover,
  Sheet,
  type FullScreenCoverProps,
  type SheetProps,
} from './public/presentation.tsx'
export {
  Alert,
  ConfirmationDialog,
  type AlertProps,
  type ConfirmationDialogProps,
  type PresentationProps,
  type AlertTextFieldProps,
} from './presentation/Presentation.tsx'
export { type PresentationDetent } from './presentation/model.ts'
export { useDismiss } from './presentation/dismiss.tsx'

// Scrolling
export { ScrollView, type ScrollViewProps, type ScrollViewHandle } from './public/scroll.tsx'
export { ScrollTarget } from './scroll/ScrollTarget.tsx'
export {
  type ScrollAnchor,
  type VerticalScrollGeometry,
  type ScrollPositionBinding,
  type ScrollPositionOptions,
} from './scroll/position.ts'
export {
  type ScrollEdge,
  type ScrollEdgeSelection,
  type ScrollEdgeEffectStyle,
  type ScrollEdgeEffectHidden,
  type ScrollEdgeEffectStyleSelection,
} from './scroll/edgePolicy.ts'
export { type ScrollAxis, type ScrollOffset, type ScrollToTopOptions } from './scroll/types.ts'

// Safe area and layout modifiers
export { Overlay, type OverlayProps } from './safe-area/Overlay.tsx'
export {
  SafeAreaInset,
  type SafeAreaInsetProps,
  type SafeAreaInsetEdge,
} from './safe-area/SafeAreaInset.tsx'
export {
  SafeAreaPadding,
  ContentMargins,
  SafeAreaBar,
  IgnoresSafeArea,
  type SafeAreaPaddingProps,
  type ContentMarginsProps,
  type SafeAreaBarProps,
  type IgnoresSafeAreaProps,
  type Edge,
  type EdgeSet,
  type EdgeLengths,
  type LayoutModifierProps,
  type EdgeSetMember,
} from './safe-area/modifiers.tsx'
export { useKeyboardMetrics, type KeyboardMetrics } from './public/keyboard.ts'
export { type ScrollDismissesKeyboardMode } from './keyboard/adapter.ts'

// Animation
export {
  defineNamespace,
  useNamespace,
  withAnimation,
  type NamespaceID,
} from './motion/matchedGeometry.tsx'
export { Animation, type SpringOptions } from './motion/animationValue.ts'
export {
  MatchedTransitionSource,
  NavigationTransition,
  type MatchedTransitionSourceProps,
  type ZoomTransitionOptions,
} from './public/navigationTransition.tsx'

// Glass
export { Glass } from './public/glassValue.ts'
export { GlassEffect, type GlassEffectProps, type GlassShape } from './public/glass.tsx'
export { GlassEffectContainer } from './glass/GlassEffect.tsx'
export { type GlassError, type GlassErrorCode } from './glass/errors.ts'
export { type GlassTint } from './glass/regions.ts'
export { type MenuTriggerProps } from './glass/Menu.tsx'

// Colours, symbols and images
export {
  systemColor,
  semanticColor,
  type SystemColorName,
  type SemanticColorName,
} from './public/colors.ts'
export {
  SymbolImage,
  SymbolProvider,
  type SymbolImageProps,
  type SymbolName,
} from './symbols/Symbol.tsx'
export {
  type SymbolGlyph,
  type SymbolSource,
  type SymbolWeight,
  type SymbolScale,
  type SymbolRenderingMode,
} from './symbols/types.ts'
export {
  Image,
  AsyncImage,
  type ImageProps,
  type AsyncImageProps,
  type AsyncImagePhase,
} from './image/Image.tsx'
export { type ImageAsset } from './image/asset.ts'
export { type CoreSymbolName } from './symbols/catalogue.ts'

// Data and storage
export {
  collection,
  defineDatabase,
  newId,
  useQuery,
  useRecord,
  Query,
  type Collection,
  type CollectionDefinition,
  type ExportDocument,
  type TransactionCollection,
  type WriteFailure,
  type StringPropertyKey,
  type CollectionIndexes,
  type CollectionSchema,
  type DatabaseMigration,
  type TransactionCollections,
  type RecordOfCollection,
  type CollectionUpdateMethods,
  type IndexesOfCollection,
  type DatabaseRecord,
} from './data/database.ts'
export { storageQuota } from './public/storage.ts'

// Tasks, media and connectivity
export {
  useTask,
  type TaskAction,
  type TaskCommit,
  type TaskOptions,
  type TaskRunner,
} from './tasks/useTask.ts'
export { useMediaPlayer } from './media/react.tsx'
export {
  type MediaPlayer,
  type MediaController,
  type MediaCommandResult,
  type MediaQueueEntry,
  type MediaQueueOptions,
  type MediaSnapshot,
  type MediaRepeat,
} from './media/types.ts'
export { useReachability, type OfflinePresentationProps } from './reachability/react.tsx'
export {
  type ReachabilityState,
  type ServerReachabilityConfig,
  type ReachabilityRoutePolicy,
  type ReachabilityProbeConfig,
  type ReachabilitySurface,
  type LocalReachabilityState,
  type ServerReachabilityState,
  type ReachabilityPresentation,
  type ReachabilityStatus,
  type ReachabilityStateStatus,
} from './reachability/model.ts'
export { type KeyboardGeometry } from './keyboard/geometry.ts'

// App shape geometry
export { cornerClipPath, type CornerShape } from './shapes/corners.ts'

// Web pages and authentication handoff
export {
  Link,
  useOpenURL,
  type LinkProps,
  type OpenURLAction,
  type OpenURLOptions,
  type OpenURLResult,
} from './web/openURL.tsx'
export {
  WebView,
  useWebFrame,
  type WebViewProps,
  type WebViewLink,
  type WebFrameController,
  type WebFrameState,
  type WebFrameActionResult,
} from './web/WebView.tsx'
export {
  defineWebAuthentication,
  type WebAuthentication,
  type WebAuthenticationConfiguration,
  type WebAuthenticationExchange,
  type WebAuthenticationState,
  type WebAuthenticationRequest,
  type WebAuthenticationStartResult,
  type WebAuthenticationCallbackResult,
} from './web/authentication.ts'
export { useWebAuthentication } from './web/useWebAuthentication.ts'

export { PhotosPicker, FileImporter } from './public/filePickers.tsx'
export type { PhotosPickerProps, FileImporterProps } from './public/filePickers.tsx'
export { ShareLink, PasteButton } from './public/deviceActions.tsx'
export type { ShareLinkProps, PasteButtonProps } from './public/deviceActions.tsx'

export { useIsSearching, useDismissSearch } from './search/SearchEnvironment.tsx'
export {
  defineResource,
  type Resource,
  type ResourceSnapshot,
  type ResourceOptions,
} from './data/resource.ts'
export { useResource, type ResourceResult } from './data/useResource.ts'
