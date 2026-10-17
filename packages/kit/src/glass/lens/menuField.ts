import { roundedRectDistance, roundedRectNormal, type GlassFieldMember } from '../fieldGeometry.ts'
import phoneFit from './menuMorphPhoneFit.json'
import { menuSpring } from './menuSpring.ts'
import type { MenuSourceKind } from '../regions.ts'

/**
 * Button → menu as one glass field of two members, like native's liquid drop:
 * - the panel member travels from the trigger to the panel on the recorded menu pose
 *   (menuMorphMotion.ts);
 * - the trigger member stays at the trigger's home. On open it holds the pressed glass, dips and
 *   is absorbed into the departing drop; on close it grows back out of the returning body as a
 *   horn, so the shape pours back into the button as a teardrop.
 * The trigger's glyph and the menu's rows are ink drawn inside that glass (the ink kernel), so
 * the growing rim lenses them and no page element is scaled, blurred or clipped.
 *
 * Phone reference: iOS 27.0 iPhone 17 Pro Max Simulator, native toolbar menu
 * (native recording menu measurements). Times are ms after the morph's time zero:
 * native release +43 ms on open (regionScene anchors it on the trigger's release), close tap
 * +41 ms on close. Measured (native release/tap times): the pressed 48 pt button holds, dips to
 * 41 pt and departs lopsided (release +116...+175 ms); its white highlight fades 118 → 68 → 0
 * over +108...+160 ms and its dots ride the bulge until about +150 ms.
 *
 * On close the button re-forms from +172 ms as a bump on the body's leading edge, 9 pt short
 * of its home and 10 pt past it (above, for a menu that hangs below its trigger), carrying its
 * dots. It rises to 13.5 pt past home by +242 ms and settles back by about +530 ms while the
 * body pours into it: the tracked centre of the dots follows one spring on both axes
 * (menuMorphPhoneFit.json `closeButton`, 0.14 pt RMS). That momentum is the only time the
 * shape passes its button. Rows fade from the first close frame (246 → 96 in about 15 ms of
 * motion, a faint blurred copy until about +140 ms).
 *
 * Triggers that are not a circle (same Simulator, native menu from a labelled capsule
 * 129 x 50, a full-width button 400 x 50 and a toolbar group 152 x 44; phase-morph-shapes-notes.md):
 * the drop does not start as the trigger. The whole trigger glass contracts in about three frames
 * (its width to 0.71 and 0.47 of rest while its height is at 0.90 and 0.74: it shortens faster
 * than it thins) toward the menu member's centre, while a round drop the size of the trigger's
 * height grows there. From then on the drop's size and path are the circle's. On close the
 * button re-forms as the whole trigger scaled up (height first, width lagging), carrying its
 * label at that scale, and passes home by the same share of the travel.
 * The part the drop forms from is the trigger's `seed` (menuSeed): for a circle, and any trigger
 * at least two thirds as thick as it is long, the seed is the trigger and every value below is
 * unchanged.
 */
export const MENU_FIELD = {
  /** Smooth-union reach between the trigger and the panel members (points). */
  blendRadius: 22,
  /** Depth over which the rim lenses the ink (points). */
  lensWidth: 14,
  /** On close the button forms as a bump on the body: until the body reaches it, its centre
   * stays within this many of its radii of the body's surface, so it always touches the body
   * (fitted with the springs; native's horn grows out of the body's leading corner). */
  closeEmbed: 1,
  /** A scaled long trigger keeps its round part at the scale and the rest of its length (width
   * beyond its height) at the scale to this power. Native's full-width button, re-forming: 0.50,
   * 0.67, 0.80 and 0.90 of its width at 0.75, 0.84, 0.91 and 0.95 of its height (2.5 gives 0.52,
   * 0.67, 0.81, 0.89); contracting: 0.71 and 0.47 at 0.90 and 0.74 (0.79, 0.51). */
  excessPower: 2.5,
  /** On open a long trigger's round part follows the absorption curve to this power (the
   * inverse of `excessPower`), so its length follows the curve itself: native's full-width
   * button is at 0.93, 0.71 and 0.47 of its width where the circle's curve is at 0.91, 0.74 and
   * 0.39. */
  elongatedOpenPower: 0.4,
  /** On close a long trigger's round part follows the re-forming spring to this power, so its
   * length follows the spring squared: native's full-width button is back to 0.50, 0.74, 0.90
   * and 0.98 of its width at +213, +254, +306 and +351 ms of the dismissing touch, its height
   * ahead of it. */
  elongatedClosePower: 0.8,
} as const

