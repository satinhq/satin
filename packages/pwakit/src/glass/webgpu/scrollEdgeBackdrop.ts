import type { NavigationGlassRoute } from '../../navigation/glassTransition.ts'
import { atRest, presentationTravel } from '../presentationFrame.ts'
import { zoomGlassMotion, zoomRestRect } from '../../navigation/zoomGlass.ts'
/** The navigation bar's scroll-edge material as the glass renderer sees it.
 * Natively, bar buttons sit above the scroll-edge effect and refract the already
 * blurred, tinted backdrop. Satin paints that effect with CSS for DOM content, which
 * a canvas cannot sample, so the renderer composes the same treatment into the
 * backdrop under every glass surface it overlaps. Values mirror styles.css
 * ([data-satin-scroll-edge]); scrollEdgeBackdrop.test.ts keeps them in step. */
export type ScrollEdge = {
  zoomClip?: { rect: readonly [number, number, number, number]; radius: number }
  zoomOcclusions?: readonly { rect: readonly [number, number, number, number]; radius: number }[]
  /** Viewport rectangle of the edge element [x,y,w,h]. */
  rect: readonly [number, number, number, number]
  /** Page-local horizontal geometry, posed in the worker by the same navigation track as content. */
  navigation?: {
    route: number
    clip: readonly [number, number]
    covers: readonly number[]
    origins: readonly number[]
  }
  /** Viewport y where the mask starts fading (fully applied above it). */
  solid: number
  /** Optional measured vertical mask stops, in viewport points and normalized alpha. */
  mask?: readonly (readonly [number, number])[]
  /** Gaussian standard deviation, points (CSS blur()). */
  sigma: number
  /** Straight tint colour and alpha painted over the blurred backdrop. */
  tint: readonly [number, number, number, number]
  /** Element opacity: 0 at rest, ramping to 1 as content scrolls under the bar. */
  strength: number
  /** The search header's edge (readSearchEdges), which the search field does not diffuse through. */
  search?: true
  /** Opaque top fill, separately composited above the scroll-driven material. */
  cap?: {
    color: readonly [number, number, number, number]
    solid: number
    end: number
  }
}
/* The bar's material (styles.css [data-satin-scroll-edge]): one uniform blur and tint ending in
 * a hard edge at the bottom of the bar row, whose last 2 pt only anti-alias it. iOS 27 native reference
 * edge-* stripes, iPhone and iPad: light over black luma 140, dark over white 104, 8 pt stripes
 * keep 0.11 contrast (the implementation contract). */
export const SCROLL_EDGE_MATERIAL = {
  light: { sigma: 4.5, tint: [1, 1, 1, 0.55] as const },
  dark: { sigma: 4.5, tint: [0, 0, 0, 0.59] as const },
} as const
export const SCROLL_EDGE_FADE_PT = 2
/** The cap (styles.css [data-satin-scroll-edge-cap]) keeps the band colour through the status band,
 * then fades out over the resting seam's 28 pt. The renderer approximates that eased fade linearly. */
export const SCROLL_EDGE_CAP_FADE_PT = 28
/** Native searchable header fit, iOS 27.0 24A434, dark-glass/native-visible-edge-fit*.json.
 * These are search-specific; the bar material above does not apply to them. */
export const SEARCH_HEADER_MATERIAL = {
  light: { sigma: 1.75, tint: [1, 1, 1, 0.55] as const },
  dark: { sigma: 1.5, tint: [0, 0, 0, 0.64] as const },
} as const
/** Native field RGB against the material bar face matrix, three avatar colors through the rendered operator.
 * Attenuate the input before the bar operator so its neutral floor remains intact
 * and saturated channels are not clipped before attenuation. Empirical fit RMS 2.58 / 255; see the implementation contract */
export const SEARCH_FIELD_DARK_TRANSMISSION = 0.8456002308235339

/** A pinned plain-list header's hard-edged material (styles.css,
 * [data-satin-section-header-pinned]). Light's brightness(1.2) has no tint equivalent; 56% white
 * reproduces its result on mid-tone content. */
export const PINNED_HEADER_MATERIAL = {
  light: { sigma: 6, tint: [1, 1, 1, 0.56] as const },
  dark: { sigma: 6, tint: [0, 0, 0, 0.55] as const },
} as const

