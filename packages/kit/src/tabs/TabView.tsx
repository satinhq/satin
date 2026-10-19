import { TabBadge } from './TabBadge.tsx'
import { TabTrailingSlot } from './TabTrailingSlot.tsx'
import {
  PadSearchPresentationContext,
  PadSearchTabContext,
} from '../search/PadSearchPresentationContext.tsx'
import { TabSidebarSurface } from './TabSidebarSurface.tsx'
import { ScrollSurface } from '../scroll/ScrollSurface.tsx'
import { TabSection, type TabSectionProps } from './TabSection.tsx'
export { TabSection, type TabSectionProps } from './TabSection.tsx'
import { orderedTabItems } from './presentation.tsx'
import { installAccessoryContactOwnership } from './accessoryContact.ts'
import { restoreCompactTabBar } from './compactBar.ts'
import { tabSidebarCollapseGlyph } from './tabSidebarGlyph.ts'
import { prepareKeyboardForNavigation } from '../keyboard/adapter.ts'
import { MaterialEffectContext } from '../glass/liquidContext.ts'
import { flushSync } from 'react-dom'
import { handleTabKeyDown } from './keyboard.ts'
import { focusFromFramework } from '../focus/programmaticFocus.ts'
import { useLayoutClass, useSatinLayoutRuntime } from '../root/runtimeContext.ts'
import { readDeviceIdiom } from '../layout/deviceIdiom.ts'
import { Pressable } from '../press/Pressable.tsx'
import { SymbolImage } from '../symbols/Symbol.tsx'
import { GlassEffect } from '../public/glass.tsx'
import { GlassButton } from '../glass/GlassEffect.tsx'
import { SafeAreaInset } from '../safe-area/SafeAreaInset.tsx'
import type { SymbolName } from '../symbols/Symbol.tsx'
import {
  Children,
  isValidElement,
  useCallback,
  useContext,
  useId,
  useMemo,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from 'react'
import { glassDockWidth } from '../glass/lens/Scene.tsx'
import { TabBar, type TabBarItem } from '../glass/TabBar.tsx'
import { TabBarAccessoryContext } from '../glass/tabBarModel.ts'
import { TabActivityContext, TabRegistrationContext, TabSidebarContext } from './context.ts'
import { resolveTabSelection, retainTabs } from './model.ts'

export type TabProps<Id extends string = string> = Readonly<{
  id: Id
  label: string
  icon?: ReactNode
  symbol?: SymbolName
  role?: 'search'
  badge?: number | 'dot' | null
  disabled?: boolean
  accessibilityLabel?: string
  children: ReactNode
}>

/** Declaration consumed by TabView. Each tab owns its content and navigator. */
export function Tab<Id extends string>(props: TabProps<Id>) {
  return props.children
}

export type TabViewProps<Id extends string = string> = Readonly<{
  children: ReactNode
  selection?: Id
  defaultSelection?: Id
  onSelectionChange?: (id: Id) => void
  bottomAccessory?: ReactNode
  /** One app action beside the tabs. Mutually exclusive with a search-role tab. */
  trailingAction?: ReactNode
  /** Regular capsule glass by default. Use custom when the accessory supplies its own material. */
  bottomAccessoryMaterial?: 'glass' | 'custom'
  tabViewStyle?: 'automatic' | 'sidebarAdaptable'
}>

function RetainedTab({
  active,
  presented,
  id,
  children,
  register,
  focusOnActivate,
  panelId,
  tabId,
  label,
}: {
  active: boolean
  presented: boolean
  id: string
  children: ReactNode
  focusOnActivate: boolean
  panelId: string
  tabId: string | undefined
  label: string
  register: (id: string, action: () => void) => () => void
}) {
  const panel = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = panel.current
    if (!active || !element) return
    return () => {
      // Controlled selection and unmounts also end editing before the old screen leaves.
      if (element.contains(element.ownerDocument.activeElement)) prepareKeyboardForNavigation()
    }
  }, [active])
  useLayoutEffect(() => {
    if (active)
      panel.current?.dispatchEvent(
        new CustomEvent('satin:tab-activate', {
          bubbles: true,
          detail: { focus: focusOnActivate && presented },
        }),
      )
  }, [active, presented, focusOnActivate])
  const registration = useCallback((action: () => void) => register(id, action), [id, register])
  return (
    <TabActivityContext value={active}>
      <TabRegistrationContext value={registration}>
        <div
          ref={panel}
          id={panelId}
          role="tabpanel"
          aria-label={label}
          aria-labelledby={tabId}
          data-satin-tab-panel={id}
          data-satin-tab-active={String(active)}
          data-satin-tab-presented={String(presented)}
          aria-hidden={!presented || undefined}
          inert={!presented}
        >
          {children}
        </div>
      </TabRegistrationContext>
    </TabActivityContext>
  )
}

