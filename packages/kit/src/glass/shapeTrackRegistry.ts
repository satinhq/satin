import {
  shapeTrackClock,
  shapeTrackFrame,
  shapeTrackRadius,
  type GlassShapeTrack,
} from './shapeTrack.ts'

/** Page side of shape tracks (shapeTrack.ts): which glass element runs which track. The glass
 * worker never imports this module; it receives tracks in requests and scene snapshots. */
const tracks = new WeakMap<Element, GlassShapeTrack>()

/** The shape track a glass element is running, if any (read by the region bridge). */
export function glassShapeTrack(element: Element) {
  return tracks.get(element)
}

/** The visible aperture, not the canvas envelope, in viewport coordinates. Framework motion
 * uses axis-aligned translation/scale. Layout dimensions undo that ancestor scale exactly once.
 * Callers doing a multi-part handoff pass one timestamp for every sample. */
export function glassAperture(element: HTMLElement, at = shapeTrackClock()) {
  return glassApertureInFrame(element, element.getBoundingClientRect(), at)
}

/** The same aperture in a renderer's resting coordinate plane. */
export function glassApertureInFrame(
  element: HTMLElement,
  box: { x: number; y: number; width: number; height: number },
  at = shapeTrackClock(),
) {
  const style = getComputedStyle(element)
  const radius = parseFloat(style.borderTopLeftRadius) || 0
  const track = tracks.get(element)
  if (!track) return { x: box.x, y: box.y, width: box.width, height: box.height, radius }
  const width = parseFloat(style.width) || element.offsetWidth
  const height = parseFloat(style.height) || element.offsetHeight
  const scaleX = width > 0 ? box.width / width : 1
  const scaleY = height > 0 ? box.height / height : 1
  const frame = shapeTrackFrame(track, at)
  return {
    x: box.x + frame.x * scaleX,
    y: box.y + frame.y * scaleY,
    width: frame.width * scaleX,
    height: frame.height * scaleY,
    radius:
      Math.min(frame.width / 2, frame.height / 2, shapeTrackRadius(track, at, radius)) *
      Math.min(scaleX, scaleY),
  }
}

/**
 * Run (or, with `undefined`, end) a shape track on a glass element. The caller keeps the
 * element's layout at the track's envelope while it runs. The glass worker receives the track
 * straight away, not with the next scene: a scene can wait behind captures for several frames.
 */
export function setGlassShapeTrack(element: Element, track: GlassShapeTrack | undefined) {
  if (track) tracks.set(element, track)
  else tracks.delete(element)
  window.dispatchEvent(new CustomEvent<Element>(GLASS_SHAPE_TRACK_EVENT, { detail: element }))
}

/** Tells the glass regions that an element's shape track changed (the bridge sends it at once). */
export const GLASS_SHAPE_TRACK_EVENT = 'satin-glass-shape-track'
