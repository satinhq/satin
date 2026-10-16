import { tabBottomChrome } from '../../tabs/compactBar.ts'
import type { AccessoryTrack, AccessoryViewportTrack } from './accessoryTrack.ts'
import { animateLayout, timelineStart } from '../../motion/animate.ts'
import { frameUnion, type GlassRegion } from '../regions.ts'
import {
  ACCESSORY_PROFILES,
  accessoryRunDuration,
  RESTING_ACCESSORY_VELOCITY,
  sampleAccessory,
  type AccessoryBox,
  type AccessoryDirection,
  type AccessoryRun,
} from '../lens/tabAccessoryMotion.ts'

type GlassFrame = GlassRegion['frame']

/** One sampled trajectory owns the motion and the fixed glass envelope. */
export type AccessoryGlassMotion = {
  rect: { x: number; y: number; width: number; height: number }
  /** Backdrop coverage for the entire translated sampling envelope. */
  sampleRect: { x: number; y: number; width: number; height: number }
  widths: number[]
  duration: number
  viewportTrack: AccessoryViewportTrack
  track?: AccessoryTrack
  takeInk?: () => void
}
const readyInk = new WeakMap<Element, number>()
/**
 * Whether the renderer draws the accessory's ink and capsule while it moves (a retained track).
 * The morph needs it: only then can the canvas hold still and the glass refract what is
 * really behind it every frame (see `holds` in `move`). `data-satin-experimental-accessory-worker`
 * still enables it alone.
 */
export function accessoryWorkerEnabled(element: Element) {
  const root = document.documentElement
  return (
    (root.hasAttribute('data-satin-experimental-accessory-worker') ||
      root.hasAttribute('data-satin-experimental-accessory-morph')) &&
    !!element.closest('[data-satin-tab-bottom-accessory]')
  )
}
export function accessoryInkReady(element: Element, width: number) {
  readyInk.set(element, width)
}
export function accessoryInkWidth(element: Element) {
  return readyInk.get(element)
}
const glassMotions = new WeakMap<Element, AccessoryGlassMotion>()
export function accessoryGlassMotion(element: Element) {
  return glassMotions.get(element)
}

/**
 * Everywhere a held-still accessory canvas has carried its glass: both rows and the paths
 * between them, relative to the bottom chrome's left and bottom edges (the rows move, those
 * edges do not). The canvas keeps covering it at rest too, so a run never starts or ends by
 * resizing or moving the canvas: that change and the worker's next frame reach the screen
 * separately, and the frame between them showed the glass cut square or without its ink.
 */
type AccessoryReach = { left: number; top: number; width: number; height: number; chrome: number }
const reaches = new WeakMap<Element, AccessoryReach>()
export function accessoryReach(element: Element): GlassFrame | undefined {
  const reach = reaches.get(element)
  const chrome = element.closest('[data-satin-tab-bottom-chrome]')?.getBoundingClientRect()
  if (!reach || !chrome) return undefined
  // A new chrome width (rotation, a resized window) lays the rows out again.
  if (Math.abs(chrome.width - reach.chrome) > 0.5) {
    reaches.delete(element)
    return undefined
  }
  return {
    x: chrome.left + reach.left,
    y: chrome.bottom + reach.top,
    width: reach.width,
    height: reach.height,
  }
}
function extendReach(element: Element, frame: GlassFrame) {
  const chrome = element.closest('[data-satin-tab-bottom-chrome]')?.getBoundingClientRect()
  if (!chrome) return
  const known = accessoryReach(element)
  const union = known ? frameUnion(known, frame) : frame
  // Whole points, so a slightly different spring path does not resize the canvas again.
  const left = Math.floor(union.x - chrome.left),
    top = Math.floor(union.y - chrome.bottom)
  reaches.set(element, {
    left,
    top,
    width: Math.ceil(union.x + union.width - chrome.left) - left,
    height: Math.ceil(union.y + union.height - chrome.bottom) - top,
    chrome: chrome.width,
  })
}

/** Keyframes per second of motion. WAAPI interpolates linearly between them. */
const KEYFRAMES_PER_SECOND = 120

/**
 * Opt-in (`<html data-satin-experimental-accessory-morph>`) until its main-thread cost is resolved:
 * on iPad, during a scroll-driven collapse, the page's animation frames ran at a 44 ms median
 * with the morph against 17 ms without it (expand: 18 vs 17 ms). Without the attribute the
 * transaction only commits the layout, which is the previous behaviour.
 */
