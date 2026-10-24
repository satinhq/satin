import { sampleKeyboardTranslation, type KeyboardTranslation } from '../../keyboard/translation.ts'
import { accessoryPose, accessoryOffset } from './accessoryTrack.ts'
import {
  shapeTrackRunning,
  shapeTrackFrame,
  shapeTrackRadius,
  trackedShapeSpec,
} from '../shapeTrack.ts'
import { MenuTouchLight } from '../lens/menuTouchLight.ts'
import type { GlassFieldMember } from '../fieldGeometry.ts'
import {
  FIELD_MOTION_DURATION,
  ZERO_FIELD_VELOCITY,
  sampleFieldMember,
  followFieldTarget,
} from '../fieldMotion.ts'
import type { CapsuleShape } from '../renderSpecs.ts'
import { sampleMenuCorner, type MenuCornerPose } from '../lens/menuCornerMotion.ts'
import {
  transitionMenuMorph,
  menuMorphDuration,
  menuMotionProfile as emergeProfile,
  menuMorphEndpoint,
  MENU_MORPH_ZERO,
  type MenuMorphPose,
  type MenuMotionProfile,
} from '../lens/menuMorphMotion.ts'
import { lowerShapeTop } from '../lens/drawableTop.ts'
import { menuMaterialProgress } from '../lens/menuMotion.ts'
import { glassBlendRadius } from '../morphField.ts'
import { menuFieldFrame, menuSeed, plainMenuPresentation } from '../lens/menuField.ts'
import { menuContextPresentation } from '../lens/menuContextPresentation.ts'
import type { GlassCanvas, GlassRegionEvent, GlassViewport } from '../rendererContract.ts'
import { contextSampleInset } from './contextComposite.ts'
import { Backdrop } from './backdrop.ts'
import { FrameGraph, type GraphLease } from './frameGraph.ts'
import { TabMotion, TAB_INTERACTIVE_MOTION } from '../lens/tabMotion.ts'
import {
  InteractivePress,
  interactivePressScale,
  interactiveHighlight,
  withHighlight,
  INTERACTIVE_HIGHLIGHT_RELEASE_MS,
  type InteractivePressKind,
} from '../lens/interactivePress.ts'
import { GLASS_CONTACT_PHYSICS, glassContactKind } from '../contactPhysics.ts'
import {
  InteractiveContact,
  GLASS_CONTACT_REST,
  type GlassContactPose,
} from '../lens/interactiveContact.ts'
import {
  GLASS_RENDERER_PROTOCOL,
  type GlassInteraction,
  type GlassPresenter,
  type GlassRendererRequest,
  type GlassSource,
} from '../rendererContract.ts'
import {
  frameUnion,
  glassPresenterBounds,
  glassRadius,
  glassViewportFrame,
  isPlainMenuSource,
  validateGlassRegions,
  type GlassRegion,
  type GlassSceneSnapshot,
  type MenuSourceKind,
} from '../regions.ts'
import type { GlassTouchLight, SurfaceRenderSpec } from '../renderSpecs.ts'
import type { NavigationPose } from './productionTracks.ts'
import type { Appearance } from '../lens/theme.ts'
import { LayerDevice } from './layers.ts'
import { controlLensSize, controlLiftProfile, type ControlLiftKind } from '../lens/controlLift.ts'
import { SelectionThumb, selectionPill } from './selectionThumb.ts'
import { WebGPURaster, drawableCosts } from './raster.ts'
import { glassTiming, glassNow } from './profile.ts'

/** A presenter is a DOM stacking slot. Its shader coordinates remain local. */
export function regionSpec(
  region: GlassRegion,
  presenter: GlassPresenter,
  scene: GlassSceneSnapshot,
): SurfaceRenderSpec {
  const inset = contextSampleInset(region.material.treatment)
  const frame = glassViewportFrame(region, scene.scrolls),
    radius = glassRadius(region.shape, frame.width, frame.height)
  const spec: SurfaceRenderSpec = {
    id: `region:${region.id}`,
    backdropExclusions: region.backdropExclusions,
    // A menu's glass sees the dim it was opened over. That includes its submenu platters: on
    // their own they would sample the undimmed page, so a bright colour behind the dim (a sent
    // bubble) shone through them at full strength.
    backdropMenuOverlay:
      !!region.emerge || !!region.inMenuPanel || region.material.treatment === 'contextMenu',
    variant: region.material.variant,
    treatment: region.material.treatment,
    sheetOpaqueMix: region.sheetOpaqueMix,
    popoverArrow: region.popoverArrow,
    // A segmented glass (the scope bar) is pressed like interactive glass: it lights too.
    tint:
      (region.material.interactive && !region.material.control) || region.selection
        ? withHighlight(region.material.tint, HIGHLIGHT_FLOOR)
        : region.material.tint,
    frameX: frame.x - presenter.origin.x,
    frameY: frame.y - presenter.origin.y,
    frameWidth: frame.width,
    frameHeight: frame.height,
    radius,
    sampleWidth: frame.width + 2 * inset,
    sampleHeight: frame.height + 2 * inset,
    sampleInsetX: inset,
    sampleInsetY: inset,
    shaderAperture: true,
    materialMix: 1,
    // Every menu surface is the menu recipe's frosted material, as native's is: the root menu (the
    // emerging region) and its submenu platters alike. Through the bar recipe (a 2.9 px blur) the
    // page's text and bubbles read clearly through the menu. The root's morph from its trigger
    // blends from the bar recipe (emergeRegionSpec `recipeMix`).
    materialProfile:
      region.material.treatment === 'contextMenu' || region.inMenuPanel || region.emerge
        ? 'menu'
        : (region.material.recipe ?? 'chrome'),
    shape: {
      blendRadius: 0,
      rimAlpha:
        (region.material.treatment && region.material.treatment !== 'contextMenu') ||
        region.material.variant === 'clear'
          ? 0
          : 1,
      whiteMix: 0,
      first: {
        centerX: frame.width / 2,
        centerY: frame.height / 2,
        halfWidth: frame.width / 2,
        halfHeight: frame.height / 2,
        radius,
        ...(typeof region.shape === 'object' && region.shape.bottomCornerRadius !== undefined
          ? {
              bottomRadius: Math.min(
                region.shape.bottomCornerRadius,
                frame.width / 2,
                frame.height / 2,
              ),
            }
          : {}),
      },
    },
  }
  if (region.selection) return { ...spec, tabSelection: selectionPill(spec, region.selection) }
  // A control's lens is installed transparent at rest, before the page lifts it.
  const control = region.material.control
  return control ? controlLensSpec(spec, control, 0, spec.frameWidth / 2) : spec
}
/** The selection's labels as ink: the region's whole foreground atlas, captured in the region's
 * sample space (regionBridge), drawn over the pill (rasterMaterial encodeTabSelection). */
export function selectionInk(
  spec: SurfaceRenderSpec,
  foreground: { width: number; height: number } | undefined,
): SurfaceRenderSpec {
  if (!spec.tabSelection || !foreground) return spec
  const { width, height } = foreground
  return {
    ...spec,
    ink: {
      atlas: { width, height },
      layers: [
        {
          source: { x: 0, y: 0, width, height },
          frame: { x: -spec.sampleInsetX, y: -spec.sampleInsetY, width, height },
          opacity: 1,
          blur: 0,
          lens: 0,
          lensWidth: 1,
        },
      ],
    },
  }
}
export function fieldRegionSpec(
  regions: readonly GlassRegion[],
  presenter: GlassPresenter,
  scene: GlassSceneSnapshot,
  at = performance.timeOrigin + performance.now(),
): SurfaceRenderSpec {
  const base = regionSpec(regions[0], presenter, scene),
    inset = base.sampleInsetX
  // A tracked partition with no area has retired (merge) or not yet grown (split). Native
  // removes that platter outright; left in the field, its point would still blend into its
  // neighbour and swell it. Untracked members keep their places for the field spring.
  const sampled = regions.filter(region => {
    const aperture = region.shapeTrack && shapeTrackFrame(region.shapeTrack, at)
    return !aperture || (aperture.width > 0 && aperture.height > 0)
  })
  const members = (sampled.length ? sampled : regions.slice(0, 1)).map(region => {
    const viewport = glassViewportFrame(region, scene.scrolls)
    const aperture = region.shapeTrack && shapeTrackFrame(region.shapeTrack, at)
    const frame = aperture
      ? { ...aperture, x: viewport.x + aperture.x, y: viewport.y + aperture.y }
      : viewport
    const radius = glassRadius(region.shape, frame.width, frame.height)
    return {
      centerX: frame.x + frame.width / 2 - presenter.origin.x - inset,
      centerY: frame.y + frame.height / 2 - presenter.origin.y - inset,
      halfWidth: frame.width / 2,
      halfHeight: frame.height / 2,
      radius: region.shapeTrack
        ? Math.min(
            frame.width / 2,
            frame.height / 2,
            shapeTrackRadius(region.shapeTrack, at, radius),
          )
        : radius,
    }
  })
  return {
    ...base,
    frameX: inset,
    frameY: inset,
    frameWidth: presenter.width - 2 * inset,
    frameHeight: presenter.height - 2 * inset,
    sampleWidth: presenter.width,
    sampleHeight: presenter.height,
    shape: {
      ...base.shape,
      first: members[0],
      members,
      blendRadius: glassBlendRadius(regions[0].container!.spacing),
    },
  }
}
/** The phone menu table's time zero after the trigger's release epoch. The fit's zero is native
 * release +43 ms (menuMorphPhoneFit.json); our release epoch is the page's commit and the frame
 * then reaches the screen later, so Catalyst captures (BC5) trailed native by about 25 ms at 43.
 * 20 aligns the measured outline within the native recording's ±30 ms calibration. */
const MENU_PHONE_RELEASE_LEAD = 20
/** How long a phone close holds its open pose after its scene arrives (see the close start). */
const MENU_PHONE_CLOSE_HOLD = 10
/** A release older than this is not the one that opened the menu (keyboard, reopen). */
const MENU_RELEASE_ANCHOR_WINDOW = 400
export { menuMotionProfile as emergeProfile } from '../lens/menuMorphMotion.ts'
/** Shared measured mass 1, stiffness 186.57, damping 25.13. */
export function fieldSpringProgress(ms: number) {
  const t = Math.max(0, ms) / 1000,
    a = 25.13 / 2,
    w = Math.sqrt(186.57 - a * a)
  return 1 - Math.exp(-a * t) * (Math.cos(w * t) + (a / w) * Math.sin(w * t))
}
/** Interactive glass always carries a tint so the press highlight's pass exists from install (no
 * mid-press reallocation); the floor is invisible (1/10000 white). */
const HIGHLIGHT_FLOOR = 1e-4
/** An emerging region samples over its trigger and panel (the presenter bounds). Its glass is one
 * field of two members (lens/menuField.ts): the panel member moves from the trigger's seed (its
 * round part at the menu's own button: the whole trigger when it is a circle; progress 0) to the
 * panel (1) inside that fixed envelope, and the trigger member holds, is absorbed on open and
 * grows back on close. `field` gives the time since the morph's first frame; without it the pose
 * alone decides (the trigger member is present only at progress 0). */
