import type { GlassInteraction } from '../rendererContract.ts'
import type { GlassRegion } from '../regions.ts'
import type { GlassTouchLight, SurfaceRenderSpec, TabSelectionShape } from '../renderSpecs.ts'
import { SCOPE_THUMB_HELD, SCOPE_THUMB_MOTION } from '../lens/controlLift.ts'
import { SCOPE_THUMB, segmentCentres } from '../lens/scopeSegments.ts'
import { TabMotion } from '../lens/tabMotion.ts'
import { InteractivePress, interactivePressScale } from '../lens/interactivePress.ts'
import { InteractiveContact } from '../lens/interactiveContact.ts'
import { GLASS_CONTACT_PHYSICS } from '../contactPhysics.ts'
import { stableTabSelection } from '../lens/tabSelectionMaterial.ts'

type Selection = NonNullable<GlassRegion['selection']>
type Frame = GlassRegion['frame']

/**
 * The selection thumb of a segmented glass region (the search scope bar). It is the tab bar's
 * thumb: one TabMotion presses, follows the finger, stretches, snaps to the nearest segment and
 * slides between segments, with the scope bar's parameters (SCOPE_THUMB_MOTION, SCOPE_THUMB_HELD).
 * The page's finger arrives as glass interactions; a selection the page changes without a finger
 * (a tap's click, keyboard, VoiceOver, the app) slides the thumb the same way.
 *
 * A press anywhere on the bar also presses the bar itself, with the interactive glass press
 * (GLASS_CONTACT_PHYSICS.segmented): the bar grows wider, its pill and labels grow with it, and it
 * lights under the finger.
 */
export class SelectionThumb {
  readonly motion = new TabMotion(SCOPE_THUMB_MOTION, SCOPE_THUMB_HELD)
  /** The bar's press growth (0 rest, 1 held) and its light under the finger. */
  readonly press = new InteractivePress()
  readonly contact = new InteractiveContact(GLASS_CONTACT_PHYSICS.segmented)
  /** The light under the finger at the last sample. */
  touchLight?: GlassTouchLight
  /** When the current press began and ended (the press light's clock). */
  pressedAt?: number
  releasedAt?: number
  /** The segment the thumb is heading to: the page's selection once it catches up. */
  private target = 0
  private geometry = ''

  constructor(frame: Frame, selection: Selection) {
    this.configure(frame, selection)
    this.motion.reset(selection.index)
    this.target = selection.index
  }

  /** Keeps the motion's segments on the region's current size and count. */
  configure(frame: Frame, selection: Selection) {
    const geometry = [frame.width, frame.height, selection.count].join(',')
    if (geometry === this.geometry) return
    this.geometry = geometry
    const segment = (frame.width - 2 * SCOPE_THUMB.inset) / Math.max(1, selection.count)
    this.motion.configure(
      segmentCentres(frame.width, selection.count),
      segment,
      SCOPE_THUMB.height,
      frame.width,
      {
        selected: this.target,
        centerY: frame.height / 2,
        parameters: SCOPE_THUMB_MOTION,
        heldGeometry: SCOPE_THUMB_HELD,
      },
    )
  }

  /** The page selected `index` (after a tap, or programmatically). A drag's release already
   * headed there, so only a different segment starts a slide. */
  select(index: number, now: number, reducedMotion: boolean) {
    if (index === this.target) return
    this.target = index
    if (reducedMotion) this.motion.reset(index)
    else this.motion.select(index, now)
  }

  /** The finger, in region-local CSS px. A cancelled contact returns to the page's selection.
   * Only a press on the selected segment grabs the thumb: native holds the pill in place under a
   * press on another segment (that press dims its label and selects on release, as a tap). */
  input(input: GlassInteraction, reducedMotion: boolean) {
    this.pressBar(input, reducedMotion)
    const x = input.contact?.x
    if (input.phase === 'rest' || reducedMotion) {
      this.motion.reset(this.target)
      return
    }
    if (input.phase === 'pressed' && x !== undefined) {
      if (this.motion.nearest(x) === this.target) this.motion.down(x, this.target, input.epoch)
    } else if (input.phase === 'dragging' && x !== undefined) {
      this.motion.move(x)
    } else if (input.phase === 'releasing') {
      if (x !== undefined) this.motion.move(x)
      const released = this.motion.up(input.epoch, false, this.target)
      if (released !== undefined) this.target = released
    }
  }

