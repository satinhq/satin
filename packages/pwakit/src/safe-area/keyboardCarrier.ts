import { keyboardTranslationStops, sampleKeyboardTranslation } from '../keyboard/translation.ts'
import type { BottomInsetGeometry } from './bottomInsetGeometry.ts'
import {
  KEYBOARD_CARRIER_MOTION,
  setKeyboardCarrierPose,
  setKeyboardCarrierContent,
  clearKeyboardCarrierContent,
  clearKeyboardCarrierPose,
} from './keyboardCarrierGeometry.ts'
import {
  currentKeyboardHeight,
  onKeyboardMotion,
  type KeyboardMotion,
} from '../keyboard/adapter.ts'
import { lagMark, lagTraceEnabled } from '../glass/webgpu/lagTrace.ts'
import { KEYBOARD_DURATION_MS, KEYBOARD_HOLD_MS, keyboardKeyframes } from '../keyboard/motion.ts'

/**
 * Moves a root bottom inset with the software keyboard as one thing, as a native chat's composer
 * and transcript ride the keyboard.
 *
 * Why not animate the inset's padding: that is layout, and layout needs the page to draw. On the
 * installed iPad WebKit draws one page frame after it reports the keyboard and then none until the
 * keyboard has arrived (~390 ms on the tested iPad). A padding animation stands still for
 * that whole time and then jumps. Transform animations run on the compositor and keep moving.
 *
 * So each keyboard change is one run on the keyboard's own curve (keyboard/motion.ts):
 * - the accessory (the composer) and the content of each scroll view that is pinned to its bottom
 *   (`defaultScrollAnchor="bottom"`) move together on compositor transforms;
 * - the inset's layout changes once per run, at the endpoint where nothing is clipped. A keyboard
 *   that rises keeps the taller scrollport until the composer has arrived, then commits the shorter
 *   one; a keyboard that falls commits the taller one first and the transforms lead back to it.
 *   Committing a shorter scrollport first would clip the transcript above the composer.
 * - a run that starts while another is moving starts from the pose on screen, never from rest.
 *
 * The editor stays live and keeps its text, selection and focus: nothing is snapshotted or scaled.
 */
