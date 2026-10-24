import { keyboardBackdrop } from './keyboardBackdrop.ts'
import { uncoveredRows, type SampleRect } from './captureBands.ts'
import { searchBackdropScroll } from '../../search/searchBackdrop.ts'
import { LazyRegularMaterialContext } from '../regularMaterialContext.ts'
import { REGULAR_TRIGGER_MATERIAL } from '../regularTriggerMaterial.ts'
import type { Appearance } from '../lens/theme.ts'
import type { RuntimeGeometry, SurfaceRenderSpec } from '../renderSpecs.ts'
import type { BackdropLayer } from '../worker/protocol.ts'
import { measureProductionSource, type MeasuredSource } from './capture.ts'
import { CAPTURE_CONTEXT } from './captureContext.ts'
import { backdropOwner, backdropClip, cssColor, effectiveBackground } from './backdropLayers.ts'
import { atRest, presentationTravel } from '../presentationFrame.ts'
import { pinnedTopLayer, type PinnedTop } from './productionPinnedTop.ts'
import { demandBands, type CaptureBand, type PlaneDemand } from './captureDemand.ts'
import { glassNow, glassTiming, traceStage, traceStageStart } from './profile.ts'
import {
  planCaptureWindow,
  filterCaptureNodes,
  ACCELERATED_CANVAS_PIXELS,
  texelCount,
  type CaptureWindow,
} from '../captureWindow.ts'

export type MaterialContext = { sample: LazyRegularMaterialContext['sample'] }
/** An installed plane capture: worker image key and the settled viewport geometry it was taken at. */
export type PlaneEntry = {
  searchAnchor?: MeasuredSource['searchAnchor']
  keyboardAnchor?: MeasuredSource['keyboardAnchor']
  window?: CaptureWindow
  /** The only rows the capture holds: the ones glass samples (captureDemand.ts). */
  bands?: readonly CaptureBand[]
  signature: string
  key: string
  revision: number
  origin: { x: number; y: number }
  width: number
  height: number
  resolution: number
  host: HTMLElement
  appearance: Appearance
  text: string
}
/** Dynamic Type: the root's resolved system body size. A capture made at another text size is stale. */
export const textKey = () => {
  const root = document.querySelector('[data-satin-root]')
  return root ? getComputedStyle(root).fontSize : ''
}
export type Plane = {
  id: string
  host: HTMLElement
  measured: MeasuredSource
  origin: { x: number; y: number }
  clip: readonly [number, number, number, number]
  fill: readonly [number, number, number, number]
  width: number
  height: number
  signature: string
  hidden?: boolean
  window?: CaptureWindow
  /** The only rows the capture holds: the ones glass samples (captureDemand.ts). */
  bands?: readonly CaptureBand[]
  /** The height of the host's whole content in points (a window holds a part of it). */
  contentHeight: number
}
/** A fresh capture of a plane, with the signature it installs under. */
export type PlaneCapture = { bitmap: ImageBitmap; signature: string }
/** Page background behind every plane, straight RGB. */
export type PageColour = readonly [number, number, number]
/** What every plane of one preparation is captured at. */
export type PlaneCaptureFrame = {
  page: PageColour
  resolution: number
  appearance: Appearance
  /** Glass is waiting for this capture (ProductionGlassRuntime.coverFor): a presentation that
   * moves elsewhere (a sheet held for its glass) does not delay a plane that is not in it. */
  covering?: boolean
}

const roundToSixtyFourth = (value: number) => Math.round(value * 64) / 64

/** What the runtime knows about a plane when its capture window is chosen (captureWindow.ts,
 * "Bounded capture"). */
export type PlaneWindowHint = {
  /** What the plane holds now, installed or resident: a window, the whole content, or nothing. */
  current?: CaptureWindow | 'full'
  /** The bands it holds instead of its whole content (captureDemand.ts). */
  bands?: readonly CaptureBand[]
  /** The scene is idle: an entry window may grow. */
  grow: boolean
  /** The host's scroll speed in points per second (positive: towards the end of the content). */
  velocity: number
  /** What glass samples, for a host that does not scroll (captureDemand.ts). */
  demand?: PlaneDemand
}

