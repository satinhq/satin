import type { KeyboardBackdrop } from '../webgpu/keyboardBackdrop.ts'
import type { GlassCanvas } from '../rendererContract.ts'
import type { RegionTrack, NavigationPose, NavigationTrack } from '../webgpu/productionTracks.ts'
import { evaluateTrack } from '../webgpu/cadence.ts'
import type { GlassLayer } from '../webgpu/layers.ts'
import type { SurfaceRenderSpec } from '../renderSpecs.ts'
import type { Appearance } from '../lens/theme.ts'

/** Development lift probe, independent of surface role. Zero preserves reference.
 * `optics` selects the shared 11k geometry kernel; production integration is pending. */
export type GlassLift = {
  amount: number
  capsule?: import('../renderSpecs.ts').CapsuleShape
  glyphVibrancy?: readonly [number, number]
  glyphLayout?: 'tabs' | 'content'
  /** Frozen 11k geometry for shared-material development; production presenter pending. */
  optics?: import('../lens/tabMotionFit.ts').TabMotionOptics
  source: 'transmissive' | 'composed'
  /** Lens lighting/field profile; by default a composed non-tab lift is 'button', otherwise 'tab'. */
  profile?: 'tab' | 'button' | 'control'
  glyphAnchors?: readonly [number, number]
  glyphCount?: number
}
export type TriggerValues = {
  context: number[]
  response: number[]
  chroma: number
  regime: number
}
/** One plane of the screen-space backdrop: a content-space capture of a visible scroll
 * container (or a static screen), where its content origin sits in the viewport, its
 * live scroll offset and its viewport clip. Planes compose back to front over the
 * page background; glass samples the composition at its own viewport rectangle. */
export type BackdropLayer = {
  /** A premultiplied alpha overlay sampled only by menus above the dimmed scene. */
  menuOverlay?: boolean
  owner?: string
  id: string
  key: string
  width: number
  height: number
  resolution: number
  origin: { x: number; y: number }
  /** Framework keyboard translation relative to this capture. */
  keyboard?: KeyboardBackdrop
  clip: readonly [number, number, number, number]
  scroll: { x: number; y: number }
  fill: readonly [number, number, number, number]
  /** Edges of a capture window that are not ends of the content (1 top, 2 bottom, 3 both):
   * beyond them there is content that was not captured. The compositor shows the plane's fill
   * there, never the window's edge row stretched. Real content edges use fillEdges instead;
   * a static capture without either policy retains sampler edge extension. */
  openEdges?: number
  /** Real content edges exposing the scrollport background during rubber banding
   * (1 top, 2 bottom). Separate from open capture-window edges used for band clipping. */
  fillEdges?: number
  /** Draw this layer only where its window has pixels (a pinned window lies under it and shows
   * where it has none). */
  band?: boolean
  /** The only content rows the image holds (points from its top), the ones glass sampled when it
   * was captured (captureDemand.ts). Its other rows were never drawn: a surface that samples
   * them is an error, never a picture. */
  rows?: readonly { readonly top: number; readonly bottom: number }[]
  /** This layer scrolls with the layer of that id (a window pinned at the top of its list). */
  follows?: string
}
export type RasterSetup = {
  /** Immutable capture identity shared across layers; reuse only for identical pixels. */
  sourceWidth?: number
  sourceOrigin?: { x: number; y: number }
  sourceKey?: string
  /** Live scroller offset paired with this capture, applied before its first presentation. */
  sourceScrollY?: number
  /** Backdrop plane that navigation motion (pose, route atlas) applies to. */
  contentLayer?: string
  /** Viewport position of this surface's layer origin (a region presenter's canvas). */
  viewportOrigin?: { x: number; y: number }
  glyphKey?: string
  navigationAtlas?: number
  /** Actual viewport rows held by each navigation atlas cell. */
  navigationCoverage?: {
    width: number
    height: number
    rows: readonly { top: number; bottom: number }[]
  }
  trigger?: TriggerValues
  lift?: GlassLift
  /** Above DOM ink; exactly transparent at zero lift. */
  liftOverlay?: boolean
  appearance: Appearance
  spec: SurfaceRenderSpec
  width: number
  height: number
  resolution: number
}
export type MotionPlan = {
  epoch: number
  duration: number
  from: number
  to: number
  sourceRevision?: number
  samples?: readonly number[]
  mode: 'sampled' | 'timeline'
}
export function poseAt(plan: MotionPlan, epoch: number) {
  return evaluateTrack(plan, epoch)
}
export type FrameSample = {
  /** Milliseconds the frame's timer fired after it was due. */
  late?: number
  /** A present driven by a message (a region scene or source applied outside the frame loop). */
  message?: string
  at: number
  interval: number | null
  cpuMs: number
  x: number
  expectedX: number
  errorPx: number
  inputAgeMs: number
  draws: number
  uploads: number
  copies: number
  /** First frame after an idle loop: its interval includes idle time. */
  restart?: boolean
  /** How long after its animation frame's time the loop callback ran (the frame is posed at
   * the frame's time, so this is how far the old callback-time poses were off the page's). */
  callbackDelayMs?: number
}
/** Without `image` the slot takes an image the renderer still keeps under `key` (see `keep`). */
export type SharedSourceImage = { slot: string; key: string; image?: ImageBitmap }
/** The root transmitted backdrop for app glass regions, taken from a shared slot key. */
export type SharedBackdrop =
  | { regions: false }
  | {
      regions: true
      key: string
      revision: number
      appearance: Appearance
      reducedMotion: boolean
      resolution: number
    }