/** Visible scroll-edge layers in `root`, in viewport coordinates. */
export function readScrollEdges(
  root: ParentNode,
  dark: boolean,
  routes: readonly NavigationGlassRoute[] = [],
): ScrollEdge[] {
  const material = SCROLL_EDGE_MATERIAL[dark ? 'dark' : 'light']
  const edges: ScrollEdge[] = []
  const origins = routes.map(route => {
    if (zoomGlassMotion(route.motion) || zoomGlassMotion(route.screen)) return 0
    const parentX = route.screen.parentElement?.getBoundingClientRect().x ?? 0
    return (
      route.motion.getBoundingClientRect().x -
      parentX -
      route.screen.offsetLeft -
      route.motion.offsetLeft
    )
  })
  for (const edge of root.querySelectorAll<HTMLElement>('[data-satin-scroll-edge]')) {
    if (
      edge.getAttribute('data-satin-scroll-edge-visible') !== 'true' ||
      !edge.getClientRects().length
    )
      continue
    const host = edge.parentElement
    if (!host) continue
    // A sheet's bars are read in the sheet's resting frame, like its glass (presentationFrame.ts).
    const travel = presentationTravel(edge)
    const box = zoomRestRect(edge) ?? atRest(edge.getBoundingClientRect(), travel)
    const strength = edge.style.opacity === '' ? 1 : Number(edge.style.opacity)
    if (!(strength > 0) || box.width <= 0 || box.height <= 0) continue
    const cap = host.querySelector<HTMLElement>('[data-satin-scroll-edge-cap]')
    const capBox = cap && (zoomRestRect(cap) ?? atRest(cap.getBoundingClientRect(), travel))
    const capColor =
      capBox && capBox.height > 0 && cap
        ? getComputedStyle(cap).backgroundColor.match(/^rgba?\(([^)]+)\)$/)
        : undefined
    const channels = capColor?.[1]
      ?.split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number)
    const topFill =
      capBox && capBox.height > 0 && channels && channels.length >= 3
        ? {
            color: [
              channels[0]! / 255,
              channels[1]! / 255,
              channels[2]! / 255,
              channels[3] ?? 1,
            ] as const,
            solid: capBox.y + capBox.height - SCROLL_EDGE_CAP_FADE_PT,
            end: capBox.y + capBox.height,
          }
        : undefined
    const screen = host.hasAttribute('data-satin-transition-edge')
      ? host.closest<HTMLElement>('[data-satin-screen-container]')
      : null
    const routeIndex = routes.findIndex(route => route.screen === screen)
    const route = routes[routeIndex]
    const parent = screen?.parentElement
    const layoutX = parent && screen ? parent.getBoundingClientRect().x + screen.offsetLeft : box.x
    const translation = origins[routeIndex] ?? 0
    const navigation =
      route && screen
        ? {
            route: routeIndex,
            origins,
            clip: [layoutX, layoutX + screen.offsetWidth] as const,
            covers: routes.flatMap((candidate, index) =>
              index > routeIndex && candidate.screen.dataset.satinPane === screen.dataset.satinPane
                ? [index]
                : [],
            ),
          }
        : undefined
    const searchable = edge.hasAttribute('data-satin-scroll-edge-search')
    // CSS includes any fitted title reservation in the edge rectangle, so its resolved bottom is
    // the bar row's bottom.
    const treatment = searchable ? SEARCH_HEADER_MATERIAL[dark ? 'dark' : 'light'] : material
    edges.push({
      rect: [box.x - translation, box.y, box.width, box.height],
      ...(navigation ? { navigation } : {}),
      solid: box.y + box.height - (searchable ? 0 : SCROLL_EDGE_FADE_PT),
      sigma: treatment.sigma,
      tint: treatment.tint,
      strength: Math.min(1, strength),
      ...(topFill ? { cap: topFill } : {}),
    })
  }
  // The search drawer's edge (styles.css [data-satin-search-edge]::before) is CSS as well. Native's
  // field refracts the blurred content under it; without this the field's glass sampled the raw
  // content and showed it sharp inside the field (reference dark resting edge). At rest only: during
  // push/pop the transition owns the bar and its edges.
  if (!routes.length) edges.push(...readSearchEdges(root, dark))
  // While a plain-list header is pinned, its material stands in for the bar's edge.
  const pinned = PINNED_HEADER_MATERIAL[dark ? 'dark' : 'light']
  for (const header of root.querySelectorAll<HTMLElement>(
    "[data-satin-section-header-pinned='true']",
  )) {
    const box = header.getBoundingClientRect()
    const reach = Number.parseFloat(header.style.getPropertyValue('--satin-pinned-header-reach'))
    const top = box.top - (Number.isFinite(reach) ? reach : 0)
    if (box.width <= 0 || box.bottom <= top) continue
    edges.push({
      rect: [box.x, top, box.width, box.bottom - top],
      solid: box.bottom,
      sigma: pinned.sigma,
      tint: pinned.tint,
      strength: 1,
    })
  }
  return edges
}

/** The field's input diffusion follows the searchable header. Its dark transmission is
 * a separate native material response; it is not the DOM edge's position-dependent tint.
 * Presented search retains its earlier fit until it has a matched native capture. */
function readSearchEdges(root: ParentNode, dark: boolean): ScrollEdge[] {
  const edges: ScrollEdge[] = []
  for (const marker of root.querySelectorAll<HTMLElement>('[data-satin-search-edge]')) {
    if (!marker.getClientRects().length) continue
    const before = getComputedStyle(marker, '::before')
    const strength = Number(before.opacity)
    const top = Number.parseFloat(before.top),
      height = Number.parseFloat(before.height)
    const filter = before.backdropFilter || before.getPropertyValue('-webkit-backdrop-filter')
    const sigma = Number.parseFloat(/blur\(([\d.]+)px\)/.exec(filter)?.[1] ?? '')
    const channels = before.backgroundColor
      .match(/^rgba?\(([^)]+)\)$/)?.[1]
      ?.split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number)
    if (!(strength > 0) || !(height > 0) || !Number.isFinite(sigma) || !channels) continue
    if (channels.length < 3 || !channels.every(Number.isFinite)) continue
    const box = atRest(marker.getBoundingClientRect(), presentationTravel(marker))
    const y = box.y + top
    const presented = marker.parentElement?.hasAttribute('data-satin-search-presented')
    const pinnedHeader = marker.hasAttribute('data-satin-search-edge-covered') && !presented
    const end = pinnedHeader ? (dark ? 53 : 51) : presented ? Math.min(height, 103) : height
    edges.push({
      search: true,
      rect: [box.x, y, box.width, end],
      solid: pinnedHeader ? y + 48 : presented ? y + 13 : y + height - 22,
      sigma,
      tint: [
        channels[0]! / 255,
        channels[1]! / 255,
        channels[2]! / 255,
        pinnedHeader && dark ? 1 - SEARCH_FIELD_DARK_TRANSMISSION : 0,
      ],
      strength: Math.min(1, strength),
    })
  }
  return edges
}
