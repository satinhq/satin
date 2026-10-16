import { useContext, useLayoutEffect, useRef, useState } from 'react'
import { GlassEffect } from '../glass/GlassEffect.tsx'
import { MaterialEffectContext } from '../glass/liquidContext.ts'
import { Glass, glassRadius } from '../glass/regions.ts'
import { NAVIGATION_CHROME_DISSOLVE } from './chromeCurves.ts'
import { ToolbarGlassMotion } from './toolbarGlassMotion.ts'
import { toolbarMotionAnimation } from './toolbarMotionOwner.ts'
import { glassApertureInFrame, glassShapeTrack } from '../glass/shapeTrackRegistry.ts'
import { shapeTrackClock } from '../glass/shapeTrack.ts'
import {
  bindToolbarMaterialContent,
  toolbarMaterialItems,
  toolbarMaterialRuns,
  toolbarMaterials,
  toolbarSearchHidden,
  type ToolbarMaterial,
} from '../glass/toolbarMaterialContext.ts'

type Placement = 'leading' | 'trailing' | 'principal' | 'bottom'
type Size = { width: number; height: number }
type Frame = Size & { x: number; y: number }
type Item = {
  key: string
  placement: Placement
  index: number
  frame: Frame
  radius: number
  opacity: number
  material: ToolbarMaterial
  content: HTMLElement
}
const placements: Placement[] = ['leading', 'trailing', 'principal', 'bottom']

/** Toolbar material and ink share this borderless, local containing block.
 * Viewport rects include the sheet's translation and content scale. Undo those
 * once at measurement, then let their common DOM ancestors carry both paints.
 * A fixed presenter would instead apply a transformed sheet's origin twice.
 *
 * WebKit can sample a running presentation animation anew between two reads in the same
 * frame, with no write in between (Catalyst, sheet entrance: the container moved 2.42 pt
 * between two consecutive reads, about 0.8 ms of travel). An item read across that step
 * would be placed off its label, so its frame is only taken from reads one sample answered:
 * the container reads on both sides of the item must agree. */
function itemFrame(content: HTMLElement, container: HTMLElement, layout: Size): Frame {
  for (let attempt = 1; ; attempt++) {
    const before = container.getBoundingClientRect()
    const rect = content.getBoundingClientRect()
    const after = container.getBoundingClientRect()
    const oneSample =
      before.left === after.left &&
      before.top === after.top &&
      before.width === after.width &&
      before.height === after.height
    // A second step within one item's three reads would need two resamples in well under a
    // millisecond; the third attempt is a guard, not a path that is expected to run.
    if (oneSample || attempt === 3) {
      const scaleX = after.width / layout.width || 1
      const scaleY = after.height / layout.height || 1
      return {
        x: (rect.left - after.left) / scaleX,
        y: (rect.top - after.top) / scaleY,
        width: rect.width / scaleX,
        height: rect.height / scaleY,
      }
    }
  }
}

/** The padding between a merged capsule and its members' boxes (styles.css: 4 pt in the
 * navigation bar, 5 pt in the bottom bar). A single item's box is its capsule. */
function runPadding(run: readonly HTMLElement[], placement: Placement) {
  if (run.length === 1) return 0
  return placement === 'bottom' ? 5 : 4
}

/** A run of merged items: one capsule around its members, whose margins carry the capsule's
 * padding. */
