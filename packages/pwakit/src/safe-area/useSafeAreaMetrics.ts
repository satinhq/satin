import { readDeviceIdiom } from '../layout/deviceIdiom.ts'
import { readKeyboardLayoutHeight } from '../keyboard/adapter.ts'
import { useCallback, useLayoutEffect, useRef, useSyncExternalStore } from 'react'

/** Insets in CSS pixels, by physical edge. */
export type EdgeInsets = {
  top: number
  right: number
  bottom: number
  left: number
}

/** The full safe-area and viewport geometry Satin works from, including the diagnostic
 * coordinate spaces installed-app fixtures compare. Apps want only `insets`. */
export type SafeAreaMetrics = {
  /** Insets to apply inside WebKit's layout viewport. */
  insets: EdgeInsets
  /** Comparison insets in physicalCoordinateSpace; never use these as layout padding. */
  physicalCoordinateSpace: 'calibrated-screen' | 'layout-viewport'
  physicalInsets: EdgeInsets
  /** Stable pre-focus layout during keyboard avoidance; visualViewport stays observed. */
  layoutViewport: { width: number; height: number }
  visualViewport: {
    width: number
    height: number
    offsetTop: number
    offsetLeft: number
    scale: number
  }
  screen: { width: number; height: number }
  safeFrame: { width: number; height: number }
  physicalSafeFrame: { width: number; height: number }
  coordinateSpacesReconcile: boolean
  standalone: boolean
}

type IOSNavigator = Navigator & { standalone?: boolean }

// Native Foundation 00, iOS 27.0, plus the recorded fitted standalone viewports.
// These pairs qualify physical-coordinate comparison, not inset restoration.
const CALIBRATED_PHONE_WINDOWS = [
  { screenWidth: 402, screenHeight: 874, width: 402, height: 812 },
  { screenWidth: 440, screenHeight: 956, width: 440, height: 894 },
] as const

let sensor: HTMLDivElement | undefined
let sensorOwners = 0

function createSensor() {
  const element = document.createElement('div')
  element.dataset.satinSafeAreaSensor = 'true'
  element.setAttribute('aria-hidden', 'true')
  element.style.cssText = [
    'position:fixed',
    'inset:0',
    'visibility:hidden',
    'pointer-events:none',
    'padding-top:env(safe-area-inset-top, 0px)',
    'padding-right:env(safe-area-inset-right, 0px)',
    'padding-bottom:env(safe-area-inset-bottom, 0px)',
    'padding-left:env(safe-area-inset-left, 0px)',
  ].join(';')
  // Diagnostic viewport rulers, read by the installed geometry fixture.
  for (const unit of ['lvh', 'dvh', 'svh']) {
    const ruler = document.createElement('div')
    ruler.dataset.satinViewportRuler = unit
    ruler.style.cssText = `position:absolute;left:0;top:0;width:1px;height:100${unit};pointer-events:none`
    element.append(ruler)
  }
  document.body.append(element)
  return element
}

function acquireSensor() {
  sensorOwners += 1
  if (!sensor?.isConnected) sensor = createSensor()
  return sensor
}

function releaseSensor() {
  sensorOwners = Math.max(0, sensorOwners - 1)
  if (sensorOwners !== 0) return
  sensor?.remove()
  sensor = undefined
}

function pixels(value: string) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function readInsets(element: HTMLDivElement): EdgeInsets {
  const computed = getComputedStyle(element)
  return {
    top: pixels(computed.paddingTop),
    right: pixels(computed.paddingRight),
    bottom: pixels(computed.paddingBottom),
    left: pixels(computed.paddingLeft),
  }
}

type Size = { width: number; height: number }

// Native home-indicator boundaries, in points. Phone: Foundation 00, iPhone 17 Pro Max,
// iOS 27 portrait. Pad: a SwiftUI .safeAreaInset(edge: .bottom) composer on iPad Pro
// 12.9-inch, iPadOS 27, which keeps 25 pt in portrait and in landscape.
const PHONE_HOME_INDICATOR_INSET = 34
const PAD_HOME_INDICATOR_INSET = 25
// iPadOS 27 places this status band outside a fitted standalone viewport (both installed iPads).
const PAD_FITTED_STATUS_BAND = 32

/**
 * The home-indicator boundary a fitted standalone viewport leaves out of env(bottom).
 *
 * With viewport-fit auto/contain, the system takes the status band outside the viewport,
 * but content still reaches the screen bottom and every env() inset reads zero. Without
 * this boundary, bottom bars and composers sit in the home-indicator band: on iPad a
 * composer sat 25 pt lower than the same SwiftUI layout, its trailing edge in the corner
 * that carries the window-resize grabber. Device identity comes from the shared
 * resolver, never from screen dimensions.
 */
