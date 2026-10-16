import type { AccessoryTrack } from './accessoryTrack.ts'
import { CAPTURE_CONTEXT } from './captureContext.ts'
import { decodedGlassImage } from './decodedImage.ts'
import { paintedImage } from '../../image/resource.ts'
import { glassNow, glassTiming } from './profile.ts'
/** Capture semantic foreground once per source revision, never per worker frame.
 * Text stays live in the DOM. This transparent atlas replaces it only inside
 * the lifted aperture; macOS/iOS font differences remain a capture limitation.
 */
// An SVG image is a new document: ancestor selectors and inherited CSS from
// the semantic DOM do not survive serialization. Resolve paint before detaching.
const svgPaintProperties = [
  'fill',
  'fill-rule',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-opacity',
  'opacity',
  'visibility',
  'display',
  'paint-order',
  'vector-effect',
  'clip-rule',
  'stop-color',
  'stop-opacity',
] as const
export function cloneForegroundSvg(
  svg: SVGSVGElement,
  selectedColor?: string,
  options: { inheritedHidden?: boolean } = {},
) {
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  const originals = [svg, ...svg.querySelectorAll<SVGElement>('*')]
  const copies = [clone, ...clone.querySelectorAll<SVGElement>('*')]
  originals.forEach((node, index) => {
    const style = getComputedStyle(node),
      copy = copies[index]
    copy.style.color = selectedColor ?? style.color
    for (const property of svgPaintProperties) {
      let value = style.getPropertyValue(property)
      if (selectedColor && (property === 'fill' || property === 'stroke') && value === style.color)
        value = selectedColor
      // Presentation hiding belongs to the host, not the captured symbol document.
      if (options.inheritedHidden && property === 'visibility' && value === 'hidden')
        value = 'visible'
      if (value) copy.style.setProperty(property, value)
    }
  })
  // Root opacity is already applied to the atlas context; group opacity stays
  // inside the SVG so overlapping children are composited only once.
  clone.style.opacity = '1'
  // Canvas placement already includes the live SVG's page offset. WebKit also
  // applies absolute positioning inside the detached image, clipping menu
  // symbols to a sliver when their left/top offsets are applied a second time.
  clone.style.position = 'static'
  return clone
}

/** A text node's visual lines: a wrapped label is drawn line by line where the page laid it out.
 * Characters join a line while their boxes share its vertical band. */
export function textLines(node: Text) {
  const range = document.createRange()
  range.selectNodeContents(node)
  if (range.getClientRects().length <= 1)
    return [{ text: node.textContent ?? '', rect: range.getBoundingClientRect() }]
  const text = node.textContent ?? ''
  const lines: { text: string; rect: DOMRect }[] = []
  let start = 0,
    top = NaN
  const flush = (end: number) => {
    const line = text.slice(start, end)
    if (!line.trim()) return
    const lineRange = document.createRange()
    lineRange.setStart(node, start)
    lineRange.setEnd(node, end)
    lines.push({ text: line.replace(/\s+$/, ''), rect: lineRange.getBoundingClientRect() })
  }
  for (let i = 0; i < text.length; i++) {
    const character = document.createRange()
    character.setStart(node, i)
    character.setEnd(node, i + 1)
    const box = character.getClientRects()[0]
    // Collapsed characters (a wrapped space) belong to the line they end.
    if (!box || !box.width) continue
    if (Number.isNaN(top)) top = box.top
    else if (box.top > top + box.height / 2) {
      flush(i)
      start = i
      top = box.top
    }
  }
  flush(text.length)
  return lines
}
/** An element's opacity where its running animations leave it (a pressed button's label is
 * mid-way through the press highlight's release; its resting ink is what the glass must draw). */
function restingOpacity(node: Element, computed: string) {
  const animations = typeof node.getAnimations === 'function' ? node.getAnimations() : []
  for (const animation of animations.reverse()) {
    const frames = (animation.effect as KeyframeEffect | null)?.getKeyframes?.() ?? []
    const last = frames.at(-1)?.opacity
    if (last !== undefined && last !== null) return Number(last)
  }
  return Number(computed)
}
/** The drawn size of an image's pixels in its box under CSS object-fit (centred, object-position
 * at its default). */
function fittedImageSize(
  fit: string,
  box: { width: number; height: number },
  pixels: { width: number; height: number },
) {
  const contain = Math.min(box.width / pixels.width, box.height / pixels.height)
  const cover = Math.max(box.width / pixels.width, box.height / pixels.height)
  if (fit === 'fill' || !pixels.width || !pixels.height) return [box.width, box.height] as const
  const scale =
    fit === 'contain'
      ? contain
      : fit === 'none'
        ? 1
        : fit === 'scale-down'
          ? Math.min(1, contain)
          : cover
  return [pixels.width * scale, pixels.height * scale] as const
}
/** Snapshot geometry before decoding yields. Toolbar ink and its aperture must describe one
 * pose, even if navigation advances while an SVG/image is decoded. */
