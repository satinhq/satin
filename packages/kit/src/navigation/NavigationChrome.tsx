import { NavigationTitleSlot } from './NavigationTitleSlots.tsx'
import { SymbolImage } from '../symbols/Symbol.tsx'
import {
  useScreenChrome,
  useScreenNavigation,
  ScreenToolbar,
  ScreenChromeContext,
} from '../public/chrome.tsx'
import { navigatorFocusRuntime } from '../focus/navigationFocus.ts'
import { GlassBackground } from '../glass/GlassEffect.tsx'
import { TabActivityContext } from '../tabs/context.ts'
import { transitionParticipants } from './transitionBindings.ts'
import { MaterialEffectContext } from '../glass/liquidContext.ts'

import { ToolbarGlass } from './ToolbarGlass.tsx'
import { SidebarSymbol } from './SidebarSymbol.tsx'
import {
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type Ref,
  type ReactNode,
} from 'react'
import { settingsChromeTokens } from '../settings/tokens.ts'
import { observeNavigationEdge } from './navigationEdge.ts'
import { Pressable } from '../press/Pressable.tsx'
import type { ScreenRegistry } from './registry.ts'
import type { NavigatorStore, RegistryScreenEntry } from './store.ts'
import { hiddenByMultiPop, isEntryCovered } from './stack.ts'
import {
  backButtonVisible,
  backTargetIndex,
  resolveNavigationTitle,
} from './navigationChromeModel.ts'

const INLINE_LARGE_SETTLE_PX = 5

type NavigationChromeProps = Readonly<{
  trailing?: ReactNode
  backButtonMaskRef?: Ref<HTMLSpanElement>
  backButtonRef?: Ref<HTMLButtonElement>
  backButtonVisualRef?: Ref<HTMLSpanElement>
  entries?: readonly RegistryScreenEntry<ScreenRegistry>[]
  pane?: 'sidebar' | 'detail' | 'stack'
  /** iPad tabs float over this plain stack, so its bar row is the tab capsule's row. */
  tabCapsuleRow?: boolean
  onToggleSidebar?: () => void
  navigator: NavigatorStore
  titleElements: Map<string, HTMLElement>
}>

