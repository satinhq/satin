import { glassRadius, type GlassShape } from '../glass/regions.ts'

/** `buttonBorderShape`. Fixed radii are measured in points. */
export type ButtonBorderShape =
  'automatic' | 'capsule' | Readonly<{ kind: 'roundedRectangle'; cornerRadius: number }>

export function resolveButtonBorderShape(shape: ButtonBorderShape = 'automatic'): GlassShape {
  if (typeof shape === 'string') return 'capsule'
  const resolved: GlassShape = { kind: 'roundedRectangle', cornerRadius: shape.cornerRadius }
  // Use the material's geometry validation and renderer for every button shape.
  glassRadius(resolved, Number.MAX_VALUE, Number.MAX_VALUE)
  return resolved
}
