// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import samples from './scopeThumbSlideSamples.json'
import { SCOPE_THUMB, SCOPE_THUMB_HELD } from './controlLift.ts'
import { regionSpec, selectionInk } from '../webgpu/regionScene.ts'
import { SelectionThumb } from '../webgpu/selectionThumb.ts'
import { retainedAppearanceSpec } from '../webgpu/raster.ts'
import { Glass, type GlassRegion } from '../regions.ts'
import { TAB_BAR_BLUR_SIGMA } from './tabSelectionMaterial.ts'

const rms = (errors: number[]) =>
  Math.sqrt(errors.reduce((sum, e) => sum + e * e, 0) / errors.length)

const frame = { x: 20, y: 116, width: 400, height: 36 }
const segment = (400 - 8) / 4
const centre = (index: number) => 4 + segment * (index + 0.5)
const FRAME_MS = 1000 / 60

/** Drives a scope thumb on a 60 Hz clock; `at` is ms since the start. */
function driver(index = 0) {
  const thumb = new SelectionThumb(frame, { index, count: 4 })
  let at = 1000
  const finger = (phase: 'pressed' | 'dragging' | 'releasing', x: number) =>
    thumb.input({ regionId: 'scopes', phase, epoch: at, contact: { x, y: 18 } }, false)
  const run = (ms: number) => {
    const end = at + ms
    while (at < end) {
      at += FRAME_MS
      thumb.sample(at, false, 'dark')
    }
    return thumb.motion.capsule()
  }
  return { thumb, finger, run, now: () => at }
}

// A tap on the next scope: the press holds the pill in place (native holds it under a press on
// another segment) and the page's click on release slides it on the measured scope spring. The thumb
// is read at the native sample instants, which are measured from the slide's onset: the renderer
// presents the curve at each vsync, so a 60 Hz grid that overshoots a sample by up to a frame would
// measure the test's clock, not the curve.
it('slides a tapped selection on the native scope curve (RMS within 3 pt of the 60 fps samples)', () => {
  for (const side of ['light', 'dark'] as const) {
    const { travelPt, samples: points } = samples[side]
    // Two segments of the native fixture: the thumb travels one segment, scaled to its travel.
    const { thumb, finger, run, now } = driver(0)
    finger('pressed', centre(1))
    expect(run(60).centerX).toBe(centre(0))
    finger('releasing', centre(1))
    const onset = now()
    thumb.select(1, onset, false)
    const errors: number[] = []
    for (const [t, x] of points) {
      thumb.sample(onset + t * 1000, false, 'dark')
      const capsule = thumb.motion.capsule()
      errors.push(((capsule.centerX - centre(0)) / segment - x) * travelPt)
    }
    expect(rms(errors)).toBeLessThanOrEqual(3)
  }
})

it('lifts a held thumb into a lens taller than the bar and wider than its segment, and restores it', () => {
  const { thumb, finger, run, now } = driver(1)
  finger('pressed', centre(1))
  const held = run(500)
  expect(thumb.motion.lensMix).toBeGreaterThan(0.9)
  expect(held.halfHeight * 2).toBeCloseTo(SCOPE_THUMB.lensHeight, 0)
  expect(held.halfWidth * 2).toBeCloseTo(segment + SCOPE_THUMB_HELD.widthDelta, 0)
  expect(held.centerX).toBeCloseTo(centre(1), 0)
  finger('releasing', centre(1))
  // The bar's own release spring rings for about 1.6 s.
  const rest = run(2000)
  expect(thumb.motion.lensMix).toBe(0)
  expect(rest.halfHeight * 2).toBeCloseTo(SCOPE_THUMB.height, 0)
  expect(rest.centerX).toBeCloseTo(centre(1), 0)
  expect(thumb.live(now())).toBe(false)
})

it('follows a dragging finger and snaps to the nearest segment on release', () => {
  const { thumb, finger, run, now } = driver(0)
  finger('pressed', centre(0))
  run(200)
  for (let x = centre(0); x <= centre(2) - 20; x += 8) {
    finger('dragging', x)
    run(FRAME_MS)
  }
  const dragging = run(300)
  // The lens trails the finger, then sits under it.
  expect(Math.abs(dragging.centerX - (centre(2) - 20))).toBeLessThan(6)
  expect(thumb.motion.lensMix).toBeGreaterThan(0.9)
  finger('releasing', centre(2) - 20)
  const rest = run(2000)
  expect(rest.centerX).toBeCloseTo(centre(2), 0)
  expect(rest.halfHeight * 2).toBeCloseTo(SCOPE_THUMB.height, 0)
  // The page then commits the same segment: the thumb does not slide again.
  thumb.select(2, now(), false)
  expect(thumb.live(now())).toBe(false)
})

