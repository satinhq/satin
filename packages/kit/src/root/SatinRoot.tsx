import { MediaPlayerRoot } from '../media/react.tsx'
import { useDisplayCornerRadius } from '../safe-area/displayCorners.ts'
import { installStatusBand } from '../app/statusBand.ts'
import { windowControlsBackInset } from '../safe-area/windowChrome.ts'
import { installGlassErrorAlert } from '../glass/errorAlert.ts'
import { reportGlassError, subscribeGlassErrors, type GlassError } from '../glass/errors.ts'
import { installKeyboardAdapter } from '../keyboard/adapter.ts'
import {
  setLaunchScreen,
  showLaunchFailure,
  setLaunchProgress,
  showAppliedUpdate,
  completeLaunchProgress,
} from '../app/launchScreenRuntime.ts'
import { settingsChromeTokens } from '../settings/tokens.ts'
import { installViewportPolicy } from '../app/viewport.ts'
import { prepareOfflineBundle, prepareLaunchContent } from '../app/launch.ts'
import { consumeJustUpdated, prepareColdLaunchUpdate } from '../app/coldLaunchUpdate.ts'
import {
  GLASS_LAUNCH_BUDGET_MS,
  armPreparationBudget,
  armVisibleLaunchBudget,
  glassLaunchTimedOut,
} from '../app/launchReadiness.ts'
import { hasUnsavedEditableState, trackEditableState } from '../app/backgroundUpdate.ts'
import { watchReleaseUpdates } from '../app/releaseUpdates.ts'
import { OrientationGuard } from '../app/OrientationGuard.tsx'
// measured-reference: definition-owned appearance and reachability.
import { getBuiltApp, useAppBackground, registerDefinedAppShell } from '../app/runtime.ts'
import { defineSatinApp, type AppDefinition } from '../app/definition.ts'
import { ReachabilityProvider, type OfflinePresentationProps } from '../reachability/react.tsx'
import type { ComponentType } from 'react'
import { flushSync } from 'react-dom'
import { AdaptiveTabsContext } from '../layout/adaptiveTabsContext.ts'
import { createLayoutClassState, reduceLayoutClass } from '../layout/layoutClass.ts'
import {
  lazy,
  Suspense,
  useEffect,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type PropsWithChildren,
} from 'react'

// Vite folds this branch away in release builds, including the dynamic chunk.
const DeveloperMenu = import.meta.env.SATIN_DEV_MENU
  ? lazy(() => import('../dev-menu/DevMenu.tsx'))
  : undefined
import { startDevFidelityAssertions } from '../fidelity/devAssertions.ts'
import { GlassMaterialRoot, type GlassDisplacementPolicy } from '../glass/GlassMaterialRoot.tsx'
import {
  GLASS_BAR_HEIGHT_PX,
  GLASS_BAR_EDGE_HIGHLIGHT_ALPHA,
  GLASS_BAR_SHADOW_ALPHA,
  GLASS_CLEAR_BRIGHTNESS,
  GLASS_COMPACT_TAB_BAR_HEIGHT_PX,
  GLASS_COMPACT_TAB_BAR_BOTTOM_GAP_PX,
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
} from '../glass/tokens.ts'
import {
  PRESSABLE_PRESSED_OPACITY,
  PRESSABLE_PRESS_IN_DURATION_MS,
  PRESSABLE_RELEASE_DURATION_MS,
  PRESSABLE_RELEASE_EASING,
} from '../press/tokens.ts'
import { useSafeAreaLayoutMetrics } from '../safe-area/useSafeAreaMetrics.ts'
import { readDeviceIdiom } from '../layout/deviceIdiom.ts'
import { bottomToolbarGeometry } from '../navigation/bottomToolbarGeometry.ts'
import {
  SETTINGS_BACK_BUTTON_INLINE_INSET_PX,
  SETTINGS_BACK_BUTTON_SIZE_PX,
  SETTINGS_DETAIL_CONTENT_TOP_OFFSET_PX,
  SETTINGS_DETAIL_INLINE_INSET_PX,
  SETTINGS_DETAIL_ROW_HEIGHT_PX,
  SETTINGS_DISCLOSURE_HEIGHT_PX,
  SETTINGS_DISCLOSURE_OFFSET_X_PX,
  SETTINGS_DISCLOSURE_OFFSET_Y_PX,
  SETTINGS_DISCLOSURE_WIDTH_PX,
  SETTINGS_GROUP_CORNER_RADIUS_PX,
  SETTINGS_GROUP_SPACING_PX,
  SETTINGS_LARGE_TITLE_FONT_SIZE_PX,
  SETTINGS_LARGE_TITLE_LINE_HEIGHT_PX,
  SETTINGS_NAVIGATION_BAR_HEIGHT_PX,
  settingsRootInlineInset,
  SETTINGS_ROOT_LARGE_TITLE_TOP_OFFSET_PX,
  SETTINGS_ROOT_ROW_HEIGHT_PX,
  SETTINGS_ROW_ICON_CORNER_RADIUS_PX,
  SETTINGS_ROW_ICON_SIZE_PX,
  SETTINGS_SEPARATOR_HAIRLINE_PX,
  SETTINGS_SEPARATOR_OFFSET_Y_PX,
  SETTINGS_SEPARATOR_TRAILING_INSET_PX,
  SETTINGS_ROW_TRAILING_INSET_PX,
} from '../settings/tokens.ts'
import { RuntimeContext, type SatinRuntime } from './runtimeContext.ts'

