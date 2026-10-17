import { ExpandedNavigationTitle } from './NavigationTitleSlots.tsx'
import { ContentAdmission } from '../image/ContentAdmission.tsx'
import {
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type HTMLAttributes,
  type Ref,
} from 'react'
import { RestoredScreenMountContext } from '../public/presentationContext.ts'
import { hasFocusedTab, navigatorFocusRuntime } from '../focus/navigationFocus.ts'
import { recordMotionPreparation } from '../motionProbe.ts'
import { useScreenNavigation, useScreenChrome, ScreenChromeContext } from '../public/chrome.tsx'
import { createScrollSurfaceRegistry } from '../scroll/registry.ts'
import { installScrollIndicator } from '../scroll/scrollIndicator.ts'
import { TabActivityContext } from '../tabs/context.ts'
import { ScreenContext, SystemScrollRegistryContext } from './navigationContext.tsx'
import { DismissContext } from '../presentation/dismiss.tsx'
import { EditModeScope } from '../list-form/editing.tsx'
import type { ScreenRegistry } from './registry.ts'
import { shouldRestoreOnUncover } from './stack.ts'
import {
  navigatorRestoredMounts,
  navigatorScrollRuntime,
  type NavigatorStore,
  type RegistryScreenEntry,
} from './store.ts'
import { TransitionEdge } from './TransitionEdge.tsx'
import { transitionParticipants } from './transitionBindings.ts'

/** Painted ownership follows the same primary/rear groups as transition
 * bindings, not a contiguous stack floor. In particular, popToRoot must not
 * reveal every intermediate retained screen. Root remains warm by contract. */
export function renderedScreenIndices(
  entries: readonly { transition: { phase: string; controller?: unknown } }[],
) {
  const painted = new Set<number>()
  if (!entries.length) return painted
  painted.add(0)
  painted.add(entries.length - 1)
  const participants = transitionParticipants(entries)
  if (!participants.length && entries.length > 1) painted.add(entries.length - 2)
  for (const { primaryIndex, secondaryIndex } of participants) {
    painted.add(primaryIndex)
    painted.add(secondaryIndex)
  }
  return painted
}

/** Only the next back-swipe pair stays composited at rest. Active transitions may reach deeper. */
export function compositedScreenIndices(
  entries: readonly { transition: { phase: string; controller?: unknown } }[],
) {
  const composited = new Set<number>()
  if (!entries.length) return composited
  composited.add(entries.length - 1)
  if (entries.length > 1) composited.add(entries.length - 2)
  for (const { primaryIndex, secondaryIndex } of transitionParticipants(entries)) {
    composited.add(primaryIndex)
    composited.add(secondaryIndex)
  }
  return composited
}

export type ScreenContainerProps = HTMLAttributes<HTMLDivElement> &
  Readonly<{
    entry: RegistryScreenEntry<ScreenRegistry>
    interactionBlocked?: boolean
    contentFirst?: boolean
    isCovered: boolean
    navigator: NavigatorStore
    /** Covered by two or more screens: keep state and layout, stop painting. */
    renderSuspended?: boolean
    prepareMotion?: boolean
    screenRef?: Ref<HTMLDivElement>
  }>

