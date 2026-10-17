import { safariBarGeometry, safariToolbarCollapse } from './installPolicy.ts'
/**
 * The tip's panel and tail as one closed path, for its size and Safari's layout. The default
 * page's standalone runtime embeds this same function; it also
 * serves the `InstallTip` component of custom install pages.
 */
export type SafariBar = 'compact' | 'toolbar' | 'top' | 'unknown'

export { tipPath } from './installPolicy.ts'

/**
 * Where this Safari keeps the control that starts the flow, from the dynamic toolbar's size
 * (measured on Safari 27 only, like the default page; anything else is 'unknown').
 */
export function classifySafariBar(
  safariVersion: number | null,
  device: 'iphone' | 'ipad' | 'other',
): SafariBar {
  return safariBarGeometry(
    safariVersion,
    device,
    innerWidth,
    innerHeight,
    safariToolbarCollapse(safariVersion, device, innerWidth, innerHeight),
  )
}