export type SatinRootProps = PropsWithChildren<
  Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
    app?: AppDefinition
    onAppShellReady?: (
      registration: import('../sw/registerAppShell.ts').SatinAppShellRegistration,
    ) => void
    offlinePresentation?: ComponentType<OfflinePresentationProps>
    /** Legacy specimens only; rejected when a build definition is present. */
    background?: string
    /** Retained for source compatibility; disabling glass now reports an error. */
    glassDisplacement?: GlassDisplacementPolicy
    /** Receives every renderer failure, including failures after launch. Release builds switch failed glass to the fallback material. */
    onGlassError?: (error: GlassError) => void
  }
>

/** The wrapped content and plain div attributes. */
export type SelectableProps = PropsWithChildren<HTMLAttributes<HTMLDivElement>>

type GeometryStyles = CSSProperties & Record<`--satin-${string}`, string>

function rememberAttribute(element: HTMLElement, name: string) {
  return {
    existed: element.hasAttribute(name),
    value: element.getAttribute(name),
  }
}

function installDocumentFlow(root: HTMLDivElement) {
  if (!import.meta.env.SATIN_FLOW_SHELL) return

  const targets = [document.documentElement, document.body, root.parentElement].filter(
    (element): element is HTMLElement => Boolean(element),
  )
  const markers = targets.map(element => ({
    element,
    previous: rememberAttribute(element, 'data-satin-flow-shell'),
  }))
  for (const element of targets) element.dataset.satinFlowShell = 'true'

  return () => {
    for (const { element, previous } of markers) {
      if (previous.existed) element.setAttribute('data-satin-flow-shell', previous.value ?? '')
      else element.removeAttribute('data-satin-flow-shell')
    }
  }
}

function installDocumentPolicy(root: HTMLDivElement, background: string, tint?: string) {
  const restoreDocumentFlow = installDocumentFlow(root)
  const previousTint = document.documentElement.style.getPropertyValue('--satin-tint')
  if (tint) document.documentElement.style.setProperty('--satin-tint', tint)
  const mount = root.parentElement
  const documentTargets = [document.documentElement, document.body]
  const previousDocumentState = documentTargets.map(element => ({
    element,
    marker: rememberAttribute(element, 'data-satin-document'),
    background: element.style.getPropertyValue('--satin-background'),
  }))
  const previousMountState = mount
    ? {
        marker: rememberAttribute(mount, 'data-satin-mount'),
        background: mount.style.getPropertyValue('--satin-background'),
      }
    : undefined
  const previousScrollRestoration = window.history.scrollRestoration
  window.history.scrollRestoration = 'manual'

  for (const element of documentTargets) {
    element.dataset.satinDocument = 'true'
    element.style.setProperty('--satin-background', background)
  }

  if (mount) {
    mount.dataset.satinMount = 'true'
    mount.style.setProperty('--satin-background', background)
  }

  return () => {
    if (previousTint) document.documentElement.style.setProperty('--satin-tint', previousTint)
    else document.documentElement.style.removeProperty('--satin-tint')
    restoreDocumentFlow?.()
    window.history.scrollRestoration = previousScrollRestoration
    for (const { element, marker, background: previousBackground } of previousDocumentState) {
      if (marker.existed) {
        element.setAttribute('data-satin-document', marker.value ?? '')
      } else {
        element.removeAttribute('data-satin-document')
      }

      if (previousBackground) {
        element.style.setProperty('--satin-background', previousBackground)
      } else {
        element.style.removeProperty('--satin-background')
      }
    }

    if (!mount || !previousMountState) return

    if (previousMountState.marker.existed) {
      mount.setAttribute('data-satin-mount', previousMountState.marker.value ?? '')
    } else {
      mount.removeAttribute('data-satin-mount')
    }

    if (previousMountState.background) {
      mount.style.setProperty('--satin-background', previousMountState.background)
    } else {
      mount.style.removeProperty('--satin-background')
    }
  }
}

