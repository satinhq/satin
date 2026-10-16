import { fallbackGlassRequested } from './fallback/selection.ts'
import {
  glassFallbackRequired,
  reportGlassError,
  subscribeGlassFallback,
  watchGlassTransportRecovery,
} from './errors.ts'
import { GlassRegionRegistry } from './regionRegistry.ts'
import { observeTabSources } from '../tabs/sourceRevision.ts'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import type { RegisteredTabBar } from './liquidContext.ts'
import { GlassPresentation } from './GlassPresentation.tsx'
import { MaterialEffectContext } from './liquidContext.ts'
import { isSupportedTabCount } from './tabBarModel.ts'

/** One renderer per app. Registration is semantic; backdrop discovery is framework-owned. */
export function MaterialEffectRoot({
  children,
  scene,
  chrome,
  enabled,
  capabilitySettled,
  onLaunchReady,
}: PropsWithChildren<{
  scene: RefObject<HTMLDivElement | null>
  chrome: HTMLElement | null
  enabled: boolean
  capabilitySettled: boolean
  onLaunchReady?: (ready: boolean) => void
}>) {
  const automaticFallback = useSyncExternalStore(
    subscribeGlassFallback,
    glassFallbackRequired,
    () => false,
  )
  useEffect(() => {
    if (automaticFallback) return watchGlassTransportRecovery()
  }, [automaticFallback])
  const [requestedFallback] = useState(fallbackGlassRequested)
  const backend =
    requestedFallback || automaticFallback ? ('fallback' as const) : ('webgpu' as const)
  const [regions] = useState(() => new GlassRegionRegistry())
  const regionCount = useSyncExternalStore(
    regions.subscribe,
    () => regions.size,
    () => 0,
  )
  const [tabs, setTabs] = useState<{ id: string; value: RegisteredTabBar }>()
  const [scroller, setScroller] = useState<HTMLDivElement>()
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  // A reported source failure whose one bounded rebuild is still in flight.
  const [rebuilding, setRebuilding] = useState(false)
  const [prepared, setPrepared] = useState<{
    source: HTMLDivElement
    key?: string
    at: number
  }>()
  const [preparedSources, setPreparedSources] = useState<ReadonlyMap<string, number>>(
    () => new Map(),
  )
  const preparedScreenKey = prepared?.key
  const preparedAt = prepared?.at
  const onReady = useCallback((value: boolean) => {
    setReady(value)
    if (value) {
      setFailed(false)
      setRebuilding(false)
    }
  }, [])
  // The worker reports a classified error before notifying the presenter.
  const onError = useCallback((_error: unknown, rebuild?: boolean) => {
    setFailed(true)
    setRebuilding(Boolean(rebuild))
    setReady(false)
  }, [])
  const onSourceReady = useCallback((source: HTMLDivElement) => {
    source
      .closest('[data-satin-tab-panel]')
      ?.dispatchEvent(new CustomEvent('satin:tab-source-ready', { bubbles: true }))
    const key = source.closest<HTMLElement>('[data-satin-screen-key]')?.dataset.satinScreenKey
    const at = performance.now()
    // Recapturing a backdrop does not change navigation readiness. In particular, preparing
    // sheet planes during a hold/entrance must not wake every glass-context consumer. A new
    // source element or screen key still publishes its own readiness receipt.
    setPrepared(current =>
      current?.source === source && current.key === key ? current : { source, key, at },
    )
    if (key)
      setPreparedSources(current => (current.has(key) ? current : new Map(current).set(key, at)))
  }, [])
  const registerTabs = useCallback((id: string, value: RegisteredTabBar | undefined) => {
    setTabs(current => (value ? { id, value } : current?.id === id ? undefined : current))
  }, [])
  useEffect(() => {
    // The scene belongs to our parent host; its ref is assigned after child layout effects.
    const root = scene.current
    if (!root) return
    const refresh = () => {
      // The navigation owner prepares destination atlas pixels and region draws before
      // playing. Keep that admitted source throughout the track; rebinding this root in
      // mid-push would retire the incoming presenters and their current-source receipts.
      const activePanel = root.querySelector<HTMLDivElement>('[data-satin-tab-active="true"]')
      const activeRoot = activePanel ?? root
      if (activeRoot.querySelector('[data-satin-transition-active="true"]')) return
      const scope = activeRoot
      // A split layout shows two uncovered primary scrollers. The backdrop is the
      // content column (detail), which app glass sits over; the sidebar list is the
      // source only when no content column is showing. DOM order puts the sidebar first.
      const content = (element: Element) => !element.closest('[data-satin-pane="sidebar"]')
      const candidates = [
        ...scope.querySelectorAll<HTMLDivElement>('[data-satin-scroll][data-satin-primary="true"]'),
      ].filter(element => !element.closest('[data-satin-covered="true"]'))
      const screens = [
        ...scope.querySelectorAll<HTMLDivElement>(
          '[data-satin-screen-container][data-satin-covered="false"]',
        ),
      ]
      const next =
        candidates.find(content) ??
        screens.find(content) ??
        candidates[0] ??
        screens[0] ??
        activeRoot
      const keys = new Set(
        [...root.querySelectorAll<HTMLElement>('[data-satin-screen-key]')].map(
          element => element.dataset.satinScreenKey,
        ),
      )
      setPreparedSources(current =>
        [...current.keys()].every(key => keys.has(key))
          ? current
          : new Map([...current].filter(([key]) => keys.has(key))),
      )

      setScroller(current => {
        if (current === next) return current
        return next
      })
    }
    let frame = 0
    const schedule = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        refresh()
      })
    }
    const stopRevisions = observeTabSources(root)
    root.addEventListener('satin:tab-activate', refresh)
    refresh()
    const observer = new MutationObserver(schedule)
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        'data-satin-tab-active',
        'data-satin-covered',
        'data-satin-transition-active',
      ],
    })
    return () => {
      observer.disconnect()
      stopRevisions()
      root.removeEventListener('satin:tab-activate', refresh)
      cancelAnimationFrame(frame)
    }
  }, [scene])
  // Unsupported legacy shapes are errors, never substituted materials.
  const supported = !tabs || isSupportedTabCount(tabs.value.items.length)
  useEffect(() => {
    if (!supported)
      reportGlassError(
        'unsupported-configuration',
        'The glass tab bar requires two to five tabs.',
        'registration',
      )
  }, [supported])
  const hasRegions = regionCount > 0
  // A WebGPU source failure keeps the owner mounted for its bounded rebuild.
  // Error visibility and launch readiness remain separate from ownership.
  const diagnosticGlassOff = import.meta.env.SATIN_DIAGNOSTIC_GLASS_OFF === true
  const active =
    !diagnosticGlassOff && enabled && supported && scroller && chrome && (tabs || hasRegions)
  // Navigation waits for glass sources only while they can still arrive: never after a
  // failure with no rebuild in flight (a failed startup, or a failed rebuild). The error
  // stays reported; navigation proceeds without glass sources.
  const preparingSources = Boolean(
    !diagnosticGlassOff &&
    (enabled || !capabilitySettled) &&
    supported &&
    (tabs || hasRegions) &&
    (!failed || rebuilding),
  )
  // Capability alone is not paint readiness. The renderer reports only after
  // it has submitted the retained source, material and rim to their presenters.
  const launchReady =
    capabilitySettled &&
    Boolean(chrome) &&
    !failed &&
    supported &&
    (diagnosticGlassOff || !(tabs || hasRegions) || (enabled && ready))
  useEffect(() => {
    onLaunchReady?.(launchReady)
  }, [launchReady, onLaunchReady])
  const value = useMemo(
    () => ({
      backend,
      regions,
      ready: enabled && supported && !failed && ready,
      preparingSources,
      preparedScreenKey,
      preparedAt,
      preparedSources,
      registerTabs,
    }),
    [
      backend,
      regions,
      enabled,
      supported,
      failed,
      ready,
      preparingSources,
      preparedScreenKey,
      preparedAt,
      preparedSources,
      registerTabs,
    ],
  )
  return (
    <MaterialEffectContext value={value}>
      {children}
      {active
        ? createPortal(
            <GlassPresentation
              consumer={{
                backend,
                regions,
                scroller,
                content: scroller,
                tabs: tabs?.value,
                onReady,
                onSourceReady,
                onError,
              }}
            />,
            chrome,
          )
        : null}
    </MaterialEffectContext>
  )
}
