export interface ZoomTransform {
  scale: number
  x: number
  y: number
}
export interface ZoomPoint {
  x: number
  y: number
}
export function boundZoom(
  transform: ZoomTransform,
  width: number,
  height: number,
  maximum: number,
): ZoomTransform {
  const scale = Math.max(1, Math.min(maximum, transform.scale))
  return {
    scale,
    x: Math.max(width * (1 - scale), Math.min(0, transform.x)),
    y: Math.max(height * (1 - scale), Math.min(0, transform.y)),
  }
}
export function pinchZoom(
  start: ZoomTransform,
  origin: ZoomPoint,
  center: ZoomPoint,
  ratio: number,
): ZoomTransform {
  const scale = start.scale * ratio
  return {
    scale,
    x: center.x - (origin.x - start.x) * ratio,
    y: center.y - (origin.y - start.y) * ratio,
  }
}
