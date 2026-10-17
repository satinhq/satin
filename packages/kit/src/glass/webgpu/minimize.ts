import { registerCompactTabBar, tabBottomChrome } from '../../tabs/compactBar.ts'
import { ownPhysicalContact, PRESS_CONTACT_CLICK_WINDOW_MS } from '../../press/contactReceipt.ts'
import { beginMotionProbe, recordMotionEventCost } from '../../motionProbe.ts'
import { tabMinimizeInkFrame } from '../lens/tabMinimizeInk.ts'
import { TabCompactGesture } from '../lens/tabCompactGesture.ts'
import {
  restoreSample,
  restoreDuration,
  restoreDelay,
  retargetRestore,
  interruptedRestoreSample,
  INTERRUPTED_RESTORE_DURATION,
  type RestorePath,
  type TabMorphFrame,
} from '../lens/tabRestoreMotion.ts'
import {
  measuredMinimizeProgress,
  minimizePlacement,
  TAB_MINIMIZE_DURATION,
} from '../lens/tabMinimizeMotion.ts'
import {
  searchCircleCentre,
  searchMemberProgress,
  searchMemberShape,
  SEARCH_SPLIT_DELAY_MS,
  type SearchMemberGeometry,
} from '../lens/tabSearchMember.ts'
import { glassBlendRadius } from '../fieldGeometry.ts'
import type { CapsuleShape, RuntimeOptions, SurfaceRenderSpec } from '../renderSpecs.ts'
import { AccessoryMorph, accessoryMorphReadout } from './accessoryMorph.ts'
import { timelineOffset, timelineStart } from '../../motion/animate.ts'

/** Canvas-vs-DOM presentation lag budget for tab glyphs (macOS WKWebView 12o minrec showed
 * glyphs up to ~50 pt outside a growing capsule; a 1–2 frame track lead did not remove it). */
const GLYPH_LAG_MS = 50
/** Half the visible glyph (icon or label) width, and the edge fade, in points. */
const GLYPH_HALF_WIDTH = 26
const GLYPH_EDGE_RAMP = 10
/** The bar and its Search member are one glass field. At this spacing they join below a
 * 6 pt gap: native shows one shared seam frame as they part (owner's iPhone recording, Apple
 * Music) and joins the circle into the growing bar from about a 6 pt gap. */
const SEARCH_MEMBER_BLEND_RADIUS = glassBlendRadius(12)

