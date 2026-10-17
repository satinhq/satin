// Render specs shared by the WebGPU renderer and GlassPresentation: surface
// shapes, per-surface specs and their CSS clip paths. Moved unchanged from the
// removed WebGL lens runtime (lens/runtime.ts, lens/directPresent.ts).
import type { GlassTint, PopoverArrow } from './regions.ts'
import type { MenuInkLayer } from './lens/menuField.ts'
import type { GlassRegionRegistry } from './regionRegistry.ts'
import type { MenuGestureFrame } from '../menu/menuGesture.ts'
import type { ReferenceVariant } from './lens/referenceProfiles.ts'
import type { Appearance } from './lens/theme.ts'
import type { TabFrame } from './lens/tabMotion.ts'
import type { ScrollAnchorSummary } from './lens/scrollAnchoring.ts'
import { GLASS_OVERSCAN_X_PX, GLASS_OVERSCAN_Y_PX, type ScreenId } from './lens/Scene.tsx'
import { projectToolbarMenu } from './lens/menuPlacement.ts'
import {
  stableTabSelection,
  tabSelectionCapsule,
  TAB_BAR_BLUR_SIGMA,
} from './lens/tabSelectionMaterial.ts'
import { LIQUID_ENVELOPES, sampleLiquidShape, type LiquidMotionMode } from './lens/liquidMotion.ts'
import { MENU_ENVELOPE, sampleMenuMotion, type MenuMotionFrame } from './lens/menuMotion.ts'

export type LensMode = 'reference-clear' | 'reference-regular'
export type SurfaceId = 'dock' | 'left' | 'right' | `region:${string}`

export type CapsuleShape = Readonly<{
  centerX: number
  centerY: number
  halfHeight: number
  halfWidth: number
  radius: number
  bottomRadius?: number
}>

export type SurfaceShape = Readonly<{
  blendRadius: number
  first: CapsuleShape
  members?: readonly CapsuleShape[]
  rimAlpha: number
  /** Inward source width of the rim highlight in CSS px. Frozen 7j/7l value is 0.75; only the menu asks for more. */
  rimBandCssPx?: number
  second?: CapsuleShape
  whiteMix: number
}>

export type TabSelectionShape = Readonly<{
  glyphCount?: number
  /** Production tab atlas: complete icons above complete labels, each in a full-size plane. */
  glyphLayers?: boolean
  /** The first and last glyph centres in frame points (default: the tab bar's dock layout). */
  glyphAnchors?: readonly [number, number]
  lensMix?: number
  /** Resting-pill visibility while a separate lift overlay owns the selection. */
  restMix?: number
  blurSigmaCssPx: number
  capsule: CapsuleShape
  materialMix: number
}>

export type ReturningMenuTrigger = Readonly<{
  centerX: number
  centerY: number
  radius: number
  mix: number
}>

/** A sampled light field, independent of the renderer and of row selection.
 * Coordinates and radius are CSS pixels relative to the surface frame. */
export type GlassTouchLight = Readonly<{
  x: number
  y: number
  radius: number
  intensity: number
  colour: readonly [number, number, number]
}>

