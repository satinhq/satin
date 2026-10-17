import { ExpandedNavigationTitle } from '../navigation/NavigationTitleSlots.tsx'
import { observeToolbarMinimization } from '../navigation/toolbarMinimization.ts'
import {
  topScrollEdgePolicy,
  type ScrollEdgeEffectHidden,
  type ScrollEdgeEffectStyleSelection,
} from './edgePolicy.ts'
import { RefreshControl } from './RefreshControl.tsx'
import type { TaskAction } from '../tasks/useTask.ts'
import { BottomInsetContext } from '../safe-area/SafeAreaInset.tsx'
import {
  ContentMarginsContext,
  IgnoresSafeAreaContext,
  NO_LENGTHS,
  SafeAreaPaddingContext,
} from '../safe-area/context.ts'
import { useScreenContentNavigation } from '../public/chrome.tsx'
import { observeListLayoutMargins, startsScreenContent } from './screenGeometry.ts'
import { ScrollTargetContext } from './ScrollTarget.tsx'
import {
  createScrollPositionController,
  type ScrollAnchor,
  type ScrollPositionOptions,
} from './position.ts'
import { scrollAfterGlassPrepared } from './scrollJump.ts'
import {
  installScrollKeyboardDismissal,
  type ScrollDismissesKeyboardMode,
} from '../keyboard/adapter.ts'
import { TabActivityContext, TabRegistrationContext } from '../tabs/context.ts'
import { SearchDrawer } from '../search/SearchDrawer.tsx'
import { ContentAdmission } from '../image/ContentAdmission.tsx'
import { SearchToolbarField } from '../search/SearchToolbarField.tsx'
import { resolveSearchPlacement } from '../search/searchPlacement.ts'
import type { Searchable } from '../search/searchable.ts'

import {
  Children,
  createContext,
  forwardRef,
  isValidElement,
  useCallback,
  useContext,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type HTMLAttributes,
} from 'react'
import {
  ScreenContext,
  SystemScrollRegistryContext,
  useScreenScrollRegistry,
} from '../navigation/navigationContext.tsx'
import { readScrollOffset } from './registry.ts'
import { installScrollPressOwnership } from './pressOwnership.ts'
import type { ScrollAxis, ScrollOffset, ScrollToTopOptions } from './types.ts'

/** Inside another scroll surface: never the screen's primary scroll view. */
const NestedScrollContext = createContext(false)

/** The navigation title a List supplies for its own primary surface (ListForm.tsx). */
export const ListNavigationContext = createContext<
  { title?: string; display: 'large' | 'inline'; searchable?: Searchable } | undefined
>(undefined)

/** Imperative scroll positioning for a named scroll view. */
export interface ScrollSurfaceHandle {
  readonly offset: ScrollOffset
  scrollTo(id: string, anchor?: ScrollAnchor): boolean
  scrollToTop(options?: ScrollToTopOptions): void
}

/** A scroll view's content, scroll binding and keyboard dismissal policy. */
export type ScrollSurfaceProps = Omit<HTMLAttributes<HTMLDivElement>, 'id'> &
  ScrollPositionOptions &
  Readonly<{
    axis?: ScrollAxis
    chain?: boolean
    id: string
    scrollDismissesKeyboard?: ScrollDismissesKeyboardMode
    /** Awaited pull-to-refresh action. Vertical surfaces only. */
    refreshable?: TaskAction
    /**
     * Whether this is the screen's primary scroll view, which gets the large title, the bar's
     * content inset and the scroll edge effect. By default the outermost vertical scroll view at the
     * top of the screen's content is primary.
     */
    primary?: boolean
    /** Hide the scroll edge effect under the top bar. */
    scrollEdgeEffectHidden?: ScrollEdgeEffectHidden
    /** Soft/automatic select the existing top treatment. Hard is explicitly unsupported. */
    scrollEdgeEffectStyle?: ScrollEdgeEffectStyleSelection
  }>