it('returns to where it started after a drag out and back, and a released drag between segments snaps', () => {
  const { finger, run } = driver(0)
  finger('pressed', centre(0))
  for (const x of [centre(1), centre(2), centre(3), centre(2), centre(1), centre(0)]) {
    finger('dragging', x)
    run(80)
  }
  finger('releasing', centre(0))
  expect(run(1200).centerX).toBeCloseTo(centre(0), 0)
  const between = driver(1)
  between.finger('pressed', centre(1))
  between.finger('dragging', (centre(2) + centre(3)) / 2 + 4)
  between.run(300)
  between.finger('releasing', (centre(2) + centre(3)) / 2 + 4)
  expect(between.run(1200).centerX).toBeCloseTo(centre(3), 0)
})

it('keeps the lens inside the bar when the finger drags past its end', () => {
  const { finger, run } = driver(1)
  finger('pressed', centre(1))
  finger('dragging', -60)
  const capsule = run(600)
  expect(capsule.centerX - capsule.halfWidth).toBeGreaterThanOrEqual(-1e-6)
  finger('dragging', 460)
  const right = run(600)
  expect(right.centerX + right.halfWidth).toBeLessThanOrEqual(400 + 1e-6)
})

const scopes: GlassRegion = {
  id: 'scopes',
  layer: { id: 'navigation-chrome', depth: 100, attachment: { kind: 'fixed' } },
  frame: { x: 20, y: 116, width: 400, height: 36 },
  shape: 'capsule',
  material: Glass.regular.material,
  selection: { index: 1, count: 4 },
}
const presenter = {
  id: 'p',
  regionIds: ['scopes'],
  layerId: 'navigation-chrome',
  role: 'material',
  origin: { x: 0, y: 100 },
  width: 440,
  height: 80,
} as never
const scene = { revision: 1, layers: [], regions: [scopes], scrolls: [] }

it('draws a resting scope selection as the shared tab-selection pill: 4 pt inset, 28 pt tall', () => {
  const spec = regionSpec(scopes, presenter, scene)
  expect(spec.tabSelection).toMatchObject({
    lensMix: 0,
    capsule: { centerX: 4 + 98 * 1.5, centerY: 18, halfWidth: 49, halfHeight: 14, radius: 14 },
  })
  // Pressed, the bar lights: its tint pass must exist from install, as interactive glass's does
  // (an invisible floor). Without it the first press drew into an unallocated target (GlassError).
  expect(spec.tint?.[3]).toBeGreaterThan(0)
  expect(spec.tint?.[3]).toBeLessThan(1e-3)
  expect(regionSpec({ ...scopes, selection: undefined }, presenter, scene).tabSelection).toBe(
    undefined,
  )
})

it("keeps a region's own material blur on resume: only the dock takes the tab bar's sigma", () => {
  const spec = regionSpec(scopes, presenter, scene)
  expect(retainedAppearanceSpec(spec, 'dark').blurSigmaCssPx).toBe(spec.blurSigmaCssPx)
  const dock = { ...spec, id: 'dock' as const }
  expect(retainedAppearanceSpec(dock, 'dark').blurSigmaCssPx).toBe(TAB_BAR_BLUR_SIGMA.dark)
})

it('paints no CSS pill in the scope bar: the glass renderer draws the thumb', () => {
  const style = document.createElement('style')
  style.textContent = readFileSync('src/styles.css', 'utf8')
  document.head.append(style)
  document.body.innerHTML =
    '<div data-satin-search-scopes><div data-satin-segmented="true"><span data-satin-segmented-selection="true"></span></div></div>' +
    '<div data-satin-segmented="true"><span id="plain" data-satin-segmented-selection="true"></span></div>'
  const pill = document.querySelector<HTMLElement>(
    '[data-satin-search-scopes] [data-satin-segmented-selection]',
  )!
  expect(getComputedStyle(pill).display).toBe('none')
  expect(getComputedStyle(document.getElementById('plain')!).display).not.toBe('none')
})