export type SurfaceRenderSpec = Readonly<{
  touchLight?: GlassTouchLight
  excludeRegionIds?: readonly string[]
  /** A resting menu trigger drawn by bar glass elsewhere: this surface presents nothing. */
  restHidden?: boolean
  /** Opacity of this surface on its layer (fades the bar trigger into the menu morph). */
  opacity?: number
  /** Glass drawn above this surface, in frame points: this surface presents nothing inside it.
   * The tab bar carries the bottom accessory's capsule while the accessory moves between its
   * rows. Native draws the accessory over the bar wherever the two overlap; Satin draws the
   * accessory in the page, below the bar's layer, so the bar leaves that capsule empty. */
  occluder?: CapsuleShape
  /** Prepare the material of a zero-opacity held pose before its visible timeline starts.
   * Presentation still multiplies by opacity; this only bypasses the empty-result shortcut. */
  prewarmTransparent?: boolean
  /** Menu kernel only: material between the bar recipe (0) and the menu recipe (1), replacing
   * the regular-trigger material regime (the kernel draws the recipe material alone). */
  recipeMix?: number
  /** Sheet material opacity, sampled on the CPU independently of its position. */
  sheetOpaqueMix?: number
  /** A confirmation popover's arrow, drawn in the same field as its body. */
  popoverArrow?: PopoverArrow
  variant?: ReferenceVariant
  treatment?:
    | 'sheet'
    | 'expandedSheet'
    | 'alert'
    | 'confirmation'
    | 'contextBackdrop'
    | 'contextPreview'
    | 'contextMenu'
  tint?: GlassTint
  /** A field member's white press response, over the unchanged shared material tint, and its
   * touch light (surface frame CSS px), both kept inside the member's aperture. */
  memberHighlight?: Readonly<{ member: number; amount: number; light?: GlassTouchLight }>
  backdropExclusions?: readonly string[]
  /** Menu glass samples owned dimming above the scene without dimming underlying bars twice. */
  backdropMenuOverlay?: boolean
  blurSigmaCssPx?: number
  frameHeight: number
  frameWidth: number
  frameX: number
  frameY: number
  id: SurfaceId
  materialMix: number
  /** Which material parameter row the material reads: bar glass ('chrome'), the search
   * field's more transparent row, or the frosted menu. */
  materialProfile: 'chrome' | 'searchField' | 'menu'
  menuTintMix?: number
  returningTrigger?: ReturningMenuTrigger
  radius: number
  sampleHeight: number
  sampleInsetX: number
  sampleInsetY: number
  sampleWidth: number
  shaderAperture: boolean
  shape: SurfaceShape
  tabSelection?: TabSelectionShape
  /** Ink drawn inside the glass field (a menu's rows and its trigger's glyph): regions of the
   * region's foreground atlas, `atlas` points in size. Rectangles are in field-member points. */
  ink?: Readonly<{
    atlas: Readonly<{ width: number; height: number }>
    layers: readonly MenuInkLayer[]
  }>
}>

export type ChromeBandSpec = Readonly<{
  height: number
  width: number
  x: number
  y: number
}>

function roundedRectPath(shape: CapsuleShape, offsetX: number, offsetY: number, inset: number) {
  if (inset >= shape.halfWidth || inset >= shape.halfHeight) return 'M 0 0 Z'
  const x = offsetX + shape.centerX - shape.halfWidth + inset
  const y = offsetY + shape.centerY - shape.halfHeight + inset
  const right = x + shape.halfWidth * 2 - inset * 2
  const bottom = y + shape.halfHeight * 2 - inset * 2
  const radius = Math.max(
    0,
    Math.min(shape.radius - inset, shape.halfWidth - inset, shape.halfHeight - inset),
  )
  const bottomRadius = Math.max(
    0,
    Math.min(
      (shape.bottomRadius ?? shape.radius) - inset,
      shape.halfWidth - inset,
      shape.halfHeight - inset,
    ),
  )
  return [
    `M ${x + radius} ${y}`,
    `H ${right - radius}`,
    `A ${radius} ${radius} 0 0 1 ${right} ${y + radius}`,
    `V ${bottom - bottomRadius}`,
    `A ${bottomRadius} ${bottomRadius} 0 0 1 ${right - bottomRadius} ${bottom}`,
    `H ${x + bottomRadius}`,
    `A ${bottomRadius} ${bottomRadius} 0 0 1 ${x} ${bottom - bottomRadius}`,
    `V ${y + radius}`,
    `A ${radius} ${radius} 0 0 1 ${x + radius} ${y}`,
    'Z',
  ].join(' ')
}

function roundedRectDistance(x: number, y: number, shape: CapsuleShape, continuous = false) {
  const radius = y > shape.centerY ? (shape.bottomRadius ?? shape.radius) : shape.radius
  const qx = Math.abs(x - shape.centerX) - shape.halfWidth + radius
  const qy = Math.abs(y - shape.centerY) - shape.halfHeight + radius
  if (continuous) {
    const n = 2 + 0.900378259 * Math.max(0, Math.min(1, (shape.halfWidth - 24) / 101))
    const ax = Math.max(qx, 0),
      ay = Math.max(qy, 0)
    const length = (ax ** n + ay ** n) ** (1 / n)
    const gradient =
      Math.hypot(ax ** (n - 1), ay ** (n - 1)) / Math.max(length ** (n - 1), 0.000001)
    return length < 0.000001
      ? Math.max(qx, qy) - radius
      : Math.min(Math.max(qx, qy), 0) + (length - radius) / Math.max(gradient, 0.000001)
  }
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - radius
}

