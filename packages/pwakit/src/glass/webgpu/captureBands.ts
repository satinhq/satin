/** Capture bands as the renderer sees them: no DOM (the glass worker imports this). The page
 * side that chooses bands is captureDemand.ts. */

/** A viewport rectangle a glass surface composes its backdrop from: x, y, width, height (points).
 * It is the surface's sample envelope (`raster.ts` backdropRect): its frame and sampling halo. */
export type SampleRect = readonly [number, number, number, number]

/** Content rows of a plane's capture that hold pixels, in points from the top of its content. */
export type CaptureBand = { readonly top: number; readonly bottom: number }

/** Expand a point interval to complete capture texels. The tiny tolerance removes only
 * floating-point multiplication noise at an exact texel edge, never a visible fraction. */
export function snapCaptureBand(band: CaptureBand, resolution: number): CaptureBand {
  return {
    top: Math.floor(band.top * resolution + 1e-7) / resolution,
    bottom: Math.ceil(band.bottom * resolution - 1e-7) / resolution,
  }
}

/** Whether the captured rows hold every texel needed by the sample. Held bounds describe
 * actual pixels: rounding them outward here would invent rows that were never captured. */
export function bandsCover(
  held: readonly CaptureBand[],
  needed: readonly CaptureBand[],
  resolution = 1,
) {
  return needed.every(band => {
    const sample = snapCaptureBand(band, resolution)
    return held.some(
      holder =>
        holder.top * resolution <= sample.top * resolution + 1e-7 &&
        holder.bottom * resolution >= sample.bottom * resolution - 1e-7,
    )
  })
}

/** The rows of `rect` (viewport points) that a banded layer is asked for but does not hold.
 * Undefined when it holds them: the rows of `rect` its clip lets through, placed at the layer's
 * live origin and limited to its content, lie in one of its bands. Outside real content no
 * captured row is required; the compositor applies the plane's fill/extension policy. */
export function uncoveredRows(
  rect: SampleRect,
  layer: {
    origin: { y: number }
    scroll: { y: number }
    height: number
    resolution?: number
    clip: readonly [number, number, number, number]
    rows?: readonly CaptureBand[]
  },
) {
  if (!layer.rows) return
  const top = Math.max(rect[1], layer.clip[1])
  const bottom = Math.min(rect[1] + rect[3], layer.clip[1] + layer.clip[3])
  if (!(bottom > top)) return
  const from = layer.origin.y - layer.scroll.y
  const needed = snapCaptureBand(
    {
      top: Math.max(0, top - from),
      bottom: Math.min(layer.height, bottom - from),
    },
    layer.resolution ?? 1,
  )
  if (needed.bottom <= needed.top || bandsCover(layer.rows, [needed], layer.resolution)) return
  return needed
}

/** Validate the texture actually selected for the content plane. Navigation replaces the
 * settled banded capture with viewport-space atlas cells, whose rows have their own receipt. */
export function uncoveredSourceRows(
  rect: SampleRect,
  layer: Parameters<typeof uncoveredRows>[1],
  navigation?: { width: number; height: number; rows: readonly CaptureBand[] },
) {
  return uncoveredRows(
    rect,
    navigation
      ? {
          origin: { y: 0 },
          scroll: { y: 0 },
          height: navigation.height,
          resolution: layer.resolution,
          clip: [0, 0, navigation.width, navigation.height],
          rows: navigation.rows,
        }
      : layer,
  )
}
