import { sampleKeyboardTranslation } from '../../keyboard/translation.ts'
import type { KeyboardBackdrop } from './keyboardBackdrop.ts'
import { FrameGraph, type GraphLease } from './frameGraph.ts'
import type { LayerDevice } from './layers.ts'
import type { Target } from './passes.ts'
import type { BackdropLayer } from '../worker/protocol.ts'
import type { ScrollEdge } from './scrollEdgeBackdrop.ts'
import { poseScrollEdges } from './scrollEdgePose.ts'
import type { NavigationPose } from './productionTracks.ts'

type Rect = readonly [number, number, number, number]
type Plane = {
  originY: number
  layer: BackdropLayer
  image: GraphLease<ImageBitmap>
  texture?: GraphLease<Target>
}
const backdrops = new WeakMap<LayerDevice, Backdrop>()

/** Intersection of two viewport rectangles, or undefined when they do not overlap. */
export function intersect(a: Rect, b: Rect): Rect | undefined {
  const x = Math.max(a[0], b[0]),
    y = Math.max(a[1], b[1]),
    r = Math.min(a[0] + a[2], b[0] + b[2]),
    bottom = Math.min(a[1] + a[3], b[1] + b[3])
  return r > x && bottom > y ? [x, y, r - x, bottom - y] : undefined
}

/** The screen-space backdrop every glass surface samples: planes (content-space
 * captures of visible scroll containers and static screens) composed back to front
 * over the page background, each at its live scroll offset and clipped to its
 * viewport rectangle. Only the rectangles under glass are ever composed. */
