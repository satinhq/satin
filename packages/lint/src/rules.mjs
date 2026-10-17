const definitions = [
  {
    id: 'no-executable-url',
    description: 'Reject executable and private schemes in URL actions and embedded pages.',
    autofixable: false,
    message:
      'Use an http or https URL with Link, useOpenURL or WebView; executable and private URL schemes are unsupported.',
  },
  {
    id: 'no-private-css-variable',
    description: 'Keep framework geometry and styles behind the public API.',
    autofixable: false,
    message:
      'Do not read --satin-* variables in app code. Use Overlay, SafeAreaInset, useSafeAreaInsets or public component props.',
  },
  {
    id: 'no-raw-image',
    description: 'Keep artwork decoding and intrinsic geometry framework-owned.',
    autofixable: false,
    message:
      'Use Image for local artwork or AsyncImage for remote URLs from @satinhq/kit. They own placeholders, failed requests and reconnect recovery.',
  },
  {
    id: 'no-handrolled-context-menu',
    description: 'Keep chrome context menus framework-owned.',
    autofixable: false,
    message:
      'Use contextMenu or ContextMenu from @satinhq/kit instead of canceling contextmenu on app chrome.',
  },
  {
    id: 'no-internal-import',
    description: 'Use the stable app API.',
    autofixable: false,
    message:
      '@satinhq/kit/internal is reserved for framework tests, the lab and the parity kit. Use satin or explicitly opt into @satinhq/kit/unstable.',
  },
  {
    id: 'no-global-focus-reset',
    description: 'Keep keyboard focus indicators while Satin quiets touch focus.',
    autofixable: false,
    message:
      'Do not globally remove focus outlines. Satin suppresses non-keyboard indicators on the focused element and preserves keyboard focus.',
  },
  {
    id: 'no-hidden-focus-heading',
    description: 'Focus a painted heading or control.',
    autofixable: false,
    message:
      'A programmatic heading focus target must be visible. Do not use hidden or screen-reader-only headings for navigation focus.',
  },
  {
    id: 'require-icon-label',
    description: 'Name icon-only controls.',
    autofixable: false,
    message: 'An icon-only control requires a nonempty aria-label or aria-labelledby.',
  },
  {
    id: 'no-browser-dialog',
    description: 'Keep modal presentation framework-owned.',
    autofixable: false,
    message:
      'Use Alert or ConfirmationDialog from @satinhq/kit instead of browser alert, confirm or prompt.',
  },
  {
    id: 'no-browser-history',
    description: 'Keep app navigation and URL projection framework-owned.',
    autofixable: false,
    message:
      'Use the Satin navigator. Browser history mutation and traversal belong to the framework.',
  },
  {
    id: 'no-app-reload',
    description: 'Keep release updates and push activation from reloading the running app.',
    autofixable: false,
    message:
      'Let the Satin app shell apply updates at a safe launch boundary; do not call location.reload.',
  },
  {
    id: 'no-global-touch-listener',
    description: 'Keep touch policy on framework semantic roles.',
    autofixable: false,
    message:
      'Do not install document/window touch listeners. Use Satin controls and scroll surfaces.',
  },
  {
    id: 'no-fixed-document',
    description: 'Keep document viewport ownership in Satin.',
    autofixable: false,
    message:
      'Do not fix html, body, or the app mount. Satin owns document layout so the installed viewport can expand under the status bar.',
  },
  {
    id: 'no-global-selection-reset',
    description: 'Keep selection policies scoped to semantic roles.',
    autofixable: false,
    message: 'Use Chrome or Selectable instead of a root or universal user-select reset.',
  },
  {
    id: 'no-direct-push-api',
    description: 'Keep notification permission and badges framework-owned.',
    autofixable: false,
    message:
      'Use NotificationPermissionExplainer and useNotifications from @satinhq/kit. Never prompt on launch.',
  },
  {
    id: 'no-handrolled-glass',
    description: 'Keep glass materials on the shared framework renderer.',
    autofixable: false,
    message: 'Use GlassEffect or a glass control from @satinhq/kit instead of backdrop-filter.',
  },
  {
    id: 'valid-glass-morph',
    description: 'Keep glass relations scoped and transitions explicit.',
    autofixable: false,
    message:
      'GlassEffect identity/union requires namespace; union requires a container; use matchedGeometry, materialize or identity.',
  },
  {
    id: 'no-raw-text-input',
    description: 'Use framework fields or document a native-input escape.',
    autofixable: false,
    message:
      'Use TextField, SecureField or TextEditor. A raw control requires data-satin-native-input with a nonempty reason.',
  },
  {
    id: 'no-small-input-font',
    description: 'Keep editable text at least 16 CSS pixels.',
    autofixable: false,
    message: 'Input fonts below 16px cause focus zoom. Use framework field typography.',
  },
  {
    id: 'no-duplicate-tab-id',
    description: 'Require unique literal Tab ids within each TabView.',
    autofixable: false,
    message:
      'Tab ids must be unique within TabView so each tab retains its own content and navigator.',
  },

  {
    id: 'no-custom-linear-easing',
    description: 'Keep custom motion curves on compositor property keyframes.',
    autofixable: false,
    message:
      'CSS linear(...) easing can require the iOS main thread. Use Satin motion or sampled property keyframes with plain linear easing.',
  },
  {
    id: 'no-raw-appearance-query',
    description: 'Keep appearance CSS on the accepted framework state.',
    autofixable: false,
    message:
      'Raw appearance queries can be stale after resume. Use html[data-satin-appearance="dark"] or the framework appearance store.',
  },
  {
    id: 'no-direct-react-root',
    description: 'Reserve initial React scheduling for mountSatin.',
    autofixable: false,
    message:
      'Initial mounting is framework-owned. Use runApp from @satinhq/kit instead of react-dom/client.',
  },
  {
    id: 'no-page-zoom',
    description: 'Keep page scaling owned by Satin and content zoom inside Zoomable.',
    autofixable: false,
    message: 'Page zoom bypasses the fixed shell. Use Zoomable for content magnification.',
  },
  {
    id: 'no-handwritten-app-head',
    description: 'Reserve app head configuration for defineApp and satinApp.',
    autofixable: false,
    message:
      'App head configuration is definition-owned. Remove this tag and use defineApp with satinApp.',
  },
  {
    id: 'no-menu-motion-properties',
    description: 'Keep menu motion on concrete document-timeline properties.',
    autofixable: false,
    message:
      'Menu motion custom properties require main-thread style updates. Use Satin sampled transform/opacity timelines.',
  },
  {
    id: 'no-native-menu-active',
    description: 'Require pointer-owned menu highlights instead of CSS :active.',
    autofixable: false,
    message:
      'CSS :active cannot follow a captured menu drag on iOS. Use the Satin menu gesture state.',
  },
  {
    id: 'no-raw-viewport-height',
    description: 'Require Satin geometry tokens instead of raw vh-family units.',
    autofixable: false,
    message: 'Raw vh units bypass Satin geometry. Consume a --satin-* geometry token.',
  },
  {
    id: 'no-raw-safe-area-env',
    description: 'Require calibrated Satin inset tokens instead of safe-area env() access.',
    autofixable: false,
    message: 'Raw safe-area env() access bypasses Satin calibration. Consume --satin-inset-*.',
  },
  {
    id: 'no-raw-css-overflow-scroll',
    description: 'Require ScrollSurface instead of scrollable CSS overflow declarations.',
    autofixable: false,
    message:
      'Raw overflow scrolling bypasses ScrollSurface. Render scrolling content through Satin.',
  },
  {
    id: 'no-raw-inline-overflow-scroll',
    description: 'Require ScrollSurface instead of scrollable inline style properties.',
    autofixable: false,
    message:
      'Raw inline overflow scrolling bypasses ScrollSurface. Render scrolling content through Satin.',
  },
  {
    id: 'no-webkit-overflow-scrolling-css',
    description: 'Reserve the -webkit-overflow-scrolling CSS property for Satin.',
    autofixable: false,
    message:
      '-webkit-overflow-scrolling is framework-owned. Render scrolling content through ScrollSurface.',
  },
  {
    id: 'no-webkit-overflow-scrolling-inline',
    description: 'Reserve the WebkitOverflowScrolling inline style property for Satin.',
    autofixable: false,
    message:
      'WebkitOverflowScrolling is framework-owned. Render scrolling content through ScrollSurface.',
  },
  {
    id: 'no-raw-button',
    description: 'Require Pressable instead of raw button elements.',
    autofixable: false,
    message: 'Raw button activation bypasses Pressable. Render the control through Satin.',
  },
  {
    id: 'no-onclick-activation',
    description: 'Require Pressable onPress instead of raw onClick activation.',
    autofixable: false,
    message: 'onClick activation bypasses Pressable. Express activation with Pressable onPress.',
  },
  {
    id: 'no-direct-glass-import',
    description: 'Reserve liquid-glass and OpenGlass package imports for Satin.',
    autofixable: false,
    message:
      'Direct glass-library imports bypass Satin material ownership. Use GlassBar or TabBar from @satinhq/kit.',
  },
  {
    id: 'no-direct-sw-registration',
    description: 'Require registerAppShell instead of direct service-worker registration.',
    autofixable: false,
    message:
      'Direct service-worker registration bypasses Satin safe updates. Use registerAppShell.',
  },
  {
    id: 'no-raw-persistent-storage',
    description: 'Keep app data and restoration checkpoints framework-owned.',
    autofixable: false,
    message:
      'Use defineDatabase for records or createSceneRestoration/useSceneStorage for UI checkpoints instead of raw localStorage or indexedDB. See the documented escape hatch for integrations.',
  },
  {
    id: 'require-bottom-safe-area-inset',
    description: 'Require full-width bottom-pinned CSS geometry to use the Satin bottom inset.',
    autofixable: false,
    message: 'Bottom-pinned lab geometry must account for --satin-inset-bottom in the same rule.',
  },
]

export const rules = Object.freeze(
  Object.fromEntries(definitions.map(definition => [definition.id, Object.freeze(definition)])),
)

export const ruleManifest = Object.freeze(
  definitions.map(({ id, description, autofixable }) =>
    Object.freeze({ id, description, autofixable }),
  ),
)
