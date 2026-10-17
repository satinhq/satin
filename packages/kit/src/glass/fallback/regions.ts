import type { GlassRegionRegistry } from '../regionRegistry.ts'
import type { GlassRegion } from '../regions.ts'
import { regionSpec, emergeRegionSpec, emergeProfile } from '../webgpu/regionScene.ts'
import { menuMorphDuration, sampleMenuMorph, transitionMenuMorph } from '../lens/menuMorphMotion.ts'
import { sampleMenuCorner } from '../lens/menuCornerMotion.ts'
import { confirmHeldSources, heldPresentations } from '../presentationFrame.ts'
import { animateElement, timelineStart } from '../../motion/animate.ts'
import { FallbackMaterial } from './material.ts'
import { FallbackCanvasOwnership } from './canvasOwnership.ts'
import { GLASS_SHAPE_TRACK_EVENT, glassShapeTrack } from '../shapeTrackRegistry.ts'
import { trackedShapeSpec } from '../shapeTrack.ts'
import { glassRadius } from '../regions.ts'

/** Registered DOM owners already follow scroll, sheets and navigation on the compositor. */
export class FallbackRegions {
  private canvases = new FallbackCanvasOwnership()
  private entries = new Map<
    string,
    {
      material: FallbackMaterial
      signature: string
      generation: number
      ink?: Animation
      motion?: (now: number) => ReturnType<typeof sampleMenuMorph>
      corner?: (now: number) => ReturnType<typeof sampleMenuCorner>
    }
  >()
  private unsubscribe: (() => void)[] = []
  private frame = 0
  private commitFrame = 0
  private disposed = false
  private registry: GlassRegionRegistry | undefined
  private appearance: 'light' | 'dark'
  constructor(registry: GlassRegionRegistry | undefined, appearance: 'light' | 'dark') {
    this.registry = registry
    this.appearance = appearance
    if (!registry) return
    this.unsubscribe = [
      registry.subscribe(this.schedule),
      registry.subscribePresentation(this.schedule),
    ]
    window.addEventListener(GLASS_SHAPE_TRACK_EVENT, this.schedule)
    this.refresh()
  }
  private schedule = () => {
    if (!this.frame)
      this.frame = requestAnimationFrame(() => {
        this.frame = 0
        this.refresh()
      })
  }
  setAppearance(appearance: 'light' | 'dark') {
    if (appearance === this.appearance) return
    this.appearance = appearance
    this.refresh()
  }
  refresh() {
    const registrations = this.registry?.values() ?? []
    this.canvases.update([
      ...registrations.flatMap(entry => [entry.canvas, ...(entry.overlay ? [entry.overlay] : [])]),
      ...[...(this.registry?.containers.values() ?? [])].map(entry => entry.canvas),
    ])
    const live = new Set(registrations.map(entry => entry.id))
    for (const [id, entry] of this.entries) {
      if (!live.has(id)) {
        entry.ink?.cancel()
        entry.material.dispose()
        this.entries.delete(id)
      }
    }
    cancelAnimationFrame(this.commitFrame)
    const shows = registrations.map(entry => ({
      entry,
      show: entry.canvas.dataset.satinGlassShow,
    }))
    this.commitFrame = requestAnimationFrame(() => {
      if (this.disposed) return
      // CSS samples the live backdrop. It needs no image capture, but first-show ownership and
      // generation checks are identical to the other material renderer's submission receipts.
      confirmHeldSources(
        heldPresentations().filter(([panel]) =>
          registrations.some(entry => panel.contains(entry.element)),
        ),
      )
      for (const { entry, show } of shows) {
        if (
          !entry.element.isConnected ||
          !this.entries.has(entry.id) ||
          entry.canvas.dataset.satinGlassShow !== show
        )
          continue
        entry.canvas.dataset.satinGlassPresented = 'true'
        if (show !== undefined) entry.canvas.dataset.satinGlassPresentedShow = show
      }
    })
    for (const registration of registrations) {
      const { id, element, descriptor } = registration
      const width = element.offsetWidth
      const height = element.offsetHeight
      if (!width || !height) continue
      // Only menu endpoint submission needs viewport geometry; ordinary motion stays local.
      const box = descriptor.emerge ? element.getBoundingClientRect() : { x: 0, y: 0 }
      const region: GlassRegion = {
        ...descriptor,
        shapeTrack: glassShapeTrack(element),
        frame: { x: box.x, y: box.y, width, height },
        layer: { id: 'fallback', depth: 0, attachment: { kind: 'fixed' } },
      }
      const signature = JSON.stringify([region, this.appearance])
      let entry = this.entries.get(id)
      if (!entry) {
        entry = {
          material: new FallbackMaterial(element),
          signature: '',
          generation: 0,
        }
        this.entries.set(id, entry)
      }
      if (entry.signature === signature) continue
      const previous = entry.signature
      entry.signature = signature
      const presenter = {
        id,
        layerId: 'fallback',
        regionIds: [id],
        origin: box,
        width,
        height,
        resolution: 1,
      }
      const scene = { revision: 0, regions: [region], layers: [region.layer], scrolls: [] }
      const spec = regionSpec(region, presenter, scene)
      const emerge = region.emerge
      if (region.shapeTrack && !emerge) {
        const track = region.shapeTrack
        const frames = track.frames.map((_, index) =>
          trackedShapeSpec(
            spec,
            track,
            track.epoch +
              (track.frames.length > 1 ? (index / (track.frames.length - 1)) * track.duration : 0),
            (w, h) => glassRadius(region.shape, w, h),
          ),
        )
        // A demotion joins the original run at its current time. It never restarts from zero.
        if (track.epoch === Number.MAX_VALUE || frames.length === 1)
          entry.material.paint(frames[0]!, this.appearance)
        else
          void entry.material.play(
            frames,
            track.duration,
            track.epoch - performance.timeOrigin,
            this.appearance,
          )
        continue
      }
      if (!emerge || emerge.ready === false) {
        entry.material.paint(spec, this.appearance)
        continue
      }
      // inkDom changes are acknowledgements, not another trajectory.
      if (previous && JSON.parse(previous)[0].emerge?.generation === emerge.generation) continue
      const generation = ++entry.generation
      const direction = emerge.closing ? 'close' : 'open'
      const profile = emergeProfile(emerge)
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
      const duration = reduced ? 1 : menuMorphDuration(direction, profile)
      const at = performance.now()
      const previousMotion = entry.motion?.(at)
      const sample = (ms: number) =>
        reduced
          ? sampleMenuMorph(direction, Infinity, profile, this.appearance)
          : previousMotion
            ? transitionMenuMorph(
                direction,
                ms,
                previousMotion.pose,
                previousMotion.velocity,
                profile,
                this.appearance,
              )
            : sampleMenuMorph(direction, ms, profile, this.appearance)
      entry.motion = now => sample(now - at)
      const previousCorner = entry.corner?.(at)
      const corner = (ms: number) =>
        sampleMenuCorner(direction, ms, previousCorner?.pose, previousCorner?.velocity)
      entry.corner = now => corner(now - at)
      const ink = element.querySelector<HTMLElement>('[data-satin-menu-ink]')
      const inkWidth = ink?.offsetWidth || width
      const inkHeight = ink?.offsetHeight || height
      // Supply DOM ink bounds to the renderer-neutral field. No atlas is captured or uploaded.
      const inkRegion: GlassRegion = {
        ...region,
        emerge: {
          ...emerge,
          inkDom: false,
          ink: {
            atlas: { width: inkWidth, height: inkHeight },
            rows: {
              source: { x: 0, y: 0, width: inkWidth, height: inkHeight },
              frame: {
                x: box.x + (ink?.offsetLeft ?? 0),
                y: box.y + (ink?.offsetTop ?? 0),
                width: inkWidth,
                height: inkHeight,
              },
            },
          },
        },
      }
      const specs = Array.from({ length: 121 }, (_, index) => {
        const ms = (index / 120) * duration
        return emergeRegionSpec(
          spec,
          inkRegion,
          presenter,
          sample(ms).pose,
          reduced ? { rounding: 0 } : corner(ms).pose,
          undefined,
          {
            direction,
            ms: reduced ? Infinity : ms,
            pressHighlight: 0,
            settled: reduced || (direction === 'open' && ms >= duration),
          },
          this.appearance,
        )
      })
      entry.ink?.cancel()
      if (ink) {
        // The shared field gives rows their own scale/fade. Toolbar text starts at full
        // size while the aperture grows; scaling it by the glass width makes it unreadable.
        const frames = specs.map((frame, index) => {
          const rows = frame.ink?.layers[0]
          return {
            offset: index / (specs.length - 1),
            transformOrigin: '0 0',
            transform: rows
              ? `translate(${frame.frameX + rows.frame.x - ink.offsetLeft}px,${frame.frameY + rows.frame.y - ink.offsetTop}px) scale(${rows.frame.width / inkWidth},${rows.frame.height / inkHeight})`
              : 'none',
            opacity: rows?.opacity ?? 0,
            filter: `blur(${rows?.blur ?? 0}px)`,
          }
        })
        entry.ink = animateElement(ink, frames, { duration, easing: 'linear', fill: 'both' })
        entry.ink.startTime = timelineStart(at)
      }
      if (emerge.closing)
        this.registry?.emergeInk({
          type: 'emerge-ink',
          regionId: id,
          generation: emerge.generation,
          phase: 'close-started',
        })
      const activeEntry = entry
      void entry.material.play(specs, duration, at, this.appearance).then(() => {
        if (
          this.disposed ||
          this.entries.get(id) !== activeEntry ||
          activeEntry.generation !== generation
        )
          return
        if (emerge.closing) this.registry?.emergeSettled(id, emerge.generation)
        else {
          activeEntry.ink?.cancel()
          this.registry?.emergeInk({
            type: 'emerge-ink',
            regionId: id,
            generation: emerge.generation,
            phase: 'open-settled',
          })
        }
      })
    }
  }
  dispose() {
    this.disposed = true
    window.removeEventListener(GLASS_SHAPE_TRACK_EVENT, this.schedule)
    cancelAnimationFrame(this.frame)
    cancelAnimationFrame(this.commitFrame)
    this.unsubscribe.forEach(unsubscribe => unsubscribe())
    this.entries.forEach(entry => {
      entry.ink?.cancel()
      entry.material.dispose()
    })
    this.entries.clear()
    this.canvases.dispose()
  }
}