export class Backdrop {
  static for(owner: LayerDevice) {
    let backdrop = backdrops.get(owner)
    if (!backdrop) {
      backdrop = new Backdrop(owner)
      backdrops.set(owner, backdrop)
    }
    return backdrop
  }
  private planes: Plane[] = []
  /** Navigation-bar scroll edges, composed over the planes under the bars. */
  private edges: readonly ScrollEdge[] = []
  private graph: FrameGraph
  private constructor(owner: LayerDevice) {
    this.graph = FrameGraph.for(owner)
    // A lost device invalidates every texture; planes re-upload from their retained images.
    owner.subscribe(device => {
      if (!device) for (const plane of this.planes) plane.texture = undefined
    })
  }
  get layers(): readonly BackdropLayer[] {
    return this.planes.map(plane => plane.layer)
  }
  get size() {
    return this.planes.length
  }
  /** A screen backdrop was installed (possibly empty: the page background alone). Surfaces
   * then compose from it; before that they sample their own single capture. */
  get installed() {
    return this.isInstalled
  }
  private isInstalled = false
  /** Replace the plane set. New images are retained before old ones are released, so a
   * plane whose key survives keeps its upload. Every key must already be retained
   * in the frame graph (a shared slot image); a missing one throws. */
  setLayers(layers: readonly BackdropLayer[]) {
    const previous = this.planes
    this.isInstalled = true
    this.planes = layers.map(layer => {
      const kept = previous.find(plane => plane.layer.key === layer.key)
      return {
        originY: layer.origin.y,
        layer,
        image: this.graph.retain(layer.key),
        texture: kept?.texture
          ? this.graph.target(
              'front',
              kept.texture.value.width,
              kept.texture.value.height,
              false,
              layer.key,
            )
          : undefined,
      }
    })
    this.sampleKeyboard(performance.timeOrigin + performance.now())
    for (const plane of previous) {
      plane.texture?.release()
      plane.image.release()
    }
  }
  /** Detach invalid or disposed pinned textures and restore the parent window's fill. */
  removePinned(ids: readonly string[]) {
    const removed = new Set(ids)
    this.setLayers(
      this.planes
        .map(({ layer, originY }) => ({ ...layer, origin: { ...layer.origin, y: originY } }))
        .filter(layer => !layer.follows || !removed.has(layer.follows))
        .map(layer => {
          if (!removed.has(layer.id)) return layer
          const { band: _band, ...rest } = layer
          return rest
        }),
    )
  }
  /** Live scroll of one plane; false when unchanged or unknown. */
  setScroll(id: string, x: number, y: number) {
    let changed = false
    // A window pinned at the top of a list scrolls with the list's own window.
    for (const plane of this.planes) {
      if (plane.layer.id !== id && plane.layer.follows !== id) continue
      if (plane.layer.scroll.x === x && plane.layer.scroll.y === y) continue
      plane.layer = { ...plane.layer, scroll: { x, y } }
      changed = true
    }
    return changed
  }
  /** Only the capture that supplied the anchor may consume its trajectory. */
  setKeyboard(
    id: string,
    key: string,
    keyboard: KeyboardBackdrop,
    scroll: { x: number; y: number },
  ) {
    if (!this.planes.some(({ layer }) => layer.id === id && layer.key === key)) return
    if (keyboard.motion)
      this.keyboardSampledAt = Math.min(this.keyboardSampledAt, keyboard.motion.epoch - 1)
    for (const plane of this.planes) {
      if (plane.layer.id !== id && plane.layer.follows !== id) continue
      // Pinned windows share their parent's content origin and keyboard displacement.
      plane.layer = { ...plane.layer, keyboard, scroll }
    }
  }
  private keyboardSampledAt = -Infinity
  get keyboardMoving() {
    return this.planes.some(
      ({ layer }) => layer.keyboard?.motion && this.keyboardSampledAt < layer.keyboard.motion.end,
    )
  }
  /** Pose captured content before refraction, on the same clock as the lens. */
  sampleKeyboard(at: number) {
    this.keyboardSampledAt = at
    let changed = false
    for (const plane of this.planes) {
      const keyboard = plane.layer.keyboard
      const offset = keyboard?.motion
        ? sampleKeyboardTranslation(keyboard.motion, at)
        : (keyboard?.offsetY ?? 0)
      const y = plane.originY + offset
      if (plane.layer.origin.y === y) continue
      plane.layer = { ...plane.layer, origin: { ...plane.layer.origin, y } }
      changed = true
    }
    return changed
  }
  /** Replace the scroll-edge set; false when unchanged. */
  setEdges(edges: readonly ScrollEdge[]) {
    const next = JSON.stringify(edges)
    if (next === JSON.stringify(this.edges)) return false
    this.edges = edges
    return true
  }
  /** Scroll edges that overlap a viewport rectangle. */
  edgesUnder(rect: Rect, pose?: NavigationPose) {
    return poseScrollEdges(this.edges, pose).filter(edge => !!intersect(rect, edge.rect))
  }
  /** Drop GPU storage (hidden page); images stay retained for the resume upload. */
  suspend() {
    for (const plane of this.planes) {
      plane.texture?.release()
      plane.texture = undefined
    }
  }
  clear() {
    for (const plane of this.planes) {
      plane.texture?.release()
      plane.image.release()
    }
    this.planes = []
    this.isInstalled = false
  }
  /** Planes that contribute to a viewport rectangle, back to front, with their clipped rectangle. */
  under(rect: Rect, excluded: readonly string[] = [], menu = false) {
    return this.planes.flatMap(plane => {
      const layer = plane.layer
      if (layer.menuOverlay && !menu) return []
      if (layer.owner && excluded.includes(layer.owner)) return []
      let clip = intersect(rect, layer.clip)
      const bottom = layer.keyboard?.clipBottom
      if (clip && bottom !== undefined)
        clip = intersect(clip, [clip[0], clip[1], clip[2], Math.max(0, bottom - clip[1])])
      // A banded window is drawn only where it has pixels: beyond its open edges the window
      // pinned under it shows (and that one's fill beyond its own).
      if (clip && layer.band) {
        const top = layer.origin.y - layer.scroll.y
        const open = layer.openEdges ?? 0
        const from = open & 1 ? top : -Infinity
        const to = open & 2 ? top + layer.height : Infinity
        const y = Math.max(clip[1], from)
        const bottom = Math.min(clip[1] + clip[3], to)
        clip = bottom > y ? [clip[0], y, clip[2], bottom - y] : undefined
      }
      return clip ? [{ plane, clip }] : []
    })
  }
  /** Everything that decides the composed pixels of `rect`, relative to `rect`: a surface
   * that moves with its plane (scroll-attached glass) keeps the same key while scrolling. */
  keyFor(
    rect: Rect,
    skip?: string,
    excluded: readonly string[] = [],
    belowEdges = false,
    menu = false,
    pose?: NavigationPose,
  ) {
    // Edges are fixed to the bars: their position relative to the surface decides the pixels.
    // A surface below the edge layer does not have the edges in its backdrop at all.
    const edges = (belowEdges ? [] : this.edgesUnder(rect, pose)).map(e => [
      e.rect[0] - rect[0],
      e.rect[1] - rect[1],
      e.rect[2],
      e.rect[3],
      e.solid - rect[1],
      e.mask?.map(([y, alpha]) => [y - rect[1], alpha]),
      e.sigma,
      e.tint,
      e.strength,
      e.cap ? [e.cap.color, e.cap.solid - rect[1], e.cap.end - rect[1]] : null,
    ])
    return JSON.stringify([
      edges,
      this.under(rect, excluded, menu).map(({ plane: { layer }, clip }) =>
        layer.id === skip
          ? [layer.id, clip[0] - rect[0], clip[1] - rect[1], clip[2], clip[3], layer.fillEdges ?? 0]
          : [
              layer.key,
              layer.origin.x - layer.scroll.x - rect[0],
              layer.origin.y - layer.scroll.y - rect[1],
              clip[0] - rect[0],
              clip[1] - rect[1],
              clip[2],
              clip[3],
              layer.fill,
              layer.menuOverlay ?? false,
              layer.openEdges ?? 0,
              layer.fillEdges ?? 0,
            ],
      ),
    ])
  }
  /** GPU texture for a plane's capture (shared with any raster using the same key). */
  texture(plane: Plane) {
    if (!plane.texture) {
      const image = plane.image.value
      plane.texture = this.graph.target('front', image.width, image.height, false, plane.layer.key)
    }
    this.graph.upload(plane.image.value, plane.texture.value)
    return plane.texture.value
  }
  report() {
    return this.planes.map(({ layer, texture }) => ({
      id: layer.id,
      owner: layer.owner,
      resolution: layer.resolution,
      key: layer.key,
      origin: layer.origin,
      clip: layer.clip,
      scroll: layer.scroll,
      size: [layer.width, layer.height],
      uploaded: !!texture,
    }))
  }
}
