// The screen chrome store: per-entry titles, toolbar flags and toolbar slot elements, written by
// Screen and ScreenToolbar and read by the navigation engine. Apps never touch it.
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { NavigatorContext, ScreenContext } from '../navigation/navigationContext.tsx'
import {
  resolveNavigationDisplay,
  resolveNavigationVisibility,
} from '../navigation/navigationChromeModel.ts'
import type { NavigationBarDefinition } from '../navigation/types.ts'
import { ToolbarMaterialContext } from '../glass/toolbarMaterialContext.ts'
import type { ScreenProps } from './Screen.tsx'

type ChromeEntry = Omit<ScreenProps, 'children' | 'toolbar' | 'searchable'> & {
  hasToolbar?: boolean
}
export type ToolbarSlot =
  | 'leading'
  | 'topBarLeading'
  | 'trailing'
  | 'principal'
  | 'bottom'
  | 'subtitle'
  | 'largeTitle'
  | 'largeSubtitle'
export type Slots = Partial<Record<ToolbarSlot, HTMLDivElement | null>>
export function createScreenChrome() {
  const entries = new Map<string, ChromeEntry>()
  const slots = new Map<string, Slots>()
  const inlineTitleHeights = new Map<string, number>()
  const slotOwners = new Map<string, Map<string, Slots>>()
  const listeners = new Set<() => void>()
  let revision = 0
  return {
    entries,
    slots,
    inlineTitleHeights,
    setInlineTitleHeight(key: string, height: number) {
      const next = Number.isFinite(height) ? Math.max(0, height) : 0
      if ((inlineTitleHeights.get(key) ?? 0) === next) return
      if (next) inlineTitleHeights.set(key, next)
      else inlineTitleHeights.delete(key)
      revision++
      listeners.forEach(fn => fn())
    },
    snapshot: () => revision,
    subscribe: (fn: () => void) => {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
    setSlots(key: string, value?: Slots, owner = 'toolbar') {
      const owners = slotOwners.get(key) ?? new Map<string, Slots>()
      if (value) owners.set(owner, value)
      else owners.delete(owner)
      if (owners.size) {
        slotOwners.set(key, owners)
        slots.set(key, Object.assign({}, ...owners.values()))
      } else {
        slotOwners.delete(key)
        slots.delete(key)
      }
      revision++
      listeners.forEach(fn => fn())
    },
    set(key: string, value?: ChromeEntry) {
      if (value) entries.set(key, value)
      else entries.delete(key)
      revision++
      listeners.forEach(fn => fn())
    },
  }
}
export const ScreenContentContext = createContext<
  Omit<ScreenProps, 'children'> & {
    hasBottomBar?: boolean
    hasToolbar?: boolean
    /** This screen's bottom toolbar slot, where an automatic search field goes on iPhone. */
    bottomToolbar?: HTMLElement
    /** Automatic regular-width search belongs after the trailing navigation items. */
    trailingToolbar?: HTMLElement
    /** The place a `DefaultToolbarItem kind="search"` holds among the bottom bar items. */
    searchToolbarItem?: HTMLElement
    /** The screen's horizontal size class (a presentation's own, else the window's): it selects
     * where an automatic `searchable` field goes. */
    horizontalSizeClass?: 'compact' | 'regular'
  }
>({})
export const ScreenChromeContext = createContext<ReturnType<typeof createScreenChrome> | null>(null)
const noop = () => () => {}
const zero = () => 0
export function useScreenChrome() {
  const store = useContext(ScreenChromeContext)
  useSyncExternalStore(store?.subscribe ?? noop, store?.snapshot ?? zero, zero)
  return store?.entries
}
export const NavigationSizeClassContext = createContext<'compact' | 'regular'>('regular')
export function useScreenNavigation(vertical?: 'compact' | 'regular') {
  const inherited = useContext(NavigationSizeClassContext)
  const compact = (vertical ?? inherited) === 'compact'
  return useCallback(
    (
      base: NavigationBarDefinition | undefined,
      override: ChromeEntry | undefined,
      params?: unknown,
      entryIndex = 0,
    ) => screenNavigation(base, override, params, compact, entryIndex),
    [compact],
  )
}

/** The content and navigation chrome consume the same resolved title-display policy. */
export function useScreenContentNavigation() {
  const chrome = useContext(ScreenContentContext)
  const vertical = useContext(NavigationSizeClassContext)
  const screen = useContext(ScreenContext)
  const navigator = useContext(NavigatorContext)
  const entryIndex =
    navigator?.getState().entries.findIndex(entry => entry.key === screen?.key) ?? 0
  // Presentations clear this context. Their bare content must not inherit the parent's back row.
  const ownsNavigation = chrome.titleDisplay !== undefined || chrome.hasToolbar !== undefined
  return {
    ...chrome,
    toolbarVisibility: resolveNavigationVisibility(
      chrome.title,
      chrome.toolbarVisibility,
      chrome.titleDisplay,
      chrome.hasToolbar,
      ownsNavigation && entryIndex > 0 && chrome.backButton !== 'hidden',
    ),
    titleDisplay: resolveNavigationDisplay(
      chrome.title,
      chrome.titleDisplay,
      vertical === 'compact',
    ),
  }
}

export function screenNavigation(
  base: NavigationBarDefinition | undefined,
  override: ChromeEntry | undefined,
  params?: unknown,
  compact = false,
  entryIndex = 0,
): NavigationBarDefinition | undefined {
  if (!base && !override) return undefined
  const authoredTitle = override?.title ?? base?.title ?? ''
  const title = typeof authoredTitle === 'function' ? authoredTitle(params) : authoredTitle
  return {
    ...base,
    title,
    subtitle: override?.subtitle ?? base?.subtitle,
    display: resolveNavigationDisplay(title, override?.titleDisplay ?? base?.display, compact),
    backButton: override?.backButton ?? base?.backButton,
    visibility: resolveNavigationVisibility(
      title,
      override?.toolbarVisibility ?? base?.visibility,
      override?.titleDisplay ?? base?.display,
      override?.hasToolbar,
      entryIndex > 0 && (override?.backButton ?? base?.backButton) !== 'hidden',
    ),
  }
}
export function ScreenToolbar({
  entryKey,
  active = true,
  motion,
  hasToolbar,
  inlineLarge,
  backVisible,
  fallback,
  onPrincipalChange,
}: {
  entryKey?: string
  active?: boolean
  /** This entry shows a back control: its leading items sit after it. */
  backVisible?: boolean
  /** Keeps both transition participants painted. Outgoing items remain inert; incoming items
   * become interactive and visible to assistive technology after their filled slots pass 0.5 opacity. */
  motion?: 'incoming' | 'outgoing'
  hasToolbar?: boolean
  inlineLarge?: boolean
  fallback?: ReactNode
  /** Reports whether this entry shows a principal item, which replaces its bar title. */
  onPrincipalChange?: (entryKey: string, present: boolean) => void
}) {
  const store = useContext(ScreenChromeContext)
  const [leading, setLeading] = useState<HTMLDivElement | null>(null)
  const [trailing, setTrailing] = useState<HTMLDivElement | null>(null)
  const [principal, setPrincipal] = useState<HTMLDivElement | null>(null)
  const [bottom, setBottom] = useState<HTMLDivElement | null>(null)
  const [incomingVisible, setIncomingVisible] = useState(false)
  useLayoutEffect(() => {
    setIncomingVisible(false)
    if (motion !== 'incoming') return
    let frame = 0
    const check = () => {
      const slots = [leading, trailing, principal, bottom].filter(
        (slot): slot is HTMLDivElement => slot !== null && slot.childElementCount > 0,
      )
      if (slots.length > 0 && slots.every(slot => Number(getComputedStyle(slot).opacity) > 0.5)) {
        setIncomingVisible(true)
        return
      }
      frame = requestAnimationFrame(check)
    }
    frame = requestAnimationFrame(check)
    return () => cancelAnimationFrame(frame)
  }, [motion, leading, trailing, principal, bottom])
  useLayoutEffect(() => {
    if (!entryKey || !store) return
    store.setSlots(entryKey, {
      leading,
      topBarLeading: inlineLarge ? trailing : leading,
      trailing,
      principal,
      bottom,
    })
    return () => store.setSlots(entryKey)
  }, [store, entryKey, leading, trailing, principal, bottom, inlineLarge])
  useLayoutEffect(() => {
    if (!principal || !entryKey || !onPrincipalChange) return
    const report = () => onPrincipalChange(entryKey, principal.childElementCount > 0)
    const mutation = new MutationObserver(report)
    mutation.observe(principal, { childList: true })
    report()
    return () => {
      mutation.disconnect()
      onPrincipalChange(entryKey, false)
    }
  }, [principal, entryKey, onPrincipalChange])
  useLayoutEffect(() => {
    const header = trailing?.closest<HTMLElement>('[data-satin-navigation-chrome]')
    if (!active || !header || !leading || !trailing || !principal) return
    const measure = () => {
      const bounds = header.getBoundingClientRect()
      const back = header.querySelector<HTMLElement>('[data-satin-navigation-back-visible="true"]')
      const toggle = header.querySelector<HTMLElement>('[data-satin-sidebar-toggle]')
      const toggleBounds = toggle?.getBoundingClientRect()
      const toggleLeading = header.dataset.satinPane === 'detail'
      const start = Math.max(
        toggleLeading && toggleBounds ? toggleBounds.right - bounds.left : 0,
        leading.childElementCount ? leading.getBoundingClientRect().right - bounds.left : 0,
        back ? back.getBoundingClientRect().right - bounds.left : 0,
      )
      const end = Math.max(
        trailing.childElementCount ? bounds.right - trailing.getBoundingClientRect().left : 0,
        !toggleLeading && toggleBounds ? bounds.right - toggleBounds.left : 0,
      )
      header.style.setProperty('--satin-toolbar-title-reserve', `${Math.max(start, end)}px`)
    }
    const resize = new ResizeObserver(measure)
    for (const node of [header, leading, trailing, principal]) resize.observe(node)
    const mutation = new MutationObserver(measure)
    mutation.observe(header, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-satin-navigation-back-visible'],
    })
    measure()
    return () => {
      resize.disconnect()
      mutation.disconnect()
      header.style.removeProperty('--satin-toolbar-title-reserve')
    }
  }, [active, leading, trailing, principal])
  return (
    <div
      data-satin-entry-toolbar={entryKey}
      // Portal content retains the screen's covered ownership when its toolbar leaves layout.
      data-satin-covered={!active && !motion ? 'true' : undefined}
      hidden={!active && !motion}
      inert={!active || motion === 'outgoing' || (motion === 'incoming' && !incomingVisible)}
      aria-hidden={
        !active || motion === 'outgoing' || (motion === 'incoming' && !incomingVisible) || undefined
      }
      data-satin-toolbar-interactive={
        (active && (motion !== 'incoming' || incomingVisible)) || undefined
      }
      data-satin-entry-toolbar-active={active || undefined}
      data-satin-toolbar-motion={motion}
      data-satin-entry-back-visible={backVisible || undefined}
      style={{ display: active || motion ? 'contents' : 'none' }}
    >
      <div ref={setLeading} data-satin-navigation-toolbar-slot="leading" />
      <div ref={setTrailing} data-satin-navigation-toolbar-slot="trailing">
        <ToolbarMaterialContext value={true}>{hasToolbar ? null : fallback}</ToolbarMaterialContext>
      </div>
      <div ref={setPrincipal} data-satin-navigation-toolbar-slot="principal" />
      <div ref={setBottom} data-satin-navigation-toolbar-slot="bottom" />
    </div>
  )
}
