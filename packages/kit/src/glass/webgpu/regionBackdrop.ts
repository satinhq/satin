type RegionMembership = {
  readonly size: number
  subscribe(listener: () => void): () => void
}
/** Chrome-only launch does not upload a backdrop for app materials. The first
 * later material needs a source preparation before its first-show hold can end. */
export function watchRegionBackdrop(registry: RegionMembership, prepare: () => void) {
  let needed = registry.size > 0
  return registry.subscribe(() => {
    const next = registry.size > 0
    const appeared = next && !needed
    needed = next
    if (appeared) prepare()
  })
}
