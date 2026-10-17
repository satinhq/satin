import type { FontWeight } from '../content/content.tsx'
/** A symbol's artwork: filled SVG paths on a 56-unit grid, with optional layers for hierarchical
 * and palette rendering, and its provenance. No font, HTML or external resource. */
export type SymbolGlyph = Readonly<{
  paths: readonly Readonly<{
    d: string
    transform?: string
    fillRule?: 'nonzero' | 'evenodd'
    layer?: 'primary' | 'secondary' | 'tertiary'
  }>[]
  /** SVG box em size calibrated from native ink bounds; defaults to the circle normalization. */
  opticalSize?: number
  /** Numeric black-box ink and baseline fit. No native paths or raster artwork. */
  normalization?: Partial<
    Record<
      SymbolWeight,
      Readonly<{
        scaleX: number
        scaleY: number
        translateX: number
        translateY: number
        baseline: number
      }>
    >
  >
  provenance: string
  placeholder?: boolean
}>
/** Glyphs by symbol name, for `SymbolProvider`. */
export type SymbolSource = Readonly<Record<string, SymbolGlyph>>
/** The weight a symbol is drawn at. It uses the same names as font weights. */
export type SymbolWeight = FontWeight
/** A symbol's size relative to the text around it: `small`, `medium` or `large`. */
export type SymbolScale = 'small' | 'medium' | 'large'
/** How a symbol's layers are coloured: `monochrome` in one colour, `hierarchical` in shades of
 * one colour, or `palette` with a colour per layer. */
export type SymbolRenderingMode = 'monochrome' | 'hierarchical' | 'palette'
