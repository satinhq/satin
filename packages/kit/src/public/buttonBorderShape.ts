import { glassRadius, type GlassShape } from '../glass/regions.ts'

/** The outline of a bordered button: `automatic`, `capsule`, or a rounded rectangle with a fixed
 * corner radius in points. */
export type ButtonBorderShape =
  'automatic' | 'capsule' | Readonly<{ kind: 'roundedRectangle'; cornerRadius: number }>

export function resolveButtonBorderShape(shape: ButtonBorderShape = 'automatic'): GlassShape {
  if (typeof shape === 'string') return 'capsule'
  const resolved: GlassShape = { kind: 'roundedRectangle', cornerRadius: shape.cornerRadius }
  // Use the material's geometry validation and renderer for every button shape.
  glassRadius(resolved, Number.MAX_VALUE, Number.MAX_VALUE)
  return resolved
}