/** The window a host is captured for; undefined captures its whole content. A vertically
 * scrolling host gets a scroll window; one that does not scroll, the rows glass samples. */
function boundedCaptureRange(
  host: HTMLElement,
  rect: Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom' | 'width' | 'height'>,
  resolution: number,
  hint: PlaneWindowHint,
): { window?: CaptureWindow; bands?: readonly CaptureBand[] } {
  const viewport = Math.max(1, host.clientHeight || rect.height)
  const contentHeight = host.scrollHeight
  if (!Number.isFinite(contentHeight)) return {}
  if (contentHeight <= viewport + 0.5) {
    if (!hint.demand) return {}
    const bands = demandBands({
      host: rect,
      contentHeight: Math.max(rect.height, contentHeight),
      resolution,
      demand: hint.demand,
      current: hint.bands ?? (hint.current === 'full' ? 'full' : undefined),
    })
    return bands ? { bands } : {}
  }
  const window = planCaptureWindow({
    scrollTop: Math.max(0, Math.min(host.scrollTop, contentHeight - viewport)),
    viewport,
    contentHeight,
    resolution,
    current: hint.current,
    grow: hint.grow,
    velocity: hint.velocity,
  })
  return { window }
}

/** Invalid scroll geometry must fail before a full-content canvas reaches the GPU. */
function assertCaptureHeight(
  id: string,
  host: HTMLElement,
  height: number,
  resolution: number,
  window?: CaptureWindow,
) {
  const pixels = texelCount(height, resolution)
  if (!Number.isFinite(pixels) || pixels <= 0 || pixels > ACCELERATED_CANVAS_PIXELS)
    throw Error(
      `Glass plane ${id} capture height ${pixels}px exceeds the ${ACCELERATED_CANVAS_PIXELS}px limit: ` +
        `window=${window ? `${window.top}..${window.bottom}` : 'full'}, ` +
        `clientHeight=${host.clientHeight}, scrollHeight=${host.scrollHeight}, ` +
        `axis=${host.getAttribute('data-satin-scroll-axis')}. ` +
        'A long list requires a bounded scrollport and capture window.',
    )
}

/** Measure one backdrop host as a plane (undefined when it is clipped out of the screen). A hidden
 * plane (a collapsed sidebar's navigation source) keeps its capture but shows nothing. With a
 * `windowHint` a scrolling host is measured and captured for a bounded window (the default in
 * production); without one, for its whole content. */
