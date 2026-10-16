import { keyboardBackdropAnchor, type KeyboardBackdropAnchor } from './keyboardBackdrop.ts'
import { searchBackdropAnchor, type SearchBackdropAnchor } from '../../search/searchBackdrop.ts'
import { withZoomAtRest, zoomRestRect } from '../../navigation/zoomGlass.ts'
import type { GlassCanvas } from '../rendererContract.ts'
import { releaseCaptureCanvas } from './captureRelease.ts'
import { CAPTURE_CONTEXT } from './captureContext.ts'
import { captureRegionForeground } from './foreground.ts'
import { tabInkBand } from './tabGlyphInk.ts'
import {
  lastUnstableMeasurement,
  measureMirrorLayout,
  measureMirrorLayoutRelative,
  type MirrorLayout,
  type MirrorNode,
  type MirrorCaptureRange,
} from '../lens/Scene.tsx'
import { ICON_SVG } from '../lens/icons.ts'
import { measureOrReuse } from '../lens/mirrorReuse.ts'
import { makeReferenceBackgroundCanvas } from '../lens/referenceBackground.ts'
import type { SurfaceRenderSpec } from '../renderSpecs.ts'
import { SupersededImage, settleContentImage } from '../../image/resource.ts'
import { decodedGlassImage } from './decodedImage.ts'
import { glassNow, glassTiming } from './profile.ts'
import { drawBackgroundLayers } from './backgroundLayers.ts'
import { reportGlassError } from '../errors.ts'
import { texelCount } from '../captureWindow.ts'

/** `top`/`left`: viewport origin of the measured host. The capture is in viewport space,
 * so a split layout's content column (right of the sidebar) draws at its own origin. */
export type MeasuredSource = {
  layout: MirrorLayout
  top: number
  left: number
  searchAnchor?: SearchBackdropAnchor
  keyboardAnchor?: KeyboardBackdropAnchor
}
/** A compositor transform may advance between synchronous DOM reads. Reject that
 * snapshot and retry at a bounded frame boundary before anything is rasterized. */
export async function measureProductionSource(
  host: HTMLElement,
  moving = false,
  capture: 'viewport' | 'plane' = 'viewport',
  captureRange?: MirrorCaptureRange,
  /** Return the previous measurement when nothing it read has changed (mirrorReuse.ts). */
  reuse = false,
  /** Wait only for motion that moves `host` itself (a capture that glass is waiting for). */
  ownMotionOnly = false,
): Promise<MeasuredSource> {
  const started = glassNow()
  let reused = false
  // A route inside a running navigation transform moves on every read; its own layout
  // is still stable, so it is measured relative to itself (two identical readings).
  const read = () =>
    withZoomAtRest(
      host,
      () =>
        measureMirrorLayout(host, 'root', true, capture, captureRange) ??
        (moving
          ? measureMirrorLayoutRelative(host, 'root', true, capture, captureRange)
          : undefined),
    )
  const measure = () => {
    if (!reuse || moving) return read()
    const kept = measureOrReuse(host, capture, captureRange, read)
    reused = kept.reused
    return kept.layout
  }
  const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  let layout: MirrorLayout | undefined
  for (let attempt = 0; !layout && attempt < 8; attempt++) {
    // Scheduling can precede a presentation transition. Do not spend the stable-layout
    // retry budget on its intentionally moving frames, or discard resident glass pixels.
    // Detached hosts must not keep a superseded preparation waiting on another dialog.
    const motion = '[data-satin-transition-active="true"],[data-satin-presentation-moving]'
    while (
      !moving &&
      host.isConnected &&
      (host.hasAttribute('data-satin-search-moving') ||
        (ownMotionOnly ? host.closest(motion) : document.querySelector(motion)))
    )
      await nextFrame()
    layout = measure()
    if (!layout) await nextFrame()
  }
  if (!layout)
    throw Error(
      `Glass source moved during all 8 layout measurement attempts${moving && lastUnstableMeasurement ? ` (${lastUnstableMeasurement})` : ''}`,
    )
  // A moving route's own rect includes its navigation transform (applied later as the
  // pose); its column origin is the screen container's untransformed parent.
  const column = moving
    ? (host.closest<HTMLElement>('[data-satin-screen-container]')?.parentElement ?? host)
    : host
  glassTiming('capture-measure', started, () =>
    JSON.stringify({
      host: host.dataset.satinScroll ?? host.dataset.satinScreen ?? host.tagName,
      nodes: layout.nodes.length,
      moving,
      reused,
    }),
  )
  return {
    layout,
    searchAnchor: searchBackdropAnchor(host),
    keyboardAnchor: keyboardBackdropAnchor(host),
    top: zoomRestRect(host)?.y ?? host.getBoundingClientRect().top,
    left: column.getBoundingClientRect().left,
  }
}
/** Every input of `rasterProductionSource`. Equal keys produce identical pixels. */
export function productionSourceKey(
  { layout, top, left }: MeasuredSource,
  width: number,
  height: number,
  resolution: number,
  dark: boolean,
) {
  return JSON.stringify([
    width,
    height,
    resolution,
    dark,
    top,
    left,
    layout.contentHeight,
    layout.nodes,
  ])
}
export const productionSourceHeight = ({ layout, top }: MeasuredSource, height: number) =>
  Math.max(height, layout.contentHeight + top)
