import type { HTMLAttributes } from 'react'
import type { NamespaceID } from '../motion/matchedGeometry.tsx'
import { Glass, resolveGlass } from './glassValue.ts'
import { GlassFieldContext } from './fieldContext.ts'
import { GlassEffect as Effect } from '../glass/GlassEffect.tsx'
/** Public glass outlines. Sheet-specific corner geometry stays internal. */
export type GlassShape =
  'capsule' | 'circle' | Readonly<{ kind: 'roundedRectangle'; cornerRadius: number }>
/** The glass material, shape, DOM attributes and independent morph identity. */
export type GlassEffectProps = HTMLAttributes<HTMLDivElement> & {
  glass?: Glass
  shape?: GlassShape
  /** A glass-effect identity namespace: ids morph only within one namespace. */
  in?: NamespaceID
  /** Morph identity within namespace; independent of the DOM id. */
  glassEffectID?: string
  /** `glassEffectUnion(id:namespace:)`: effects with one union id draw as one shape. */
  glassEffectUnion?: string
  /** `glassEffectTransition`. */
  glassEffectTransition?: 'matchedGeometry' | 'materialize' | 'identity'
}
/**
 * `glassEffect(_:in:)`: draws Liquid Glass behind its content in the given shape (a
 * capsule by default). Inside a `GlassEffectContainer`, effects with ids morph into one another.
 *
 * @example
 * <GlassEffect glass={Glass.regular.interactive()} shape="circle">
 *   <SymbolImage name="plus" />
 * </GlassEffect>
 */
export function GlassEffect({
  glass = Glass.regular,
  in: namespace,
  glassEffectID,
  glassEffectUnion,
  glassEffectTransition,
  shape,
  ...props
}: GlassEffectProps) {
  if (shape && typeof shape === 'object' && 'bottomCornerRadius' in shape)
    throw new TypeError('GlassEffect shape does not accept bottomCornerRadius.')
  return (
    <GlassFieldContext value={true}>
      <Effect
        {...props}
        namespace={namespace ? glassNamespaceKey(namespace) : undefined}
        shape={shape}
        glass={resolveGlass(glass)}
        glassEffectID={glassEffectID}
        union={glassEffectUnion}
        transition={glassEffectTransition}
      />
    </GlassFieldContext>
  )
}

// Renderer keys stay strings; public identity follows the shared namespace value.
const namespaceKeys = new WeakMap<NamespaceID, string>()
let nextNamespaceKey = 0
function glassNamespaceKey(namespace: NamespaceID): string {
  let key = namespaceKeys.get(namespace)
  if (key === undefined) {
    key = `public-glass-${++nextNamespaceKey}`
    namespaceKeys.set(namespace, key)
  }
  return key
}
