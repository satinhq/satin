import { coreSymbols, type CoreSymbolName } from './catalogue.ts'
import { symbolNormalizationTransform, symbolOutlineOffset } from './metrics.ts'
/** Trusted, generated catalogue only. Canvas consumers share the same paths and regular weight. */
export function coreSymbolSvg(name: CoreSymbolName) {
  const glyph = coreSymbols[name]
  const stroke = symbolOutlineOffset('regular')
  const paths = glyph.paths
    .map(path => {
      const attributes = path as { d: string; fillRule?: string; transform?: string }
      return `<path d="${attributes.d}"${attributes.fillRule ? ` fill-rule="${attributes.fillRule}"` : ''}${attributes.transform ? ` transform="${attributes.transform}"` : ''}/>`
    })
    .join('')
  const transform = symbolNormalizationTransform(glyph, 'regular')
  const artwork = transform ? `<g transform="${transform}">${paths}</g>` : paths
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56" fill="currentColor" stroke="currentColor" stroke-width="${stroke}" stroke-linejoin="round">${artwork}</svg>`
}
