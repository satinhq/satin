import { strictGlassRequested } from './failurePolicy.ts'
import { TopTabLabel } from '../tabs/presentation.tsx'
import { readDeviceIdiom } from '../layout/deviceIdiom.ts'
import { ownPhysicalContact, retirePhysicalContact } from '../press/contactReceipt.ts'
import { SymbolImage, SymbolSelectionContext } from '../symbols/Symbol.tsx'
import { focusFromFramework } from '../focus/programmaticFocus.ts'
import type { TabBarItem, TabItemFrame } from './TabBar.tsx'
import { sidebarCssTokens } from '../settings/tokens.ts'
import { intrinsicTabGeometry } from './tabBarModel.ts'
import type { GlassRegionRegistry } from './regionRegistry.ts'
import { recordMotionEventCost } from '../motionProbe.ts'
import { glassFailureCode } from './webgpu/errorCode.ts'
import { reportGlassError } from './errors.ts'
import { ProductionGlassRuntime } from './webgpu/production.ts'
import type { FallbackGlassRuntime } from './fallback/runtime.ts'
import { fallbackGlassRequested } from './fallback/selection.ts'
import { isBitmapBackdrop, prepareGlassBitmapBackdrop } from './lens/bitmapBackdrop.ts'
import { readDarkAppearance, subscribeAppearance } from '../app/appearance.ts'
import { useSafeAreaMetrics } from '../safe-area/useSafeAreaMetrics.ts'
import { flushSync } from 'react-dom'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import type { LensMode } from './renderSpecs.ts'
import {
  GLASS_CIRCLE_INLINE_INSET_PX,
  GLASS_CIRCLE_SIZE_PX,
  GLASS_CIRCLE_TOP_PX,
  GLASS_DOCK_BOTTOM_GAP_PX,
  GLASS_DOCK_HEIGHT_PX,
  GLASS_DOCK_RADIUS_PX,
  ReferenceBackgroundScene,
  glassDockWidth,
  isCalibratedMaxLayout,
  SettingsDomScene,
  type ScreenId,
} from './lens/Scene.tsx'
import type { RuntimeGeometry, RuntimeSnapshot } from './renderSpecs.ts'
import type { Appearance } from './lens/theme.ts'
import {
  runScriptedDrag,
  runScriptedScroll,
  scriptedDragFrames,
  type MotionRun,
  type ScriptedMotionMode,
} from './lens/motion.ts'
import { trace } from './lens/trace.ts'
import { LIQUID_ENVELOPES, LIQUID_PILL_BAR, type LiquidMotionMode } from './lens/liquidMotion.ts'
import { tabGlyphStyle } from './lens/tabSelectionMaterial.ts'
import {
  formatMetric,
  isLensMode,
  LIQUID_PLAYBACK_SPEED,
  measurementClientId,
  persistFlag,
  persistLens,
  requestedAppearance,
  requestedLiquidMotion,
  storedFlag,
  storedLens,
  storedPage,
  useAppearance,
} from './glassProbeSettings.ts'
import { RimProofMarkers, TabIcon } from './GlassProbeIcons.tsx'
import { renderProbeOverlay } from './GlassProbeOverlay.tsx'

type DebugApi = Readonly<{
  regions: () => ReturnType<ProductionGlassRuntime['regionDiagnostics']>
  metrics: () => RuntimeSnapshot | undefined
  motion: () => MotionRun | undefined
  navigate: (screen: ScreenId) => void
  resetMetrics: () => void
  setBridge: (enabled: boolean) => void
  setGlass: (enabled: boolean) => void
  setLens: (mode: LensMode) => void
  setMarkers: (enabled: boolean) => void
  setPage: (page: ContentPage, offset?: number) => void
  setRim: (enabled: boolean) => void
  setScroll: (offset: number) => void
  setTabSelection: (index: number) => void
  setVelocityFade: (enabled: boolean) => void
  startLiquidMotion: (repeats?: number, speed?: number) => void
  startMotion: (mode: ScriptedMotionMode) => Promise<MotionRun>
}>

import { tabPresentation, tabProbeOverride, type ContentPage } from './lens/tabPresentation.ts'

function debugWindow() {
  return window as Window & { __SATIN_LENS_SPLIT__?: DebugApi }
}

export type PresentationGlassRuntime = ProductionGlassRuntime | FallbackGlassRuntime

function createPresentationRuntime(
  options: Parameters<typeof ProductionGlassRuntime.create>[0],
  backend?: 'fallback' | 'webgpu',
): Promise<PresentationGlassRuntime> {
  if (
    strictGlassRequested() ||
    backend === 'webgpu' ||
    (backend === undefined && !fallbackGlassRequested())
  )
    return ProductionGlassRuntime.create(options)
  // Keep fallback's outline sampler out of the default app's eager module graph.
  return import('./fallback/runtime.ts').then(({ FallbackGlassRuntime }) =>
    FallbackGlassRuntime.create(options),
  )
}