export function emergeRegionSpec(
  spec: SurfaceRenderSpec,
  region: GlassRegion,
  presenter: GlassPresenter,
  progress: number | MenuMorphPose,
  corner: MenuCornerPose = { rounding: 0 },
  liveSource?: NonNullable<GlassRegion['emerge']>['from'],
  field?: {
    direction: 'open' | 'close'
    ms: number
    pressHighlight: number
    settled: boolean
    recipeMix?: number
  },
  appearance: Appearance = 'dark',
): SurfaceRenderSpec {
  const pose =
    typeof progress === 'number'
      ? {
          ...MENU_MORPH_ZERO,
          centerX: progress,
          centerY: progress,
          width: progress,
          height: progress,
        }
      : progress
  const source = liveSource ?? region.emerge?.from
  if (!source) return spec
  const rest = region.emerge?.returnTo ?? source
  const from = source
  const inset = spec.sampleInsetX,
    bounds = glassPresenterBounds(region.frame, inset, region.emerge)
  const ux = bounds.x + inset,
    uy = bounds.y + inset,
    uw = bounds.width - 2 * inset,
    uh = bounds.height - 2 * inset
  const lerp = (a: number, b: number, p: number) => a + (b - a) * p
  const panel = {
    cx: region.frame.x + region.frame.width / 2 - ux,
    cy: region.frame.y + region.frame.height / 2 - uy,
    hw: region.frame.width / 2,
    hh: region.frame.height / 2,
    r: spec.shape.first.radius,
  }
  /** A trigger rectangle (viewport points) as a field member in the presenter's frame. */
  const member = (rect: typeof from) => ({
    centerX: rect.x + rect.width / 2 - ux,
    centerY: rect.y + rect.height / 2 - uy,
    halfWidth: rect.width / 2,
    halfHeight: rect.height / 2,
    radius: Math.min(rect.radius, rect.width / 2, rect.height / 2),
  })
  const anchor = region.emerge?.anchor && {
    x: region.emerge.anchor.x - ux,
    y: region.emerge.anchor.y - uy,
  }
  const home = member(rest)
  // The drop leaves from the trigger's seed: the pressed aperture's on open, the released
  // trigger's on the way back. For a circle both are the trigger itself.
  // A plain source draws no glass at rest, so its drop grows from (and pours back into) the
  // centre of its seed: menuDropFit.json (a label) and menuGlyphDropFit.json (a glyph) were
  // fitted from that point.
  const seedOf = (shape: GlassFieldMember) => {
    if (region.emerge?.sourceKind === 'context') return shape
    const seed = menuSeed(shape, anchor)
    return isPlainMenuSource(region.emerge?.sourceKind)
      ? { ...seed, halfWidth: 0.05, halfHeight: 0.05, radius: 0.05 }
      : seed
  }
  const pressed = seedOf(member(from))
  const released = seedOf(home)
  const trigger = {
    cx: pressed.centerX,
    cy: pressed.centerY,
    hw: pressed.halfWidth,
    hh: pressed.halfHeight,
    r: pressed.radius,
  }
  // Return corrections are additive and axis-specific. Multiplying a changing
  // source by (1-progress) inflated the middle of a close and lost the measured path.
  const hw = Math.max(
    1,
    lerp(trigger.hw, panel.hw, pose.width) +
      (released.halfWidth - pressed.halfWidth) * pose.returnWidth,
  )
  const hh = Math.max(
    1,
    lerp(trigger.hh, panel.hh, pose.height) +
      (released.halfHeight - pressed.halfHeight) * pose.returnHeight,
  )
  const cx =
    lerp(trigger.cx, panel.cx, pose.centerX) + (released.centerX - pressed.centerX) * pose.returnX
  const cy =
    lerp(trigger.cy, panel.cy, pose.centerY) + (released.centerY - pressed.centerY) * pose.returnY
  // A plain drop's rounding and fade are its own measured curves: it has no glass button to
  // return to.
  const sourceKind = region.emerge?.sourceKind
  const plainPresentation =
    sourceKind === 'label' || sourceKind === 'glyph'
      ? plainMenuPresentation(
          sourceKind,
          field?.direction ?? 'open',
          field?.ms ?? 0,
          field?.settled ?? pose.width >= 1,
        )
      : undefined
  const contextPresentation =
    region.emerge?.sourceKind === 'context'
      ? menuContextPresentation(
          field?.direction ?? 'open',
          field?.ms ?? 0,
          field?.settled ?? false,
          appearance,
        )
      : undefined
  const moving = lowerShapeTop(
    {
      centerX: cx,
      centerY: cy,
      halfWidth: hw,
      halfHeight: hh,
      // The recorded iPad corner curve squares the early aperture; the phone drop stays round.
      radius: Math.max(
        0,
        Math.min(
          lerp(trigger.r, panel.r, contextPresentation?.radiusProgress ?? pose.width) +
            (released.radius - pressed.radius) * pose.returnWidth +
            (contextPresentation?.rounding ??
              plainPresentation?.rounding ??
              Math.max(0, corner.rounding)) *
              Math.min(hw, hh),
          hw,
          hh,
        ),
      ),
    },
    uy,
  )
  const local = (rect: { x: number; y: number; width: number; height: number }) => ({
    ...rect,
    x: rect.x - ux,
    y: rect.y - uy,
  })
  const ink = region.emerge?.ink
  const direction = field?.direction ?? 'open'
  const frame = menuFieldFrame({
    sourceKind: region.emerge?.sourceKind,
    direction,
    ms: field?.ms ?? (pose.width >= 1 ? Infinity : 0),
    panel: moving,
    home,
    anchor,
    pressedScale: source.width / rest.width,
    pressHighlight: field?.pressHighlight ?? 0,
    panelFrame: local(region.frame),
    rows:
      ink?.rows && !(direction === 'open' && region.emerge?.inkDom)
        ? { source: ink.rows.source, frame: local(ink.rows.frame) }
        : undefined,
    glyph: ink?.glyph ? { source: ink.glyph.source, frame: local(ink.glyph.frame) } : undefined,
    settled: field?.settled ?? pose.width >= 1,
  })
  // A source with nothing visible at rest (a label, a recognising context press) prewarms its
  // glass transparent until the presenter is ready; then it is drawn whole.
  const held =
    (isPlainMenuSource(region.emerge?.sourceKind) ||
      region.emerge?.recognitionEpoch !== undefined) &&
    direction === 'open' &&
    region.emerge.ready === false
  return {
    ...spec,
    opacity: held
      ? 0
      : (contextPresentation?.opacity ?? plainPresentation?.opacity ?? spec.opacity),
    prewarmTransparent: held,
    frameX: ux - presenter.origin.x,
    frameY: uy - presenter.origin.y,
    frameWidth: uw,
    frameHeight: uh,
    sampleWidth: uw + 2 * inset,
    sampleHeight: uh + 2 * inset,
    // The press highlight carried from the trigger; the floor keeps its pass allocated.
    tint: withHighlight(region.material.tint, Math.max(HIGHLIGHT_FLOOR, frame.highlight)),
    shape: {
      ...spec.shape,
      first: frame.members[0],
      members: frame.members,
      blendRadius: frame.blendRadius,
    },
    ...(ink && frame.ink.length ? { ink: { atlas: ink.atlas, layers: frame.ink } } : {}),
    recipeMix:
      field?.recipeMix ??
      emergeRecipeMix(sourceKind, direction, field?.ms ?? (pose.width >= 1 ? Infinity : 0)),
  }
}
/** Where an emerging menu's material is between its trigger's bar glass (0) and the menu's
 * frosted material (1). A glass button, or a plain glyph's glass bubble, turns into the menu
 * material on native's measured curve (menuMaterialProgress), so the morph starts on the
 * trigger's own glass and ends on the menu's without a swap. A context menu or a text label has
 * no glass to start from: its menu is the frosted material from its first visible frame. */
function emergeRecipeMix(
  sourceKind: MenuSourceKind | undefined,
  direction: 'open' | 'close',
  ms: number,
  from = direction === 'open' ? 0 : 1,
) {
  if (sourceKind === 'context' || sourceKind === 'label') return 1
  const progress = menuMaterialProgress(direction, ms / 1000)
  return direction === 'open' ? from + (1 - from) * progress : from * progress
}
/** The shared native press growth (INTERACTIVE_GLASS_PRESS): a surface's 160pt circle becomes
 * 164pt while held, a button grows 16pt wide. Preserve the material and expand its actual
 * aperture; never cover it with the unfiltered page. `amount` is the press spring (it
 * overshoots on press and undershoots on release). `pose` is the contact's follow and squish
 * (InteractiveContact): it moves the grown shape and changes its width and height, keeping a
 * capsule's ends round.
 */
export function pressedRegionSpec(
  spec: SurfaceRenderSpec,
  amount: number,
  kind: InteractivePressKind = 'surface',
  memberIndex = 0,
  pose: GlassContactPose = GLASS_CONTACT_REST,
): SurfaceRenderSpec {
  if (amount === 0 && pose === GLASS_CONTACT_REST) return spec
  const member = spec.shape.members?.[memberIndex] ?? spec.shape.first
  const scale = interactivePressScale(kind, member.halfWidth * 2, amount)
  const halfWidth = Math.max(1, member.halfWidth * scale + pose.width / 2)
  const halfHeight = Math.max(1, member.halfHeight * scale + pose.height / 2)
  const capsule = member.radius >= Math.min(member.halfWidth, member.halfHeight) - 0.01
  const grown = {
    ...member,
    centerX: member.centerX + pose.x,
    centerY: member.centerY + pose.y,
    halfWidth,
    halfHeight,
    radius: capsule
      ? Math.min(halfWidth, halfHeight)
      : Math.min(member.radius * scale, halfWidth, halfHeight),
  }
  const members = spec.shape.members?.map((shape, index) => (index === memberIndex ? grown : shape))
  return {
    ...spec,
    shape: {
      ...spec.shape,
      first: members?.[0] ?? grown,
      ...(members ? { members } : {}),
    },
  }
}
/** A Toggle or Slider thumb lens inside its control's frame: a capsule of the lifted size at the
 * contact's lens centre (frame-local CSS px). At rest it is prepared but transparent; the page's
 * opaque white thumb covers the hand-off while the lens grows. */
export function controlLensSpec(
  spec: SurfaceRenderSpec,
  kind: ControlLiftKind,
  amount: number,
  centerX: number,
): SurfaceRenderSpec {
  const size = controlLensSize(kind, amount)
  const first = {
    ...spec.shape.first,
    centerX,
    halfWidth: size.width / 2,
    halfHeight: size.height / 2,
    radius: size.height / 2,
  }
  return {
    ...spec,
    // The held lens keeps the clear material's rim (native shows a darker lens edge).
    shape: { ...spec.shape, first, rimAlpha: 1 },
    opacity: amount > 0 ? 1 : 0,
    prewarmTransparent: true,
  }
}
/** A press or contact on an interactive region, kept while the region exists. */
type RegionInteraction = {
  motion: TabMotion
  press: InteractivePress
  epoch: number
  downAt?: number
  upAt?: number
  /** A control lens's centre in frame-local CSS px (the page's live thumb position). */
  lensCenter?: number
  /** The finger on a pressed interactive shape: its light, follow and squish. */
  contact?: InteractiveContact
  contactKind?: InteractivePressKind
}