export function accessoryMorphEnabled() {
  return document.documentElement.hasAttribute('data-satin-experimental-accessory-morph')
}

/**
 * Moves the TabView bottom accessory between its expanded and inline rows as one element.
 *
 * The minimize transaction commits the accessory's target layout once (CSS keyed on the compact
 * restore control). This owner reads the box the accessory presents just before that commit,
 * then translates it through fixed rounded masks; child anchors come from the two endpoint layouts.
 * Material geometry is frozen once in a fixed envelope; the compositor clips that envelope
 * with the same sampled width trajectory, so glass capture/measurement is not part of each motion frame.
 * The aperture retains its radius and live ink moves without scaling.
 */
export class AccessoryMorph {
  private run?: {
    start: number
    spec: AccessoryRun
    animation: Animation
    children: Animation[]
    /** `immediate`: return the page's ink now rather than after the renderer's next frames. */
    clearGlass: (immediate?: boolean) => void
    /** The bottom chrome's edges and the accessory's height when the run started. */
    chrome: { left: number; right: number; bottom: number }
    height: number
  }

  private readonly dock: Element

  constructor(dock: Element) {
    this.dock = dock
  }

  /** The dock's glass chrome is a separate layer; the accessory lives in the TabView's bottom
   * inset under the same app root (the scope the compact-layout CSS also keys on). */
  private get chrome() {
    return tabBottomChrome(this.dock)
  }
  private get accessory() {
    return this.chrome?.querySelector<HTMLElement>(':scope > [data-satin-tab-bottom-accessory]')
  }

  /** The accessory's presented edges relative to the bottom chrome, or undefined without one. */
  private presentedBox(): AccessoryBox | undefined {
    const chrome = this.chrome?.getBoundingClientRect()
    const accessory = this.accessory?.getBoundingClientRect()
    if (!chrome || !accessory || accessory.width === 0) return undefined
    return {
      left: accessory.left - chrome.left,
      right: chrome.right - accessory.right,
      bottom: chrome.bottom - accessory.bottom,
    }
  }

