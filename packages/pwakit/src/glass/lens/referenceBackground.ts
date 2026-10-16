import {
  drawGlassBitmapBackdrop,
  isBitmapBackdrop,
  type BitmapBackdropMode,
} from './bitmapBackdrop.ts'
import description from './backgrounds.json'

export const TINT_BACKGROUND_MODES = [
  'tint-black',
  'tint-dark-grey',
  'tint-saturated-blue',
  'tint-light-grey',
  'tint-white',
  'tint-neutral-52',
  'tint-neutral-56',
  'tint-neutral-232',
  'tint-neutral-88',
  'tint-neutral-184',
  'tint-neutral-236',
  'tint-neutral-250',
  'tint-neutral-84',
  'tint-neutral-100',
  'tint-neutral-116',
  'tint-neutral-132',
  'tint-neutral-148',
  'tint-neutral-164',
  'tint-neutral-180',
  'tint-neutral-196',
  'tint-neutral-212',
  'tint-neutral-220',
  'tint-neutral-244',
  'tint-neutral-76',
  'tint-neutral-92',
  'tint-neutral-108',
  'tint-neutral-124',
  'tint-neutral-140',
  'tint-neutral-156',
  'tint-neutral-172',
  'tint-neutral-188',
  'tint-neutral-204',
  'tint-neutral-234',
  'tint-neutral-238',
  'tint-neutral-242',
  'tint-neutral-246',
  'tint-neutral-254',
] as const

export type TintBackgroundMode = (typeof TINT_BACKGROUND_MODES)[number]
export const STRIPE_BACKGROUND_MODES = ['stripes0', 'stripes45', 'stripes90'] as const
export type ReferenceBackgroundMode =
  | BitmapBackdropMode
  | (typeof STRIPE_BACKGROUND_MODES)[number]
  | 'shapes'
  | TintBackgroundMode
  | 'wallpaper'
export const REFERENCE_CONTENT_HEIGHT_PX = description.contentHeightPt

export function isTintBackgroundMode(mode: ReferenceBackgroundMode): mode is TintBackgroundMode {
  return TINT_BACKGROUND_MODES.some(candidate => candidate === mode)
}

type Point = readonly [number, number]
type GradientDescription = Readonly<{
  end: Point
  start: Point
  stops: readonly Readonly<{ at: number; color: string }>[]
}>
type ElementDescription = Readonly<{
  angle?: number
  color: string
  cx?: number
  cy?: number
  height?: number
  points?: readonly Point[]
  radius?: number
  type: 'disc' | 'polygon' | 'rotatedRect'
  width?: number
}>

function gradientFill(context: CanvasRenderingContext2D, value: GradientDescription) {
  const gradient = context.createLinearGradient(...value.start, ...value.end)
  for (const stop of value.stops) gradient.addColorStop(stop.at, stop.color)
  context.fillStyle = gradient
  context.fillRect(0, 0, description.widthPt, description.contentHeightPt)
}

function drawElement(context: CanvasRenderingContext2D, element: ElementDescription) {
  context.fillStyle = element.color
  if (element.type === 'disc') {
    context.beginPath()
    context.arc(element.cx!, element.cy!, element.radius!, 0, Math.PI * 2)
    context.fill()
    return
  }
  if (element.type === 'polygon') {
    context.beginPath()
    element.points!.forEach(([x, y], index) =>
      index === 0 ? context.moveTo(x, y) : context.lineTo(x, y),
    )
    context.closePath()
    context.fill()
    return
  }
  context.save()
  context.translate(element.cx!, element.cy!)
  context.rotate(((element.angle ?? 0) * Math.PI) / 180)
  context.fillRect(-element.width! / 2, -element.height! / 2, element.width!, element.height!)
  context.restore()
}

export function drawReferenceBackground(
  context: CanvasRenderingContext2D,
  mode: ReferenceBackgroundMode,
  width: number,
  height: number,
  sourceOffsetY: number,
) {
  context.save()
  context.beginPath()
  context.rect(0, 0, width, height)
  context.clip()
  context.translate(0, -sourceOffsetY)
  if (isBitmapBackdrop(mode)) {
    drawGlassBitmapBackdrop(context, mode)
    context.restore()
    return
  }
  if (isTintBackgroundMode(mode)) {
    const index = TINT_BACKGROUND_MODES.indexOf(mode)
    if (index < 0) throw new Error(`Unknown tint backdrop: ${mode}`)
    const neutral = mode.startsWith('tint-neutral-')
      ? Number(mode.slice('tint-neutral-'.length))
      : undefined
    context.fillStyle =
      neutral === undefined
        ? description.tintBackdrops[index].color
        : `rgb(${neutral},${neutral},${neutral})`
    // Flat controls fill the requested source, including scrolled Pro Max crops.
    context.fillRect(0, sourceOffsetY, width, height)
    context.restore()
    return
  }
  if (mode === 'stripes0' || mode === 'stripes45' || mode === 'stripes90') {
    const angle = (Number(mode.slice(7)) * Math.PI) / 180
    const tx = Math.cos(angle),
      ty = Math.sin(angle),
      nx = -ty,
      ny = tx
    const extent = description.contentHeightPt * 2
    for (let i = -100; i <= 100; i++) {
      const low = i * description.stripes.widthPt,
        high = low + description.stripes.widthPt
      context.fillStyle =
        description.stripes.colors[
          ((i % description.stripes.colors.length) + description.stripes.colors.length) %
            description.stripes.colors.length
        ]
      context.beginPath()
      context.moveTo(nx * low - tx * extent, ny * low - ty * extent)
      context.lineTo(nx * high - tx * extent, ny * high - ty * extent)
      context.lineTo(nx * high + tx * extent, ny * high + ty * extent)
      context.lineTo(nx * low + tx * extent, ny * low + ty * extent)
      context.closePath()
      context.fill()
    }
    context.restore()
    return
  }
  const scene = description[mode as 'shapes' | 'wallpaper']
  gradientFill(context, scene.gradient as unknown as GradientDescription)
  if (mode === 'shapes') {
    for (const element of description.shapes.elements)
      drawElement(context, element as ElementDescription)
  } else {
    for (const blob of description.wallpaper.blobs) {
      const gradient = context.createRadialGradient(
        blob.cx,
        blob.cy,
        0,
        blob.cx,
        blob.cy,
        blob.radius,
      )
      gradient.addColorStop(0, blob.inner)
      gradient.addColorStop(1, blob.outer)
      context.fillStyle = gradient
      context.fillRect(
        blob.cx - blob.radius,
        blob.cy - blob.radius,
        blob.radius * 2,
        blob.radius * 2,
      )
    }
    for (const highlight of description.wallpaper.highlights)
      drawElement(context, highlight as ElementDescription)
  }
  context.restore()
}

export function makeReferenceBackgroundCanvas(
  mode: ReferenceBackgroundMode,
  sourceOffsetY: number,
  width: number,
  height: number,
  dpr: number,
) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  const context = canvas.getContext('2d')
  if (!context)
    throw new Error('measured-reference could not create its registered background canvas.')
  context.scale(dpr, dpr)
  drawReferenceBackground(context, mode, width, height, sourceOffsetY)
  return canvas
}