export function ScreenContainer({
  children,
  entry,
  interactionBlocked = false,
  contentFirst = false,
  isCovered,
  navigator,
  renderSuspended = false,
  prepareMotion = false,
  screenRef,
  ...props
}: ScreenContainerProps) {
  const [restoring, setRestoring] = useState(() =>
    navigator[navigatorRestoredMounts].has(entry.key),
  )
  useLayoutEffect(() => {
    navigator[navigatorRestoredMounts].delete(entry.key)
    setRestoring(false)
  }, [navigator, entry.key])
  const tabActive = useContext(TabActivityContext)
  const scrollRegistry = useMemo(
    () => createScrollSurfaceRegistry({ screenKey: entry.key }),
    [entry.key],
  )
  const hasPrimaryScroll = useSyncExternalStore(
    scrollRegistry.subscribe,
    () => Boolean(scrollRegistry.getPrimary()),
    () => false,
  )
  const focusScope = useRef<HTMLDivElement>(null)
  const definition = navigator.registry.resolve(entry.screenId)
  const chrome = useScreenChrome()
  const chromeStore = useContext(ScreenChromeContext)
  const screenNavigation = useScreenNavigation()
  const entryIndex = navigator
    .getState()
    .entries.findIndex(candidate => candidate.key === entry.key)
  const navigation = screenNavigation(
    definition?.navigation,
    chrome?.get(entry.key),
    entry.params,
    entryIndex,
  )
  const routeTitle = navigation?.title
  const title =
    typeof routeTitle === 'function' ? routeTitle(entry.params) : (routeTitle ?? entry.screenId)
  const wasTabActive = useRef(tabActive)
  useLayoutEffect(() => {
    const element = focusScope.current
    if (!element) return
    const runtime = navigator[navigatorFocusRuntime]
    const unbind = runtime.bind(entry.key, {
      element,
      title,
      contentFirst,
      chromeExpected: !!navigation && navigation.display !== 'none',
    })
    const capture = () => runtime.capture([entry.key])
    const panel = element.closest('[data-satin-tab-panel]')
    const activate = (event: Event) => {
      if (event instanceof CustomEvent && event.detail?.focus === false) return
      if (hasFocusedTab(element.ownerDocument)) return
      if (element.dataset.satinCovered === 'true') return
      runtime.request(entry.key, 'dismiss')
      runtime.flush(navigator.getState(), entry.key, true)
    }
    element.addEventListener('focusin', capture)
    panel?.addEventListener('satin:tab-activate', activate)
    return () => {
      unbind()
      element.removeEventListener('focusin', capture)
      panel?.removeEventListener('satin:tab-activate', activate)
    }
  }, [entry.key, navigator, title, contentFirst, navigation?.display])
  useLayoutEffect(() => {
    if (!wasTabActive.current && tabActive && !isCovered && !hasFocusedTab(document))
      navigator[navigatorFocusRuntime].request(entry.key, 'dismiss')
    wasTabActive.current = tabActive
    navigator[navigatorFocusRuntime].flush(
      navigator.getState(),
      entry.key,
      tabActive && !isCovered && !interactionBlocked,
    )
  })
  const previousCovered = useRef<boolean | undefined>(undefined)
  const previousSuspended = useRef(renderSuspended)
  useLayoutEffect(() => {
    if (previousSuspended.current !== renderSuspended)
      recordMotionPreparation(() => ({
        kind: renderSuspended ? 'screen-render-suspended' : 'screen-render-resumed',
        at: performance.now(),
        key: entry.key,
        phase: entry.transition.phase,
        covered: isCovered,
      }))
    previousSuspended.current = renderSuspended
  }, [entry.key, entry.transition.phase, isCovered, renderSuspended])
  const screen = useMemo(
    () => ({
      key: entry.key,
      lifecycle: {
        isCovered: isCovered || !tabActive,
        phase: entry.transition.phase,
      },
      params: entry.params,
      scrollRegistry,
    }),
    [entry.key, entry.params, entry.transition.phase, isCovered, scrollRegistry, tabActive],
  )

  useLayoutEffect(
    () => navigator[navigatorScrollRuntime].bind(entry.key, scrollRegistry),
    [entry.key, navigator, scrollRegistry],
  )

  // Without a primary scroll view, content is laid out in the safe area below the bar, as a
  // VStack is (styles.css). The attribute follows the registry in the same frame.
  // The primary's vertical scroll indicator is drawn in the screen frame (scroll/scrollIndicator.ts).
  const motionLayer = useRef<HTMLDivElement>(null)
  const indicatorTrack = useRef<HTMLSpanElement>(null)
  const indicatorThumb = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const element = motionLayer.current
    const track = indicatorTrack.current
    const thumb = indicatorThumb.current
    if (!element || !track || !thumb) return
    let indicated: HTMLElement | undefined
    let releaseIndicator: (() => void) | undefined
    // The registry also notifies on scroll; only a change touches the DOM.
    const update = () => {
      const primary = scrollRegistry.getPrimary()
      const state = primary ? 'primary' : 'none'
      if (element.dataset.satinScreenScroll !== state) element.dataset.satinScreenScroll = state
      const scroller =
        primary?.axis === 'vertical' && primary.element instanceof HTMLElement
          ? primary.element
          : undefined
      if (scroller === indicated) return
      releaseIndicator?.()
      indicated = scroller
      // NavigationChrome re-binds its title collapse and scroll edge to the new primary.
      element.dispatchEvent(new CustomEvent('satin:primary-scroll', { bubbles: true }))
      releaseIndicator = scroller
        ? installScrollIndicator(scroller, { frame: element, track, thumb })
        : undefined
    }
    update()
    const unsubscribe = scrollRegistry.subscribe(update)
    return () => {
      unsubscribe()
      releaseIndicator?.()
    }
  }, [scrollRegistry])
  const display =
    navigation?.visibility === 'hidden'
      ? 'none'
      : navigation
        ? (navigation.display ?? 'inline')
        : 'none'

  useLayoutEffect(() => {
    scrollRegistry.setUncovered(!isCovered)
    return () => scrollRegistry.setUncovered(false)
  }, [isCovered, scrollRegistry])

  useLayoutEffect(() => {
    const wasCovered = previousCovered.current
    previousCovered.current = isCovered
    if (
      !shouldRestoreOnUncover(wasCovered, isCovered) &&
      !(wasCovered === undefined && entry.scrollSnapshot)
    )
      return

    if (entry.scrollSnapshot) {
      scrollRegistry.restore(entry.scrollSnapshot, {
        warnOnMismatch: import.meta.env.DEV,
      })
    } else {
      scrollRegistry.reset()
    }
  }, [entry.scrollSnapshot, isCovered, scrollRegistry])

  const entries = navigator.getState().entries
  const index = entries.findIndex(candidate => candidate.key === entry.key)
  const transitioning = transitionParticipants(entries).some(
    pair => pair.primaryIndex === index || pair.secondaryIndex === index,
  )

  // A pushed screen's dismissal pops it; a root screen's belongs to whatever presents its stack.
  const outerDismiss = useContext(DismissContext)
  const dismiss = () => {
    const entries = navigator.getState().entries
    const index = entries.findIndex(candidate => candidate.key === entry.key)
    if (index > 0 && index === entries.length - 1) navigator.pop()
    else if (index === 0) outerDismiss?.()
  }
  return (
    <ScreenContext value={screen}>
      <EditModeScope>
        <DismissContext value={dismiss}>
          <div
            {...props}
            ref={element => {
              focusScope.current = element
              if (typeof screenRef === 'function') screenRef(element)
              else if (screenRef) screenRef.current = element
            }}
            aria-hidden={isCovered || undefined}
            data-satin-covered={isCovered ? 'true' : 'false'}
            data-satin-interaction-blocked={interactionBlocked ? 'true' : 'false'}
            data-satin-presentation={entry.presentation}
            data-satin-motion-prepared={prepareMotion ? 'true' : undefined}
            data-satin-render-suspended={renderSuspended ? 'true' : undefined}
            data-satin-screen={entry.screenId}
            data-satin-screen-key={entry.key}
            data-satin-screen-container="true"
            style={{
              ['--satin-inline-title-content-height' as string]: `${display === 'none' ? 0 : (chromeStore?.inlineTitleHeights.get(entry.key) ?? 0)}px`,
            }}
            data-satin-transition={entry.transition.phase}
            inert={isCovered || interactionBlocked}
          >
            <div
              ref={motionLayer}
              data-satin-navigation-motion-layer="true"
              data-satin-screen-title-display={display}
            >
              {display === 'large' && !hasPrimaryScroll && (
                <ExpandedNavigationTitle
                  entryKey={entry.key}
                  title={title}
                  subtitle={navigation?.subtitle}
                  stationary
                />
              )}
              {transitioning &&
                (navigation?.display !== 'none' || navigation.visibility === 'hidden') && (
                  <TransitionEdge barHidden={navigation?.visibility === 'hidden'} />
                )}
              <SystemScrollRegistryContext value={undefined}>
                <RestoredScreenMountContext value={restoring}>
                  <ContentAdmission>{children}</ContentAdmission>
                </RestoredScreenMountContext>
              </SystemScrollRegistryContext>
              <span
                aria-hidden="true"
                data-satin-scroll-indicator-track="true"
                ref={indicatorTrack}
              >
                <span data-satin-scroll-indicator-thumb="true" ref={indicatorThumb} />
              </span>
              <span aria-hidden="true" data-satin-navigation-dim="true" />
            </div>
          </div>
        </DismissContext>
      </EditModeScope>
    </ScreenContext>
  )
}
