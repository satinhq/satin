/** Instrumentation must not raster/style-sample every retained page. Keep the
 * root (popToRoot), recent painted participants, and report omitted layers. */
export function selectNavigationProbeLayers<
  T extends { dataset: { satinRenderSuspended?: string } },
>(layers: readonly T[]): T[] {
  const painted = layers.filter(layer => layer.dataset.satinRenderSuspended !== 'true')
  if (painted.length <= 8) return painted
  return [painted[0]!, ...painted.slice(-7)]
}