export async function measurePlane(
  host: HTMLElement,
  frame: PlaneCaptureFrame,
  planeId: (host: HTMLElement) => string,
  hidden = false,
  windowHint?: (id: string, host: HTMLElement) => PlaneWindowHint,
  /** Measure exactly this window (a window pinned at the top of a list), whatever the host's
   * scroll offset and whatever the plane holds. */
  forcedWindow?: CaptureWindow,
  /** Publish the immutable capture bounds before asynchronous source measurement. */
  captureChosen?: (id: string, capture: Pick<PlaneEntry, 'host' | 'window' | 'width'>) => void,
): Promise<Plane | undefined> {
  const { page, resolution, appearance } = frame
  const id = planeId(host)
  const initialRect = host.getBoundingClientRect()
  // Held and travelling sheets are captured in their resting frame. Choose
  // demand bands in that same frame; offscreen entrance coordinates otherwise
  // select unrelated rows and fail every subsequent coverage check.
  const initialTravel = presentationTravel(host)
  const initialRestingRect = {
    left: initialRect.left - initialTravel.x,
    top: initialRect.top - initialTravel.y,
    right: initialRect.right - initialTravel.x,
    bottom: initialRect.bottom - initialTravel.y,
    width: initialRect.width,
    height: initialRect.height,
  }
  const bounded =
    !forcedWindow && windowHint
      ? boundedCaptureRange(host, initialRestingRect, resolution, windowHint(id, host))
      : {}
  const bands = bounded.bands
  const captureRange = forcedWindow ?? bounded.window
  assertCaptureHeight(
    id,
    host,
    captureRange
      ? captureRange.bottom - captureRange.top
      : Math.max(1, initialRect.height, Number.isFinite(host.scrollHeight) ? host.scrollHeight : 0),
    resolution,
    captureRange,
  )
  captureChosen?.(id, { host, window: captureRange, width: initialRect.width })
  // Band coverage participates in mirror reuse; the resting presentation frame is unchanged.
  const measured = await measureProductionSource(
    host,
    false,
    'viewport',
    captureRange ?? (bands ? bandsRange(bands) : undefined),
    true,
    !!frame.covering,
  )
  const travel = presentationTravel(host)
  const clip = hidden ? ([0, 0, 0, 0] as const) : backdropClip(host, travel)
  if (!clip) return
  const rect = atRest(host.getBoundingClientRect(), travel)
  const fill = effectiveBackground(host, page)
  // Texel-exact extent: the plane's image maps 1:1 onto device pixels.
  const width = Math.max(1, Math.ceil(roundToSixtyFourth(rect.width) * resolution)) / resolution
  const contentHeight = Math.max(roundToSixtyFourth(rect.height), measured.layout.contentHeight)
  // Keep measurement, raster coordinates and signature on the same immutable window.
  // A subsequent scroll schedules another preparation; it must not reinterpret this snapshot.
  const window = captureRange
  const height = window
    ? window.bottom - window.top
    : Math.max(1, Math.ceil(contentHeight * resolution)) / resolution
  // DOM measurement can discover content beyond scrollHeight. Recheck the final raster extent.
  assertCaptureHeight(id, host, height, resolution, window)
  const nodes = window
    ? filterCaptureNodes(measured.layout.nodes, window)
    : bands
      ? filterBandNodes(measured.layout.nodes, bands)
      : measured.layout.nodes
  const signatureStarted = traceStageStart()
  const signature = JSON.stringify([
    width,
    height,
    resolution,
    appearance,
    fill,
    // The window's pixels identify the capture; the scrollport height it records does not (a
    // kept window takes the new height when the keyboard comes or goes: nothing to capture).
    window ? [window.top, window.bottom] : measured.layout.contentHeight,
    bands?.map(band => [band.top, band.bottom]) ?? null,
    // Region foreground is composited above its own glass and is excluded by
    // drawProductionSource. Its movement must not invalidate the backdrop.
    // Retain all ordinary nodes so reflow and real paint changes still recapture.
    // Generated IDs can shift when excluded nodes are inserted or removed.
    // They do not affect rasterization; keep node order and all paint inputs.
    nodes.filter(node => !node.regionId).map(node => ({ ...node, id: undefined })),
  ])
  traceStage('plane-signature', signatureStarted, () => `${signature.length} chars`)
  return {
    id,
    host,
    measured: {
      ...measured,
      top: -(window?.top ?? 0),
      left: 0,
      layout: {
        ...measured.layout,
        nodes,
        contentHeight: window?.bottom ?? measured.layout.contentHeight,
      },
    },
    origin: { x: rect.x, y: rect.y + (window?.top ?? 0) },
    window,
    ...(bands ? { bands } : {}),
    clip,
    fill,
    width,
    height,
    hidden,
    contentHeight,
    signature,
  }
}

/** The rows a banded capture measures: every band, and nothing between them. */
function bandsRange(bands: readonly CaptureBand[]) {
  return { top: bands[0].top, bottom: bands.at(-1)!.bottom, bands }
}

/** The measured nodes a banded capture paints: those that reach into a band (with the raster's
 * paint overflow, as for a window). */
function filterBandNodes<Node extends { y: number; height: number }>(
  nodes: readonly Node[],
  bands: readonly CaptureBand[],
  paintOverflow = 64,
) {
  return nodes.filter(node =>
    bands.some(
      band =>
        node.y + node.height >= band.top - paintOverflow && node.y <= band.bottom + paintOverflow,
    ),
  )
}

/** The plane that holds the navigation source, when it is part of the visible screen. */
export function findVisibleContentPlane(planes: readonly Plane[], contentHost: HTMLElement) {
  return (
    planes.find(plane => plane.host === contentHost) ??
    planes.find(plane => plane.host.contains(contentHost) || contentHost.contains(plane.host))
  )
}

/** The material context of this exact plane set (ids, captures, geometry, scroll): valid only
 * when every plane is unchanged, so a retained set comes back with the context it had. */
