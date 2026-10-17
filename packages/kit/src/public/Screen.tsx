import type {
  ToolbarMinimizationBehavior,
  ToolbarMinimizationRestoration,
  ToolbarMinimizationSafeAreaAdjustment,
} from '../navigation/toolbarMinimization.ts'
import {
  Children,
  useCallback,
  useContext,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { ScreenContext } from '../navigation/navigationContext.tsx'
import type { Visibility } from '../navigation/types.ts'
import type { Searchable } from '../search/searchable.ts'
import { NavigationLayoutContext } from '../layout/navigationLayoutContext.ts'
import { useLayoutClass } from '../root/runtimeContext.ts'
import { ScreenChromeContext, ScreenContentContext } from './screenChrome.tsx'
import { useNavigationTransition, type NavigationTransition } from './navigationTransition.tsx'
import {
  BottomBarRegistrationContext,
  SearchToolbarItemContext,
  ToolbarSlotsContext,
} from './toolbar.tsx'

/** A screen's own chrome, overriding its route's static options. */
export type ScreenProps = {
  children: ReactNode
  title?: string
  /** A line under the title: 12 pt under an inline 15 pt title, 11 pt under a large title. */
  subtitle?: string
  titleDisplay?: 'large' | 'inline' | 'inlineLarge' | 'none'
  backButton?: 'automatic' | 'hidden'
  /** The navigation bar's visibility. */
  toolbarVisibility?: Visibility
  /** Opt-in navigation-bar minimization; use never to keep the bar expanded. */
  toolbarMinimizationBehavior?: ToolbarMinimizationBehavior
  toolbarMinimizationRestoration?: ToolbarMinimizationRestoration
  toolbarMinimizationSafeAreaAdjustment?: ToolbarMinimizationSafeAreaAdjustment
  /** The screen's `ToolbarItem`, `ToolbarItemGroup` and `ToolbarSpacer` elements. */
  toolbar?: ReactNode
  /** A search field for this screen, placed in the navigation bar drawer or the bottom toolbar. */
  searchable?: Searchable
  /** How this screen arrives when pushed and leaves when popped.
   * `NavigationTransition.zoom(...)` grows it out of a `MatchedTransitionSource`. */
  navigationTransition?: NavigationTransition
}
/**
 * A route component's navigation chrome: title, toolbar, search and
 * related options, declared by the screen that owns them. Use it when the title or toolbar
 * depends on the screen's data; static chrome belongs in the route's options.
 *
 * @example
 * <Screen title={note.title} toolbar={
 *   <ToolbarItem placement="confirmationAction"><Button onPress={save}>Done</Button></ToolbarItem>
 * }>
 *   <List id="note">...</List>
 * </Screen>
 */
export function Screen({
  children,
  title,
  subtitle,
  titleDisplay,
  backButton,
  toolbarVisibility,
  toolbarMinimizationBehavior,
  toolbarMinimizationRestoration,
  toolbarMinimizationSafeAreaAdjustment,
  toolbar,
  searchable,
  navigationTransition,
}: ScreenProps) {
  const screen = useContext(ScreenContext),
    store = useContext(ScreenChromeContext)
  if (!screen || !store) throw new Error('Screen requires NavigationStack')
  useNavigationTransition(screen.key, navigationTransition)
  useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot)
  const hasToolbar = Children.toArray(toolbar).length > 0
  useLayoutEffect(() => {
    store.set(screen.key, {
      title,
      subtitle,
      titleDisplay,
      backButton,
      toolbarVisibility,
      toolbarMinimizationBehavior,
      toolbarMinimizationRestoration,
      toolbarMinimizationSafeAreaAdjustment,
      hasToolbar,
    })
    return () => store.set(screen.key)
  }, [
    store,
    screen.key,
    title,
    subtitle,
    titleDisplay,
    backButton,
    toolbarVisibility,
    hasToolbar,
    toolbarMinimizationBehavior,
    toolbarMinimizationRestoration,
    toolbarMinimizationSafeAreaAdjustment,
  ])
  const defaults = useContext(ScreenContentContext)
  // The bottom toolbar occupies the bottom safe area, so the primary scroll view's content clears it.
  const [bottomBars, setBottomBars] = useState(0)
  const registerBottomBar = useCallback(() => {
    setBottomBars(count => count + 1)
    return () => setBottomBars(count => count - 1)
  }, [])
  const [searchToolbarItem, setSearchToolbarItem] = useState<HTMLElement | null>(null)
  const bottomToolbar = store.slots.get(screen.key)?.bottom ?? undefined
  const scopedHorizontal = useContext(NavigationLayoutContext)
  const runtimeHorizontal = useLayoutClass().horizontal
  const horizontalSizeClass = scopedHorizontal ?? runtimeHorizontal
  return (
    <ScreenContentContext
      value={{
        ...defaults,
        ...(bottomBars > 0 ? { hasBottomBar: true } : {}),
        hasToolbar,
        bottomToolbar,
        trailingToolbar: store.slots.get(screen.key)?.trailing ?? undefined,
        searchToolbarItem: searchToolbarItem ?? undefined,
        horizontalSizeClass,
        ...(title !== undefined ? { title } : {}),
        ...(subtitle !== undefined ? { subtitle } : {}),
        ...(titleDisplay !== undefined ? { titleDisplay } : {}),
        ...(backButton !== undefined ? { backButton } : {}),
        ...(toolbarVisibility !== undefined ? { toolbarVisibility } : {}),
        ...(toolbarMinimizationBehavior !== undefined ? { toolbarMinimizationBehavior } : {}),
        ...(toolbarMinimizationRestoration !== undefined ? { toolbarMinimizationRestoration } : {}),
        ...(toolbarMinimizationSafeAreaAdjustment !== undefined
          ? { toolbarMinimizationSafeAreaAdjustment }
          : {}),
        // A screen's search belongs to that screen alone, never to a screen presented from it.
        searchable,
      }}
    >
      {children}
      {store.slots.has(screen.key) && (
        <BottomBarRegistrationContext value={registerBottomBar}>
          <SearchToolbarItemContext value={setSearchToolbarItem}>
            <ToolbarSlotsContext value={store.slots.get(screen.key)!}>
              {toolbar}
            </ToolbarSlotsContext>
          </SearchToolbarItemContext>
        </BottomBarRegistrationContext>
      )}
    </ScreenContentContext>
  )
}
