import { readKeyboardLayoutHeight } from '../keyboard/adapter.ts'
import { ADAPTIVE_LAYOUT_POLICY } from '../layout/layoutClass.ts'
import { SATIN_VIEWPORT, resolveViewportFit, type ViewportFitPolicy } from './viewportValue.ts'

/** Own the live meta value; keyboard visualViewport changes do not select a fit. */
export function installViewportPolicy(policy: ViewportFitPolicy = 'adaptive') {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
  const existing = meta
  const previous = meta?.getAttribute('content')
  const previousFit = document.documentElement.getAttribute('data-satin-viewport-fit')
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'viewport'
    document.head.appendChild(meta)
  }
  const apply = () => {
    const fit = resolveViewportFit(
      policy,
      navigator.userAgent,
      navigator.platform,
      navigator.maxTouchPoints,
      window.innerWidth,
      readKeyboardLayoutHeight(window.innerWidth, window.innerHeight),
      ADAPTIVE_LAYOUT_POLICY.horizontal.regularMinimum,
      ADAPTIVE_LAYOUT_POLICY.vertical.regularMinimum,
    )
    const content = SATIN_VIEWPORT.replace('viewport-fit=cover', `viewport-fit=${fit}`)
    if (meta.content !== content) meta.content = content
    if (document.documentElement.dataset.satinViewportFit !== fit)
      document.documentElement.dataset.satinViewportFit = fit
  }
  apply()
  window.addEventListener('resize', apply)
  window.addEventListener('orientationchange', apply)
  window.addEventListener('pageshow', apply)
  return () => {
    window.removeEventListener('resize', apply)
    window.removeEventListener('orientationchange', apply)
    window.removeEventListener('pageshow', apply)
    if (!existing) meta.remove()
    else if (previous === null || previous === undefined) meta.removeAttribute('content')
    else meta.content = previous
    if (previousFit === null) document.documentElement.removeAttribute('data-satin-viewport-fit')
    else document.documentElement.setAttribute('data-satin-viewport-fit', previousFit)
  }
}