/** A settled transaction's pose is sampled this long after its end (every spring at rest). */
const SETTLED_AFTER_MS = 10_000
/** One sample of the transaction: the bar's channels plus the Search member's own spring. */
type MinimizeFrame = TabMorphFrame & { search: number }
/** The same measured curves as the incumbent composite, transferred once to the worker. */
export class WorkerMinimize {
  private animations: Animation[] = []
  private refreshInkGeometry?: () => void
  private stopProbe?: () => void
  private button = document.createElement('button')
  private sample = (_at: number): MinimizeFrame => ({
    progress: 0,
    heightProgress: 0,
    fade: 0,
    search: 0,
  })
  private run?: { start: number; duration: number; direction: string }
  get active() {
    return !!this.run && performance.now() < this.run.start + this.run.duration
  }
  get inkTransformed() {
    const frame = this.sample(performance.now())
    return this.active || !atRest(frame)
  }
  private gesture: TabCompactGesture
  private retargetTrack?: (track: {
    at: number
    duration: number
    specs: SurfaceRenderSpec[]
  }) => void
  private options: RuntimeOptions
  /** The bottom accessory moves between its rows on this transaction's clock. */
  private accessory: AccessoryMorph
  private unregisterCompactBar?: () => void
  constructor(
    options: RuntimeOptions,
    restore: (path: RestorePath) => void,
    drag: { begin(x: number): void; move(x: number): void; end(cancelled: boolean): void },
    retargetTrack?: (track: { at: number; duration: number; specs: SurfaceRenderSpec[] }) => void,
  ) {
    this.options = options
    this.retargetTrack = retargetTrack
    this.accessory = new AccessoryMorph(options.elements.chrome.dock)
    const chrome = tabBottomChrome(options.elements.chrome.dock)
    if (chrome) this.unregisterCompactBar = registerCompactTabBar(chrome, () => restore('tap'))
    const g = options.geometry,
      b = this.button
    b.className = 'satin-lens-tab-minimize-restore'
    b.setAttribute('aria-label', 'Show tab bar')
    b.hidden = true
    Object.assign(b.style, {
      left: `${g.dockX + (g.tabBarMinimizedOffsetX ?? 7)}px`,
      top: `${g.dockY + 7}px`,
    })
    this.gesture = new TabCompactGesture({
      restore: dragging => restore(dragging ? 'drag' : 'tap'),
      ...drag,
    })
    b.onpointerdown = e => {
      if (!e.isPrimary || e.button !== 0) return
      if (this.run?.direction === 'collapse' && performance.now() < this.run.start + 44) {
        e.preventDefault()
        ownPhysicalContact(document, b, PRESS_CONTACT_CLICK_WINDOW_MS, { pointerId: e.pointerId })
        restore('mid')
        return
      }
      if (this.gesture.down(e.pointerId, e.clientX - this.options.geometry.dockX)) {
        e.preventDefault()
        b.setPointerCapture(e.pointerId)
      }
    }
    b.onpointermove = e => this.gesture.move(e.pointerId, e.clientX - this.options.geometry.dockX)
    b.onpointerup = e => {
      ownPhysicalContact(document, b, PRESS_CONTACT_CLICK_WINDOW_MS, { pointerId: e.pointerId })
      if (this.gesture.up(e.pointerId, e.clientX - this.options.geometry.dockX)) {
        e.preventDefault()
        if (b.hasPointerCapture(e.pointerId)) b.releasePointerCapture(e.pointerId)
        this.showCompactLayout(this.run?.direction !== 'restore')
      }
    }
    b.onpointercancel = b.onlostpointercapture = () => {
      this.gesture.cancel()
      this.showCompactLayout(this.run?.direction !== 'restore')
    }
    b.onclick = e => {
      if (e.detail === 0) restore('tap')
    }
    b.oncontextmenu = e => e.preventDefault()
    options.elements.chrome.dock.after(b)
  }
  start(direction: 'collapse' | 'restore', spec: SurfaceRenderSpec, path: RestorePath = 'tap') {
    this.stopProbe?.()
    this.stopProbe = beginMotionProbe(
      direction === 'collapse' ? 'minimize' : 'restore',
      'webgpu-tab',
    )
    const at = performance.now(),
      from = this.sample(at),
      pending = path === 'mid' && this.run?.direction === 'collapse' && at - this.run.start < 44
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    const delay = reduced ? 0 : direction === 'collapse' ? 44 : pending ? 0 : restoreDelay(path)
    const duration = reduced
      ? 1
      : direction === 'collapse'
        ? TAB_MINIMIZE_DURATION
        : pending
          ? INTERRUPTED_RESTORE_DURATION
          : restoreDuration(path)
    const barSample = (elapsed: number): TabMorphFrame => {
      if (direction === 'restore')
        return pending
          ? interruptedRestoreSample(elapsed, from)
          : retargetRestore(from, restoreSample(path, elapsed))
      const p = measuredMinimizeProgress('collapse', elapsed),
        fade = measuredMinimizeProgress('collapse', elapsed, 2)
      return {
        progress: from.progress + (1 - from.progress) * p,
        heightProgress: from.heightProgress + (1 - from.heightProgress) * p,
        fade: from.fade + (1 - from.fade) * fade,
      }
    }
    // The Search member separates just after the bar starts to move and returns from the
    // bar's own onset, starting from wherever it is presented (an interrupted run).
    const searchTarget = direction === 'collapse' ? 1 : 0
    const searchDelay = delay + (direction === 'collapse' ? SEARCH_SPLIT_DELAY_MS : 0)
    this.sample = now => {
      const elapsed = reduced ? duration : now - at - delay
      const search = reduced
        ? searchTarget
        : searchMemberProgress(from.search, searchTarget, now - at - searchDelay)
      return { ...barSample(elapsed), search }
    }
    this.run = { start: at, duration: duration + delay, direction }
    for (const a of this.animations) a.cancel()
    this.animations = []
    const renderInk = (refresh: boolean) => {
      const g = this.options.geometry,
        dock = this.options.elements.chrome.dock
      const tabs = [...dock.querySelectorAll<HTMLElement>('[role="tab"]')]
      const selection = g.tabBarSelectedIndex ?? 0
      // Native keeps a regular shortcut at left when Search is selected. A fresh Search
      // selection uses the first regular tab; the Search member remains on the trailing side.
      const selected =
        tabs[selection]?.dataset.satinTabRole === 'search'
          ? Math.max(
              0,
              tabs.findIndex(tab => tab.dataset.satinTabRole !== 'search'),
            )
          : selection
      if (!refresh) {
        dock.classList.add('satin-lens-tab-minimize-owned')
        dock.inert = false
        this.showCompactLayout(direction === 'collapse' || this.gesture.active, at + delay)
      }
      const frames = Array.from({ length: 241 }, (_, i) => {
        const time = at + ((duration + delay) * i) / 240
        const f = this.sample(time),
          p = minimizePlacement(f.progress, g.dockWidth, g.dockHeight, g.tabBarMinimizedOffsetX)
        return {
          ...p,
          ...f,
          height: g.dockHeight + (48 - g.dockHeight) * f.heightProgress,
          y: 7 * f.heightProgress,
          offset: i / 240,
          time,
        }
      })
      let animationIndex = 0
      const animate = (el: Element | null, keys: Keyframe[]) => {
        if (!el) return
        if (refresh) {
          const effect = this.animations[animationIndex++]?.effect
          if (effect instanceof KeyframeEffect) effect.setKeyframes(keys)
          return
        }
        const a = el.animate(keys, { duration: duration + delay, fill: 'both' })
        a.startTime = timelineStart(at)
        this.animations.push(a)
      }
      // The ink clip spans every member: the leading shortcut and, with a Search role, the
      // trailing Search member. Glyphs in the gap between them fade out (`covered` below).
      const searchMember = this.searchMemberGeometry()
      const clipRight = (f: (typeof frames)[number]) =>
        searchMember ? Math.max(f.x + f.width, g.dockWidth - searchMember.inset) : f.x + f.width
      animate(
        dock.querySelector('.satin-lens-tab-ink-clip'),
        frames.map(f => ({
          offset: f.offset,
          transform: `translateX(${f.x}px) scaleX(${(clipRight(f) - f.x) / g.dockWidth})`,
        })),
      )
      animate(
        dock.querySelector('.satin-lens-tab-ink-plane'),
        frames.map(f => ({
          offset: f.offset,
          transform: `scaleX(${g.dockWidth / (clipRight(f) - f.x)}) translateX(${-f.x}px)`,
        })),
      )
      const custom = !!dock.querySelector('[data-satin-custom-icons]')
      // The glass capsule is a canvas frame that reaches the screen later than these DOM
      // keyframes. An unselected glyph shows only once the capsule as it was GLYPH_LAG_MS
      // earlier already contains it, so it never sits outside a lagging, growing capsule.
      const lagged = frames.map((_, i) => {
        const f = this.sample(at + ((duration + delay) * i) / 240 - GLYPH_LAG_MS)
        return minimizePlacement(f.progress, g.dockWidth, g.dockHeight, g.tabBarMinimizedOffsetX)
      })
      const searchIndex = searchMember
        ? tabs.findIndex(tab => tab.dataset.satinTabRole === 'search')
        : -1
      const covered = (index: number, x: number, i: number) => {
        if (index === selected || index === searchIndex) return 1
        const c = (g.tabBarCentres?.[index] ?? 53 + index * 85) + x,
          p = lagged[i]
        return Math.max(
          0,
          Math.min(
            1,
            (Math.min(c - GLYPH_HALF_WIDTH - p.x, p.x + p.width - c - GLYPH_HALF_WIDTH) +
              GLYPH_EDGE_RAMP) /
              GLYPH_EDGE_RAMP,
          ),
        )
      }
      dock.querySelectorAll('[role="tab"]').forEach((tab, index) => {
        if (index === searchIndex && searchMember) {
          animate(tab, this.searchGlyphFrames(frames, index, searchMember, custom))
          animate(
            tab.querySelector('small'),
            frames.map(f => ({ offset: f.offset, opacity: Math.max(0, Math.min(1, 1 - f.fade)) })),
          )
          return
        }
        animate(
          tab,
          frames.map((f, i) => {
            const ink = tabMinimizeInkFrame({
              progress: f.progress,
              fade: f.fade,
              width: g.dockWidth,
              centre: g.tabBarCentres?.[index] ?? 53 + index * 85,
              selectedCentre: g.tabBarCentres?.[selected] ?? 53 + selected * 85,
              selected: index === selected,
              compactCentre: (g.tabBarMinimizedOffsetX ?? 7) + 24,
            })
            return {
              offset: f.offset,
              transform: `translate3d(${ink.x}px,${(custom ? -0.5 : -1.25) + 7 * f.progress}px,0) scale(${ink.scale})`,
              opacity: ink.opacity * covered(index, ink.x, i),
            }
          }),
        )
        animate(
          tab.querySelector('small'),
          frames.map(f => ({ offset: f.offset, opacity: Math.max(0, Math.min(1, 1 - f.fade)) })),
        )
      })
      return frames
    }
    const frames = renderInk(false)
    const dock = this.options.elements.chrome.dock
    const run = this.run
    void this.animations[0]?.finished.then(
      () => {
        if (this.run === run) {
          dock.inert = direction === 'collapse'
          if (direction === 'restore') dock.classList.remove('satin-lens-tab-minimize-owned')
        }
      },
      () => {},
    )
    const stop = this.stopProbe
    const finished = Promise.resolve(this.animations[0]?.finished).then(
      () => {
        stop?.()
        if (this.stopProbe === stop) this.stopProbe = undefined
      },
      () => {
        stop?.()
      },
    )
    const track = {
      at,
      duration: duration + delay,
      finished,
      specs: this.withOccluder(frames).map(([f, occluder]) => this.apply(spec, f, occluder)),
    }
    this.refreshInkGeometry = () => {
      track.specs = this.withOccluder(renderInk(true)).map(([f, occluder]) =>
        this.apply(spec, f, occluder),
      )
      this.retargetTrack?.(track)
    }
    recordMotionEventCost('webgpu-minimize-track', at, performance.now())
    return track
  }
  /**
   * Commit the compact or expanded chrome layout. The restore control's visibility keys that
   * layout in CSS, so this is its only writer after construction; the bottom accessory moves
   * across the change from its presented position. `motionStart` is when the tab bar's own
   * motion starts (the accessory's measured delays count from there).
   */
  private showCompactLayout(compact: boolean, motionStart = performance.now()) {
    if (this.button.hidden === !compact) return
    this.accessory.move(compact ? 'collapse' : 'restore', motionStart, () => {
      this.button.hidden = !compact
    })
  }
  update(options: RuntimeOptions) {
    const previous = this.options.geometry
    this.options = options
    const geometryChanged =
      previous.dockWidth !== options.geometry.dockWidth ||
      previous.dockHeight !== options.geometry.dockHeight ||
      previous.tabBarMinimizedOffsetX !== options.geometry.tabBarMinimizedOffsetX ||
      previous.tabBarSelectedIndex !== options.geometry.tabBarSelectedIndex ||
      previous.tabBarCentres?.some(
        (centre, index) => centre !== options.geometry.tabBarCentres?.[index],
      )
    // Filled WAAPI transforms survive rotation. Reproject the same samples into the new
    // slot, including the settled compact frame, without restarting the morph clock.
    if (geometryChanged) this.refreshInkGeometry?.()
    const g = options.geometry
    Object.assign(this.button.style, {
      left: `${g.dockX + (g.tabBarMinimizedOffsetX ?? 7)}px`,
      top: `${g.dockY + 7}px`,
    })
  }
  current(spec: SurfaceRenderSpec) {
    const now = performance.now()
    const [[frame, occluder]] = this.withOccluder([{ ...this.sample(now), time: now }])
    return this.apply(spec, frame!, occluder)
  }
  /** Each sample with the bottom accessory's capsule at its time (`accessoryOccluder`). */
  private withOccluder<F extends MinimizeFrame & { time: number }>(frames: readonly F[]) {
    const dock = this.options.elements.chrome.dock.getBoundingClientRect()
    return frames.map(f => [f, this.accessoryOccluder(f.time, dock)] as const)
  }
  /**
   * The bottom accessory's capsule at `time` in the bar's frame points (`dock` is the bar's
   * frame in the viewport), while it moves. Native draws the accessory over the bar where they
   * overlap (both directions: the accessory rises through the growing bar, and drops beside the
   * shrinking one). The accessory's glass is in the page, below the bar's layer, so the bar
   * leaves this capsule empty instead.
   */
  private accessoryOccluder(time: number, dock: DOMRect): CapsuleShape | undefined {
    const capsule = this.accessory.capsuleAt(time)
    if (!capsule) return undefined
    return {
      centerX: capsule.x - dock.left + capsule.width / 2,
      centerY: capsule.y - dock.top + capsule.height / 2,
      halfWidth: capsule.width / 2,
      halfHeight: capsule.height / 2,
      radius: Math.min(capsule.width, capsule.height) / 2,
    }
  }
  /**
   * The Search member's geometry when the bar has a Search-role tab, else undefined. Both
   * compact members settle at the full dock's edges. A centred intrinsic platter therefore
   * has a negative inset, matching the leading shortcut's offset from that platter.
   */
  private searchMemberGeometry(): SearchMemberGeometry | undefined {
    const dock = this.options.elements.chrome.dock
    if (!dock.querySelector('[role="tab"][data-satin-tab-role="search"]')) return undefined
    const g = this.options.geometry
    return {
      dockWidth: g.dockWidth,
      dockHeight: g.dockHeight,
      inset: g.tabBarMinimizedOffsetX ?? 7,
    }
  }