  /**
   * Run `commit` (the one layout change between rows) and animate the accessory across it.
   * `start` is the transaction's epoch on the performance clock.
   */
  move(direction: AccessoryDirection, start: number, commit: () => void) {
    const accessory = this.accessory
    const clip = accessory?.querySelector<HTMLElement>(':scope > [data-satin-accessory-clip]')
    const content = clip?.querySelector<HTMLElement>(':scope > [data-satin-accessory-content]')
    if (!accessory || !clip || !content || !accessoryMorphEnabled()) {
      commit()
      return
    }
    const now = performance.now()
    const running = this.run ? sampleAccessory(this.run.spec, now - this.run.start) : undefined
    this.end()
    // Read the presented box with the previous run removed, so a reversal starts from the
    // sampled presentation (value and velocity) rather than from an endpoint.
    const from = running?.value ?? this.presentedBox()
    const oldBounds = accessory.getBoundingClientRect()
    const oldInk = new Map(
      [
        ...accessory.querySelectorAll<HTMLElement>('[data-satin-glass-region-id] > :not(canvas)'),
      ].map(element => {
        const rect = element.getBoundingClientRect()
        return [element, { x: rect.x - oldBounds.x, width: rect.width }] as const
      }),
    )
    // Where each glass canvas is on screen before the rows change (see `holdPlace`).
    const canvasPlaces = new Map(
      [
        ...accessory.querySelectorAll<HTMLCanvasElement>('[data-satin-glass-region-id] > canvas'),
      ].map(canvas => [canvas, canvas.getBoundingClientRect()] as const),
    )
    commit()
    const to = this.presentedBox()
    if (!from || !to || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (sameBox(from, to)) return
    const spec: AccessoryRun = {
      from,
      to,
      velocity: running?.velocity ?? RESTING_ACCESSORY_VELOCITY,
      profile: ACCESSORY_PROFILES[direction],
    }
    const duration = accessoryRunDuration(spec)
    const count = Math.max(2, Math.ceil((duration / 1000) * KEYFRAMES_PER_SECOND))
    const chromeWidth = this.chrome!.getBoundingClientRect().width
    const widths: number[] = []
    const offsets: { x: number; y: number }[] = []
    const frames: Keyframe[] = Array.from({ length: count + 1 }, (_, index) => {
      const box = index === count ? to : sampleAccessory(spec, (duration * index) / count).value
      const width = chromeWidth - box.left - box.right
      widths.push(width)
      offsets.push({ x: box.left - to.left, y: to.bottom - box.bottom })
      return {
        offset: index / count,
        transform: `translate3d(${box.left - to.left}px, ${to.bottom - box.bottom}px, 0)`,
      }
    })
    // Retain each full-width material's sampling envelope. Aperture motion does not
    // issue per-frame region measurements or foreground captures.
    const glass = [
      ...accessory.querySelectorAll<HTMLElement>('[data-satin-glass-region-id]'),
    ].filter(element => Math.abs(element.getBoundingClientRect().width - widths.at(-1)!) < 1)
    const minX = Math.min(...offsets.map(offset => offset.x))
    const maxX = Math.max(...offsets.map(offset => offset.x))
    const minY = Math.min(...offsets.map(offset => offset.y))
    const maxY = Math.max(...offsets.map(offset => offset.y))
    for (const element of glass) {
      const rect = element.getBoundingClientRect()
      glassMotions.set(element, {
        rect: { x: rect.x, y: rect.y, width: Math.max(...widths), height: rect.height },
        sampleRect: {
          x: rect.x + minX,
          y: rect.y + minY,
          width: Math.max(...widths) + maxX - minX,
          height: rect.height + maxY - minY,
        },
        widths,
        duration,
        viewportTrack: { epoch: performance.timeOrigin + start, duration, widths, offsets },
      })
    }
    const targetWidth = widths.at(-1)!
    const envelopeWidth = Math.max(...widths)
    // The worker draws this run's glass and ink (a retained track) when the accessory is one
    // material whose ink it holds at both widths. Then nothing above the glass canvas moves
    // (see `holds` below).
    const holds =
      glass.length === 1 &&
      accessoryWorkerEnabled(glass[0]!) &&
      (readyInk.get(glass[0]!) ?? 0) >= Math.max(widths[0]!, targetWidth) - 1 &&
      onlyGlass(content, glass[0]!)
    const ink = glass.flatMap(element =>
      [...element.children].filter(
        (child): child is HTMLElement => child instanceof HTMLElement && child.tagName !== 'CANVAS',
      ),
    )
    const targetInk = ink.map(element => ({
      element,
      rect: element.getBoundingClientRect(),
      transform: getComputedStyle(element).transform,
    }))
    const targetBounds = accessory.getBoundingClientRect()
    const previousWidth = accessory.style.width
    const previousRadius = accessory.style.borderRadius
    accessory.style.width = `${envelopeWidth}px`
    const radius = getComputedStyle(glass[0] ?? accessory).borderRadius || '0px'
    accessory.style.borderRadius = radius
    const slices: AccessoryTrack['slices'][number][] = []
    const children = targetInk.map(({ element, rect, transform }) => {
      const full = element.getBoundingClientRect()
      const denominator = envelopeWidth - targetWidth
      const previous = oldInk.get(element)
      const oldDelta = targetWidth - oldBounds.width
      const anchor =
        Math.abs(denominator) > 0.01
          ? (full.x - rect.x) / denominator
          : previous && Math.abs(oldDelta) > 0.01
            ? (rect.x - targetBounds.x - previous.x) / oldDelta
            : 0
      const clips =
        Math.abs(denominator) > 0.01
          ? Math.max(0, (full.width - rect.width) / denominator)
          : previous && Math.abs(oldDelta) > 0.01
            ? Math.max(0, (rect.width - previous.width) / oldDelta)
            : 0
      slices.push({
        x: full.x - accessory.getBoundingClientRect().x,
        y: full.y - accessory.getBoundingClientRect().y,
        width: full.width,
        height: full.height,
        anchor,
        clip: clips,
      })
      const base = transform === 'none' ? '' : ` ${transform}`
      return element.animate(
        widths.map((width, index) => ({
          offset: index / (widths.length - 1),
          // Held, the accessory itself does not move: its controls carry the travel.
          transform: holds
            ? `translate3d(${offsets[index]!.x + (width - envelopeWidth) * anchor}px, ${offsets[index]!.y}px, 0px)${base}`
            : `translate3d(${(width - envelopeWidth) * anchor}px, 0px, 0px)${base}`,
          ...(clips > 0.5
            ? { clipPath: `inset(0px ${(envelopeWidth - width) * clips}px 0px 0px)` }
            : {}),
        })),
        { duration, easing: 'linear', fill: 'both' },
      )
    })
    for (const element of glass) {
      const motion = glassMotions.get(element)!
      const inkWidth = readyInk.get(element) ?? 0
      if (holds) {
        motion.track = {
          epoch: performance.timeOrigin + start,
          offsets,
          duration,
          widths,
          envelope: inkWidth,
          held: true,
          slices: slices.map(slice => ({
            ...slice,
            x: slice.x - (envelopeWidth - inkWidth) * slice.anchor,
            width: slice.width - (envelopeWidth - inkWidth) * slice.clip,
          })),
        }
        motion.takeInk = () => {
          if (element.dataset.satinAccessoryInk === 'true') return
          // Keep compositor transforms: the invisible semantic controls still own hit testing.
          // Only text clipping transfers to the worker; cancelling the animation would move
          // the live controls back to their expanded positions during the morph.
          for (const animation of children.slice(0, targetInk.length)) {
            const effect = animation.effect
            if (!(effect instanceof KeyframeEffect)) continue
            effect.setKeyframes(
              effect.getKeyframes().map(frame => {
                const transformed = { ...frame }
                delete transformed.clipPath
                return transformed
              }),
            )
          }
          element.dataset.satinAccessoryInk = 'true'
        }
      }
    }
    // The two rounded masks keep their full layout width and their unscaled end caps.
    // Their intersection is the sampled capsule; the carrier cancels the mask's travel
    // so live labels keep their positions and sizes. A held run opens the masks instead.
    for (const [element, sign] of holds
      ? []
      : ([
          [clip, 1],
          [content, -1],
        ] as const)) {
      children.push(
        element.animate(
          widths.map((width, index) => ({
            offset: index / (widths.length - 1),
            transform: `translate3d(${sign * (width - envelopeWidth)}px, 0px, 0px)`,
          })),
          { duration, easing: 'linear', fill: 'both' },
        ),
      )
    }
    // When the worker draws this run's glass and ink, its canvas holds still on screen and the
    // capsule moves inside it, on the same clock as the tab bar's glass. The refracted content
    // then stays fixed to the page whenever the canvas frame and the compositor frame disagree.
    // No element above the canvas moves: the accessory stays at its committed row (only its
    // controls carry the travel) and the rounded masks open, so they cannot cut the capsule.
    // A carrier cancelled by an opposite transform on the canvas was not enough: during a
    // scroll the compositor showed one without the other for several frames, and the canvas
    // stood up to 12 pt from where the renderer drew for it (the stripes swam, and the tab
    // bar's hole showed beside the accessory).
    const held = holds ? glass : []
    for (const element of held) {
      extendReach(element, glassMotions.get(element)!.sampleRect)
      extendReach(element, element.getBoundingClientRect())
      const canvas = element.querySelector<HTMLCanvasElement>(':scope > canvas')
      const place = canvas && canvasPlaces.get(canvas)
      if (canvas && place) holdPlace(canvas, place, element.getBoundingClientRect())
    }
    const previousOverflow = { accessory: accessory.style.overflow, clip: clip.style.overflow }
    if (held.length > 0) {
      accessory.style.overflow = 'visible'
      clip.style.overflow = 'visible'
    }
    for (const animation of children) animation.startTime = timelineStart(start)
    accessory.dataset.satinAccessoryMotion = 'true'
    window.dispatchEvent(new Event('satin-accessory-motion'))
    const clearGlass = (immediate = false) => {
      for (const element of glass) {
        glassMotions.delete(element)
        if (immediate && element.dataset.satinAccessoryInk) {
          delete element.dataset.satinAccessoryInk
          continue
        }
        if (element.dataset.satinAccessoryInk !== 'true') continue
        // The page's ink returns at once; the renderer stops drawing its copy a frame or two
        // later, so the same ink overlaps briefly rather than the capsule showing none.
        element.dataset.satinAccessoryInk = 'returning'
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            if (element.dataset.satinAccessoryInk === 'returning')
              delete element.dataset.satinAccessoryInk
          }),
        )
      }
      accessory.style.width = previousWidth
      accessory.style.borderRadius = previousRadius
      accessory.style.overflow = previousOverflow.accessory
      clip.style.overflow = previousOverflow.clip
      delete accessory.dataset.satinAccessoryMotion
      window.dispatchEvent(new Event('satin-accessory-motion'))
    }
    // The tab bar's motion can start after the commit (the collapse delay): hold the presented
    // box until then rather than showing the committed row early.
    const animation = animateLayout(accessory, holds ? frames.map(stillFrame) : frames, {
      duration,
      easing: 'linear',
      fill: 'both',
    })
    animation.startTime = timelineStart(start)
    const chromeBox = this.chrome!.getBoundingClientRect()
    this.run = {
      start,
      spec,
      animation,
      children,
      clearGlass,
      chrome: { left: chromeBox.left, right: chromeBox.right, bottom: chromeBox.bottom },
      height: targetBounds.height,
    }
    const run = this.run
    // The compositor holds the final pose until layout and all child tracks can be released
    // together. A busy document must not expose the wide temporary layout between the
    // timeline ending and this callback. A carrier cancelled by anything but this owner
    // (`move` and `end` clear `this.run` first) ends the run the same way: a run left behind
    // kept the envelope width, the hidden ink and the glass motion until the next run.
    const release = () => {
      if (this.run === run) this.end()
    }
    void animation.finished.then(release, release)
  }

  /** Ends the live run (if any) at its committed row. */
  private end(immediate = false) {
    const run = this.run
    this.run = undefined
    if (!run) return
    for (const animation of run.children) animation.cancel()
    run.clearGlass(immediate)
    run.animation.cancel()
  }

  /**
   * The page is being hidden: end a live run at its committed row now, so it never crosses a
   * suspension. While hidden, the document's animation frames stop and the renderer drops its
   * own tracks (it settles them at their ends); a run kept across that is drawn by no one
   * consistently on return (the owner's resume recording: an empty capsule at the run's
   * envelope width, without its ink). The ink comes back immediately: no frame runs to return it.
   */
  settle() {
    this.end(true)
  }

  /**
   * Where the moving accessory's capsule is at `at` (performance clock), in viewport points, or
   * undefined when it is not moving. It is the same sampled run the accessory presents, so a
   * surface drawn on the same clock can leave it uncovered (the tab bar's `occluder`).
   */
  capsuleAt(at: number): GlassFrame | undefined {
    const run = this.run
    if (!run) return undefined
    const box = sampleAccessory(run.spec, at - run.start).value
    const bottom = run.chrome.bottom - box.bottom
    return {
      x: run.chrome.left + box.left,
      y: bottom - run.height,
      width: run.chrome.right - box.right - (run.chrome.left + box.left),
      height: run.height,
    }
  }

  /** Whether a run is live (resume readout). */
  get running() {
    return !!this.run
  }

  dispose() {
    this.end()
  }
}