export function installKeyboardCarrier(
  boundary: HTMLElement,
  accessory: HTMLElement,
  geometry: BottomInsetGeometry,
  measuredRoom: () => Readonly<{
    systemInset: number
    coveredRows: number
    accessoryHeight: number
  }>,
) {
  // The keyboard height the boundary's layout is committed to, and the one last reported.
  let committed = currentKeyboardHeight()
  let keyboardHeight = committed
  type Run = {
    animations: Map<HTMLElement, Animation>
    finish: () => void
    retime: (leadMs: number) => void
    refreshOverlays: () => void
  }
  let run: Run | undefined
  let accessoryRestTop = accessory.getBoundingClientRect().top
  let accessoryHeight = measuredRoom().accessoryHeight
  // Growth changes the bottom-anchored resting top even while a carry is running. Keep its
  // anchor current using SafeAreaInset's existing measurement, not another layout read.
  const synchronizeAccessoryHeight = () => {
    const nextHeight = measuredRoom().accessoryHeight
    accessoryRestTop -= nextHeight - accessoryHeight
    accessoryHeight = nextHeight
  }
  const originTops = new Map<HTMLElement, number>([[accessory, accessoryRestTop]])
  const contentOrigins = new Map<HTMLElement, { surface: HTMLElement; top: number }>()
  const backdropAdjustments = new Map<HTMLElement, number>()
  const restTops = new Map<HTMLElement, number>([[accessory, accessoryRestTop]])
  const announce = () => window.dispatchEvent(new Event(KEYBOARD_CARRIER_MOTION))
  const restPose = (element: HTMLElement, top: number) => {
    const origin = originTops.get(element) ?? top
    originTops.set(element, origin)
    restTops.set(element, top)
    const source = contentOrigins.get(element)
    const backdropAdjustment = source
      ? contentStart(element) + source.surface.scrollTop - source.top - (top - origin)
      : 0
    backdropAdjustments.set(element, backdropAdjustment)
    setKeyboardCarrierPose(element, () => ({
      offsetY: top - origin,
      moving: false,
      backdropAdjustment,
    }))
  }
  restPose(accessory, accessoryRestTop)
  const geometryObserver = new ResizeObserver(() => {
    synchronizeAccessoryHeight()
    if (run) return
    accessoryRestTop = accessory.getBoundingClientRect().top
    restPose(accessory, accessoryRestTop)
    announce()
  })
  geometryObserver.observe(accessory)
  geometryObserver.observe(boundary)
  const commit = (height: number) => {
    committed = height
    boundary.style.setProperty(COMMITTED_HEIGHT, `${height}px`)
  }
  commit(committed)
  boundary.dataset.satinKeyboardCarrier = 'true'

  const stopRun = () => {
    const current = run
    run = undefined
    for (const animation of current?.animations.values() ?? []) animation.cancel()
  }

  const carry = ({ height, leadMs }: KeyboardMotion) => {
    synchronizeAccessoryHeight()
    // The same change reported again with an earlier stamp: the keyboard started sooner than the
    // first report said. Keep the run and move it onto the keyboard's clock.
    if (height === keyboardHeight) {
      run?.retime(leadMs)
      return
    }
    const startHeight = keyboardHeight
    keyboardHeight = height
    const elements = [...geometry.attached()]
    const surfaces = carriedScrollViews(elements)
    let overlays = carriedOverlays(geometry.participants(), accessory)
    const shownOverlays = overlays.map(({ content }) => content.getBoundingClientRect().top)
    // Where everything is on screen now, including the pose of a run still moving.
    const shownAccessory = run ? accessory.getBoundingClientRect().top : accessoryRestTop
    const runAccessoryOffset = run ? shownAccessory - accessoryRestTop : 0
    const shownContent = surfaces.map(contentTop)
    // A first dismissal can commit taller layout before a content pose has ever
    // been registered. Preserve its pre-commit origin as well as its native scroll.
    surfaces.forEach(({ surface, content }, index) => {
      if (originTops.has(content)) return
      originTops.set(content, shownContent[index]!)
      contentOrigins.set(content, { surface, top: contentStart(content) + surface.scrollTop })
      setKeyboardCarrierContent(
        surface,
        content,
        () => contentStart(content) + surface.scrollTop - contentOrigins.get(content)!.top,
      )
    })
    stopRun()
    const pinned = surfaces.map(view => view.anchorsToBottom && isAtBottom(view.surface))
    const measured = measuredRoom()
    const room = (keyboard: number) =>
      Math.max(measured.systemInset, keyboard - measured.coveredRows)
    const layoutPadding = room(committed)
    const travel = room(height) - layoutPadding
    const keyboardRises = travel > 0
    let scrollTravel: number[]
    if (keyboardRises) {
      // Keep the taller scrollport while moving. A pinned transcript will scroll by the travel
      // when the shorter one is committed; it rides up by that much on the way.
      scrollTravel = surfaces.map(({ surface }, index) =>
        pinned[index]
          ? bottomOffset(surface, surface.clientHeight - travel) - surface.scrollTop
          : 0,
      )
    } else {
      commit(height)
      const offsets = surfaces.map(({ surface }) => surface.scrollTop)
      surfaces.forEach(({ surface }, index) => {
        if (pinned[index]) scrollToBottom(surface)
      })
      scrollTravel = surfaces.map(({ surface }, index) => surface.scrollTop - offsets[index]!)
    }
    accessoryRestTop += layoutPadding - room(committed)
    // The accessory sits on the keyboard's room at every instant, as native's keyboard layout
    // guide does: on the safe area until the keyboard's top passes it, then on the keyboard. A run
    // that starts away from that pose (a reversal) blends its difference out on the same curve.
    const committedPadding = room(committed)
    const keyboardAt = (progress: number) => startHeight + (height - startHeight) * progress
    const accessoryLayoutAt = (progress: number) => committedPadding - room(keyboardAt(progress))
    // The committed padding is the only layout displacement of the root accessory.
    // Reversals still read the shown pose, but never force layout after a commit just to recover it.
    const accessoryFrom = runAccessoryOffset + committedPadding - layoutPadding
    const reversal = accessoryFrom - accessoryLayoutAt(0)
    const accessoryAt = (progress: number) =>
      accessoryLayoutAt(progress) + reversal * (1 - progress)
    const accessoryTo = accessoryAt(1)
    // A carried transcript moves in lockstep with the accessory, by its own distance.
    const contentFrom = surfaces.map((view, index) => {
      const top = contentTop(view)
      restPose(view.content, top)
      return shownContent[index]! - top
    })
    const overlayFrom = overlays.map(({ content }, index) => {
      const top = content.getBoundingClientRect().top
      restPose(content, top)
      return shownOverlays[index]! - top
    })
    restPose(accessory, accessoryRestTop)
    const contentTo = surfaces.map((_, index) => (keyboardRises ? -scrollTravel[index]! : 0))
    const accessoryShare = (progress: number) =>
      Math.abs(accessoryTo - accessoryFrom) < 0.5
        ? progress
        : (accessoryAt(progress) - accessoryFrom) / (accessoryTo - accessoryFrom)

    let finishTimer: ReturnType<typeof setTimeout> | undefined
    // Commit from the page's own frame once the curve has ended: the layout and the removed
    // transforms then reach the screen together, while the compositor holds the end pose.
    const scheduleFinish = (lead: number) => {
      clearTimeout(finishTimer)
      finishTimer = setTimeout(
        () => requestAnimationFrame(finish),
        Math.max(0, KEYBOARD_DURATION_MS - lead),
      )
    }
    const current: Run = {
      animations: new Map(),
      refreshOverlays: () => refreshOverlays(),
      finish: () => finish(),
      retime: lead => {
        const start = performance.now() - lead
        for (const animation of current.animations.values()) animation.startTime = start
        startTime = start
        trace('retime', { height, leadMs: Math.round(lead) })
        scheduleFinish(lead)
        announce()
      },
    }
    const finish = () => {
      if (run !== current) return
      trace('commit', { height, rises: keyboardRises })
      if (keyboardRises) {
        const stillPinned = surfaces.map(view => view.anchorsToBottom && isAtBottom(view.surface))
        commit(height)
        surfaces.forEach(({ surface }, index) => {
          if (stillPinned[index]) scrollToBottom(surface)
        })
      }
      stopRun()
      accessoryRestTop = accessory.getBoundingClientRect().top
      restPose(accessory, accessoryRestTop)
      for (const view of surfaces) restPose(view.content, contentTop(view))
      for (const { content } of overlays) restPose(content, content.getBoundingClientRect().top)
      announce()
    }
    run = current
    let startTime = performance.now() - leadMs
    const totalMs = KEYBOARD_DURATION_MS + KEYBOARD_HOLD_MS
    const move = (element: HTMLElement, translateAt: (progress: number) => number) => {
      if (Math.abs(translateAt(0)) < 0.5 && Math.abs(translateAt(1)) < 0.5) return
      const frames = keyboardKeyframes(translateAt, totalMs)
      const animation = element.animate(frames, {
        duration: totalMs,
        fill: 'both',
      })
      // Pin the curve to the keyboard's clock, not to the next frame this page happens to draw.
      animation.startTime = startTime
      current.animations.set(element, animation)
      const layoutOffset = (restTops.get(element) ?? 0) - (originTops.get(element) ?? 0)
      const stops = keyboardTranslationStops(frames)
      const backdropAdjustment = backdropAdjustments.get(element) ?? 0
      setKeyboardCarrierPose(element, () => {
        const epoch = performance.timeOrigin + Number(animation.startTime)
        const motion = {
          epoch,
          duration: totalMs,
          end: epoch + KEYBOARD_DURATION_MS,
          offset: layoutOffset,
          stops,
        }
        return {
          offsetY: sampleKeyboardTranslation(motion, performance.timeOrigin + performance.now()),
          moving: run === current,
          motion,
          backdropAdjustment,
        }
      })
    }
    // Registration can change after the keyboard report (conditional controls, nested insets,
    // or alignment changes). Join the original curve at its current clock; never restart it.
    const refreshOverlays = () => {
      const next = carriedOverlays(geometry.participants(), accessory)
      const retained = new Set(next.map(({ content }) => content))
      for (const { content } of overlays) {
        if (retained.has(content)) continue
        current.animations.get(content)?.cancel()
        current.animations.delete(content)
        clearKeyboardCarrierPose(content)
        restTops.delete(content)
        originTops.delete(content)
      }
      const previous = new Set(overlays.map(({ content }) => content))
      for (const { content, share } of next) {
        if (previous.has(content)) continue
        restPose(content, content.getBoundingClientRect().top)
        move(content, progress => accessoryAt(progress) * share)
      }
      overlays = next
      announce()
    }
    if (leadMs < KEYBOARD_DURATION_MS) {
      move(accessory, accessoryAt)
      overlays.forEach(({ content, share }, index) => {
        const from = overlayFrom[index]!
        const to = keyboardRises ? accessoryTo * share : 0
        move(content, progress => from + (to - from) * accessoryShare(progress))
      })
      surfaces.forEach(({ content }, index) => {
        const from = contentFrom[index]!
        const to = contentTo[index]!
        move(content, progress => from + (to - from) * accessoryShare(progress))
      })
    }
    announce()
    trace('start', {
      height,
      startHeight,
      leadMs: Math.round(leadMs),
      travel,
      accessoryFrom: Math.round(accessoryFrom),
      accessoryTo: Math.round(accessoryTo),
      carried: surfaces.length,
      pinned: pinned.filter(Boolean).length,
    })
    if (!current.animations.size) {
      finish()
      return
    }
    scheduleFinish(leadMs)
  }

  // A backgrounded app is snapshotted at rest.
  const visibilityChanged = () => {
    if (document.visibilityState === 'hidden') run?.finish()
  }
  const unsubscribeParticipants = geometry.subscribeParticipants(() => {
    if (run) {
      run.refreshOverlays()
      return
    }
    const retained = new Set(
      carriedOverlays(geometry.participants(), accessory).map(({ content }) => content),
    )
    for (const element of originTops.keys()) {
      if (!element.hasAttribute('data-satin-overlay-content') || retained.has(element)) continue
      clearKeyboardCarrierPose(element)
      originTops.delete(element)
      restTops.delete(element)
    }
  })
  const unsubscribe = onKeyboardMotion(carry)
  document.addEventListener('visibilitychange', visibilityChanged)
  return () => {
    unsubscribe()
    unsubscribeParticipants()
    geometryObserver.disconnect()
    document.removeEventListener('visibilitychange', visibilityChanged)
    stopRun()
    for (const element of originTops.keys()) clearKeyboardCarrierPose(element)
    for (const { surface } of contentOrigins.values()) clearKeyboardCarrierContent(surface)
    announce()
    delete boundary.dataset.satinKeyboardCarrier
    boundary.style.removeProperty(COMMITTED_HEIGHT)
  }
}

