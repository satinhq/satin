import type { AccessoryTrack, AccessoryViewportTrack } from './webgpu/accessoryTrack.ts'
import type { GlassShapeTrack } from './shapeTrack.ts'
/** Serializable renderer contract. No DOM, Pixi, or GPU handles cross this boundary. */
export type GlassLayer = Readonly<{
  id: string
  /** Ordered within the host stacking context. DOM placement remains authoritative. */
  depth: number
  attachment: Readonly<{ kind: 'fixed' }> | Readonly<{ kind: 'scroll'; scrollId: string }>
}>
export type GlassScrollSnapshot = Readonly<{
  id: string
  offsetX: number
  offsetY: number
  viewportX: number
  viewportY: number
  width: number
  height: number
}>
/** Each layer can own multiple presenters. WebGPU shares one device across canvases. */
export type GlassSceneSnapshot = Readonly<{
  revision: number
  /** Source-images revision whose capture demand this scene was measured against. */
  sourceRevision?: number
  /** Top-layer dialog owners, back to front, when region exclusions were measured. */
  backdropOwners?: readonly string[]
  layers: readonly GlassLayer[]
  scrolls: readonly GlassScrollSnapshot[]
  regions: readonly GlassRegion[]
}>

export type GlassShape =
  | 'capsule'
  | 'circle'
  | Readonly<{
      kind: 'roundedRectangle'
      cornerRadius: number
      /** @internal Concentric sheet bottom edge; independent of the floating top corners. */
      bottomCornerRadius?: number
      cornerStyle?: 'continuous' | 'circular'
    }>
type GlassRect = Readonly<{ x: number; y: number; width: number; height: number }>
/** A glass tint as red, green, blue and alpha channels from 0 to 1. `Glass.tintRGBA` rejects
 * values outside that range. */
export type GlassTint = readonly [red: number, green: number, blue: number, alpha: number]
export type GlassMaterial = Readonly<{
  variant: 'regular' | 'clear'
  tint?: GlassTint
  interactive: boolean
  /** @internal Kind of interactive glass (GLASS_CONTACT_PHYSICS): content buttons press as
   * buttons, toolbar and navigation-bar buttons as bar buttons, a menu's trigger as a menu
   * trigger; app glassEffect surfaces default to the surface response. */
  press?: 'button' | 'bar' | 'menu'
  /** @internal Interactive glass hosting one text editor: it presses with the field row of
   * GLASS_CONTACT_PHYSICS (a native field grows twice a card's growth). */
  field?: true
  /** @internal Contact light without press growth or foreground feedback. */
  touchLight?: boolean
  /** @internal The held thumb lens of a Toggle or Slider (CONTROL_LIFT): hidden at rest, it
   * lifts at the page's activation and follows the contact's lens centre. */
  control?: 'toggle' | 'slider'
  /** @internal A bar-glass surface with its own parameter row: the search drawer's field
   * (SEARCH_FIELD_RECIPE), a more transparent glass than bar buttons. */
  recipe?: 'searchField'
  treatment?:
    | 'sheet'
    | 'expandedSheet'
    | 'alert'
    | 'confirmation'
    | 'contextBackdrop'
    | 'contextPreview'
    | 'contextMenu'
}>
/* @internal A popover arrow's height in points (native reference reference); its base is 32 pt. */
/** What a menu morphs out of, other than a glass button: a plain text label (a menu-style
 * Picker's value), a plain glyph (an icon-only button with no glass), or a context source. */
export type MenuSourceKind = 'label' | 'glyph' | 'context'
/** A plain source has no glass at rest: its glass is held transparent until the menu is ready
 * and fades out with the close, since there is no glass button to hand back to. */
export function isPlainMenuSource(kind: MenuSourceKind | undefined) {
  return kind === 'label' || kind === 'glyph'
}

