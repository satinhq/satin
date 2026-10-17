import { Glass as Material, type GlassTint } from '../glass/regions.ts'
const materials = new WeakMap<Glass, Material>()
/**
 * `Glass`: the material intent for a `GlassEffect`. Start from `Glass.regular` or
 * `Glass.clear` and refine it; each call returns a new value. The renderer's treatment stays
 * internal.
 *
 * @example
 * Glass.regular.tintRGBA([0, 0.48, 1, 0.2]).interactive()
 */
export class Glass {
  static readonly regular = new Glass(Material.regular)
  static readonly clear = new Glass(Material.clear)
  private constructor(material: Material) {
    materials.set(this, material)
    Object.freeze(this)
  }
  /** Tints the glass with `[red, green, blue, alpha]`, each 0...1; no argument removes the tint. */
  tintRGBA(color?: GlassTint): Glass {
    return new Glass(resolveGlass(this).tint(color))
  }
  /** `interactive()`: the glass responds to touch. */
  interactive(enabled = true): Glass {
    return new Glass(resolveGlass(this).interactive(enabled))
  }
}
export function resolveGlass(glass: Glass): Material {
  const material = materials.get(glass)
  if (!material) throw new Error('Use Glass.regular or Glass.clear to declare a material')
  return material
}