function runFrame(
  run: readonly HTMLElement[],
  placement: Placement,
  frameOf: (content: HTMLElement) => Frame,
): Frame {
  if (run.length === 1) return frameOf(run[0]!)
  const frames = run.map(frameOf)
  const pad = runPadding(run, placement)
  const left = Math.min(...frames.map(frame => frame.x)) - pad
  const top = Math.min(...frames.map(frame => frame.y)) - pad
  const right = Math.max(...frames.map(frame => frame.x + frame.width)) + pad
  const bottom = Math.max(...frames.map(frame => frame.y + frame.height)) + pad
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/** The scale a run's dissolve has on it now (transitionChrome.ts slotScaleTargets: every member
 * scales by the same amount about the capsule's centre). */
function dissolveScale(run: readonly HTMLElement[]) {
  const scale = parseFloat(getComputedStyle(run[0]!).scale)
  return Number.isFinite(scale) && scale > 0 ? scale : 1
}

/** A run's capsule as laid out, without its dissolve's scale. A place both screens occupy keeps
 * one capsule while only the symbols dissolve (native), so its glass must not swell with them. */
function restingFrame(
  run: readonly HTMLElement[],
  placement: Placement,
  frameOf: (content: HTMLElement) => Frame,
): Frame {
  const frame = runFrame(run, placement, frameOf)
  const scale = dissolveScale(run)
  if (scale === 1) return frame
  const pad = runPadding(run, placement)
  const width = (frame.width - 2 * pad) / scale + 2 * pad
  const height = (frame.height - 2 * pad) / scale + 2 * pad
  return {
    x: frame.x + (frame.width - width) / 2,
    y: frame.y + (frame.height - height) / 2,
    width,
    height,
  }
}

function runMaterial(run: readonly HTMLElement[] | undefined): ToolbarMaterial | undefined {
  const material = run && toolbarMaterials.get(run[0]!)
  if (!material || run.length === 1) return material
  return { ...material, shape: 'capsule', press: 'bar' }
}

function slotOpacity(slot: HTMLElement | undefined) {
  return slot ? Number(getComputedStyle(slot).opacity || 1) : 0
}

/** A visible back control's glass circle: during a push from (or pop to) a root with a leading
 * glass item, both share one spot and the back control's glass carries the circle. */
function backGlassFrame(
  visual: HTMLElement | null,
  frameOf: (content: HTMLElement) => Frame,
): Frame | undefined {
  return visual ? frameOf(visual) : undefined
}

let measuredFrame = 0
/** Whether chrome the glass is measured from is animating: the back control's visual or a bar
 * slot (a leading glass swap's swell, whose tail outlives its transition, or a dissolve). WebKit
 * answers rect reads with an element's pre-animation box while only compositor-run animations
 * change it (Catalyst, pop to a root: the swelling circle read 44 pt while its scale was 1.2), and
 * glass regions are drawn from those rects. A style write each measured frame makes every later
 * read this frame see the animated box. */
function refreshAnimatedChrome(elements: readonly HTMLElement[]) {
  let animating = false
  for (const element of elements) {
    if (
      ['opacity', 'scale', 'transform'].some(property =>
        toolbarMotionAnimation(element, property as 'opacity' | 'scale' | 'transform'),
      )
    )
      continue
    const running =
      typeof element.getAnimations === 'function' && element.getAnimations().length > 0
    if (running) {
      element.style.setProperty('--satin-measured-frame', String(++measuredFrame % 1024))
      animating = true
    } else if (element.style.getPropertyValue('--satin-measured-frame'))
      element.style.removeProperty('--satin-measured-frame')
  }
  return animating
}

function mostlyCovers(cover: Frame, item: Frame) {
  const width = Math.min(cover.x + cover.width, item.x + item.width) - Math.max(cover.x, item.x)
  const height = Math.min(cover.y + cover.height, item.y + item.height) - Math.max(cover.y, item.y)
  return width > 0 && height > 0 && width * height > 0.5 * item.width * item.height
}

/** Outgoing and incoming item i share one persistent region, including its live shape. */
export function ToolbarGlass() {
  const root = useRef<HTMLDivElement>(null)
  const liquid = useContext(MaterialEffectContext)
  const [occupied, setOccupied] = useState<Item[]>([])
  const occupiedKeys = useRef('')
  const frames = useRef(new Map<string, Item>())
  const transitionOrigins = useRef(new Map<string, Item>())
  const transitionKey = useRef('')
  useLayoutEffect(() => {
    const header = root.current?.closest<HTMLElement>('[data-satin-navigation-chrome]')
    if (!header) return
    // While its presentation moves (entrance, drag, dismissal), layout inside the sheet can still
    // settle under a transform no observer sees. Measure every frame until the motion ends.
    const presentation = header.closest('dialog')
    const presenting = () => presentation?.hasAttribute('data-satin-presentation-moving') === true
    const motions = new Map<HTMLElement, ToolbarGlassMotion>()
    let animationFrame = 0
    const measure = () => {
      animationFrame = 0
      const container = root.current
      if (!container) return
      const style = getComputedStyle(container)
      // Untransformed size: the scale is read from the same sample as each item's origin.
      const layout = { width: parseFloat(style.width), height: parseFloat(style.height) }
      // A run can supply both an endpoint and the current material. Reuse its
      // coherent local sample within this pass; resample on the next frame so
      // sheet layout changes and interrupted navigation remain observable.
      const measuredFrames = new Map<HTMLElement, Frame>()
      const frameOf = (content: HTMLElement) => {
        let frame = measuredFrames.get(content)
        if (!frame) {
          frame = itemFrame(content, container, layout)
          measuredFrames.set(content, frame)
        }
        return frame
      }
      const toolbars = [...header.querySelectorAll<HTMLElement>('[data-satin-entry-toolbar]')]
      const outgoing = toolbars
        .filter(toolbar => toolbar.dataset.satinToolbarMotion === 'outgoing')
        .reverse()
      const incoming = toolbars.find(toolbar => toolbar.dataset.satinToolbarMotion === 'incoming')
      const active = toolbars.find(toolbar => toolbar.dataset.satinEntryToolbarActive === 'true')
      const key =
        incoming && outgoing.length
          ? `${outgoing.map(toolbar => toolbar.dataset.satinEntryToolbar).join(',')}:${incoming.dataset.satinEntryToolbar}`
          : ''
      if (key !== transitionKey.current) {
        const at = shapeTrackClock()
        transitionOrigins.current = key
          ? new Map(
              [...frames.current].map(([itemKey, item]) => {
                const owner = container.querySelector<HTMLElement>(
                  `[data-satin-toolbar-glass="${item.placement}"][data-satin-toolbar-glass-item="${item.index}"]`,
                )
                if (!owner || !glassShapeTrack(owner)) return [itemKey, item]
                const aperture = glassApertureInFrame(
                  owner,
                  {
                    x: parseFloat(owner.style.left),
                    y: parseFloat(owner.style.top),
                    width: parseFloat(owner.style.width),
                    height: parseFloat(owner.style.height),
                  },
                  at,
                )
                return [itemKey, { ...item, frame: aperture, radius: aperture.radius }]
              }),
            )
          : new Map()
        transitionKey.current = key
      }
      const next: Item[] = []
      const backVisual = header.querySelector<HTMLElement>(
        '[data-satin-navigation-back-visible="true"] [data-satin-navigation-back-visual]',
      )
      const chromeAnimating = refreshAnimatedChrome([
        ...(backVisual ? [backVisual] : []),
        ...header.querySelectorAll<HTMLElement>('[data-satin-navigation-toolbar-slot]'),
        // A slot's items carry its dissolve's scale (transitionChrome.ts slotScaleTargets).
        ...header.querySelectorAll<HTMLElement>(
          '[data-satin-navigation-toolbar-slot] [data-satin-glass-slot-content]',
        ),
      ])
      const backGlass = backGlassFrame(backVisual, frameOf)
      for (const placement of placements) {
        const selector = `[data-satin-navigation-toolbar-slot="${placement}"]`
        // A screen presenting search has given its items way to the field: it owns no glass.
        const slot = (toolbar: HTMLElement | undefined) =>
          toolbar && !toolbarSearchHidden(toolbar)
            ? (toolbar.querySelector<HTMLElement>(selector) ?? undefined)
            : undefined
        // Pop-to-root carries the nearest outgoing screen that actually owns this placement.
        const outgoingSlot = outgoing
          .map(slot)
          .find(candidate => toolbarMaterialItems(candidate).length)
        // Covered intermediate screens may contribute a missing placement, never duplicate ink
        // over the nearest outgoing screen's occupied placement.
        for (const toolbar of toolbars) {
          const candidate = slot(toolbar)
          if (!candidate) continue
          const suppressed = key && outgoing.includes(toolbar) && candidate !== outgoingSlot
          const visibility = suppressed ? 'hidden' : ''
          if (candidate.style.visibility !== visibility) candidate.style.visibility = visibility
        }
        const incomingSlot = slot(incoming)
        const activeSlot = slot(active)
        const starts = toolbarMaterialRuns(outgoingSlot)
        const ends = toolbarMaterialRuns(incomingSlot)
        const settled = toolbarMaterialRuns(activeSlot)
        const count = key ? Math.max(starts.length, ends.length) : settled.length
        for (let index = 0; index < count; index++) {
          const itemKey = `${placement}:${index}`
          const start = starts[index]
          const end = ends[index]
          const content = key ? (end ?? start) : settled[index]
          if (!content) continue
          const startMaterial = runMaterial(start)
          const endMaterial = runMaterial(end)
          const progress = key ? slotOpacity(incomingSlot) : 1
          const material = (key
            ? progress > 0.5
              ? (endMaterial ?? startMaterial)
              : (startMaterial ?? endMaterial)
            : runMaterial(content)) ?? {
            glass: Glass.regular.interactive(),
            shape: 'capsule' as const,
            press: 'bar' as const,
          }
          // Only a place both screens occupy morphs, between its resting capsules. An item that
          // only leaves or only arrives stays on its own measured frame, which carries its
          // dissolve's scale: native scales that item's platter with its symbol.
          const morphing = start !== undefined && end !== undefined
          const frameFor = morphing ? restingFrame : runFrame
          const startFrame = start && frameFor(start, placement, frameOf)
          const endFrame = end && frameFor(end, placement, frameOf)
          const previous = transitionOrigins.current.get(itemKey)
          const origin = previous?.frame ?? startFrame ?? endFrame
          const target = endFrame ?? startFrame
          let frame = runFrame(content, placement, frameOf)
          let opacity = 1
          let radius = glassRadius(material.shape, frame.width, frame.height)
          if (key && origin && target) {
            const from = morphing ? origin : target
            frame = {
              x: from.x + (target.x - from.x) * progress,
              y: from.y + (target.y - from.y) * progress,
              width: from.width + (target.width - from.width) * progress,
              height: from.height + (target.height - from.height) * progress,
            }
            const targetRadius = glassRadius(
              (endMaterial ?? startMaterial ?? material).shape,
              target.width,
              target.height,
            )
            const originRadius = morphing
              ? (previous?.radius ??
                glassRadius(
                  (startMaterial ?? endMaterial ?? material).shape,
                  from.width,
                  from.height,
                ))
              : targetRadius
            radius = originRadius + (targetRadius - originRadius) * progress
            // A place both screens occupy keeps its one capsule fully shown: native's glass
            // there neither fades nor blurs while its symbols dissolve in place (iOS 27.0,
            // identical "…" and bottom "+": centres within 0.33 pt through push and pop).
            if (!start) opacity = progress
            else if (!end) opacity = slotOpacity(outgoingSlot)
          }
          // One circle, never two stacked: the back control's glass draws it (transitionChrome.ts
          // leadingGlassSwap cross-fades only the symbols).
          if (placement === 'leading' && backGlass && mostlyCovers(backGlass, frame)) opacity = 0
          const inkRun = key && progress <= 0.5 ? (start ?? end!) : content
          const ink = inkRun[0]!
          const item = {
            key: itemKey,
            placement,
            index,
            frame,
            radius,
            opacity,
            material,
            content: ink,
          }
          next.push(item)
          frames.current.set(itemKey, item)
          const owner = root.current?.querySelector<HTMLElement>(
            `[data-satin-toolbar-glass="${placement}"][data-satin-toolbar-glass-item="${index}"]`,
          )
          if (!owner) continue
          bindToolbarMaterialContent(owner, ink)
          // A menu emerging from any member takes the run's whole capsule with it.
          const emerged = inkRun.some(member =>
            Boolean(
              member.closest('[data-satin-menu-emerged="true"]') ||
              member.querySelector('[data-satin-menu-emerged="true"]'),
            ),
          )
          let motion = motions.get(owner)
          if (!motion) {
            motion = new ToolbarGlassMotion(owner)
            motions.set(owner, motion)
          }
          const moving = motion.update({
            slot: key ? (end ? incomingSlot : outgoingSlot) : activeSlot,
            content: content[0]!,
            from: origin ?? frame,
            to: restingFrame(content, placement, frameOf),
            morph: Boolean(key && morphing),
            padding: runPadding(content, placement),
            shape: material.shape,
            fromRadius:
              previous?.radius ??
              (origin &&
                glassRadius((startMaterial ?? material).shape, origin.width, origin.height)),
            toRadius: glassRadius(
              (endMaterial ?? startMaterial ?? material).shape,
              (endFrame ?? startFrame ?? frame).width,
              (endFrame ?? startFrame ?? frame).height,
            ),
            hidden:
              emerged || (placement === 'leading' && !!backGlass && mostlyCovers(backGlass, frame)),
          })
          const style = {
            left: `${frame.x}px`,
            top: `${frame.y}px`,
            width: `${frame.width}px`,
            height: `${frame.height}px`,
            borderRadius: `${radius}px`,
            opacity: String(emerged ? 0 : opacity),
            // A leaving or arriving item's dissolve (chromeCurves.ts chromeDissolve) blurs its
            // ink; the platter blurs with it. Its scale is already in the measured frame.
            filter:
              key && opacity > 0 && opacity < 0.999
                ? `blur(${NAVIGATION_CHROME_DISSOLVE.blur * (1 - opacity)}px)`
                : '',
          }
          if (
            !moving &&
            Object.entries(style).some(([name, value]) => owner.style[name as 'left'] !== value)
          ) {
            Object.assign(owner.style, style)
            liquid?.regions?.invalidate()
          }
          const regionId = owner.dataset.satinGlassRegionId
          if (regionId)
            liquid?.regions?.updatePresentation(regionId, {
              material: {
                ...material.glass.material,
                press: material.press ?? 'bar',
              },
              shape:
                key && !moving
                  ? { kind: 'roundedRectangle', cornerRadius: radius }
                  : material.shape,
            })
        }
      }
      const keys = next.map(item => item.key).join(',')
      for (const existing of frames.current.keys()) {
        if (!next.some(item => item.key === existing)) frames.current.delete(existing)
      }
      for (const [owner, motion] of motions) {
        if (!owner.isConnected) {
          motion.clear()
          motions.delete(owner)
        }
      }
      if (keys !== occupiedKeys.current) {
        occupiedKeys.current = keys
        setOccupied(next)
      }
      if (key || presenting() || chromeAnimating) animationFrame = requestAnimationFrame(measure)
    }
    const schedule = () => {
      if (!animationFrame) animationFrame = requestAnimationFrame(measure)
    }
    const mutation = new MutationObserver(records => {
      if (
        records.some(
          record => !(record.target instanceof Element) || !root.current?.contains(record.target),
        )
      )
        schedule()
    })
    mutation.observe(header, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        'data-satin-toolbar-motion',
        'data-satin-entry-toolbar-active',
        'data-satin-menu-emerged',
        'data-satin-navigation-back-visible',
        'data-satin-search-presented',
        'style',
      ],
    })
    const resize = new ResizeObserver(schedule)
    resize.observe(header)
    const motion = new MutationObserver(schedule)
    if (presentation)
      motion.observe(presentation, {
        attributes: true,
        attributeFilter: ['data-satin-presentation-moving'],
      })
    header.addEventListener('satin-toolbar-material', schedule)
    measure()
    return () => {
      cancelAnimationFrame(animationFrame)
      for (const motion of motions.values()) motion.clear()
      mutation.disconnect()
      motion.disconnect()
      resize.disconnect()
      header.removeEventListener('satin-toolbar-material', schedule)
    }
  })
  return (
    <div
      ref={root}
      data-satin-toolbar-materials="true"
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    >
      {occupied.map(item => (
        <GlassEffect
          key={item.key}
          glass={item.material.glass}
          shape={item.material.shape}
          press={item.material.press ?? 'bar'}
          data-satin-toolbar-glass={item.placement}
          data-satin-toolbar-glass-item={item.index}
          style={{
            position: 'absolute',
            left: item.frame.x,
            top: item.frame.y,
            width: item.frame.width,
            height: item.frame.height,
            opacity: item.opacity,
            pointerEvents: 'none',
          }}
        />
      ))}
    </div>
  )
}