function trace(stage: string, values: Record<string, number | boolean>) {
  if (lagTraceEnabled())
    lagMark({
      stage: `keyboard-carrier-${stage}`,
      at: performance.timeOrigin + performance.now(),
      values,
    })
}

/** The keyboard height the boundary's layout is committed to (styles.css, carrier mode). */
const COMMITTED_HEIGHT = '--satin-keyboard-committed'

type CarriedScrollView = Readonly<{
  surface: HTMLElement
  content: HTMLElement
  anchorsToBottom: boolean
}>

/** Vertical scroll views with a positioned content box (ScrollSurface's `data-satin-scroll-content`). */
function carriedScrollViews(elements: Iterable<HTMLElement>): CarriedScrollView[] {
  const views: CarriedScrollView[] = []
  for (const surface of elements) {
    if (!surface.isConnected || surface.dataset.satinScrollAxis !== 'vertical') continue
    const content = surface.querySelector<HTMLElement>(':scope > [data-satin-scroll-content]')
    if (!content) continue
    views.push({
      surface,
      content,
      anchorsToBottom: content.dataset.satinScrollAlignment === 'bottom',
    })
  }
  return views
}

/**
 * Where a scroll view's content is on screen. A bottom-aligned transcript shorter than its
 * scrollport sits at the end of its flex column, so its last row is measured, not the box.
 */