type Keys = readonly (readonly [ms: number, value: number])[]
/** Monotone cubic (Fritsch-Carlson) through the keys, constant outside them. Velocity is
 * continuous across keys, so a curve never pauses at a knot (a per-segment smoothstep did). */
export function keyed(keys: Keys, ms: number) {
  if (ms <= keys[0][0]) return keys[0][1]
  if (ms >= keys.at(-1)![0]) return keys.at(-1)![1]
  const slope = (i: number) => {
    if (i === 0 || i === keys.length - 1) return 0
    const before = (keys[i][1] - keys[i - 1][1]) / (keys[i][0] - keys[i - 1][0]),
      after = (keys[i + 1][1] - keys[i][1]) / (keys[i + 1][0] - keys[i][0])
    return before * after <= 0 ? 0 : (2 * before * after) / (before + after)
  }
  const i = keys.findIndex(key => key[0] >= ms) - 1
  const [t0, v0] = keys[i],
    [t1, v1] = keys[i + 1]
  const h = t1 - t0,
    t = (ms - t0) / h
  return (
    (2 * t ** 3 - 3 * t ** 2 + 1) * v0 +
    (t ** 3 - 2 * t ** 2 + t) * h * slope(i) +
    (-2 * t ** 3 + 3 * t ** 2) * v1 +
    (t ** 3 - t ** 2) * h * slope(i + 1)
  )
}

export const MENU_FIELD_CURVES = {
  open: {
    /** Trigger member size relative to its rest size; the first key is the pressed scale. */
    trigger: [
      [73, 0.93],
      [100, 0.6],
      [135, 0],
    ],
    /** Multiplier on the press highlight carried over from the trigger. */
    highlight: [
      [65, 1],
      [117, 0],
    ],
    glyph: [
      [80, 1],
      [130, 0],
    ],
    rowsScale: [
      [100, 1.3],
      [300, 1],
    ],
    rowsOpacity: [
      [90, 0],
      [200, 1],
    ],
    rowsBlur: [
      [110, 5],
      [260, 0],
    ],
    lens: [
      [380, 8],
      [450, 0],
    ],
  },
  // Close keys come from the per-frame two-member fit of the native close outline
  // (native measurements fit; the body's own path is menuMorphPhoneFit.json).
  close: {
    highlight: [[0, 0]],
    /** Dots show as a smudge in the re-forming button at +172 ms of the tap, bright at +188 ms
     * and crisp at +207 ms. */
    glyph: [
      [132, 0],
      [152, 0.8],
      [168, 1],
    ],
    rowsScale: [
      [0, 1],
      [120, 1.12],
    ],
    /** Rows hold for the first frame of motion, then drop fast to a faint blurred copy. */
    rowsOpacity: [
      [25, 1],
      [40, 0.3],
      [65, 0.15],
      [105, 0],
    ],
    rowsBlur: [
      [25, 0],
      [65, 4],
    ],
    /** Closing rows fade without rim bending (native shows none). */
    lens: [[0, 0]],
    /** The body's corner radius as a share of its half-size: the panel's 0.34 rounds fully by
     * +139 ms (fit). Replaces the iPad corner curve on the phone close. */
    roundness: [
      [0, 0.34],
      [14, 0.44],
      [29, 0.55],
      [44, 0.71],
      [79, 0.77],
      [94, 1],
    ],
  },
} as const satisfies Record<'open' | 'close', Record<string, Keys>>

export type Rect = Readonly<{ x: number; y: number; width: number; height: number }>
const center = (rect: Rect) => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 })
/** A value's share of the way from `zero` to `one` (0 when they coincide). */
const share = (value: number, zero: number, one: number) =>
  Math.abs(one - zero) < 1e-6 ? 0 : (value - zero) / (one - zero)

