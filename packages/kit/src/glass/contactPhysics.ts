// The contact physics of interactive glass: how a glass shape answers a finger (light, growth,
// follow, squish, release), one table for every interactive glass surface. The menu gesture
// (document) and every interactive glass press (glass worker, InteractiveContact,
// InteractivePress) read it. No DOM access: the glass worker imports it.
//
// The menu's measured laws come first; GLASS_CONTACT_PHYSICS below gives each kind of
// interactive glass its parameters for those laws.

// iOS 26.5 Menu observations, measured-reference. These bounded 2D fits approximate
// the visible contour; native's optical warp is not its UIView transform.
export function menuPull(displacement: number, gain: number, range: number) {
  return (displacement * gain) / (1 + Math.abs(displacement) / range)
}

export const MENU_RELEASE_SPRING = Object.freeze({
  stiffness: 111.73389187035956,
  damping: 10.51444760548088,
  delayMilliseconds: 4.941103419008078,
})

export function menuReturn(milliseconds: number) {
  if (milliseconds >= 850) return 0
  const t = Math.max(0, milliseconds - MENU_RELEASE_SPRING.delayMilliseconds) / 1000
  const a = MENU_RELEASE_SPRING.damping / 2
  const w = Math.sqrt(MENU_RELEASE_SPRING.stiffness - a * a)
  return Math.exp(-a * t) * (Math.cos(w * t) + (a / w) * Math.sin(w * t))
}

export const MENU_STRAIN_RESPONSE_MS = 109.7745877972179

/* The closed Menu trigger trailing a held finger (measured-reference): per-axis gains of menuPull over a
 * 300 pt rational range, approached with a 211 ms response. */
export const MENU_TRIGGER_FOLLOW = Object.freeze({
  gainX: 0.028852199054395337,
  gainY: 0.01683370428028321,
  rangePt: 300,
  responseMs: 211.1299624689032,
})

/** The menu panel's velocity strain, in seconds of finger velocity: the panel leads along the
 * motion (x, y), stretches along it and narrows across it. */
export const MENU_STRAIN = Object.freeze({
  leadXSeconds: 0.003524681648458459,
  leadYSeconds: 0.0042655868076027946,
  stretchSeconds: 0.004789086076060811,
  narrowSeconds: 0.006870711203430614,
})

/**
 * The kinds of interactive glass. Every interactive glass surface presses through the one contact
 * (glassContact.ts in the document, InteractiveContact + InteractivePress in the glass worker);
 * the kind only picks its parameters.
 *
 * - `button`: a glass Button in content (`.buttonStyle(.glass)`, `.glassProminent`, any shape).
 * - `bar`: a toolbar or navigation-bar button, toolbar group, back/close/sidebar chrome buttons.
 * - `menu`: a Menu's trigger (its glass becomes the menu).
 * - `field`: interactive glass hosting one text editor (TextField, TextEditor, a composer).
 * - `surface`: any other app `glassEffect(.regular.interactive())` shape: cards, the bottom
 *   accessory, the mini player.
 *
 * Track thumbs (Toggle, Slider) take their finger through the same contact and respond as the
 * thumb note at the end of this file describes. Contacts with their own measured engines use this table's laws
 * through other entry points: the open menu panel (menuGesture: MENU_STRAIN, menuReturn, the menu
 * touch light) and the tab bar's dragged selection (tabMotion).
 */
export type GlassContactKind = 'button' | 'bar' | 'menu' | 'field' | 'surface' | 'segmented'

/** The kinds a framework control declares (`press`); `field` and `surface` follow from content. */
export type GlassPressKind = 'button' | 'bar' | 'menu'

/**
 * OWNER DECISION PENDING (Oct 12): which kinds of interactive glass let a horizontal drag that
 * starts on them start the navigation back swipe.
 *
 * - `[]` (current): every interactive glass owns its horizontal drag; it stretches toward the
 *   finger and never navigates.
 * - `['button']` (native, iPad catalog Oct 13): a rightward drag that starts on a content glass
 *   button drives the back swipe while the button stays pressed and moves with the page; its tap
 *   cancels. Add `'bar'` / `'menu'` to extend that to toolbar buttons and menu triggers.
 *
 * Fields always own their drag (a composer drag must not open the iPad split pane), as do
 * surfaces, Toggles and Sliders.
 */
export const GLASS_BACK_SWIPE: { yieldingKinds: readonly GlassPressKind[] } = {
  // Owner decision (Oct 13): match native. A content glass button lets a back swipe through
  // and stays pressed while the page moves; fields, chrome, surfaces and thumbs keep their drag.
  yieldingKinds: ['button'],
}

/** A highlight curve: [ms since touch-down, white amount over the glass]. */
export type HighlightCurve = readonly (readonly [number, number])[]