/** Lazy, retained tabs. Hidden app effects remain app-owned; Satin work pauses. */
export function TabView<Id extends string = string>({
  children,
  selection,
  defaultSelection,
  onSelectionChange,
  bottomAccessory,
  trailingAction,
  bottomAccessoryMaterial = 'glass',
  tabViewStyle = 'automatic',
}: TabViewProps<Id>) {
  const [searchOwner, setSearchOwner] = useState<string | null>(null)
  const searchPresentation = useMemo(
    () => ({ owner: searchOwner, setOwner: setSearchOwner }),
    [searchOwner],
  )
  const layout = useLayoutClass()
  const { metrics } = useSatinLayoutRuntime()
  const canShowSidebar =
    tabViewStyle === 'sidebarAdaptable' &&
    readDeviceIdiom() === 'pad' &&
    layout.horizontal === 'regular'
  const [localExpanded, setLocalExpanded] = useState(false)
  const savedSidebar = useContext(TabSidebarContext)
  const sidebarExpanded = savedSidebar?.expanded ?? localExpanded
  const setSidebarExpanded = savedSidebar?.setExpanded ?? setLocalExpanded
  const showSidebar = canShowSidebar && sidebarExpanded
  const overlaySidebar =
    canShowSidebar && metrics.layoutViewport.width < metrics.layoutViewport.height
  // Native distinguishes initial top tabs from returning to them after dismissing
  // a portrait overlay. Keep that presentation history separate from visibility.
  const [collapsedOverlay, setCollapsedOverlay] = useState(false)
  // Expanding landscape tabs raises the title, but native preserves the list's
  // previous card origin. A scene launched already expanded has no such reserve.
  const [expandedFromTabs, setExpandedFromTabs] = useState(false)
  const didCollapseOverlay = overlaySidebar && !showSidebar && collapsedOverlay
  const changeSidebar = (expanded: boolean) => {
    setCollapsedOverlay(!expanded && overlaySidebar)
    setExpandedFromTabs(expanded && !overlaySidebar)
    setSidebarExpanded(expanded)
  }
  const declarations = useMemo(() => {
    const tabs: TabProps<Id>[] = []
    const sections: { id: string; title: string; tabs: Id[] }[] = []
    const sidebarOnly = new Set<Id>()
    const grouped = new Set<Id>()
    const ids = new Set<string>()
    function add(child: ReactNode, section?: (typeof sections)[number], only = false) {
      if (!isValidElement<TabProps<Id>>(child) || child.type !== Tab)
        throw new Error('TabView and TabSection children must be Tab declarations.')
      if (!child.props.id.trim() || ids.has(child.props.id))
        throw new Error(`Invalid or duplicate tab id: ${child.props.id}`)
      ids.add(child.props.id)
      tabs.push(child.props)
      if (only) sidebarOnly.add(child.props.id)
      if (section) {
        section.tabs.push(child.props.id)
        grouped.add(child.props.id)
      }
    }
    for (const child of Children.toArray(children)) {
      if (isValidElement<TabSectionProps>(child) && child.type === TabSection) {
        if (child.props.tabPlacement !== 'sidebarOnly')
          throw new Error('TabSection currently supports tabPlacement=sidebarOnly')
        const id = child.props.id ?? child.props.title
        if (!id.trim() || sections.some(section => section.id === id))
          throw new Error(`Invalid or duplicate TabSection id: ${id}`)
        const section = { id, title: child.props.title, tabs: [] as Id[] }
        sections.push(section)
        Children.forEach(child.props.children, tab => {
          if (tab != null) add(tab, section, child.props.tabPlacement === 'sidebarOnly')
        })
      } else add(child)
    }
    return { tabs, sections, sidebarOnly, grouped }
  }, [children])
  const { tabs, sections, sidebarOnly, grouped } = declarations
  const [collapsedSections, setCollapsedSections] = useState<ReadonlySet<string>>(new Set())
  const selectableTabs = canShowSidebar ? tabs : tabs.filter(tab => !sidebarOnly.has(tab.id))
  const scopeId = useId()
  const [internal, setInternal] = useState(defaultSelection)
  const requested = resolveTabSelection(
    selectableTabs,
    selection === undefined ? internal : selection,
  )
  const [presented, setPresented] = useState(requested)
  const selected = resolveTabSelection(selectableTabs, presented)
  const [initialSelection] = useState(selected)
  const [visited, setVisited] = useState<readonly Id[]>([])
  const mounted = retainTabs(visited, tabs, requested)
  if (mounted !== visited) setVisited(mounted)
  const container = useRef<HTMLDivElement>(null)
  const glass = useContext(MaterialEffectContext)
  // Images own their pending placeholders. Tab visibility waits only for the
  // destination glass source, never for artwork decode or ContentAdmission.
  useLayoutEffect(() => {
    if (requested === selected) return
    const panel = [
      ...(container.current?.querySelectorAll<HTMLElement>('[data-satin-tab-panel]') ?? []),
    ].find(element => element.dataset.satinTabPanel === requested)
    if (!panel) return
    if (!glass?.preparingSources) {
      setPresented(requested)
      return
    }
    // Measure the incoming panel while the outgoing page remains painted. Only the
    // renderer's complete source/region transaction may expose the incoming page.
    const admit = (event: Event) => {
      if (event.target === panel) flushSync(() => setPresented(requested))
    }
    panel.addEventListener('satin:tab-source-ready', admit)
    return () => panel.removeEventListener('satin:tab-source-ready', admit)
  }, [requested, selected, glass?.preparingSources])
  const actions = useRef(new Map<string, () => void>())
  const register = useCallback((id: string, action: () => void) => {
    if (actions.current.has(id)) throw new Error('A Tab supports one primary NavigatorHost.')
    actions.current.set(id, action)
    return () => {
      if (actions.current.get(id) === action) actions.current.delete(id)
    }
  }, [])
  const items: readonly TabBarItem[] = useMemo(
    () =>
      tabs.map(({ children: _children, ...item }) => ({
        ...item,
        panelId: `${scopeId}-panel-${encodeURIComponent(item.id)}`,
        tabId: `${scopeId}-tab-${encodeURIComponent(item.id)}`,
      })),
    [tabs, scopeId],
  )
  const sidebarItems = useMemo(() => orderedTabItems(items, 'sidebar'), [items])
  // Native keeps the most recently selected sidebar-only destination beside the
  // primary tabs, including after returning to a primary destination.
  const [lastSidebarTab, setLastSidebarTab] = useState<Id>()
  const promotedSidebarTab =
    selected !== undefined && sidebarOnly.has(selected)
      ? selected
      : lastSidebarTab !== undefined && sidebarOnly.has(lastSidebarTab)
        ? lastSidebarTab
        : undefined
  if (canShowSidebar && promotedSidebarTab !== lastSidebarTab) setLastSidebarTab(promotedSidebarTab)
  const barItems = items.filter(
    item => !sidebarOnly.has(item.id as Id) || (canShowSidebar && item.id === promotedSidebarTab),
  )
  const bottomChrome = useRef<HTMLDivElement>(null)
  const accessoryContact = useCallback(
    (element: HTMLDivElement | null) =>
      element ? installAccessoryContactOwnership(element) : undefined,
    [],
  )
  const searchTab = tabs.find(tab => tab.role === 'search')
  const hasTrailingAction = trailingAction != null && trailingAction !== false
  if (hasTrailingAction && searchTab) {
    throw new Error('TabView accepts either trailingAction or a Tab with role="search", not both.')
  }
  function select(id: string) {
    const target = tabs.find(tab => tab.id === id && !tab.disabled)
    if (!target) return
    if (id === selected && requested === selected) {
      actions.current.get(id)?.()
      return
    }
    prepareKeyboardForNavigation()
    if (selection === undefined) setInternal(target.id)
    onSelectionChange?.(target.id)
  }
  const sidebarRow = (item: TabBarItem) => (
    <Pressable
      key={item.id}
      role="tab"
      id={`${item.tabId}-sidebar`}
      aria-controls={item.panelId}
      aria-label={item.accessibilityLabel}
      aria-selected={item.id === selected}
      tabIndex={item.id === selected ? 0 : -1}
      disabled={item.disabled}
      onPress={() => {
        const button = document.getElementById(`${item.tabId}-sidebar`)
        if (button) focusFromFramework(button, { preventScroll: true })
        select(item.id)
        if (overlaySidebar) changeSidebar(false)
      }}
    >
      {item.role === 'search' ? (
        <SymbolImage name="magnifyingglass" />
      ) : item.symbol ? (
        <SymbolImage name={item.symbol} />
      ) : (
        item.icon
      )}
      <span>{item.label}</span>
      <TabBadge value={item.badge} />
    </Pressable>
  )
  return (
    <PadSearchPresentationContext value={searchPresentation}>
      <div
        ref={container}
        data-satin-tab-view="true"
        data-satin-tab-sidebar-expanded={showSidebar || undefined}
        data-satin-tab-sidebar-overlay={overlaySidebar || undefined}
        data-satin-tab-sidebar-collapsed-overlay={didCollapseOverlay || undefined}
        data-satin-tab-sidebar-expanded-from-tabs={
          (showSidebar && !overlaySidebar && expandedFromTabs) || undefined
        }
        style={
          didCollapseOverlay
            ? ({
                '--satin-tab-sidebar-return-inset': `${metrics.physicalInsets.top}px`,
              } as CSSProperties)
            : undefined
        }
      >
        {showSidebar && (
          <TabSidebarSurface overlay={overlaySidebar} onDismiss={() => changeSidebar(false)}>
            <div data-satin-tab-sidebar-toggle-host="true">
              <GlassButton
                data-satin-tab-sidebar-hide="true"
                iconOnly
                aria-label="Hide Tab Sidebar"
                onPress={() => changeSidebar(false)}
              >
                <SymbolImage
                  name="tab-sidebar-collapse"
                  glyph={tabSidebarCollapseGlyph}
                  width={25.3}
                  height={25.3}
                />
              </GlassButton>
            </div>
            <ScrollSurface
              id={`${scopeId}-sidebar-scroll`}
              primary={false}
              role="tablist"
              aria-orientation="vertical"
              onKeyDown={handleTabKeyDown}
            >
              {sidebarItems
                .filter(item => item.role === 'search' || !grouped.has(item.id as Id))
                .map(sidebarRow)}
              {sections.map(section => {
                const expanded = !collapsedSections.has(section.id)
                const groupId = `${scopeId}-section-${encodeURIComponent(section.id)}`
                return (
                  <div key={section.id} data-satin-tab-section="true">
                    <Pressable
                      aria-label={section.title}
                      aria-expanded={expanded}
                      aria-controls={groupId}
                      data-satin-tab-section-header="true"
                      onPress={() =>
                        setCollapsedSections(previous => {
                          const next = new Set(previous)
                          if (expanded) next.add(section.id)
                          else next.delete(section.id)
                          return next
                        })
                      }
                    >
                      <span>{section.title}</span>
                      <SymbolImage name={expanded ? 'chevron.down' : 'chevron.right'} />
                    </Pressable>
                    <div id={groupId} role="group" aria-label={section.title} hidden={!expanded}>
                      {sidebarItems
                        .filter(
                          item => item.role !== 'search' && section.tabs.includes(item.id as Id),
                        )
                        .map(sidebarRow)}
                    </div>
                  </div>
                )
              })}
            </ScrollSurface>
          </TabSidebarSurface>
        )}
        <SafeAreaInset
          inert={showSidebar && overlaySidebar}
          edge="bottom"
          spacing={0}
          content={
            <div
              ref={bottomChrome}
              data-satin-tab-bottom-chrome={readDeviceIdiom() === 'phone' ? 'phone' : 'pad'}
              data-satin-tab-has-action={hasTrailingAction || undefined}
              // Search's compact hit target uses the full dock, even when its resting bar hugs
              // two or three items. Only an actual accessory makes that resting bar full-width.
              style={
                hasTrailingAction ||
                ((bottomAccessory != null || searchTab) && readDeviceIdiom() === 'phone')
                  ? {
                      width: glassDockWidth(
                        metrics.layoutViewport.width,
                        metrics.screen,
                        metrics.insets,
                        metrics.layoutViewport.height,
                      ),
                      marginInline: 'auto',
                      transform: `translateX(${(metrics.insets.left - metrics.insets.right) / 2}px)`,
                    }
                  : undefined
              }
            >
              {bottomAccessory != null && (
                <div
                  ref={accessoryContact}
                  data-satin-tab-bottom-accessory="true"
                  // Native iPad: 24 pt edge margins, 48 pt minimum row. In portrait
                  // only this floating chrome clears the 280 pt modal sidebar;
                  // landscape's parent already owns the native sidebar column.
                  style={
                    readDeviceIdiom() === 'pad'
                      ? {
                          marginLeft: showSidebar && overlaySidebar ? 304 : 24,
                          marginRight: 24,
                          // The installed iPad can report a 25 pt system inset.
                          // Compensate it fully to retain the native 24 pt edge gap.
                          marginBottom: 24 - metrics.physicalInsets.bottom,
                          minHeight: 48,
                        }
                      : undefined
                  }
                >
                  <div data-satin-accessory-clip="true">
                    <div data-satin-accessory-content="true">
                      {bottomAccessoryMaterial === 'custom' ? (
                        bottomAccessory
                      ) : (
                        <GlassEffect style={{ width: '100%', height: '100%' }}>
                          {bottomAccessory}
                        </GlassEffect>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {selected !== undefined && (!showSidebar || overlaySidebar) && (
                <TabBarAccessoryContext value={bottomAccessory != null}>
                  <TabBar
                    inert={showSidebar && overlaySidebar}
                    aria-hidden={(showSidebar && overlaySidebar) || undefined}
                    style={showSidebar && overlaySidebar ? { visibility: 'hidden' } : undefined}
                    items={barItems}
                    selected={selected}
                    onSelect={select}
                    onShowSidebar={canShowSidebar ? () => changeSidebar(true) : undefined}
                    trailingAction={trailingAction}
                  />
                </TabBarAccessoryContext>
              )}
              {searchTab && (
                // The minimized tab bar draws this circle and its magnifier as its own trailing
                // member (glass/webgpu/minimize.ts), so the parting and the merge are one glass
                // field. This is only the circle's control, like the leading shortcut's.
                <TabTrailingSlot kind="compact-search">
                  <button
                    type="button"
                    aria-label={searchTab.accessibilityLabel ?? searchTab.label}
                    disabled={searchTab.disabled}
                    onClick={() => {
                      restoreCompactTabBar(bottomChrome.current)
                      // A selected Search shortcut reforms the bar without reselecting its stack.
                      if (selected !== searchTab.id) select(searchTab.id)
                    }}
                  />
                </TabTrailingSlot>
              )}
            </div>
          }
        >
          {tabs.map((tab, index) => (
            <RetainedTab
              panelId={items[index]!.panelId!}
              tabId={
                showSidebar
                  ? `${items[index]!.tabId}-sidebar`
                  : barItems.some(item => item.id === tab.id)
                    ? items[index]!.tabId
                    : undefined
              }
              label={tab.label}
              focusOnActivate={tab.id !== initialSelection}
              key={tab.id}
              id={tab.id}
              active={tab.id === requested}
              presented={tab.id === selected}
              register={register}
            >
              <PadSearchTabContext
                value={tab.role === 'search' && tab.id === selected ? tab.id : null}
              >
                {mounted.includes(tab.id) ? tab.children : null}
              </PadSearchTabContext>
            </RetainedTab>
          ))}
        </SafeAreaInset>
      </div>
    </PadSearchPresentationContext>
  )
}
