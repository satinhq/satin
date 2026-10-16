import { planCaptureWindow, windowCoversScrollport, type CaptureWindow } from '../captureWindow.ts'
import type { Appearance } from '../lens/theme.ts'
import type { BackdropLayer } from '../worker/protocol.ts'

/** A second capture of a long list: its top, kept while the list's own capture window is
 * somewhere further down.
 *
 * A jump to the top is the one jump the framework knows the destination of in advance: the
 * status bar tap, a tab selected again, `scrollToTop`. With only the list's own window the first
 * frames at the top had nothing to sample until a capture of the top was read back (90 to 190 ms
 * in the Catalyst host). The pinned window is installed under the list's window (Backdrop.under),
 * so glass at the top shows the list's real rows from the first frame of the arrival.
 *
 * It costs one entry-size capture per long list that is scrolled away from its top (about 24 MB
 * of bytes and as much texture on a phone). It is made from the rows the list's window is giving
 * up when it first leaves the top (no capture at all), or from the page by an idle preparation.
 * It does not cover the way to the top: a smooth scroll over more than the list's window passes
 * content neither capture holds, and there the plane's fill is shown. */
export type PinnedTop = {
  /** The renderer's image key (its slot is `plane:<id>:top`). */
  key: string
  window: CaptureWindow
  /** The plane's width in points, and what it was captured at. */
  width: number
  resolution: number
  appearance: Appearance
  text: string
  /** The page changed inside the plane since this was captured. */
  stale: boolean
}

/** The window pinned at the top of a list: what an entry at its top captures. */
export function pinnedTopWindow(viewport: number, contentHeight: number, resolution: number) {
  const window = planCaptureWindow({
    scrollTop: 0,
    viewport,
    contentHeight,
    resolution,
    grow: false,
    velocity: 0,
  })
  // Content an entry would capture whole has no window, and such a plane is never pinned.
  return window ?? { top: 0, bottom: contentHeight, viewport }
}

/** Whether glass over a scrollport at `scrollTop` can take everything it samples from the pinned
 * window. A stale one does not count: its rows may no longer be the list's. */
export function pinnedTopCovers(
  pinned: PinnedTop | undefined,
  scrollTop: number,
  viewport: number,
  contentHeight: number,
) {
  return (
    !!pinned &&
    !pinned.stale &&
    windowCoversScrollport(pinned.window, scrollTop, viewport, contentHeight)
  )
}

export type PinnedTopInput = {
  /** The plane's own window in this revision (undefined: its whole content is captured). */
  window: CaptureWindow | undefined
  viewport: number
  contentHeight: number
  resolution: number
  width: number
  appearance: Appearance
  text: string
  existing: PinnedTop | undefined
  /** The capture this revision replaces, when the plane is captured anew. */
  outgoing:
    | {
        window: CaptureWindow | undefined
        width: number
        resolution: number
        appearance: Appearance
        text: string
        /** The page changed inside the plane since it was captured. */
        damaged: boolean
        /** Its bytes are still held on the page (a capture read back in this document). */
        hasBytes: boolean
      }
    | undefined
  /** This preparation may capture from the page: the scene is idle, or a jump to the top asked. */
  mayCapture: boolean
}

export type PinnedTopPlan =
  | { action: 'none' }
  | { action: 'keep' }
  | { action: 'release' }
  | { action: 'crop'; window: CaptureWindow; stale: boolean }
  | { action: 'capture'; window: CaptureWindow }

/** What to do about a plane's pinned top in one source revision. */
export function planPinnedTop(input: PinnedTopInput): PinnedTopPlan {
  const { window, existing, outgoing, mayCapture } = input
  const { viewport, contentHeight, resolution, width, appearance, text } = input
  // The list's own window holds the top (or the list is captured whole): nothing to pin.
  if (!window || window.top <= 0) return existing ? { action: 'release' } : { action: 'none' }
  const wanted = pinnedTopWindow(viewport, contentHeight, resolution)
  const matches = (capture: {
    width: number
    resolution: number
    appearance: Appearance
    text: string
  }) =>
    capture.width === width &&
    capture.resolution === resolution &&
    capture.appearance === appearance &&
    capture.text === text
  const current = existing && matches(existing) && existing.window.bottom >= wanted.bottom - 1 / 64
  if (existing && existing.window.bottom > contentHeight + 1 / 64)
    return mayCapture ? { action: 'capture', window: wanted } : { action: 'release' }
  if (current && !(existing.stale && mayCapture)) return { action: 'keep' }
  if (mayCapture) return { action: 'capture', window: wanted }
  if (existing && matches(existing) && pinnedTopCovers(existing, 0, viewport, contentHeight))
    return { action: 'keep' }
  // The rows the list's window is giving up, when they are the list's top.
  const fromOutgoing =
    !current &&
    outgoing &&
    outgoing.hasBytes &&
    matches(outgoing) &&
    outgoing.window !== undefined &&
    outgoing.window.top <= 0 &&
    outgoing.window.bottom >= wanted.bottom - 1 / 64
  if (fromOutgoing) return { action: 'crop', window: wanted, stale: outgoing.damaged }
  return existing ? { action: 'release' } : { action: 'none' }
}

/** The first `rows` rows of a capture's bytes, copied (`width` in pixels, four bytes each). */
export function cropTopRows(bytes: Uint8Array | Uint8ClampedArray, width: number, rows: number) {
  return bytes.slice(0, width * 4 * rows)
}

/** The backdrop layer of a pinned top: under its plane's own layer, scrolling with it. Its lower
 * edge is open (the list goes on) unless it reaches the end of the content. */
export function pinnedTopLayer(
  plane: BackdropLayer,
  pinned: PinnedTop,
  planeWindowTop: number,
  contentHeight: number,
): BackdropLayer {
  return {
    owner: plane.owner,
    id: `${plane.id}:top`,
    follows: plane.id,
    key: `${pinned.key}:front`,
    width: plane.width,
    height: pinned.window.bottom,
    resolution: pinned.resolution,
    origin: { x: plane.origin.x, y: plane.origin.y - planeWindowTop },
    clip: plane.clip,
    scroll: plane.scroll,
    fill: plane.fill,
    ...(plane.fillEdges ? { fillEdges: plane.fillEdges } : {}),
    openEdges: pinned.window.bottom < contentHeight - 1 / 64 ? 2 : 0,
  }
}
