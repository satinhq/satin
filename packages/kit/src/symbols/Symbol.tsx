import {
  createContext,
  useContext,
  useId,
  useRef,
  type CSSProperties,
  type ReactNode,
  type SVGProps,
} from 'react'
import { coreSymbols, type CoreSymbolName } from './catalogue.ts'
import { isExcludedSymbolName } from './exclusions.ts'
import {
  symbolGeometry,
  symbolNormalization,
  symbolNormalizationTransform,
  symbolOutlineOffset,
} from './metrics.ts'
import { useInheritedSymbolWeight } from './inheritedWeight.ts'
import type {
  SymbolGlyph,
  SymbolSource,
  SymbolWeight,
  SymbolScale,
  SymbolRenderingMode,
} from './types.ts'

/** A symbol name, such as `'plus'` or `'trash.fill'`. The bundled names autocomplete; any string
 * is accepted for glyphs added through `SymbolProvider`. */
export type SymbolName = CoreSymbolName | (string & {})
const SourceContext = createContext<SymbolSource>(coreSymbols)
export const SymbolSelectionContext = createContext(false)
/** Adds or replaces symbol glyphs for everything inside it. Paths must be original, or
 * redistributable with their provenance recorded. */
export function SymbolProvider({
  glyphs,
  children,
}: {
  glyphs: SymbolSource
  children: ReactNode
}) {
  const inherited = useContext(SourceContext)
  return <SourceContext value={{ ...inherited, ...glyphs }}>{children}</SourceContext>
}
export function resolveSymbol(
  source: SymbolSource,
  name: string,
  selected = false,
): SymbolGlyph | undefined {
  if (isExcludedSymbolName(name)) return undefined
  const filledName = `${name}.fill`
  if (selected && !name.endsWith('.fill') && Object.hasOwn(source, filledName))
    return source[filledName]
  return Object.hasOwn(source, name) ? source[name] : undefined
}
/** The symbol's name, symbol properties and an optional accessible label. */
export type SymbolImageProps = Omit<SVGProps<SVGSVGElement>, 'name' | 'children' | 'scale'> & {
  name: SymbolName
  weight?: SymbolWeight
  scale?: SymbolScale
  selected?: boolean
  renderingMode?: SymbolRenderingMode
  palette?: readonly [string, string?, string?]
  /** Decorative by default; label an independently meaningful symbol, or label its parent button. */
  label?: string
  glyph?: SymbolGlyph
}
/**
 * Draws a named vector symbol that sizes with the surrounding font and takes its colour. A
 * `.fill` variant is chosen automatically where the context calls for it, such as a selected
 * tab.
 *
 * @example
 * <SymbolImage name="star.fill" />
 */
export function SymbolImage({
  name,
  weight: explicitWeight,
  scale = 'medium',
  selected,
  renderingMode = 'monochrome',
  palette,
  label,
  glyph: suppliedGlyph,
  style,
  ...props
}: SymbolImageProps) {
  const source = useContext(SourceContext)
  const inheritedSelection = useContext(SymbolSelectionContext)
  const ref = useRef<SVGSVGElement>(null)
  const weight = useInheritedSymbolWeight(ref, explicitWeight)
  const maskId = `satin-symbol-${useId().replaceAll(':', '')}`
  const glyph = isExcludedSymbolName(name)
    ? undefined
    : (suppliedGlyph ?? resolveSymbol(source, name, selected ?? inheritedSelection))
  const artwork: SymbolGlyph = glyph ?? coreSymbols['questionmark.square']
  const normalization = symbolNormalization(artwork, weight)
  const geometry = symbolGeometry(scale, artwork.opticalSize, normalization?.baseline)
  const offset = symbolOutlineOffset(weight)
  const accessibleLabel = label ?? props['aria-label']
  const meaningful = Boolean(accessibleLabel || props['aria-labelledby'])
  const layers = { primary: 0, secondary: 1, tertiary: 2 } as const
  const layout: CSSProperties = {
    display: 'inline-block',
    verticalAlign: `${geometry.verticalAlign}em`,
    flexShrink: 0,
    overflow: 'visible',
    ...style,
  }
  return (
    <svg
      {...props}
      ref={ref}
      width={props.width ?? `${geometry.size}em`}
      height={props.height ?? `${geometry.size}em`}
      viewBox="0 0 56 56"
      focusable="false"
      role={meaningful ? 'img' : 'presentation'}
      aria-label={accessibleLabel}
      aria-hidden={props['aria-hidden'] ?? (meaningful ? undefined : true)}
      data-satin-symbol={name}
      data-satin-symbol-weight={weight}
      data-satin-symbol-placeholder={artwork.placeholder || !glyph || undefined}
      style={layout}
    >
      {offset < 0 && (
        <defs>
          <mask
            id={maskId}
            maskUnits="userSpaceOnUse"
            x="-4"
            y="-4"
            width="64"
            height="64"
            style={{ maskType: 'luminance' }}
          >
            {artwork.paths.map((path, index) => (
              <path
                key={index}
                d={path.d}
                transform={path.transform}
                fillRule={path.fillRule}
                fill="white"
                stroke="black"
                strokeWidth={-offset}
                strokeLinejoin="round"
              />
            ))}
          </mask>
        </defs>
      )}
      <g
        mask={offset < 0 ? `url(#${maskId})` : undefined}
        transform={symbolNormalizationTransform(artwork, weight)}
      >
        {artwork.paths.map((path, index) => {
          const layer = layers[path.layer ?? 'primary']
          const color =
            renderingMode === 'palette'
              ? (palette?.[layer] ?? palette?.[0] ?? 'currentColor')
              : 'currentColor'
          return (
            <path
              key={index}
              d={path.d}
              transform={path.transform}
              fillRule={path.fillRule}
              fill={color}
              stroke={offset > 0 ? color : undefined}
              strokeWidth={Math.max(0, offset)}
              strokeLinejoin="round"
              opacity={renderingMode === 'hierarchical' ? [1, 0.55, 0.3][layer] : undefined}
            />
          )
        })}
      </g>
    </svg>
  )
}