export const POPOVER_ARROW_HEIGHT = 14
/** @internal Tip x in measured frame points; scale is the frame's presentation scale. */
export type PopoverArrow = Readonly<{ edge: 'top' | 'bottom'; x: number; scale: number }>
export type GlassRegion = Readonly<{
  id: string
  namespace?: string
  union?: string
  transition?: 'matchedGeometry' | 'materialize' | 'identity'
  layer: GlassLayer
  /** @internal Top-layer owners painted at or above this material. */
  backdropExclusions?: readonly string[]
  /** @internal During zoom, in-content glass samples this route in its resting coordinates. */
  zoomRoute?: number
  /** Fixed: viewport coordinates. Scroll: coordinates in the named scroll content. */
  frame: Readonly<{ x: number; y: number; width: number; height: number }>
  shape: GlassShape
  /** @internal Native sheet material animation, independent of detent geometry. */
  sheetOpaqueMix?: number
  /** @internal A confirmation popover's arrow: its edge, tip x and presentation scale. */
  popoverArrow?: PopoverArrow
  /** @internal A segmented selection drawn inside the region (the search scope bar's thumb):
   * the selected segment of `count` equal segments. The renderer moves the thumb
   * (webgpu/selectionThumb.ts); the page sends its finger as interactions. */
  selection?: Readonly<{ index: number; count: number }>
  material: GlassMaterial
  /** @internal Sampling follows the compositor even when ink stays in the document. */
  accessoryViewportTrack?: AccessoryViewportTrack
  /** @internal Rigid sheet motion; nested glass remains in the parent resting frame. */
  presentationViewportTrack?: AccessoryViewportTrack
  /** @internal Submit nested sheet pixels for this admitted show before content is revealed. */
  presentationContentEpoch?: number
  /** @internal Experimental retained accessory aperture and ink. */
  accessoryTrack?: AccessoryTrack
  /** @internal The glass changes size inside a still `frame` (shapeTrack.ts). */
  shapeTrack?: GlassShapeTrack
  /** @internal Everywhere a held-still accessory canvas carries its glass (accessoryMorph.ts).
   * Its presenter covers this as well as `frame`, at rest too. */
  accessoryReach?: Readonly<{ x: number; y: number; width: number; height: number }>
  container?: Readonly<{ id: string; spacing: number; continuous?: boolean }>
  morph?: Readonly<{ namespace: string; id: string }>
  /** @internal A fixed-layer region that emerges from (and on `closing` returns into) a trigger
   * rectangle in viewport points: a glass Menu from its glass button (GLASS_MENU_MORPH). */
  emerge?: Readonly<{
    from: Readonly<{ x: number; y: number; width: number; height: number; radius: number }>
    /** Released source endpoint; the open begins at the pressed aperture. */
    returnTo?: Readonly<{ x: number; y: number; width: number; height: number; radius: number }>
    sourceRegionId?: string
    /** Page-owned pose used by the asynchronous trigger atlas capture. */
    sourceSnapshot?: number
    /** The trigger's material: a glass button when absent. A plain source (`label`, `glyph`)
     * draws no glass at rest: a text label emits one transient drop; a plain glyph swells into
     * a glass bubble that becomes the drop, as a glass button's does. */
    sourceKind?: MenuSourceKind
    /** A context menu on content (not a row) opens on the native content spring. */
    content?: boolean
    /** Context preview and glass share this epoch across main/worker preparation. */
    recognitionEpoch?: number
    /** Centre of the menu's own button (viewport points) when the trigger glass is wider than it:
     * a member of a toolbar group. The drop forms there; the trigger's centre when absent. */
    anchor?: Readonly<{ x: number; y: number }>
    closing?: boolean
    /** Keep the last presented morph geometry and ink while its owner fades out. */
    fading?: boolean
    /** Identifies one open/close transition: a settle report names the transition it ends. */
    generation?: number
    /** Prewarm the trigger shape without consuming the visible emerge timeline. */
    ready?: boolean
    /** Ink drawn inside the morphing glass: regions of the region's foreground atlas (points)
     * and the viewport rectangles they settle at (the menu's rows, the trigger's glyph). */
    ink?: Readonly<{
      atlas: Readonly<{ width: number; height: number }>
      rows?: Readonly<{ source: GlassRect; frame: GlassRect }>
      glyph?: Readonly<{ source: GlassRect; frame: GlassRect }>
    }>
    /** The page shows its live rows (after `open-settled`); the glass stops drawing them. */
    inkDom?: boolean
    /** Which recorded menu morph applies (lens/menuMorphMotion.ts); iPad when absent. */
    idiom?: 'phone' | 'pad'
  }>
  /** @internal The region's presenter is held: it keeps the pixels it last drew and is not
   * redrawn for backdrop changes. Set while the region sits in an inactive tab (a backdrop
   * scrolling under an invisible region costs no frame work), and after its tab is selected again
   * until that tab's own backdrop is installed (the previous tab's backdrop is never drawn into
   * it). A change of the region's own inputs (appearance, geometry, ink) still repaints it. */
  suspended?: boolean
  /** @internal Glass inside an open menu's panel other than the menu's own (a submenu platter).
   * It sits on the menu's plane, so it samples the menu's dim as the menu does. */
  inMenuPanel?: boolean
}>

