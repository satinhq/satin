import { morphFieldUniforms, morphFieldSampleBounds } from '../morphField.ts'
import { contextBackdropFit, contextPreviewShadow, contextMenuShadow } from './contextComposite.ts'
import type { FrameGraph } from './frameGraph.ts'
import { viewOf, type Passes, type Target, type Values } from './passes.ts'
import { alertDiffusionUniforms } from './presentationDiffusion.ts'
import { presentationBlurUniforms, presentationUniforms } from './presentationMaterial.ts'
import { clearRestValues } from './restMaterial.ts'
import { fieldInkUniforms } from './fieldInk.ts'
import { touchLightUniforms } from './touchLight.ts'
import {
  dockGlyphAnchors,
  glyphVibrancy,
  inputUniforms,
  outputUniforms,
  selectionBaseUniforms,
  selectionBlurUniforms,
  selectionPillUniforms,
  shapeUniform,
  type ResultLayout,
} from './rasterUniforms.ts'

// The material and tab-selection passes of a raster's result (raster.ts encodeResult).

/** The surface's material into the material target: a presentation treatment (context menu
 * backdrop/preview, alert, sheet), the clear variant, or the material bar/menu material with
 * its tint; a context menu then gets its shadow. */
/** Whether a surface's resting material is the bar kernel (not a menu, a presentation
 * treatment or clear glass). */
export function usesBarKernel(spec: ResultLayout['spec']) {
  const material = !spec.treatment || spec.treatment === 'contextMenu'
  return material && spec.variant !== 'clear' && spec.materialProfile !== 'menu'
}

/** Whether the blur pyramid is the bar material's (areaMips.ts): exact area averages over
 * storage padded to whole coarse texels, so the glass's interior brightness over a still
 * backdrop does not follow the surface's size. Every surface the bar kernel draws: the tab bar,
 * its accessory, toolbar and glass buttons. Menus and presentation treatments keep the chained
 * pyramid their materials were fitted on. */
export function usesAreaMips(spec: ResultLayout['spec']) {
  return usesBarKernel(spec)
}

/** The tab material does not paint its 128 pt backdrop overscan. Keep a generous
 * 64 pt output margin around every capsule; the fitted bar shadow has radius 4 pt
 * and offset 8 pt. The source and blur pyramid still retain their full sample area. */
export function tabMaterialBounds(spec: ResultLayout['spec']) {
  if (!spec.tabSelection || spec.materialProfile !== 'chrome' || spec.treatment) return undefined
  const members = spec.shape.members?.length
    ? spec.shape.members
    : [spec.shape.first, ...(spec.shape.second ? [spec.shape.second] : [])]
  const margin = 64 + (Math.max(0, spec.shape.blendRadius) * (members.length - 1)) / 4
  const left = Math.min(...members.map(s => s.centerX - s.halfWidth)) + spec.sampleInsetX - margin
  const right = Math.max(...members.map(s => s.centerX + s.halfWidth)) + spec.sampleInsetX + margin
  const top = Math.min(...members.map(s => s.centerY - s.halfHeight)) + spec.sampleInsetY - margin
  const bottom =
    Math.max(...members.map(s => s.centerY + s.halfHeight)) + spec.sampleInsetY + margin
  return [left, top, right - left, bottom - top]
}