// The native light lens is visible mid-slide because it refracts and magnifies the
// labels. The labels are the region's foreground ink, so the shared lens bends them like the tab
// bar's: one glyph anchor per segment centre, and the ink drawn over the pill at rest.
it('gives the lens one glyph anchor per scope segment centre', () => {
  const selection = regionSpec(scopes, presenter, scene).tabSelection!
  expect(selection.glyphCount).toBe(4)
  expect(selection.glyphAnchors).toEqual([4 + 98 / 2, 400 - 4 - 98 / 2])
  const two = regionSpec(
    { ...scopes, frame: { ...scopes.frame, width: 385.4 }, selection: { index: 0, count: 2 } },
    presenter,
    scene,
  ).tabSelection!
  expect(two.glyphCount).toBe(2)
  expect(two.glyphAnchors![0]).toBeCloseTo(4 + 188.7 / 2)
})

it('draws the scope labels as region ink in sample space, over the pill', () => {
  const spec = regionSpec(scopes, presenter, scene)
  expect(selectionInk(spec, undefined)).toBe(spec)
  const atlas = { width: spec.sampleWidth, height: spec.sampleHeight }
  const inked = selectionInk(spec, atlas)
  expect(inked.ink).toEqual({
    atlas,
    layers: [
      {
        source: { x: 0, y: 0, ...atlas },
        frame: { x: -spec.sampleInsetX, y: -spec.sampleInsetY, ...atlas },
        opacity: 1,
        blur: 0,
        lens: 0,
        lensWidth: 1,
      },
    ],
  })
  // Glass without a selection never carries selection ink.
  const plain = regionSpec({ ...scopes, selection: undefined }, presenter, scene)
  expect(selectionInk(plain, atlas)).toBe(plain)
})

it('sizes the scope bar like native: compact, centred, equal segments of at least 188.7 pt', () => {
  const css = readFileSync('src/styles.css', 'utf8')
  const rule = /\[data-satin-search-scopes\] \{([^}]*)\}/.exec(css)![1]
  expect(rule).toContain('width: fit-content')
  expect(rule).toContain(
    'min-width: min(100%, calc(var(--satin-search-scope-count, 1) * 188.7px + 8px))',
  )
  expect(rule).toContain('margin: 10px auto 0')
  // Two scopes: the native reference's 385.4 pt bar.
  expect(2 * 188.7 + 8).toBeCloseTo(385.4)
  expect(css).toMatch(
    /\[data-satin-search-scopes\]\[data-satin-glass-ink='true'\] \[data-satin-segmented='true'\] \{\s*-webkit-text-fill-color: transparent;/,
  )
})

// Native (iPhone 17 Pro Max Simulator, iOS 27.0, a 1.2 s hold): pressed anywhere, the 400 pt bar
// is 416 pt wide and still 36 pt tall, and its labels and pill grow by 1.04 about its centre.
it('grows the pressed bar wider but not taller, with its pill and labels, and restores it', () => {
  const { thumb, finger, run, now } = driver(1)
  const atlas = { width: 440, height: 76 }
  const posed = () =>
    thumb.pose(selectionInk(regionSpec(scopes, presenter, scene), atlas), scopes.selection!)
  const rest = posed()
  finger('pressed', centre(3))
  run(500)
  const held = posed()
  expect(held.shape.first.halfWidth * 2).toBeCloseTo(416, 1)
  expect(held.shape.first.halfHeight * 2).toBe(36)
  const scale = 416 / 400
  expect(held.tabSelection!.capsule.halfWidth).toBeCloseTo(
    rest.tabSelection!.capsule.halfWidth * scale,
    2,
  )
  expect(held.tabSelection!.capsule.centerX - 200).toBeCloseTo(
    (rest.tabSelection!.capsule.centerX - 200) * scale,
    2,
  )
  expect(held.ink!.layers[0].frame.width).toBeCloseTo(atlas.width * scale, 2)
  // A press on another segment holds the pill where it is.
  expect(thumb.motion.capsule().centerX).toBeCloseTo(centre(1), 1)
  finger('releasing', centre(3))
  run(2000)
  expect(posed().shape.first.halfWidth * 2).toBeCloseTo(400, 1)
  expect(thumb.live(now())).toBe(false)
})