export type GlassContactParameters = Readonly<{
  /** Uniform press growth: the shape grows this many points wide (INTERACTIVE_GLASS_PRESS). */
  growthPt: number
  /** The held shape trailing the finger: menuPull gains per point over `rangePt`, approached
   * with `responseMs`. */
  follow: Readonly<{ gainX: number; gainY: number; rangePt: number; responseMs: number }>
  /** Squish while the finger moves: the menu panel's velocity strain. */
  strain: typeof MENU_STRAIN
  /** Pose limits in CSS px. They keep the pose inside the press growth's sampling margin. */
  maxOffset: number
  maxSizeChange: number
  /**
   * Light of the pressed glass. `whole`: a white curve across the whole shape (buttons, measured
   * per appearance, released linearly over `releaseMs`). `finger`: the menu's touch light at the
   * finger, scaled to the menu field, over a held floor across the shape (surfaces).
   */
  light:
    | Readonly<{
        kind: 'whole'
        light: HighlightCurve
        dark: HighlightCurve
        releaseMs: Readonly<{ light: number; dark: number }>
      }>
    | Readonly<{ kind: 'finger'; scale: number; floor: number; menuPeak: number }>
  /**
   * The label above the glass (live DOM): `steady` keeps it at full strength; a curve gives its
   * opacity [ms, opacity] while held, returning over the glass's release.
   */
  label: Readonly<{ light: HighlightCurve | 'steady'; dark: HighlightCurve | 'steady' }>
}>

/*
 * Native glass buttons on iPad (iPadOS 27, Oct 12; native reference `glass-press`, fit-grade counter
 * captures: skips 1.4-3.1%, max skip 1; evidence `native-refs-iPad/glass-{inline,toolbar}-*`,
 * fits in `glass-contact-one-path/native-fit/`):
 * - A 60 pt drag over 400 ms moves the held Actions and Save buttons' centre 0.8 pt toward the
 *   finger. With the menu strain's lead that is a follow gain of 0.010 per point (x); y keeps
 *   the menu trigger's y/x ratio.
 * - Dark: the glass whitens to a steady plateau (sRGB +51 of 223 over the backdrop, about 0.25
 *   white) by ~170 ms, with no flash, and clears ~240 ms after release.
 * - Light: the glass is white from the first pressed frame and stays white while held; it clears
 *   over ~500 ms.
 * - Labels: a content button's label stays at full strength (light 0 → 18 of 255, dark 255).
 *   A toolbar button's light label washes out into the white glass while held (2 → 255) and its
 *   dark label dips for one frame (188 of 255) at touch-down.
 *
 * Shape (native-contact-catalog, iPad, Oct 13; single captures, optical envelopes):
 * - Growth depends on shape through the width: one uniform scale 1 + growthPt / width. Circle
 *   composer + 46 pt: native rim ×1.39, this law ×1.35. Capsule "Actions" 82 pt: native ×1.21
 *   wide, this law ×1.20.
 * - Follow does not depend on shape. The circle + holds within ~1.5 pt of its place over a 60 pt
 *   drag. The capsule's "+31 pt" track in that catalog is the page, not the button: the untouched
 *   "Separate" button beside it moves the same +29 / −17 pt in the same frames (the native back
 *   swipe, started by the right-drag). Relative to the page the capsule stays put.
 * - Release: circle k 337 c 11.1, capsule k 384 c 12.2, prominent k 373 c 13.7 (ζ 0.30–0.35),
 *   inside the fitted INTERACTIVE_GLASS_PRESS release (k 324, c 12.24, ζ 0.34).
 */
const BUTTON_FOLLOW = Object.freeze({
  gainX: 0.01,
  gainY: 0.01 * (MENU_TRIGGER_FOLLOW.gainY / MENU_TRIGGER_FOLLOW.gainX),
  rangePt: MENU_TRIGGER_FOLLOW.rangePt,
  responseMs: MENU_TRIGGER_FOLLOW.responseMs,
})
const BUTTON_LIGHT = Object.freeze({
  kind: 'whole' as const,
  light: [
    [0, 0],
    [17, 0.65],
    [50, 0.9],
  ] as const,
  dark: [
    [0, 0],
    [17, 0.07],
    [50, 0.22],
    [167, 0.25],
  ] as const,
  releaseMs: { light: 500, dark: 240 },
})
const BAR_LABEL = Object.freeze({
  light: [
    [0, 1],
    [17, 0.35],
    [50, 0],
  ] as const,
  dark: [
    [0, 1],
    [8, 0.7],
    [50, 1],
  ] as const,
})
const POSE_LIMITS = { maxOffset: 8, maxSizeChange: 12 } as const

/** The contact kind of an interactive glass material. */
export function glassContactKind(material: {
  press?: GlassPressKind
  field?: true
}): GlassContactKind {
  return material.press ?? (material.field ? 'field' : 'surface')
}