function fittedHomeIndicatorInset(
  insets: EdgeInsets,
  layoutViewport: Size,
  screen: Size,
  standalone: boolean,
): number | undefined {
  const fit = document.documentElement.dataset.satinViewportFit
  const fitted = fit === 'auto' || fit === 'contain'
  const reportsNoInsets =
    insets.top === 0 && insets.right === 0 && insets.bottom === 0 && insets.left === 0
  if (!standalone || !fitted || !reportsNoInsets) return undefined

  const idiom = readDeviceIdiom()
  if (idiom === 'phone') return fittedPhoneHomeIndicator(layoutViewport, screen)
  if (idiom === 'pad') return fittedPadHomeIndicator(layoutViewport, screen)
  return undefined
}

// A missing 44..62 pt portrait band identifies the measured Face ID status region; a
// home-button phone takes 20 pt, and a viewport excluding bottom 34 takes at least 78 pt.
// Landscape remains observed-only: no installed landscape geometry qualifies restoration
// of its native 21 pt boundary.
function fittedPhoneHomeIndicator(layoutViewport: Size, screen: Size) {
  const excludedStatusBand = screen.height - layoutViewport.height
  const restores =
    screen.height > screen.width &&
    layoutViewport.width === screen.width &&
    excludedStatusBand >= 44 &&
    excludedStatusBand <= 62
  return restores ? PHONE_HOME_INDICATOR_INSET : undefined
}

// The pad boundary is the same in both orientations. WebKit may keep reporting the
// portrait screen size in landscape, so the window is compared with the screen side
// that matches its own orientation. Split View, Slide Over and Stage Manager windows are
// narrower than the screen and stay observed-only, as does any other status band.
function fittedPadHomeIndicator(layoutViewport: Size, screen: Size) {
  const longSide = Math.max(screen.width, screen.height)
  const shortSide = Math.min(screen.width, screen.height)
  const landscape = layoutViewport.width > layoutViewport.height
  const screenWidth = landscape ? longSide : shortSide
  const screenHeight = landscape ? shortSide : longSide
  const fullScreenWindow = layoutViewport.width === screenWidth
  const excludedStatusBand = screenHeight - layoutViewport.height
  const restores = fullScreenWindow && excludedStatusBand === PAD_FITTED_STATUS_BAND
  return restores ? PAD_HOME_INDICATOR_INSET : undefined
}

function calculateSafeAreaMetrics(insets: EdgeInsets): SafeAreaMetrics {
  const viewport = window.visualViewport
  const layoutViewport = {
    width: window.innerWidth,
    height: readKeyboardLayoutHeight(window.innerWidth, window.innerHeight),
  }
  const screen = {
    width: window.screen.width,
    height: window.screen.height,
  }

  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((window.navigator as IOSNavigator).standalone)
  const homeIndicator = fittedHomeIndicatorInset(insets, layoutViewport, screen, standalone)
  if (homeIndicator !== undefined) insets = { ...insets, bottom: homeIndicator }
  const comparison = reconcileWindowGeometry(insets, layoutViewport, screen, standalone)
  const { physicalInsets, safeFrame, physicalSafeFrame, physicalCoordinateSpace } = comparison

  return {
    insets,
    physicalInsets,
    physicalCoordinateSpace,
    layoutViewport,
    visualViewport: {
      width: viewport?.width ?? window.innerWidth,
      height: viewport?.height ?? window.innerHeight,
      offsetTop: viewport?.offsetTop ?? 0,
      offsetLeft: viewport?.offsetLeft ?? 0,
      scale: viewport?.scale ?? 1,
    },
    screen,
    safeFrame,
    physicalSafeFrame,
    coordinateSpacesReconcile:
      Math.abs(safeFrame.width - physicalSafeFrame.width) < 1 &&
      Math.abs(safeFrame.height - physicalSafeFrame.height) < 1,
    standalone,
  }
}

function readSafeAreaMetricsFromSensor(element: HTMLDivElement) {
  return calculateSafeAreaMetrics(readInsets(element))
}

function readInitialSafeAreaMetrics() {
  return calculateSafeAreaMetrics({ top: 0, right: 0, bottom: 0, left: 0 })
}

export function readSafeAreaMetrics(): SafeAreaMetrics {
  if (sensor?.isConnected) return readSafeAreaMetricsFromSensor(sensor)

  const temporarySensor = createSensor()
  try {
    return readSafeAreaMetricsFromSensor(temporarySensor)
  } finally {
    temporarySensor.remove()
  }
}