export type Request =
  | { type: 'appearance-begin'; revision: number }
  | { type: 'appearance-commit'; revision: number }
  | { type: 'content-begin'; revision: number }
  | { type: 'content-commit'; revision: number }
  | { type: 'lens-debug'; view: import('../webgpu/lensDebug.ts').LensDebugView }
  | { type: 'navigation-track'; key: string; track: NavigationTrack }
  | {
      type: 'canonical'
      request: import('../rendererContract.ts').GlassRendererRequest
      appearanceRevision?: number
    }
  /** Navigation route atlas composed on the GPU: resident plane captures are copied into their
   * cells (device pixels), routes without a resident capture arrive as cell images. The atlas is
   * installed in the `navigation` slot under `key`. */
  | {
      type: 'navigation-atlas'
      revision: number
      key: string
      width: number
      height: number
      background: readonly [number, number, number, number]
      cells: readonly (
        | { plane: string; dx: number; dy: number; sx: number; sy: number; w: number; h: number }
        | { image: ImageBitmap; dx: number; dy: number }
        | { canvas: GlassCanvas; dx: number; dy: number }
      )[]
    }
  /** App glass regions over the navigating column compose the installed `navigation` atlas (under
   * `key`, `routes` route cells, viewport `width`x`height`) in place of their settled content plane
   * `contentLayer`, following the navigation pose, until the next settled backdrop. */
  | {
      type: 'navigation-regions'
      /** Draw the paused entrance pose before acknowledging this source. */
      prepare?: boolean
      rows?: readonly { top: number; bottom: number }[]
      key: string
      routes: number
      contentLayer: string
      width: number
      height: number
    }
  | { type: 'navigation-pose'; key: string; at: number; pose: NavigationPose }
  | {
      type: 'surface-input'
      id: string
      phase: 'pressed' | 'dragging' | 'releasing' | 'rest'
      at: number
      x?: number
    }
  | {
      type: 'tab-config'
      centerY?: number
      centres?: readonly number[]
      width?: number
      /** Per-tab resting pill widths (label-sized iPad top bar). */
      widths?: readonly number[]
      height?: number
      dockWidth: number
      placement?: 'bottom' | 'top'
      selected: number
      sharedLift?: boolean
      reducedMotion?: boolean
    }
  | {
      type: 'tab-input'
      event: 'down' | 'move' | 'up' | 'select' | 'reset'
      x: number
      index: number
      at: number
      cancelled?: boolean
    }
  | { type: 'region-track'; track: RegionTrack }
  | { type: 'region-spec'; id: string; spec: SurfaceRenderSpec }
  /** `sequence` numbers the page's scroll events while a lag trace is on (absent otherwise). */
  | {
      type: 'source-scroll'
      y: number
      trigger?: TriggerValues
      layer?: string
      x?: number
      sequence?: number
    }
  /** Diagnostics: start or stop the worker's lag trace (lagTrace.ts). */
  | { type: 'lag-trace'; enabled: boolean }
  | { type: 'backdrop-scroll'; id: string; x: number; y: number }
  | {
      type: 'backdrop-keyboard'
      layers: readonly {
        id: string
        key: string
        keyboard: KeyboardBackdrop
        scroll: { x: number; y: number }
      }[]
    }
  /** Navigation-bar scroll edges (CSS material the canvas cannot sample), in viewport space. */
  | {
      type: 'backdrop-edges'
      edges: readonly import('../webgpu/scrollEdgeBackdrop.ts').ScrollEdge[]
    }
  | { type: 'capability' }
  | {
      type: 'init'
      canvas: GlassCanvas
      resolution: number
      appearance: Appearance
      /** Opt-in measured lead experiment. Zero preserves the current sampling clock. */
      presentationLeadMs?: number
    }
  /** Shared capture images, transferred once per content revision. Each slot keeps
   * its latest image; `source`/`layer-source` setups reference them by key. */
  | {
      type: 'source-images'
      revision: number
      images: SharedSourceImage[]
      release?: readonly string[]
      /** Plane IDs whose pinned layers must stop sampling immediately. */
      removePinned?: readonly string[]
      /** Image keys to keep alive after their slot takes another image, so a later batch can
       * install them again by key alone (KeptGlyphs: chrome glyph ink). */
      keep?: readonly string[]
      /** Kept keys to let go. */
      unkeep?: readonly string[]
      backdrop?: SharedBackdrop
      layers?: readonly BackdropLayer[]
      /** With `layers`: glass regions of tabs that are not selected. They are held on their own
       * backdrop before the new plane set replaces it (RegionScene.holdForBackdropChange). */
      suspendedRegions?: readonly string[]
      edges?: readonly import('../webgpu/scrollEdgeBackdrop.ts').ScrollEdge[]
      /** Plane image keys to keep resident (image and uploaded texture) after they leave the plane set. */
      retain?: readonly string[]
      /** Retained keys returning to the plane set: their image and texture move into `slot`. */
      restore?: readonly { slot: string; key: string }[]
      /** Retained keys to drop (evicted from the budget). */
      unretain?: readonly string[]
    }
  /** Without bitmaps, `setup.sourceKey`/`glyphKey` resolve against the shared slots. */
  /** `settle:false` skips the per-install GPU fence and present; the batch's last install settles and presents once. */
  | {
      type: 'source'
      revision?: number
      settle?: boolean
      setup: RasterSetup
      front?: ImageBitmap
      rear?: ImageBitmap
      glyphs?: ImageBitmap
      sentAt: number
    }
  | { type: 'run'; plan: MotionPlan }
  | { type: 'pose'; x: number; at: number }
  | { type: 'cover-layer'; layerId: string; covered: boolean }
  | { type: 'detach-layer'; layerId: string; regionId?: string }
  | { type: 'attach-layer'; layer: GlassLayer; canvas: GlassCanvas }
  /** The layer's canvas covers only `viewport` ([x,y,w,h] layer CSS px); absent = the whole layer. */
  | {
      type: 'layer-viewport'
      layerId: string
      viewport?: readonly [number, number, number, number]
    }
  | {
      type: 'layer-source'
      revision?: number
      settle?: boolean
      layerId: string
      regionId?: string
      setup: RasterSetup
      front?: ImageBitmap
      rear?: ImageBitmap
      glyphs?: ImageBitmap
    }
  | { type: 'page-frame'; token: number; at: number }
  | { type: 'benchmark' }
  | {
      type: 'stage'
      stage: 'source' | 'pyramid' | 'material' | 'composed' | 'vertical'
      level: number
    }
  | { type: 'snapshot'; x?: number; layerId?: string }
  | { type: 'report' }
  | { type: 'visible'; visible: boolean; appearance?: Appearance; reducedMotion?: boolean }
  | { type: 'retry-adapter' }
  | { type: 'adapter-visibility'; visible: boolean }
  | { type: 'force-null-adapters'; attempts: number }
  | { type: 'lose-context' }
  | { type: 'restore-context' }
export type Envelope = { id: number; request: Request; postedAt?: number }
/** WebGPU has no default material appearance, including replacement workers. */
export type WebGPURequest =
  | Exclude<Request, { type: 'init' }>
  | (Extract<Request, { type: 'init' }> & { appearance: 'light' | 'dark' })
export type WebGPUEnvelope = { id: number; request: WebGPURequest; postedAt?: number }
export const epochNow = () => performance.timeOrigin + performance.now()