export function encodeMaterial(
  encoder: GPUCommandEncoder,
  passes: Passes,
  targets: Record<string, Target>,
  layout: ResultLayout,
  material: Values,
) {
  const { spec, appearance, resolution, sampleWidth, sampleHeight } = layout
  const fieldBounds = tabMaterialBounds(spec) ?? morphFieldSampleBounds(spec)
  const fieldScissor = fieldBounds?.map(value => value * resolution)
  const first = spec.shape.first
  if (spec.treatment === 'contextBackdrop' || spec.treatment === 'contextPreview') {
    const fit = contextBackdropFit[appearance]
    const preview = spec.treatment === 'contextPreview'
    const values = {
      uResolution: [sampleWidth, sampleHeight],
      uShape: shapeUniform(spec, first),
      uRadius: first.radius,
      uFilter: [preview ? 0 : fit.sigma, 1, 0, 0],
      uAxis: [1, 0],
      uShadow: [0, 0, 0],
    }
    passes.kernel(encoder, 'contextComposite', targets.presentationHorizontal, values, {
      uTexture: preview ? targets.glyphs : targets.source,
    })
    passes.kernel(
      encoder,
      'contextComposite',
      targets.material,
      {
        ...values,
        uAxis: [0, 1],
        uShadow: preview ? contextPreviewShadow : [0, 0, 0],
        uFilter: [preview ? 0 : fit.sigma, preview ? 1 : fit.gain, preview ? 0 : fit.bias, 0],
      },
      { uTexture: targets.presentationHorizontal },
    )
  } else if (
    spec.treatment === 'alert' ||
    spec.treatment === 'confirmation' ||
    spec.treatment === 'sheet'
  ) {
    const diffusion = spec.treatment === 'sheet' ? 'sheetDiffusion' : 'presentationDiffusion'
    const mip = Math.max(0, Math.log2(resolution * 0.5))
    passes.kernel(
      encoder,
      diffusion,
      targets.presentationHorizontal,
      alertDiffusionUniforms(
        sampleWidth,
        sampleHeight,
        [1, 0],
        targets.pyramid.width,
        targets.pyramid.height,
        resolution * 0.5,
        mip,
      ),
      { uTexture: targets.pyramid },
    )
    passes.kernel(
      encoder,
      diffusion,
      targets.presentationVertical,
      alertDiffusionUniforms(
        sampleWidth,
        sampleHeight,
        [0, 1],
        targets.presentationHorizontal.width,
        targets.presentationHorizontal.height,
      ),
      { uTexture: targets.presentationHorizontal },
    )
    passes.kernel(
      encoder,
      'presentation',
      targets.material,
      presentationUniforms(spec, appearance),
      {
        uTexture: targets.presentationVertical,
      },
    )
  } else if (spec.treatment && spec.treatment !== 'contextMenu') {
    passes.kernel(
      encoder,
      'presentationBlur',
      targets.presentationHorizontal,
      presentationBlurUniforms(spec, [1, 0]),
      { uTexture: targets.source },
    )
    passes.kernel(
      encoder,
      'presentationBlur',
      targets.presentationVertical,
      presentationBlurUniforms(spec, [0, 1]),
      { uTexture: targets.presentationHorizontal },
    )
    passes.kernel(
      encoder,
      'presentation',
      targets.material,
      presentationUniforms(spec, appearance),
      {
        uTexture: targets.presentationVertical,
      },
    )
  } else if (spec.variant === 'clear') {
    const values = {
      ...clearRestValues(spec),
      ...inputUniforms(targets.source, sampleWidth, sampleHeight),
    }
    passes.kernel(
      encoder,
      'clearBlur',
      targets.clearHorizontal,
      { ...values, uAxis: [1, 0] },
      { uTexture: targets.source },
    )
    passes.kernel(
      encoder,
      'clearBlur',
      targets.clearVertical,
      { ...values, uAxis: [0, 1] },
      { uTexture: targets.clearHorizontal },
    )
    passes.kernel(encoder, 'clear', targets.material, values, { uTexture: targets.clearVertical })
  } else {
    const kernel = usesBarKernel(spec) ? 'bar' : 'menu'
    passes.kernel(
      encoder,
      kernel,
      targets.material,
      material,
      { uTexture: targets.pyramid, uSource: targets.source },
      false,
      fieldScissor,
    )
    if (spec.tint?.[3]) {
      passes.kernel(
        encoder,
        'tint',
        targets.tinted,
        {
          ...morphFieldUniforms(spec),
          uTint: spec.tint,
          uResolution: [sampleWidth, sampleHeight],
          uShape: shapeUniform(spec, first),
          uRadius: first.radius,
          ...touchLightUniforms(undefined, 0, 0),
        },
        { uTexture: targets.material },
        false,
        fieldScissor,
      )
      const previousMaterial = targets.material
      targets.material = targets.tinted
      targets.tinted = previousMaterial
    }
    // Ink inside the field (a menu's rows and trigger glyph), lensed by its rim, over the material.
    if (spec.ink && spec.shape.members?.length) {
      const field = morphFieldUniforms(spec)
      for (const layer of spec.ink.layers)
        passes.kernel(
          encoder,
          'ink',
          targets.material,
          fieldInkUniforms(spec, spec.ink.atlas, layer, field, resolution),
          { uTexture: targets.glyphs },
          true,
          fieldScissor,
        )
    }
  }
  const highlight = spec.memberHighlight
  const highlightedMember = highlight && spec.shape.members?.[highlight.member]
  if (highlightedMember && (highlight.amount > 0 || (highlight.light?.intensity ?? 0) > 0)) {
    // Reuse the tint kernel with a singleton mask. The material and final aperture
    // remain the complete blended field, including all untouched neighbours. The member's
    // touch light is drawn here too, so it stays inside the pressed member.
    const mask = {
      ...spec,
      shape: {
        ...spec.shape,
        first: highlightedMember,
        members: [highlightedMember],
        blendRadius: 0,
      },
    }
    passes.kernel(
      encoder,
      'tint',
      targets.tinted,
      {
        ...morphFieldUniforms(mask),
        uTint: [1, 1, 1, highlight.amount],
        uResolution: [sampleWidth, sampleHeight],
        uShape: shapeUniform(spec, highlightedMember),
        uRadius: highlightedMember.radius,
        ...touchLightUniforms(highlight.light, spec.sampleInsetX, spec.sampleInsetY),
      },
      { uTexture: targets.material },
      false,
      fieldScissor,
    )
    const previousMaterial = targets.material
    targets.material = targets.tinted
    targets.tinted = previousMaterial
  }
  if (spec.treatment === 'contextMenu') {
    passes.kernel(
      encoder,
      'contextComposite',
      targets.presentationVertical,
      {
        uResolution: [sampleWidth, sampleHeight],
        uShape: shapeUniform(spec, first),
        uRadius: [first.radius, 1],
        uFilter: [0, 1, 0, 0],
        uAxis: [0, 0],
        uShadow: contextMenuShadow,
      },
      { uTexture: targets.material },
    )
    passes.copy(
      encoder,
      viewOf(targets.presentationVertical.texture),
      viewOf(targets.material.texture),
    )
  }
}

