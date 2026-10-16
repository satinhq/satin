import type { FontWeight } from '../content/content.tsx'
/** Filled paths on Framework7's 56-unit grid. No font, HTML or external resource. */
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
/** `Font.Weight` as applied to a symbol. */
export type SymbolWeight = FontWeight
/** `Image.Scale`. */
export type SymbolScale = 'small' | 'medium' | 'large'
/** `SymbolRenderingMode`. */
export type SymbolRenderingMode = 'monochrome' | 'hierarchical' | 'palette'