  /**
   * The Search tab's glyph travels with its member, from its slot in the bar to the centre of
   * the circle, at full opacity and size (native: the magnifier stays visible throughout and
   * settles centred in the circle; the label fades with the other labels).
   */
  private searchGlyphFrames(
    frames: readonly (MinimizeFrame & { offset: number })[],
    index: number,
    member: SearchMemberGeometry,
    customIcons: boolean,
  ): Keyframe[] {
    const restCentre = this.options.geometry.tabBarCentres?.[index] ?? member.dockWidth - 40
    const travel = searchCircleCentre(member) - restCentre
    const baseline = customIcons ? -0.5 : -1.25
    return frames.map(f => ({
      offset: f.offset,
      transform: `translate3d(${travel * f.search}px,${baseline + 7 * f.progress}px,0) scale(1)`,
      opacity: 1,
    }))
  }

  private apply(
    spec: SurfaceRenderSpec,
    f: MinimizeFrame,
    occluder?: CapsuleShape,
  ): SurfaceRenderSpec {
    // Tracks can outlive a controlled selection update. Project from the committed tab,
    // never from a capsule captured before that update.
    const geometry = this.options.geometry
    const centre = geometry.tabBarCentres?.[geometry.tabBarSelectedIndex ?? 0]
    if (spec.tabSelection && centre !== undefined) {
      spec = {
        ...spec,
        tabSelection: {
          ...spec.tabSelection,
          capsule: { ...spec.tabSelection.capsule, centerX: centre },
        },
      }
    }
    if (atRest(f)) {
      // A retargeted track includes its pre-onset frames. They must use the current
      // slot too; returning the captured spec preserves the old expanded width.
      return {
        ...spec,
        frameWidth: geometry.dockWidth,
        frameHeight: geometry.dockHeight,
        shape: {
          ...spec.shape,
          first: {
            ...spec.shape.first,
            centerX: geometry.dockWidth / 2,
            centerY: geometry.dockHeight / 2,
            halfWidth: geometry.dockWidth / 2,
            halfHeight: geometry.dockHeight / 2,
            radius: geometry.dockRadius,
          },
        },
      }
    }
    const g = this.options.geometry,
      p = minimizePlacement(f.progress, g.dockWidth, g.dockHeight, g.tabBarMinimizedOffsetX),
      height = g.dockHeight + (48 - g.dockHeight) * f.heightProgress,
      y = 7 * f.heightProgress,
      pill = spec.tabSelection?.capsule
    const bar = {
      centerX: p.x + p.width / 2,
      centerY: y + height / 2,
      halfWidth: p.width / 2,
      halfHeight: height / 2,
      radius: height / 2,
    }
    const searchMember = this.searchMemberGeometry()
    return {
      ...spec,
      ...(occluder ? { occluder } : {}),
      shaderAperture: true,
      shape: {
        ...spec.shape,
        first: bar,
        ...(searchMember
          ? {
              members: [bar, searchMemberShape(f.search, f.heightProgress, searchMember)],
              blendRadius: SEARCH_MEMBER_BLEND_RADIUS,
            }
          : {}),
      },
      tabSelection: pill
        ? {
            ...spec.tabSelection!,
            lensMix: 0,
            materialMix: spec.tabSelection!.materialMix * (1 - Math.max(0, Math.min(1, f.fade))),
            capsule: {
              centerX:
                pill.centerX * (1 - f.progress) +
                ((g.tabBarMinimizedOffsetX ?? 7) + 24) * f.progress,
              centerY: 31,
              halfWidth: pill.halfWidth * (1 - f.progress) + 24 * f.progress,
              halfHeight: pill.halfHeight * (1 - f.progress) + 24 * f.progress,
              radius: pill.radius * (1 - f.progress) + 24 * f.progress,
            },
          }
        : undefined,
    }
  }