export function NavigationChrome({
  trailing,
  backButtonMaskRef,
  backButtonRef,
  backButtonVisualRef,
  navigator,
  onToggleSidebar,
  entries = navigator.getState().entries as readonly RegistryScreenEntry<ScreenRegistry>[],
  pane = 'stack',
  tabCapsuleRow = false,
  titleElements,
}: NavigationChromeProps) {
  const chrome = useScreenChrome()
  const chromeStore = useContext(ScreenChromeContext)
  const screenNavigation = useScreenNavigation()
  const tabActive = useContext(TabActivityContext)
  const webgpu = Boolean(useContext(MaterialEffectContext)?.backend)
  // Chrome buttons are interactive glass: each glass takes the finger itself (GlassBackground).
  const topIndex = entries.length - 1
  const topEntry = entries[topIndex]
  const topDefinition = topEntry ? navigator.registry.resolve(topEntry.screenId) : undefined
  const topNavigation = screenNavigation(
    topDefinition?.navigation,
    topEntry ? chrome?.get(topEntry.key) : undefined,
    topEntry?.params,
    topIndex,
  )
  const [minimized, setMinimized] = useState(false)
  const barHidden = topNavigation?.visibility === 'hidden' || minimized
  const isBackVisible = backButtonVisible(
    topDefinition ? { ...topDefinition, navigation: topNavigation } : undefined,
    topIndex,
  )
  // Outgoing entries retain their glass until the transition releases them.
  // A root-only stack must not start the renderer for an invisible control.
  const entryBackVisible = (entry: (typeof entries)[number], index: number) => {
    const definition = navigator.registry.resolve(entry.screenId)
    if (!definition) return false
    const navigation = screenNavigation(
      definition.navigation,
      chrome?.get(entry.key),
      entry.params,
      index,
    )
    return backButtonVisible({ ...definition, navigation }, index)
  }
  // A root with toolbar items already runs the renderer, and its first push turns the leading glass
  // into the back control's glass in the first frame: keep that glass mounted beforehand.
  const needsBackGlass = entries.some(
    (entry, index) => entryBackVisible(entry, index) || chrome?.get(entry.key)?.hasToolbar,
  )
  // The two entries of a running push or pop: both toolbars are laid out so the transition fades
  // one into the other (transitionChrome.ts chromeTracks).
  // Entries whose toolbar shows a principal item: that item replaces their bar title.
  const [principalKeys, setPrincipalKeys] = useState<ReadonlySet<string>>(() => new Set())
  const reportPrincipal = useCallback((key: string, present: boolean) => {
    setPrincipalKeys(previous => {
      if (previous.has(key) === present) return previous
      const next = new Set(previous)
      if (present) next.add(key)
      else next.delete(key)
      return next
    })
  }, [])
  const toolbarMotion = new Map<number, 'incoming' | 'outgoing'>()
  // The rear entry of a running push or pop: its title is clipped by the front page.
  const rearTitles = new Set<number>()
  for (const { primaryIndex, secondaryIndex, direction } of transitionParticipants(entries)) {
    toolbarMotion.set(primaryIndex, direction === 'push' ? 'incoming' : 'outgoing')
    toolbarMotion.set(secondaryIndex, direction === 'push' ? 'outgoing' : 'incoming')
    if (direction === 'pop') {
      for (let index = secondaryIndex + 1; index < primaryIndex; index++) {
        toolbarMotion.set(index, 'outgoing')
      }
    }
    rearTitles.add(secondaryIndex)
  }
  const targetIndex = backTargetIndex(entries)
  const targetEntry = entries[targetIndex]
  const targetDefinition = targetEntry
    ? navigator.registry.resolve(targetEntry.screenId)
    : undefined
  const targetTitle =
    resolveNavigationTitle(
      screenNavigation(
        targetDefinition?.navigation,
        targetEntry ? chrome?.get(targetEntry.key) : undefined,
        targetEntry?.params,
      ),
      targetEntry?.params,
    ) ??
    targetEntry?.screenId ??
    'previous screen'

  const headerRef = useRef<HTMLElement>(null)
  // Screens elect their primary scroll view after mounting; observers follow each election.
  const [primaryRevision, setPrimaryRevision] = useState(0)
  useLayoutEffect(() => {
    const host = headerRef.current?.parentElement
    if (!host) return
    const changed = () => setPrimaryRevision(revision => revision + 1)
    host.addEventListener('satin:primary-scroll', changed)
    return () => host.removeEventListener('satin:primary-scroll', changed)
  }, [])
  useLayoutEffect(() => {
    const host = headerRef.current?.parentElement
    if (!host) return
    const update = () => {
      const primary = host.querySelector<HTMLElement>(
        '[data-satin-screen-container][data-satin-covered="false"] [data-satin-primary="true"]',
      )
      setMinimized(primary?.dataset.satinToolbarMinimized === 'true')
    }
    update()
    host.addEventListener('satin:toolbar-minimization', update)
    return () => host.removeEventListener('satin:toolbar-minimization', update)
  }, [topEntry?.key, primaryRevision, tabActive])
  useLayoutEffect(() => {
    const header = headerRef.current
    const screen = header?.parentElement?.querySelector<HTMLElement>(
      '[data-satin-screen-container][data-satin-covered="false"]',
    )
    const scroller = screen?.querySelector<HTMLElement>('[data-satin-primary="true"]')
    if (!header || !scroller || !tabActive) return
    // `inlineLarge` settles from the bar's large title to its inline title within the first 5 pt
    // of scroll (iOS 27 native reference, header-styles r1: settled at every sampled offset from 5 pt).
    const inlineLarge = topNavigation?.display === 'inlineLarge'
    const updateInlineLarge = () => {
      const collapsed = Math.min(1, Math.max(0, scroller.scrollTop / INLINE_LARGE_SETTLE_PX))
      header.style.setProperty('--satin-inline-large-collapsed', String(collapsed))
      // A transparent title still reaches the bar's glass sampling; a settled one leaves the bar.
      header.toggleAttribute('data-satin-inline-large-settled', collapsed === 1)
    }
    const updateLarge = () =>
      header.style.setProperty(
        '--satin-large-title-collapsed',
        String(
          Math.min(
            1,
            Math.max(
              0,
              (scroller.scrollTop -
                settingsChromeTokens.rootLargeTitleTopOffsetPx +
                settingsChromeTokens.navigationBarHeightPx) /
                settingsChromeTokens.largeTitleLineHeightPx,
            ),
          ),
        ),
      )
    const update = inlineLarge ? updateInlineLarge : updateLarge
    update()
    scroller.addEventListener('scroll', update, { passive: true })
    return () => scroller.removeEventListener('scroll', update)
  }, [topEntry?.key, tabActive, topNavigation?.display, primaryRevision])
  useLayoutEffect(() => {
    const header = headerRef.current
    if (!header || !topEntry || !tabActive) return
    const runtime = navigator[navigatorFocusRuntime]
    const release = runtime.bindChrome(topEntry.key, {
      element: header,
      heading: titleElements.get(topEntry.key)?.querySelector<HTMLElement>('strong') ?? null,
      back: isBackVisible
        ? header.querySelector<HTMLElement>('[data-satin-navigation-back-button]')
        : null,
    })
    const capture = () => runtime.capture([topEntry.key])
    header.addEventListener('focusin', capture)
    runtime.flush(navigator.getState(), topEntry.key, true)
    return () => {
      header.removeEventListener('focusin', capture)
      release()
    }
  })
  // Native scroll-edge effects only treat content that has scrolled under the
  // bar. At rest nothing is underneath, so the material (and its tint) is off.
  const edgeRef = useRef<HTMLDivElement>(null)
  const edgeMoving = transitionParticipants(entries).length > 0
  // Under floating iPad tabs, a root without an inline title has no bar row of its own: its
  // buttons share the capsule's row. Native's edge effect then covers only the status bar, and
  // scrolled rows stay legible beside the capsule (iOS 27 native reference edge-tab, iPad Pro 13).
  const statusEdgeOnly =
    barHidden || (tabCapsuleRow && !isBackVisible && topNavigation?.display !== 'inline')
  useLayoutEffect(() => {
    const edge = edgeRef.current
    const host = edge?.parentElement?.parentElement
    // Moving pages own their edges. Rebind the shared edge after it becomes visible so
    // its observer cannot retain the previous page's material while geometry is hidden.
    if (!edge || !host || !tabActive || edgeMoving) return
    const screens = [
      ...host.querySelectorAll<HTMLElement>(
        `[data-satin-screen-container][data-satin-covered="false"][data-satin-pane="${pane}"]`,
      ),
    ].filter(screen => screen.closest('[data-satin-navigator-host]') === host)
    const scroller =
      screens.at(-1)?.querySelector<HTMLElement>('[data-satin-primary="true"]') ?? null
    return observeNavigationEdge(edge, scroller, statusEdgeOnly)
  }, [topEntry?.key, tabActive, pane, primaryRevision, statusEdgeOnly, edgeMoving])
  return (
    <>
      {(topDefinition?.navigation?.display !== 'none' || barHidden) && (
        <div
          aria-hidden="true"
          data-satin-navigation-edge-host="true"
          style={{
            ['--satin-inline-title-content-height' as string]: `${barHidden ? 0 : (chromeStore?.inlineTitleHeights.get(topEntry?.key ?? '') ?? 0)}px`,
          }}
          data-satin-pane={pane}
          hidden={edgeMoving}
        >
          <div ref={edgeRef} data-satin-scroll-edge="true" />
          {/* The material's upper layers; backdrop layers must be siblings (styles.css). */}
          <div data-satin-scroll-edge-layer="wide" />
          <div data-satin-scroll-edge-layer="finish" />
          <div data-satin-scroll-edge-cap="true" />
          <div data-satin-scroll-edge-seam="true" />
        </div>
      )}
      <header
        ref={headerRef}
        aria-label={topEntry ? `${topEntry.screenId} navigation` : 'Navigation'}
        data-satin-navigation-chrome="true"
        data-satin-system-toolbar={
          onToggleSidebar ? (pane === 'sidebar' ? 'trailing' : 'leading') : undefined
        }
        data-satin-pane={pane}
        data-satin-navigation-bar-hidden={barHidden || undefined}
        data-satin-navigation-edge={topDefinition?.navigation?.display !== 'none' || undefined}
      >
        <div data-satin-navigation-title-stage="true">
          {entries.map((entry, index) => {
            const definition = navigator.registry.resolve(entry.screenId)
            const navigation = screenNavigation(
              definition?.navigation,
              chrome?.get(entry.key),
              entry.params,
              index,
            )
            const title = resolveNavigationTitle(navigation, entry.params)
            if (
              !navigation ||
              (navigation.display === 'none' && pane !== 'sidebar') ||
              title === undefined
            ) {
              return null
            }
            // A popToRoot animates only the top title over the root title; intermediate
            // outgoing titles must not show through (same rule as their screens).
            const covered =
              isEntryCovered(entries, index) ||
              (pane === 'stack' && index > 0 && hiddenByMultiPop(entries, index))

            return (
              <div
                key={entry.key}
                ref={element => {
                  if (element) titleElements.set(entry.key, element)
                  else titleElements.delete(entry.key)
                }}
                aria-hidden={covered || !tabActive || navigation.display === 'large' || undefined}
                data-satin-navigation-title-covered={covered ? 'true' : 'false'}
                data-satin-navigation-title-layer="true"
                data-satin-navigation-title-key={entry.key}
                data-satin-navigation-title-display={navigation.display}
                data-satin-navigation-title-rear={rearTitles.has(index) || undefined}
                data-satin-navigation-title-replaced={principalKeys.has(entry.key) || undefined}
                data-satin-transition={entry.transition.phase}
                style={{
                  zIndex: index + 1,
                  ['--satin-inline-title-content-height' as string]: `${chromeStore?.inlineTitleHeights.get(entry.key) ?? 0}px`,
                }}
              >
                {/* The clip lets a front page cover this title (transitionPose.ts bindingFrame). */}
                <span data-satin-navigation-title-clip="true">
                  <span data-satin-navigation-title-content="true">
                    <strong role="heading" aria-level={1} tabIndex={-1}>
                      {title}
                    </strong>
                    <NavigationTitleSlot
                      entryKey={entry.key}
                      placement="subtitle"
                      fallback={navigation.subtitle}
                    />
                    {navigation.display === 'inlineLarge' && (
                      <span aria-hidden="true" data-satin-navigation-inline-large-title="true">
                        {title}
                      </span>
                    )}
                  </span>
                </span>
              </div>
            )
          })}
        </div>
        <ToolbarGlass />
        {entries.map((entry, index) => (
          <ScreenToolbar
            key={entry.key}
            entryKey={entry.key}
            active={entry.key === topEntry?.key}
            motion={toolbarMotion.get(index)}
            backVisible={entryBackVisible(entry, index)}
            hasToolbar={chrome?.get(entry.key)?.hasToolbar}
            inlineLarge={
              screenNavigation(
                navigator.registry.resolve(entry.screenId)?.navigation,
                chrome?.get(entry.key),
                entry.params,
                index,
              )?.display === 'inlineLarge'
            }
            fallback={entry.key === topEntry?.key ? trailing : undefined}
            onPrincipalChange={reportPrincipal}
          />
        ))}
        {onToggleSidebar && (
          <Pressable
            data-satin-sidebar-toggle="true"
            aria-label={pane === 'sidebar' ? 'Hide Sidebar' : 'Show Sidebar'}
            data-satin-glass-press="true"
            onPress={onToggleSidebar}
          >
            <GlassBackground shape="circle" interactive />
            <SidebarSymbol name="sidebar.left" />
          </Pressable>
        )}
        <Pressable
          ref={backButtonRef}
          aria-label={`Back to ${targetTitle}`}
          data-satin-navigation-back-button="true"
          data-satin-navigation-back-visible={isBackVisible ? 'true' : 'false'}
          disabled={!isBackVisible}
          onPress={() => navigator.pop()}
          data-satin-glass-press="true"
        >
          <span ref={backButtonMaskRef} data-satin-navigation-back-mask="true">
            <span
              ref={backButtonVisualRef}
              data-satin-navigation-back-visual="true"
              data-satin-navigation-back-glass={webgpu || undefined}
            >
              {needsBackGlass && <GlassBackground shape="circle" interactive />}
              <span data-satin-navigation-back-ink="true">
                <SymbolImage name="chevron.left" weight="semibold" />
              </span>
            </span>
          </span>
        </Pressable>
      </header>
    </>
  )
}