/** The tab bar's selection pill (native selection recipe) and, while the pill lifts, its lens,
 * over a composed scratch of the backdrop and the bar material. */
export function encodeTabSelection(
  encoder: GPUCommandEncoder,
  passes: Passes,
  targets: Record<string, Target>,
  graph: FrameGraph,
  layout: ResultLayout,
  baseKey: string,
) {
  const { spec, appearance, resolution, sampleWidth, sampleHeight } = layout
  passes.copy(encoder, viewOf(targets.source.texture), viewOf(targets.composed.texture))
  passes.copy(
    encoder,
    viewOf(targets.material.texture),
    viewOf(targets.composed.texture),
    'rgba8unorm',
    true,
    true,
  )
  const selection = spec.tabSelection!
  const lensMix = selection.lensMix ?? 0
  const base = selectionBaseUniforms(layout, targets.composed)
  if (lensMix < 1) {
    const blur = selectionBlurUniforms(layout, targets.composed)
    passes.kernel(
      encoder,
      'gaussian',
      targets.horizontal,
      {
        ...blur,
        __viewport: [sampleWidth * resolution * 0.25, sampleHeight * resolution * 0.25],
      },
      { uTexture: targets.composed },
    )
    passes.kernel(
      encoder,
      'gaussian',
      targets.vertical,
      {
        ...blur,
        ...inputUniforms(targets.horizontal, sampleWidth, sampleHeight),
        uStep: [0, 1 / targets.vertical.height],
        uCross: [0, 0],
      },
      { uTexture: targets.horizontal },
    )
    passes.kernel(
      encoder,
      'pill',
      targets.result,
      selectionPillUniforms(layout, base, targets.vertical),
      { uTexture: targets.composed, uSelectionTexture: targets.vertical },
      true,
    )
  }
  // Ink over a single-shape surface (the scope bar's labels, in its foreground atlas's sample
  // space) sits above the pill like the page text it replaces; the lens that follows bends it.
  if (spec.ink && !spec.shape.members?.length) {
    const field = morphFieldUniforms({
      ...spec,
      shape: { ...spec.shape, members: [spec.shape.first] },
    })
    for (const layer of spec.ink.layers)
      passes.kernel(
        encoder,
        'ink',
        targets.result,
        {
          ...fieldInkUniforms(spec, spec.ink.atlas, layer, field, resolution),
          ...outputUniforms(layout, sampleWidth, sampleHeight),
        },
        { uTexture: targets.glyphs },
        true,
      )
  }
  if (lensMix > 0) {
    const count = Math.max(1, selection.glyphCount ?? 4)
    passes.kernel(
      encoder,
      'lens',
      targets.result,
      {
        ...base,
        uMaterialMix: selection.materialMix * lensMix,
        uGlyphAnchors: selection.glyphAnchors
          ? selection.glyphAnchors.map(x => x + spec.sampleInsetX)
          : dockGlyphAnchors(spec, count),
        uGlyphCount: count,
        uDockShape: shapeUniform(spec, spec.shape.first),
        uGlyphVibrancy: glyphVibrancy(appearance),
      },
      {
        uTexture: targets.composed,
        uClearSource: targets.composed,
        uGlyphSource: targets.glyphs,
      },
      true,
    )
  }
  graph.mark(targets.composed, baseKey)
}