export function edgeInsetsEqual(left: EdgeInsets, right: EdgeInsets) {
  return (
    left.top === right.top &&
    left.right === right.right &&
    left.bottom === right.bottom &&
    left.left === right.left
  )
}

export function safeAreaMetricsEqual(left: SafeAreaMetrics, right: SafeAreaMetrics) {
  return (
    edgeInsetsEqual(left.insets, right.insets) &&
    edgeInsetsEqual(left.physicalInsets, right.physicalInsets) &&
    left.layoutViewport.width === right.layoutViewport.width &&
    left.layoutViewport.height === right.layoutViewport.height &&
    left.visualViewport.width === right.visualViewport.width &&
    left.visualViewport.height === right.visualViewport.height &&
    left.visualViewport.offsetTop === right.visualViewport.offsetTop &&
    left.visualViewport.offsetLeft === right.visualViewport.offsetLeft &&
    left.visualViewport.scale === right.visualViewport.scale &&
    left.screen.width === right.screen.width &&
    left.screen.height === right.screen.height &&
    left.safeFrame.width === right.safeFrame.width &&
    left.safeFrame.height === right.safeFrame.height &&
    left.physicalSafeFrame.width === right.physicalSafeFrame.width &&
    left.physicalSafeFrame.height === right.physicalSafeFrame.height &&
    left.coordinateSpacesReconcile === right.coordinateSpacesReconcile &&
    left.physicalCoordinateSpace === right.physicalCoordinateSpace &&
    left.standalone === right.standalone
  )
}

// All consumers observe the same ruler. In a long list, menus can mount thousands
// of readers; they must not each install an observer, schedule a frame and force
// a style read for the same viewport event.
const metricsListeners = new Set<() => void>()
let observationOwners = 0
let sharedMetrics: SafeAreaMetrics | undefined
let stopMetricsObservation: (() => void) | undefined

/** Refresh once at an interaction boundary, before an inactive reader opens. */
export function refreshSafeAreaMetrics() {
  const next = readSafeAreaMetrics()
  if (sharedMetrics && safeAreaMetricsEqual(sharedMetrics, next)) return
  sharedMetrics = next
  for (const listener of metricsListeners) listener()
}

function startMetricsObservation() {
  const activeSensor = acquireSensor()
  const visualViewport = window.visualViewport
  let frame = 0
  const commitMetrics = () => {
    frame = 0
    const nextMetrics = readSafeAreaMetricsFromSensor(activeSensor)
    if (sharedMetrics && safeAreaMetricsEqual(sharedMetrics, nextMetrics)) return
    sharedMetrics = nextMetrics
    for (const listener of metricsListeners) listener()
  }
  const update = () => {
    if (frame) return
    frame = requestAnimationFrame(commitMetrics)
  }
  const observer = new ResizeObserver(update)
  observer.observe(activeSensor)
  for (const ruler of activeSensor.children) observer.observe(ruler)
  window.addEventListener('pageshow', update)
  document.addEventListener('visibilitychange', update)
  window.addEventListener('resize', update, { passive: true })
  window.addEventListener('orientationchange', update, { passive: true })
  visualViewport?.addEventListener('resize', update, { passive: true })
  visualViewport?.addEventListener('scroll', update, { passive: true })
  commitMetrics()
  return () => {
    cancelAnimationFrame(frame)
    observer.disconnect()
    window.removeEventListener('pageshow', update)
    document.removeEventListener('visibilitychange', update)
    window.removeEventListener('resize', update)
    window.removeEventListener('orientationchange', update)
    visualViewport?.removeEventListener('resize', update)
    visualViewport?.removeEventListener('scroll', update)
    releaseSensor()
    sharedMetrics = undefined
  }
}

function retainMetricsObservation() {
  observationOwners += 1
  if (!stopMetricsObservation) stopMetricsObservation = startMetricsObservation()
  return () => {
    observationOwners -= 1
    if (observationOwners !== 0) return
    stopMetricsObservation?.()
    stopMetricsObservation = undefined
  }
}

function subscribeMetrics(listener: () => void) {
  metricsListeners.add(listener)
  return () => {
    metricsListeners.delete(listener)
  }
}
const subscribeWithoutMetrics = () => () => {}
const identityMetrics = (metrics: SafeAreaMetrics) => metrics