  /** The bar's own press: growth on the shared press spring, light from the contact. */
  private pressBar(input: GlassInteraction, reducedMotion: boolean) {
    this.contact.input(input)
    if (input.phase === 'rest') {
      this.press.reset()
      this.pressedAt = undefined
      this.releasedAt = undefined
      return
    }
    if (input.phase === 'pressed') {
      this.pressedAt = input.epoch
      this.releasedAt = undefined
    } else if (input.phase === 'releasing') this.releasedAt = input.epoch
    if (reducedMotion) this.press.reset()
    else if (input.phase === 'pressed') this.press.down(input.epoch)
    else if (input.phase === 'releasing') this.press.up(input.epoch)
  }

  /** Whether the thumb still moves, the bar is still pressed or its light still fades. */
  live(at: number) {
    // The bar holds its place, so only the contact's light (not its pose) can still be moving.
    return this.motion.active || this.press.needsFrame || this.contact.light.needsFrame(at)
  }

  sample(at: number, reducedMotion: boolean, appearance: 'light' | 'dark') {
    if (this.motion.needsFrame) this.motion.sample(at, reducedMotion)
    this.press.sample(at, reducedMotion)
    this.touchLight = this.contact.light.sample(appearance, at)
  }

  /** The region's spec with the thumb where the motion has it. The resting pill gives way to the
   * lift overlay's lens as the press rises (the tab bar's `restMix`). */
  pose(spec: SurfaceRenderSpec, selection: Selection): SurfaceRenderSpec {
    const posed = {
      ...spec,
      tabSelection: {
        ...selectionPill(spec, selection),
        capsule: this.motion.capsule(),
        lensMix: 0,
        restMix: 1 - this.motion.lensMix,
      },
    }
    return pressedBar(posed, this.press.amount)
  }

  /** The lift overlay's lens: the tab selection's lens over the composed bar. */
  lift() {
    return {
      amount: this.motion.lensMix,
      source: 'composed' as const,
      optics: this.motion.optics(),
    }
  }
}

/** The resting selection pass of a segmented region: the native pill at `selection.index`. The
 * labels are the region's foreground ink (selectionInk), one glyph anchor per end segment. */
export function selectionPill(spec: SurfaceRenderSpec, selection: Selection): TabSelectionShape {
  const { height } = SCOPE_THUMB
  const centres = segmentCentres(spec.frameWidth, selection.count)
  const index = Math.max(0, Math.min(selection.count - 1, Math.round(selection.index)))
  const width =
    centres.length > 1 ? centres[1] - centres[0] : spec.frameWidth - 2 * SCOPE_THUMB.inset
  return {
    ...stableTabSelection('light'),
    glyphCount: selection.count,
    glyphAnchors: [centres[0], centres[centres.length - 1]] as const,
    lensMix: 0,
    capsule: {
      centerX: centres[index],
      centerY: spec.frameHeight / 2,
      halfWidth: width / 2,
      halfHeight: height / 2,
      radius: height / 2,
    },
  }
}

/**
 * The pressed scope bar (native: 400 → 416 pt wide, 36 pt tall throughout). The glass grows wider
 * but not taller; the pill and the labels (the region's ink) grow by the same scale about the
 * bar's centre, as one piece of content. `amount` is the press (0 rest, 1 held).
 */
export function pressedBar(spec: SurfaceRenderSpec, amount: number): SurfaceRenderSpec {
  if (amount === 0) return spec
  const scale = interactivePressScale('segmented', spec.frameWidth, amount)
  const centreX = spec.frameWidth / 2
  const centreY = spec.frameHeight / 2
  const aboutX = (x: number) => centreX + (x - centreX) * scale
  const aboutY = (y: number) => centreY + (y - centreY) * scale
  const glass = spec.shape.first
  const pill = spec.tabSelection
  return {
    ...spec,
    shape: { ...spec.shape, first: { ...glass, halfWidth: glass.halfWidth * scale } },
    tabSelection: pill && {
      ...pill,
      capsule: {
        centerX: aboutX(pill.capsule.centerX),
        centerY: aboutY(pill.capsule.centerY),
        halfWidth: pill.capsule.halfWidth * scale,
        halfHeight: pill.capsule.halfHeight * scale,
        radius: pill.capsule.radius * scale,
      },
      glyphAnchors: pill.glyphAnchors && [
        aboutX(pill.glyphAnchors[0]),
        aboutX(pill.glyphAnchors[1]),
      ],
    },
    ink: spec.ink && {
      ...spec.ink,
      layers: spec.ink.layers.map(layer => ({
        ...layer,
        frame: {
          x: aboutX(layer.frame.x),
          y: aboutY(layer.frame.y),
          width: layer.frame.width * scale,
          height: layer.frame.height * scale,
        },
      })),
    },
  }
}