type ImageKey = string | Promise<HTMLImageElement | undefined>
const imageUrl = (node: MirrorNode) =>
  node.kind === 'icon' && node.icon
    ? 'data:image/svg+xml;charset=utf-8,' +
      encodeURIComponent(ICON_SVG[node.icon].replace('<svg ', '<svg fill="#ffffff" '))
    : node.kind === 'image'
      ? (node.imageReady ?? node.imageSource)
      : undefined
/** Keep capture diagnostics attached to the DOM element even after measurement. */
function captureFailure(node: MirrorNode, reason: string, cause: unknown) {
  const detail = cause instanceof Error ? cause.message : String(cause)
  const url = node.imageSource?.split(/[?#]/, 1)[0]
  const source = url
    ? ` src=${(url.startsWith('data:') ? url.split(',', 1)[0] : url).slice(0, 200)}`
    : ''
  const element = node.sourceElement ? `${node.sourceElement} (${node.id})` : node.id
  const error = new Error(`${element}${source}: ${detail}`)
  reportGlassError('presentation', error, 'backdrop capture', reason)
  return error
}
/** Decode every icon and image first (shared decode cache), so each raster is one synchronous pass. */
async function decodeIcons(measured: readonly MeasuredSource[]) {
  const icons = new Map<ImageKey, HTMLImageElement>()
  const urls = new Map<ImageKey, MirrorNode[]>()
  for (const { layout } of measured) {
    for (const node of layout.nodes) {
      if (node.regionId) continue
      const url = imageUrl(node)
      if (!url) continue
      const instances = urls.get(url) ?? []
      instances.push(node)
      urls.set(url, instances)
    }
  }
  await Promise.all(
    [...urls].map(async ([url, nodes]) => {
      try {
        const ready = typeof url === 'string' ? decodedGlassImage(url) : url
        // Page artwork can fail offline or be corrupt. Its CSS background has
        // already been measured in paint order; omit only the unavailable pixels.
        const image = nodes.every(node => node.kind === 'image')
          ? await settleContentImage(ready)
          : await ready
        if (image) icons.set(url, image)
      } catch (cause) {
        // A superseded image is not a failure: the caller measures the page again.
        if (!(cause instanceof SupersededImage))
          for (const node of nodes) captureFailure(node, 'image-decode-failed', cause)
        throw cause
      }
    }),
  )
  return icons
}
function context2d(canvas: GlassCanvas, width: number, height: number) {
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
  const ctx = canvas.getContext('2d', CAPTURE_CONTEXT) as
    CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
  if (!ctx) throw Error(`Glass capture canvas ${width}x${height} has no 2D context`)
  // Every node draws inside save/restore; only the transform persists between revisions.
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  return ctx
}
type NodeClips = NonNullable<MirrorNode['clips']>
const NO_CLIPS: NodeClips = []
/** Whether two nodes are clipped by the same ancestor clips, in the same order. */
export function sameClipChain(first: NodeClips, second: NodeClips) {
  if (first === second) return true
  if (first.length !== second.length) return false
  return first.every((clip, index) => {
    const other = second[index]
    return (
      clip.x === other.x &&
      clip.y === other.y &&
      clip.width === other.width &&
      clip.height === other.height &&
      clip.radii.length === other.radii.length &&
      clip.radii.every((radius, corner) => radius === other.radii[corner])
    )
  })
}
/** Draws measured nodes in capture space (the transform maps capture points to pixels).
 *
 * Consecutive nodes under the same ancestor clips share ONE clip: the clip is set once for the
 * run, and each node still draws inside its own save/restore. Every node is clipped by exactly
 * the same paths as before, so the pixels are identical. Clipping per node made a long grouped
 * list quadratic: a canvas taller than 8,192 px is rasterized on the CPU in WebKit, where every
 * clip() of the list's rounded container builds a mask of the whole container (measured: 246
 * nodes in a 15,018 px capture, 1,259 ms per-node against 44 ms shared). */
function drawSourceNodes(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  { layout, top, left }: MeasuredSource,
  icons: ReadonlyMap<ImageKey, HTMLImageElement>,
  resolution: number,
  visible?: { top: number; bottom: number },
) {
  ctx.translate(left, top)
  let runClips: NodeClips | undefined
  try {
    for (const node of layout.nodes) {
      // Region foreground stays above its own material; never bake it into that backdrop.
      if (node.regionId) continue
      // Culling margin far exceeds any node's paint overflow; the clip bounds the result.
      if (
        visible &&
        (node.y + top + node.height < visible.top - 64 || node.y + top > visible.bottom + 64)
      )
        continue
      const clips = node.clips ?? NO_CLIPS
      if (!runClips || !sameClipChain(runClips, clips)) {
        if (runClips) ctx.restore()
        ctx.save()
        for (const clip of clips) {
          ctx.beginPath()
          if (clip.width <= 0 || clip.height <= 0) ctx.rect(0, 0, 0, 0)
          else ctx.roundRect(clip.x, clip.y, clip.width, clip.height, [...clip.radii])
          ctx.clip()
        }
        runClips = clips
      }
      ctx.save()
      try {
        ctx.translate(node.x, node.y)
        ctx.fillStyle = node.color
        if (node.kind === 'rect') {
          ctx.beginPath()
          ctx.roundRect(0, 0, node.width, node.height, node.radius ?? 0)
          ctx.fill()
        } else if (node.kind === 'chevron') {
          ctx.beginPath()
          ctx.moveTo(1.2, 1.2)
          ctx.lineTo(Math.max(2, node.width - 1.2), node.height / 2)
          ctx.lineTo(1.2, Math.max(2, node.height - 1.2))
          ctx.strokeStyle = node.color
          ctx.lineWidth = 1.87
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'
          ctx.stroke()
        } else if (node.kind === 'icon' && node.icon) {
          ctx.drawImage(icons.get(imageUrl(node)!)!, 0, 0, node.width, node.height)
        } else if (node.kind === 'image' && node.imageSource && icons.has(imageUrl(node)!)) {
          const image = icons.get(imageUrl(node)!)!,
            natural = [image.naturalWidth, image.naturalHeight],
            cover = node.imageFit === 'cover',
            contain = node.imageFit === 'contain',
            scale = (cover ? Math.max : Math.min)(node.width / natural[0], node.height / natural[1])
          ctx.beginPath()
          ctx.rect(0, 0, node.width, node.height)
          ctx.clip()
          if (cover || contain) {
            const w = natural[0] * scale,
              h = natural[1] * scale
            ctx.drawImage(image, (node.width - w) / 2, (node.height - h) / 2, w, h)
          } else ctx.drawImage(image, 0, 0, node.width, node.height)
        } else if (node.kind === 'reference-background' && node.referenceBackground) {
          ctx.drawImage(
            makeReferenceBackgroundCanvas(
              node.referenceBackground,
              node.sourceOffsetY ?? 0,
              node.width,
              node.height,
              resolution,
            ),
            0,
            0,
            node.width,
            node.height,
          )
        } else if (node.kind === 'background' && node.background)
          drawBackgroundLayers(
            ctx,
            node.background,
            node.width,
            node.height,
            node.radius ?? 0,
            error => captureFailure(node, 'background-raster-failed', error),
          )
        else if (node.kind === 'text') {
          ctx.font = `${node.fontWeight ?? '400'} ${node.fontSize ?? 17}px ${node.fontFamily ?? 'system-ui'}`
          ctx.textBaseline = 'middle'
          ctx.letterSpacing = `${node.letterSpacing ?? 0}px`
          const lineHeight = node.lineHeight ?? node.height,
            words = (node.text ?? '').split(/\s+/),
            lines: string[] = []
          let line = ''
          for (const word of words) {
            const next = line ? line + ' ' + word : word
            if (
              line &&
              node.height > lineHeight * 1.4 &&
              ctx.measureText(next).width > node.width
            ) {
              lines.push(line)
              line = word
            } else line = next
          }
          lines.push(line)
          lines.forEach((value, i) => ctx.fillText(value, 0, (i + 0.5) * lineHeight))
        }
      } catch (cause) {
        throw captureFailure(node, 'node-raster-failed', cause)
      } finally {
        ctx.restore()
      }
    }
  } finally {
    if (runClips) ctx.restore()
  }
}
const background = (dark: boolean) => (dark ? '#000' : '#f2f2f7')

/** WebKit's accelerated 2D canvas can silently draw nothing for a large photo under memory
 * pressure (measured: a 1320x5700 photo into a 1320x4800 capture left the page fill; 6-10 of
 * 10-12 loaded harness arrivals, 0 of 12 idle). The capture key cannot see that, so the glass
 * over it stayed flat until an unrelated recapture.
 *
 * A photo counts as missing only when the capture shows the fill where the photo's OWN pixel
 * (sampled off-screen from the decoded image) is opaque and clearly different from the fill, at
 * points no later node paints over. A photo that matches the fill there (a white product shot on
 * a white page, a transparent PNG, a logo) cannot be judged and counts as drawn. A missing photo
 * redraws the whole composition in its original order (a frame apart); one still missing after
 * that marks the capture incomplete, and the caller recaptures it. */
export type PhotoProbe = {
  url: ImageKey
  node: number
  px: number
  py: number
  ix: number
  iy: number
}
/** Up to three probe points per photo (device pixels in the capture, source pixels in the image). */
export function photoProbes(
  measured: MeasuredSource,
  natural: (url: ImageKey) => readonly [number, number] | undefined,
  resolution: number,
  canvasWidth: number,
  canvasHeight: number,
): PhotoProbe[] {
  const out: PhotoProbe[] = [],
    nodes = measured.layout.nodes,
    W = canvasWidth / resolution,
    H = canvasHeight / resolution
  nodes.forEach((node, index) => {
    if (node.kind !== 'image' || node.regionId || !node.imageSource) return
    const size = natural(imageUrl(node)!)
    if (!size || !size[0] || !size[1]) return
    const nx = measured.left + node.x,
      ny = measured.top + node.y
    let x0 = nx,
      y0 = ny,
      x1 = nx + node.width,
      y1 = ny + node.height
    for (const clip of node.clips ?? []) {
      x0 = Math.max(x0, measured.left + clip.x)
      y0 = Math.max(y0, measured.top + clip.y)
      x1 = Math.min(x1, measured.left + clip.x + clip.width)
      y1 = Math.min(y1, measured.top + clip.y + clip.height)
    }
    x0 = Math.max(x0, 0)
    y0 = Math.max(y0, 0)
    x1 = Math.min(x1, W)
    y1 = Math.min(y1, H)
    if (x1 - x0 < 4 || y1 - y0 < 4) return
    const cover = node.imageFit === 'cover',
      contain = node.imageFit === 'contain',
      scale = (cover ? Math.max : Math.min)(node.width / size[0], node.height / size[1])
    const later = nodes.slice(index + 1).filter(other => !other.regionId)
    for (const t of [0.3, 0.5, 0.7]) {
      const cx = x0 + (x1 - x0) * t,
        cy = y0 + (y1 - y0) * t
      // A later node painting over this point hides the photo there: no verdict from it.
      if (
        later.some(
          o =>
            cx >= measured.left + o.x &&
            cx <= measured.left + o.x + o.width &&
            cy >= measured.top + o.y &&
            cy <= measured.top + o.y + o.height,
        )
      )
        continue
      const ix =
        cover || contain
          ? (cx - nx - (node.width - size[0] * scale) / 2) / scale
          : ((cx - nx) / node.width) * size[0]
      const iy =
        cover || contain
          ? (cy - ny - (node.height - size[1] * scale) / 2) / scale
          : ((cy - ny) / node.height) * size[1]
      if (ix < 0 || iy < 0 || ix >= size[0] || iy >= size[1]) continue
      out.push({
        url: imageUrl(node)!,
        node: index,
        px: Math.floor(cx * resolution),
        py: Math.floor(cy * resolution),
        ix: Math.floor(ix),
        iy: Math.floor(iy),
      })
    }
  })
  return out
}
const near = (a: ArrayLike<number>, b: ArrayLike<number>, tolerance: number) =>
  Math.abs(a[0] - b[0]) <= tolerance &&
  Math.abs(a[1] - b[1]) <= tolerance &&
  Math.abs(a[2] - b[2]) <= tolerance
/** A photo is missing when every usable probe shows the fill; a probe is usable when the
 * image's own pixel there is opaque and clearly not the fill. No usable probe: drawn. */
export function photoMissing(
  samples: readonly { canvas: ArrayLike<number>; image: ArrayLike<number> }[],
  fill: ArrayLike<number>,
) {
  const usable = samples.filter(({ image }) => image[3] >= 250 && !near(image, fill, 12))
  return usable.length > 0 && usable.every(({ canvas }) => near(canvas, fill, 2))
}
/** Pixel readers (tests replace them). Image pixels come from a cached CPU canvas. */
export const captureReaders = {
  fill(fill: string) {
    let rgb = fills.get(fill)
    if (!rgb) {
      const c = document.createElement('canvas')
      c.width = c.height = 1
      const x = c.getContext('2d', { willReadFrequently: true })!
      x.fillStyle = fill
      x.fillRect(0, 0, 1, 1)
      rgb = [...x.getImageData(0, 0, 1, 1).data]
      fills.set(fill, rgb)
    }
    return rgb
  },
  image(image: HTMLImageElement, ix: number, iy: number): ArrayLike<number> {
    let cache = imagePixels.get(image)
    if (!cache) {
      cache = new Map()
      imagePixels.set(image, cache)
    }
    const key = ix + ',' + iy
    let rgba = cache.get(key)
    if (!rgba) {
      sampler ??= document.createElement('canvas')
      sampler.width = sampler.height = 1
      const x = sampler.getContext('2d', { willReadFrequently: true })!
      x.clearRect(0, 0, 1, 1)
      x.drawImage(image, ix, iy, 1, 1, 0, 0, 1, 1)
      rgba = [...x.getImageData(0, 0, 1, 1).data]
      cache.set(key, rgba)
    }
    return rgba
  },
  canvas(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    px: number,
    py: number,
  ): ArrayLike<number> {
    return ctx.getImageData(px, py, 1, 1).data
  },
  frame: () => new Promise<void>(resolve => requestAnimationFrame(() => resolve())),
}
const fills = new Map<string, number[]>(),
  imagePixels = new WeakMap<HTMLImageElement, Map<string, number[]>>()
let sampler: HTMLCanvasElement
const incomplete = new WeakSet<HTMLCanvasElement>()
/** The last raster into `canvas` is missing a photo (see photoMissing). */
export const captureIncomplete = (canvas: HTMLCanvasElement) => incomplete.has(canvas)

/** Same measured scene-node contract as reference; raster ownership is Canvas2D.
 * Draws into `canvas` (reused across revisions); the whole bitmap is overwritten. */
export async function rasterProductionSource(
  canvas: HTMLCanvasElement,
  measured: MeasuredSource,
  width: number,
  height: number,
  resolution: number,
  dark: boolean,
  fill = background(dark),
) {
  const started = glassNow(),
    icons = await decodeIcons([measured])
  glassTiming('capture-decode', started)
  const drawStarted = glassNow()
  const ctx = context2d(
    canvas,
    texelCount(width, resolution),
    texelCount(productionSourceHeight(measured, height), resolution),
  )
  // The whole composition, in paint order: a retry redraws everything, never one node on top.
  const compose = () => {
    ctx.setTransform(resolution, 0, 0, resolution, 0, 0)
    ctx.fillStyle = fill
    ctx.fillRect(0, 0, canvas.width / resolution, canvas.height / resolution)
    drawSourceNodes(ctx, measured, icons, resolution)
  }
  compose()
  glassTiming('capture-draw', drawStarted)
  incomplete.delete(canvas)
  const verifyStarted = glassNow()
  let canvasReadMs = 0,
    imageReadMs = 0,
    verificationPasses = 0
  const probes = photoProbes(
    measured,
    url => {
      const image = icons.get(url)
      return image ? [image.naturalWidth, image.naturalHeight] : undefined
    },
    resolution,
    canvas.width,
    canvas.height,
  )
  if (probes.length) {
    const fillPixel = captureReaders.fill(fill)
    const missing = () => {
      verificationPasses++
      // Judged per painted instance: two cards showing the same photo are verified separately
      // (one drawn card must not vouch for a dropped one). Decoded pixels stay shared per image.
      const byNode = new Map<number, { canvas: ArrayLike<number>; image: ArrayLike<number> }[]>()
      for (const probe of probes) {
        const canvasAt = glassNow(),
          canvasPixel = captureReaders.canvas(ctx, probe.px, probe.py)
        canvasReadMs += glassNow() - canvasAt
        const imageAt = glassNow(),
          imagePixel = captureReaders.image(icons.get(probe.url)!, probe.ix, probe.iy)
        imageReadMs += glassNow() - imageAt
        const list = byNode.get(probe.node) ?? []
        list.push({ canvas: canvasPixel, image: imagePixel })
        byNode.set(probe.node, list)
      }
      return [...byNode]
        .filter(([, samples]) => photoMissing(samples, fillPixel))
        .map(([index]) => measured.layout.nodes[index])
    }
    for (let attempt = 0; ; attempt++) {
      const absent = missing()
      if (!absent.length) break
      if (attempt === 3) {
        for (const node of absent)
          captureFailure(
            node,
            'image-raster-missing',
            'Image pixels missing after four compositions',
          )
        incomplete.add(canvas)
        break
      }
      glassTiming('capture-image-redraw', glassNow())
      await captureReaders.frame()
      compose()
    }
  }
  glassTiming('capture-verify', verifyStarted, () =>
    JSON.stringify({
      probes: probes.length,
      verificationPasses,
      canvasReadMs,
      imageReadMs,
      incomplete: incomplete.has(canvas),
    }),
  )
  glassTiming('capture-raster', started, () =>
    JSON.stringify({
      width: canvas.width,
      height: canvas.height,
      bytes: canvas.width * canvas.height * 4,
      measuredNodes: measured.layout.nodes.length,
      imageNodes: measured.layout.nodes.filter(node => node.kind === 'image' && !node.regionId)
        .length,
      excludedRegionNodes: measured.layout.nodes.filter(node => node.regionId).length,
    }),
  )
  return canvas
}
/** Navigation composite: each route's visible viewport, side by side. Draws only
 * the viewport rows of each route (never its full scroll height) directly into its cell. */
export async function rasterNavigationAtlas(
  atlas: GlassCanvas,
  routes: readonly { measured: MeasuredSource; scrollTop: number }[],
  width: number,
  height: number,
  resolution: number,
  dark: boolean,
  viewportTop = 0,
) {
  const icons = await decodeIcons(routes.map(route => route.measured))
  const cell = width * resolution,
    ctx = context2d(atlas, Math.round(cell * routes.length), Math.round(height * resolution))
  ctx.clearRect(0, 0, atlas.width, atlas.height)
  routes.forEach(({ measured, scrollTop }, i) => {
    // Only the route's own column is opaque (its nodes are placed at the column by drawSourceNodes):
    // beside a split column the cell stays transparent, so a route moving across the viewport never
    // paints the page background over the routes it passes.
    const left = Math.max(0, measured.left)
    ctx.fillStyle = background(dark)
    ctx.fillRect(
      i * cell + left * resolution,
      0,
      Math.min(cell - left * resolution, measured.layout.width * resolution),
      height * resolution,
    )
    ctx.save()
    ctx.beginPath()
    ctx.rect(i * cell, 0, cell, height * resolution)
    ctx.clip()
    ctx.setTransform(
      resolution,
      0,
      0,
      resolution,
      i * cell,
      -(scrollTop + viewportTop) * resolution,
    )
    drawSourceNodes(ctx, measured, icons, resolution, {
      top: scrollTop + viewportTop,
      bottom: scrollTop + viewportTop + height,
    })
    ctx.restore()
  })
  return atlas
}
/** One-shot capture into a new canvas. Production reuses canvases through `rasterProductionSource`. */
export async function captureProductionSource(
  host: HTMLElement,
  width: number,
  height: number,
  resolution: number,
  dark: boolean,
  canvas = document.createElement('canvas'),
) {
  return rasterProductionSource(
    canvas,
    await measureProductionSource(host),
    width,
    height,
    resolution,
    dark,
  )
}
export async function captureProductionGlyphs(
  dock: HTMLElement,
  spec: SurfaceRenderSpec,
  resolution: number,
  canvas = document.createElement('canvas'),
) {
  const layers = spec.tabSelection?.glyphLayers ? 2 : 1,
    band = layers === 2 ? tabInkBand(spec, resolution) : undefined,
    w = Math.ceil(spec.sampleWidth * resolution),
    planeHeight = band?.pixels ?? Math.ceil(spec.sampleHeight * resolution),
    h = planeHeight * layers
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }
  const ctx = canvas.getContext('2d', CAPTURE_CONTEXT) as
    CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
  if (!ctx) throw Error(`Glass glyph canvas ${w}x${h} has no 2D context`)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
  ctx.clearRect(0, 0, w, h)
  ctx.scale(resolution, resolution)
  const rect = dock.getBoundingClientRect()
  for (const tab of dock.querySelectorAll<HTMLElement>('[role="tab"]')) {
    const style = getComputedStyle(tab),
      box = tab.getBoundingClientRect()
    const foreground = await captureRegionForeground(
      tab,
      resolution,
      0,
      {
        icon: style.getPropertyValue('--tab-selected-icon').trim() || style.color,
        label: style.getPropertyValue('--tab-selected-label').trim() || style.color,
      },
      { tabLayers: layers === 2 },
    )
    try {
      for (let layer = 0; layer < layers; layer++) {
        const sourceHeight = foreground.height / layers
        ctx.drawImage(
          foreground,
          0,
          layer * sourceHeight,
          foreground.width,
          sourceHeight,
          spec.sampleInsetX + box.left - rect.left,
          spec.sampleInsetY -
            (band?.top ?? 0) +
            box.top -
            rect.top +
            (layer * planeHeight) / resolution,
          box.width,
          box.height,
        )
      }
    } finally {
      releaseCaptureCanvas(foreground)
    }
  }
  return canvas
}
