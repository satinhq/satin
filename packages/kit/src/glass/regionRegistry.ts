import { animateElement } from '../motion/animate.ts'
import { sampleFieldAxis } from './fieldMotion.ts'
import { glassIdentityKey } from './morphField.ts'
import type { GlassInteraction, GlassRegionEvent } from './rendererContract.ts'
import { isPlainMenuSource, type GlassRegion } from './regions.ts'
export type GlassRegionRegistration = Readonly<{
  id: string
  element: HTMLElement
  canvas: HTMLCanvasElement
  overlay?: HTMLCanvasElement
  descriptor: Omit<GlassRegion, 'frame' | 'layer'> & { layer?: GlassRegion['layer'] }
}>
/** DOM ownership stays here. Only GlassRegion snapshots cross a worker boundary. */
export class GlassRegionRegistry {
  readonly interactions = new Map<string, GlassInteraction>()
  private inputListeners = new Set<(input: GlassInteraction) => void>()
  subscribeInput = (listener: (input: GlassInteraction) => void) => {
    this.inputListeners.add(listener)
    return () => {
      this.inputListeners.delete(listener)
    }
  }
  private contentObservers = new Map<string, MutationObserver>()
  private contentListeners = new Set<(element: HTMLElement) => void>()
  subscribeContent = (listener: (element: HTMLElement) => void) => {
    this.contentListeners.add(listener)
    return () => {
      this.contentListeners.delete(listener)
    }
  }
  private contentChanged(entry: GlassRegionRegistration, records: MutationRecord[]) {
    const changed = records.some(record => {
      const target = record.target instanceof Element ? record.target : record.target.parentElement
      // Presenter sizing/visibility belongs to the renderer, not the captured content.
      return (
        target &&
        target.tagName !== 'CANVAS' &&
        (record.type !== 'attributes' ||
          record.attributeName !== 'style' ||
          (target !== entry.element && !target.hasAttribute('data-satin-glass-field-content')))
      )
    })
    if (!changed) return
    this.snapshotRevision++
    for (const listener of this.contentListeners) listener(entry.element)
    this.invalidate()
  }
  interact(input: GlassInteraction) {
    // A React commit and DOWN may share a task, before MutationObserver delivery.
    const entry = this.entries.get(input.regionId)
    const observer = this.contentObservers.get(input.regionId)
    if (entry && observer) this.contentChanged(entry, observer.takeRecords())
    const descriptor = this.entries.get(input.regionId)?.descriptor
    const material = descriptor?.material
    // A segmented glass (the search scope bar) takes the finger for its thumb and its own press,
    // though its material is not an interactive button's.
    if (!material?.interactive && !material?.touchLight && !descriptor?.selection) return
    this.interactions.set(input.regionId, input)
    for (const listener of this.inputListeners) listener(input)
  }
  readonly containers = new Map<
    string,
    { element: HTMLElement; canvas: HTMLCanvasElement; continuous: boolean }
  >()
  registerContainer(id: string, element: HTMLElement, canvas: HTMLCanvasElement) {
    const container = { element, canvas, continuous: false }
    this.containers.set(id, container)
    let frame: number | undefined
    let disposed = false
    const sampleLayout = () => {
      frame = undefined
      if (disposed) return
      // CSS owns these trajectories. Foreground WAAPI springs must not keep this loop alive.
      const moving = element
        .getAnimations({ subtree: true })
        .some(
          animation =>
            (typeof CSSTransition !== 'undefined' && animation instanceof CSSTransition) ||
            (typeof CSSAnimation !== 'undefined' && animation instanceof CSSAnimation),
        )
      container.continuous = moving
      this.invalidate()
      if (moving) frame = requestAnimationFrame(sampleLayout)
    }
    const schedule = () => {
      if (frame === undefined) frame = requestAnimationFrame(sampleLayout)
    }
    const observer = new MutationObserver(records => {
      if (
        records.some(
          record =>
            !(record.target instanceof Element) ||
            !record.target.closest('[data-satin-glass-field-content]'),
        )
      )
        schedule()
    })
    observer.observe(element, {
      attributes: true,
      attributeFilter: ['style', 'class'],
      subtree: true,
      childList: true,
    })
    element.addEventListener('transitionrun', schedule)
    element.addEventListener('animationstart', schedule)
    this.invalidate()
    return () => {
      disposed = true
      observer.disconnect()
      element.removeEventListener('transitionrun', schedule)
      element.removeEventListener('animationstart', schedule)
      if (frame !== undefined) cancelAnimationFrame(frame)
      this.containers.delete(id)
      this.invalidate()
    }
  }
  private entries = new Map<string, GlassRegionRegistration>()
  /** Monotonic ownership boundary for asynchronous captures and queued scenes. */
  private retired = 0
  get retirementVersion() {
    return this.retired
  }
  private snapshotRevision = 0
  /** Async captures and parked scenes must match both ownership and menu motion state. */
  get snapshotVersion() {
    return this.snapshotRevision
  }
  private settleListeners = new Map<string, Set<(generation?: number) => void>>()
  /** The renderer finished a region's close morph (GlassEffect emerge). */
  onEmergeSettled(id: string, listener: (generation?: number) => void) {
    const set = this.settleListeners.get(id) ?? new Set()
    set.add(listener)
    this.settleListeners.set(id, set)
    return () => {
      set.delete(listener)
      if (!set.size) this.settleListeners.delete(id)
    }
  }
  emergeSettled(id: string, generation?: number) {
    for (const listener of [...(this.settleListeners.get(id) ?? [])]) listener(generation)
  }
  /** Retained aperture metadata; morph menus do not bind this property to CSS clipping. */
  emergeAperture(event: {
    type: 'emerge-aperture'
    regionId: string
    generation?: number
    top: number
    right: number
    bottom: number
    left: number
    radius: number
  }) {
    const entry = this.entries.get(event.regionId)
    if (
      !entry ||
      entry.descriptor.emerge?.closing ||
      entry.descriptor.emerge?.generation !== event.generation
    )
      return
    const edges = [event.top, event.right, event.bottom, event.left]
      .map(value => `calc(${value}px - var(--satin-glass-content-inset, 0px))`)
      .join(' ')
    entry.element.style.setProperty(
      '--satin-glass-emerge-clip',
      `inset(${edges} round max(0px, calc(${event.radius}px - var(--satin-glass-content-inset, 0px))))`,
    )
  }
  /** Synchronize retained foreground with the worker's submitted field spring. */
  fieldMotion(event: Extract<GlassRegionEvent, { type: 'field-motion' }>) {
    const content = this.entries
      .get(event.regionId)
      ?.element.querySelector<HTMLElement>('[data-satin-glass-field-content]')
    if (!content) return
    for (const animation of content.getAnimations()) animation.cancel()
    if (!event.duration) return
    // A composer commits its editing viewport before caret reveal. The material
    // may interpolate its height, but scaling that live viewport again compresses
    // glyphs and moves WebKit's independently painted caret. Keep editable ink at
    // its settled geometry during a vertical field resize.
    if (
      Math.abs(event.scaleY - 1) > 0.0001 &&
      content.querySelector('input, textarea, [contenteditable="true"]')
    )
      return
    const frames = Array.from({ length: 121 }, (_, index) => {
      const elapsed = (index / 120) * event.duration
      const axis = (from: number, to: number, velocity = 0) =>
        index === 120 ? to : sampleFieldAxis(from, to, velocity, elapsed).value
      return {
        offset: index / 120,
        transform:
          `translate(${axis(event.offsetX, 0, event.velocityX)}px, ${axis(event.offsetY, 0, event.velocityY)}px) ` +
          `scale(${axis(event.scaleX, 1, event.velocityScaleX)}, ${axis(event.scaleY, 1, event.velocityScaleY)})`,
      }
    })
    const animation = animateElement(content, frames, {
      duration: event.duration,
      easing: 'linear',
    })
    animation.currentTime = Math.max(0, performance.timeOrigin + performance.now() - event.start)
  }
  private inkListeners = new Map<
    string,
    Set<(phase: 'open-settled' | 'close-started', generation?: number) => void>
  >()
  /** The glass moved a menu's rows between its ink and the page's live DOM. */
  onEmergeInk(
    id: string,
    listener: (phase: 'open-settled' | 'close-started', generation?: number) => void,
  ) {
    const set = this.inkListeners.get(id) ?? new Set()
    set.add(listener)
    this.inkListeners.set(id, set)
    return () => {
      set.delete(listener)
      if (!set.size) this.inkListeners.delete(id)
    }
  }
  emergeInk(event: Extract<GlassRegionEvent, { type: 'emerge-ink' }>) {
    for (const listener of [...(this.inkListeners.get(event.regionId) ?? [])])
      listener(event.phase, event.generation)
  }
  private listeners = new Set<() => void>()
  get size() {
    return this.entries.size
  }
  values() {
    return [...this.entries.values()]
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private presentationListeners = new Set<() => void>()
  /** A committed drop transition already has layout; do not wait for another display tick. */
  subscribePresentation = (listener: () => void) => {
    this.presentationListeners.add(listener)
    return () => {
      this.presentationListeners.delete(listener)
    }
  }
  invalidatePresentation = () => {
    for (const listener of this.presentationListeners) listener()
  }
  invalidate = () => {
    for (const listener of this.listeners) listener()
  }
  /** Update a persistent navigation item's presentation without replacing its registration. */
  updateShape(id: string, shape: GlassRegion['shape']) {
    const entry = this.entries.get(id)
    if (entry) this.updatePresentation(id, { material: entry.descriptor.material, shape })
  }
  updatePresentation(id: string, presentation: Pick<GlassRegion, 'material' | 'shape'>) {
    const entry = this.entries.get(id)
    if (!entry) return
    if (
      JSON.stringify([entry.descriptor.material, entry.descriptor.shape]) ===
      JSON.stringify([presentation.material, presentation.shape])
    )
      return
    Object.assign(entry, { descriptor: { ...entry.descriptor, ...presentation } })
    this.invalidate()
  }
  /** Move a region's segmented selection (the scope bar's thumb); the renderer slides it. */
  updateSelection(id: string, selection: GlassRegion['selection']) {
    const entry = this.entries.get(id)
    if (!entry || JSON.stringify(entry.descriptor.selection) === JSON.stringify(selection)) return
    Object.assign(entry, { descriptor: { ...entry.descriptor, selection } })
    this.invalidate()
  }
  /** Keep the canvas, observer and contact while the existing menu motion changes generation. */
  updateEmerge(id: string, emerge: GlassRegion['emerge']) {
    const entry = this.entries.get(id)
    if (!entry || JSON.stringify(entry.descriptor.emerge) === JSON.stringify(emerge)) return
    const previous = entry.descriptor.emerge
    Object.assign(entry, { descriptor: { ...entry.descriptor, emerge } })
    // Replacing a descriptor used to unregister it. Preserve that stale-work boundary without
    // publishing a transient missing region or discarding its active contact.
    this.snapshotRevision++
    this.invalidate()
    if (
      isPlainMenuSource(previous?.sourceKind) ||
      previous?.recognitionEpoch !== undefined ||
      isPlainMenuSource(emerge?.sourceKind) ||
      emerge?.recognitionEpoch !== undefined
    )
      this.invalidatePresentation()
  }
  register(entry: GlassRegionRegistration) {
    if (this.entries.has(entry.id)) throw new Error(`Duplicate glass registration: ${entry.id}`)
    // Registration owns DOM lifetime, including retained routes. Capacity belongs to the
    // renderer's validated snapshot: a renderer failure can select the release fallback,
    // whereas throwing here tears down React before that fallback can render the owners.
    const identity = glassIdentityKey(entry.descriptor)
    if (identity && this.values().some(value => glassIdentityKey(value.descriptor) === identity))
      throw Error(`Duplicate active glassEffectID: ${identity}`)
    this.entries.set(entry.id, entry)
    const observer =
      typeof MutationObserver === 'undefined'
        ? undefined
        : new MutationObserver(records => this.contentChanged(entry, records))
    observer?.observe(entry.element, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [
        'class',
        'style',
        'src',
        'srcset',
        'sizes',
        'd',
        'viewBox',
        'fill',
        'stroke',
      ],
    })
    if (observer) this.contentObservers.set(entry.id, observer)
    this.invalidate()
    if (
      isPlainMenuSource(entry.descriptor.emerge?.sourceKind) ||
      entry.descriptor.emerge?.recognitionEpoch !== undefined
    )
      this.invalidatePresentation()
    return () => {
      if (this.entries.get(entry.id) === entry) {
        observer?.disconnect()
        this.contentObservers.delete(entry.id)
        this.entries.delete(entry.id)
        this.retired++
        this.snapshotRevision++
        this.interactions.delete(entry.id)
        this.invalidate()
        if (
          isPlainMenuSource(entry.descriptor.emerge?.sourceKind) ||
          entry.descriptor.emerge?.recognitionEpoch !== undefined
        )
          this.invalidatePresentation()
      }
    }
  }
}