  /**
   * The page is being hidden: end a running transaction at its committed layout, with the bottom
   * accessory's run, so nothing is mid-motion across a suspension. The renderer settles its copy
   * of the track at the same end when it hides (`renderer.ts`, 'visible'), so on return the page
   * and the renderer start from one pose: the compact or expanded layout this transaction
   * committed. A transaction resumed on the far side of a suspension had no single owner: the
   * renderer had dropped its track while the page still held its run.
   */
  settle() {
    this.accessory.settle()
    const run = this.run
    if (!run || performance.now() >= run.start + run.duration) return
    this.stopProbe?.()
    this.stopProbe = undefined
    // Far enough past the end for the Search member's spring to have come to rest too.
    const end = this.sample(run.start + run.duration + SETTLED_AFTER_MS)
    this.sample = () => end
    run.duration = performance.now() - run.start
    // Their finish handlers (the `run` check passes) commit `inert` and the owned class.
    for (const animation of this.animations) animation.finish()
  }
  /** Debug readout (resume diagnostics). */
  readout() {
    const chrome = tabBottomChrome(this.options.elements.chrome.dock)
    const accessory = chrome?.querySelector<HTMLElement>(
      ':scope > [data-satin-tab-bottom-accessory]',
    )
    return {
      active: this.active,
      direction: this.run?.direction ?? null,
      compactLayout: !this.button.hidden,
      inert: this.options.elements.chrome.dock.inert,
      accessoryRun: this.accessory.running,
      timelineOffset: Math.round(timelineOffset()),
      accessory: accessory ? accessoryMorphReadout(accessory) : null,
    }
  }

  dispose() {
    this.unregisterCompactBar?.()
    this.stopProbe?.()
    this.stopProbe = undefined
    for (const a of this.animations) a.cancel()
    this.accessory.dispose()
    this.button.remove()
    this.options.elements.chrome.dock.inert = false
    this.options.elements.chrome.dock.classList.remove('satin-lens-tab-minimize-owned')
  }
}

function atRest(frame: MinimizeFrame) {
  return (
    frame.progress === 0 && frame.heightProgress === 0 && frame.fade === 0 && frame.search === 0
  )
}