/** The smallest frame holding both. A held-still canvas covers every place its glass passes. */
export function frameUnion(a: GlassRegion['frame'], b: GlassRegion['frame']): GlassRegion['frame'] {
  const x = Math.min(a.x, b.x),
    y = Math.min(a.y, b.y)
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  }
}

/** Presenter bounds of a region: its frame (and any emerge source) plus the sample inset. */
export function glassPresenterBounds(
  frame: GlassRegion['frame'],
  inset: number,
  emerge?: GlassRegion['emerge'],
) {
  const from = emerge?.from
  const x0 = Math.min(frame.x, from?.x ?? frame.x),
    y0 = Math.min(frame.y, from?.y ?? frame.y)
  const x1 = Math.max(frame.x + frame.width, from ? from.x + from.width : -Infinity),
    y1 = Math.max(frame.y + frame.height, from ? from.y + from.height : -Infinity)
  return { x: x0 - inset, y: y0 - inset, width: x1 - x0 + 2 * inset, height: y1 - y0 + 2 * inset }
}
/** Provisional allocation guard, not a measured device performance promise.
 * Two 440×894 sheets at 3× with 20pt sample margins need 8,069,760 pixels.
 * The 12M guard permits that stack plus chrome; it is not a memory benchmark. */
export const GLASS_REGION_LIMIT = 16
export const GLASS_REGION_PIXEL_LIMIT = 12_000_000

/** Immutable glass material values. RGBA channels use the range 0...1. */
export class Glass {
  static readonly regular = new Glass('regular')
  static readonly clear = new Glass('clear')
  /** Calibrated iOS 27 presentation body treatments; shared renderer owns their response. */
  static readonly sheet = new Glass('clear', undefined, false, 'sheet')
  static readonly alert = new Glass('regular', undefined, false, 'alert')
  static readonly confirmation = new Glass('regular', undefined, false, 'confirmation')
  static readonly expandedSheet = new Glass('clear', undefined, false, 'expandedSheet')
  /** @internal Non-lensing context isolation, implemented by the shared WebGPU renderer. */
  static readonly contextBackdrop = new Glass('clear', undefined, false, 'contextBackdrop')
  static readonly contextMenu = new Glass('regular', undefined, false, 'contextMenu')
  static readonly contextPreview = new Glass('clear', undefined, false, 'contextPreview')
  readonly variant: 'regular' | 'clear'
  private readonly colour?: GlassTint
  private readonly responds: boolean
  private readonly treatment?:
    | 'sheet'
    | 'expandedSheet'
    | 'alert'
    | 'confirmation'
    | 'contextBackdrop'
    | 'contextPreview'
    | 'contextMenu'
  private constructor(
    variant: 'regular' | 'clear',
    colour?: GlassTint,
    responds = false,
    treatment?:
      | 'sheet'
      | 'expandedSheet'
      | 'alert'
      | 'confirmation'
      | 'contextBackdrop'
      | 'contextPreview'
      | 'contextMenu',
  ) {
    this.treatment = treatment
    this.variant = variant
    this.colour = colour
    this.responds = responds
    Object.freeze(this)
  }
  tint(colour?: GlassTint): Glass {
    if (
      colour &&
      (colour.length !== 4 ||
        !colour.every(value => Number.isFinite(value) && value >= 0 && value <= 1))
    )
      throw new Error('Glass.tint requires four finite RGBA channels in 0...1.')
    return new Glass(
      this.variant,
      colour && (Object.freeze([...colour]) as GlassTint),
      this.responds,
      this.treatment,
    )
  }
  interactive(enabled = true): Glass {
    return new Glass(this.variant, this.colour, enabled, this.treatment)
  }
  get material(): GlassMaterial {
    return {
      variant: this.variant,
      tint: this.colour,
      interactive: this.responds,
      ...(this.treatment ? { treatment: this.treatment } : {}),
    }
  }
}

