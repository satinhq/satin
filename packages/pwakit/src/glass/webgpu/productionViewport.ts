import type { RuntimeGeometry, SurfaceRenderSpec } from '../renderSpecs.ts'
import type { WebGPURequest as Request } from '../worker/protocol.ts'

/** [left, top, width, height] in CSS px. */
export type CanvasViewport = readonly [number, number, number, number]

/** The chrome and lift canvases a runtime presents on. */
export type SurfaceCanvases = {
  chrome: HTMLCanvasElement
  menu: HTMLCanvasElement
  chromeLift: HTMLCanvasElement
  menuLift: HTMLCanvasElement
}

/** Place a canvas element on its band of the layer. */
export function placeCanvas(canvas: HTMLCanvasElement, [left, top, width, height]: CanvasViewport) {
  Object.assign(canvas.style, {
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    height: `${height}px`,
  })
}

/** The band a surface's canvas covers. A surface draws only inside its sample rectangle. The
 * dock's band spans the full width from its highest sample row to the bottom (minimized pills
 * stay inside); the menu's is its envelope (open and closed). */
export function surfaceViewport(
  spec: SurfaceRenderSpec,
  geometry: RuntimeGeometry,
): CanvasViewport {
  const top = Math.max(0, Math.floor(spec.frameY - spec.sampleInsetY))
  if (spec.id !== 'right')
    return [0, top, Math.ceil(geometry.width), Math.ceil(geometry.height) - top]
  const left = Math.max(0, Math.floor(spec.frameX - spec.sampleInsetX))
  const right = Math.min(
    Math.ceil(geometry.width),
    Math.ceil(spec.frameX - spec.sampleInsetX + spec.sampleWidth),
  )
  const bottom = Math.min(
    Math.ceil(geometry.height),
    Math.ceil(spec.frameY - spec.sampleInsetY + spec.sampleHeight),
  )
  return [left, top, right - left, bottom - top]
}

/** Move each surface's canvas (and its lift canvas) onto the band it reaches. Returns the
 * `layer-viewport` requests for the bands that changed; `installed` holds each layer's band key. */
export function placeSurfaceCanvases(
  specs: readonly SurfaceRenderSpec[],
  geometry: RuntimeGeometry,
  canvases: SurfaceCanvases,
  liftAttached: boolean,
  installed: Map<string, string>,
) {
  const requests: Request[] = []
  const placements = specs.flatMap(spec => [
    {
      spec,
      layerId: spec.id === 'right' ? 'menu' : 'chrome',
      canvas: spec.id === 'right' ? canvases.menu : canvases.chrome,
    },
    ...(liftAttached
      ? [
          {
            spec,
            layerId: spec.id === 'right' ? 'menu-lift' : 'chrome-lift',
            canvas: spec.id === 'right' ? canvases.menuLift : canvases.chromeLift,
          },
        ]
      : []),
  ])
  for (const { spec, layerId, canvas } of placements) {
    const viewport = surfaceViewport(spec, geometry)
    const key = JSON.stringify(viewport)
    if (installed.get(layerId) === key || viewport[2] <= 0 || viewport[3] <= 0) continue
    installed.set(layerId, key)
    placeCanvas(canvas, viewport)
    requests.push({ type: 'layer-viewport', layerId, viewport })
  }
  return requests
}
