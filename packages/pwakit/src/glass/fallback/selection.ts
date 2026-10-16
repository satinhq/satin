import { strictGlassRequested } from '../failurePolicy.ts'
/** Explicit initial selection. Release error recovery is owned separately by MaterialEffectRoot. */
export function fallbackGlassRequested() {
  if (typeof document === 'undefined' || strictGlassRequested()) return false
  const query = new URLSearchParams(window.location.search).get('glass')
  return (
    query === 'fallback' ||
    (query === null && document.documentElement.dataset.satinGlass === 'fallback')
  )
}
