/** Mutations inside framework chrome (controls, bars) never damage the glass source: their
 * feedback is presentation (webgpu/production.ts). A control whose painted look changed, such as a
 * Toggle track's colour, asks for that one recapture so glass sampling it does not keep the old
 * paint. Dispatch after the change has finished painting, not per animation frame. */
export const GLASS_SOURCE_DAMAGE_EVENT = 'satin-glass-source-damage'
export function requestGlassSourceDamage(element: Element) {
  element.dispatchEvent(new Event(GLASS_SOURCE_DAMAGE_EVENT, { bubbles: true }))
}