function contentTop({ content }: CarriedScrollView) {
  return (content.lastElementChild ?? content).getBoundingClientRect().top
}

/** The captured rows start here. Appending a last row must not translate an older
 * capture; native scroll already accounts for a long transcript following its end. */
function contentStart(content: HTMLElement) {
  return (content.firstElementChild ?? content).getBoundingClientRect().top
}

function isAtBottom(surface: HTMLElement) {
  return surface.scrollHeight - surface.clientHeight - surface.scrollTop <= 1
}

/** The bottom-most scroll offset for a scrollport of the given height. */
function bottomOffset(surface: HTMLElement, clientHeight: number) {
  return Math.max(0, surface.scrollHeight - clientHeight)
}

function scrollToBottom(surface: HTMLElement) {
  surface.scrollTop = bottomOffset(surface, surface.clientHeight)
}

/** Only the outermost content owns transport. Descendants inherit that same transform. */
function carriedOverlays(elements: Iterable<HTMLElement>, accessory: HTMLElement) {
  return [...elements].flatMap(layer => {
    if (
      !layer.isConnected ||
      !layer.hasAttribute('data-satin-overlay-layer') ||
      accessory.contains(layer)
    )
      return []
    if (layer.closest('[data-satin-scroll-content], [data-satin-overlay-content]')) return []
    const content = layer.querySelector<HTMLElement>(':scope > [data-satin-overlay-content]')
    if (!content) return []
    const alignment = layer.dataset.satinOverlayLayer ?? 'center'
    const share = alignment.startsWith('bottom') ? 1 : alignment.startsWith('top') ? 0 : 0.5
    return [{ content, share }]
  })
}
