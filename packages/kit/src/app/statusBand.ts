import { installStatusColor } from './statusColor.ts'
import { SCROLL_EDGE_MATERIAL, edgeMaterialOver } from '../navigation/scrollEdgeMaterial.ts'

/** Fitted viewports cannot paint the clock band. Supply WebKit's under-page
 * colour from visible screen backgrounds; no second navigation clock or spring. */
type RGB = readonly [number, number, number]
export type BandPlane = { left: number; right: number; color: RGB }
export function blendBand(width: number, base: RGB, planes: readonly BandPlane[]): RGB {
  if (width <= 0) return base
  const edges = [
    ...new Set([
      0,
      width,
      ...planes.flatMap(p => [
        Math.max(0, Math.min(width, p.left)),
        Math.max(0, Math.min(width, p.right)),
      ]),
    ]),
  ].sort((a, b) => a - b)
  const result: [number, number, number] = [0, 0, 0]
  for (let i = 1; i < edges.length; i++) {
    const left = edges[i - 1]!,
      right = edges[i]!,
      x = (left + right) / 2
    const color = planes.findLast(p => p.left <= x && p.right > x)?.color ?? base
    for (let c = 0; c < 3; c++) result[c]! += (color[c]! * (right - left)) / width
  }
  return result
}

function rgba(value: string): readonly [number, number, number, number] {
  const match = value.match(/^rgba?\(([^)]+)\)$/)
  if (!match) return [0, 0, 0, 0]
  const values = match[1]!
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map(Number)
  return [values[0]!, values[1]!, values[2]!, values[3] ?? 1]
}
function background(element: HTMLElement, root: HTMLElement, base: RGB): RGB {
  const layers: (readonly [number, number, number, number])[] = []
  for (let node: HTMLElement | null = element; node && node !== root; node = node.parentElement)
    layers.push(rgba(getComputedStyle(node).backgroundColor))
  let color = base
  for (const [r, g, b, a] of layers.reverse())
    color = [r * a + color[0] * (1 - a), g * a + color[1] * (1 - a), b * a + color[2] * (1 - a)]
  return color
}
/** Inputs to the resting band or modal dim. Canvas, tab-ink, row-swipe and menu
 * mutations do not change these colours, so they do not trigger a read pass. */
const BAND_INPUTS =
  '[data-satin-screen-container], [data-satin-navigation-motion-layer], [data-satin-navigation-dim], [data-satin-scroll], [data-satin-scroll-edge], [data-satin-navigator-host], [data-satin-tab-active], [data-satin-root], [data-satin-status-band-source], dialog, [data-satin-presentation-dimmer]'