function surfaceDistance(x: number, y: number, shape: SurfaceShape, continuous = false) {
  const first = roundedRectDistance(x, y, shape.first, continuous)
  if (!shape.second) return first
  const second = roundedRectDistance(x, y, shape.second, continuous)
  if (shape.blendRadius <= 0) return Math.min(first, second)
  const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (second - first)) / shape.blendRadius))
  return second * (1 - h) + first * h - shape.blendRadius * h * (1 - h)
}

/* `inset` shrinks the aperture (measured-reference registration); the smooth union is contoured at -inset. */
function blendedShapePath(
  shape: SurfaceShape,
  offsetX: number,
  offsetY: number,
  inset = 0,
  continuous = false,
) {
  if (!continuous && (!shape.second || shape.blendRadius <= 0)) {
    return [shape.first, shape.second]
      .filter((candidate): candidate is CapsuleShape => Boolean(candidate))
      .map(candidate => roundedRectPath(candidate, offsetX, offsetY, inset))
      .join(' ')
  }
  // The CPU clip must use the shader's contour; a circular DOM clip cuts off
  // the continuous menu corners even when the GPU distance field is correct.
  if (!shape.second) shape = { ...shape, second: shape.first, blendRadius: 0 }
  const distance = (x: number, y: number) => surfaceDistance(x, y, shape, continuous)
  const secondShape = shape.second!
  const left =
    Math.min(
      shape.first.centerX - shape.first.halfWidth,
      secondShape.centerX - secondShape.halfWidth,
    ) + Math.min(0, inset)
  const right =
    Math.max(
      shape.first.centerX + shape.first.halfWidth,
      secondShape.centerX + secondShape.halfWidth,
    ) - Math.min(0, inset)
  const top =
    Math.min(
      shape.first.centerY - shape.first.halfHeight,
      secondShape.centerY - secondShape.halfHeight,
    ) -
    shape.blendRadius -
    1
  const bottom =
    Math.max(
      shape.first.centerY + shape.first.halfHeight,
      secondShape.centerY + secondShape.halfHeight,
    ) +
    shape.blendRadius +
    1
  const seedYs = [
    shape.first.centerY,
    secondShape.centerY,
    (shape.first.centerY + secondShape.centerY) / 2,
  ]
  const contours: Array<{ bottom: string[]; top: string[] }> = []
  let contour: { bottom: string[]; top: string[] } | undefined
  const columns = 192
  for (let index = 0; index <= columns; index += 1) {
    const x = left + ((right - left) * index) / columns
    const insideY = seedYs.reduce((best, candidate) =>
      distance(x, candidate) < distance(x, best) ? candidate : best,
    )
    if (distance(x, insideY) > -inset) {
      if (contour) contours.push(contour)
      contour = undefined
      continue
    }
    contour ??= { bottom: [], top: [] }
    let outside = top
    let inside = insideY
    for (let iteration = 0; iteration < 14; iteration += 1) {
      const middle = (outside + inside) / 2
      if (distance(x, middle) <= -inset) inside = middle
      else outside = middle
    }
    const contourTop = inside
    inside = insideY
    outside = bottom
    for (let iteration = 0; iteration < 14; iteration += 1) {
      const middle = (inside + outside) / 2
      if (distance(x, middle) <= -inset) inside = middle
      else outside = middle
    }
    contour.top.push(`${offsetX + x} ${offsetY + contourTop}`)
    contour.bottom.push(`${offsetX + x} ${offsetY + inside}`)
  }
  if (contour) contours.push(contour)
  return contours
    .map(segment => `M ${segment.top.join(' L ')} L ${segment.bottom.reverse().join(' L ')} Z`)
    .join(' ')
}

export function createSurfaceClipPath(spec: Pick<SurfaceRenderSpec, 'shape' | 'materialProfile'>) {
  return `path("${blendedShapePath(spec.shape, 0, 0, spec.materialProfile === 'menu' ? -1 : 0, spec.materialProfile === 'menu')}")`
}

export type Scenario = 'idle' | 'scroll-bridge-off' | 'scroll-bridge-on' | 'scroll-glass-off'

export type ScenarioMetrics = Readonly<{
  droppedPresentations: number
  copyP95Ms: number
  copiesPerFrame: number
  drawCallsPerFrame: number
  drawCallsPerGlassFrame: number
  finalCompositePassesPerGlassFrame: number
  fps: number
  frameCount: number
  glassFrameCount: number
  glassJsP95Ms: number
  maxRafScrollDeltaPx: number
  p95Ms: number
  presenterCopiesPerFrame: number
  renderTexturePassesPerGlassFrame: number
  textureUploadsPerFrame: number
  textureUploadsPerGlassFrame: number
}>