/** Internal selector store: one sensor sample, stable snapshots for unchanged selections. */
export function useSafeAreaSelector<Selection>(
  select: (metrics: SafeAreaMetrics) => Selection,
  equal: (left: Selection, right: Selection) => boolean = Object.is,
  enabled = true,
): Selection {
  const cache = useRef<{
    metrics: SafeAreaMetrics
    select: typeof select
    value: Selection
  }>(undefined)
  const getSelection = useCallback(() => {
    const metrics = (sharedMetrics ??= readInitialSafeAreaMetrics())
    const previous = cache.current
    if (previous?.metrics === metrics && previous.select === select) return previous.value
    const selected = select(metrics)
    const value = previous && equal(previous.value, selected) ? previous.value : selected
    cache.current = { metrics, select, value }
    return value
  }, [select, equal])
  // Start the one observer before layout effects consume geometry. External-store
  // consistency checks then see the measured snapshot in this same commit.
  useLayoutEffect(() => (enabled ? retainMetricsObservation() : undefined), [enabled])
  return useSyncExternalStore(
    enabled ? subscribeMetrics : subscribeWithoutMetrics,
    getSelection,
    getSelection,
  )
}

function layoutMetricsEqual(left: SafeAreaMetrics, right: SafeAreaMetrics) {
  return safeAreaMetricsEqual(left, { ...right, visualViewport: left.visualViewport })
}

/** Layout chrome does not change when the keyboard occludes the visual viewport. */
export function useSafeAreaLayoutMetrics() {
  return useSafeAreaSelector(identityMetrics, layoutMetricsEqual)
}

/** Full diagnostic geometry, including visual viewport changes. */
export function useSafeAreaMetrics() {
  return useObservedSafeAreaMetrics(true)
}

/** Internal presentation readers suspend observation while absent. */
export function useObservedSafeAreaMetrics(enabled: boolean) {
  return useSafeAreaSelector(identityMetrics, safeAreaMetricsEqual, enabled)
}

/** Screen dimensions alone cannot locate a floating window. Reconstruct only
 * recorded full-screen coordinate pairs. Otherwise comparison is explicitly
 * viewport-local, with no claim to know the OS-owned window decoration.
 * Rotated screen dimensions are matched geometrically, never via orientation.
 */
export function reconcileWindowGeometry(
  insets: EdgeInsets,
  layout: { width: number; height: number },
  screen: { width: number; height: number },
  standalone: boolean,
) {
  const calibratedPairs = [
    ...CALIBRATED_PHONE_WINDOWS.map(window => [
      window.screenWidth,
      window.screenHeight,
      window.width,
      window.height,
    ]),
    [1032, 1376, 1032, 1344], // Phase reference fit full-screen iPad portrait
    [1032, 1376, 1376, 1000], // Phase reference fit full-screen iPad landscape
    [744, 1133, 744, 1101], // measured-reference installed iPad mini portrait
    [744, 1133, 1133, 712], // measured-reference installed iPad mini landscape
    [834, 1194, 834, 1162], // reference physical iPad fitted full-window portrait
    [834, 1194, 1194, 802], // reference physical iPad fitted full-window landscape
    [1024, 1366, 1024, 1334], // reference physical iPad fitted full-window portrait
    [1024, 1366, 1366, 992], // reference physical iPad fitted full-window landscape
  ]
  const fullScreen =
    standalone &&
    Math.min(layout.width, layout.height) === Math.min(screen.width, screen.height) &&
    Math.max(layout.width, layout.height) === Math.max(screen.width, screen.height)
  const calibrated =
    fullScreen ||
    (standalone &&
      calibratedPairs.some(
        ([sw, sh, w, h]) =>
          Math.min(screen.width, screen.height) === sw &&
          Math.max(screen.width, screen.height) === sh &&
          layout.width === w &&
          layout.height === h,
      ))
  const comparisonFrame = calibrated
    ? {
        width: layout.width,
        height:
          layout.width === Math.min(screen.width, screen.height)
            ? Math.max(screen.width, screen.height)
            : Math.min(screen.width, screen.height),
      }
    : layout
  const physicalInsets = {
    ...insets,
    top: calibrated ? Math.max(insets.top, comparisonFrame.height - layout.height) : insets.top,
  }
  return {
    physicalCoordinateSpace: calibrated
      ? ('calibrated-screen' as const)
      : ('layout-viewport' as const),
    physicalInsets,
    safeFrame: {
      width: layout.width - insets.left - insets.right,
      height: layout.height - insets.top - insets.bottom,
    },
    physicalSafeFrame: {
      width: comparisonFrame.width - physicalInsets.left - physicalInsets.right,
      height: comparisonFrame.height - physicalInsets.top - physicalInsets.bottom,
    },
  }
}
