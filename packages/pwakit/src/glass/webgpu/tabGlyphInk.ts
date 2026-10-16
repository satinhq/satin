/** Transparent border kept above and below the bar frame in each layered ink plane. */
const TAB_INK_MARGIN_PT = 8

/** The vertical band of the sample rectangle that a layered ink plane stores. Ink lives only
 * inside the bar frame; the backdrop's vertical overscan (128 pt each side) never holds any, so
 * storing it would make two planes cost twice the flat atlas instead of about half of it. */
export function tabInkBand(
  spec: { sampleInsetY: number; frameHeight: number },
  resolution: number,
) {
  const pixels = Math.ceil((spec.frameHeight + TAB_INK_MARGIN_PT * 2) * resolution)
  return { top: spec.sampleInsetY - TAB_INK_MARGIN_PT, pixels, height: pixels / resolution }
}

/** Complete semantic ink planes share one cached texture and one foreground composition.
 * The legacy flat atlas remains available to optical fixtures and non-tab controls. */
export const tabGlyphInkShader = /* wgsl */ `
fn tabInkSample(uv: vec2<f32>, label: f32) -> vec4<f32> {
    if (global.uGlyphLayers_slot.x == 0.0) {
        return textureSample(uGlyphSource_texture, sourceSampler, clamp(uv, vec2(0.0), vec2(1.0)));
    }
    let size = vec2<f32>(textureDimensions(uGlyphSource_texture));
    let halfTexel = 0.5 / size;
    // Each plane stores only its band of the sample rectangle (tabInkBand): y = band top, scale.
    let band = (uv.y - global.uGlyphLayers_slot.y) * global.uGlyphLayers_slot.z;
    // Each plane has its own transparent border. Filtering must never reach the other plane.
    let point = vec2<f32>(uv.x, (band + label) * 0.5);
    let low = vec2<f32>(halfTexel.x, label * 0.5 + halfTexel.y);
    let high = vec2<f32>(1.0 - halfTexel.x, (label + 1.0) * 0.5 - halfTexel.y);
    return textureSample(uGlyphSource_texture, sourceSampler, clamp(point, low, high));
}

fn tabInkPlane(point: vec2<f32>, local: vec2<f32>, rimShift: vec2<f32>, outward: vec2<f32>,
    inside: f32, label: f32) -> vec4<f32> {
    let response = clamp(global.uForegroundChroma_slot.x / 255.0, 0.0, 1.0);
    let scale = vec2<f32>(
        1.0 + mix(global.uForegroundScaleX_slot.x, global.uForegroundLabelScaleX_slot.x, label),
        1.0 + mix(global.uForegroundScaleY_slot.x, global.uForegroundLabelScaleY_slot.x, label));
    let anchors = global.uGlyphAnchors_slot.xy;
    let shape = global.uShape_slot;
    let last = max(0.0, global.uGlyphCount_slot.x - 1.0);
    let spacing = max(1.0, (anchors.y - anchors.x) / max(1.0, last));
    let index = clamp(floor((point.x - anchors.x) / spacing + 0.5), 0.0, last);
    let anchor = anchors.x + index * spacing;
    let edgeShift = max(0.0, anchors.x - shape.x) - max(0.0, shape.x - anchors.y);
    // Ink refracts with the backdrop: the rim term is the lens's own continuous displacement,
    // zero in the flat interior. It never depends on travel direction, so a glyph straddling
    // the rim is squeezed into the rim band like native, never translated out of the lens.
    let source = vec2<f32>(anchor + (point.x - anchor) / scale.x, shape.y + local.y / scale.y) + rimShift;
    let shift = mix(global.uForegroundShiftPt_slot.x, global.uForegroundShiftPt_slot.y, label);
    let resolution = global.uResolution_slot.xy;
    let uv = (source + vec2<f32>(edgeShift / scale.x - shift * global.uMotionMix_slot.x, 0.0)) / resolution;
    let soften = outward * 0.75 * abs(outward.x) * exp(-inside / 6.0) * response / resolution;
    let center = tabInkSample(uv, label);
    // Flat interior/top/bottom regions have no horizontal edge softening. The five old reads
    // were identical there. Keep the fitted filter at curved edges, without redundant reads.
    if (all(soften == vec2(0.0))) { return center; }
    return center * 0.4 +
        (tabInkSample(uv + soften * 0.5, label) + tabInkSample(uv - soften * 0.5, label)) * 0.24 +
        (tabInkSample(uv + soften, label) + tabInkSample(uv - soften, label)) * 0.06;
}

fn tabGlyphInk(point: vec2<f32>, local: vec2<f32>, rimShift: vec2<f32>, outward: vec2<f32>,
    inside: f32) -> vec4<f32> {
    var ink: vec4<f32>;
    if (global.uGlyphLayers_slot.x > 0.0) {
        let icon = tabInkPlane(point, local, rimShift, outward, inside, 0.0);
        let label = tabInkPlane(point, local, rimShift, outward, inside, 1.0);
        ink = label + icon * (1.0 - label.a);
    } else {
        ink = tabInkPlane(point, local, rimShift, outward, inside, step(global.uDockShape_slot.y, point.y));
    }
    ink = vec4<f32>(ink.r, clamp(ink.gb + global.uGlyphVibrancy_slot.xy * ink.a *
        global.uMotionMix_slot.x, vec2(0.0), vec2(ink.a)), ink.a);
    return ink;
}
`
