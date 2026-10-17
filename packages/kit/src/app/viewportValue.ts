/** The viewport fitting policy selected before rendering an app. */
export type ViewportFitPolicy = 'adaptive' | 'auto' | 'cover' | 'contain'
export const SATIN_VIEWPORT =
  'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover'

/** Self-contained so the generated head and runtime use exactly the same rule. */
export function resolveViewportFit(
  policy: ViewportFitPolicy,
  userAgent: string,
  platform: string,
  maxTouchPoints: number,
  width: number,
  height: number,
  regularWidth: number,
  regularHeight: number,
) {
  if (policy !== 'adaptive') return policy
  const ipad =
    /iPad/i.test(userAgent) ||
    (!/iPhone|iPod/i.test(userAgent) && platform === 'MacIntel' && maxTouchPoints > 1)
  // Fitted iPad windows avoid SafariViewService's soft top edge in every size
  // class. Explicit app policy above remains the opt-in to edge-to-edge cover.
  if (ipad) return 'auto'
  const phone = /iPhone|iPod/i.test(userAgent)
  return phone && (width < regularWidth || height < regularHeight) ? 'auto' : 'cover'
}