/** Implements the public scene/source protocol on the page's existing GPU owner. */
export class RegionScene {
  private samplePixels = 0
  private scene: GlassSceneSnapshot = { revision: 0, layers: [], regions: [], scrolls: [] }
  /** A captured scene may arrive after a newer directly delivered aperture. */
  private shapeTracks = new Map<string, GlassRegion['shapeTrack']>()
  private presenters = new Map<
    string,
    {
      descriptor: GlassPresenter
      canvas: GlassCanvas
      raster?: WebGPURaster
      viewport?: GlassViewport
      keyboard?: KeyboardTranslation
      /** Region identities in the retained field geometry, including after settlement. */
      fieldMemberIds?: readonly string[]
      key?: string
      storageKey?: string
      covered?: boolean
      sourceId?: string
      presentationContentEpoch?: number
      accessoryContentEpoch?: number
      accessoryEpoch?: number
      accessorySourceOrigin?: { x: number; y: number }
      navigation?: string
      zoomRoute?: number
      /** Held (GlassRegion.suspended): keeps its pixels, is not redrawn for backdrop changes. */
      suspended?: boolean
      /** Held and its own tab's backdrop is no longer installed: the raster is parked (no setup,
       * no leases), only the canvas pixels remain. */
      parked?: boolean
      /** The region's own inputs (spec, ink, appearance) its canvas was last drawn with. */
      materialKey?: string
      /** Held, and repainted while nothing could be submitted (an appearance change that is
       * presented in one step, later): `present` draws it and then parks it. Until then a
       * commit of another tab does not park it on the pixels of the old appearance. */
      parkAfterPresent?: boolean
      /** Must be installed again whatever its keys say (a failed fence, or parked while on screen). */
      repaint?: boolean
    }
  >()
  private sources = new Map<
    string,
    { descriptor: GlassSource; bitmap: ImageBitmap; lease: GraphLease<ImageBitmap> }
  >()
  private emptyForeground?: GraphLease<ImageBitmap>
  private drop(id: string) {
    const source = this.sources.get(id)
    if (!source) return
    source.lease.release()
    this.sources.delete(id)
  }
  /** Install the chrome's shared capture (already retained in the frame graph under
   * `key`) as the root backdrop: one transfer and one upload serve chrome and regions. */
  async shareSource(descriptor: GlassSource, bitmap: ImageBitmap, key: string, ordered = false) {
    const previous = this.sources.get(descriptor.id)
    // Standalone source updates reject stale captures. The worker transport can explicitly
    // restore an older resident capture after a pop; its request revision already orders it.
    if (!ordered && previous && previous.descriptor.revision >= descriptor.revision) return
    const lease = FrameGraph.for(this.owner).image(key, bitmap)
    this.drop(descriptor.id)
    this.sources.set(descriptor.id, { descriptor, bitmap: lease.value, lease })
    this.sourcesChanged = true
    // The settled capture after a navigation replaces its route atlas.
    if (descriptor.id === 'root-backdrop') this.navigation = undefined
    await this.install()
  }
  get sharedRevision() {
    return this.sources.get('root-backdrop')?.descriptor.revision
  }
  get navigationActive() {
    return !!this.navigation
  }
  private motions = new Map<string, RegionInteraction>()
  private touchLights = new Map<string, MenuTouchLight>()
  /** Scope thumbs in flight (GlassRegion.selection): segment index from → to since `start`. */
  /** The thumbs of segmented regions (the search scope bar), by region id. */
  private thumbs = new Map<string, SelectionThumb>()
  private reducedMotion = false
  /** Emerging regions (glass Menus): direction, start (epoch ms) and the progress it starts from. */
  private emerges = new Map<
    string,
    {
      direction: 'open' | 'close'
      start: number
      from: MenuMorphPose
      velocity: MenuMorphPose
      progress: MenuMorphPose
      cornerFrom: MenuCornerPose
      cornerVelocity: MenuCornerPose
      corner: MenuCornerPose
      materialFrom?: number
      source?: NonNullable<GlassRegion['emerge']>['from']
      shown?: boolean
      held?: boolean
      frozen?: boolean
      settled?: boolean
      generation?: number
      /** The trigger's press highlight at the morph's first frame (open). */
      pressHighlight?: number
      /** The page was told to swap its live rows (open settled / close started). */
      inkNotified?: boolean
      idiom?: MenuMotionProfile
      /** The field clock of the last presented frame (a reinstall redraws exactly that frame). */
      field?: NonNullable<Parameters<typeof emergeRegionSpec>[6]>
    }
  >()
  private fields = new Map<
    string,
    {
      start: number
      from: SurfaceRenderSpec
      to: SurfaceRenderSpec
      velocity: readonly CapsuleShape[]
      memberIds: readonly string[]
    }
  >()
  private appearance!: Appearance
  /** Presenters whose backdrop only moved (scroll under a fixed region): redrawn once
   * in the next worker frame instead of reinstalled and fenced per scroll event. */
  private moved = new Set<{ raster?: WebGPURaster }>()
  /** A pressed interactive region is being dragged or held (its motion is live). */
  get pressing() {
    return [...this.motions.values()].some(
      m =>
        m.motion.needsFrame ||
        m.press.needsFrame ||
        this.highlighting(m, performance.timeOrigin + performance.now()),
    )
  }
  /** The press highlight still changes (held: its first 600 ms; released: its fade). */
  private highlighting(m: { downAt?: number; upAt?: number }, at: number) {
    return (
      m.downAt !== undefined &&
      (m.upAt === undefined
        ? at < m.downAt + 620
        : at < m.upAt + INTERACTIVE_HIGHLIGHT_RELEASE_MS + 20)
    )
  }
  /** A backdrop plane scrolled or the plane set changed: redraw only presenters whose
   * composed backdrop differs (scroll-attached glass over its own plane does not). */
  backdropMoved() {
    for (const p of this.presenters.values())
      if (p.raster?.spec && !p.covered && !p.suspended && p.raster.backdropStale())
        this.moved.add(p)
  }
  /** The plane set is about to be replaced by another tab's (a source preparation committed).
   * `regionIds` are the regions of tabs that are not selected. Called BEFORE the new planes are
   * installed, so each of those presenters is drawn one last time over its own tab's backdrop (a
   * press still animating is settled at rest first) and then parked: from here on its canvas keeps
   * those pixels, and nothing can draw another tab's backdrop into it. */
  holdForBackdropChange(regionIds: readonly string[]) {
    const held = new Set(regionIds)
    this.scene = {
      ...this.scene,
      regions: this.scene.regions.map(region =>
        held.has(region.id) && !region.suspended ? { ...region, suspended: true } : region,
      ),
    }
    // A press that is still animating ends at rest (drawn over the region's own backdrop).
    for (const id of held) {
      const state = this.motions.get(id)
      if (!state || !this.motionLive(state)) continue
      state.motion.reset(0)
      state.press.reset()
      state.downAt = undefined
      state.upAt = undefined
      this.presentMotion(id, state)
    }
    for (const p of this.presenters.values()) {
      if (!held.has(p.descriptor.regionIds[0]) || p.parked) continue
      p.suspended = true
      this.moved.delete(p)
      // Repainted while nothing could be submitted (an appearance change waiting to be presented):
      // its canvas still shows the old appearance. `present` draws it, then parks it.
      if (p.parkAfterPresent) continue
      // A merge or split still running ends at its target (drawn over the region's own backdrop).
      const field = this.fields.get(p.descriptor.id)
      if (field) {
        this.fields.delete(p.descriptor.id)
        if (p.raster?.spec && !p.covered) {
          p.raster.updateSpec(field.to)
          p.raster.draw(0)
        }
      }
      // Never drawn (it mounted while its tab was hidden): nothing to keep, nothing to sample.
      if (!p.raster || !p.materialKey) {
        this.park(p)
        continue
      }
      if (p.raster.spec && !p.covered && p.raster.backdropStale()) p.raster.draw(0)
      this.park(p)
    }
  }
  /** The new plane set is installed. Every region that is not in `heldIds` belongs to the selected
   * tab: it resumes now (the next install redraws it over its own backdrop), at the same point of
   * the batch where an unheld region is redrawn. */
  resumeForBackdropChange(heldIds: readonly string[]) {
    const held = new Set(heldIds)
    this.scene = {
      ...this.scene,
      regions: this.scene.regions.map(region =>
        region.suspended && !held.has(region.id) ? { ...region, suspended: false } : region,
      ),
    }
  }
  /** Install what the last resume left pending: a parked presenter whose region is no longer held.
   * Nothing is pending in a scene that held nothing, so a renderer without regions (or one that has
   * not been given its appearance yet) is never installed from here. */
  async installPending() {
    const pending = [...this.presenters.values()].some(presenter => {
      if (!presenter.parked) return false
      const region = this.scene.regions.find(r => r.id === presenter.descriptor.regionIds[0])
      return !!region && !region.suspended
    })
    if (pending) await this.install()
  }
  private motionLive(state: {
    motion: TabMotion
    press: InteractivePress
    downAt?: number
    upAt?: number
    contact?: InteractiveContact
  }) {
    const at = performance.timeOrigin + performance.now()
    return (
      state.motion.needsFrame ||
      state.press.needsFrame ||
      this.highlighting(state, at) ||
      !!state.contact?.needsFrame(at)
    )
  }
  private park(p: {
    raster?: WebGPURaster
    parked?: boolean
    parkAfterPresent?: boolean
    key?: string
    storageKey?: string
  }) {
    p.raster?.park()
    p.parked = true
    p.parkAfterPresent = false
    p.key = undefined
    p.storageKey = undefined
  }
  /** Marks parked presenters whose region is not held for a repaint; true when there is one. */
  private repaintVisibleParked() {
    let any = false
    for (const p of this.presenters.values())
      if (p.parked && !p.suspended) {
        p.repaint = true
        any = true
      }
    return any
  }
  private keyboardSampledAt = -Infinity
  get active() {
    return (
      [...this.presenters.values()].some(
        p => !p.parked && !p.suspended && p.keyboard && this.keyboardSampledAt < p.keyboard.end,
      ) ||
      this.scene.regions.some(region => {
        const track =
          region.presentationViewportTrack ?? region.accessoryViewportTrack ?? region.accessoryTrack
        return (
          track &&
          track.epoch !== Number.MAX_VALUE &&
          performance.timeOrigin + performance.now() < track.epoch + track.duration
        )
      }) ||
      this.scene.regions.some(
        region =>
          region.shapeTrack &&
          shapeTrackRunning(region.shapeTrack, performance.timeOrigin + performance.now()),
      ) ||
      [...this.touchLights.values()].some(light =>
        light.needsFrame(performance.timeOrigin + performance.now()),
      ) ||
      this.fields.size > 0 ||
      [...this.thumbs.values()].some(thumb =>
        thumb.live(performance.timeOrigin + performance.now()),
      ) ||
      this.moved.size > 0 ||
      [...this.motions.values()].some(m => this.motionLive(m)) ||
      [...this.emerges.values()].some(
        e =>
          this.emergeRunning(e, performance.timeOrigin + performance.now()) ||
          (e.direction === 'close' && !e.settled && !e.frozen),
      )
    )
  }
  private emergeRunning(
    e: {
      direction: 'open' | 'close'
      start: number
      shown?: boolean
      held?: boolean
      frozen?: boolean
      inkNotified?: boolean
      idiom?: MenuMotionProfile
    },
    at: number,
  ) {
    if (e.held || e.frozen) return false
    // An open runs until its settled frame hands the rows back to the page.
    if (e.shown && e.direction === 'open' && !e.inkNotified) return true
    return e.shown
      ? at < e.start + menuMorphDuration(e.direction, e.idiom) + 34
      : at < e.start + 1000
  }
  private emergeSample(
    state: {
      direction: 'open' | 'close'
      start: number
      from: MenuMorphPose
      velocity: MenuMorphPose
      held?: boolean
      idiom?: MenuMotionProfile
    },
    at: number,
  ) {
    if (state.held) return { pose: state.from, velocity: MENU_MORPH_ZERO }
    if (this.reducedMotion) {
      return { pose: menuMorphEndpoint(state.direction), velocity: MENU_MORPH_ZERO }
    }
    return transitionMenuMorph(
      state.direction,
      at - state.start,
      state.from,
      state.velocity,
      state.idiom,
      this.appearance,
    )
  }
  private presentEmerge(id: string, at: number, present = true) {
    if (this.deferred || !this.visible) return
    const region = this.scene.regions.find(r => r.id === id),
      state = this.emerges.get(id)
    if (!region || !state) return
    const presenters = [...this.presenters.values()].filter(
      p => p.descriptor.regionIds[0] === id && p.raster?.spec,
    )
    if (!presenters.length) return
    // The trigger's press highlight continues in the field until the drop leaves (native).
    const trigger = region.emerge?.sourceRegionId
      ? this.motions.get(region.emerge.sourceRegionId)
      : undefined
    const liveHighlight =
      state.direction === 'open' && trigger?.downAt !== undefined
        ? interactiveHighlight('menu', this.appearance, trigger.downAt, trigger.upAt, at)
        : 0
    // The morph starts at the panel glass's first presented frame, not when its scene arrived: a
    // new presenter's setup (~100 ms under load) otherwise ate the start of the morph.
    if (!state.held && !state.frozen) {
      if (!state.shown) {
        // Menu captured the pressed trigger at activation. Its release spring may already
        // have material by this first visible frame; do not replace that frozen source.
        if (state.direction === 'open' && region.emerge?.from) state.source = region.emerge.from
        state.shown = true
        // The phone table is timed from the trigger's release (+43 ms); anchoring there keeps
        // capture and pipeline latency out of the motion (it only skips the held first knots).
        const released = trigger?.upAt
        state.start =
          state.direction === 'open' && region.emerge?.recognitionEpoch !== undefined
            ? region.emerge.recognitionEpoch
            : state.direction === 'open' &&
                state.idiom === 'phone' &&
                released !== undefined &&
                at - released < MENU_RELEASE_ANCHOR_WINDOW
              ? Math.min(at, released + MENU_PHONE_RELEASE_LEAD)
              : at
        state.pressHighlight = liveHighlight
        glassTiming('menu-morph-start', at, state.direction)
      }
      state.progress = this.emergeSample(state, at).pose
      state.corner = this.reducedMotion
        ? { rounding: 0 }
        : sampleMenuCorner(
            state.direction,
            at - state.start,
            state.cornerFrom,
            state.cornerVelocity,
          ).pose
    }
    const ms = state.shown && !state.held ? at - state.start : 0
    const duration = menuMorphDuration(state.direction, state.idiom)
    const field =
      state.frozen && state.field
        ? state.field
        : {
            direction: state.direction,
            ms,
            pressHighlight: state.shown ? (state.pressHighlight ?? 0) : liveHighlight,
            settled: this.reducedMotion || (state.direction === 'open' && ms >= duration),
            recipeMix: emergeRecipeMix(
              region.emerge?.sourceKind,
              state.direction,
              this.reducedMotion ? Infinity : ms,
              state.materialFrom,
            ),
          }
    state.field = field
    let drawn = false
    for (const p of presenters) {
      const spec = emergeRegionSpec(
        regionSpec(region, p.descriptor, this.scene),
        region,
        p.descriptor,
        state.progress,
        state.corner,
        state.source,
        field,
        this.appearance,
      )
      p.raster!.updateSpec(this.illuminate(spec, region, p.descriptor, at))
      if (present) {
        p.raster!.draw(0)
        drawn ||= p.descriptor.role === 'material'
      }
    }
    // Ink hand-off with the page's live rows, after a submitted frame: the page shows its rows
    // once the glass draws them settled, and hides them once the glass draws them closing.
    // Either order overlaps identical ink for a frame rather than leaving a blank panel.
    if (!drawn || !state.shown || state.held || state.frozen) return
    if (state.direction === 'close' && !state.inkNotified) {
      state.inkNotified = true
      this.notify({
        type: 'emerge-ink',
        regionId: id,
        generation: state.generation,
        phase: 'close-started',
      })
    } else if (state.direction === 'open' && field.settled && !state.inkNotified) {
      state.inkNotified = true
      this.notify({
        type: 'emerge-ink',
        regionId: id,
        generation: state.generation,
        phase: 'open-settled',
      })
    }
  }
  /** A navigation in progress: presenters over the settled chrome backdrop compose its route atlas
   * (the moving routes, the destination included) in place of the content plane, at the pose of
   * every worker frame, as native glass shows the page moving under it. The next settled backdrop
   * (the capture after the navigation) ends it. */
  private navigation?: {
    key: string
    lease: GraphLease<ImageBitmap>
    routes: number
    contentLayer: string
    width: number
    height: number
    pose?: NavigationPose
    deferPresent?: boolean
    rows?: readonly { top: number; bottom: number }[]
  }
  async navigationSource(navigation: {
    key: string
    lease: GraphLease<ImageBitmap>
    routes: number
    contentLayer: string
    width: number
    height: number
    pose?: NavigationPose
    deferPresent?: boolean
    rows?: readonly { top: number; bottom: number }[]
  }) {
    // The running track's pose: presenters never present the atlas without it (all routes at rest).
    this.navigation = { ...navigation, deferPresent: navigation.deferPresent ?? !!navigation.pose }
    await this.install()
  }
  setNavigation(pose: NavigationPose, key?: string, draw = true) {
    if (!this.navigation || (key !== undefined && key !== this.navigation.key)) return
    this.navigation.pose = pose
    for (const p of this.presenters.values())
      if (p.navigation === this.navigation.key && p.raster?.spec && !p.covered) {
        p.raster.setNavigation(this.presenterNavigationPose(pose, p.zoomRoute))
        if (draw && this.visible && !this.deferred) p.raster.draw(0)
      }
  }
  private presenterNavigationPose(pose: NavigationPose, route?: number): NavigationPose {
    if (route === undefined) return pose
    return {
      ...pose,
      routes: pose.routes?.map((_, index) => ({ x: index === route ? 0 : 1e9, dim: 0 })),
    }
  }
  /** Glass changing size inside a still canvas: draw each frame's shape at its presentation time. */
  private presentShapeTracks(at: number) {
    for (const p of this.presenters.values()) {
      if (!p.raster?.spec || p.parked || p.suspended || p.descriptor.role === 'lift') continue
      const members = p.descriptor.regionIds
        .map(id => this.scene.regions.find(region => region.id === id))
        .filter((region): region is GlassRegion => region !== undefined)
      if (!members.some(region => region.shapeTrack)) continue
      const region = members[0]!
      this.fields.delete(p.descriptor.id)
      // Sample all partitions together. Applying a single rectangle track to a
      // union replaces its field and lets the last arriving branch erase siblings.
      const spec = region.container
        ? fieldRegionSpec(members, p.descriptor, this.scene, at)
        : this.shapeAt(region, p.raster.spec, region.shapeTrack!, at)
      p.raster.updateSpec(spec)
      if (this.visible && !this.deferred) p.raster.draw(0)
    }
  }