/** How far a trigger is from round: 0 while it is at least two thirds as thick as it is long (a
 * circle, and the 58 x 47 member of three blended glass buttons, whose whole glass leaves as the
 * drop in native), 1 once it is under 0.45 (the measured capsule and full-width button are 0.39
 * and 0.125). The circle's fitted behaviour applies at 0, the measured long-trigger behaviour at
 * 1. Between them nothing was measured: the two are blended smoothly. */
export function triggerElongation(shape: Pick<GlassFieldMember, 'halfWidth' | 'halfHeight'>) {
  const thick = Math.min(shape.halfWidth, shape.halfHeight),
    long = Math.max(shape.halfWidth, shape.halfHeight)
  if (!(long > 0)) return 0
  const t = Math.max(0, Math.min(1, (thick / long - 0.45) / (2 / 3 - 0.45)))
  return 1 - t * t * (3 - 2 * t)
}

/** The part of a trigger its drop forms from. A round trigger's seed is the trigger itself. A
 * long trigger's seed is its round part: a shape as wide as the trigger is thick, centred on
 * `anchor` (the menu's own button inside a wider glass group; the trigger's centre when absent)
 * and kept inside the trigger. */
export function menuSeed(
  trigger: GlassFieldMember,
  anchor?: { x: number; y: number },
): GlassFieldMember {
  const elongation = triggerElongation(trigger)
  if (elongation === 0) return trigger
  const thick = Math.min(trigger.halfWidth, trigger.halfHeight)
  const halfWidth = trigger.halfWidth + (thick - trigger.halfWidth) * elongation,
    halfHeight = trigger.halfHeight + (thick - trigger.halfHeight) * elongation
  const within = (value: number, center: number, reach: number) =>
    Math.max(center - reach, Math.min(center + reach, value))
  return {
    centerX: within(anchor?.x ?? trigger.centerX, trigger.centerX, trigger.halfWidth - halfWidth),
    centerY: within(anchor?.y ?? trigger.centerY, trigger.centerY, trigger.halfHeight - halfHeight),
    halfWidth,
    halfHeight,
    radius: Math.min(trigger.radius, halfWidth, halfHeight),
  }
}

/** A trigger at `scale` of its rest size. Its round part (the seed) scales by `scale` about the
 * seed's centre; its length beyond the seed scales by `scale` to `excessPower`, so a long
 * button shortens faster than it thins. At or above 1 (the pressed growth) and for a circle the
 * scale is uniform about the trigger's centre. */
export function scaledMenuTrigger(
  home: GlassFieldMember,
  scale: number,
  seed: GlassFieldMember = menuSeed(home),
): GlassFieldMember {
  if (scale >= 1 || triggerElongation(home) === 0)
    return {
      centerX: home.centerX,
      centerY: home.centerY,
      halfWidth: home.halfWidth * scale,
      halfHeight: home.halfHeight * scale,
      radius: Math.min(home.radius * scale, home.halfWidth * scale, home.halfHeight * scale),
    }
  const excess = scale ** MENU_FIELD.excessPower
  /** One axis: the seed's span scaled by `scale`, the trigger's reach beyond it by `excess`. */
  const span = (center: number, half: number, seedCenter: number, seedHalf: number) => {
    const before = seedCenter - seedHalf - (center - half),
      after = center + half - (seedCenter + seedHalf)
    const start = seedCenter - seedHalf * scale - before * excess,
      end = seedCenter + seedHalf * scale + after * excess
    return { center: (start + end) / 2, half: (end - start) / 2 }
  }
  const x = span(home.centerX, home.halfWidth, seed.centerX, seed.halfWidth),
    y = span(home.centerY, home.halfHeight, seed.centerY, seed.halfHeight)
  return {
    centerX: x.center,
    centerY: y.center,
    halfWidth: x.half,
    halfHeight: y.half,
    radius: Math.min(home.radius * scale, x.half, y.half),
  }
}

/** Where the re-forming button's centre is at `ms` of a close: its home plus the settle
 * spring's displacement, a share of the panel-to-trigger travel on each axis. */
