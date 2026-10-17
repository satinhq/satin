import { menuSpring, type MenuSpring } from '../glass/lens/menuSpring.ts'
import {
  sampledKeyframes,
  springMotion,
  springTrack,
  type SpringParameters,
  type SpringTrack,
} from '../motion/springTrack.ts'

export { sampledKeyframes, springTrack, type SpringTrack }

/**
 * Native `.searchable` presentation and dismissal, measured from the presentation layer of a
 * native search drawer (iOS 27.0, 15 focus/close trials in light and dark,
 * every frame).
 *
 * - The field's position and width, the list content, the close button and the field's grey fill
 *   to glass crossfade all ride one spring: mass 1, stiffness 353.23, damping 30.357
 *   (damping ratio 0.808, RMS at most 0.44 pt per trial).
 * - On presentation the large title fades as exp(-travel / 20 pt) of the field's travel so far.
 *   The bar's own title and items fade faster, exp(-travel / 9.5 pt) (standard header, two Simulator takes, RMS 0.012).
 * - The scope bar fades in 131 ms after the field starts, on its own spring; on dismissal it is
 *   gone on the first frame.
 * - On dismissal the title and bar items fade back in 99 ms after the field starts.
 */
export const SEARCH_FIELD_SPRING: SpringParameters = { stiffness: 353.23, damping: 30.357 }
export const SEARCH_SCOPES_IN_SPRING: SpringParameters = {
  stiffness: 606.73,
  damping: 48.677,
  delay: 131,
}
export const SEARCH_TITLE_IN_SPRING: SpringParameters = {
  stiffness: 636.45,
  damping: 50.462,
  delay: 99,
}
/** Points of field travel over which the large title's opacity falls by a factor of e. */
export const SEARCH_TITLE_FADE_PT = 20
/** The same for the bar's inline title and toolbar items. */
export const SEARCH_BAR_ITEMS_FADE_PT = 9.5

/** The search field's spring, carrying the release velocity of a drag. */
export function searchSpring(parameters: SpringParameters, velocity = 0): MenuSpring {
  return springMotion(parameters, velocity)
}

/** Normalised velocity of a running track at `elapsed` ms, for a retarget that keeps momentum. */
export function springVelocity(spring: MenuSpring, elapsed: number) {
  return menuSpring(spring, elapsed).velocity
}

export function titleFadeOpacity(travel: number) {
  return Math.exp(-Math.abs(travel) / SEARCH_TITLE_FADE_PT)
}

export function barItemsFadeOpacity(travel: number) {
  return Math.exp(-Math.abs(travel) / SEARCH_BAR_ITEMS_FADE_PT)
}