export type BridgeMode =
  'fixed-tab-glass' | 'css-scroll-timeline' | 'main-thread-fallback' | 'waapi-scroll-timeline'

export type DirectCanvasElements = Readonly<{
  base: HTMLDivElement
  canvas: HTMLCanvasElement
  clip: HTMLDivElement
  frame: HTMLDivElement
  rimCanvas: HTMLCanvasElement
  rimClip: HTMLDivElement
  track: HTMLDivElement
}>

export type RuntimeElements = Readonly<{
  band: DirectCanvasElements
  chrome: Readonly<{
    dock: HTMLDivElement
    left: HTMLDivElement
    right: HTMLDivElement
  }>
  contentHost: HTMLDivElement
  menu?: Readonly<{
    items: HTMLDivElement
    itemsClip: HTMLDivElement
    shadow: HTMLDivElement
    shadowPlate: HTMLDivElement
    trigger: HTMLButtonElement
  }>
  scroller: HTMLDivElement
  syncMarkers: HTMLDivElement
}>

export type RuntimeGeometry = Readonly<{
  menuOffsetX?: number
  menuOffsetY?: number
  menuToolbar?: boolean
  bottomInset: number
  circleSize: number
  circleY: number
  dockHeight: number
  dockRadius: number
  dockWidth: number
  dockX: number
  dockY: number
  height: number
  leftX: number
  physicalTopInset: number
  rightX: number
  surfaceMode: 'chrome' | 'drag'
  /** Collapsed button left edge in dock-local points. Full-width docks use 7. */
  tabBarMinimizedOffsetX?: number
  tabBarBackground?: string
  tabBarSelectedIndex?: number
  tabBarPillWidth?: number
  /** Per-tab pill widths when items are sized by their labels (the iPad top bar). */
  tabBarPillWidths?: readonly number[]
  /** 'top' is the regular-width iPad tab bar; the phone dock is 'bottom' (the default). */
  tabBarPlacement?: 'bottom' | 'top'
  tabBarOpacity?: number
  tabBarPillHeight?: number
  tabBarPillCenterY?: number
  tabBarCentres?: readonly number[]
  width: number
}>

export type RuntimeOptions = Readonly<{
  regions?: GlassRegionRegistry
  consumerMode?: boolean
  appearance: Appearance
  bridgeEnabled: boolean
  elements: RuntimeElements
  geometry: RuntimeGeometry
  glassEnabled: boolean
  lensMode: LensMode
  liquidMotion: LiquidMotionMode
  menuEnabled: boolean
  menuCompositor?: boolean
  markers: boolean
  onSnapshot: (snapshot: RuntimeSnapshot) => void
  onSourceReady?: (source: HTMLDivElement) => void
  onPresented?: (ready: boolean) => void
  /** `rebuilding`: the renderer is rebuilding its sources once after this error (bounded). */
  onPresentationError?: (error: unknown, rebuilding?: boolean) => void
  subscribeAppearance?: (listener: () => void) => () => void
  currentAppearance?: () => Appearance
  onTabActivated?: (index: number) => void
  onTabSelected?: (index: number) => void
  screen: ScreenId
  velocityFadeEnabled: boolean
}>

export type GlassFrameTrace = Readonly<{
  menu: Readonly<{
    domSubmissions: number
    direction?: 'open' | 'close'
    transitioning: boolean
    elapsed: number
    frame?: MenuMotionFrame
  }>
  allocations: number
  unavailableCounters: readonly string[]
  id: number
  at: number
  interval: number
  scroll: number
  delta: number
  active: boolean
  lensMix: number
  selected: number | undefined
  domSelected: number
  pill: TabFrame
  path: string
  rendered: boolean
  draws: number
  passes: number
  uploads: number
  copies: number
  jsMs: number
  updateMs: number
  callbackJsMs: number
  diagnosticsMs: number
  layoutMs: number
  mirrorRebuilds: number
  lost: boolean
  restored: number
  baseY: string
}>

/** Probe telemetry shape. The WebGPU runtime does not emit snapshots; GlassPresentation's
 * probe panel still types against it. Fields typed by removed WebGL classes are `unknown`. */
