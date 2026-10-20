import { SheetChromeContext } from '../presentation/sheetChromeContext.ts'
import { NavigationLayoutContext } from '../layout/navigationLayoutContext.ts'
import { registerRowNavigationOwner, rowSwipeTouchAction } from '../actions/recognizers.ts'
import {
  useScreenChrome,
  useScreenNavigation,
  NavigationSizeClassContext,
  ScreenChromeContext,
} from '../public/chrome.tsx'
import { navigationGlassRoutes, publishNavigationGlass } from './glassTransition.ts'
import { decideZoomTransition } from './zoomTransition.ts'
import { TabActivityContext, TabRegistrationContext } from '../tabs/context.ts'

import { MaterialEffectContext } from '../glass/liquidContext.ts'
import { sidebarTokens, sidebarCssTokens } from '../settings/tokens.ts'
// measured-reference: route policy follows the Navigator screen identity.
import { ReachabilityRoute } from '../reachability/react.tsx'
import { AdaptiveTabsContext } from '../layout/adaptiveTabsContext.ts'
import { registerNavigationKeyboard } from './keyboard.ts'
import { SplitContext } from './splitContext.ts'
import { createSplitNavigationState, reduceSplitNavigation } from './splitState.ts'
import {
  useCallback,
  useContext,
  useState,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from 'react'
import { useSatinLayoutRuntime } from '../root/runtimeContext.ts'
import { armPointerClickSuppression } from '../press/activation.ts'
import { cancelPointerPressForOwnedGesture } from '../press/gestureArbitration.ts'
import { NavigatorContext, NavigationPaneContext } from './navigationContext.tsx'
import { NavigationChrome } from './NavigationChrome.tsx'
import { backButtonVisible, resolveNavigationTitle } from './navigationChromeModel.ts'
import type { InteractivePopGesture } from './interactivePop.ts'
import { NAVIGATION_EDGE_SHADOW_WIDTH_PX } from './motionTokens.ts'
import { retireNativeScrubSource } from './nativeScrubSource.ts'
import {
  createInteractiveScrubFrameLoop,
  type InteractiveScrubFrameLoop,
  type ScrubFrameMetrics,
} from './scrubFrameLoop.ts'
import type { ScreenRegistry } from './registry.ts'
import {
  gestureOwnsTransition,
  navigatorScrollRuntime,
  navigatorTransitionRuntime,
  type NavigatorStore,
  type RegistryScreenEntry,
} from './store.ts'
import { isEntryCovered } from './stack.ts'
import { collectTransitionBindings } from './transitionBindings.ts'
import type {
  BoundNavigatorTransition,
  TransitionNavigationElements,
  TransitionScreenElements,
} from './transitionBindings.ts'
import {
  scrubFrameDiagnostic,
  type EarlyTouchArbitration,
  type InteractivePopDiagnostic,
  type InteractiveTransitionController,
  type NavigatorHostGeometry,
  type ScrubDiagnosticState,
} from './interactivePopTypes.ts'
import { bindTouchArbitration } from './touchArbitration.ts'
import { bindScopedBackSwipe } from './scopedBackSwipe.ts'
import { PaneGestureScopeContext, gestureScopeFlagEnabled } from '../gestures/scopeContext.ts'
import { createPointerPopHandlers } from './pointerPop.ts'
import { DetailScrubSource, StackScrubSource, stackScrubHostStyle } from './ScrubSourceFrames.tsx'
import {
  ScreenContainer,
  renderedScreenIndices,
  compositedScreenIndices,
} from './ScreenContainer.tsx'

export {
  renderedScreenIndices,
  ScreenContainer,
  type ScreenContainerProps,
} from './ScreenContainer.tsx'
export { hiddenByMultiPop } from './stack.ts'
export type { InteractivePopDiagnostic } from './interactivePopTypes.ts'

type OwnedNavigatorHandlers =
  | 'children'
  | 'onLostPointerCapture'
  | 'onPointerCancel'
  | 'onPointerDown'
  | 'onPointerMove'
  | 'onPointerUp'

export type NavigatorHostProps<Registry extends ScreenRegistry> = Omit<
  HTMLAttributes<HTMLDivElement>,
  OwnedNavigatorHandlers
> &
  Readonly<{
    trailing?: ReactNode
    navigator: NavigatorStore<Registry>
    /** Explicit split-view host. Ordinary navigation stacks never adapt into columns. */
    adaptive?: boolean
    /** Optional zero-state diagnostic sink; no samples are created when omitted. */
    onInteractivePopDiagnostic?: (diagnostic: InteractivePopDiagnostic) => void
  }>

export function NavigatorHost<Registry extends ScreenRegistry>({
  navigator,
  adaptive = false,
  trailing,
  onInteractivePopDiagnostic,
  style,
  ...props
}: NavigatorHostProps<Registry>) {
  const registerSheetChrome = useContext(SheetChromeContext)
  const chrome = useScreenChrome()
  const screenChrome = useContext(ScreenChromeContext)
  const tabActive = useContext(TabActivityContext)
  const registerTab = useContext(TabRegistrationContext)
  useLayoutEffect(
    () =>
      registerTab?.(() => {
        const entries = navigator.getState().entries
        if (entries.some((entry, index) => index > 0 && entry.transition.phase !== 'exiting'))
          navigator.popToRoot()
        else navigator[navigatorScrollRuntime].scrollPrimaryToTop(entries[0]?.key)
      }),
    [navigator, registerTab],
  )
  const runtime = useSatinLayoutRuntime()
  const screenNavigation = useScreenNavigation(runtime.layoutClass.vertical)
  const glass = useContext(MaterialEffectContext)
  const tabs = useContext(AdaptiveTabsContext)
  const scopedHorizontal = useContext(NavigationLayoutContext)
  const horizontal = adaptive ? (scopedHorizontal ?? runtime.layoutClass.horizontal) : 'compact'
  const stackSourceRef = useRef<HTMLDivElement>(null)
  const detailSourceRef = useRef<HTMLDivElement>(null)
  // Capability is fixed for this host's lifetime. A gesture never changes owner.
  const [directionalRowPanning] = useState(
    () => typeof CSS !== 'undefined' && CSS.supports('touch-action', 'pan-y pan-right pinch-zoom'),
  )
  const [nativeNavigation] = useState(
    () => typeof window !== 'undefined' && 'ScrollTimeline' in window,
  )
  // Experimental: inside a shared pane scope (the experimental drawer), or with the development
  // flag, the back swipe is a participant of the private gesture scope. Fixed for this host's
  // lifetime, like the native driver.
  const paneScope = useContext(PaneGestureScopeContext)
  const [scopedGestures] = useState(() => paneScope !== undefined || gestureScopeFlagEnabled())
  const hostRef = useRef<HTMLDivElement>(null)
  const screenElements = useRef(new Map<string, TransitionScreenElements>())
  const navigationTitleElements = useMemo(() => new Map<string, HTMLElement>(), [])
  const navigationBackButton = useRef<HTMLButtonElement>(null)
  const navigationBackButtonMask = useRef<HTMLSpanElement>(null)
  const navigationBackButtonVisual = useRef<HTMLSpanElement>(null)
  const hostGeometryRef = useRef<NavigatorHostGeometry | undefined>(undefined)
  const boundTransitionsRef = useRef<(BoundNavigatorTransition & { release: () => void })[]>([])
  const retainedControllersRef = useRef(new Set<BoundNavigatorTransition['controller']>())
  const releaseTouchClaimRef = useRef<(() => void) | undefined>(undefined)
  const gestureRef = useRef<InteractivePopGesture | undefined>(undefined)
  const earlyTouchArbitrationRef = useRef<EarlyTouchArbitration | undefined>(undefined)
  const interactiveControllerRef = useRef<InteractiveTransitionController | undefined>(undefined)
  const earlyTouchControllerRef = useRef<InteractiveTransitionController | undefined>(undefined)
  const scrubFrameLoopRef = useRef<InteractiveScrubFrameLoop | undefined>(undefined)
  const scrubDiagnosticStateRef = useRef<ScrubDiagnosticState | undefined>(undefined)
  const state = useSyncExternalStore(navigator.subscribe, navigator.getState, navigator.getState)
  useLayoutEffect(() => {
    if (tabActive) return
    // Settle automatic work, cancel a held back gesture, then stop its loop.
    scrubFrameLoopRef.current?.dispose()
    scrubFrameLoopRef.current = undefined
    for (const transition of navigator[navigatorTransitionRuntime].descriptors()) {
      if (transition.interactive) transition.controller.cancel()
      else transition.controller.finish()
    }
    const pointerId = gestureRef.current?.pointerId
    if (pointerId !== undefined && hostRef.current?.hasPointerCapture(pointerId))
      hostRef.current.releasePointerCapture(pointerId)
    gestureRef.current = undefined
    earlyTouchArbitrationRef.current = undefined
  }, [navigator, tabActive, state])
  const [appliedHorizontal, setAppliedHorizontal] = useState(horizontal)
  const splitState = useRef(
    createSplitNavigationState(
      horizontal,
      state,
      navigator[navigatorTransitionRuntime].descriptors(),
    ),
  )
  const sidebarKey = `sidebar:${navigator.restoration?.key ?? ''}`
  const [sidebarHidden, setSidebarHiddenState] = useState(
    () => navigator.restoration?.scene.read(sidebarKey) === true,
  )
  const setSidebarHidden = (hidden: boolean) => {
    navigator.restoration?.scene.write(sidebarKey, hidden)
    setSidebarHiddenState(hidden)
  }
  const split = appliedHorizontal === 'regular'
  const nativeSourceRef = split ? detailSourceRef : stackSourceRef
  const inputEntry = state.entries.findLast(entry => entry.transition.phase !== 'exiting')
  const activeNavigation = inputEntry
    ? screenNavigation(
        navigator.registry.resolve(inputEntry.screenId)?.navigation,
        chrome?.get(inputEntry.key),
        inputEntry.params,
      )
    : undefined
  const activeTitle = resolveNavigationTitle(activeNavigation, inputEntry?.params)
  const ownsSheetTitle = tabActive && activeNavigation?.display !== 'none' && Boolean(activeTitle)
  useLayoutEffect(
    () => (ownsSheetTitle ? registerSheetChrome?.() : undefined),
    [registerSheetChrome, ownsSheetTitle],
  )
  const retainedReadyAt = inputEntry && glass?.preparedSources?.get(inputEntry.key)
  const sourcePending =
    !split &&
    Boolean(
      glass?.preparingSources &&
      retainedReadyAt === undefined &&
      glass.preparedScreenKey !== inputEntry?.key,
    )
  const paneEntries = useMemo(
    () => (split ? state.entries.slice(1) : state.entries),
    [split, state.entries],
  )
  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    return registerNavigationKeyboard({
      host,
      enabled: () => tabActive && horizontal === appliedHorizontal,
      canPop: () => {
        const entries = navigator.getState().entries
        return (
          entries.length > (split ? 2 : 1) &&
          navigator[navigatorTransitionRuntime].descriptors().length === 0
        )
      },
      pop: () => {
        navigator.pop()
      },
    })
  }, [navigator, tabActive, horizontal, appliedHorizontal, split])
  // Fresh iOS 27 captures: mini portrait (744 pt) uses 296 pt; landscape
  // (1133 pt) and Pro use 320 pt. Follow the window, not physical device size.
  const sidebarWidth = runtime.metrics.layoutViewport.width <= 744 ? 296 : sidebarTokens.width
  const initialSelectionAvailable = useRef(horizontal === 'regular' && state.entries.length === 1)
  const claimInitialSelection = useCallback(() => {
    const available = initialSelectionAvailable.current
    initialSelectionAvailable.current = false
    return available
  }, [])
  const sidebarNavigator = useMemo(
    () => ({
      ...navigator,
      push: navigator.selectDetail,
    }),
    [navigator],
  )
  const selectionEntry = state.entries[1]
  const selectionDefinition = selectionEntry
    ? navigator.registry.resolve(selectionEntry.screenId)
    : undefined
  const selectionIdentity = selectionDefinition?.splitSelection
  const splitSelection = {
    claimInitialSelection,
    mode: split ? ('split' as const) : ('stack' as const),
    entry: selectionEntry,
    identity:
      typeof selectionIdentity === 'function'
        ? selectionIdentity(selectionEntry?.params)
        : (selectionIdentity ?? selectionEntry?.screenId),
  }

  // Keep existing layers bound until every controller has resolved. Never infer
  // interactive ownership from an exiting phase; use the store's real descriptor.
  useLayoutEffect(() => {
    let reduction = reduceSplitNavigation(splitState.current, {
      type: 'navigator-synchronized',
      navigator: state,
      transitions: navigator[navigatorTransitionRuntime].descriptors(),
    })
    const commands = [...reduction.commands]
    reduction = reduceSplitNavigation(reduction.state, {
      type: 'horizontal-class-changed',
      horizontal,
    })
    commands.push(...reduction.commands)
    splitState.current = reduction.state
    if (horizontal !== appliedHorizontal) {
      const pointerId = gestureRef.current?.pointerId
      const hadGesture = pointerId !== undefined || earlyTouchArbitrationRef.current !== undefined
      scrubFrameLoopRef.current?.dispose()
      scrubFrameLoopRef.current = undefined
      scrubDiagnosticStateRef.current = undefined
      gestureRef.current = undefined
      earlyTouchArbitrationRef.current = undefined
      interactiveControllerRef.current = undefined
      earlyTouchControllerRef.current = undefined
      if (hadGesture) armPointerClickSuppression(performance.now())
      if (pointerId !== undefined) {
        cancelPointerPressForOwnedGesture(pointerId)
        if (hostRef.current?.hasPointerCapture(pointerId))
          hostRef.current.releasePointerCapture(pointerId)
      }
    }
    for (const command of commands) {
      if (command.type === 'cancel-interactive-transition') {
        retainedControllersRef.current.add(command.controller)
        releaseTouchClaimRef.current?.()
        if (command.controller.cancelInteractive) command.controller.cancelInteractive(0)
        else command.controller.cancel()
      } else command.controller.finish()
    }
    const next = reduction.state.appliedHorizontalClass
    if (next !== appliedHorizontal) {
      if (appliedHorizontal === 'regular') {
        const root = navigator.getState().entries[0]
        if (root) navigator[navigatorScrollRuntime].capture([root.key])
      }
      setAppliedHorizontal(next)
    }
  }, [appliedHorizontal, horizontal, navigator, state])

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    return registerRowNavigationOwner(
      host,
      target =>
        !target.closest('[data-satin-pane="sidebar"]') &&
        tabActive &&
        horizontal === appliedHorizontal &&
        (!split || navigator.getState().entries.length > 2) &&
        navigator[navigatorTransitionRuntime].canBeginInteractivePop(),
    )
  }, [navigator, tabActive, horizontal, appliedHorizontal, split])

  const transitionActive = state.entries.some(entry => entry.transition.phase !== 'settled')
  const automaticPushActive =
    !split &&
    navigator[navigatorTransitionRuntime]
      .descriptors()
      .some(transition => !transition.interactive && transition.operation === 'push')

  // An idle private source owns no content movement, even when a back target exists.
  // A live contact may move it before recognition; content scrollers retain their own offsets.
  useLayoutEffect(() => {
    const source = nativeSourceRef.current
    if (!nativeNavigation || !source || transitionActive) return
    const clamp = () => {
      if (earlyTouchArbitrationRef.current || gestureRef.current) return
      if (paneScope?.contentSourceBorrowed()) return
      const origin = source.clientWidth * 2
      if (source.scrollLeft !== origin) source.scrollLeft = origin
    }
    source.addEventListener('scroll', clamp, { passive: true })
    clamp()
    return () => source.removeEventListener('scroll', clamp)
  }, [nativeNavigation, nativeSourceRef, split, state.entries.length, transitionActive, paneScope])

  // A shared pane scope's drawer opens from the same private stack scroller (one native source
  // per pane, assigned per contact by the scope).
  useLayoutEffect(() => {
    if (!paneScope) return
    const native = nativeNavigation && !split
    paneScope.publishContent({
      source: native ? stackSourceRef.current : null,
      movable: native ? hostRef.current : null,
      atRoot: () =>
        navigator.getState().entries.length === 1 &&
        navigator[navigatorTransitionRuntime].descriptors().length === 0,
    })
    return () => paneScope.publishContent(null)
  }, [paneScope, nativeNavigation, split, navigator])

  useLayoutEffect(() => {
    if (nativeNavigation && !transitionActive && nativeSourceRef.current)
      nativeSourceRef.current.scrollLeft = nativeSourceRef.current.clientWidth * 2
  }, [
    nativeNavigation,
    nativeSourceRef,
    transitionActive,
    state.entries.length,
    split,
    sidebarHidden,
    runtime.metrics.layoutViewport.width,
  ])

  const startScrubFrameLoop = useCallback(
    (controller: InteractiveTransitionController, diagnosticState: ScrubDiagnosticState) => {
      scrubFrameLoopRef.current?.dispose()
      scrubDiagnosticStateRef.current = diagnosticState
      const loop = createInteractiveScrubFrameLoop({
        applyProgress: progress => controller.setProgress(progress),
        cancelFrame: frame => window.cancelAnimationFrame(frame),
        ...(onInteractivePopDiagnostic
          ? {
              onFrame: (metrics: ScrubFrameMetrics) =>
                onInteractivePopDiagnostic(scrubFrameDiagnostic(diagnosticState, metrics)),
            }
          : {}),
        requestFrame: callback => window.requestAnimationFrame(callback),
        resolve: (target, velocityPointsPerSecond) => {
          if (target === 'complete') {
            controller.completeInteractive(velocityPointsPerSecond)
          } else {
            controller.cancelInteractive(velocityPointsPerSecond)
          }
        },
      })
      scrubFrameLoopRef.current = loop
      return loop
    },
    [onInteractivePopDiagnostic],
  )

  useLayoutEffect(
    () => () => {
      scrubFrameLoopRef.current?.dispose()
      scrubFrameLoopRef.current = undefined
      scrubDiagnosticStateRef.current = undefined
      for (const transition of boundTransitionsRef.current) transition.release()
      boundTransitionsRef.current = []
      retainedControllersRef.current.clear()
    },
    [],
  )

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    const refreshGeometry = () => {
      const bounds = host.getBoundingClientRect()
      // Native split tracks already exclude the sidebar. Non-native detail
      // screens exclude its insets too. Use that same pane for input and motion.
      const sidebarOffset =
        split && !sidebarHidden
          ? sidebarWidth + (nativeNavigation ? 0 : 2 * sidebarTokens.inset)
          : 0
      const detailBounds =
        split && nativeNavigation ? detailSourceRef.current?.getBoundingClientRect() : undefined
      const geometry = {
        left: detailBounds?.left ?? bounds.left + sidebarOffset,
        top: bounds.top,
        width: detailBounds?.width || bounds.width - sidebarOffset,
      }
      const previous = hostGeometryRef.current
      if (previous && (previous.width !== geometry.width || previous.left !== geometry.left)) {
        const pointerId = gestureRef.current?.pointerId
        const touch = earlyTouchArbitrationRef.current
        const controller = earlyTouchControllerRef.current ?? interactiveControllerRef.current
        const hadContact = pointerId !== undefined || (touch && touch.state !== 'rejected')
        if (hadContact) {
          // Keep the original binding through the normal cancel animation. A
          // resized binding would clear the held pose and mix native timelines.
          if (controller) retainedControllersRef.current.add(controller)
          scrubFrameLoopRef.current?.dispose()
          scrubFrameLoopRef.current = undefined
          scrubDiagnosticStateRef.current = undefined
          releaseTouchClaimRef.current?.()
          gestureRef.current = undefined
          earlyTouchArbitrationRef.current = undefined
          interactiveControllerRef.current = undefined
          earlyTouchControllerRef.current = undefined
          armPointerClickSuppression(performance.now())
          if (pointerId !== undefined) {
            cancelPointerPressForOwnedGesture(pointerId)
            if (host.hasPointerCapture(pointerId)) host.releasePointerCapture(pointerId)
          }
          if (controller) controller.cancelInteractive(0)
          else if (nativeNavigation && nativeSourceRef.current) {
            const source = nativeSourceRef.current
            retireNativeScrubSource(source, source.clientWidth * 2)
          }
        }
      }
      hostGeometryRef.current = geometry
      return geometry.width
    }
    let boundWidth: number | undefined
    const refreshBindings = () => {
      const width = refreshGeometry()
      // Height-only resize and the observer's initial notification must not
      // detach a live ScrollTimeline or clear an in-flight page's painted pose.
      if (width === boundWidth) return
      boundWidth = width
      const navigationElements: TransitionNavigationElements = {
        backButtonMask: navigationBackButtonMask.current ?? undefined,
        backButtonVisual: navigationBackButtonVisual.current ?? undefined,
        backVisibleByEntry: new Map(
          paneEntries.map((entry, index) => [
            entry.key,
            backButtonVisible(
              {
                ...navigator.registry.resolve(entry.screenId)!,
                navigation: screenNavigation(
                  navigator.registry.resolve(entry.screenId)?.navigation,
                  screenChrome?.entries.get(entry.key),
                  entry.params,
                ),
              },
              index,
            ),
          ]),
        ),
        titles: navigationTitleElements,
        toolbars: new Map(
          [...host.querySelectorAll<HTMLElement>('[data-satin-entry-toolbar]')].map(toolbar => [
            toolbar.dataset.satinEntryToolbar ?? '',
            [...toolbar.children].filter(
              (slot): slot is HTMLElement =>
                slot instanceof HTMLElement &&
                slot.hasAttribute('data-satin-navigation-toolbar-slot'),
            ),
          ]),
        ),
      }
      const nextBindings = collectTransitionBindings(
        paneEntries,
        screenElements.current,
        width,
        navigationElements,
      )
      const activeControllers = new Set(nextBindings.map(transition => transition.controller))
      for (const transition of boundTransitionsRef.current) {
        if (
          activeControllers.has(transition.controller) &&
          retainedControllersRef.current.has(transition.controller)
        )
          continue
        transition.release()
        retainedControllersRef.current.delete(transition.controller)
      }
      const bindings = nextBindings.map(transition => {
        if (!retainedControllersRef.current.has(transition.controller)) return transition
        return (
          boundTransitionsRef.current.find(bound => bound.controller === transition.controller) ??
          transition
        )
      })
      // Prepare source strips before bind starts an automatic compositor track.
      // Active bindings name popToRoot's real rear, not merely the adjacent row. A split
      // layout publishes its navigating pane too: glass over that column (its back button)
      // shows the routes moving under it.
      // Zoom supplies its window projection on the same clock as its compositor tracks.
      const zooming = bindings.some(transition =>
        decideZoomTransition(transition.controller, transition.binding),
      )
      const routes = navigationGlassRoutes(
        paneEntries.map(entry => entry.key),
        screenElements.current,
        bindings,
      )
      const glassReady = publishNavigationGlass(host, {
        active: bindings.length > 0,
        zoom: zooming,
        width,
        routes,
        top: paneEntries.at(-1)?.key ?? '',
      })
      boundTransitionsRef.current = bindings.map(transition => {
        const retained = boundTransitionsRef.current.find(bound => bound === transition)
        return (
          retained ?? {
            ...transition,
            release: transition.controller.bind!({ ...transition.binding, glassReady }),
          }
        )
      })
    }
    refreshBindings()
    const observer =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(refreshBindings)
    observer?.observe(host)
    if (detailSourceRef.current) observer?.observe(detailSourceRef.current)
    window.addEventListener('orientationchange', refreshBindings)
    window.addEventListener('resize', refreshBindings)
    return () => {
      observer?.disconnect()
      window.removeEventListener('orientationchange', refreshBindings)
      window.removeEventListener('resize', refreshBindings)
    }
  }, [
    navigationTitleElements,
    navigator,
    paneEntries,
    sidebarHidden,
    sidebarWidth,
    split,
    nativeNavigation,
  ])

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host || !tabActive) return
    const bind = scopedGestures
      ? (target: HTMLDivElement, context: Parameters<typeof bindTouchArbitration>[1]) =>
          bindScopedBackSwipe(target, context, paneScope?.scope)
      : bindTouchArbitration
    const arbitration = bind(host, {
      navigator,
      nativeNavigation,
      automaticPushActive,
      split,
      horizontal,
      appliedHorizontal,
      onInteractivePopDiagnostic,
      startScrubFrameLoop,
      hostGeometryRef,
      earlyTouchArbitrationRef,
      earlyTouchControllerRef,
      scrubFrameLoopRef,
      scrubDiagnosticStateRef,
      gestureRef,
      interactiveControllerRef,
      nativeSourceRef,
    })
    releaseTouchClaimRef.current = arbitration.releaseClaim
    return () => {
      releaseTouchClaimRef.current = undefined
      arbitration.dispose()
    }
  }, [
    navigator,
    onInteractivePopDiagnostic,
    startScrubFrameLoop,
    split,
    horizontal,
    appliedHorizontal,
    nativeNavigation,
    automaticPushActive,
    tabActive,
    nativeSourceRef,
    scopedGestures,
    paneScope,
  ])

  // The handlers read these refs only when pointer events arrive, never during render.
  // oxlint-disable-next-line react/refs
  const pointerHandlers = createPointerPopHandlers({
    navigator,
    tabActive,
    nativeNavigation,
    split,
    horizontal,
    appliedHorizontal,
    onInteractivePopDiagnostic,
    startScrubFrameLoop,
    hostGeometryRef,
    earlyTouchArbitrationRef,
    scrubFrameLoopRef,
    scrubDiagnosticStateRef,
    gestureRef,
    interactiveControllerRef,
  })

  const hostStyle = {
    ...style,
    ...(!split && nativeNavigation ? stackScrubHostStyle : {}),
    ...sidebarCssTokens,
    '--satin-row-swipe-touch-action': rowSwipeTouchAction(
      nativeNavigation,
      tabActive && horizontal === appliedHorizontal && state.entries.length > (split ? 2 : 1),
      directionalRowPanning,
    ),
    '--satin-row-compositor-touch-action':
      state.entries.length > (split ? 2 : 1) ? 'pan-y' : 'auto',
    '--satin-sidebar-width': `${sidebarWidth}px`,
    '--satin-sidebar-tabs-height': `${split && !registerSheetChrome && tabs.height ? sidebarTokens.tabReserve : 0}px`,
    '--satin-navigation-tabs-height': `${!registerSheetChrome && tabs.height ? sidebarTokens.tabReserve : 0}px`,
    '--satin-navigation-edge-shadow-width': `${NAVIGATION_EDGE_SHADOW_WIDTH_PX}px`,
  } as CSSProperties

  const paintedScreens = renderedScreenIndices(state.entries)
  const compositedScreens = compositedScreenIndices(state.entries)
  const renderScreen = (entry: (typeof state.entries)[number], index: number) => {
    const definition = navigator.registry.resolve(entry.screenId)
    if (!definition) {
      throw new Error(`Satin screen "${entry.screenId}" disappeared from its registry.`)
    }

    const Screen = definition.component
    return (
      <ScreenContainer
        style={
          split && index === 0
            ? ({
                '--satin-row-swipe-touch-action': 'pan-y',
                '--satin-row-compositor-touch-action': 'auto',
              } as CSSProperties)
            : undefined
        }
        contentFirst={horizontal === 'regular' && index > (split ? 1 : 0)}
        key={entry.key}
        entry={entry as RegistryScreenEntry<ScreenRegistry>}
        // Readiness gates new scrubs, never destination taps or scrolling.
        // Rear parallax and vertical scrolling have independent owners.
        interactionBlocked={
          entry.transition.phase === 'exiting' ||
          state.entries.some(
            screen =>
              screen.transition.phase === 'exiting' &&
              gestureOwnsTransition(screen.transition.controller),
          )
        }
        data-satin-pane={split ? (index === 0 ? 'sidebar' : 'detail') : 'stack'}
        isCovered={split && index === 0 ? false : isEntryCovered(state.entries, index)}
        prepareMotion={compositedScreens.has(index)}
        renderSuspended={!split && !paintedScreens.has(index)}
        navigator={navigator as NavigatorStore}
        screenRef={element => {
          if (!element) {
            screenElements.current.delete(entry.key)
            return
          }

          const motion = element.firstElementChild
          const dim = motion?.lastElementChild
          if (!(motion instanceof HTMLElement) || !(dim instanceof HTMLElement)) {
            throw new Error('Satin Navigator screen layers are incomplete.')
          }
          screenElements.current.set(entry.key, { dim, motion, screen: element })
        }}
      >
        <NavigatorContext
          value={(split && index === 0 ? sidebarNavigator : navigator) as NavigatorStore}
        >
          <NavigationPaneContext value={split ? (index === 0 ? 'sidebar' : 'detail') : 'stack'}>
            <Screen />
          </NavigationPaneContext>
        </NavigatorContext>
      </ScreenContainer>
    )
  }
  return (
    <NavigationSizeClassContext value={runtime.layoutClass.vertical ?? 'regular'}>
      <NavigatorContext value={navigator as NavigatorStore}>
        <SplitContext value={splitSelection}>
          <StackScrubSource enabled={!split && nativeNavigation} sourceRef={stackSourceRef}>
            <div
              {...props}
              ref={hostRef}
              data-satin-navigator-host="true"
              data-satin-navigation-layout={split ? 'split' : 'stack'}
              data-satin-sidebar-hidden={split && sidebarHidden ? 'true' : undefined}
              data-satin-regular-tabs={!registerSheetChrome && tabs.height > 0 ? 'true' : undefined}
              data-satin-source-ready={sourcePending ? 'false' : 'true'}
              data-satin-automatic-push={automaticPushActive ? 'true' : undefined}
              data-satin-transition-active={transitionActive ? 'true' : 'false'}
              onLostPointerCapture={pointerHandlers.onLostPointerCapture}
              onPointerCancel={pointerHandlers.onPointerCancel}
              onPointerDown={pointerHandlers.onPointerDown}
              onPointerMove={pointerHandlers.onPointerMove}
              onPointerUp={pointerHandlers.onPointerUp}
              style={hostStyle}
            >
              <ReachabilityRoute
                route={state.entries.at(-1)?.screenId ?? ''}
                goBack={
                  state.entries.length > 1
                    ? () => {
                        navigator.pop()
                      }
                    : undefined
                }
              >
                {state.entries[0] && renderScreen(state.entries[0], 0)}
                <DetailScrubSource
                  enabled={split && nativeNavigation}
                  sourceRef={detailSourceRef}
                  left={sidebarHidden ? 0 : sidebarWidth}
                >
                  {state.entries.slice(1).map((entry, index) => renderScreen(entry, index + 1))}
                </DetailScrubSource>
              </ReachabilityRoute>
              {split && (
                <NavigationChrome
                  navigator={navigator as NavigatorStore}
                  entries={state.entries.slice(0, 1)}
                  pane="sidebar"
                  onToggleSidebar={() => setSidebarHidden(true)}
                  titleElements={new Map()}
                />
              )}
              {split && state.entries.length === 1 && (
                <div data-satin-split-placeholder="true">Select an item</div>
              )}
              <NavigationChrome
                trailing={trailing}
                entries={paneEntries}
                pane={split ? 'detail' : 'stack'}
                tabCapsuleRow={!split && !registerSheetChrome && tabs.height > 0}
                onToggleSidebar={split && sidebarHidden ? () => setSidebarHidden(false) : undefined}
                backButtonMaskRef={navigationBackButtonMask}
                backButtonRef={navigationBackButton}
                backButtonVisualRef={navigationBackButtonVisual}
                navigator={navigator as NavigatorStore}
                titleElements={navigationTitleElements}
              />
            </div>
          </StackScrubSource>
        </SplitContext>
      </NavigatorContext>
    </NavigationSizeClassContext>
  )
}