export function closeButtonCenter(home: GlassFieldMember, panelFrame: Rect, ms: number) {
  const { x, y } = phoneFit.closeButton,
    panel = center(panelFrame)
  return {
    x: home.centerX + x.from * menuSpring(x, ms).value * (panel.x - home.centerX),
    y: home.centerY + y.from * menuSpring(y, ms).value * (panel.y - home.centerY),
  }
}

/** The closing body: the travelling member (panel → the trigger's seed) poured into the
 * button. Its centre travels to the button's current centre, and its size is the travelled
 * share of the panel, so it collapses to nothing inside the button. Gone once it is under a
 * point. */
function closeBody(
  travelling: GlassFieldMember,
  home: GlassFieldMember,
  seed: GlassFieldMember,
  panelFrame: Rect,
  ms: number,
): GlassFieldMember | undefined {
  const panel = center(panelFrame),
    button = closeButtonCenter(home, panelFrame, ms)
  const halfWidth =
      share(travelling.halfWidth, seed.halfWidth, panelFrame.width / 2) * (panelFrame.width / 2),
    halfHeight =
      share(travelling.halfHeight, seed.halfHeight, panelFrame.height / 2) * (panelFrame.height / 2)
  if (Math.min(halfWidth, halfHeight) < 0.5) return undefined
  const arrivedX = 1 - share(travelling.centerX, seed.centerX, panel.x),
    arrivedY = 1 - share(travelling.centerY, seed.centerY, panel.y)
  return {
    centerX: travelling.centerX + (button.x - seed.centerX) * arrivedX,
    centerY: travelling.centerY + (button.y - seed.centerY) * arrivedY,
    halfWidth,
    halfHeight,
    radius: keyed(MENU_FIELD_CURVES.close.roundness, ms) * Math.min(halfWidth, halfHeight),
  }
}

/** Keep a forming button attached to the body: a centre farther than `closeEmbed` radii
 * outside the body's surface moves back along the surface normal. */
function onBody(
  point: { x: number; y: number },
  body: GlassFieldMember | undefined,
  radius: number,
) {
  if (!body) return point
  const beyond = roundedRectDistance(point.x, point.y, body) - MENU_FIELD.closeEmbed * radius
  if (beyond <= 0) return point
  const [nx, ny] = roundedRectNormal(point.x, point.y, body)
  return { x: point.x - nx * beyond, y: point.y - ny * beyond }
}

/** `member` with its centre moved by the same offset that takes `from` to `to`. */
const movedBy = (
  member: GlassFieldMember,
  from: { x: number; y: number },
  to: { x: number; y: number },
): GlassFieldMember => ({
  ...member,
  centerX: to.x + (member.centerX - from.x),
  centerY: to.y + (member.centerY - from.y),
})

/** The trigger's label (its glyph ink) inside a scaled trigger member. A circle's glyph keeps
 * its size and rides the member's centre. An elongated trigger's label scales with the member's
 * round part and keeps its place along the member, as native's label does. */
function glyphFrame(
  glyph: Rect,
  home: GlassFieldMember,
  member: GlassFieldMember,
  scale: number,
): Rect {
  const elongation = triggerElongation(home)
  if (elongation === 0)
    return {
      ...glyph,
      x: glyph.x + member.centerX - home.centerX,
      y: glyph.y + member.centerY - home.centerY,
    }
  const mix = (ratio: number) => 1 + (ratio - 1) * elongation
  const size = mix(Math.min(1, scale))
  const along = mix(home.halfWidth > 0 ? member.halfWidth / home.halfWidth : 1),
    across = mix(home.halfHeight > 0 ? member.halfHeight / home.halfHeight : 1)
  const glyphCenter = center(glyph)
  const width = glyph.width * size,
    height = glyph.height * size
  return {
    x: member.centerX + (glyphCenter.x - home.centerX) * along - width / 2,
    y: member.centerY + (glyphCenter.y - home.centerY) * across - height / 2,
    width,
    height,
  }
}

/** One ink layer: a region of the ink atlas drawn at `frame` inside the glass (points). */
export type MenuInkLayer = Readonly<{
  source: Rect
  frame: Rect
  opacity: number
  blur: number
  /** Rim lensing: displacement (points) at the edge, fading to zero at `lensWidth` deep. */
  lens: number
  lensWidth: number
}>
export type MenuFieldFrame = {
  members: GlassFieldMember[]
  blendRadius: number
  /** Press-highlight white amount over the whole field. */
  highlight: number
  ink: MenuInkLayer[]
}