export type RuntimeSnapshot = Readonly<{
  capabilities?: unknown
  frameTrace: readonly GlassFrameTrace[]
  appearance: Appearance
  bridge: Readonly<{
    animationRebuilds: number
    animationStates: readonly string[]
    droppedAnimationSamples: number
    enabled: boolean
    canvasTransformWritesAfterInitialization: 0
    endpointCorrectionWrites: number
    layoutReadsInGlassRaf: 0
    mainThreadTrackWrites: number
    mode: BridgeMode
    parentRebaseWrites: number
  }>
  context: Readonly<{
    createdApplications: 1
    lost: boolean
    lostAtMs?: number
    restored: number
    resumes: number
  }>
  dom: Readonly<{
    accessibilityMode: 'semantic-dom'
    blankFrameChecks: number
    blankFramesObserved: number
    contentHeightCssPx: number
    layoutMeasures: number
    nodeCount: number
    textMode: 'webkit-dom'
  }>
  glassEnabled: boolean
  lensMode: LensMode
  markerIntervalCssPx: number
  markers: boolean
  presentation: Readonly<{
    backingHeightPx: number
    backingWidthPx: number
    bandXCssPx: number
    bandYCssPx: number
    cssHeightPx: number
    cssWidthPx: number
    filterPassesPerVisibleSurface: number
    tabSelectionPasses: number
    maxTextureSizePx: number
    mirrorMemoryBytes: number
    passMode:
      | 'split-content-direct-present-fixed-dom-optics'
      | 'split-content-direct-present-sdf-css-aperture'
      | 'anchored-rim-copy-predicted-direct-interior'
    anchoredRimBand: Readonly<{
      active: boolean
      copyReliable: boolean
      depthCssPx: number
    }>
    renderTextures: readonly Readonly<{
      backingHeight: number
      backingWidth: number
      cssHeight: number
      cssWidth: number
      id: SurfaceId
    }>[]
    surfaceCount: number
    surfaceMode: RuntimeGeometry['surfaceMode']
  }>
  optics: Readonly<{
    mode: 'animated-sdf-css-aperture' | 'fixed-dom-css'
    perScrollWrites: 0
    staticUploadsPerFrame: 0
  }>
  liquidMotion: Readonly<{
    active: boolean
    apertureWrites: number
    completedRepeats: number
    droppedFrames: number
    maxFrameMs: number
    mode: LiquidMotionMode
    reducedMotion: boolean
    requestedRepeats: number
    samples: number
    speed: number
  }>
  menu: Readonly<{
    case: string
    interactions: readonly { at: number; case: string; event: string; phase: string }[]
    active: boolean
    gesture: MenuGestureFrame
    selections: readonly { index: number; at: number; trusted: boolean; detail: number }[]
    inputEvents: readonly Record<string, unknown>[]
    rasterWindows?: unknown
    hybridLayer?: unknown
    contacts: readonly unknown[]
    touches: readonly { phase: string; at: number; x: number; y: number }[]
    apertureWrites: number
    completedRepeats: number
    droppedPresentations: number
    enabled: boolean
    maxFrameMs: number
    open: boolean
    requestedRepeats: number
    samples: number
    speed: number
  }>
  tabBar: Readonly<{
    motion: {
      shaderMix?: string
      active: boolean
      lensMix: number
      centre: number
      width: number
      height: number
      frames: number
      droppedPresentations: number
      maxFrameMs: number
    }
    enabled: boolean
    height: number
    selectedIndex?: number
    width: number
  }>
  renderer: string
  regularMaterial?: unknown
  resolution: number
  scenarios: Readonly<Record<Scenario, ScenarioMetrics>>
  screen: ScreenId
  scrollAnchoring: ScrollAnchorSummary
  scroll: Readonly<{
    events: number
    maximumObservedCssPx: number
    maximumCssPx: number
    minimumObservedCssPx: number
    offsetCssPx: number
  }>
  timestamp: string
  velocityAdaptation: Readonly<{
    curve: Readonly<{
      fullStrengthThroughCssPxPerFrame: number
      returnMs: number
      zeroStrengthAtCssPxPerFrame: number
    }>
    enabled: boolean
    factor: number
    minimumFactor: number
    target: number
  }>
  debug: string
}>

