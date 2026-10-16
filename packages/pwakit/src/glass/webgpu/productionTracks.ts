import type { SurfaceRenderSpec } from '../renderSpecs.ts'
import type { ZoomGlassPose } from '../../navigation/zoomGlass.ts'
export type RegionTrack = {
  id: string
  epoch: number
  duration: number
  specs: readonly SurfaceRenderSpec[]
}
/** Uniformly sampled measured geometry. Only numeric leaves interpolate. */
export function interpolateValue<T>(a: T, b: T, t: number): T {
  if (typeof a === 'number' && typeof b === 'number') return (a + (b - a) * t) as T
  if (Array.isArray(a) && Array.isArray(b))
    return a.map((v, i) => interpolateValue(v, b[i], t)) as T
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const result = { ...a } as Record<string, unknown>
    for (const key of Object.keys(a))
      result[key] = interpolateValue(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
        t,
      )
    return result as T
  }
  return t < 1 ? a : b
}
export function sampleRegion(track: RegionTrack, at: number) {
  const index =
    Math.max(0, Math.min(1, (at - track.epoch) / track.duration)) * (track.specs.length - 1)
  return interpolateValue(track.specs[Math.floor(index)], track.specs[Math.ceil(index)], index % 1)
}
export type NavigationPose = {
  routes?: readonly { x: number; dim: number; zoom?: ZoomGlassPose }[]
  frontX: number
  rearX: number
  frontDim: number
  rearDim: number
}
export type NavigationTrack = { epoch: number; duration: number; poses: readonly NavigationPose[] }
export function sampleNavigation(track: NavigationTrack, at: number) {
  const index =
    Math.max(0, Math.min(1, (at - track.epoch) / track.duration)) * (track.poses.length - 1)
  return interpolateValue(track.poses[Math.floor(index)], track.poses[Math.ceil(index)], index % 1)
}