export type GlassPresentationConsumer = Readonly<{
  backend?: 'fallback' | 'webgpu'
  regions?: GlassRegionRegistry
  content: HTMLDivElement
  scroller: HTMLDivElement
  tabs?: Readonly<{
    insetHost?: HTMLElement
    intrinsicWidth?: boolean
    placement?: 'bottom' | 'top'
    itemFrames?: readonly TabItemFrame[]
    items: readonly TabBarItem[]
    selected: string
    onSelect: (id: string) => void
  }>
  onReady: (ready: boolean) => void
  /** `rebuilding`: a bounded source rebuild follows this error; otherwise nothing is in flight. */
  onError?: (error: unknown, rebuilding?: boolean) => void
  onSourceReady?: (source: HTMLDivElement) => void
}>
/** Shared semantic DOM and runtime ownership. Probe controls are testing-only. */
export function GlassPresentation({ consumer }: { consumer?: GlassPresentationConsumer }) {
  const probe = !consumer
  const consumerRef = useRef(consumer)
  consumerRef.current = consumer
  const safeArea = useSafeAreaMetrics()
  const insetHost = consumer?.tabs?.insetHost
  const [insetFrame, setInsetFrame] = useState<{
    x: number
    y: number
    width: number
    height: number
  }>()
  useLayoutEffect(() => {
    if (!insetHost) {
      setInsetFrame(undefined)
      return
    }
    const measure = () => {
      const rect = insetHost.getBoundingClientRect()
      const root = insetHost.closest('[data-satin-root]')?.getBoundingClientRect()
      const next = {
        x: rect.x - (root?.x ?? 0),
        y: rect.y - (root?.y ?? 0),
        width: rect.width,
        height: rect.height,
      }
      setInsetFrame(previous =>
        previous &&
        Object.keys(next).every(
          key => previous[key as keyof typeof next] === next[key as keyof typeof next],
        )
          ? previous
          : next,
      )
    }
    measure()
    // Padding animates on the bottom boundary. Its content box shrinks even when the slot and
    // accessory keep the same size. Commit the foreground geometry in that measuring frame.
    const observer = new ResizeObserver(() => flushSync(measure))
    observer.observe(insetHost)
    if (insetHost.parentElement) observer.observe(insetHost.parentElement)
    const boundary = insetHost.closest('[data-satin-bottom-boundary="root"]')
    if (boundary) observer.observe(boundary)
    return () => observer.disconnect()
  }, [insetHost, safeArea.layoutViewport.width, safeArea.layoutViewport.height])
  const safeAreaRef = useRef(safeArea)
  safeAreaRef.current = safeArea
  const systemAppearance = useAppearance()
  const [measurementAppearance, setMeasurementAppearance] = useState<Appearance>()
  const measurementAppearanceRef = useRef(measurementAppearance)
  measurementAppearanceRef.current = measurementAppearance
  const appearance = measurementAppearance ?? systemAppearance
  const appearanceRef = useRef(appearance)
  appearanceRef.current = appearance
  const liquidMotion = probe ? requestedLiquidMotion() : 'none'
  const [screen, setScreen] = useState<ScreenId>(() =>
    probe && storedFlag('screen', 'root') === 'general' ? 'general' : 'root',
  )
  const [contentPage, setContentPage] = useState<ContentPage>(() =>
    probe ? (liquidMotion === 'none' ? storedPage() : 'shapes') : 'settings',
  )
  const [backgroundOffset, setBackgroundOffset] = useState(() =>
    probe ? Number.parseFloat(storedFlag('offset', '0')) || 0 : 0,
  )
  const [query, setQuery] = useState('')
  const [bridgeEnabled, setBridgeEnabled] = useState(
    () => !probe || storedFlag('bridge', '1') !== '0',
  )
  const [glassEnabled, setGlassEnabled] = useState(() => !probe || storedFlag('glass', '1') !== '0')
  const [lensMode, setLensMode] = useState<LensMode>(() =>
    probe ? storedLens() : 'reference-regular',
  )
  const [markers, setMarkers] = useState(() => probe && storedFlag('markers', '0') === '1')
  const [velocityFadeEnabled, setVelocityFadeEnabled] = useState(
    () => storedFlag('velocity-fade', '1') !== '0',
  )
  const [rimEnabled, setRimEnabled] = useState(() => !probe || storedFlag('rim', '1') !== '0')
  const [telemetryEnabled, setTelemetryEnabled] = useState(
    () => storedFlag('telemetry', '1') !== '0',
  )
  const [controlsOpen, setControlsOpen] = useState(false)
  const [captureClean, setCaptureClean] = useState(false)
  const [probeSelectedTab, setSelectedTab] = useState(0)
  const selectedTab = consumer?.tabs
    ? Math.max(
        0,
        consumer.tabs.items.findIndex(item => item.id === consumer.tabs!.selected),
      )
    : probeSelectedTab
  const tabPointer = useRef<number | undefined>(undefined)
  const tabContactOwner = useRef({})
  const tabContactPointer = useRef<number | undefined>(undefined)
  const [tabBarProbe, setTabBarProbe] = useState<boolean | undefined>(() =>
    tabProbeOverride(window.location.search),
  )
  const [runtimeError, setRuntimeError] = useState<string>()
  const [runtimeReady, setRuntimeReady] = useState(false)

  const telemetryRef = useRef(telemetryEnabled)
  telemetryRef.current = telemetryEnabled
  const contentPageRef = useRef(contentPage)
  contentPageRef.current = contentPage
  const rimRef = useRef(rimEnabled)
  rimRef.current = rimEnabled
  const measurementClientRef = useRef<string | undefined>(undefined)
  if (!measurementClientRef.current) measurementClientRef.current = measurementClientId()
  const screenRef = useRef(screen)
  screenRef.current = screen
  const geometryRef = useRef<RuntimeGeometry | undefined>(undefined)
  const flagsRef = useRef('')
  const runtimeRef = useRef<PresentationGlassRuntime | undefined>(undefined)
  // The runtime reports its first present (runtimeReady) from inside create(), before the ref is
  // assigned. Effects that hand it state gate on this value, so they run again once it exists
  // Registrations can change after the runtime is created.
  const [boundRuntime, setBoundRuntime] = useState<PresentationGlassRuntime>()
  const snapshotRef = useRef<RuntimeSnapshot | undefined>(undefined)
  const telemetryAtRef = useRef(0)
  const motionAbortRef = useRef<AbortController | undefined>(undefined)
  const motionRunRef = useRef<MotionRun | undefined>(undefined)

  const scrollerRef = useRef<HTMLDivElement>(null)
  const contentHostRef = useRef<HTMLDivElement>(null)
  const syncMarkersRef = useRef<HTMLDivElement>(null)
  const bandFrameRef = useRef<HTMLDivElement>(null)
  const bandClipRef = useRef<HTMLDivElement>(null)
  const bandBaseRef = useRef<HTMLDivElement>(null)
  const bandTrackRef = useRef<HTMLDivElement>(null)
  const directCanvasRef = useRef<HTMLCanvasElement>(null)
  const rimClipRef = useRef<HTMLDivElement>(null)
  const rimCanvasRef = useRef<HTMLCanvasElement>(null)
  const dockFrameRef = useRef<HTMLDivElement>(null)
  const leftFrameRef = useRef<HTMLDivElement>(null)
  const rightFrameRef = useRef<HTMLDivElement>(null)

  const bridgeOutputRef = useRef<HTMLOutputElement>(null)
  const pacingOutputRef = useRef<HTMLOutputElement>(null)
  const gpuOutputRef = useRef<HTMLOutputElement>(null)
  const passesOutputRef = useRef<HTMLOutputElement>(null)
  const domOutputRef = useRef<HTMLOutputElement>(null)
  const syncOutputRef = useRef<HTMLOutputElement>(null)
  const debugOutputRef = useRef<HTMLOutputElement>(null)
  const clockOutputRef = useRef<HTMLOutputElement>(null)

  const startMotion = (mode: ScriptedMotionMode) => {
    motionAbortRef.current?.abort()
    const controller = new AbortController()
    motionAbortRef.current = controller
    const run =
      mode === 'drag-scripted'
        ? runScriptedDrag(
            progress => runtimeRef.current?.setDragProgress(progress),
            controller.signal,
          )
        : runScriptedScroll(
            mode,
            offset => runtimeRef.current?.setScroll(offset),
            controller.signal,
          )
    void run.then(result => {
      motionRunRef.current = result
    })
    return run
  }

  const width = safeArea.layoutViewport.width
  const height = safeArea.layoutViewport.height
  const bottomInset = safeArea.insets.bottom
  // Legacy lens coordinates are physical; subtract only the excluded viewport strip.
  const physicalTopInset = Math.max(0, safeArea.physicalInsets.top - safeArea.insets.top)
  const isDragPage = contentPage === 'drag'
  const dragFrames = scriptedDragFrames(0, physicalTopInset)
  const calibratedMax = isCalibratedMaxLayout(width, safeArea.screen)
  const dockWidth =
    insetFrame?.width ||
    (isDragPage
      ? dragFrames.capsule.width
      : glassDockWidth(width, safeArea.screen, safeArea.insets, height))
  const tabCount = consumer?.tabs?.items.length ?? 4
  // The regular-width iPad bar: label-sized items in a 44 pt bar at the top of the scene.
  const topFrames =
    consumer?.tabs?.placement === 'top' && consumer.tabs.itemFrames?.length === tabCount
      ? consumer.tabs.itemFrames
      : undefined
  const tabBarPlacement = consumer?.tabs?.placement
  const compactTabs = readDeviceIdiom() === 'phone' && width > height
  const intrinsicTabs = Boolean(consumer?.tabs?.intrinsicWidth) && !compactTabs
  const intrinsicGeometry = useMemo(
    () => (intrinsicTabs ? intrinsicTabGeometry(dockWidth, tabCount) : undefined),
    [intrinsicTabs, dockWidth, tabCount],
  )
  const compactItemWidth = (dockWidth - 8 - 4 * (tabCount - 1)) / tabCount
  const hasConsumerTabs = Boolean(consumer?.tabs)
  const tabBarCentres = useMemo(
    () =>
      topFrames
        ? topFrames.map(frame => frame.x + frame.width / 2)
        : intrinsicGeometry
          ? intrinsicGeometry.centres
          : calibratedMax || hasConsumerTabs
            ? Array.from({ length: tabCount }, (_, index) =>
                compactTabs
                  ? 4 + compactItemWidth / 2 + (compactItemWidth + 4) * index
                  : 10.5 + ((dockWidth - 20) / tabCount) * (index + 0.5),
              )
            : undefined,
    [
      calibratedMax,
      hasConsumerTabs,
      dockWidth,
      tabCount,
      compactTabs,
      compactItemWidth,
      intrinsicGeometry,
      topFrames,
    ],
  )
  const tabBarPillWidths = useMemo(() => topFrames?.map(frame => frame.width), [topFrames])
  // Pinned 11f Pro Max geometry; other tab counts still need a native gate.
  const tabBarPillWidth = topFrames
    ? topFrames[0].width
    : intrinsicGeometry
      ? intrinsicGeometry.selectionWidth
      : compactTabs
        ? compactItemWidth
        : calibratedMax
          ? (dockWidth - 20) / tabCount + 13
          : undefined
  const tabBarPillHeight = compactTabs || topFrames ? 36 : calibratedMax ? 54 : undefined
  const tabBarPillCenterY = compactTabs
    ? 22
    : topFrames
      ? (insetFrame?.height ?? 44) / 2
      : undefined
  const fallbackDockHeight = compactTabs ? 44 : GLASS_DOCK_HEIGHT_PX
  const dockHeight =
    insetFrame?.height || (isDragPage ? dragFrames.capsule.height : fallbackDockHeight)
  const dockX = insetFrame?.x ?? (isDragPage ? dragFrames.capsule.x : (width - dockWidth) / 2)
  // Native collapses intrinsic platters at the full phone dock's leading edge.
  // The platter's own origin changes with its labels; the compact button's does not.
  const tabBarMinimizedOffsetX = intrinsicTabs
    ? (width - glassDockWidth(width, safeArea.screen, safeArea.insets, height)) / 2 + 7 - dockX
    : 7
  // The measured TabView material occupies the bottom safe-area band; its
  // glyphs remain above the Home indicator inside that material.
  const dockY =
    insetFrame?.y ??
    (isDragPage ? dragFrames.capsule.y : height - GLASS_DOCK_BOTTOM_GAP_PX - fallbackDockHeight)
  const dockRadius = isDragPage
    ? dragFrames.capsule.height / 2
    : topFrames
      ? dockHeight / 2
      : compactTabs
        ? 22
        : GLASS_DOCK_RADIUS_PX
  const circleSize = isDragPage ? dragFrames.circle.width : GLASS_CIRCLE_SIZE_PX
  const leftX = isDragPage ? dragFrames.circle.x : GLASS_CIRCLE_INLINE_INSET_PX
  const rightX = width - GLASS_CIRCLE_INLINE_INSET_PX - GLASS_CIRCLE_SIZE_PX
  const effectiveScreen: ScreenId = contentPage === 'settings' ? screen : 'general'
  const circleY = isDragPage
    ? dragFrames.circle.y
    : contentPage === 'settings'
      ? GLASS_CIRCLE_TOP_PX
      : 58
  const tabPolicy = tabPresentation(contentPage, liquidMotion, tabBarProbe)
  const tabBarVisible = probe
    ? tabPolicy.visible
    : Boolean(consumer?.tabs) && (!insetHost || Boolean(insetFrame?.height))
  const tabPresentationRef = useRef(tabPolicy)
  tabPresentationRef.current = tabPolicy
  const geometry: RuntimeGeometry = {
    bottomInset,
    circleSize,
    circleY,
    dockHeight,
    dockRadius,
    dockWidth,
    dockX,
    dockY,
    height,
    leftX,
    physicalTopInset,
    rightX,
    surfaceMode: isDragPage ? 'drag' : 'chrome',
    tabBarBackground: contentPage,
    tabBarCentres,
    tabBarMinimizedOffsetX,
    tabBarPillWidth,
    tabBarPillWidths,
    tabBarPlacement,
    tabBarPillHeight,
    tabBarPillCenterY,
    tabBarSelectedIndex: tabBarVisible ? selectedTab : undefined,
    width,
  }
  geometryRef.current = geometry

  useEffect(() => {
    if (!probe) return
    document.documentElement.dataset.appearance = appearance
    document.documentElement.style.setProperty(
      '--measured-reference-safe-bottom',
      `${bottomInset}px`,
    )
    document.documentElement.style.setProperty('--measured-reference-layout-height', `${height}px`)
  }, [appearance, bottomInset, height])

  useEffect(() => {
    if (!probe) return
    const started = performance.now()
    const id = window.setInterval(() => {
      if (clockOutputRef.current)
        clockOutputRef.current.value = `${((performance.now() - started) / 1000).toFixed(1)}s`
    }, 250)
    return () => window.clearInterval(id)
  }, [])

  // Probe telemetry and measurement commands. The WebGPU runtime never calls onSnapshot, so none
  // of this runs today; it is research code kept for a later removal round.
  const onSnapshot = useCallback((snapshot: RuntimeSnapshot) => {
    // Keep the full trace in JS. Clipped JSON text still costs WebKit layout
    // during menu geometry updates, even when no glyph is visible.
    snapshotRef.current = snapshot
    if (!probe) return
    const build =
      (document.querySelector('script[type="module"][src]') as HTMLScriptElement | null)?.src.match(
        /index-([^.]+)/,
      )?.[1] ?? '?'
    const scenario = snapshot.glassEnabled
      ? snapshot.bridge.enabled
        ? snapshot.scenarios['scroll-bridge-on']
        : snapshot.scenarios['scroll-bridge-off']
      : snapshot.scenarios['scroll-glass-off']
    if (bridgeOutputRef.current)
      bridgeOutputRef.current.value = `${snapshot.bridge.mode.replaceAll('-', ' ')} · ${snapshot.bridge.animationStates.join('/') || 'off'}`
    if (pacingOutputRef.current)
      pacingOutputRef.current.value = `${formatMetric(scenario.fps)} fps · ${formatMetric(scenario.glassJsP95Ms)} ms JS`
    if (gpuOutputRef.current)
      gpuOutputRef.current.value = `U ${formatMetric(scenario.textureUploadsPerGlassFrame, 2)} · D ${formatMetric(scenario.drawCallsPerGlassFrame, 1)}`
    if (passesOutputRef.current)
      passesOutputRef.current.value = `RT ${formatMetric(scenario.renderTexturePassesPerGlassFrame, 1)} · F ${formatMetric(scenario.finalCompositePassesPerGlassFrame, 1)} · FX ${snapshot.presentation.filterPassesPerVisibleSurface}`
    if (domOutputRef.current)
      domOutputRef.current.value = `${snapshot.dom.nodeCount} nodes · ${Math.round(snapshot.presentation.mirrorMemoryBytes / 1024 / 1024)} MB`
    if (syncOutputRef.current)
      syncOutputRef.current.value = `raf Δ ${formatMetric(scenario.maxRafScrollDeltaPx)} px`
    if (debugOutputRef.current) {
      debugOutputRef.current.value = `build ${build} | ${flagsRef.current} | ${snapshot.debug}`
    }
    const now = performance.now()
    if (!telemetryRef.current || now - telemetryAtRef.current < 1000) return
    telemetryAtRef.current = now
    const snapshotGeometry = geometryRef.current
    const tabBarGeometry =
      snapshotGeometry?.tabBarSelectedIndex === undefined
        ? null
        : {
            x: snapshotGeometry.dockX,
            y: snapshotGeometry.dockY,
            width: snapshotGeometry.dockWidth,
            height: snapshotGeometry.dockHeight,
            bottomGap:
              snapshotGeometry.height - snapshotGeometry.dockY - snapshotGeometry.dockHeight,
          }
    void fetch('/__satinGeometry_metrics', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...snapshot,
        _measurementBuild: build,
        _measurementClient: measurementClientRef.current,
        buildId: build,
        captureState: {
          safeArea: safeAreaRef.current,
          geometry: geometryRef.current,
          tabBarGeometry,
          page: contentPageRef.current,
          rim: rimRef.current,
          tabPresentation: tabPresentationRef.current,
        },
      }),
      // Periodic snapshots can exceed the 64 KiB keepalive quota after GPU
      // diagnostics are attached. This is a live request, not an unload beacon.
      keepalive: false,
    })
      .then(response => response.json())
      .then(
        (
          command: {
            appearance?: Appearance
            bridge?: boolean
            glass?: boolean
            lens?: string
            markers?: boolean
            captureClean?: boolean
            captureTrace?: boolean
            captureBuffers?: boolean
            benchmarkMaterials?: boolean
            captureTabTrace?: boolean
            reload?: boolean
            reset?: boolean
            screen?: ScreenId
            page?: ContentPage
            rim?: boolean
            offset?: number
            scroll?: number
            velocityFade?: boolean
            motion?: ScriptedMotionMode
            liquid?: { repeats?: number; speed?: number }
            liquidMode?: LiquidMotionMode
            tabbarProbe?: boolean
            tabbarSelect?: number
          } | null,
        ) => {
          const runtime = runtimeRef.current
          if (!runtime || !command) return
          if (command.captureClean !== undefined) setCaptureClean(command.captureClean)
          if (command.captureTrace) {
            void fetch('/__satinBackdrop_diagnostics', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                build,
                client: measurementClientRef.current,
                trace: runtime.exportFrameTrace(false),
              }),
            })
          }
          if (command.captureTabTrace) {
            void fetch('/__satinBackdrop_diagnostics', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                build,
                client: measurementClientRef.current,
                ...runtime.exportFrameTrace(false),
              }),
            })
          }
          if (command.benchmarkMaterials) {
            void fetch('/__satinBackdrop_diagnostics', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                build,
                client: measurementClientRef.current,
                ...runtime.benchmarkRestingMaterials(),
              }),
            })
          }
          if (command.captureBuffers) {
            let diagnostics: unknown
            try {
              diagnostics = runtime.exportDiagnosticBuffers()
            } catch (error) {
              diagnostics = {
                error: String(error),
                stack: error instanceof Error ? error.stack : undefined,
              }
            }
            void fetch('/__satinBackdrop_diagnostics', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                build,
                client: measurementClientRef.current,
                captureState: { page: contentPageRef.current, safeArea: safeAreaRef.current },
                diagnostics,
              }),
            })
          }

          if (command.reload) {
            window.location.reload()
            return
          }
          if (command.reset) runtime.resetMetrics()
          if (command.appearance) {
            setMeasurementAppearance(command.appearance)
            runtime.setAppearance(command.appearance)
          }
          if (command.bridge !== undefined) {
            setBridgeEnabled(command.bridge)
            runtime.setBridgeEnabled(command.bridge)
          }
          if (command.glass !== undefined) {
            setGlassEnabled(command.glass)
            runtime.setGlassEnabled(command.glass)
          }
          if (command.lens !== undefined) {
            const mode = isLensMode(command.lens) ? command.lens : 'reference-regular'
            setLensMode(mode)
            persistLens(mode)
            runtime.setLensMode(mode)
          }
          if (command.markers !== undefined) {
            setMarkers(command.markers)
            runtime.setMarkers(command.markers)
          }
          if (command.rim !== undefined) {
            setRimEnabled(command.rim)
            persistFlag('rim', command.rim ? '1' : '0')
          }
          if (command.velocityFade !== undefined) {
            setVelocityFadeEnabled(command.velocityFade)
            persistFlag('velocity-fade', command.velocityFade ? '1' : '0')
            runtime.setVelocityFadeEnabled(command.velocityFade)
          }
          if (command.screen) navigate(command.screen)
          if (command.page) selectPage(command.page, command.offset)
          if (command.scroll !== undefined) runtime.setScroll(command.scroll)
          if (command.motion) void startMotion(command.motion)
          if (command.liquid)
            runtime.startLiquidMotion(command.liquid.repeats, command.liquid.speed)
          if (command.tabbarProbe !== undefined) setTabBarProbe(command.tabbarProbe)
          if (command.tabbarSelect !== undefined) {
            const index = Math.max(0, Math.min(3, Math.round(command.tabbarSelect)))
            setSelectedTab(index)
            runtime.setTabSelection(index)
          }
          if (command.liquidMode && command.liquidMode !== liquidMotion) {
            persistFlag('motion', command.liquidMode)
            window.location.reload()
          }
        },
      )
      .catch(() => {
        // The final Vite preview intentionally has no measurement endpoint.
      })
  }, [])

  useEffect(() => {
    const elements = {
      band: {
        base: bandBaseRef.current,
        canvas: directCanvasRef.current,
        clip: bandClipRef.current,
        frame: bandFrameRef.current,
        rimCanvas: rimCanvasRef.current,
        rimClip: rimClipRef.current,
        track: bandTrackRef.current,
      },
      chrome: {
        dock: dockFrameRef.current,
        left: leftFrameRef.current,
        right: rightFrameRef.current,
      },
      contentHost: consumer?.content ?? contentHostRef.current,
      scroller: consumer?.scroller ?? scrollerRef.current,
      syncMarkers: syncMarkersRef.current,
    }
    if (
      !elements.contentHost ||
      !elements.scroller ||
      !elements.syncMarkers ||
      !elements.band.base ||
      !elements.band.canvas ||
      !elements.band.clip ||
      !elements.band.frame ||
      !elements.band.rimCanvas ||
      !elements.band.rimClip ||
      !elements.band.track ||
      !elements.chrome.dock ||
      !elements.chrome.left ||
      !elements.chrome.right
    )
      return
    let cancelled = false
    setRuntimeError(undefined)
    trace('effect:create-once')
    // This call's options identify it as the shared runtime's owner: a cancelled call (StrictMode's
    // setup → cleanup → setup while initialization is pending) must not release it after a later call rebound it.
    let runtimeOptions: Parameters<typeof ProductionGlassRuntime.create>[0] | undefined
    void createPresentationRuntime(
      (runtimeOptions = {
        appearance,
        regions: consumer?.regions,
        consumerMode: Boolean(consumer),
        subscribeAppearance,
        currentAppearance: () =>
          (consumerRef.current
            ? undefined
            : (measurementAppearanceRef.current ?? requestedAppearance())) ??
          (readDarkAppearance() ? 'dark' : 'light'),
        bridgeEnabled,
        elements: elements as never,
        geometry,
        glassEnabled,
        lensMode,
        liquidMotion,
        menuEnabled: false,
        markers,
        onSnapshot,
        onPresented: ready => {
          if (cancelled) return
          const commit = () => {
            setRuntimeReady(ready)
            consumerRef.current?.onReady(ready)
          }
          // True comes only from the renderer's completed rAF submission. Make
          // that one-time ownership handoff visible in this rendering update.
          // False can originate in a React layout effect and must not flush it.
          if (ready) flushSync(commit)
          else commit()
        },
        onPresentationError: (error, rebuilding) => {
          if (!cancelled) consumerRef.current?.onError?.(error, rebuilding)
        },
        onSourceReady: source => {
          if (!cancelled) consumerRef.current?.onSourceReady?.(source)
        },
        // Commit content on release, without resetting the moving pill.
        onTabActivated: index => {
          const started = performance.now()
          const tabs = consumerRef.current?.tabs
          if (tabs?.items[index] && !tabs.items[index].disabled) {
            const button = dockFrameRef.current?.querySelector<HTMLButtonElement>(
              `[data-tab-index="${index}"]`,
            )
            if (button) focusFromFramework(button, { preventScroll: true })
            flushSync(() => tabs.onSelect(tabs.items[index].id))
          }
          recordMotionEventCost('tab-activation', started, performance.now())
        },

        onTabSelected: index =>
          flushSync(() => {
            setSelectedTab(index)
          }),
        screen: effectiveScreen,
        velocityFadeEnabled,
      }),
      consumer?.backend,
    )
      .then(runtime => {
        if (cancelled) {
          if (consumerRef.current) runtime.dispose(runtimeOptions)
          else runtime.detach(runtimeOptions)
          return
        }
        runtimeRef.current = runtime
        setBoundRuntime(runtime)
        runtime.commitAppearance(appearanceRef.current)
        if (geometryRef.current) runtime.updateGeometry(geometryRef.current)
        debugWindow().__SATIN_LENS_SPLIT__ = {
          regions: () => runtimeRef.current?.regionDiagnostics(),
          metrics: () => snapshotRef.current,
          motion: () => motionRunRef.current,
          navigate,
          resetMetrics: () => runtime.resetMetrics(),
          setBridge: enabled => runtime.setBridgeEnabled(enabled),
          setGlass: enabled => runtime.setGlassEnabled(enabled),
          setLens: mode => {
            setLensMode(mode)
            persistLens(mode)
            runtime.setLensMode(mode)
          },
          setMarkers: enabled => runtime.setMarkers(enabled),
          setPage: (page, offset) => selectPage(page, offset),
          setRim: enabled => {
            setRimEnabled(enabled)
            persistFlag('rim', enabled ? '1' : '0')
          },
          setScroll: offset => runtime.setScroll(offset),
          setTabSelection: index => {
            const selected = Math.max(0, Math.min(3, Math.round(index)))
            setSelectedTab(selected)
            runtime.setTabSelection(selected)
          },
          setVelocityFade: enabled => runtime.setVelocityFadeEnabled(enabled),
          startLiquidMotion: (repeats, speed) => runtime.startLiquidMotion(repeats, speed),
          startMotion,
        }
        performance.mark('satin-glass-runtime-created')
      })
      .catch((error: unknown) => {
        reportGlassError(
          glassFailureCode('production glass startup', error),
          error,
          'production glass startup',
        )
        if (!cancelled) {
          setRuntimeError(error instanceof Error ? error.message : String(error))
          consumerRef.current?.onError?.(error)
        }
      })
    return () => {
      cancelled = true
      consumerRef.current?.onReady(false)
      delete debugWindow().__SATIN_LENS_SPLIT__
      motionAbortRef.current?.abort()
      if (consumerRef.current) runtimeRef.current?.dispose(runtimeOptions)
      else runtimeRef.current?.detach(runtimeOptions)
      runtimeRef.current = undefined
      setBoundRuntime(undefined)
    }
    // Replace only the material owner on release demotion. Keep the semantic tab
    // DOM, selected state and renderer-neutral region registrations mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consumer?.backend])

  useEffect(() => {
    runtimeRef.current?.updateGeometry({
      tabBarCentres,
      tabBarPillWidth,
      tabBarPillWidths,
      tabBarPlacement,
      tabBarMinimizedOffsetX,
      tabBarPillHeight,
      tabBarPillCenterY,

      bottomInset,
      circleSize,
      circleY,
      dockHeight,
      dockRadius,
      dockWidth,
      dockX,
      dockY,
      height,
      leftX,
      physicalTopInset,
      rightX,
      surfaceMode: isDragPage ? 'drag' : 'chrome',
      tabBarBackground: contentPage,
      width,
    })
  }, [
    tabBarCentres,
    tabBarPillWidths,
    tabBarPlacement,
    tabBarMinimizedOffsetX,
    tabBarPillWidth,
    tabBarPillHeight,
    tabBarPillCenterY,

    bottomInset,
    circleSize,
    circleY,
    contentPage,
    dockHeight,
    dockRadius,
    dockWidth,
    dockX,
    dockY,
    height,
    isDragPage,
    leftX,
    physicalTopInset,
    rightX,
    width,
  ])

  useEffect(
    () => runtimeRef.current?.setTabSelection(tabBarVisible ? selectedTab : undefined),
    [selectedTab, tabBarVisible],
  )

  useLayoutEffect(() => runtimeRef.current?.commitAppearance(appearance), [appearance])

  // Settings and reference backgrounds are different DOM roots. Hand the newly
  // committed root to the retained renderer before the next browser paint so
  // an already-scheduled layout read can never inspect the detached root.
  useLayoutEffect(() => {
    if (consumer?.content ?? contentHostRef.current)
      runtimeRef.current?.setContentHost((consumer?.content ?? contentHostRef.current)!)
  }, [contentPage])

  const buildStatusRef = useRef<HTMLOutputElement | null>(null)
  const buildHealthRef = useRef<Record<string, unknown>>({ status: 'checking' })
  const loadedBuild =
    (document.querySelector('script[type="module"][src]') as HTMLScriptElement | null)?.src.match(
      /index-([^.]+)/,
    )?.[1] ?? '?'

  useEffect(() => {
    if (!probe) return
    let disposed = false
    const check = async () => {
      try {
        const response = await fetch(`/__satin_build?check=${Date.now()}`, {
          cache: 'no-store',
          signal: AbortSignal.timeout(3000),
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const server = (await response.json()) as { build: string }
        if (disposed) return
        const status =
          server.build === loadedBuild ? 'server matches' : `UPDATE AVAILABLE ${server.build}`
        buildHealthRef.current = {
          loadedBuild,
          serverBuild: server.build,
          status,
          checkedAt: new Date().toISOString(),
        }
        if (buildStatusRef.current) buildStatusRef.current.value = `9c ${loadedBuild} · ${status}`
      } catch {
        if (disposed) return
        buildHealthRef.current = {
          loadedBuild,
          status: 'server unreachable; cached build possible',
          checkedAt: new Date().toISOString(),
        }
        if (buildStatusRef.current)
          buildStatusRef.current.value = `9c ${loadedBuild} · SERVER UNREACHABLE`
      }
    }
    void check()
    const interval = window.setInterval(() => {
      if (!document.hidden) void check()
    }, 15000)
    return () => {
      disposed = true
      window.clearInterval(interval)
    }
  }, [loadedBuild])

  const navigate = useCallback((next: ScreenId) => {
    screenRef.current = next
    setScreen(next)
    persistFlag('screen', next)
    runtimeRef.current?.setScreen(next)
  }, [])
  const openGeneral = useCallback(() => navigate('general'), [navigate])

  const backdropRequest = useRef(0)
  const selectPage = async (next: ContentPage, offset = backgroundOffset) => {
    const request = ++backdropRequest.current
    if (isBitmapBackdrop(next)) await prepareGlassBitmapBackdrop(next)
    if (request !== backdropRequest.current) return
    setContentPage(next)
    setBackgroundOffset(offset)
    persistFlag('page', next)
    persistFlag('offset', String(offset))
    if (scrollerRef.current) scrollerRef.current.scrollTop = 0
    runtimeRef.current?.setScreen(next === 'settings' ? screenRef.current : 'general')
  }

  const toggleBridge = () => {
    const next = !bridgeEnabled
    setBridgeEnabled(next)
    persistFlag('bridge', next ? '1' : '0')
    runtimeRef.current?.setBridgeEnabled(next)
  }
  const toggleGlass = () => {
    const next = !glassEnabled
    setGlassEnabled(next)
    persistFlag('glass', next ? '1' : '0')
    runtimeRef.current?.setGlassEnabled(next)
  }
  const toggleLens = () => {
    const next: LensMode =
      lensMode === 'reference-regular' ? 'reference-clear' : 'reference-regular'
    setLensMode(next)
    persistLens(next)
    runtimeRef.current?.setLensMode(next)
  }
  const toggleMarkers = () => {
    const next = !markers
    setMarkers(next)
    persistFlag('markers', next ? '1' : '0')
    runtimeRef.current?.setMarkers(next)
  }
  const toggleTelemetry = () => {
    const next = !telemetryEnabled
    setTelemetryEnabled(next)
    persistFlag('telemetry', next ? '1' : '0')
  }
  const toggleRim = () => {
    const next = !rimEnabled
    setRimEnabled(next)
    persistFlag('rim', next ? '1' : '0')
  }
  const toggleVelocityFade = () => {
    const next = !velocityFadeEnabled
    setVelocityFadeEnabled(next)
    persistFlag('velocity-fade', next ? '1' : '0')
    runtimeRef.current?.setVelocityFadeEnabled(next)
  }
  flagsRef.current = `flags b${bridgeEnabled ? 1 : 0} g${glassEnabled ? 1 : 0} ${lensMode} ${contentPage}@${backgroundOffset} anchor-combined vf${velocityFadeEnabled ? 1 : 0} m${markers ? 1 : 0} t${telemetryEnabled ? 1 : 0} tab${tabBarVisible ? selectedTab : 'off'}`
  const tabNames = consumer?.tabs?.items.map(item => item.label) ?? [
    'Settings',
    'Search',
    'Saved',
    'Account',
  ]
  const liquidEnvelope =
    liquidMotion === 'none'
      ? undefined
      : {
          ...LIQUID_ENVELOPES[liquidMotion],
          frameY: LIQUID_ENVELOPES[liquidMotion].frameY - physicalTopInset,
        }
  useLayoutEffect(() => {
    if (!consumer || !runtimeReady || !boundRuntime) return
    boundRuntime.retargetContent(consumer.scroller, consumer.content)
  }, [consumer?.scroller, consumer?.content, runtimeReady, boundRuntime])

  return (
    <main
      data-satin-liquid={probe ? 'probe' : 'consumer'}
      style={consumer && !runtimeReady && !runtimeError ? { visibility: 'hidden' } : undefined}
      className="satin-lens-compositor-shell"
      data-appearance={appearance}
      data-lens={lensMode}
      data-motion={liquidMotion}
      data-page={contentPage}
      data-rim={rimEnabled ? '1' : '0'}
    >
      {probe ? (
        <div
          ref={scrollerRef}
          className="satin-lens-native-scroll-surface"
          data-measured-reference-native-scroller
        >
          {contentPage === 'settings' ? (
            <SettingsDomScene
              contentRef={contentHostRef}
              onOpenGeneral={openGeneral}
              onQuery={setQuery}
              query={query}
              screen={screen}
            />
          ) : (
            <ReferenceBackgroundScene
              contentRef={contentHostRef}
              height={height}
              mode={contentPage === 'drag' ? 'shapes' : contentPage}
              sourceOffsetY={physicalTopInset + backgroundOffset}
              width={width}
            />
          )}
          <div
            ref={syncMarkersRef}
            className="satin-lens-sync-marker-layer"
            aria-hidden="true"
            hidden={!markers}
          />
        </div>
      ) : (
        <div ref={syncMarkersRef} hidden />
      )}

      {liquidMotion === 'pill' ? (
        <div
          className="satin-lens-liquid-pill-backdrop"
          style={{
            height: LIQUID_PILL_BAR.height,
            left: LIQUID_PILL_BAR.x,
            top: LIQUID_PILL_BAR.y - physicalTopInset,
            width: LIQUID_PILL_BAR.width,
          }}
          aria-hidden="true"
        />
      ) : null}

      <div ref={bandFrameRef} className="satin-lens-glass-band-frame" hidden={!glassEnabled}>
        <div ref={rimClipRef} className="satin-lens-glass-layer-clip glass-layer-clip--rim">
          <canvas
            ref={rimCanvasRef}
            className="satin-lens-glass-direct-canvas"
            aria-hidden="true"
          />
        </div>
        <div
          ref={bandClipRef}
          className="satin-lens-glass-layer-clip satin-lens-glass-layer-clip--interior"
        >
          <div ref={bandBaseRef} className="satin-lens-glass-base">
            <div ref={bandTrackRef} className="satin-lens-glass-track">
              <canvas
                ref={directCanvasRef}
                className="satin-lens-glass-direct-canvas"
                aria-hidden="true"
              />
            </div>
          </div>
        </div>
      </div>

      <div
        ref={leftFrameRef}
        className="satin-lens-glass-chrome satin-lens-glass-chrome--circle glass-chrome--left"
        style={{ left: leftX, top: circleY, width: circleSize, height: circleSize }}
        hidden={
          !probe ||
          tabBarVisible ||
          liquidMotion !== 'none' ||
          effectiveScreen !== 'general' ||
          !glassEnabled
        }
      >
        {contentPage === 'settings' ? <RimProofMarkers /> : null}
        {contentPage === 'settings' ? (
          <button
            className="satin-lens-circle-control satin-lens-circle-control--back"
            type="button"
            onClick={() => navigate('root')}
            aria-label="Back to Settings"
          />
        ) : null}
      </div>

      <div
        ref={rightFrameRef}
        className="satin-lens-glass-chrome glass-chrome--right satin-lens-glass-chrome--circle"
        style={{
          left: rightX,
          top: circleY,
          width: GLASS_CIRCLE_SIZE_PX,
          height: GLASS_CIRCLE_SIZE_PX,
        }}
        hidden={!probe || tabBarVisible || liquidMotion !== 'none' || isDragPage || !glassEnabled}
      >
        {contentPage === 'settings' ? <RimProofMarkers /> : null}
        <button
          className="satin-lens-circle-control satin-lens-circle-control--tune"
          type="button"
          onClick={() => setControlsOpen(open => !open)}
          aria-label="Open Satin Glass controls"
          hidden={contentPage !== 'settings'}
        />
      </div>

      {/* The inset slot owns layout only. Foreground belongs beside the GPU canvas in this chrome
          layer; portaling it into the content slot puts its glyphs underneath the glass. */}
      <div
        ref={dockFrameRef}
        className={`satin-lens-glass-chrome satin-lens-glass-chrome--dock${liquidMotion === 'none' ? '' : ' satin-lens-glass-chrome--liquid'}`}
        style={
          liquidEnvelope
            ? {
                left: liquidEnvelope.frameX,
                top: liquidEnvelope.frameY,
                width: liquidEnvelope.frameWidth,
                height: liquidEnvelope.frameHeight,
              }
            : {
                borderRadius: dockRadius,
                left: dockX,
                top: dockY,
                width: dockWidth,
                height: dockHeight,
              }
        }
        data-satin-tab-layout={topFrames ? 'top' : compactTabs ? 'compact' : undefined}
        role={liquidMotion !== 'none' ? 'presentation' : tabBarVisible ? 'tablist' : undefined}
        aria-label={
          liquidMotion !== 'none'
            ? `Liquid ${liquidMotion} surface`
            : tabBarVisible
              ? probe
                ? 'Settings tabs'
                : 'App tabs'
              : undefined
        }
        hidden={!glassEnabled || (!probe && !tabBarVisible)}
      >
        {probe && liquidMotion === 'none' && contentPage === 'settings' ? (
          <RimProofMarkers />
        ) : null}
        {tabBarVisible ? <div className="satin-lens-tab-selection" /> : null}
        {tabBarVisible ? (
          <div className="satin-lens-tab-ink-clip">
            <div className="satin-lens-tab-ink-plane">
              <div
                className="satin-lens-tab-items"
                data-satin-custom-icons={consumer?.tabs ? true : undefined}
                style={
                  topFrames
                    ? {
                        ...sidebarCssTokens,
                        left: topFrames[0].x,
                        width: topFrames.reduce((sum, frame) => sum + frame.width, 0),
                        gridTemplateColumns: topFrames.map(frame => `${frame.width}px`).join(' '),
                      }
                    : calibratedMax || consumer?.tabs
                      ? {
                          left: intrinsicTabs ? 8 : compactTabs ? 4 : undefined,
                          width: dockWidth - (intrinsicTabs ? 16 : compactTabs ? 8 : 20),
                          gap: compactTabs ? 4 : undefined,
                          gridTemplateColumns: `repeat(${tabCount}, minmax(0, 1fr))`,
                        }
                      : undefined
                }
                onPointerDown={event => {
                  if (!event.isPrimary || event.button !== 0 || tabPointer.current !== undefined)
                    return
                  if (runtimeRef.current?.restoreMinimizingTabBar()) {
                    tabContactPointer.current = event.pointerId
                    ownPhysicalContact(document, tabContactOwner.current, Infinity, {
                      pointerId: event.pointerId,
                    })
                    return
                  }
                  const button = (event.target as Element).closest<HTMLButtonElement>(
                    '[role="tab"]',
                  )
                  if (!button || button.disabled) return
                  const index = Number(button.dataset.tabIndex)
                  const x = event.clientX - dockFrameRef.current!.getBoundingClientRect().left
                  if (!runtimeRef.current?.tabPointerDown(x, index)) return
                  tabPointer.current = event.pointerId
                  tabContactPointer.current = event.pointerId
                  ownPhysicalContact(document, tabContactOwner.current, Infinity, {
                    pointerId: event.pointerId,
                  })
                  event.currentTarget.setPointerCapture(event.pointerId)
                }}
                onPointerMove={event => {
                  if (tabPointer.current !== event.pointerId) return
                  runtimeRef.current?.tabPointerMove(
                    event.clientX - dockFrameRef.current!.getBoundingClientRect().left,
                  )
                }}
                onPointerUp={event => {
                  if (tabContactPointer.current === event.pointerId) {
                    ownPhysicalContact(document, tabContactOwner.current, 750, {
                      pointerId: event.pointerId,
                    })
                    tabContactPointer.current = undefined
                  }
                  if (tabPointer.current !== event.pointerId) return
                  runtimeRef.current?.tabPointerMove(
                    event.clientX - dockFrameRef.current!.getBoundingClientRect().left,
                  )
                  runtimeRef.current?.tabPointerUp()
                  tabPointer.current = undefined
                  event.currentTarget.releasePointerCapture(event.pointerId)
                }}
                onPointerCancel={event => {
                  if (tabContactPointer.current === event.pointerId) {
                    retirePhysicalContact(document, tabContactOwner.current)
                    tabContactPointer.current = undefined
                  }
                  if (tabPointer.current !== event.pointerId) return
                  runtimeRef.current?.tabPointerUp(true)
                  tabPointer.current = undefined
                }}
                onLostPointerCapture={event => {
                  if (tabPointer.current !== event.pointerId) return
                  if (tabContactPointer.current === event.pointerId) {
                    retirePhysicalContact(document, tabContactOwner.current)
                    tabContactPointer.current = undefined
                  }
                  runtimeRef.current?.tabPointerUp(true)
                  tabPointer.current = undefined
                }}
                onKeyDown={event => {
                  const button = (event.target as Element).closest<HTMLButtonElement>(
                    '[role="tab"]',
                  )
                  if (!button || button.disabled) return
                  const current = Number(button.dataset.tabIndex)
                  const next =
                    event.key === 'ArrowRight'
                      ? (current + 1) % tabNames.length
                      : event.key === 'ArrowLeft'
                        ? (current + tabNames.length - 1) % tabNames.length
                        : event.key === 'Home'
                          ? 0
                          : event.key === 'End'
                            ? tabNames.length - 1
                            : undefined
                  if (next === undefined) return
                  event.preventDefault()
                  event.currentTarget
                    .querySelector<HTMLButtonElement>(`[data-tab-index="${next}"]`)
                    ?.focus()
                  runtimeRef.current?.selectTabAnimated(next)
                }}
              >
                {tabNames.map((label, index) => (
                  <button
                    key={index}
                    className={
                      index === selectedTab
                        ? 'satin-lens-tab-item satin-lens-is-selected'
                        : 'satin-lens-tab-item'
                    }
                    style={tabGlyphStyle(appearance, contentPage, index) as CSSProperties}
                    type="button"
                    role="tab"
                    data-tab-index={index}
                    data-satin-tab-role={consumer?.tabs?.items[index]?.role}
                    id={consumer?.tabs?.items[index]?.tabId}
                    aria-controls={consumer?.tabs?.items[index]?.panelId}
                    disabled={consumer?.tabs?.items[index]?.disabled}
                    aria-label={
                      consumer?.tabs?.items[index]?.accessibilityLabel ??
                      (tabBarPlacement === 'top' && consumer?.tabs?.items[index]?.role === 'search'
                        ? typeof label === 'string'
                          ? label
                          : 'Search'
                        : undefined)
                    }
                    aria-selected={index === selectedTab}
                    tabIndex={index === selectedTab ? 0 : -1}
                    onClick={event => {
                      focusFromFramework(event.currentTarget, { preventScroll: true })
                      if (runtimeRef.current) {
                        runtimeRef.current.selectTabAnimated(index)
                        return
                      }
                      // No glass renderer (it failed loudly): the tab is still a working control.
                      const item = consumerRef.current?.tabs?.items[index]
                      if (runtimeError && item && !item.disabled)
                        consumerRef.current!.tabs!.onSelect(item.id)
                    }}
                  >
                    {probe ? (
                      <TabIcon index={index} />
                    ) : (
                      <i className="satin-lens-tab-icon" aria-hidden="true">
                        <SymbolSelectionContext value={index === selectedTab}>
                          {consumer?.tabs?.items[index]?.symbol ? (
                            <SymbolImage
                              name={consumer.tabs.items[index].symbol!}
                              style={{ fontSize: compactTabs ? 20 : 23.4 }}
                            />
                          ) : (
                            consumer?.tabs?.items[index]?.icon
                          )}
                        </SymbolSelectionContext>
                      </i>
                    )}
                    <small>
                      {tabBarPlacement === 'top' && consumer?.tabs?.items[index] ? (
                        <TopTabLabel item={consumer.tabs.items[index]} />
                      ) : (
                        label
                      )}
                    </small>
                    {consumer?.tabs?.items[index]?.badge !== undefined && (
                      <span
                        data-satin-tab-badge={
                          consumer.tabs.items[index].badge === 'dot' ? 'dot' : 'number'
                        }
                      >
                        {consumer.tabs.items[index].badge === 'dot'
                          ? null
                          : consumer.tabs.items[index].badge}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
        {liquidMotion !== 'none' ? (
          <button
            className="satin-lens-liquid-press-control"
            type="button"
            onClick={() => runtimeRef.current?.startLiquidMotion(1, LIQUID_PLAYBACK_SPEED)}
            aria-label={`Replay glass ${liquidMotion}`}
          />
        ) : null}
      </div>

      {liquidMotion === 'pill' ? (
        <div
          className="satin-lens-liquid-pill-items"
          style={{
            height: LIQUID_PILL_BAR.height,
            left: LIQUID_PILL_BAR.x,
            top: LIQUID_PILL_BAR.y - physicalTopInset,
            width: LIQUID_PILL_BAR.width,
          }}
          aria-hidden="true"
        >
          {tabNames.map((_label, index) => (
            <i key={index} className={`satin-lens-tab-icon satin-lens-tab-icon--${index}`} />
          ))}
        </div>
      ) : null}

      {!glassEnabled && !captureClean ? (
        <button
          className="satin-lens-fallback-controls-button"
          type="button"
          onClick={() => setControlsOpen(true)}
        >
          Glass
        </button>
      ) : null}

      {probe
        ? renderProbeOverlay({
            captureClean,
            bridgeOutputRef,
            pacingOutputRef,
            gpuOutputRef,
            passesOutputRef,
            domOutputRef,
            syncOutputRef,
            clockOutputRef,
            debugOutputRef,
            buildStatusRef,

            runtimeRef,
            buildHealthRef,
            loadedBuild,
            tabBarVisible,
            controlsOpen,
            setControlsOpen,
            bridgeEnabled,
            glassEnabled,
            lensMode,
            rimEnabled,
            velocityFadeEnabled,
            markers,
            telemetryEnabled,
            toggleBridge,
            toggleGlass,
            toggleLens,
            toggleRim,
            toggleVelocityFade,
            toggleMarkers,
            toggleTelemetry,
            contentPage,
            tabPolicy,
            tabBarProbe,
            screen,
            navigate,
            selectPage,
            backgroundOffset,
            runtimeReady,
            runtimeError,
          })
        : null}
    </main>
  )
}