  private shapeAt(
    region: GlassRegion,
    spec: SurfaceRenderSpec,
    track: NonNullable<GlassRegion['shapeTrack']>,
    at: number,
  ) {
    return trackedShapeSpec(spec, track, at, (width, height) =>
      glassRadius(region.shape, width, height),
    )
  }
  private presentTrackedViewport(at: number) {
    for (const region of this.scene.regions) {
      const track =
        region.presentationViewportTrack ?? region.accessoryViewportTrack ?? region.accessoryTrack
      if (!track) continue
      const foreground = this.sources.get(`foreground:${region.id}`)
      for (const p of this.presenters.values()) {
        if (
          !p.descriptor.regionIds.includes(region.id) ||
          !p.raster?.spec ||
          p.parked ||
          p.descriptor.role === 'lift'
        )
          continue
        // A pressed accessory draws through its press, which poses the run underneath it
        // (`posedRegionSpec`). Posing here as well would draw the run without the press.
        const interaction = this.motions.get(region.id)
        const pressed =
          region.accessoryTrack &&
          interaction &&
          (interaction.press.amount !== 0 || this.interactionMoving(interaction, at))
            ? interaction
            : undefined
        if (region.accessoryTrack?.held && foreground) {
          // A held-still canvas keeps its sampling viewport; the glass moves inside it.
          if (pressed) this.presentMotion(region.id, pressed, at)
          else {
            p.raster.updateSpec(
              accessoryPose(
                p.raster.spec,
                region.accessoryTrack,
                at,
                foreground.descriptor,
                this.restingFrame(region, p.descriptor),
              ),
            )
            if (this.visible && !this.deferred) p.raster.draw(0)
          }
          continue
        }
        const offset = accessoryOffset(track, at)
        // The DOM viewport observer is paused for this sampling track. Update the
        // sampling viewport itself: an older liveViewport overrides viewportOrigin.
        p.raster.setViewport({
          x: p.descriptor.origin.x + offset.x,
          y: p.descriptor.origin.y + offset.y,
          scaleX: 1,
          scaleY: 1,
        })
        if (p.accessorySourceOrigin)
          p.raster.setSourceOrigin({
            x: p.accessorySourceOrigin.x + offset.x,
            y: p.accessorySourceOrigin.y + offset.y,
          })
        if (pressed) {
          this.presentMotion(region.id, pressed, at)
          continue
        }
        if (region.accessoryTrack && foreground)
          p.raster.updateSpec(
            accessoryPose(p.raster.spec, region.accessoryTrack, at, foreground.descriptor),
          )
        if (this.visible && !this.deferred) p.raster.draw(0)
      }
    }
  }
  /** Whether a region's press or contact still moves (or lights) its glass at `at`. */
  private interactionMoving(state: RegionInteraction, at: number) {
    return (
      state.motion.needsFrame ||
      state.press.needsFrame ||
      this.highlighting(state, at) ||
      !!state.contact?.needsFrame(at)
    )
  }
  /**
   * `spec` (a region's scene spec in `presenter`) posed by its shape track and by the bottom
   * accessory's run at `at` when one is live: the run's capsule width and ink and, for a held-still canvas, its travel
   * inside the canvas. Without a run (or before its ink arrives) it is `spec` unchanged.
   *
   * The run and a press both draw the accessory, and a press builds on this pose. A press that
   * rebuilt from the scene spec drew the run's whole envelope, without ink, at the committed
   * row, until the run's next frame: the owner's smudge recording (a finger on the mini player
   * while the bar collapsed) showed that empty capsule running past the Search circle.
   */
  private posedRegionSpec(
    region: GlassRegion,
    presenter: GlassPresenter,
    spec: SurfaceRenderSpec,
    at: number,
  ) {
    // Glass changing size inside a still canvas (a submenu growing or collapsing) presses
    // the frame it is drawn at, not its whole envelope.
    const shaped = region.shapeTrack ? this.shapeAt(region, spec, region.shapeTrack, at) : spec
    const track = region.accessoryTrack
    const foreground = this.sources.get(`foreground:${region.id}`)
    if (!track || !foreground) return shaped
    const resting = track.held ? this.restingFrame(region, presenter) : undefined
    return accessoryPose(shaped, track, at, foreground.descriptor, resting)
  }
  /** Where a region's glass frame sits in its presenter at the region's laid-out position. */
  private restingFrame(region: GlassRegion, presenter: GlassPresenter) {
    const frame = glassViewportFrame(region, this.scene.scrolls)
    return { x: frame.x - presenter.origin.x, y: frame.y - presenter.origin.y }
  }
  /**
   * The time the last frame sampled the tracks at. A draw between frames (an install or a
   * scroll update) poses accessory tracks at that time too: the other surfaces of the frame,
   * such as the tab bar on its minimize track, stay where that frame sampled them, and a pose
   * taken at the draw's own time put the moving accessory a frame ahead of the bar.
   */
  private sampledAt?: number
  private trackClock() {
    return this.sampledAt ?? performance.timeOrigin + performance.now()
  }
  sample(at: number, presentationAt = at) {
    this.sampledAt = presentationAt
    if (this.sourcePending) return
    // Only compositor-owned viewport trajectories use the predicted presentation
    // time. Input, canvas-owned animation and teardown keep the actual clock.
    // Keyboard motion has no presentation lead: source and lens use the actual
    // carrier clock, including its endpoint hold while the document is stalled.
    this.keyboardSampledAt = at
    for (const p of this.presenters.values()) {
      if (!p.keyboard || !p.viewport || !p.raster || p.parked || p.suspended) continue
      p.viewport = { ...p.viewport, y: sampleKeyboardTranslation(p.keyboard, at) }
      p.raster.setViewport(p.viewport)
      if (p.raster.backdropStale()) this.moved.add(p)
    }
    this.presentTrackedViewport(presentationAt)
    this.presentShapeTracks(presentationAt)
    for (const [id, thumb] of this.thumbs)
      if (thumb.live(at)) {
        thumb.sample(at, this.reducedMotion, this.appearance)
        this.presentSelection(id, at)
      }
    for (const [id, motion] of this.fields) {
      const p = this.presenters.get(id)
      // A parked presenter has no setup to move: its field ended when it was held.
      if (!p?.raster || p.parked) {
        this.fields.delete(id)
        continue
      }
      const elapsed = at - motion.start
      const members = motion.to.shape.members!.map(
        (member, index) =>
          sampleFieldMember(
            motion.from.shape.members![index] ?? member,
            member,
            motion.velocity[index] ?? ZERO_FIELD_VELOCITY,
            elapsed,
            this.reducedMotion,
          ).value,
      )
      p.raster.updateSpec({
        ...motion.to,
        shape: { ...motion.to.shape, first: members[0], members },
      })
      if (this.visible && !this.deferred) p.raster.draw(0)
      if (this.reducedMotion || elapsed >= FIELD_MOTION_DURATION) this.fields.delete(id)
    }
    if (this.visible && !this.deferred && this.moved.size) {
      // A presenter is marked when its plane scrolls. Scroll-attached glass is marked then too,
      // because the scroll reaches the renderer before the scene that moves the glass with it;
      // once that scene is in, its backdrop is the one it last drew. Drawing it anyway re-encoded
      // and presented every glass canvas of a scrolling page in every frame (10 canvases, 3.5 MP
      // on the glass components page). With the renderer in the document that work is part of
      // the page's own frame, and the page missed frames.
      const installed = Backdrop.for(this.owner).installed
      for (const p of this.moved) {
        if (installed && !p.raster?.backdropStale()) continue
        p.raster?.draw(0)
      }
    }
    this.moved.clear()
    for (const [id, state] of this.emerges) {
      if (this.emergeRunning(state, at)) this.presentEmerge(id, at)
      // A close morph at its end (or one whose panel never presented): the page may tear it down.
      if (
        state.direction === 'close' &&
        !state.frozen &&
        !state.settled &&
        (state.shown
          ? at >= state.start + menuMorphDuration('close', state.idiom)
          : !this.emergeRunning(state, at))
      ) {
        state.settled = true
        this.notify({ type: 'emerge-settled', regionId: id, generation: state.generation })
      }
    }
    for (const [id, light] of this.touchLights) {
      if (!light.needsFrame(at)) continue
      const emerge = this.emerges.get(id)
      if (emerge && this.emergeRunning(emerge, at)) continue
      const region = this.scene.regions.find(region => region.id === id)
      if (!region || !this.visible || this.deferred) continue
      for (const presenter of this.presenters.values()) {
        if (
          !presenter.descriptor.regionIds.includes(id) ||
          !presenter.raster?.spec ||
          presenter.parked
        )
          continue
        presenter.raster.updateSpec(
          this.illuminate(presenter.raster.spec, region, presenter.descriptor, at),
        )
        presenter.raster.draw(0)
      }
    }
    for (const [id, state] of this.motions) {
      if (!this.interactionMoving(state, at)) continue
      if (state.motion.needsFrame) state.motion.sample(at, this.reducedMotion)
      state.press.sample(at, this.reducedMotion)
      this.presentMotion(id, state, at)
    }
  }
  /** A selection the page changed slides its thumb from wherever it is now (SelectionThumb). */
  private retargetSelections(regions: readonly GlassRegion[]) {
    const now = performance.timeOrigin + performance.now()
    for (const region of regions) {
      if (!region.selection) {
        this.thumbs.delete(region.id)
        continue
      }
      const thumb = this.thumbs.get(region.id)
      if (!thumb) {
        this.thumbs.set(region.id, new SelectionThumb(region.frame, region.selection))
        continue
      }
      thumb.configure(region.frame, region.selection)
      thumb.select(region.selection.index, now, this.reducedMotion)
    }
    for (const id of this.thumbs.keys())
      if (!regions.some(region => region.id === id)) this.thumbs.delete(id)
  }
  /** The finger on a segmented region's thumb. */
  private selectionInput(region: GlassRegion, input: GlassInteraction) {
    let thumb = this.thumbs.get(region.id)
    if (!thumb) {
      thumb = new SelectionThumb(region.frame, region.selection!)
      this.thumbs.set(region.id, thumb)
    }
    thumb.input(input, this.reducedMotion)
    this.presentSelection(region.id, performance.timeOrigin + performance.now())
  }
  /** The bar draws its pill where the thumb is; its lift overlay draws the lens over the bar. */
  private presentSelection(id: string, at: number) {
    const thumb = this.thumbs.get(id)
    const region = this.scene.regions.find(r => r.id === id)
    if (!thumb || !region?.selection || this.deferred || !this.visible) return
    thumb.sample(at, this.reducedMotion, this.appearance)
    for (const p of this.presenters.values()) {
      if (!p.descriptor.regionIds.includes(id) || p.descriptor.regionIds.length !== 1) continue
      if (!p.raster?.spec || p.parked) continue
      const base = selectionInk(
        regionSpec(region, p.descriptor, this.scene),
        this.sources.get(`foreground:${id}`)?.descriptor,
      )
      p.raster.updateSpec(this.posedSelection(base, region, p.descriptor, thumb, at))
      if (p.descriptor.role === 'lift') p.raster.setLift(thumb.lift())
      p.raster.draw(0)
    }
  }
  private illuminate(
    spec: SurfaceRenderSpec,
    region: GlassRegion,
    presenter: GlassPresenter,
    at: number,
  ) {
    const controller = this.touchLights.get(region.id)
    if (!controller) return spec
    const light = controller.sample(this.appearance, at)
    const frame = glassViewportFrame(region, this.scene.scrolls)
    return {
      ...spec,
      touchLight: light
        ? {
            ...light,
            x: light.x + frame.x - presenter.origin.x - spec.frameX,
            y: light.y + frame.y - presenter.origin.y - spec.frameY,
          }
        : undefined,
    }
  }
  /** A segmented region with its thumb where the motion has it, and its bar grown and lit while
   * a finger presses it (the segmented row of GLASS_CONTACT_PHYSICS). */
  private posedSelection(
    spec: SurfaceRenderSpec,
    region: GlassRegion,
    presenter: GlassPresenter,
    thumb: SelectionThumb,
    at: number,
  ) {
    return this.pressLight(thumb.pose(spec, region.selection!), region, presenter, {
      kind: 'segmented',
      light: thumb.touchLight,
      memberIndex: undefined,
      downAt: thumb.pressedAt,
      upAt: thumb.releasedAt,
      at,
    })
  }
  private presentMotion(
    id: string,
    {
      motion,
      press,
      downAt,
      upAt,
      lensCenter,
      contact,
    }: {
      motion: TabMotion
      press: InteractivePress
      downAt?: number
      upAt?: number
      lensCenter?: number
      contact?: InteractiveContact
    },
    at = performance.timeOrigin + performance.now(),
    present = true,
  ) {
    if (this.deferred || !this.visible) return
    const region = this.scene.regions.find(r => r.id === id)
    if (!region) return
    const control = region.material.control
    if (control) {
      // The lens is the lift overlay's moving lens (the tab selection's optics: rim, refraction
      // bands, exterior shadow); the material presenter stays transparent under it.
      for (const p of this.presenters.values())
        if (
          p.descriptor.role === 'lift' &&
          p.descriptor.regionIds.includes(id) &&
          p.raster?.spec &&
          !p.parked
        ) {
          const base = regionSpec(region, p.descriptor, this.scene)
          const lifted = press.amount > 0 || motion.lensMix > 0
          const lens = controlLensSpec(
            base,
            control,
            press.amount,
            lensCenter ?? base.frameWidth / 2,
          )
          p.raster.updateSpec({ ...lens, opacity: lifted ? 1 : 0 })
          p.raster.setLift({
            amount: lifted ? 1 : 0,
            source: 'transmissive',
            profile: 'control',
            glyphVibrancy: [0, 0],
            glyphLayout: 'content',
            capsule: lens.shape.first,
            optics: { ...motion.optics(), foregroundScaleX: 0, foregroundScaleY: 0 },
          })
          if (present) p.raster.draw(0)
        }
      return
    }
    const kind = glassContactKind(region.material)
    const pose = contact?.pose(at, this.reducedMotion) ?? GLASS_CONTACT_REST
    const light = contact?.light.sample(this.appearance, at)
    for (const p of this.presenters.values())
      if (p.descriptor.regionIds.includes(id) && p.raster?.spec && !p.parked) {
        const members = p.descriptor.regionIds
          .map(memberId => this.scene.regions.find(candidate => candidate.id === memberId))
          .filter((member): member is GlassRegion => member !== undefined)
        const memberIndex = members.findIndex(member => member.id === id)
        const base =
          members.length > 1
            ? fieldRegionSpec(members, p.descriptor, this.scene)
            : this.posedRegionSpec(
                region,
                p.descriptor,
                regionSpec(region, p.descriptor, this.scene),
                at,
              )
        const grown = pressedRegionSpec(base, press.amount, kind, memberIndex, pose)
        p.raster.updateSpec(
          this.pressLight(grown, region, p.descriptor, {
            kind,
            light,
            memberIndex: members.length > 1 ? memberIndex : undefined,
            downAt,
            upAt,
            at,
          }),
        )
        if (present) p.raster.draw(0)
      }
  }
  /**
   * The light of a pressed interactive shape: the menu's touch light at the finger
   * (InteractiveContact). Each kind's light is a row of GLASS_CONTACT_PHYSICS: a button-like
   * glass whitens across its shape on its measured curve; a surface's light is the menu field
   * scaled to native, over a held floor across the whole shape. In a field of several members the light stays inside the
   * pressed member's aperture (one member's light never spills onto its neighbours).
   */
  private pressLight(
    spec: SurfaceRenderSpec,
    region: GlassRegion,
    presenter: GlassPresenter,
    press: {
      kind: InteractivePressKind
      light: GlassTouchLight | undefined
      memberIndex: number | undefined
      downAt?: number
      upAt?: number
      at: number
    },
  ): SurfaceRenderSpec {
    const { kind, light, memberIndex, downAt, upAt, at } = press
    const physics = GLASS_CONTACT_PHYSICS[kind].light
    const surface = physics.kind === 'finger'
    if (downAt === undefined || (surface && !light)) return { ...spec, touchLight: undefined }
    // The light's own envelope (rise, release fade) shapes a surface's floor too.
    const envelope = light && surface ? Math.min(1, light.intensity / physics.menuPeak) : 0
    const floor = surface ? physics.floor * envelope : 0
    const intensity = surface
      ? (light?.intensity ?? 0) * physics.scale
      : interactiveHighlight(kind, this.appearance, downAt, upAt, at)
    // A press without a finger (a button driven only by its press state) whitens uniformly.
    if (!light)
      return memberIndex === undefined
        ? {
            ...spec,
            touchLight: undefined,
            tint: withHighlight(region.material.tint, Math.max(HIGHLIGHT_FLOOR, intensity)),
          }
        : {
            ...spec,
            touchLight: undefined,
            memberHighlight: {
              member: memberIndex,
              amount: Math.max(0, intensity - HIGHLIGHT_FLOOR) / (1 - HIGHLIGHT_FLOOR),
            },
          }
    const frame = glassViewportFrame(region, this.scene.scrolls)
    const touchLight: GlassTouchLight = {
      ...light,
      intensity,
      x: light.x + frame.x - presenter.origin.x - spec.frameX,
      y: light.y + frame.y - presenter.origin.y - spec.frameY,
    }
    if (memberIndex !== undefined)
      return {
        ...spec,
        touchLight: undefined,
        // The resting floor is already in the shared material. Composite only the remaining
        // floor and the touch light inside the pressed member's aperture.
        memberHighlight: {
          member: memberIndex,
          amount: Math.max(0, floor - HIGHLIGHT_FLOOR),
          light: touchLight,
        },
      }
    return {
      ...spec,
      tint: withHighlight(region.material.tint, Math.max(HIGHLIGHT_FLOOR, floor)),
      touchLight,
    }
  }
  setLensDebug(view: import('./lensDebug.ts').LensDebugView) {
    for (const p of this.presenters.values()) {
      p.raster?.setLensDebug(view)
      p.raster?.draw(0)
    }
  }
  private deferred = false
  private visible = true
  private sourceRevision?: number
  private sourcePending = false
  private topologyPending = false
  /** A capture cannot draw retained geometry from the previous root/layout. Keep its
   * last submitted pixels until the matching scene arrives; do not reset any motion. */
  beginSourceChange(revision: number) {
    this.sourceRevision = revision
    this.sourcePending = true
  }
  private submissionAllowed: () => boolean
  private owner: LayerDevice
  /** Worker-to-page events (a close morph that ended, so its panel can be torn down). */
  private notify: (event: GlassRegionEvent) => void
  private readonly chrome?: WebGPURaster
  constructor(
    owner: LayerDevice,
    notify: (event: GlassRegionEvent) => void = () => {},
    submissionAllowed: () => boolean = () => true,
    chrome?: WebGPURaster,
  ) {
    this.chrome = chrome
    this.submissionAllowed = () => !this.sourcePending && submissionAllowed()
    this.owner = owner
    this.notify = notify
  }
  async request(request: GlassRendererRequest): Promise<unknown> {
    switch (request.type) {
      case 'transaction': {
        this.deferred = true
        try {
          for (const operation of request.requests) await this.request(operation)
        } finally {
          this.deferred = false
        }
        await this.install()
        return this.presentationReceipt()
      }
      case 'initialize':
        if (request.protocol !== GLASS_RENDERER_PROTOCOL)
          throw Error('Unsupported glass renderer protocol')
        this.appearance = request.appearance
        this.reducedMotion = request.reducedMotion
        return
      case 'update-presenter': {
        const p = this.presenters.get(request.presenter.id)
        if (!p) throw Error('Missing glass presenter')
        // Rebase retained shapes only when the envelope moves within its container.
        // Scrolling translates both origins together; rebasing that translation makes
        // the next scene start a false spring and redraw the entire union every frame.
        const from = p.descriptor.fieldOrigin
        const to = request.presenter.fieldOrigin
        // A resizing container (for example a bottom-anchored composer) moves its
        // origin as part of the layout change. Preserve its previous screen pose
        // for the morph; only a size-preserving translation is ordinary scrolling.
        const resized =
          p.descriptor.width !== request.presenter.width ||
          p.descriptor.height !== request.presenter.height
        const translationX = from && to && !resized ? from.x - to.x : 0
        const translationY = from && to && !resized ? from.y - to.y : 0
        const offsetX = p.descriptor.origin.x - request.presenter.origin.x - translationX
        const offsetY = p.descriptor.origin.y - request.presenter.origin.y - translationY
        const previous = p.raster?.spec
        if (previous?.shape.members && (offsetX || offsetY)) {
          const shift = (spec: SurfaceRenderSpec): SurfaceRenderSpec => {
            const members = spec.shape.members!.map(member => ({
              ...member,
              centerX: member.centerX + offsetX,
              centerY: member.centerY + offsetY,
            }))
            return { ...spec, shape: { ...spec.shape, first: members[0], members } }
          }
          p.raster?.updateSpec(shift(previous))
          const motion = this.fields.get(request.presenter.id)
          if (motion) {
            motion.from = shift(motion.from)
            motion.to = shift(motion.to)
          }
        }
        p.descriptor = request.presenter
        return
      }
      case 'region-shape-track': {
        this.shapeTracks.set(request.regionId, request.track)
        this.scene = {
          ...this.scene,
          regions: this.scene.regions.map(region =>
            region.id === request.regionId ? { ...region, shapeTrack: request.track } : region,
          ),
        }
        return
      }
      case 'region-presentation-track': {
        // Late input from a previous modal show cannot move its replacement.
        this.scene = {
          ...this.scene,
          regions: this.scene.regions.map(region =>
            region.id === request.regionId &&
            region.presentationContentEpoch === request.contentEpoch
              ? { ...region, presentationViewportTrack: request.track }
              : region,
          ),
        }
        return
      }
      case 'presenter-viewport': {
        const presenter = this.presenters.get(request.id)
        // A queued geometry read can outlive its presenter during close/navigation.
        if (!presenter) return
        const viewport = request.viewport
        if (
          !Object.values(viewport).every(Number.isFinite) ||
          viewport.scaleX <= 0 ||
          viewport.scaleY <= 0
        )
          throw Error('Invalid glass viewport mapping')
        presenter.viewport = viewport
        presenter.keyboard = request.keyboard
        if (!presenter.raster || presenter.parked || presenter.suspended) return
        // An observation queued before the transition cannot take viewport ownership
        // back from its sampling track, or publish one frame at the old position.
        if (
          this.scene.regions.some(
            region =>
              (region.presentationViewportTrack ||
                region.accessoryViewportTrack ||
                region.accessoryTrack) &&
              presenter.descriptor.regionIds.includes(region.id),
          )
        )
          return
        if (request.keyboard) {
          // Draw from the worker frame after the backdrop has sampled this same clock.
          this.moved.add(presenter)
          return
        }
        presenter.raster.setViewport(viewport)
        if (this.visible && !this.deferred && presenter.raster.backdropStale())
          presenter.raster.draw(0)
        return
      }
      case 'attach-presenter': {
        if (this.presenters.has(request.presenter.id))
          throw Error('Duplicate glass presenter ' + request.presenter.id)
        if (
          request.presenter.width <= 0 ||
          request.presenter.height <= 0 ||
          !Number.isFinite(request.presenter.resolution) ||
          request.presenter.resolution <= 0
        )
          throw Error('Invalid glass presenter dimensions')
        this.presenters.set(request.presenter.id, {
          descriptor: request.presenter,
          canvas: request.canvas,
        })
        return
      }
      case 'detach-presenter': {
        const p = this.presenters.get(request.id)
        p?.raster?.dispose()
        this.owner.detach(request.id)
        this.presenters.delete(request.id)
        this.fields.delete(request.id)
        return
      }
      case 'scene': {
        if (
          this.sourceRevision !== undefined &&
          request.snapshot.sourceRevision !== this.sourceRevision
        )
          return { superseded: true, presented: [] }
        // Exclusions come from live DOM order; captured dialog planes retire later.
        // Never expose a departing plane by installing its close scene first. The
        // source batch and its matching scene release this hold without a timed delay.
        // Extra live owners may still be preparing their first plane. A reparented
        // region can change exclusions immediately when the captured order agrees.
        const owners = request.snapshot.backdropOwners
        if (owners) {
          const captured = [
            ...new Set(
              Backdrop.for(this.owner).layers.flatMap(layer => (layer.owner ? [layer.owner] : [])),
            ),
          ]
          const order = owners.filter(owner => captured.includes(owner))
          if (
            captured.length !== order.length ||
            captured.some((owner, index) => owner !== order[index])
          ) {
            this.topologyPending = true
            return { superseded: true, presented: [] }
          }
        }
        this.topologyPending = false
        if (request.snapshot.revision < this.scene.revision)
          throw Error('Stale glass scene revision')
        const budget = validateGlassRegions(
          request.snapshot.regions,
          Math.max(1, ...[...this.presenters.values()].map(p => p.descriptor.resolution)),
        )
        glassTiming('sample-pixel-budget', glassNow(), String(budget.samplePixels))
        for (const region of request.snapshot.regions) {
          if (
            !request.snapshot.layers.some(l => JSON.stringify(l) === JSON.stringify(region.layer))
          )
            throw Error('Undeclared glass region layer ' + region.layer.id)
          const presentation = region.material.treatment
          if (presentation) {
            const requiredVariant =
              presentation === 'sheet' ||
              presentation === 'expandedSheet' ||
              presentation === 'contextBackdrop' ||
              presentation === 'contextPreview'
                ? 'clear'
                : 'regular'
            if (
              region.material.tint ||
              region.material.variant !== requiredVariant ||
              region.material.interactive
            )
              throw Error('Unsupported named presentation material')
          }
          if (
            typeof region.shape === 'object' &&
            region.shape.cornerStyle === 'continuous' &&
            !presentation
          )
            throw Error('Unsupported continuous region corner profile')
        }
        for (const [id, state] of this.motions) {
          const before = this.scene.regions.find(r => r.id === id),
            after = request.snapshot.regions.find(r => r.id === id)
          if (
            after &&
            before &&
            (before.frame.width !== after.frame.width || before.frame.height !== after.frame.height)
          ) {
            state.motion.configure(
              [after.frame.width / 2],
              after.frame.width,
              after.frame.height,
              after.frame.width,
            )
            state.motion.reset(0)
            state.press.reset()
          }
        }
        this.retargetSelections(request.snapshot.regions)
        this.sourcePending = false
        for (const previous of this.scene.regions) {
          if (!request.snapshot.regions.some(region => region.id === previous.id))
            this.shapeTracks.delete(previous.id)
        }
        this.scene = {
          ...request.snapshot,
          regions: request.snapshot.regions.map(region =>
            this.shapeTracks.has(region.id)
              ? { ...region, shapeTrack: this.shapeTracks.get(region.id) }
              : region,
          ),
        }
        this.samplePixels = budget.samplePixels
        for (const id of this.touchLights.keys())
          if (!this.scene.regions.some(region => region.id === id && region.material.touchLight))
            this.touchLights.delete(id)
        for (const [id] of this.motions)
          if (!this.scene.regions.some(r => r.id === id)) this.motions.delete(id)
        const now = performance.timeOrigin + performance.now()
        for (const [id] of this.emerges)
          if (!this.scene.regions.some(r => r.id === id && r.emerge)) this.emerges.delete(id)
        for (const region of this.scene.regions) {
          if (!region.emerge) continue
          const state = this.emerges.get(region.id),
            direction = region.emerge.closing ? 'close' : 'open'
          const generation = region.emerge.generation,
            held = direction === 'open' && region.emerge.ready === false
          if (state && direction === 'close' && region.emerge.fading) {
            // Freeze the last frame actually presented, including its field/ink clock.
            state.frozen = true
            continue
          }
          if (!state)
            this.emerges.set(region.id, {
              direction,
              start: now,
              from: direction === 'open' ? { ...MENU_MORPH_ZERO } : menuMorphEndpoint('open'),
              velocity: { ...MENU_MORPH_ZERO },
              progress: direction === 'open' ? { ...MENU_MORPH_ZERO } : menuMorphEndpoint('open'),
              cornerFrom: { rounding: 0 },
              cornerVelocity: { rounding: 0 },
              corner: { rounding: 0 },
              generation,
              held,
              idiom: emergeProfile(region.emerge),
            })
          else if (state.frozen || state.direction !== direction || state.generation !== generation)
            this.emerges.set(region.id, {
              direction,
              // The phone close table's zero is the tap +45 ms; its scene arrives about 10 ms
              // sooner (Catalyst, native measurements), so the menu holds that long, as native does.
              start:
                direction === 'close' &&
                region.emerge.idiom === 'phone' &&
                region.emerge.sourceKind === undefined
                  ? now + MENU_PHONE_CLOSE_HOLD
                  : now,
              from: this.emergeSample(state, now).pose,
              velocity: this.emergeSample(state, now).velocity,
              // Continue from the material that was actually presented, using the same measured
              // curve over the remaining distance. Uninterrupted tracks retain their native fit.
              materialFrom:
                state.field?.recipeMix ??
                emergeRecipeMix(
                  region.emerge.sourceKind,
                  state.direction,
                  state.field?.ms ?? 0,
                  state.materialFrom,
                ),
              cornerFrom: state.corner,
              cornerVelocity: sampleMenuCorner(
                state.direction,
                now - state.start,
                state.cornerFrom,
                state.cornerVelocity,
              ).velocity,
              corner: state.corner,
              source: state.source,
              progress: state.progress,
              // A context close starts its clock at its first presented frame. The page hides its
              // live rows only after that frame (emerge-ink), so the one frame that shows both must
              // draw the ink exactly where the rows are; timed from the scene's arrival, it had
              // already moved and the rows showed twice (Music Home tile, 2026-10-14).
              shown:
                held || (direction === 'close' && region.emerge.sourceKind === 'context')
                  ? false
                  : state.shown,
              generation,
              held,
              idiom: emergeProfile(region.emerge),
            })
          else if (state.held !== held) {
            state.held = held
            state.shown = false
            state.start = now
          }
        }
        for (const [id, source] of this.sources)
          if (
            source.descriptor.role === 'foreground' &&
            !this.scene.regions.some(r => r.id === source.descriptor.regionId)
          ) {
            source.lease.release()
            this.sources.delete(id)
          }
        await this.install()
        return this.presentationReceipt()
      }
      case 'source': {
        if (
          request.source.role !== 'transmitted-backdrop' &&
          request.source.role !== 'foreground'
        ) {
          request.bitmap.close()
          throw Error('Unsupported glass source role ' + request.source.role)
        }
        if (
          request.bitmap.width <= 0 ||
          request.bitmap.height <= 0 ||
          request.source.width * request.source.resolution !== request.bitmap.width ||
          request.source.height * request.source.resolution !== request.bitmap.height
        ) {
          request.bitmap.close()
          throw Error('Invalid glass source bitmap dimensions')
        }
        const previous = this.sources.get(request.source.id)
        if (previous && previous.descriptor.revision > request.source.revision) {
          request.bitmap.close()
          throw Error(
            `Stale glass source revision: ${request.source.revision} after ${previous.descriptor.revision}`,
          )
        }
        const source = request.source,
          key =
            source.role === 'foreground'
              ? `${source.id}:${source.revision}`
              : (source.id === 'root-backdrop'
                  ? `production:${source.revision}`
                  : `region:${source.id}:${source.revision}`) + ':front'
        const lease = FrameGraph.for(this.owner).image(key, request.bitmap)
        previous?.lease.release()
        this.sources.set(source.id, { descriptor: source, bitmap: lease.value, lease })
        this.sourcesChanged = true
        // The settled capture after a navigation replaces its route atlas.
        if (source.id === 'root-backdrop') this.navigation = undefined
        await this.install()
        return this.presentationReceipt()
      }
      case 'release-source':
        this.drop(request.id)
        for (const p of this.presenters.values())
          if (p.sourceId === request.id) {
            p.raster?.clear()
            p.raster?.setCovered(true)
            p.covered = true
            p.key = undefined
            p.storageKey = undefined
          }
        return
      case 'interaction': {
        const input = request.interaction,
          region = this.scene.regions.find(r => r.id === input.regionId)
        if (!region) return
        if (region.selection) {
          this.selectionInput(region, input)
          return
        }
        if (region.material.touchLight) {
          let light = this.touchLights.get(region.id)
          if (!light) {
            light = new MenuTouchLight()
            this.touchLights.set(region.id, light)
          }
          light.input(input)
          return
        }
        if (!region.material.interactive) return
        if (!Number.isFinite(input.epoch)) throw Error('Invalid glass interaction epoch')
        let state = this.motions.get(region.id)
        if (state && input.epoch < state.epoch) return
        if (!state) {
          const motion = new TabMotion(TAB_INTERACTIVE_MOTION)
          motion.configure(
            [region.frame.width / 2],
            region.frame.width,
            region.frame.height,
            region.frame.width,
          )
          motion.reset(0)
          const profile = region.material.control
            ? controlLiftProfile(region.material.control)
            : undefined
          state = { motion, press: new InteractivePress(profile), epoch: 0 }
          this.motions.set(region.id, state)
        }
        state.epoch = input.epoch
        const { motion, press } = state
        if (region.material.control) {
          // The page owns activation and the thumb's position; the lens follows both. The tab
          // motion runs only for its lens optics: the control's own springs size the lens.
          if (input.contact) state.lensCenter = input.contact.x
          const x = state.lensCenter ?? region.frame.width / 2
          if (input.phase === 'rest' || this.reducedMotion) {
            press.reset()
            motion.reset(0)
          } else if (input.phase === 'pressed') {
            press.down(input.epoch)
            motion.down(x, 0, input.epoch)
          } else if (input.phase === 'dragging') motion.move(x)
          else if (input.phase === 'releasing') {
            press.up(input.epoch)
            motion.up(input.epoch)
          }
          this.presentMotion(region.id, state)
          return
        }
        // Each kind of interactive glass presses with its own row of the contact table; a region
        // whose kind changed (a toolbar item swapped in place) starts a contact of the new kind.
        const contactKind = glassContactKind(region.material)
        if (!state.contact || state.contactKind !== contactKind) {
          state.contact = new InteractiveContact(GLASS_CONTACT_PHYSICS[contactKind])
          state.contactKind = contactKind
        }
        // A press without a finger position (chrome buttons driven by their press state) lights
        // from the shape's centre.
        state.contact.input(
          input.phase === 'pressed' && !input.contact
            ? { ...input, contact: { x: region.frame.width / 2, y: region.frame.height / 2 } }
            : input,
        )
        if (input.phase === 'rest') {
          motion.reset(0)
          press.reset()
          state.downAt = undefined
          state.upAt = undefined
          this.presentMotion(region.id, state)
        } else if (this.reducedMotion) {
          motion.reset(0)
          press.reset()
          if (input.phase === 'pressed') {
            state.downAt = input.epoch
            state.upAt = undefined
          } else if (input.phase !== 'dragging') state.upAt = input.epoch
          this.presentMotion(region.id, state)
        } else if (input.phase === 'pressed') {
          motion.down(region.frame.width / 2, 0, input.epoch)
          press.down(input.epoch)
          state.downAt = input.epoch
          state.upAt = undefined
        } else if (input.phase === 'dragging')
          motion.move(input.contact?.x ?? region.frame.width / 2)
        else {
          motion.up(input.epoch)
          press.up(input.epoch)
          state.upAt = input.epoch
        }
        return
      }
      case 'morph':
        throw Error('Unsupported glass morph: worker morph material pending')
      case 'appearance':
        if (this.appearance === request.value && this.reducedMotion === request.reducedMotion)
          return
        this.appearance = request.value
        this.reducedMotion = request.reducedMotion
        if (this.reducedMotion)
          for (const [id, state] of this.motions) {
            state.motion.reset(0)
            state.press.reset()
            this.presentMotion(id, state)
          }
        await this.install(true)
        return
      case 'visibility':
        if (request.visible) {
          await this.prepareResume()
          this.present()
        } else {
          this.visible = false
          // The last frame's time is not a time to pose anything at after a resume.
          this.sampledAt = undefined
          this.touchLights.clear()
          for (const p of this.presenters.values()) {
            if (p.raster?.spec?.touchLight)
              p.raster.updateSpec({ ...p.raster.spec, touchLight: undefined })
            p.raster?.setVisible(false)
            if (p.descriptor.role === 'lift' && p.raster?.spec)
              p.raster.setLift({
                amount: 0,
                source: 'transmissive',
                optics: new TabMotion().optics(),
              })
          }
          for (const state of this.motions.values()) {
            state.motion.reset(0)
            state.press.reset()
            state.downAt = undefined
            state.upAt = undefined
            state.contact = undefined
          }
        }
        return
      case 'purge':
        return this.request({ type: 'visibility', visible: false })
      case 'restore':
        return this.request({ type: 'visibility', visible: true })
      case 'diagnostics':
        return this.diagnostics()
      case 'dispose':
        for (const [id, p] of this.presenters) {
          p.raster?.dispose()
          this.owner.detach(id)
        }
        this.presenters.clear()
        this.shapeTracks.clear()
        this.touchLights.clear()
        for (const source of this.sources.values()) source.lease.release()
        this.sources.clear()
        this.emptyForeground?.release()
        this.emptyForeground = undefined
        return
    }
  }
  /** New source images (uploads) since the last install: only those need a completion fence. */
  private presentationReceipt() {
    if (this.topologyPending) return { superseded: true, presented: [] }
    return {
      navigation: this.navigation?.key,
      presented: (this.submissionAllowed() ? [...this.presenters.values()] : [])
        .filter(
          p => p.descriptor.role === 'material' && p.raster?.spec && !p.covered && this.visible,
        )
        .flatMap(p =>
          p.descriptor.regionIds.filter(id => {
            const region = this.scene.regions.find(region => region.id === id)
            const sheetEpoch = region?.presentationContentEpoch
            const accessoryEpoch = region?.accessoryViewportTrack?.epoch
            return (
              (sheetEpoch === undefined || p.presentationContentEpoch === sheetEpoch) &&
              (accessoryEpoch === undefined || p.accessoryContentEpoch === accessoryEpoch)
            )
          }),
        ),
    }
  }
  private sourcesChanged = false
  private async install(force = false) {
    if (!this.appearance) throw Error('Glass material requires a presented appearance')
    if (this.deferred || this.sourcePending) return
    let fence = force || this.sourcesChanged
    this.sourcesChanged = false
    const installed: NonNullable<ReturnType<typeof this.presenters.get>>[] = []
    for (const p of this.presenters.values()) {
      const members = this.scene.regions.filter(r => p.descriptor.regionIds.includes(r.id))
      const region = this.scene.regions.find(r => r.id === p.descriptor.regionIds[0])
      if (!region) {
        if (!p.covered) p.raster?.clear()
        p.raster?.setCovered(true)
        p.covered = true
        continue
      }
      if (region.layer.id !== p.descriptor.layerId)
        throw Error('Glass presenter/region layer mismatch')
      const resumed = !!p.suspended && !region.suspended
      p.suspended = !!region.suspended
      // The root transmitted capture is in viewport/content coordinates. A layer
      // may instead provide its own capture; no frosted source is substituted.
      const source =
        [...this.sources.values()].find(
          s =>
            s.descriptor.role === 'transmitted-backdrop' &&
            s.descriptor.layerId === region.layer.id,
        ) ??
        [...this.sources.values()].find(
          s => s.descriptor.role === 'transmitted-backdrop' && s.descriptor.layerId === 'chrome',
        )
      if (!source) continue
      const frame = glassViewportFrame(region, this.scene.scrolls)
      const inset = contextSampleInset(region.material.treatment)
      const reach = region.accessoryReach
      const held = !!region.accessoryTrack?.held
      const bounds = region.emerge
        ? glassPresenterBounds(frame, inset, region.emerge)
        : glassPresenterBounds(reach ? frameUnion(frame, reach) : frame, inset)
      if (!region.container)
        p.descriptor = {
          ...p.descriptor,
          origin: { x: bounds.x, y: bounds.y },
          width: bounds.width,
          height: bounds.height,
        }
      if (this.chrome) {
        if (region.accessoryTrack?.held && p.descriptor.role === 'material')
          p.raster?.joinPresentation(this.chrome, p.descriptor.origin)
        else p.raster?.leavePresentation()
      }
      const viewportTrack =
        region.presentationViewportTrack ?? region.accessoryViewportTrack ?? region.accessoryTrack
      const accessoryTranslation =
        viewportTrack && !held ? accessoryOffset(viewportTrack, this.trackClock()) : undefined
      const viewport = held
        ? { x: p.descriptor.origin.x, y: p.descriptor.origin.y, scaleX: 1, scaleY: 1 }
        : accessoryTranslation
          ? {
              x: p.descriptor.origin.x + accessoryTranslation.x,
              y: p.descriptor.origin.y + accessoryTranslation.y,
              scaleX: 1,
              scaleY: 1,
            }
          : p.viewport
      // installRetained can draw immediately. Its first sample must use the same
      // track-owned viewport as later frames, before the ink handoff is acknowledged.
      if (!p.suspended && viewport) p.raster?.setViewport(viewport)
      const emerging = this.emerges.get(region.id)
      let spec = region.container
        ? fieldRegionSpec(members, p.descriptor, this.scene)
        : emerging
          ? emergeRegionSpec(
              regionSpec(region, p.descriptor, this.scene),
              region,
              p.descriptor,
              emerging.progress,
              emerging.corner,
              emerging.source,
              emerging.field ?? {
                direction: emerging.direction,
                ms: 0,
                pressHighlight: 0,
                settled: false,
                recipeMix: emerging.materialFrom,
              },
              this.appearance,
            )
          : regionSpec(region, p.descriptor, this.scene)
      const memberIds = region.container ? members.map(member => member.id) : undefined
      if (members.some(member => member.shapeTrack)) this.fields.delete(p.descriptor.id)
      if (
        memberIds &&
        !members.some(member => member.shapeTrack) &&
        p.raster?.spec?.shape.members
      ) {
        const previous = p.raster.spec
        const running = this.fields.get(p.descriptor.id)
        const previousIds = running?.memberIds ?? p.fieldMemberIds ?? memberIds
        const membershipChanged =
          previousIds.length !== memberIds.length ||
          memberIds.some((id, index) => id !== previousIds[index])
        if (
          membershipChanged ||
          JSON.stringify((running?.to ?? previous).shape.members) !==
            JSON.stringify(spec.shape.members)
        ) {
          const start = performance.timeOrigin + performance.now()
          const previousIndexes = memberIds.map(id => previousIds.indexOf(id))
          if (region.container?.continuous) {
            if (running) {
              const followed = spec.shape.members!.map((target, index) =>
                followFieldTarget(
                  running.from.shape.members![previousIndexes[index]] ?? target,
                  running.to.shape.members![previousIndexes[index]] ?? target,
                  target,
                ),
              )
              running.from = {
                ...spec,
                shape: { ...spec.shape, first: followed[0], members: followed },
              }
              running.to = spec
              running.velocity = previousIndexes.map(
                index => running.velocity[index] ?? ZERO_FIELD_VELOCITY,
              )
              running.memberIds = memberIds
              const sampled = spec.shape.members!.map(
                (target, index) =>
                  sampleFieldMember(
                    followed[index],
                    target,
                    running.velocity[index] ?? ZERO_FIELD_VELOCITY,
                    start - running.start,
                    this.reducedMotion,
                  ).value,
              )
              spec = { ...spec, shape: { ...spec.shape, first: sampled[0], members: sampled } }
            }
          } else {
            const samples = spec.shape.members!.map((target, index) =>
              running
                ? sampleFieldMember(
                    running.from.shape.members![previousIndexes[index]] ?? target,
                    running.to.shape.members![previousIndexes[index]] ?? target,
                    running.velocity[previousIndexes[index]] ?? ZERO_FIELD_VELOCITY,
                    start - running.start,
                    this.reducedMotion,
                  )
                : {
                    value: previous.shape.members![previousIndexes[index]] ?? target,
                    velocity: ZERO_FIELD_VELOCITY,
                  },
            )
            const fromMembers = samples.map(sample => sample.value)
            const fromSpec = {
              ...spec,
              shape: { ...spec.shape, first: fromMembers[0], members: fromMembers },
            }
            this.fields.set(p.descriptor.id, {
              start,
              from: fromSpec,
              to: spec,
              velocity: samples.map(sample => sample.velocity),
              memberIds,
            })
            glassTiming('field-morph-start', start, p.descriptor.id)
            members.forEach((member, index) => {
              const from = fromMembers[index]
              const to = spec.shape.members?.[index]
              if (!from || !to) return
              const velocity = samples[index].velocity
              this.notify({
                type: 'field-motion',
                regionId: member.id,
                start,
                duration: this.reducedMotion ? 0 : FIELD_MOTION_DURATION,
                offsetX: from.centerX - to.centerX,
                offsetY: from.centerY - to.centerY,
                scaleX: from.halfWidth / to.halfWidth,
                scaleY: from.halfHeight / to.halfHeight,
                velocityX: velocity.centerX,
                velocityY: velocity.centerY,
                velocityScaleX: velocity.halfWidth / to.halfWidth,
                velocityScaleY: velocity.halfHeight / to.halfHeight,
              })
            })
            spec = fromSpec
          }
        } else if (running) spec = { ...spec, shape: previous.shape }
      }
      if (memberIds) p.fieldMemberIds = memberIds
      const sourceScroll =
        source.descriptor.layerId === 'chrome'
          ? this.scene.scrolls.find(s => s.id === 'webgpu-source-root')
          : undefined
      const baseSourceOrigin = {
        x: p.descriptor.origin.x - source.descriptor.origin.x + (sourceScroll?.offsetX ?? 0),
        y: p.descriptor.origin.y - source.descriptor.origin.y + (sourceScroll?.offsetY ?? 0),
      }
      p.accessorySourceOrigin = viewportTrack && !held ? baseSourceOrigin : undefined
      const sourceOrigin =
        region.presentationViewportTrack && accessoryTranslation
          ? {
              x: baseSourceOrigin.x + accessoryTranslation.x,
              y: baseSourceOrigin.y + accessoryTranslation.y,
            }
          : baseSourceOrigin
      const foreground = this.sources.get(`foreground:${region.id}`)
      if (region.accessoryTrack && foreground)
        spec = accessoryPose(spec, region.accessoryTrack, this.trackClock(), foreground.descriptor)
      if (region.shapeTrack && !region.container)
        spec = this.shapeAt(region, spec, region.shapeTrack, this.trackClock())
      if (region.selection) spec = selectionInk(spec, foreground?.descriptor)
      const thumb = this.thumbs.get(region.id)
      if (region.selection && thumb)
        spec = this.posedSelection(
          spec,
          region,
          p.descriptor,
          thumb,
          performance.timeOrigin + performance.now(),
        )
      spec = this.illuminate(spec, region, p.descriptor, performance.timeOrigin + performance.now())
      const materialKey = JSON.stringify([spec, foreground?.descriptor, this.appearance])
      if (p.suspended) {
        // Held: backdrop changes do not redraw it. Its canvas keeps its pixels until the region's
        // own inputs change (or its canvas lost them): then it is repainted below exactly as an
        // unheld region would be, never left showing an old appearance or size.
        this.moved.delete(p)
        // Never drawn (it mounted while its tab was hidden, or its only draw failed): the planes
        // installed now are another tab's. It stays empty and parked; its own tab's commit is its
        // first sample.
        if (!p.materialKey) {
          p.parked = true
          continue
        }
        if (p.materialKey === materialKey && !p.repaint) continue
      }
      // The composed screen backdrop is sampled at the presenter's current viewport position.
      p.raster?.setViewportOrigin(p.descriptor.origin)
      if (
        p.descriptor.role === 'lift' &&
        !foreground &&
        region.material.press !== 'button' &&
        region.material.press !== 'bar' &&
        !region.material.control
      )
        continue
      // Over the settled chrome backdrop a running navigation's atlas is the source (viewport space).
      // A held presenter belongs to a tab that is not on screen: the navigation is not under it, and
      // its repaint must be presented now (the atlas path defers that), before it is parked again.
      // The DOM removes its zoom registration at settlement before the fresh source
      // batch arrives. Keep this presenter's accepted route until that batch retires
      // the atlas; dropping it here briefly samples the previous page's plane.
      const zoomRoute = region.zoomRoute ?? (this.navigation ? p.zoomRoute : undefined)
      const navigation =
        (source.descriptor.layerId === 'chrome' || zoomRoute !== undefined) && !p.suspended
          ? this.navigation
          : undefined
      const key = JSON.stringify([
          spec,
          sourceOrigin,
          source.descriptor,
          foreground?.descriptor,
          this.appearance,
          navigation?.key,
          zoomRoute,
        ]),
        storageKey = JSON.stringify([
          spec,
          source.descriptor,
          foreground?.descriptor,
          this.appearance,
          navigation?.key,
          zoomRoute,
        ])
      // Releasing a prewarmed pose changes no texture key. Start and submit its
      // timeline before a scene receipt can release the DOM rows.
      if (emerging && !emerging.held && !emerging.shown && p.raster?.spec && !navigation)
        this.presentEmerge(region.id, performance.timeOrigin + performance.now())
      // A retained scene key is not a submission for a new motion epoch. Install material
      // once for each sheet entrance or accessory run before acknowledging that run. The
      // two epochs stay independent when an accessory is nested inside a presentation.
      const presentationDraw =
        (region.presentationContentEpoch !== undefined &&
          p.presentationContentEpoch !== region.presentationContentEpoch) ||
        (region.accessoryViewportTrack !== undefined &&
          p.accessoryContentEpoch !== region.accessoryViewportTrack.epoch)
      if (presentationDraw) fence = true
      if (
        !force &&
        !presentationDraw &&
        p.key !== key &&
        p.storageKey === storageKey &&
        p.raster?.spec &&
        !p.covered
      ) {
        p.raster.setSourceOrigin(
          navigation ? { x: p.descriptor.origin.x, y: p.descriptor.origin.y } : sourceOrigin,
        )
        p.key = key
        if (p.raster.backdropStale() || !Backdrop.for(this.owner).installed) this.moved.add(p)
        continue
      }
      if (!force && !presentationDraw && p.key === key) {
        p.raster?.setCovered(false)
        if (p.covered) p.raster?.draw(0)
        // The backdrop may have moved while the region was held (nothing redrew it then).
        else if (resumed && p.raster?.spec && p.raster.backdropStale()) this.moved.add(p)
        p.covered = false
        continue
      }
      if (!p.raster) {
        p.raster = new WebGPURaster()
        if (viewport) p.raster.setViewport(viewport)
        p.raster.setSubmissionGate(this.submissionAllowed)
        await p.raster.init(p.canvas, this.owner, region.layer, p.descriptor)
        if (this.chrome && region.accessoryTrack?.held && p.descriptor.role === 'material')
          p.raster.joinPresentation(this.chrome, p.descriptor.origin)
        p.raster.setVisible(this.visible)
        fence = true
      }
      if (!foreground && !this.emptyForeground)
        this.emptyForeground = FrameGraph.for(this.owner).image(
          'region:empty',
          await createImageBitmap(new ImageData(1, 1)),
        )
      const glyphs = foreground?.lease ?? this.emptyForeground!
      p.raster.setCovered(false)
      p.raster.installRetained(
        {
          viewportOrigin: p.descriptor.origin,
          spec,
          liftOverlay: p.descriptor.role === 'lift',
          lift:
            p.descriptor.role === 'lift'
              ? { amount: 0, source: 'transmissive', optics: new TabMotion().optics() }
              : undefined,
          navigationAtlas: navigation ? navigation.routes : 1,
          ...(navigation
            ? {
                contentLayer: navigation.contentLayer,
                navigationCoverage: {
                  width: navigation.width,
                  height: navigation.height,
                  rows: navigation.rows ?? [{ top: 0, bottom: navigation.height }],
                },
              }
            : {}),
          appearance: this.appearance,
          sourceWidth: navigation ? navigation.width : source.descriptor.width,
          sourceOrigin: navigation
            ? { x: p.descriptor.origin.x, y: p.descriptor.origin.y }
            : sourceOrigin,
          sourceKey: navigation
            ? navigation.key
            : source.descriptor.id === 'root-backdrop'
              ? `production:${source.descriptor.revision}`
              : `region:${source.descriptor.id}:${source.descriptor.revision}`,
          glyphKey: foreground
            ? `${foreground.descriptor.id}:${foreground.descriptor.revision}`
            : 'region:empty',
          width: p.descriptor.width,
          height: p.descriptor.height,
          resolution: p.descriptor.resolution,
        },
        navigation ? navigation.lease : source.lease,
        glyphs,
        !navigation,
      )
      p.navigation = navigation?.key
      p.zoomRoute = zoomRoute
      // A running track draws every presenter in its next worker frame: no extra draw here.
      if (navigation?.pose)
        p.raster.setNavigation(this.presenterNavigationPose(navigation.pose, p.zoomRoute))
      installed.push(p)
      p.key = key
      p.storageKey = storageKey
      p.materialKey = materialKey
      p.repaint = false
      this.moved.delete(p)
      p.covered = false
      p.sourceId = source.descriptor.id
      const state = this.motions.get(region.id)
      if (state)
        this.presentMotion(
          region.id,
          state,
          performance.timeOrigin + performance.now(),
          !navigation,
        )
      if (this.emerges.has(region.id))
        this.presentEmerge(region.id, performance.timeOrigin + performance.now(), !navigation)
      if (navigation && !navigation.deferPresent && this.visible) p.raster.draw(0)
      // A parked presenter repainted while still held goes back to holding pixels only. A held
      // presenter whose draw could not be submitted (the renderer presents an appearance change
      // in one step, later) still shows the old appearance: it keeps its setup until `present`
      // has drawn it, and is parked then.
      if (
        region.accessoryTrack &&
        p.accessoryEpoch !== region.accessoryTrack.epoch &&
        foreground &&
        this.visible &&
        !this.deferred &&
        this.submissionAllowed()
      ) {
        // A held-still canvas already samples where it is (see the install viewport above).
        const offset = region.accessoryTrack.held
          ? { x: 0, y: 0 }
          : accessoryOffset(region.accessoryTrack, this.trackClock())
        // The DOM viewport observer is paused for this sampling track. Update the
        // sampling viewport itself: an older liveViewport overrides viewportOrigin.
        p.raster.setViewport({
          x: p.descriptor.origin.x + offset.x,
          y: p.descriptor.origin.y + offset.y,
          scaleX: 1,
          scaleY: 1,
        })
        p.raster.setSourceOrigin({ x: sourceOrigin.x + offset.x, y: sourceOrigin.y + offset.y })
        p.raster.draw(0)
        p.accessoryEpoch = region.accessoryTrack.epoch
        this.notify({
          type: 'accessory-ink',
          regionId: region.id,
          epoch: region.accessoryTrack.epoch,
        })
      }
      const submitted = this.submissionAllowed()
      if (submitted && this.visible && !navigation?.deferPresent) {
        p.presentationContentEpoch = region.presentationContentEpoch
        p.accessoryContentEpoch = region.accessoryViewportTrack?.epoch
      }
      const holdsPixelsOnly = !!p.suspended && (!!p.parked || !!p.parkAfterPresent)
      if (holdsPixelsOnly && submitted) this.park(p)
      else {
        p.parkAfterPresent = !!p.suspended && (holdsPixelsOnly || !submitted)
        p.parked = false
      }
    }
    // Every presenter uses this one ordered device queue. One completion fence covers a
    // transaction that uploaded sources or created presenters; a geometry-only update (a
    // presentation moving or resizing) is not fenced, so it never blocks the worker's queue
    // behind GPU completion. Its GPU errors still surface through the draw scopes.
    if (!fence) return
    try {
      await installed.at(-1)?.raster?.settled()
    } catch (error) {
      // The draws of this install are not known to have completed: none of it counts as drawn.
      for (const p of installed) {
        p.key = undefined
        p.storageKey = undefined
        p.materialKey = undefined
        p.repaint = true
        p.presentationContentEpoch = undefined
        p.accessoryContentEpoch = undefined
      }
      throw error
    }
  }
  async prepareResume() {
    // Retained viewport and accessory tracks are posed where they are now, before anything is
    // drawn: the first resumed frame showed the pose sampled before the hide (an accessory
    // halfway between its rows). Not visible yet, so this only poses.
    this.sampledAt = undefined
    this.presentTrackedViewport(performance.timeOrigin + performance.now())
    this.visible = true
    for (const p of this.presenters.values()) p.raster?.setVisible(true, true)
    // After an app resume or a device restore (the page's fresh appearance reply arrives here for
    // both): a parked presenter of a region that is on screen has nothing to draw its pixels from,
    // so it is installed again. A hidden tab's parked presenter stays parked: the only planes
    // installed are another tab's, and its own tab's commit is its next draw.
    if (this.repaintVisibleParked()) await this.install()
  }
  present() {
    if (!this.visible || this.sourcePending) return
    // A parked presenter holds pixels only: it has nothing to draw until it is installed again.
    for (const p of this.presenters.values()) {
      if (p.parked) continue
      p.raster?.draw(0)
      // Held, and repainted while nothing could be submitted: drawn now, it holds pixels again.
      if (p.parkAfterPresent && this.submissionAllowed()) this.park(p)
    }
  }
  navigationRasters() {
    return [...this.presenters.values()]
      .filter(
        p =>
          p.navigation === this.navigation?.key && !!p.navigation && p.raster?.spec && !p.covered,
      )
      .map(p => p.raster!)
  }
  async snapshot(id: string) {
    const raster = this.presenters.get(id)?.raster
    if (!raster) throw Error('Unknown glass presenter snapshot ' + id)
    return raster.snapshot()
  }
  /** Geometry sampled for the frame trace, in viewport points. No DOM measurements. */
  accessoryGeometry() {
    return JSON.stringify(
      [...this.presenters.values()].flatMap(p => {
        const region = this.scene.regions.find(r => r.id === p.descriptor.regionIds[0])
        const spec = p.raster?.spec
        if (!region?.accessoryTrack || !spec || p.descriptor.role !== 'material') return []
        const shape = spec.shape.first
        return [
          {
            region: region.id,
            left: p.descriptor.origin.x + spec.frameX + shape.centerX - shape.halfWidth,
            right: p.descriptor.origin.x + spec.frameX + shape.centerX + shape.halfWidth,
            top: p.descriptor.origin.y + spec.frameY + shape.centerY - shape.halfHeight,
            inkLayers: spec.ink?.layers.length ?? 0,
          },
        ]
      }),
    )
  }
  diagnostics() {
    return {
      navigation: this.navigation
        ? { key: this.navigation.key, pose: this.navigation.pose }
        : undefined,
      drawableCosts: drawableCosts(),
      samplePixels: this.samplePixels,
      presenterCosts: [...this.presenters.values()].map(p => ({
        id: p.descriptor.id,
        regions: p.descriptor.regionIds,
        role: p.descriptor.role,
        zoomRoute: p.zoomRoute,
        width: p.canvas.width,
        height: p.canvas.height,
        stats: p.raster ? { ...p.raster.stats } : null,
        presentation: p.raster?.presentation() ?? null,
      })),
      presenterOrigins: [...this.presenters.values()].map(p => [
        p.descriptor.regionIds[0],
        p.descriptor.role,
        Math.round(p.descriptor.origin.x),
        Math.round(p.descriptor.origin.y),
        Math.round(p.descriptor.width),
        (p.raster?.composedBackdropKey ?? '').slice(0, 160),
        p.key ? JSON.parse(p.key)[2]?.revision : undefined,
        p.covered,
      ]),
      // What each presenter last drew: where its glass frame sits in the canvas, how wide the
      // capsule is and how many ink layers the renderer drew over it (0: the page owns the ink).
      regionPoses: [...this.presenters.values()].map(p => {
        const spec = p.raster?.spec
        const id = p.descriptor.regionIds[0]!
        const region = this.scene.regions.find(candidate => candidate.id === id)
        return {
          region: id,
          accessoryTrack: region?.accessoryTrack
            ? { epoch: region.accessoryTrack.epoch, held: !!region.accessoryTrack.held }
            : null,
          foreground: this.sources.has(`foreground:${id}`),
          interaction: this.motions.has(id),
          role: p.descriptor.role,
          canvas: { x: p.descriptor.origin.x, y: p.descriptor.origin.y, width: p.descriptor.width },
          frame: spec ? { x: spec.frameX, y: spec.frameY } : null,
          capsuleWidth: spec ? spec.shape.first.halfWidth * 2 : null,
          inkLayers: spec?.ink?.layers.length ?? 0,
          covered: p.covered,
          parked: !!p.parked,
        }
      }),
      interactions: [...this.motions].map(([id, s]) => ({
        id,
        epoch: s.epoch,
        active: s.motion.active,
        pending: s.motion.needsFrame || s.press.needsFrame,
        amount: s.motion.lensMix,
        press: s.press.amount,
        model: 'retained-material',
      })),
      backend: 'webgpu',
      canvasContexts: this.owner.stats?.canvasContexts ?? 0,
      devices: this.owner.liveDevice ? 1 : 0,
      draws: [...this.presenters.values()].reduce((n, p) => n + (p.raster?.stats.draws ?? 0), 0),
      submissions: [...this.presenters.values()].reduce(
        (n, p) => n + (p.raster?.stats.submissions ?? 0),
        0,
      ),
      presenters: this.presenters.size,
      regions: this.scene.regions.length,
      sources: this.sources.size,
      retainedSourceBytes: [...this.sources.values()].reduce(
        (n, s) => n + s.bitmap.width * s.bitmap.height * 4,
        0,
      ),
      visible: this.visible,
      scene: this.scene,
    }
  }
}