/** Re-enters app-chrome policy inside a Selectable region. */
export function Chrome({ children, ...props }: SelectableProps) {
  return (
    <div {...props} data-satin-role="chrome">
      {children}
    </div>
  )
}

/** Lets the user select and copy the text inside it. App chrome turns text selection off
 * everywhere else, so wrap user-authored content such as notes or messages. */
export function Selectable({ children, ...props }: SelectableProps) {
  return (
    <div {...props} data-satin-role="content">
      {children}
    </div>
  )
}

export function SatinRoot({
  background: legacyBackground,
  app: suppliedApp,
  offlinePresentation,
  onAppShellReady,
  children,
  className,
  glassDisplacement = 'auto',
  onGlassError,
  style,
  ...props
}: SatinRootProps) {
  const builtApp = getBuiltApp()
  if (
    suppliedApp &&
    (!builtApp || JSON.stringify(defineSatinApp(suppliedApp)) !== JSON.stringify(builtApp))
  ) {
    throw new Error(
      'SatinRoot app differs from the build definition. Pass the same definition to satinApp().',
    )
  }
  const app = builtApp ?? suppliedApp
  const [justUpdated] = useState(() => (app ? consumeJustUpdated(app.scope) : null))
  const resolvedBackground = useAppBackground(app, legacyBackground)
  const background = app
    ? `var(--satin-launch-background, ${resolvedBackground})`
    : resolvedBackground
  if (app && (style?.background !== undefined || style?.backgroundColor !== undefined)) {
    throw new Error('SatinRoot style.background is owned by the app definition.')
  }
  const [launch, setLaunch] = useState<'preparing' | 'ready' | 'failed'>(
    app ? 'preparing' : 'ready',
  )
  const downloadActivity = useRef(0)
  const downloadedBytes = useRef(0)
  const launchAttempt = 0
  const [glassReady, setGlassReady] = useState(false)
  const [bundlePrepared, setBundlePrepared] = useState(import.meta.env.DEV || !app)
  const [glassFailed, setGlassFailed] = useState(false)
  useLayoutEffect(() => {
    installGlassErrorAlert()
    return subscribeGlassErrors(error => {
      // A renderer failure owns its visible error alert, never the app's
      // content/launch state. In particular, loss during resume cannot blank it.
      setGlassFailed(true)
      onGlassError?.(error)
    })
  }, [onGlassError])
  const mediaActive = useRef(false)
  const mediaSafetyChanged = useRef<(() => void) | null>(null)
  const onMediaActivityChange = useCallback((active: boolean) => {
    mediaActive.current = active
    if (!active) mediaSafetyChanged.current?.()
  }, [])
  const unsavedTokens = useRef(new Set<symbol>())
  const editableState = useRef<ReturnType<typeof trackEditableState> | null>(null)
  const registerUnsavedChanges = useCallback((token: symbol) => {
    unsavedTokens.current.add(token)
    return () => {
      unsavedTokens.current.delete(token)
    }
  }, [])
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const tracker = trackEditableState(root)
    editableState.current = tracker
    return () => {
      tracker.dispose()
      editableState.current = null
    }
  }, [])
  // Initial launch waits for glass. A resumed process retains its mounted app;
  // appearance/context recovery must not restore the logo or hide its content.
  const presentationPending = Boolean(app) && launch !== 'ready'
  useLayoutEffect(() => {
    if (app && launch !== 'failed') setLaunchScreen(launch === 'preparing')
  }, [app, launch])
  const [preparedAttempt, setPreparedAttempt] = useState<number | null>(null)
  useLayoutEffect(() => {
    performance.mark('satin-first-react-commit')
  }, [])
  useLayoutEffect(() => {
    if (glassReady) performance.mark('satin-glass-ready')
  }, [glassReady])
  useLayoutEffect(() => {
    if (launch === 'ready') performance.mark('satin-launch-revealed')
  }, [launch])
  const shellObserver = useRef(onAppShellReady)
  useLayoutEffect(() => {
    shellObserver.current = onAppShellReady
  }, [onAppShellReady])
  useEffect(() => {
    if (!app || launch !== 'preparing') return
    const contentPreparation = new AbortController()
    let cancelled = false
    const prepare = async () => {
      try {
        const [bundleReady] = await Promise.all([
          import.meta.env.DEV
            ? Promise.resolve(true)
            : prepareOfflineBundle(app.scope, 20_000, progress => {
                if (progress && progress.loaded > downloadedBytes.current) {
                  downloadActivity.current = performance.now()
                  downloadedBytes.current = progress.loaded
                }
                // First-install bytes describe a real download in every profile.
                // Applied-update confirmation remains a separate successor phase.
                setLaunchProgress(progress)
              }).then(ready => {
                if (!cancelled && ready) setBundlePrepared(true)
                return ready
              }),
          prepareLaunchContent(rootRef.current!, contentPreparation.signal),
        ])
        if (cancelled || !bundleReady) return
        if (app.updateProfile === 'release' && !import.meta.env.DEV) {
          downloadedBytes.current = 0
          const result = await prepareColdLaunchUpdate(
            app.scope,
            progress => {
              if (cancelled) return
              if (progress && progress.loaded > downloadedBytes.current) {
                downloadActivity.current = performance.now()
                downloadedBytes.current = progress.loaded
              }
              setLaunchProgress(progress)
            },
            {
              canActivate: () => !cancelled,
              // Retries can advance while the visible ring holds its previous
              // maximum. Readiness follows transfer activity, not arc position.
              onActivity: () => {
                if (!cancelled) downloadActivity.current = performance.now()
              },
            },
          )
          if (cancelled || result === 'reloading') return
          // The parser also detects updates activated after the old process
          // closed. Keep the app inert until either confirmation path finishes.
          const confirmation = justUpdated ? showAppliedUpdate() : completeLaunchProgress()
          if (!(await confirmation) || cancelled) return
        }
        // This async gate is complete, not speculative rendering work. Commit
        // its handoff now instead of leaving an already-prepared app covered
        // behind React's ordinary task scheduling after worker activation.
        flushSync(() => setPreparedAttempt(launchAttempt))
      } catch (error) {
        if (!cancelled) {
          performance.mark('satin-launch-preparation-failed')
          showLaunchFailure(error instanceof Error ? error.message : String(error))
          setLaunch('failed')
          console.error('Satin launch failed', error)
        }
      }
    }
    void prepare()
    return () => {
      cancelled = true
      contentPreparation.abort()
    }
  }, [app, launch, launchAttempt, justUpdated])
  // Glass reports after its filter commit; decoded content is already mounted.
  // Reveal that committed tree without adding two idle animation frames.
  useLayoutEffect(() => {
    if (
      launch !== 'preparing' ||
      (!glassReady && !glassFailed) ||
      preparedAttempt !== launchAttempt
    )
      return
    performance.mark('satin-launch-ready')
    setLaunch('ready')
  }, [launch, glassReady, glassFailed, preparedAttempt, launchAttempt])
  useEffect(() => {
    if (launch !== 'preparing' || preparedAttempt !== launchAttempt || glassReady || glassFailed)
      return
    // Hidden pages cannot present; only visible time counts toward the budget.
    return armVisibleLaunchBudget(() => {
      if (glassLaunchTimedOut(true, glassReady, GLASS_LAUNCH_BUDGET_MS))
        reportGlassError(
          'readiness-timeout',
          `Glass did not present within ${GLASS_LAUNCH_BUDGET_MS} ms of visible time.`,
          'launch',
        )
    })
  }, [launch, preparedAttempt, launchAttempt, glassReady, glassFailed])
  useEffect(() => {
    if (launch !== 'preparing' || preparedAttempt === launchAttempt) return
    downloadActivity.current = performance.now()
    downloadedBytes.current = 0
    return armPreparationBudget(
      () => {
        const message = 'App preparation stopped making progress. Please try again.'
        performance.mark('satin-launch-preparation-timeout')
        showLaunchFailure(message)
        setLaunch('failed')
        console.error('Satin launch preparation timed out after 30 seconds of visible idle time.')
      },
      () => downloadActivity.current,
    )
  }, [launch, launchAttempt, preparedAttempt])
  useEffect(() => {
    if (!app || import.meta.env.DEV || launch !== 'ready') return
    let cancelled = false
    void registerDefinedAppShell(app)
      .then(registration => {
        if (!cancelled && registration) shellObserver.current?.(registration)
      })
      .catch(error => console.error('Satin update check failed', error))
    return () => {
      cancelled = true
    }
  }, [app, launch])
  useLayoutEffect(() => {
    if (!app || import.meta.env.DEV || app.updateProfile !== 'release' || launch !== 'ready') return
    const safe = () => {
      const root = rootRef.current
      return (
        root !== null &&
        !mediaActive.current &&
        unsavedTokens.current.size === 0 &&
        !editableState.current?.hasUnsavedChanges() &&
        !hasUnsavedEditableState(root)
      )
    }
    const updates = watchReleaseUpdates(app.scope, safe)
    mediaSafetyChanged.current = updates.attempt
    return () => {
      mediaSafetyChanged.current = null
      updates.dispose()
    }
  }, [app, launch])
  const [tabHeights, setTabHeights] = useState<Record<string, number>>({})
  const tabRegistration = useMemo(
    () => ({
      register: (id: string, height: number) =>
        setTabHeights(current => (current[id] === height ? current : { ...current, [id]: height })),
      unregister: (id: string) =>
        setTabHeights(current => {
          if (!(id in current)) return current
          const next = { ...current }
          delete next[id]
          return next
        }),
    }),
    [],
  )
  const tabs = { ...tabRegistration, height: Math.max(0, ...Object.values(tabHeights)) }
  const rootRef = useRef<HTMLDivElement>(null)
  const initialHistoryLength = useRef(window.history.length)
  useLayoutEffect(() => installViewportPolicy(app?.viewportFit), [app?.viewportFit])
  useLayoutEffect(() => (rootRef.current ? installStatusBand(rootRef.current) : undefined), [])
  const metrics = useSafeAreaLayoutMetrics()
  // Establish the viewport ruler before keyboard geometry takes its baseline.
  useLayoutEffect(() => (rootRef.current ? installKeyboardAdapter(rootRef.current) : undefined), [])
  const [layout, setLayout] = useState(() => createLayoutClassState(metrics.layoutViewport))
  const nextLayout = reduceLayoutClass(layout, metrics.layoutViewport).state
  // React restarts this component before committing children. Context and CSS therefore
  // observe the same geometry/class sample, without an effect's one-frame lag.
  if (nextLayout !== layout) setLayout(nextLayout)
  const runtime = useMemo<SatinRuntime>(
    () => ({
      layoutClass: nextLayout.layoutClass,
      layoutClassRevision: nextLayout.revision,
      standalone: metrics.standalone,
      coordinateSpacesReconcile: metrics.coordinateSpacesReconcile,
      metrics,
      justUpdated,
      launchReady: launch === 'ready',
      registerUnsavedChanges,
    }),
    [metrics, nextLayout, justUpdated, launch, registerUnsavedChanges],
  )
  const phone = readDeviceIdiom() === 'phone'
  const compactPhoneChrome = phone && metrics.layoutViewport.width > metrics.layoutViewport.height
  const bottomToolbar = bottomToolbarGeometry(phone, compactPhoneChrome, metrics.insets.bottom)
  const displayCornerRadius = useDisplayCornerRadius()
  const geometryStyles: GeometryStyles = {
    ...style,
    '--satin-display-corner-radius': `${displayCornerRadius}px`,
    '--satin-layout-horizontal': nextLayout.layoutClass.horizontal,
    '--satin-window-controls-back-inset': `${windowControlsBackInset(metrics)}px`,
    '--satin-window-controls-toolbar-top': `${windowControlsBackInset(metrics) ? 10 : 0}px`,
    '--satin-layout-vertical': nextLayout.layoutClass.vertical,
    '--satin-background': background,
    '--satin-status-band-frame-height': `${metrics.layoutViewport.height}px`,
    '--satin-pressable-pressed-opacity': `${PRESSABLE_PRESSED_OPACITY}`,
    '--satin-pressable-press-in-duration': `${PRESSABLE_PRESS_IN_DURATION_MS}ms`,
    '--satin-pressable-release-duration': `${PRESSABLE_RELEASE_DURATION_MS}ms`,
    '--satin-pressable-release-easing': PRESSABLE_RELEASE_EASING,
    '--satin-settings-menu-toolbar-trailing': `${settingsChromeTokens.menuToolbarTrailingInsetPx}px`,
    '--satin-settings-menu-toolbar-width': `${settingsChromeTokens.menuToolbarWidthPx}px`,
    '--satin-settings-menu-toolbar-height': `${settingsChromeTokens.menuToolbarHeightPx}px`,
    '--satin-settings-root-inline-inset': `${settingsRootInlineInset(metrics.layoutViewport.width, metrics.screen)}px`,
    '--satin-settings-detail-inline-inset': `${SETTINGS_DETAIL_INLINE_INSET_PX}px`,
    '--satin-settings-root-title-offset': `${SETTINGS_ROOT_LARGE_TITLE_TOP_OFFSET_PX}px`,
    '--satin-settings-detail-content-offset': `${SETTINGS_DETAIL_CONTENT_TOP_OFFSET_PX}px`,
    '--satin-settings-root-title-top': `${metrics.insets.top + SETTINGS_ROOT_LARGE_TITLE_TOP_OFFSET_PX}px`,
    '--satin-settings-large-title-size': `${SETTINGS_LARGE_TITLE_FONT_SIZE_PX}px`,
    '--satin-settings-large-title-line-height': `${SETTINGS_LARGE_TITLE_LINE_HEIGHT_PX}px`,
    '--satin-settings-navigation-bar-height': `${SETTINGS_NAVIGATION_BAR_HEIGHT_PX}px`,
    '--satin-settings-back-button-inline-inset': `${SETTINGS_BACK_BUTTON_INLINE_INSET_PX}px`,
    '--satin-settings-back-button-size': `${SETTINGS_BACK_BUTTON_SIZE_PX}px`,
    '--satin-settings-detail-content-top': `${metrics.insets.top + SETTINGS_DETAIL_CONTENT_TOP_OFFSET_PX}px`,
    '--satin-settings-root-row-height': `${SETTINGS_ROOT_ROW_HEIGHT_PX}px`,
    '--satin-settings-detail-row-height': `${SETTINGS_DETAIL_ROW_HEIGHT_PX}px`,
    '--satin-settings-group-radius': `${SETTINGS_GROUP_CORNER_RADIUS_PX}px`,
    '--satin-settings-row-icon-size': `${SETTINGS_ROW_ICON_SIZE_PX}px`,
    '--satin-settings-row-icon-radius': `${SETTINGS_ROW_ICON_CORNER_RADIUS_PX}px`,
    '--satin-device-pixel': `${1 / (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1)}px`,
    '--satin-settings-separator-hairline': `${SETTINGS_SEPARATOR_HAIRLINE_PX}px`,
    '--satin-settings-separator-offset-y': `${SETTINGS_SEPARATOR_OFFSET_Y_PX}px`,
    '--satin-settings-separator-trailing': `${SETTINGS_SEPARATOR_TRAILING_INSET_PX}px`,
    '--satin-settings-row-trailing': `${SETTINGS_ROW_TRAILING_INSET_PX}px`,
    '--satin-settings-disclosure-width': `${SETTINGS_DISCLOSURE_WIDTH_PX}px`,
    '--satin-settings-disclosure-height': `${SETTINGS_DISCLOSURE_HEIGHT_PX}px`,
    '--satin-settings-disclosure-offset-x': `${SETTINGS_DISCLOSURE_OFFSET_X_PX}px`,
    '--satin-settings-disclosure-offset-y': `${SETTINGS_DISCLOSURE_OFFSET_Y_PX}px`,
    '--satin-settings-group-spacing': `${SETTINGS_GROUP_SPACING_PX}px`,
    '--satin-glass-bar-height': `${GLASS_BAR_HEIGHT_PX}px`,
    '--satin-glass-tab-bar-height': `${compactPhoneChrome ? GLASS_COMPACT_TAB_BAR_HEIGHT_PX : GLASS_TAB_BAR_HEIGHT_PX}px`,
    '--satin-glass-tab-bar-inline-inset': `${GLASS_TAB_BAR_INLINE_INSET_PX}px`,
    '--satin-glass-tab-bar-bottom-gap': `${compactPhoneChrome ? GLASS_COMPACT_TAB_BAR_BOTTOM_GAP_PX : GLASS_TAB_BAR_BOTTOM_GAP_PX}px`,
    '--satin-glass-control-size': `${GLASS_CONTROL_SIZE_PX}px`,
    '--satin-glass-regular-saturation': `${GLASS_REGULAR_SATURATION}`,
    '--satin-glass-clear-saturation': `${GLASS_CLEAR_SATURATION}`,
    '--satin-glass-regular-brightness': `${GLASS_REGULAR_BRIGHTNESS}`,
    '--satin-glass-clear-brightness': `${GLASS_CLEAR_BRIGHTNESS}`,
    '--satin-glass-regular-tint-alpha': `${GLASS_REGULAR_TINT_ALPHA}`,
    '--satin-glass-clear-tint-alpha': `${GLASS_CLEAR_TINT_ALPHA}`,
    '--satin-glass-tint-rgb': GLASS_TINT_RGB,
    '--satin-glass-bar-edge-highlight-alpha': `${GLASS_BAR_EDGE_HIGHLIGHT_ALPHA}`,
    '--satin-glass-bar-shadow-alpha': `${GLASS_BAR_SHADOW_ALPHA}`,
    '--satin-glass-selection-duration': `${GLASS_SELECTION_DURATION_MS}ms`,
    '--satin-glass-selection-easing': GLASS_SELECTION_EASING,
    '--satin-bottom-toolbar-height': `${bottomToolbar.height}px`,
    '--satin-bottom-toolbar-gap': `${bottomToolbar.gap}px`,
    '--satin-bottom-toolbar-inline-inset': `${bottomToolbar.inlineInset}px`,
    '--satin-bottom-toolbar-content-inset': `${bottomToolbar.contentInset}px`,
    '--satin-inset-top': `${metrics.insets.top}px`,
    '--satin-inset-right': `${metrics.insets.right}px`,
    '--satin-inset-bottom': `${metrics.insets.bottom}px`,
    '--satin-inset-left': `${metrics.insets.left}px`,
    '--satin-safe-frame-width': `${metrics.safeFrame.width}px`,
    '--satin-safe-frame-height': `${metrics.safeFrame.height}px`,
  }

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return

    return installDocumentPolicy(root, background, app?.appearance.tint)
  }, [
    background,
    app?.appearance.tint,
    metrics.insets.top,
    metrics.layoutViewport.height,
    metrics.standalone,
  ])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const suppressChromeContextMenu = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return
      const role = event.target.closest('[data-satin-role]')
      if (role?.getAttribute('data-satin-role') === 'chrome') {
        event.preventDefault()
      }
    }

    root.addEventListener('contextmenu', suppressChromeContextMenu)
    return () => root.removeEventListener('contextmenu', suppressChromeContextMenu)
  }, [])

  useEffect(() => {
    if (!import.meta.env.DEV) return
    return startDevFidelityAssertions(initialHistoryLength.current)
  }, [])

  return (
    <RuntimeContext value={runtime}>
      <MediaPlayerRoot onActivityChange={onMediaActivityChange}>
        <div
          {...props}
          ref={rootRef}
          className={className}
          data-satin-role="chrome"
          data-satin-root="true"
          data-satin-launch={launch}
          data-satin-presentation={presentationPending ? 'preparing' : 'ready'}
          inert={launch !== 'ready' || presentationPending}
          data-satin-layout-horizontal={nextLayout.layoutClass.horizontal}
          data-satin-layout-vertical={nextLayout.layoutClass.vertical}
          style={geometryStyles}
        >
          <AdaptiveTabsContext value={tabs}>
            <div data-satin-status-band-source="scene">
              <GlassMaterialRoot
                displacement={glassDisplacement}
                prepared={bundlePrepared}
                onLaunchReady={setGlassReady}
              >
                {DeveloperMenu && app && launch === 'ready' ? (
                  <Suspense fallback={null}>
                    <DeveloperMenu />
                  </Suspense>
                ) : null}
                {app ? (
                  <OrientationGuard
                    app={app}
                    width={metrics.safeFrame.width}
                    height={metrics.safeFrame.height}
                  >
                    <ReachabilityProvider profile={app} offlinePresentation={offlinePresentation}>
                      {children}
                    </ReachabilityProvider>
                  </OrientationGuard>
                ) : (
                  children
                )}
              </GlassMaterialRoot>
            </div>
          </AdaptiveTabsContext>
        </div>
      </MediaPlayerRoot>
    </RuntimeContext>
  )
}