export function foregroundGeometry(element: HTMLElement, target = element.getBoundingClientRect()) {
  const origin = element.getBoundingClientRect()
  const sx = origin.width > 0 ? target.width / origin.width : 1
  const sy = origin.height > 0 ? target.height / origin.height : 1
  const map = (rect: DOMRect) =>
    new DOMRect(
      target.x + (rect.x - origin.x) * sx,
      target.y + (rect.y - origin.y) * sy,
      rect.width * sx,
      rect.height * sy,
    )
  const rects = new Map<Element, DOMRect>([[element, DOMRect.fromRect(target)]])
  for (const child of element.querySelectorAll('*'))
    rects.set(child, map(child.getBoundingClientRect()))
  const lines = new Map<Text, ReturnType<typeof textLines>>()
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.textContent?.trim() && !node.parentElement?.closest('svg,canvas'))
      lines.set(
        node as Text,
        textLines(node as Text).map(line => ({ ...line, rect: map(line.rect) })),
      )
  }
  return { bounds: DOMRect.fromRect(target), rects, lines }
}

export async function captureRegionForeground(
  element: HTMLElement,
  resolution: number,
  padding = 20,
  selected?: { icon: string; label: string },
  options: {
    resting?: boolean
    tabLayers?: boolean
    accessory?: AccessoryTrack
    geometry?: ReturnType<typeof foregroundGeometry>
  } = {},
) {
  const started = glassNow()
  await document.fonts.ready
  // A presentation held hidden until its glass is ready (holdPresentationForGlass) hides its
  // content by inheritance only; that ink must still be captured for the glass to draw.
  const inheritedHidden = getComputedStyle(element)?.visibility === 'hidden'
  const hidden = (style: CSSStyleDeclaration) => !inheritedHidden && style.visibility === 'hidden'
  const rectFor = (node: Element) =>
    options.geometry?.rects.get(node) ?? node.getBoundingClientRect()
  const bounds = options.geometry?.bounds ?? element.getBoundingClientRect(),
    canvas = document.createElement('canvas')
  // A fractional navigation transform leaves a sub-LayoutUnit residual in the rect
  // (998 reads as 998.00003); snap before ceil so the atlas size is stable (2076, not 2077).
  const unit = (value: number) => Math.round(value * 64) / 64
  canvas.width = Math.ceil(
    (unit(options.accessory?.envelope ?? bounds.width) + padding * 2) * resolution,
  )
  // Retained ink uses the expanded atlas. Undo only the compositor-owned translation
  // of each direct child, without interrupting its live hit target or animation.
  const accessoryOffsets = new Map<Element, number>()
  if (options.accessory) {
    const children = [...element.children].filter(child => child.tagName !== 'CANVAS')
    children.forEach((child, index) => {
      const slice = options.accessory!.slices[index]
      if (slice)
        accessoryOffsets.set(child, child.getBoundingClientRect().left - bounds.left - slice.x)
    })
  }
  const accessoryOffset = (node: Element) => {
    let child = node
    while (child.parentElement && child.parentElement !== element) child = child.parentElement
    return accessoryOffsets.get(child) ?? 0
  }
  const planeHeight = Math.ceil((unit(bounds.height) + padding * 2) * resolution)
  canvas.height = planeHeight * (options.tabLayers ? 2 : 1)
  const context = canvas.getContext('2d', CAPTURE_CONTEXT)!
  context.scale(resolution, resolution)
  // The root's opacity applies to the final presenter. Descendant opacity belongs
  // in the atlas, including invisible contact-feedback backgrounds.
  const opacityFor = (node: Element) => {
    // Accessibility-only titles stay in the DOM, but CSS clipping is not applied by
    // this canvas painter. Exclude their entire subtree from every ink layer,
    // including the trigger atlas that replaces a toolbar label during menu close.
    if (node.closest('.satin-control-accessible-title')) return 0
    let opacity = 1
    for (
      let current: Element | null = node;
      current && current !== element;
      current = current.parentElement
    ) {
      const style = getComputedStyle(current)
      if (style.display === 'none' || hidden(style)) return 0
      const retainedChild =
        options.accessory &&
        current.parentElement === element &&
        element.dataset.satinAccessoryInk === 'true'
      if (!retainedChild)
        opacity *= options.resting ? restingOpacity(current, style.opacity) : Number(style.opacity)
    }
    return opacity
  }
  // Semantic ownership is recorded before magnification. A screen-space row cannot tell an
  // icon from a label: their independently transformed destination bounds can overlap.
  const labelFor = (node: Element) => !!node.closest('[data-satin-tab-label], small')
  const position = (rect: DOMRect, node: Element) =>
    [
      padding + rect.left - bounds.left - accessoryOffset(node),
      padding +
        rect.top -
        bounds.top +
        (options.tabLayers && labelFor(node) ? planeHeight / resolution : 0),
    ] as const
  for (const child of element.querySelectorAll<HTMLElement>('*')) {
    if (child.closest('svg') || child.tagName === 'CANVAS') continue
    const style = getComputedStyle(child),
      rect = rectFor(child)
    if (
      !rect.width ||
      !rect.height ||
      hidden(style) ||
      style.backgroundColor === 'rgba(0, 0, 0, 0)' ||
      style.backgroundColor === 'transparent'
    )
      continue
    const opacity = opacityFor(child)
    if (opacity === 0) continue
    const [x, y] = position(rect, child)
    context.globalAlpha = opacity
    // A masked element (a menu symbol) paints its colour through its mask image.
    const mask = /url\(["']?([^"')]+)["']?\)/.exec(
      (style.maskImage || style.webkitMaskImage) ?? '',
    )?.[1]
    if (mask) {
      const layer = document.createElement('canvas')
      layer.width = Math.max(1, Math.ceil(rect.width * resolution))
      layer.height = Math.max(1, Math.ceil(rect.height * resolution))
      const ink = layer.getContext('2d', CAPTURE_CONTEXT)!
      ink.fillStyle = style.backgroundColor
      ink.fillRect(0, 0, layer.width, layer.height)
      ink.globalCompositeOperation = 'destination-in'
      ink.drawImage(await decodedGlassImage(mask), 0, 0, layer.width, layer.height)
      context.drawImage(layer, x, y, rect.width, rect.height)
      continue
    }
    context.fillStyle = style.backgroundColor
    context.beginPath()
    context.roundRect(
      x,
      y,
      rect.width,
      rect.height,
      Math.min(rect.width, rect.height, parseFloat(style.borderRadius) || 0),
    )
    context.fill()
  }
  // Artwork is ink too: an image paints its decoded pixels inside its rounded box, above its
  // own background (the grey placeholder fill of a mini player's artwork).
  for (const image of element.querySelectorAll('img')) {
    const style = getComputedStyle(image),
      rect = rectFor(image),
      source = image.currentSrc || image.src
    if (!rect.width || !rect.height || hidden(style) || !source) continue
    const opacity = opacityFor(image)
    if (opacity === 0) continue
    const pixels = await paintedImage(image)
    if (!pixels) continue
    const [width, height] = fittedImageSize(style.objectFit, rect, {
      width: pixels.naturalWidth,
      height: pixels.naturalHeight,
    })
    const [x, y] = position(rect, image)
    context.save()
    context.globalAlpha = opacity
    context.beginPath()
    context.roundRect(
      x,
      y,
      rect.width,
      rect.height,
      Math.min(rect.width, rect.height, parseFloat(style.borderRadius) || 0),
    )
    context.clip()
    context.drawImage(
      pixels,
      x + (rect.width - width) / 2,
      y + (rect.height - height) / 2,
      width,
      height,
    )
    context.restore()
  }
  for (const svg of element.querySelectorAll('svg')) {
    const rect = rectFor(svg),
      style = getComputedStyle(svg)
    if (!rect.width || !rect.height || hidden(style)) continue
    const opacity = opacityFor(svg)
    if (opacity === 0) continue
    context.globalAlpha = opacity
    const clone = cloneForegroundSvg(svg, selected?.icon, { inheritedHidden })
    const image = await decodedGlassImage(
      'data:image/svg+xml;charset=utf-8,' +
        encodeURIComponent(new XMLSerializer().serializeToString(clone)),
    )
    context.drawImage(image, ...position(rect, svg), rect.width, rect.height)
  }
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement,
      text = node.textContent
    if (!parent || !text?.trim() || parent.closest('svg,canvas')) continue
    const style = getComputedStyle(parent)
    if (hidden(style) || style.display === 'none') continue
    const opacity = opacityFor(parent)
    if (opacity === 0) continue
    context.globalAlpha = opacity
    context.font = `${style.fontStyle} ${selected && labelFor(parent) ? '600' : style.fontWeight} ${style.fontSize} ${style.fontFamily}`
    context.letterSpacing = style.letterSpacing
    context.fillStyle = selected ? (labelFor(parent) ? selected.label : selected.icon) : style.color
    context.textBaseline = 'alphabetic'
    // Each glyph run is drawn from its left edge in its own writing direction.
    context.direction = style.direction === 'rtl' ? 'rtl' : 'ltr'
    context.textAlign = 'left'
    for (const line of options.geometry?.lines.get(node as Text) ?? textLines(node as Text)) {
      const [x, y] = position(line.rect, parent)
      const measured = context.measureText(line.text)
      context.fillText(
        line.text,
        x,
        y +
          (line.rect.height + measured.fontBoundingBoxAscent - measured.fontBoundingBoxDescent) / 2,
      )
    }
  }
  glassTiming('foreground-capture', started, () =>
    JSON.stringify({
      region: element.dataset.satinGlassRegionId ?? element.getAttribute('role') ?? element.tagName,
      width: canvas.width,
      height: canvas.height,
    }),
  )
  return canvas
}