/** A scroll view's content is inside its safe area: modifiers above it stop at its frame. */
const NO_IGNORED = { container: new Set<never>(), keyboard: false }

const cssLength = (value: string | number | undefined) =>
  typeof value === 'number' ? `${value}px` : (value ?? '0px')

/** A named scroll surface whose position is retained by the framework. */
export const ScrollSurface = forwardRef<ScrollSurfaceHandle, ScrollSurfaceProps>(
  function ScrollSurface(
    {
      axis = 'vertical',
      chain = false,
      children,
      primary,
      scrollEdgeEffectHidden,
      scrollEdgeEffectStyle,
      refreshable,
      scrollDismissesKeyboard = 'never',
      id,
      defaultScrollAnchor,
      maintainVisibleContentPosition,
      scrollPosition,
      onScrollGeometryChange,
      ...props
    },
    forwardedRef,
  ) {
    const refresh = refreshable
    if (
      axis !== 'vertical' &&
      (refresh !== undefined ||
        defaultScrollAnchor !== undefined ||
        maintainVisibleContentPosition !== undefined ||
        scrollPosition !== undefined ||
        onScrollGeometryChange !== undefined)
    )
      throw new TypeError(
        'Scroll positioning, refreshable and geometry observation require a vertical ScrollView.',
      )
    const bottom = useContext(BottomInsetContext)
    const ignored = useContext(IgnoresSafeAreaContext).container
    const ignoresSafeArea =
      ignored.has('top') && ignored.has('bottom')
        ? true
        : ignored.has('top')
          ? 'top'
          : ignored.has('bottom')
            ? 'bottom'
            : undefined
    // SafeAreaPadding and ContentMargins above this scroll view (safe-area/modifiers.tsx).
    const padding = useContext(SafeAreaPaddingContext)
    const margins = useContext(ContentMarginsContext)
    const extraBottom = padding.bottom + (margins.bottom ?? 0)
    const extras =
      padding.top || padding.leading || padding.trailing || Object.keys(margins).length
        ? {
            ['--satin-extra-top' as string]: `${padding.top + (margins.top ?? 0)}px`,
            ['--satin-extra-leading' as string]: `${padding.leading}px`,
            ['--satin-extra-trailing' as string]: `${padding.trailing}px`,
            ...(margins.leading !== undefined && {
              ['--satin-content-margin-leading' as string]: `${margins.leading}px`,
            }),
            ...(margins.trailing !== undefined && {
              ['--satin-content-margin-trailing' as string]: `${margins.trailing}px`,
            }),
          }
        : undefined
    const horizontalPadding = padding.leading + padding.trailing
    const tabActive = useContext(TabActivityContext)
    const elementRef = useRef<HTMLDivElement>(null)
    useLayoutEffect(() => {
      if (elementRef.current) return bottom.geometry?.attach(elementRef.current)
    }, [bottom.geometry])
    const registry = useScreenScrollRegistry()
    const screen = useContext(ScreenContext)
    const systemRegistry = useContext(SystemScrollRegistryContext)
    const ownsScreen = Boolean(screen || systemRegistry)
    const nested = useContext(NestedScrollContext)
    const listNavigation = useContext(ListNavigationContext)
    const chrome = useScreenContentNavigation()
    // `undefined` until the surface has measured whether it starts the screen's content.
    const [candidate, setCandidate] = useState<boolean>()
    const preference: boolean | 'automatic' = ownsScreen
      ? (primary ?? (axis === 'vertical' && !nested && candidate ? 'automatic' : false))
      : false
    const isPrimary = useSyncExternalStore(
      registry.subscribe,
      () => registry.getPrimary()?.id === id,
      () => ownsScreen && primary === true,
    )
    const isList = listNavigation !== undefined
    const authoredTitle = Children.toArray(children).some(
      child => isValidElement(child) && child.type === 'h1',
    )
    const screenTitle = chrome.titleDisplay !== 'none' && !authoredTitle ? chrome.title : undefined
    const title = isList ? listNavigation.title : screenTitle
    const display = isList
      ? listNavigation.display
      : chrome.titleDisplay === 'large'
        ? 'large'
        : 'inline'
    const ignoresTop = ignoresSafeArea === true || ignoresSafeArea === 'top'
    const ignoresBottom = ignoresSafeArea === true || ignoresSafeArea === 'bottom'
    const barHidden = chrome.toolbarVisibility === 'hidden'
    // Primary geometry belongs to the screen, even when title content is authored or absent.
    const navigation = !isPrimary
      ? undefined
      : ignoresTop
        ? 'ignored'
        : barHidden
          ? 'hidden'
          : display
    const edgePolicy = topScrollEdgePolicy(scrollEdgeEffectHidden, scrollEdgeEffectStyle)
    useLayoutEffect(() => {
      const scroller = elementRef.current
      const behavior = chrome.toolbarMinimizationBehavior
      if (!scroller || !isPrimary || barHidden || !behavior || behavior === 'never') return
      return observeToolbarMinimization(
        scroller,
        behavior,
        chrome.toolbarMinimizationRestoration,
        chrome.toolbarMinimizationSafeAreaAdjustment,
      )
    }, [
      isPrimary,
      barHidden,
      chrome.toolbarMinimizationBehavior,
      chrome.toolbarMinimizationRestoration,
      chrome.toolbarMinimizationSafeAreaAdjustment,
    ])
    const contentRef = useRef<HTMLDivElement>(null)
    const targets = useRef(new Map<string, HTMLElement>())
    const controller = useRef<ReturnType<typeof createScrollPositionController> | null>(null)
    const positioning =
      forwardedRef != null ||
      defaultScrollAnchor !== undefined ||
      maintainVisibleContentPosition !== undefined ||
      scrollPosition !== undefined ||
      onScrollGeometryChange !== undefined
    const positionOptions = useRef<ScrollPositionOptions>({})
    positionOptions.current = {
      defaultScrollAnchor,
      maintainVisibleContentPosition,
      scrollPosition,
      onScrollGeometryChange,
    }
    const registerTarget = useCallback(
      (targetId: string, element: HTMLDivElement | null) => {
        if (element) {
          if (targets.current.has(targetId) && targets.current.get(targetId) !== element) {
            throw new Error(`Duplicate ScrollTarget id "${targetId}" in ScrollView "${id}".`)
          }
          targets.current.set(targetId, element)
        } else targets.current.delete(targetId)
        controller.current?.targetsChanged()
      },
      [id],
    )
    // A titled List keeps its measured list hooks (styles.css); every other state is shared.
    const listTitled = isList && (navigation === 'large' || navigation === 'inline')
    const largeTitle =
      navigation === 'large' && title !== undefined && !authoredTitle ? (
        <ExpandedNavigationTitle
          entryKey={screen?.key ?? id}
          title={title}
          subtitle={chrome.subtitle}
          list={isList}
        />
      ) : null
    // The navigation bar drawer belongs to the bar's primary scroll view, after its large title.
    const searchable =
      navigation === 'large' || navigation === 'inline'
        ? (listNavigation?.searchable ?? chrome.searchable)
        : undefined
    const tabbed = useContext(TabRegistrationContext) !== null
    const searchPlacement = searchable
      ? resolveSearchPlacement(searchable.placement, {
          compact: chrome.horizontalSizeClass === 'compact',
          bottomBarItems: chrome.hasBottomBar === true,
          searchToolbarItem: chrome.searchToolbarItem !== undefined,
          scoped: searchable.scopes !== undefined,
          tabbed,
        })
      : undefined
    const toolbarSearch =
      searchPlacement === 'toolbar' || searchPlacement === 'navigationBarToolbar'
    const bottomSearch = searchPlacement === 'toolbar'
    const searchHost = bottomSearch
      ? (chrome.searchToolbarItem ?? chrome.bottomToolbar)
      : chrome.trailingToolbar
    const content = (
      <>
        {largeTitle}
        {searchable && !toolbarSearch && (
          <SearchDrawer configuration={searchable} scroller={elementRef} />
        )}
        {searchable && toolbarSearch && searchHost && (
          <SearchToolbarField
            configuration={searchable}
            scroller={elementRef}
            host={searchHost}
            navigation={searchPlacement === 'navigationBarToolbar'}
          />
        )}
        <ContentAdmission>{children}</ContentAdmission>
      </>
    )
    if (positioning && axis !== 'vertical') {
      throw new Error('ScrollView positioning currently supports only the vertical axis.')
    }
    useLayoutEffect(
      () =>
        elementRef.current
          ? installScrollKeyboardDismissal(elementRef.current, scrollDismissesKeyboard)
          : undefined,
      [scrollDismissesKeyboard],
    )

    useImperativeHandle(
      forwardedRef,
      () => ({
        get offset() {
          const element = elementRef.current
          return element ? readScrollOffset(element) : Object.freeze({ x: 0, y: 0 })
        },
        scrollTo(targetId, anchor) {
          if (axis !== 'vertical')
            throw new TypeError('ScrollTarget positioning requires a vertical ScrollView.')
          return controller.current?.scrollTo(targetId, anchor) ?? false
        },
        scrollToTop(options = {}) {
          const element = elementRef.current
          if (!element) return

          registry.cancelRestoration(id)
          const scroll = () =>
            element.scrollTo({
              behavior: options.animated ? 'smooth' : 'auto',
              left: axis === 'horizontal' ? 0 : element.scrollLeft,
              top: axis === 'vertical' ? 0 : element.scrollTop,
            })
          // Glass over a long list holds the list's top before the scroll starts (scroll/scrollJump.ts).
          if (axis === 'vertical') scrollAfterGlassPrepared(element, 0, scroll)
          else scroll()
        },
      }),
      [axis, id, registry],
    )

    useLayoutEffect(() => {
      const element = elementRef.current
      return element && tabActive ? installScrollPressOwnership(element, axis) : undefined
    }, [axis, tabActive])

    useLayoutEffect(() => {
      const element = elementRef.current
      if (element && primary === undefined && axis === 'vertical' && !nested)
        setCandidate(startsScreenContent(element))
    }, [axis, nested, primary])

    // A List's layout margins follow its own width, as UIKit's do: a frame up to 402 pt wide insets
    // its inset-grouped cards 16 pt, a wider one 20 pt (iOS 27 native reference, Forms framed 300-440 pt).
    useLayoutEffect(() => {
      const element = elementRef.current
      if (!element || !isList) return
      return observeListLayoutMargins(element, horizontalPadding)
    }, [isList, horizontalPadding])

    useLayoutEffect(() => {
      const element = elementRef.current
      if (!element) return

      const parentSurface = element.parentElement?.closest('[data-satin-scroll]')
      const canChain = Boolean(chain && parentSurface)
      element.dataset.satinScrollChain = canChain ? 'true' : 'false'

      if (import.meta.env.DEV && chain && !parentSurface) {
        console.error(
          `[Satin fidelity: invalid-scroll-chain] ScrollSurface "${id}" opted into ` +
            'scroll chaining without a declared parent ScrollSurface. The dead document ' +
            'can never be a chain target, so containment remains active.',
          element,
        )
      }

      // Initial positioning precedes registration so an existing navigation
      // snapshot wins. Later restoration explicitly refreshes the reading anchor.
      if (positionOptions.current.defaultScrollAnchor === 'bottom') {
        element.scrollTop = Math.max(0, element.scrollHeight - element.clientHeight)
      }
      return registry.register({
        axis,
        element,
        id,
        primary: preference,
        onRestore: () => controller.current?.adoptRestoredOffset(),
        initialOffset: () => ({
          x: 0,
          y:
            Math.max(0, element.scrollHeight - element.clientHeight) *
            { top: 0, center: 0.5, bottom: 1 }[
              positionOptions.current.defaultScrollAnchor ?? 'top'
            ],
        }),
      })
    }, [axis, chain, id, preference, registry])

    useLayoutEffect(() => {
      if (axis !== 'vertical' || !positioning || !elementRef.current || !contentRef.current) return
      const position = createScrollPositionController(
        elementRef.current,
        contentRef.current,
        targets.current,
        () => positionOptions.current,
        () => registry.cancelRestoration(id),
      )
      controller.current = position
      return () => {
        position.dispose()
        controller.current = null
      }
    }, [axis, positioning, id, registry])
    useLayoutEffect(() => {
      controller.current?.reconcile()
    })

    return (
      <div
        {...props}
        style={{
          ...extras,
          ...(bottom.consumed && axis === 'vertical' && !(isPrimary && ignoresBottom)
            ? {
                ...props.style,
                // The enclosing bottom insets' accessories (styles.css), in the same frame.
                paddingBottom: `calc(${cssLength(props.style?.paddingBottom)} + var(--satin-scroll-inset-bottom))`,
              }
            : props.style),
        }}
        data-satin-safe-area-extra={extras ? 'true' : undefined}
        ref={elementRef}
        data-satin-bounce="native"
        data-satin-primary={isPrimary ? 'true' : 'false'}
        data-satin-list-navigation={listTitled ? navigation : undefined}
        data-satin-scroll-navigation={listTitled ? undefined : navigation}
        data-satin-ignores-safe-area={ignoresSafeArea === true ? 'all' : ignoresSafeArea}
        data-satin-scroll-edge-hidden={edgePolicy.hidden || undefined}
        data-satin-scroll-edge-style={edgePolicy.style}
        data-satin-searchable={
          searchable && !toolbarSearch ? (searchable.scopes ? 'scoped' : 'plain') : undefined
        }
        data-satin-search-placement={bottomSearch ? 'toolbar' : undefined}
        data-satin-bottom-bar={
          isPrimary && !ignoresBottom
            ? bottomSearch
              ? 'search'
              : chrome.hasBottomBar || undefined
            : undefined
        }
        data-satin-scroll={id}
        data-satin-scroll-axis={axis}
        data-satin-horizontal-drag={axis === 'horizontal' ? 'both' : undefined}
        data-satin-scroll-chain="false"
      >
        {refresh && <RefreshControl surface={elementRef} content={contentRef} action={refresh} />}
        <NestedScrollContext value={true}>
          <ListNavigationContext value={undefined}>
            <SafeAreaPaddingContext value={NO_LENGTHS}>
              <IgnoresSafeAreaContext value={NO_IGNORED}>
                {positioning || refresh ? (
                  <ScrollTargetContext.Provider value={registerTarget}>
                    <div
                      ref={contentRef}
                      data-satin-scroll-content=""
                      data-satin-refresh-content={refresh ? 'true' : undefined}
                      data-satin-scroll-positioned={positioning ? 'true' : undefined}
                      style={
                        !positioning
                          ? { display: isList ? 'flow-root' : undefined, minHeight: 0 }
                          : undefined
                      }
                      data-satin-scroll-alignment={defaultScrollAnchor}
                    >
                      {content}
                    </div>
                  </ScrollTargetContext.Provider>
                ) : (
                  content
                )}
                {extraBottom > 0 && axis === 'vertical' && (
                  <div
                    aria-hidden="true"
                    data-satin-safe-area-tail=""
                    style={{ height: extraBottom }}
                  />
                )}
              </IgnoresSafeAreaContext>
            </SafeAreaPaddingContext>
          </ListNavigationContext>
        </NestedScrollContext>
      </div>
    )
  },
)