export function createRenderSpecs(
  geometry: RuntimeGeometry,
  appearance: Appearance = 'light',
  liquidMotion: LiquidMotionMode = 'none',
  liquidShape = liquidMotion === 'none'
    ? undefined
    : sampleLiquidShape(liquidMotion, 0, appearance, false),
  menuEnabled = false,
  menuFrame = sampleMenuMotion('close', 0, appearance, true),
): readonly SurfaceRenderSpec[] {
  menuFrame = projectToolbarMenu(menuFrame, geometry.menuToolbar)
  if (liquidMotion !== 'none' && liquidShape) {
    const envelope = LIQUID_ENVELOPES[liquidMotion]
    return [
      {
        ...envelope,
        frameY: envelope.frameY - geometry.physicalTopInset,
        id: 'dock',
        materialMix: 0,
        materialProfile: 'chrome',
        radius: liquidShape.first.radius,
        sampleHeight: envelope.frameHeight + 40,
        sampleInsetX: 20,
        sampleInsetY: 20,
        sampleWidth: envelope.frameWidth + 40,
        shaderAperture: true,
        shape: liquidShape,
      },
    ]
  }
  const definitions = [
    {
      frameHeight: geometry.dockHeight,
      frameWidth: geometry.dockWidth,
      frameX: geometry.dockX,
      frameY: geometry.dockY,
      id: 'dock' as const,
      opacity: geometry.tabBarOpacity,
      radius: geometry.dockRadius,
    },
    {
      frameHeight: geometry.circleSize,
      frameWidth: geometry.circleSize,
      frameX: geometry.leftX,
      frameY: geometry.circleY,
      id: 'left' as const,
      radius: geometry.circleSize / 2,
    },
    ...(geometry.surfaceMode === 'drag'
      ? []
      : [
          {
            frameHeight: geometry.circleSize,
            frameWidth: geometry.circleSize,
            frameX: geometry.rightX,
            frameY: geometry.circleY,
            id: 'right' as const,
            radius: geometry.circleSize / 2,
          },
        ]),
  ]
  return definitions.map(definition => {
    if (menuEnabled && definition.id === 'right') {
      return {
        ...MENU_ENVELOPE,
        frameX: MENU_ENVELOPE.frameX + (geometry.menuOffsetX ?? 0),
        frameY: MENU_ENVELOPE.frameY - geometry.physicalTopInset + (geometry.menuOffsetY ?? 0),
        id: 'right',
        materialMix: menuFrame.materialMix,
        returningTrigger: menuFrame.returningTrigger,
        menuTintMix: menuFrame.menuTintMix,
        materialProfile: 'menu',
        radius: menuFrame.shape.first.radius,
        sampleHeight: MENU_ENVELOPE.frameHeight + 40,
        sampleInsetX: 20,
        sampleInsetY: 20,
        sampleWidth: MENU_ENVELOPE.frameWidth + 40,
        shaderAperture: true,
        shape: menuFrame.shape,
      }
    }
    return {
      ...definition,
      blurSigmaCssPx:
        definition.id === 'dock' && geometry.tabBarSelectedIndex !== undefined
          ? TAB_BAR_BLUR_SIGMA[appearance]
          : undefined,
      materialMix: 0,
      materialProfile: 'chrome',
      sampleHeight: definition.frameHeight + GLASS_OVERSCAN_Y_PX * 2,
      sampleInsetX: GLASS_OVERSCAN_X_PX,
      sampleInsetY: GLASS_OVERSCAN_Y_PX,
      sampleWidth: definition.frameWidth + GLASS_OVERSCAN_X_PX * 2,
      shaderAperture: false,
      shape: {
        blendRadius: 0,
        first: {
          centerX: definition.frameWidth / 2,
          centerY: definition.frameHeight / 2,
          halfHeight: definition.frameHeight / 2,
          halfWidth: definition.frameWidth / 2,
          radius: definition.radius,
        },
        rimAlpha: 0,
        whiteMix: 0,
      },
      tabSelection:
        definition.id === 'dock' && geometry.tabBarSelectedIndex !== undefined
          ? {
              ...stableTabSelection(appearance),
              glyphCount: geometry.tabBarCentres?.length,
              capsule: tabSelectionCapsule(
                geometry.tabBarSelectedIndex,
                geometry.tabBarCentres,
                geometry.tabBarPillWidths?.[geometry.tabBarSelectedIndex] ??
                  geometry.tabBarPillWidth,
                geometry.tabBarPillHeight,
                geometry.tabBarPillCenterY,
              ),
            }
          : undefined,
    }
  })
}