export function planeSetContextKey(
  planes: readonly Plane[],
  contentPlane: Plane,
  geometry: RuntimeGeometry,
  page: PageColour,
) {
  return JSON.stringify([
    planes.map(plane => [
      plane.id,
      plane.signature,
      plane.origin,
      plane.clip,
      plane.fill,
      plane.hidden,
      plane === contentPlane ? 0 : plane.host.scrollTop,
      plane === contentPlane ? 0 : plane.host.scrollLeft,
    ]),
    contentPlane.id,
    geometry.width,
    geometry.height,
    page,
  ])
}

/** The visible plane SET and the capture each one holds: a change rebuilds the material context. */
export function visiblePlaneSetKey(
  planes: readonly Plane[],
  installed: ReadonlyMap<string, PlaneEntry>,
  contentPlane: Plane,
  geometry: RuntimeGeometry,
  overlayKey = 'null',
) {
  return JSON.stringify([
    planes
      .filter(plane => !plane.hidden)
      .map(plane => [plane.id, installed.get(plane.id)?.key ?? '']),
    contentPlane.id,
    geometry.width,
    geometry.height,
    overlayKey,
  ])
}

/** A rectangle of the material context that is read back, in its sample coordinates (the
 * navigation plane's content space): x, y, width, height in points. */
export type ContextArea = readonly [number, number, number, number]

type ContextPart = {
  /** The area asked for; rows beyond the composed screen are left out of the read, as before. */
  area: ContextArea
  /** Sample coordinates of the read image's first pixel. */
  origin: readonly [number, number]
  context: LazyRegularMaterialContext
}

/** The composition each context canvas holds now (a later composition replaces it). */
const compositions = new WeakMap<HTMLCanvasElement, number>()
let nextComposition = 0

/** The composed screen of one preparation, read back only where it is sampled. The areas known to
 * be sampled are read when it is composed; a sample anywhere else (a trigger that moved with its
 * menu) reads its own disc from the composed canvas then, while the canvas still holds this
 * composition. After another composition it has nothing to read, and the sample is an error. */
class AreaMaterialContext {
  private readonly parts: ContextPart[] = []
  private readonly canvas: { ctx: CanvasRenderingContext2D; width: number; height: number }
  private readonly top: number
  private readonly composition: number
  /** Pixels read back so far. */
  bytes = 0
  constructor(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    contextTop: number,
    areas: readonly ContextArea[],
  ) {
    this.canvas = { ctx, width, height }
    this.top = contextTop
    this.composition = compositions.get(ctx.canvas as HTMLCanvasElement)!
    for (const area of areas) this.read(area)
  }
  private read(area: ContextArea) {
    const [x, y, areaWidth, areaHeight] = area
    const { ctx, width, height } = this.canvas
    if (compositions.get(ctx.canvas as HTMLCanvasElement) !== this.composition)
      throw Error(
        `Glass material context was sampled at ${JSON.stringify(area)}, outside the areas read ` +
          `when it was composed (${JSON.stringify(this.parts.map(part => part.area))})`,
      )
    // Whole canvas pixels: the context is read at 1 px per point.
    const left = Math.max(0, Math.floor(x))
    const top = Math.max(0, Math.floor(y - this.top))
    const right = Math.min(width, Math.ceil(x + areaWidth))
    const bottom = Math.min(height, Math.ceil(y + areaHeight - this.top))
    if (right <= left || bottom <= top) return undefined
    this.bytes += (right - left) * (bottom - top) * 4
    const image = ctx.getImageData(left, top, right - left, bottom - top)
    const part: ContextPart = {
      area,
      origin: [left, top + this.top],
      context: new LazyRegularMaterialContext(image),
    }
    this.parts.push(part)
    return part
  }
  sample(centerX: number, centerY: number, radius: number, top?: number, bottom?: number) {
    const from = Math.max(centerY - radius, top ?? -Infinity)
    const to = Math.min(centerY + radius, bottom ?? Infinity)
    const part =
      this.parts.find(
        ({ area: [x, y, width, height] }) =>
          centerX - radius >= x - 0.5 &&
          centerX + radius <= x + width + 0.5 &&
          from >= y - 0.5 &&
          to <= y + height + 0.5,
      ) ?? this.read([centerX - radius - 1, from - 1, 2 * radius + 2, Math.max(0, to - from) + 2])
    if (!part) return undefined
    const [x, y] = part.origin
    return part.context.sample(
      centerX - x,
      centerY - y,
      radius,
      top === undefined ? undefined : top - y,
      bottom === undefined ? undefined : bottom - y,
    )
  }
}