export const GLASS_CONTACT_PHYSICS: Readonly<Record<GlassContactKind, GlassContactParameters>> = {
  button: {
    growthPt: 16,
    follow: BUTTON_FOLLOW,
    strain: MENU_STRAIN,
    ...POSE_LIMITS,
    light: BUTTON_LIGHT,
    label: { light: 'steady', dark: 'steady' },
  },
  bar: {
    // Toolbar Save: 69 x 44 → 85 x 54 pt held.
    growthPt: 16,
    follow: BUTTON_FOLLOW,
    strain: MENU_STRAIN,
    ...POSE_LIMITS,
    light: BUTTON_LIGHT,
    label: BAR_LABEL,
  },
  menu: {
    // The stock toolbar Menu's 44 pt circle is 48 pt while held (iPhone 17 Pro Max Simulator,
    // native recording toolbar menu measurements). It trails the finger with the closed Menu
    // trigger's measured law (measured-reference).
    growthPt: 4,
    follow: MENU_TRIGGER_FOLLOW,
    strain: MENU_STRAIN,
    ...POSE_LIMITS,
    light: BUTTON_LIGHT,
    // A dark trigger keeps its light glyph at full strength (the ellipsis reads 253 of 255 on
    // its held glass); a light one washes out like a toolbar button's.
    label: { light: BAR_LABEL.light, dark: 'steady' },
  },
  field: {
    // Native glass TextField (iPad, iPadOS 27, native-contact-catalog): held, the field is 8 pt
    // wider in two captures by two methods: `glass-field` envelope 609 → 616-618 pt over four
    // holds, `glass-field-quiet` rim 587 → 595 pt (cadence VALID). Twice a card's growth.
    growthPt: 8,
    follow: MENU_TRIGGER_FOLLOW,
    strain: MENU_STRAIN,
    ...POSE_LIMITS,
    light: { kind: 'finger', scale: 0.26, floor: 0.033, menuPeak: 0.175 },
    label: { light: 'steady', dark: 'steady' },
  },
  surface: {
    // A 404 pt card grows to 408-410 pt; a 160 pt circle to 164 pt (Simulator, Sep 25).
    growthPt: 4,
    // Native App-defined card (iPad, Oct 12): ~1.5 pt for a 60 pt drag, the trigger's law.
    follow: MENU_TRIGGER_FOLLOW,
    strain: MENU_STRAIN,
    ...POSE_LIMITS,
    // Native dark card: 46 under the finger and 36 elsewhere while held, over 29 at rest (a
    // white mix of ~0.075 at the touch and ~0.033 across the shape); the menu field peaks at
    // ~0.175, so a surface's light is 0.26 of it over a 0.033 floor.
    light: { kind: 'finger', scale: 0.26, floor: 0.033, menuPeak: 0.175 },
    label: { light: 'steady', dark: 'steady' },
  },
  segmented: {
    // The search scope bar, pressed anywhere (stock `.searchScopes`, iPhone 17 Pro Max Simulator,
    // iOS 27.0, held 1.2 s; measured scope thumb, Oct 13): the 400 pt bar is 416 pt wide and keeps its
    // 36 pt height, and its labels and pill grow by the same 1.04 about the bar's centre
    // (webgpu/selectionThumb.ts applies both). The bar holds its place under the finger.
    growthPt: 16,
    follow: { ...MENU_TRIGGER_FOLLOW, gainX: 0, gainY: 0 },
    strain: MENU_STRAIN,
    ...POSE_LIMITS,
    // Dark, over 31 at rest: 44 across the bar and 67 at the finger (a white mix of 0.058 and
    // 0.16), about twice a card's light.
    light: { kind: 'finger', scale: 0.59, floor: 0.058, menuPeak: 0.175 },
    label: { light: 'steady', dark: 'steady' },
  },
}

/**
 * Track thumbs: a Toggle's or a Slider's thumb is a lens on a track. Its finger arrives through
 * the same GlassContact as every interactive glass (glassContact.ts); its response differs from a
 * free shape's in ways native shows, so it has its own rows:
 *
 * - Follow: the thumb follows the finger 1:1 along its track, clamped to the travel's ends (the
 *   value moves with it), and never leaves the track. A free shape trails the finger by ~1% of the
 *   drag (follow gains above). Native catalog `toggle-thumb-quiet` / `slider-thumb-quiet` (iPad,
 *   cadence VALID): the held lens rides the finger to the ends; across the track it moves ≤1.4 pt.
 * - Growth: the white thumb lifts into a clear lens after a stationary hold of `activationMs`, or
 *   as soon as it drags, with the control's own springs (CONTROL_LIFT); a free shape grows at
 *   touch-down.
 * - Light: none. The lens is clear; the track shows through it.
 * - A gesture that claims the touch before the thumb drags (a vertical scroll) cancels it; once it
 *   drags the thumb keeps the finger (GlassContactOptions.yieldsTo).
 *
 * The page owns a thumb's value, so its response model runs in the document (toggleContact.ts,
 * sliderContact.ts) and the renderer draws the lens it is sent (ControlLens). Values live in
 * lens/controlLift.ts (CONTROL_LIFT, ControlLiftKind) beside the scope bar's selection lens.
 */
