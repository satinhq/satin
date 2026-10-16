import type { GlassTouchLight } from '../renderSpecs.ts'
import type { Values } from './passes.ts'

/** The material kernel consumes the field in its sampling texture's CSS coordinates. */
export function touchLightUniforms(
  light: GlassTouchLight | undefined,
  insetX: number,
  insetY: number,
): Values {
  if (!light) return { uTouchLight: [0, 0, 1, 0], uTouchLightColour: [1, 1, 1, 0] }
  if (
    ![light.x, light.y, light.radius, light.intensity, ...light.colour].every(Number.isFinite) ||
    light.radius <= 0 ||
    light.intensity < 0 ||
    light.intensity > 1 ||
    light.colour.some(channel => channel < 0 || channel > 1)
  )
    throw Error('Invalid glass touch light')
  return {
    uTouchLight: [light.x + insetX, light.y + insetY, light.radius, light.intensity],
    uTouchLightColour: [...light.colour, 0],
  }
}