/** The two-member field, its highlight and its ink at `ms` after the morph's time zero.
 * `panel` is the travelling panel member (between the trigger's seed and the panel); `home` the
 * trigger glass at rest; `anchor` the centre of the menu's own button when the trigger glass is
 * wider than it (a toolbar group); `panelFrame` the settled panel. `rows`/`glyph` pair an ink
 * atlas region with its settled rectangle. All in points. */
export function menuFieldFrame({
  sourceKind,
  direction,
  ms,
  panel: travelling,
  home,
  anchor,
  pressedScale = 1,
  pressHighlight = 0,
  panelFrame,
  rows,
  glyph,
  settled = false,
}: {
  sourceKind?: MenuSourceKind
  direction: 'open' | 'close'
  ms: number
  panel: GlassFieldMember
  home: GlassFieldMember
  anchor?: { x: number; y: number }
  pressedScale?: number
  pressHighlight?: number
  panelFrame: Rect
  rows?: { source: Rect; frame: Rect }
  glyph?: { source: Rect; frame: Rect }
  /** The open has settled (identity ink) or the menu snaps (reduced motion). */
  settled?: boolean
}): MenuFieldFrame {
  const curves =
    sourceKind === 'label' || sourceKind === 'glyph'
      ? { ...MENU_FIELD_CURVES[direction], ...PLAIN_INK[sourceKind][direction] }
      : sourceKind === 'context' && direction === 'close'
        ? { ...MENU_FIELD_CURVES.close, ...CONTEXT_CLOSE_INK }
        : MENU_FIELD_CURVES[direction]
  // On close the trigger re-forms on one spring, as a bump that grows on the body.
  const scale =
    direction === 'open'
      ? keyed([[0, pressedScale], ...MENU_FIELD_CURVES.open.trigger], ms)
      : settled
        ? 1
        : 1 - menuSpring(phoneFit.closeHead, ms).value
  const members: GlassFieldMember[] = []
  const homeCenter = { x: home.centerX, y: home.centerY }
  /** Where the drop leaves from and returns to. */
  const seed = menuSeed(home, anchor)
  /** The trigger member, and the scale of its round part (its label's scale). */
  let trigger: GlassFieldMember | undefined
  let triggerScale = 1
  /** The member the rows ride in. */
  let panel = travelling
  // A plain label or glyph has no glass to hold, absorb or re-form: its drop is the travelling
  // member alone. Native shows no glass bubble at a plain glyph before its menu grows.
  if (sourceKind === 'label' || sourceKind === 'glyph' || sourceKind === 'context') {
    members.push(travelling)
  } else if (direction === 'close') {
    const body = settled ? undefined : closeBody(travelling, home, seed, panelFrame, ms)
    if (body) {
      members.push(body)
      panel = body
    }
    if (scale > 0.01 || !body) {
      const size = Math.max(scale, 0.01)
      const power = 1 - (1 - MENU_FIELD.elongatedClosePower) * triggerElongation(home)
      triggerScale = size >= 1 ? size : size ** power
      const at = settled
        ? homeCenter
        : onBody(closeButtonCenter(home, panelFrame, ms), body, home.radius * triggerScale)
      // The button re-forms about its own centre, whichever of its members opened the menu.
      trigger = movedBy(scaledMenuTrigger(home, triggerScale), homeCenter, at)
      members.unshift(trigger)
    }
  } else {
    members.push(travelling)
    if (scale > 0.01) {
      // An elongated trigger's round part follows the square root of the absorption curve, so
      // its length follows the curve; a circle follows the curve itself.
      const power = 1 - (1 - MENU_FIELD.elongatedOpenPower) * triggerElongation(home)
      triggerScale = scale >= 1 ? scale : scale ** power
      const shape = scaledMenuTrigger(home, triggerScale, seed)
      // A shrinking trigger is absorbed: it slides from its home to the nearest point where it
      // lies wholly inside the panel member, so no detached droplet is left behind.
      const clampInside = (value: number, center: number, reach: number) =>
        Math.max(center - reach, Math.min(center + reach, value))
      const insideX = clampInside(
        shape.centerX,
        travelling.centerX,
        Math.max(0, travelling.halfWidth - shape.halfWidth),
      )
      const insideY = clampInside(
        shape.centerY,
        travelling.centerY,
        Math.max(0, travelling.halfHeight - shape.halfHeight),
      )
      const toHome = Math.min(1, scale)
      trigger = {
        ...shape,
        centerX: insideX + (shape.centerX - insideX) * toHome,
        centerY: insideY + (shape.centerY - insideY) * toHome,
      }
      members.unshift(trigger)
    }
  }
  const at = settled ? Infinity : ms
  const ink: MenuInkLayer[] = []
  // Context ink is carried by the growing body, without the toolbar's trigger lens.
  const lens =
    sourceKind === 'context' || (settled && direction === 'open') ? 0 : keyed(curves.lens, at)
  if (glyph) {
    const opacity = keyed(curves.glyph, at)
    if (opacity > 0 && trigger)
      ink.push({
        source: glyph.source,
        frame: glyphFrame(glyph.frame, home, trigger, triggerScale),
        opacity,
        blur: 0,
        lens,
        lensWidth: MENU_FIELD.lensWidth,
      })
  }
  if (rows) {
    const opacity = keyed(curves.rowsOpacity, at)
    if (opacity > 0) {
      // Rows travel with the panel member, scaled about its centre.
      // Context content grows with its body. Toolbar ink starts at full size
      // inside a lens; using that scale here clips the first rows out of the seed.
      const factor =
        sourceKind === 'context'
          ? (panel.halfWidth * 2) / panelFrame.width
          : keyed(curves.rowsScale, at)
      const panelCenterX = panelFrame.x + panelFrame.width / 2,
        panelCenterY = panelFrame.y + panelFrame.height / 2
      const width = rows.frame.width * factor,
        height = rows.frame.height * factor
      const centerX = panel.centerX + (rows.frame.x + rows.frame.width / 2 - panelCenterX) * factor
      const centerY = panel.centerY + (rows.frame.y + rows.frame.height / 2 - panelCenterY) * factor
      ink.push({
        source: rows.source,
        frame: { x: centerX - width / 2, y: centerY - height / 2, width, height },
        opacity,
        blur: keyed(curves.rowsBlur, at) * (sourceKind === 'context' ? factor : 1),
        lens,
        lensWidth: MENU_FIELD.lensWidth,
      })
    }
  }
  return {
    members,
    blendRadius: MENU_FIELD.blendRadius,
    highlight: pressHighlight * keyed(curves.highlight, at),
    ink,
  }
}