/** Material context (trigger and tab-glyph regimes) read from the composed screen, in the
 * navigation plane's content space: rows move with its scroll, not with the viewport. Only
 * `areas` are read back now (where the trigger and the tab glyphs sample), never the screen. */
export function composeMaterialContext(
  contextCanvas: HTMLCanvasElement,
  planes: readonly Plane[],
  planeCanvases: ReadonlyMap<string, { canvas: HTMLCanvasElement }>,
  contentPlane: Plane,
  geometry: RuntimeGeometry,
  frame: Pick<PlaneCaptureFrame, 'page' | 'resolution'>,
  areas: readonly ContextArea[],
  overlayAlpha = 0,
) {
  const { page, resolution } = frame
  const contextStarted = glassNow()
  const scroll = contentPlane.host.scrollTop
  const width = Math.ceil(geometry.width)
  const contextTop = contentPlane.window?.top ?? 0
  const height = Math.ceil(
    Math.max(geometry.height, contentPlane.height + contentPlane.origin.y - contextTop),
  )
  if (contextCanvas.width !== width) contextCanvas.width = width
  if (contextCanvas.height !== height) contextCanvas.height = height
  compositions.set(contextCanvas, ++nextComposition)
  const ctx = contextCanvas.getContext('2d', CAPTURE_CONTEXT)
  if (!ctx) throw Error(`Glass context canvas ${width}x${height} has no 2D context`)
  ctx.fillStyle = cssColor(page)
  ctx.fillRect(0, 0, width, height)
  for (const plane of planes) {
    const canvas = planeCanvases.get(plane.id)?.canvas
    if (!canvas || plane.hidden) continue
    const dy = plane === contentPlane ? 0 : scroll - plane.host.scrollTop
    const dx = plane === contentPlane ? 0 : -plane.host.scrollLeft
    ctx.save()
    ctx.beginPath()
    ctx.rect(plane.clip[0], plane.clip[1] + scroll - contextTop, plane.clip[2], plane.clip[3])
    if (plane !== contentPlane) ctx.clip()
    ctx.drawImage(
      canvas,
      plane.origin.x + dx,
      plane.origin.y + dy - contextTop,
      canvas.width / resolution,
      canvas.height / resolution,
    )
    ctx.restore()
  }
  if (overlayAlpha) {
    ctx.fillStyle = `rgb(0 0 0 / ${overlayAlpha})`
    ctx.fillRect(0, 0, width, height)
  }
  const context = new AreaMaterialContext(ctx, width, height, contextTop, areas)
  glassTiming('source-context', contextStarted, () => `${context.bytes / 4} px read`)
  return { context: context as MaterialContext, bytes: context.bytes }
}

/** Where the material context is sampled (`applyTabGlyphContext`, `triggerValues`), in its sample
 * coordinates: the tab glyph discs and the trigger's disc, at every offset the navigation scroller
 * can reach (a context is kept while the list scrolls under it). Rubber-band offsets beyond the
 * ends reach at most one viewport further. A screen that does not scroll needs only the discs. */
export function materialContextAreas(
  specs: readonly SurfaceRenderSpec[],
  scroller: { scrollHeight: number; clientHeight: number },
  viewport: number,
): ContextArea[] {
  const range = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
  const bounce = range > 0 ? viewport : 0
  const areas: ContextArea[] = []
  for (const spec of specs) {
    if (spec.id === 'dock')
      areas.push([
        spec.frameX - TAB_CONTEXT_RADIUS,
        spec.frameY - TAB_CONTEXT_RADIUS - bounce,
        spec.frameWidth + 2 * TAB_CONTEXT_RADIUS,
        spec.frameHeight + 2 * TAB_CONTEXT_RADIUS + range + 2 * bounce,
      ])
    else if (spec.id === 'right') {
      const radius = REGULAR_TRIGGER_MATERIAL.radiusPt
      areas.push([
        spec.frameX + TRIGGER_CONTEXT_X - radius,
        spec.frameY + TRIGGER_CONTEXT_Y - radius - bounce,
        2 * radius,
        2 * radius + range + 2 * bounce,
      ])
    }
  }
  return areas
}