/** Debug readout (resume diagnostics): the accessory's run-owned state as the page holds it. */
export function accessoryMorphReadout(accessory: HTMLElement) {
  const glass = accessory.querySelector<HTMLElement>('[data-satin-glass-region-id]')
  const motion = glass ? glassMotions.get(glass) : undefined
  const reach = glass ? reaches.get(glass) : undefined
  return {
    run: !!motion,
    motion: accessory.dataset.satinAccessoryMotion === 'true',
    ink: glass?.dataset.satinAccessoryInk ?? null,
    width: accessory.style.width || null,
    readyInk: glass ? (readyInk.get(glass) ?? null) : null,
    reach: reach ? `${reach.left},${reach.top} ${reach.width}x${reach.height}` : null,
    animations: accessory.getAnimations?.({ subtree: true }).length ?? 0,
  }
}

/**
 * Keeps a canvas where it was on screen when its holder moves to the other row. The glass
 * bridge writes the same box when it next measures (the canvas covers `accessoryReach`), but
 * not in this frame.
 */
function holdPlace(canvas: HTMLCanvasElement, place: DOMRect, holder: DOMRect) {
  Object.assign(canvas.style, {
    left: `${place.x - holder.x}px`,
    top: `${place.y - holder.y}px`,
    width: `${place.width}px`,
    height: `${place.height}px`,
  })
}

/** A carrier keyframe that keeps the run's timing (and its layout-animation announcement) but
 * leaves the accessory at its committed row. */
function stillFrame(frame: Keyframe): Keyframe {
  return { offset: frame.offset, transform: 'none' }
}

/** Whether the accessory shows nothing but `glass` (its controls move inside it when held). */
function onlyGlass(content: Element, glass: Element) {
  for (const element of content.querySelectorAll('*')) {
    if (element === glass || glass.contains(element) || element.contains(glass)) continue
    const rect = element.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) return false
  }
  return true
}

function sameBox(a: AccessoryBox, b: AccessoryBox) {
  return (
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.right - b.right) < 0.5 &&
    Math.abs(a.bottom - b.bottom) < 0.5
  )
}
