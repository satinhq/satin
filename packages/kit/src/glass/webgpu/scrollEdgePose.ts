import type { ScrollEdge } from './scrollEdgeBackdrop.ts'
import type { NavigationPose } from './productionTracks.ts'

/** Apply the resident navigation pose and front-page occlusion without reading DOM per frame. */
export function poseScrollEdges(edges: readonly ScrollEdge[], pose?: NavigationPose): ScrollEdge[] {
  return edges.flatMap(edge => {
    const navigation = edge.navigation
    if (!navigation) return [edge]
    const zoom = pose?.routes?.[navigation.route]?.zoom
    if (zoom) {
      const y = (value: number) => zoom.y + (value - zoom.origin[1]) * zoom.scale
      const left = Math.max(zoom.x + (edge.rect[0] - zoom.origin[0]) * zoom.scale, zoom.clip[0])
      const top = Math.max(y(edge.rect[1]), zoom.clip[1])
      const right = Math.min(
        zoom.x + (edge.rect[0] + edge.rect[2] - zoom.origin[0]) * zoom.scale,
        zoom.clip[0] + zoom.clip[2],
      )
      const bottom = Math.min(y(edge.rect[1] + edge.rect[3]), zoom.clip[1] + zoom.clip[3])
      if (right <= left || bottom <= top) return []
      return [
        {
          ...edge,
          rect: [left, top, right - left, bottom - top] as const,
          solid: y(edge.solid),
          sigma: edge.sigma * zoom.scale,
          wide: edge.wide ? { ...edge.wide, sigma: edge.wide.sigma * zoom.scale } : undefined,
          mask: edge.mask?.map(([position, alpha]) => [y(position), alpha] as const),
          cap: edge.cap
            ? { ...edge.cap, solid: y(edge.cap.solid), end: y(edge.cap.end) }
            : undefined,
          zoomClip: { rect: zoom.clip, radius: zoom.radius },
          zoomOcclusions: navigation.covers.flatMap(index => {
            const cover = pose?.routes?.[index]?.zoom
            return cover ? [{ rect: cover.clip, radius: cover.radius }] : []
          }),
        },
      ]
    }
    const routeX = pose?.routes?.[navigation.route]?.x ?? navigation.origins[navigation.route]
    if (routeX === undefined) return []
    const x = edge.rect[0] + routeX
    const left = Math.max(x, navigation.clip[0])
    let right = Math.min(x + edge.rect[2], navigation.clip[1])
    for (const index of navigation.covers) {
      const frontX = pose?.routes?.[index]?.x ?? navigation.origins[index]
      if (frontX !== undefined) right = Math.min(right, navigation.clip[0] + frontX)
    }
    if (right <= left) return []
    return [{ ...edge, rect: [left, edge.rect[1], right - left, edge.rect[3]] as const }]
  })
}