/** A context menu's rows close with its body: the body's measured fade (menu-close/r3, the
 * region opacity) and shrink carry them, so the rows never leave an empty dark platter
 * behind (owner, nowplaying-art-menu-glitch-2026-10-11). The toolbar's quicker row fade
 * belongs to a body that pours back into a glass button. */
const CONTEXT_CLOSE_INK = {
  rowsOpacity: [[0, 1]],
  rowsBlur: [[0, 0]],
} as const

/** A plain label's drop (menu-style Picker, text Menu), native-glass-menu-clock
 * picker-glass-sheet.mp4 (Simulator, 59.94 fps, light; dark UNKNOWN), times after the open onset
 * at PTS 1.028 s. Open: the value label fades in place while a round lens grows from it with
 * the rows already inside: faint, sharp in the middle and bent by its rim from about +35 ms,
 * about a third visible at +52 ms, two thirds at +85 ms and whole by +119 ms; the rim stops
 * bending them by +185 ms. The rim depth is the toolbar's (unmeasured here). The glass is
 * whole from the first frame: there is no material fade on open.
 * Close: the rows grow, blur and fade before the shrinking glass reaches the label, and the
 * glass itself fades out (no button re-forms at a label). */
const MENU_LABEL_INK = {
  open: {
    rowsOpacity: [
      [17, 0],
      [52, 0.35],
      [85, 0.7],
      [119, 1],
    ],
    rowsBlur: [[0, 0]],
    rowsScale: [[0, 1]],
    lens: [
      [0, 8],
      [135, 8],
      [185, 0],
    ],
  },
  close: {
    rowsOpacity: [
      [0, 1],
      [17, 0.7],
      [50, 0.2],
      [83, 0],
    ],
    rowsBlur: [
      [0, 0],
      [50, 4],
    ],
    rowsScale: [
      [0, 1],
      [150, 0.8],
    ],
    lens: [[0, 0]],
  },
} as const