/** The disc each tab's glyph colour is read from (points). */
export const TAB_CONTEXT_RADIUS = 24

/** Where `triggerValues` samples the context, relative to the trigger surface's frame (points). */
export const TRIGGER_CONTEXT_X = 241
export const TRIGGER_CONTEXT_Y = 50

/** The worker's backdrop layers for the visible planes. Scroll offsets are read now (at commit):
 * later scroll events are ordered after this batch. */
export function backdropLayers(
  planes: readonly Plane[],
  installed: ReadonlyMap<string, PlaneEntry>,
  resolution: number,
  pinnedTops: ReadonlyMap<string, PinnedTop> = new Map(),
): BackdropLayer[] {
  return planes
    .filter(plane => !plane.hidden)
    .flatMap(plane => {
      const window = plane.window
      // Edges of the window beyond which the list goes on, uncaptured (BackdropLayer.openEdges).
      const openEdges = window
        ? (window.top > 0 ? 1 : 0) | (window.bottom < plane.contentHeight - 1 / 64 ? 2 : 0)
        : 0
      const candidate = window && window.top > 0 ? pinnedTops.get(plane.id) : undefined
      const pinned =
        candidate && !candidate.stale && candidate.window.bottom <= plane.contentHeight + 1 / 64
          ? candidate
          : undefined
      const layer: BackdropLayer = {
        owner: backdropOwner(plane.host),
        id: plane.id,
        key: `${installed.get(plane.id)!.key}:front`,
        width: plane.width,
        height: plane.height,
        resolution,
        origin: plane.origin,
        keyboard: keyboardBackdrop(plane.host, plane.measured.keyboardAnchor),
        clip: plane.clip,
        scroll: {
          x: plane.host.scrollLeft,
          y: searchBackdropScroll(plane.host, plane.measured.searchAnchor),
        },
        fill: plane.fill,
        ...(plane.host.hasAttribute('data-satin-scroll') ? { fillEdges: 3 } : {}),
        ...(openEdges ? { openEdges } : {}),
        ...(pinned ? { band: true } : {}),
        ...(plane.bands ? { rows: plane.bands } : {}),
      }
      // The pinned top lies under the plane's own window (drawn first).
      return pinned
        ? [pinnedTopLayer(layer, pinned, window!.top, plane.contentHeight), layer]
        : [layer]
    })
}

/** A capture measured before an asynchronous readback may already be behind the drawer.
 * Check the exact renderer mapping before replacing its installed source. */
export function uncoveredCapturePlane(
  planes: readonly Plane[],
  rects: readonly SampleRect[],
  resolution: number,
) {
  return planes.find(
    plane =>
      !plane.hidden &&
      plane.bands &&
      rects.some(rect => {
        if (rect[0] + rect[2] <= plane.clip[0] || rect[0] >= plane.clip[0] + plane.clip[2])
          return false
        return !!uncoveredRows(rect, {
          origin: {
            ...plane.origin,
            y:
              plane.origin.y +
              (keyboardBackdrop(plane.host, plane.measured.keyboardAnchor)?.offsetY ?? 0),
          },
          scroll: { y: searchBackdropScroll(plane.host, plane.measured.searchAnchor) },
          height: plane.height,
          resolution,
          clip: plane.clip,
          rows: plane.bands,
        })
      }),
  )?.id
}

/** One diagnostic line per plane for the prepared-event record. */
export function planeDiagnostics(plane: Plane) {
  return [
    plane.id,
    plane.host.dataset.satinScroll ?? plane.host.dataset.satinScreen ?? plane.host.tagName,
    plane.hidden ? 'hidden' : '',
    plane.clip.map(value => Math.round(value)).join(','),
    Math.round(plane.origin.x) + ',' + Math.round(plane.origin.y),
    'images:' + plane.measured.layout.nodes.filter(node => node.kind === 'image').length,
  ].join(' ')
}
