/** Renderer-independent content-space interval for a backdrop capture. */
export type CaptureWindow = { top: number; bottom: number; viewport: number }

export function filterCaptureNodes<Node extends { y: number; height: number }>(
  nodes: readonly Node[],
  window: CaptureWindow,
  paintOverflow = 64,
): Node[] {
  return nodes.filter(
    node =>
      node.y + node.height >= window.top - paintOverflow && node.y <= window.bottom + paintOverflow,
  )
}

// ---------------------------------------------------------------------------------------------
// Bounded capture: a scrolling plane captures a window around its scrollport. Small sources
// are captured whole; longer lists keep the capture within one accelerated canvas.
//
//   entry    the first capture of a visit: the scrollport, what a lens samples beyond it, and
//            a small margin, either side.
//   grown    once the scene has been idle, and at every recentre: as much content as one
//            accelerated canvas holds (the whole content when it fits, and then the plane has
//            no window and needs none again).
//   recentre while scrolling, before the scrollport reaches the window's edge: the same extent,
//            placed ahead in the direction of travel.
//
// A window the plane already holds is kept for as long as it covers the scrollport with the
// guard to spare (a tab comes back to the capture it left with, and nothing is captured).

/** How far beyond the scrollport a glass surface samples its backdrop: the sample overscan of a
 * surface (GLASS_OVERSCAN_Y_PX in lens/Scene.tsx, renderSpecs.ts `sampleInsetY`). A window covers
 * the scrollport only when it holds this much content either side of it (or reaches the content's
 * end): a lens at the scrollport's edge must never sample past the window. */
export const LENS_REACH_POINTS = 128
/** Content either side of the scrollport in an entry window, beyond the lens reach, in
 * scrollports: room to scroll before the first recentre (more than the recentre guard). */
export const ENTRY_MARGIN_VIEWPORTS = 0.15
/** A Canvas2D taller than this is rasterized on the CPU in WebKit (device pixels). */
export const ACCELERATED_CANVAS_PIXELS = 8192
/** Share of a recentred window's spare extent that lies ahead in the direction of travel. */
export const RECENTRE_AHEAD_SHARE = 0.75
/** A recentre starts while the scrollport is still this far from the window's edge (scrollports)… */
export const RECENTRE_GUARD_VIEWPORTS = 0.125
/** …or as far as the scroll travels in this many seconds, whichever is larger. */
export const RECENTRE_LEAD_SECONDS = 0.2

export type CaptureWindowRequest = {
  scrollTop: number
  viewport: number
  contentHeight: number
  resolution: number
  /** What the plane holds now: a window, the whole content ('full'), or nothing. */
  current?: CaptureWindow | 'full'
  /** The scene is idle: an entry window may grow. */
  grow: boolean
  /** Signed scroll speed in points per second (positive: towards the end of the content). */
  velocity: number
}

const texelFloor = (value: number, resolution: number) =>
  Math.floor(value * resolution) / resolution

/** Device pixels needed to cover `value` points. Window edges are texel multiples held in floating
 * point, so a window of exactly 8192 px can measure 8192.000000004 px; that rounding error must not
 * round up to another pixel (and past the accelerated-canvas limit). */
export const texelCount = (value: number, resolution: number) =>
  Math.ceil(value * resolution - 1e-6)

/** The largest extent a grown or recentred window takes, in points: one accelerated canvas.
 * (A phone plane of that extent is 43 MB, more than the resident budget keeps for one plane, so
 * a grown window is captured again, as an entry, when its tab comes back.) */
export function grownExtent(request: Pick<CaptureWindowRequest, 'viewport' | 'resolution'>) {
  return Math.max(request.viewport, ACCELERATED_CANVAS_PIXELS / request.resolution)
}

/** How far ahead of the scrollport a window must still reach before a recentre starts. */
export function recentreGuard(viewport: number, velocity: number) {
  return Math.max(viewport * RECENTRE_GUARD_VIEWPORTS, Math.abs(velocity) * RECENTRE_LEAD_SECONDS)
}