/** A plain glyph's drop (a Menu labelled with a bare symbol, no glass at rest): the measured platform control
 * in the iOS 27.0 Simulator, counter-retimed (menuGlyphDropFit.json). Open: the glyph vanishes on
 * the tap; the body's first frame is already 94 x 82 pt with the rows inside it, small and
 * blurred; they reach full size by +120 ms and are sharp by +154 ms. Close: the rows blur and
 * fade inside the collapsing body, gone by +137 ms. */
const MENU_GLYPH_INK = {
  open: {
    rowsOpacity: [
      [17, 0.5],
      [51, 1],
    ],
    rowsBlur: [
      [34, 6],
      [103, 2],
      [154, 0],
    ],
    rowsScale: [
      [34, 0.5],
      [68, 0.85],
      [120, 1],
    ],
    lens: MENU_LABEL_INK.open.lens,
  },
  close: {
    rowsOpacity: [
      [0, 1],
      [34, 0.75],
      [68, 0.4],
      [103, 0.12],
      [137, 0],
    ],
    rowsBlur: [
      [0, 0],
      [68, 5],
    ],
    rowsScale: MENU_LABEL_INK.close.rowsScale,
    lens: [[0, 0]],
  },
} as const

const PLAIN_INK = { label: MENU_LABEL_INK, glyph: MENU_GLYPH_INK } as const

/** Material opacity and corner rounding of a plain drop, by source kind.
 * Label (picker-glass-sheet): round until +100 ms of either direction's shape and square by
 * +200 ms; whole glass from the first open frame; the close fades it out by +150 ms.
 * Glyph (menuGlyphDropFit.json, stills read per refresh): the first open frames are faint
 * glass, whole by +103 ms; the body is an oval until +51 ms and square by +154 ms. On close it
 * rounds back to an oval by +154 ms and fades as it collapses, a faint smudge at the glyph by
 * +222 ms and gone by +256 ms. */
const PLAIN_PRESENTATION = {
  label: {
    openOpacity: [[0, 1]],
    closeOpacity: [
      [0, 1],
      [17, 0.85],
      [50, 0.25],
      [83, 0.08],
      [150, 0],
    ],
    openRounding: [
      [0, 1],
      [100, 1],
      [200, 0],
    ],
    // The open's rounding run backwards (the same smoothstep, mirrored).
    closeRounding: [
      [0, 0],
      [100, 1],
    ],
  },
  glyph: {
    openOpacity: [
      [0, 0],
      [17, 0.25],
      [34, 0.45],
      [68, 0.8],
      [103, 1],
    ],
    closeOpacity: [
      [0, 1],
      [51, 0.9],
      [120, 0.6],
      [171, 0.3],
      [222, 0.1],
      [256, 0],
    ],
    openRounding: [
      [0, 1],
      [51, 1],
      [103, 0.45],
      [154, 0],
    ],
    closeRounding: [
      [0, 0],
      [51, 0.3],
      [103, 0.7],
      [154, 1],
    ],
  },
} as const satisfies Record<'label' | 'glyph', Record<string, Keys>>

export function plainMenuPresentation(
  kind: 'label' | 'glyph',
  direction: 'open' | 'close',
  ms: number,
  settled: boolean,
) {
  if (settled) return { opacity: direction === 'open' ? 1 : 0, rounding: 0 }
  const curves = PLAIN_PRESENTATION[kind]
  return direction === 'open'
    ? { opacity: keyed(curves.openOpacity, ms), rounding: keyed(curves.openRounding, ms) }
    : { opacity: keyed(curves.closeOpacity, ms), rounding: keyed(curves.closeRounding, ms) }
}