export function glassRadius(shape: GlassShape, width: number, height: number): number {
  const maximum = Math.min(width, height) / 2
  if (typeof shape === 'string') return maximum
  if (!Number.isFinite(shape.cornerRadius) || shape.cornerRadius < 0)
    throw new Error('Glass cornerRadius must be finite and nonnegative.')
  if (
    shape.bottomCornerRadius !== undefined &&
    (!Number.isFinite(shape.bottomCornerRadius) || shape.bottomCornerRadius < 0)
  )
    throw new Error('Glass bottomCornerRadius must be finite and nonnegative.')
  return Math.min(shape.cornerRadius, maximum)
}

export function validateGlassRegions(regions: readonly GlassRegion[], resolution: number) {
  if (!Number.isFinite(resolution) || resolution <= 0) throw new Error('Invalid glass resolution.')
  if (regions.length > GLASS_REGION_LIMIT)
    throw new Error(`Glass supports at most ${GLASS_REGION_LIMIT} app regions.`)
  const ids = new Set<string>(),
    morphs = new Set<string>(),
    layers = new Map<string, string>()
  let pixels = 0
  for (const region of regions) {
    if (ids.has(region.id)) throw new Error(`Duplicate glass region: ${region.id}`)
    ids.add(region.id)
    const layerKey = JSON.stringify(region.layer)
    if (layers.has(region.layer.id) && layers.get(region.layer.id) !== layerKey)
      throw new Error(`Conflicting glass layer: ${region.layer.id}`)
    layers.set(region.layer.id, layerKey)
    if (!region.layer.id || !Number.isFinite(region.layer.depth))
      throw new Error('Invalid glass layer.')
    if (region.layer.attachment.kind === 'scroll' && !region.layer.attachment.scrollId)
      throw new Error('Scroll-attached glass requires a scroll owner.')
    const { x, y, width, height } = region.frame
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0)
      throw new Error(`Invalid glass frame: ${region.id}`)
    glassRadius(region.shape, width, height)
    if (
      typeof region.shape === 'object' &&
      region.shape.bottomCornerRadius !== undefined &&
      (region.container ||
        region.union ||
        region.material.interactive ||
        !['sheet', 'expandedSheet'].includes(region.material.treatment ?? ''))
    )
      throw new Error('Independent bottom corners require a noninteractive, separate sheet region.')
    if (region.shape === 'circle' && Math.abs(width - height) > 0.5)
      throw new Error('Circle glass requires equal width and height.')
    if (
      region.container &&
      (!Number.isFinite(region.container.spacing) || region.container.spacing < 0)
    )
      throw new Error('Glass container spacing must be finite and nonnegative.')
    if (region.morph) {
      const key = JSON.stringify([
        region.container?.id ?? null,
        region.morph.namespace,
        region.morph.id,
      ])
      if (morphs.has(key)) throw new Error(`Duplicate active glassEffectID: ${key}`)
      morphs.add(key)
    }
    pixels += Math.ceil((width + 40) * resolution) * Math.ceil((height + 40) * resolution)
  }
  if (pixels > GLASS_REGION_PIXEL_LIMIT)
    throw new Error(`Glass sample budget exceeded: ${pixels} > ${GLASS_REGION_PIXEL_LIMIT} pixels.`)
  return { regions: regions.length, samplePixels: pixels }
}

/** Projection is for sampling only. Presenters stay attached to their DOM layer. */
export function glassViewportFrame(region: GlassRegion, scrolls: readonly GlassScrollSnapshot[]) {
  const attachment = region.layer.attachment
  if (attachment.kind === 'fixed') return region.frame
  const scroll = scrolls.find(value => value.id === attachment.scrollId)
  if (!scroll) throw new Error(`Missing glass scroll snapshot: ${attachment.scrollId}`)
  return {
    ...region.frame,
    x: region.frame.x + scroll.viewportX - scroll.offsetX,
    y: region.frame.y + scroll.viewportY - scroll.offsetY,
  }
}