/** Whether `window` holds everything glass over a scrollport of `viewport` points at `scrollTop`
 * can sample: the scrollport and the lens reach either side, up to the ends of the content.
 * The scrollport is the one the host has NOW: a window captured while the keyboard was up, or in
 * landscape, does not cover the taller scrollport that follows (`window.viewport` is only what
 * the window was captured for). */
export function windowCoversScrollport(
  window: CaptureWindow,
  scrollTop: number,
  viewport: number,
  contentHeight: number,
) {
  const needTop = Math.max(0, scrollTop - LENS_REACH_POINTS)
  const needBottom = Math.min(contentHeight, scrollTop + viewport + LENS_REACH_POINTS)
  return window.top <= needTop + 1 / 64 && window.bottom >= needBottom - 1 / 64
}

/** Whether `window` no longer reaches far enough around the scrollport at `scrollTop`: it does
 * not cover it (windowCoversScrollport), or its edge in a direction that has more content is
 * inside the guard. `viewport` is the host's scrollport now. */
export function captureWindowExhausted(
  window: CaptureWindow,
  scrollTop: number,
  contentHeight: number,
  velocity: number,
  viewport = window.viewport,
) {
  if (!windowCoversScrollport(window, scrollTop, viewport, contentHeight)) return true
  const guard = recentreGuard(viewport, velocity)
  const before = scrollTop - LENS_REACH_POINTS - window.top
  const after = window.bottom - (scrollTop + viewport + LENS_REACH_POINTS)
  // Only the direction of travel needs the lead; at rest both edges keep the small guard.
  const rest = viewport * RECENTRE_GUARD_VIEWPORTS
  const beforeGuard = velocity < 0 ? guard : rest
  const afterGuard = velocity > 0 ? guard : rest
  return (
    (window.top > 0 && before < beforeGuard) ||
    (window.bottom < contentHeight - 1 / 64 && after < afterGuard)
  )
}

/** The capture window of a scrolling plane, or undefined for a capture of the whole content. */
export function planCaptureWindow(request: CaptureWindowRequest): CaptureWindow | undefined {
  const { scrollTop, viewport, contentHeight, resolution, current, grow, velocity } = request
  if (![scrollTop, viewport, contentHeight, resolution, velocity].every(Number.isFinite))
    throw Error('Capture window geometry must be finite')
  if (viewport <= 0 || resolution <= 0) throw Error('Capture window geometry is invalid')
  const largest = grownExtent(request)
  // Overscan cannot turn content above the accelerated limit into a whole-content capture.
  const entryExtent = Math.min(
    largest,
    viewport + 2 * (LENS_REACH_POINTS + viewport * ENTRY_MARGIN_VIEWPORTS),
  )
  // Content that an entry window would hold anyway is captured whole: no window to manage.
  if (contentHeight <= entryExtent) return undefined
  const fitsWhole = contentHeight <= largest
  if (current === 'full') {
    if (fitsWhole) return undefined
  } else if (current) {
    const exhausted = captureWindowExhausted(current, scrollTop, contentHeight, velocity, viewport)
    const grown = current.bottom - current.top >= Math.min(contentHeight, largest) - 1 / 64
    // Kept with its pixels; it records the scrollport it serves now.
    if (!exhausted && (grown || !grow))
      return current.viewport === viewport ? current : { ...current, viewport }
  }
  const place = (extent: number, aheadShare: number) => {
    const spare = extent - viewport
    const desired = scrollTop - spare * (1 - aheadShare)
    const top = texelFloor(Math.max(0, Math.min(contentHeight - extent, desired)), resolution)
    return { top, bottom: top + extent, viewport }
  }
  // A jump while at rest (a scroll-to-top tap, a scripted scroll) is an entry at the new place:
  // the small window is installed soonest, and it grows when the scene is idle again.
  const jumped =
    current !== undefined &&
    current !== 'full' &&
    velocity === 0 &&
    !windowCoversScrollport(current, scrollTop, viewport, contentHeight)
  const first = current === undefined || jumped
  if (first && !grow) return place(texelFloor(entryExtent, resolution), 0.5)
  if (fitsWhole) return undefined
  const ahead = velocity > 0 ? RECENTRE_AHEAD_SHARE : velocity < 0 ? 1 - RECENTRE_AHEAD_SHARE : 0.5
  return place(texelFloor(largest, resolution), ahead)
}
