import { TabTrailingSlot } from '../tabs/TabTrailingSlot.tsx'
import { TabBadge } from '../tabs/TabBadge.tsx'
import { PadSearchBarMotion } from '../search/padSearchBarMotion.ts'
import { PadSearchPresentationContext } from '../search/PadSearchPresentationContext.tsx'
import { useControlStyle } from '../public/controlStyle.tsx'
import { orderedTabItems, TopTabLabel } from '../tabs/presentation.tsx'
import { handleTabKeyDown } from '../tabs/keyboard.ts'
import { readDeviceIdiom } from '../layout/deviceIdiom.ts'
import { SymbolImage, SymbolSelectionContext, type SymbolName } from '../symbols/Symbol.tsx'
import { focusFromFramework } from '../focus/programmaticFocus.ts'
import { GlassBackground } from './GlassEffect.tsx'
import { Glass } from './regions.ts'
import { MaterialEffectContext } from './liquidContext.ts'
import { sidebarCssTokens } from '../settings/tokens.ts'
import { AdaptiveTabsContext } from '../layout/adaptiveTabsContext.ts'
import { useSafeAreaMetrics } from '../safe-area/useSafeAreaMetrics.ts'
import { GLASS_DOCK_HEIGHT_PX, glassDockHeight, glassDockWidth } from './lens/Scene.tsx'
import { useLayoutClass } from '../root/runtimeContext.ts'
import {
  useId,
  useMemo,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { Pressable } from '../press/Pressable.tsx'
import { useGlassMaterialContext } from './context.ts'
import { resolveTabBarModel, TabBarAccessoryContext } from './tabBarModel.ts'
import { type GlassVariant } from './tokens.ts'

export type TabBarItem = Readonly<{
  accessibilityLabel?: string
  panelId?: string
  tabId?: string
  badge?: number | 'dot' | null
  disabled?: boolean
  icon?: ReactNode
  symbol?: SymbolName
  role?: 'search'
  id: string
  label: ReactNode
}>

export type TabBarProps = Omit<HTMLAttributes<HTMLElement>, 'children' | 'onSelect'> &
  Readonly<{
    items: readonly TabBarItem[]
    onSelect: (id: string) => void
    selected: string
    trailingAction?: ReactNode
    adaptive?: boolean
    onShowSidebar?: () => void
    variant?: GlassVariant
  }>

/** An item's horizontal extent inside the tab bar host, in CSS pixels from its left edge. */
export type TabItemFrame = Readonly<{ x: number; width: number }>

type TabBarStyle = CSSProperties & {
  '--satin-tab-tint'?: string
  '--satin-tab-count': number
  '--satin-tab-selection-offset': string
  '--satin-tab-selected-index': number
}

export function TabBar({
  className,
  adaptive = true,
  onShowSidebar,
  trailingAction,
  items: declaredItems,
  onSelect,
  selected,
  style,
  variant = 'regular',
  ...props
}: TabBarProps) {
  const searchPresentation = useContext(PadSearchPresentationContext)
  const searchProgress = searchPresentation?.owner === selected ? 1 : 0
  const { tint } = useControlStyle()
  const liquid = useContext(MaterialEffectContext)
  const layoutClass = useLayoutClass()
  const metrics = useSafeAreaMetrics()
  const { register, unregister } = useContext(AdaptiveTabsContext)
  const sidebar = adaptive && readDeviceIdiom() === 'pad' && layoutClass.horizontal === 'regular'
  const items = useMemo(
    () => (sidebar ? orderedTabItems(declaredItems, 'top') : declaredItems),
    [declaredItems, sidebar],
  )
  // The regular-width iPad bar runs on the same glass tab engine as the phone dock (lens on
  // press, drag to select). This bar only lays out and measures the items; the engine draws
  // the material, the selection, the lens and the accessible tab buttons on top of it.
  // A bar that also carries the Show Tab Sidebar control keeps the DOM bar for now.
  const liquidTop = sidebar && liquid !== null && !onShowSidebar
  const [itemFrames, setItemFrames] = useState<readonly TabItemFrame[]>()
  const { selectedIndex } = resolveTabBarModel(items, selected, sidebar && !!onShowSidebar)
  const { chromeLayer, registerRegion } = useGlassMaterialContext()
  const regionId = useId()
  const elementRef = useRef<HTMLElement>(null)
  const padBarMotion = useRef<PadSearchBarMotion | null>(null)
  const previousSearchProgress = useRef(searchProgress)
  useLayoutEffect(() => {
    if (!sidebar || liquidTop || previousSearchProgress.current === searchProgress) return
    previousSearchProgress.current = searchProgress
    const element = elementRef.current
    if (!element) return
    padBarMotion.current ??= new PadSearchBarMotion()
    padBarMotion.current.start(element, searchProgress, undefined)
  }, [sidebar, liquidTop, searchProgress])
  useLayoutEffect(() => () => padBarMotion.current?.dispose(), [])
  const hasAccessory = useContext(TabBarAccessoryContext)
  const compact =
    readDeviceIdiom() === 'phone' && metrics.layoutViewport.width > metrics.layoutViewport.height
  const intrinsicWidth =
    readDeviceIdiom() === 'phone' && !compact && items.length < 4 && !hasAccessory

  const hasTrailingAction = trailingAction != null && trailingAction !== false
  const actionSize = compact
    ? glassDockHeight(metrics.layoutViewport.width, metrics.layoutViewport.height)
    : GLASS_DOCK_HEIGHT_PX
  const availableDockWidth =
    glassDockWidth(
      metrics.layoutViewport.width,
      metrics.screen,
      metrics.insets,
      metrics.layoutViewport.height,
    ) - (hasTrailingAction ? actionSize + 8 : 0)
  const action = hasTrailingAction ? (
    <TabTrailingSlot
      kind="action"
      inert={props.inert}
      topAnchor={sidebar ? elementRef : undefined}
      style={{
        ...(sidebar ? {} : { width: actionSize, height: actionSize }),
        visibility: props.inert ? 'hidden' : undefined,
      }}
    >
      {trailingAction}
    </TabTrailingSlot>
  ) : null

  useLayoutEffect(() => {
    const element = elementRef.current
    if (!element || sidebar) return
    return registerRegion({ element, id: regionId, radius: 30, variant })
  }, [chromeLayer, regionId, registerRegion, variant, sidebar])

  useLayoutEffect(() => {
    const element = elementRef.current
    if (!element || !sidebar) return
    const update = () => register(regionId, element.getBoundingClientRect().height)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => {
      observer.disconnect()
      unregister(regionId)
    }
  }, [chromeLayer, register, unregister, regionId, sidebar])

  useLayoutEffect(() => {
    const element = elementRef.current
    if (!element || !liquidTop) return
    const measure = () => {
      const host = element.getBoundingClientRect()
      const frames = [...element.querySelectorAll('[data-satin-tab-item]')].map(item => {
        const rect = item.getBoundingClientRect()
        return { x: rect.left - host.left, width: rect.width }
      })
      setItemFrames(previous =>
        previous && JSON.stringify(previous) === JSON.stringify(frames) ? previous : frames,
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [chromeLayer, liquidTop, items])

  useLayoutEffect(() => {
    if (!liquidTop || !itemFrames) return
    liquid?.registerTabs(regionId, {
      items,
      selected,
      onSelect,
      adaptive,
      variant,
      tint,
      insetHost: elementRef.current ?? undefined,
      placement: 'top',
      searchProgress,
      itemFrames,
    })
    return () => liquid?.registerTabs(regionId, undefined)
  }, [
    liquid?.registerTabs,
    regionId,
    items,
    selected,
    onSelect,
    adaptive,
    variant,
    tint,
    liquidTop,
    itemFrames,
    searchProgress,
  ])

  useLayoutEffect(() => {
    if (sidebar) return
    liquid?.registerTabs(regionId, {
      items,
      selected,
      onSelect,
      adaptive,
      variant,
      tint,
      insetHost: elementRef.current ?? undefined,
      intrinsicWidth,
    })
    return () => liquid?.registerTabs(regionId, undefined)
  }, [
    liquid?.registerTabs,
    regionId,
    items,
    selected,
    onSelect,
    adaptive,
    variant,
    tint,
    sidebar,
    intrinsicWidth,
  ])
  if (!sidebar)
    return (
      <>
        <div
          ref={element => {
            elementRef.current = element
          }}
          data-satin-tab-inset="true"
          style={{
            height: compact
              ? glassDockHeight(metrics.layoutViewport.width, metrics.layoutViewport.height)
              : metrics.layoutViewport.width > metrics.layoutViewport.height
                ? 48
                : GLASS_DOCK_HEIGHT_PX,
            width:
              compact || intrinsicWidth
                ? 'max-content'
                : glassDockWidth(
                    metrics.layoutViewport.width,
                    metrics.screen,
                    metrics.insets,
                    metrics.layoutViewport.height,
                  ),
            maxWidth: availableDockWidth,
            transform: `translateX(${(metrics.insets.left - metrics.insets.right) / 2}px)`,
          }}
        >
          {(compact || intrinsicWidth) && (
            <div
              data-satin-tab-size-probe={compact ? 'true' : 'portrait'}
              style={{ '--satin-tab-count': items.length } as CSSProperties}
              aria-hidden="true"
              inert
            >
              {items.map(item => (
                <span key={item.id}>
                  {compact &&
                    (item.symbol ? (
                      <SymbolImage name={item.symbol} style={{ fontSize: 20 }} />
                    ) : (
                      item.icon
                    ))}
                  <small>{item.label}</small>
                </span>
              ))}
            </div>
          )}
        </div>
        {action}
      </>
    )
  if (!chromeLayer) return null

  if (liquidTop)
    return createPortal(
      <>
        <nav
          ref={elementRef}
          aria-hidden="true"
          inert
          className={className}
          data-satin-tab-placement="top"
          data-satin-tab-bar="true"
          data-satin-tab-sizing="true"
          style={{ ...style, ...sidebarCssTokens }}
        >
          <div data-satin-tab-items="true">
            {items.map(item => (
              // Unselected weight for every item: selection must not move the geometry.
              <span key={item.id} data-satin-tab-item="true">
                <span data-satin-tab-label="true">
                  <TopTabLabel item={item} />
                </span>
              </span>
            ))}
          </div>
        </nav>
        {action}
      </>,
      chromeLayer,
    )

  const tabBarStyle: TabBarStyle = {
    ...style,
    ...(sidebar ? sidebarCssTokens : {}),
    ...(sidebar && searchProgress
      ? { translate: `0 ${-64 * searchProgress}px`, opacity: 1 - searchProgress }
      : {}),
    '--satin-tab-tint': tint,
    '--satin-tab-count': items.length,
    '--satin-tab-selection-offset': `${selectedIndex * 100}%`,
    '--satin-tab-selected-index': selectedIndex,
  }

  return createPortal(
    <>
      <nav
        {...props}
        ref={elementRef}
        role="tablist"
        inert={props.inert || (sidebar && searchProgress > 0) || undefined}
        aria-hidden={props['aria-hidden'] || (sidebar && searchProgress > 0) || undefined}
        onKeyDown={handleTabKeyDown}
        aria-label={props['aria-label'] ?? 'App tabs'}
        className={className}
        data-satin-glass-region={sidebar ? undefined : regionId}
        data-satin-tab-placement={sidebar ? 'top' : 'bottom'}
        data-satin-glass-variant={variant}
        data-satin-role="chrome"
        data-satin-tab-bar="true"
        style={tabBarStyle}
      >
        <GlassBackground glass={variant === 'clear' ? Glass.clear : Glass.regular} />
        <div data-satin-tab-items="true">
          {onShowSidebar && (
            <Pressable
              data-satin-tab-sidebar-show="true"
              aria-label="Show Tab Sidebar"
              onPress={onShowSidebar}
            >
              <SymbolImage name="sidebar.left" />
            </Pressable>
          )}
          {items.map((item, index) => {
            const isSelected = item.id === selected
            return (
              <Pressable
                key={item.id}
                role="tab"
                id={item.tabId}
                aria-controls={item.panelId}
                aria-selected={isSelected}
                tabIndex={isSelected || (selectedIndex < 0 && index === 0) ? 0 : -1}
                aria-label={
                  item.accessibilityLabel ??
                  (sidebar && item.role === 'search'
                    ? typeof item.label === 'string'
                      ? item.label
                      : 'Search'
                    : undefined)
                }
                data-satin-tab-item="true"
                data-satin-tab-selected={isSelected || undefined}
                disabled={item.disabled}
                onPress={() => {
                  // VoiceOver activation can reach onPress before DOM focus follows
                  // its cursor. Establish tab ownership before mounting the panel.
                  const button =
                    elementRef.current?.querySelectorAll<HTMLButtonElement>(
                      '[data-satin-tab-item]',
                    )[index]
                  if (button) focusFromFramework(button, { preventScroll: true })
                  onSelect(item.id)
                }}
              >
                <span aria-hidden="true" data-satin-tab-icon="true">
                  <SymbolSelectionContext value={isSelected}>
                    {item.symbol ? (
                      <SymbolImage name={item.symbol} style={{ fontSize: 23.4 }} />
                    ) : (
                      item.icon
                    )}
                  </SymbolSelectionContext>
                </span>
                <span data-satin-tab-label="true">
                  {sidebar ? <TopTabLabel item={item} /> : item.label}
                </span>
                <TabBadge value={item.badge} />
              </Pressable>
            )
          })}
        </div>
      </nav>
      {action}
    </>,
    chromeLayer,
  )
}