export function installStatusBand(root: HTMLElement) {
  let frame = 0,
    disposed = false,
    moving = false
  const html = document.documentElement
  const statusColor = installStatusColor()
  const previous = html.style.getPropertyValue('--satin-status-band')
  // Resolves the accepted app appearance without reading our own output colour.
  const probe = document.createElement('span')
  probe.hidden = true
  probe.style.backgroundColor = 'var(--satin-background)'
  root.append(probe)
  // Resting fills (ancestor background walks) are cached until an input changes; scroll frames
  // and navigation frames only read geometry, the dim and the scroll edge.
  let fills = new WeakMap<HTMLElement, RGB>(),
    scrolled = new WeakMap<HTMLElement, boolean>()
  let base: RGB | undefined
  // During a transition the band is written straight to its consumers' background-color: the
  // inherited root custom property restyled the whole document on every frame.
  const consumers = () => [
    root,
    ...root.querySelectorAll<HTMLElement>('[data-satin-status-band-source="scene"]'),
    ...root.querySelectorAll<HTMLElement>('[data-satin-scroll-edge-cap]'),
  ]
  // The app's own inline background on a consumer is saved on the first direct write and put
  // back when the motion ends (never wiped).
  const saved = new Map<HTMLElement, { value: string; priority: string }>()
  const writeDirect = (value: string) => {
    for (const element of consumers()) {
      if (!saved.has(element))
        saved.set(element, {
          value: element.style.getPropertyValue('background-color'),
          priority: element.style.getPropertyPriority('background-color'),
        })
      if (
        element.style.getPropertyValue('background-color') !== value ||
        element.style.getPropertyPriority('background-color') !== 'important'
      )
        element.style.setProperty('background-color', value, 'important')
    }
  }
  const clearDirect = () => {
    for (const [element, { value, priority }] of saved) {
      if (value) element.style.setProperty('background-color', value, priority)
      else element.style.removeProperty('background-color')
    }
    saved.clear()
  }
  const invalidate = () => {
    fills = new WeakMap()
    scrolled = new WeakMap()
    base = undefined
  }
  const paint = () => {
    frame = 0
    if (disposed || document.hidden) return
    const fitted =
      html.dataset.satinViewportFit === 'auto' || html.dataset.satinViewportFit === 'contain'
    if (!fitted) {
      statusColor.releasePage()
      clearDirect()
      html.style.removeProperty('--satin-status-band')
      return
    }
    if (!base) {
      const [r, g, b, alpha] = rgba(getComputedStyle(probe).backgroundColor)
      // An unresolved appearance token is not black. Keep the CSS launch/app
      // background until the observed root/appearance update supplies a colour.
      if (alpha !== 1 || ![r, g, b].every(Number.isFinite)) return
      base = [r, g, b]
    }
    const planes: BandPlane[] = []
    let inMotion = false
    for (const screen of root.querySelectorAll<HTMLElement>('[data-satin-screen-container]')) {
      if (
        screen.closest('[hidden], [data-satin-tab-active="false"], dialog') ||
        screen.dataset.satinRenderSuspended === 'true'
      )
        continue
      const motion = screen.querySelector<HTMLElement>(
        ':scope > [data-satin-navigation-motion-layer]',
      )
      if (!motion) continue
      const transition = screen.dataset.satinTransition ?? 'settled'
      if (transition === 'settled') {
        const style = getComputedStyle(screen)
        if (style.display === 'none' || style.visibility === 'hidden') continue
      }
      const rect = motion.getBoundingClientRect()
      if (rect.width <= 0 || rect.bottom <= 0 || rect.top > 1) continue
      inMotion ||= transition !== 'settled'
      let color = fills.get(motion)
      if (!color) {
        // Only a screen's own top-reaching primary scroller supplies its fill.
        const scroll = [
          ...motion.querySelectorAll<HTMLElement>('[data-satin-scroll][data-satin-primary="true"]'),
        ].find(
          node =>
            node.closest('[data-satin-screen-container]') === screen &&
            node.getBoundingClientRect().top <= 1,
        )
        color = background(scroll ?? motion, root, base)
        fills.set(motion, color)
        scrolled.set(motion, Boolean(scroll))
      }
      // The edge material over the resting background, at the edge's current strength. This is
      // an average resting-background approximation; it cannot sample blurred row pixels.
      const host = screen.closest('[data-satin-navigator-host]')
      const edgeHost = [
        ...(host?.querySelectorAll<HTMLElement>('[data-satin-navigation-edge-host]') ?? []),
      ].find(
        node =>
          node.closest('[data-satin-navigator-host]') === host &&
          node.dataset.satinPane === screen.dataset.satinPane,
      )
      const edge = scrolled.get(motion)
        ? edgeHost?.querySelector<HTMLElement>('[data-satin-scroll-edge]')
        : undefined
      if (edge?.dataset.satinScrollEdgeVisible === 'true') {
        const dark = html.dataset.satinAppearance === 'dark'
        const [er, eg, eb] = edgeMaterialOver(color, SCROLL_EDGE_MATERIAL[dark ? 'dark' : 'light'])
        const amount = Number(getComputedStyle(edge).opacity)
        color = [
          er * amount + color[0] * (1 - amount),
          eg * amount + color[1] * (1 - amount),
          eb * amount + color[2] * (1 - amount),
        ]
      }
      const dim = motion.querySelector<HTMLElement>(':scope > [data-satin-navigation-dim]')
      const opacity = dim ? Number(getComputedStyle(dim).opacity) : 0
      color = [color[0] * (1 - opacity), color[1] * (1 - opacity), color[2] * (1 - opacity)]
      planes.push({ left: rect.left, right: rect.right, color })
    }
    const color = blendBand(window.innerWidth, base, planes)
    const value = `rgb(${color.map(v => Math.round(v)).join(' ')})`
    // The scene stays undimmed: the modal paints its own dim once. Only the
    // system-strip request includes that composited overlay.
    let stripColor = color
    for (const dialog of root.querySelectorAll<HTMLElement>('dialog[open]')) {
      inMotion ||= dialog.hasAttribute('data-satin-presentation-moving')
      const dimmer = dialog.querySelector<HTMLElement>('[data-satin-presentation-dimmer]')
      if (!dimmer) continue
      const style = getComputedStyle(dimmer)
      if (style.display === 'none' || style.visibility === 'hidden') continue
      const [red, green, blue, alpha] = rgba(style.backgroundColor)
      const amount = Math.max(0, Math.min(1, alpha * Number(style.opacity)))
      stripColor = [
        red * amount + stripColor[0] * (1 - amount),
        green * amount + stripColor[1] * (1 - amount),
        blue * amount + stripColor[2] * (1 - amount),
      ]
    }
    statusColor.setPage(`rgb(${stripColor.map(channel => Math.round(channel)).join(' ')})`)
    if (inMotion) writeDirect(value)
    else {
      // At rest the published custom property is the band (identical resting colours).
      if (html.style.getPropertyValue('--satin-status-band') !== value)
        html.style.setProperty('--satin-status-band', value)
      clearDirect()
    }
    if (inMotion) frame = requestAnimationFrame(paint)
    // Motion ended: refresh every resting fill once (inputs changed during the transition were
    // not re-read per frame).
    else if (moving) {
      invalidate()
      frame = requestAnimationFrame(paint)
    }
    moving = inMotion
  }
  const schedule = () => {
    if (!frame && !disposed) frame = requestAnimationFrame(paint)
  }
  const changed = () => {
    invalidate()
    schedule()
  }
  // While a transition runs its own writes (screen, motion and dim styles) change nothing but the
  // geometry read every frame; fills are refreshed when it settles.
  const observer = new MutationObserver(records => {
    if (moving) return
    if (
      records.some(
        record =>
          record.type === 'childList' ||
          record.target === root ||
          (record.target instanceof Element &&
            (record.target.matches(BAND_INPUTS) ||
              // An ancestor of a screen or of its primary scroller: its class or style can change the
              // backgrounds a cached fill composited.
              record.target.querySelector(
                ':scope [data-satin-screen-container], :scope [data-satin-scroll][data-satin-primary="true"]',
              ))),
      )
    )
      changed()
  })
  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [
      'style',
      'class',
      'hidden',
      'open',
      'data-satin-presentation-moving',
      'data-satin-transition',
      'data-satin-render-suspended',
      'data-satin-covered',
      'data-satin-tab-active',
      // Primary election happens after a surface mounts. Its fill and List
      // variant can change without a child/style mutation on the screen.
      'data-satin-primary',
      'data-satin-list',
      'data-satin-scroll-content-background',
      'data-satin-scroll-edge-visible',
    ],
  })
  // The head has already published the appearance and background before this
  // subscriber runs. Recompute now, rather than leaving the previous strip colour
  // until the mutation observer's next animation frame.
  const unsubscribeAppearance = window.__SATIN_APPEARANCE__?.subscribe(() => {
    invalidate()
    cancelAnimationFrame(frame)
    frame = 0
    paint()
  })
  const appearance = new MutationObserver(changed)
  appearance.observe(html, {
    attributes: true,
    attributeFilter: ['data-satin-appearance', 'data-satin-viewport-fit', 'class'],
  })
  // Document ancestors of the root (body and anything between): class changes restyle the fills.
  for (let node = root.parentElement; node && node !== html; node = node.parentElement)
    appearance.observe(node, { attributes: true, attributeFilter: ['class'] })
  window.addEventListener('resize', changed)
  window.addEventListener('pageshow', changed)
  document.addEventListener('visibilitychange', changed)
  // Scrolling moves a scroller under the edge: geometry and edge strength only, fills stay cached.
  root.addEventListener('scroll', schedule, true)
  paint()
  return () => {
    disposed = true
    statusColor.releasePage()
    cancelAnimationFrame(frame)
    observer.disconnect()
    appearance.disconnect()
    unsubscribeAppearance?.()
    window.removeEventListener('pageshow', changed)
    window.removeEventListener('resize', changed)
    document.removeEventListener('visibilitychange', changed)
    root.removeEventListener('scroll', schedule, true)
    probe.remove()
    clearDirect()
    if (previous) html.style.setProperty('--satin-status-band', previous)
    else html.style.removeProperty('--satin-status-band')
  }
}
