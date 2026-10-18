import { keyboardTranslationStops, sampleKeyboardTranslation } from '../keyboard/translation.ts'
import type { BottomInsetGeometry } from './bottomInsetGeometry.ts'
import {
  KEYBOARD_CARRIER_MOTION,
  setKeyboardCarrierPose,
  setKeyboardCarrierContent,
  clearKeyboardCarrierContent,
  clearKeyboardCarrierPose,
  commitCarriedKeyboardRoom,
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
 * installed iPad WebKit can defer page frames while the system keyboard continues moving.
 * A padding animation waits for those frames and then jumps. Compositor transforms keep moving.
 *
 * So each keyboard change is one run on the keyboard's own curve (keyboard/motion.ts):
 * - the accessory (the composer) and the content of each scroll view that is pinned to its bottom
 *   (`defaultScrollAnchor="bottom"`) move together on compositor transforms;
 * - the scroll frame stays full height. Keyboard clearance is terminal scroll room, so neither
 *   direction resizes the transcript when the system starts moving. Both directions commit
 *   their resting inset after the transform reaches its endpoint, in one rendering update.
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
  commitScrollInset: (height: number) => void = () => {},
) {
  // The keyboard height the boundary's layout is committed to, and the one last reported.
  let committed = currentKeyboardHeight()
  let keyboardHeight = committed
  type Run = {
    animations: Map<HTMLElement, Animation>
    pinnedOffsets: Map<HTMLElement, number>
    finish: () => void
    retime: (startTime: number) => void
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
    commitScrollInset(height)
  }
  commit(committed)
  boundary.dataset.satinKeyboardCarrier = 'true'

  // Each carried element keeps its compositor animation while the keyboard is up.
  const transports = createKeyboardTransports()
  /** End the current run. Its elements stay at rest on their parked animations. */
  const stopRun = () => {
    const current = run
    run = undefined
    for (const element of current?.animations.keys() ?? []) transports.park(element)
  }

  const carry = ({ height, startTime: reportedStart }: KeyboardMotion) => {
    synchronizeAccessoryHeight()
    // The same change reported again with an earlier stamp: the keyboard started sooner than the
    // first report said. Keep the run and move it onto the keyboard's clock.
    if (height === keyboardHeight) {
      run?.retime(reportedStart)
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
    // Preserve the capture origin and native scroll before the first carried run.
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
    // A downward transform temporarily extends scrollable overflow. Compare a continuing
    // pinned run with its native offset, not that animated overflow; a real user scroll wins.
    const pinned = surfaces.map(({ surface, anchorsToBottom }) => {
      const previousOffset = run?.pinnedOffsets.get(surface)
      return (
        anchorsToBottom &&
        (isAtBottom(surface) ||
          (previousOffset !== undefined && Math.abs(surface.scrollTop - previousOffset) <= 1))
      )
    })
    stopRun()
    const measured = measuredRoom()
    const room = (keyboard: number) =>
      Math.max(measured.systemInset, keyboard - measured.coveredRows)
    const layoutPadding = room(committed)
    const travel = room(height) - layoutPadding
    // The native composer interpolates between the two safe-area rooms on the keyboard's curve. The
    // system inset contributes throughout the travel, not as a clamp near the endpoint.
    // A reversal blends its difference from that path out on the same curve.
    const committedPadding = room(committed)
    const startRoom = room(startHeight)
    const endRoom = room(height)
    const accessoryLayoutAt = (progress: number) =>
      committedPadding - (startRoom + (endRoom - startRoom) * progress)
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
    const contentTo = surfaces.map((_, index) => (pinned[index] ? -travel : 0))
    const accessoryShare = (progress: number) =>
      Math.abs(accessoryTo - accessoryFrom) < 0.5
        ? progress
        : (accessoryAt(progress) - accessoryFrom) / (accessoryTo - accessoryFrom)

    let finishTimer: ReturnType<typeof setTimeout> | undefined
    // Commit from the page's own frame once the curve has ended: the layout and the removed
    // transforms then reach the screen together, while the compositor holds the end pose.
    const scheduleFinish = () => {
      clearTimeout(finishTimer)
      finishTimer = setTimeout(
        () => requestAnimationFrame(finish),
        Math.max(0, startTime + KEYBOARD_DURATION_MS - performance.now()),
      )
    }
    const current: Run = {
      animations: new Map(),
      pinnedOffsets: new Map(
        surfaces.flatMap(({ surface }, index) =>
          pinned[index] ? [[surface, surface.scrollTop] as const] : [],
        ),
      ),
      refreshOverlays: () => refreshOverlays(),
      finish: () => finish(),
      retime: start => {
        for (const animation of current.animations.values()) animation.startTime = start
        startTime = start
        trace('retime', { height, leadMs: Math.round(performance.now() - start) })
        scheduleFinish()
        announce()
      },
    }
    const finish = () => {
      if (run !== current) return
      trace('commit', { height, rises: travel > 0 })
      const stillPinned = surfaces.map(({ surface }) => {
        const offset = current.pinnedOffsets.get(surface)
        return (
          offset !== undefined && (isAtBottom(surface) || Math.abs(surface.scrollTop - offset) <= 1)
        )
      })
      // A reader can scroll away during transport. Preserve the visible row at the commit,
      // not the native offset that still includes the transform being removed.
      const readingTops = surfaces.map((view, index) =>
        pinned[index] && !stillPinned[index] ? contentTop(view) : undefined,
      )
      // Remove transport before publishing the new inset: scroll anchoring must measure the
      // final layout, never the positive transform's temporary scrollable overflow.
      stopRun()
      // The scroll views' new room moves nothing on screen: the transforms just removed showed it.
      commitCarriedKeyboardRoom(() => commit(height))
      // The keyboard has gone: release the animations so the resting page carries no transform.
      if (height === 0) transports.releaseAll()
      surfaces.forEach((view, index) => {
        const { surface } = view
        if (stillPinned[index]) scrollToBottom(surface)
        else if (readingTops[index] !== undefined)
          surface.scrollTop += contentTop(view) - readingTops[index]!
      })
      accessoryRestTop = accessory.getBoundingClientRect().top
      restPose(accessory, accessoryRestTop)
      for (const view of surfaces) restPose(view.content, contentTop(view))
      for (const { content } of overlays) restPose(content, content.getBoundingClientRect().top)
      announce()
    }
    run = current
    // Layout preparation may be expensive for a long transcript. It must not shift
    // the OS curve or extend its endpoint deadline. Every carrier uses the same epoch.
    let startTime = reportedStart
    const totalMs = KEYBOARD_DURATION_MS + KEYBOARD_HOLD_MS
    const move = (element: HTMLElement, translateAt: (progress: number) => number) => {
      if (Math.abs(translateAt(0)) < 0.5 && Math.abs(translateAt(1)) < 0.5) return
      const frames = keyboardKeyframes(translateAt, totalMs)
      // Pin the curve to the keyboard's clock, not to the next frame this page happens to draw.
      const animation = transports.drive(element, frames, totalMs, startTime)
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
        transports.release(content)
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
    if (performance.now() - startTime < KEYBOARD_DURATION_MS) {
      move(accessory, accessoryAt)
      overlays.forEach(({ content, share }, index) => {
        const from = overlayFrom[index]!
        const to = accessoryTo * share
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
      leadMs: Math.round(performance.now() - startTime),
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
    scheduleFinish()
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
    transports.releaseAll()
    for (const element of originTops.keys()) clearKeyboardCarrierPose(element)
    for (const { surface } of contentOrigins.values()) clearKeyboardCarrierContent(surface)
    announce()
    delete boundary.dataset.satinKeyboardCarrier
    boundary.style.removeProperty(COMMITTED_HEIGHT)
    commitScrollInset(0)
  }
}

/** Two identical keyframes: the transform an element has at rest. */
const AT_REST: Keyframe[] = [{ transform: 'translateY(0px)' }, { transform: 'translateY(0px)' }]

/**
 * The compositor animations that carry elements with the keyboard, one per element, kept while
 * the keyboard is up.
 *
 * Starting a new transform animation on a long transcript is expensive in WebKit, and it falls
 * in the very rendering update that has to put the composer in motion: the composer stands
 * still while the keyboard moves. Retargeting an animation that already exists is cheap
 * (1,200 messages in iOS-family WebKit: 57 ms to start one, 11 ms to retarget one). So the
 * keyboard's first motion creates each element's animation, later motions retarget it, and
 * between motions it is parked, paused at rest. Once the keyboard has gone they are released,
 * so a page without a keyboard carries no transform.
 */
function createKeyboardTransports() {
  const animations = new Map<HTMLElement, Animation>()
  const effect = (animation: Animation) => animation.effect as KeyframeEffect
  return {
    /** Run `frames` on the keyboard's clock, starting at `startTime`. */
    drive(element: HTMLElement, frames: Keyframe[], duration: number, startTime: number) {
      let animation = animations.get(element)
      if (animation) effect(animation).setKeyframes(frames)
      else {
        animation = element.animate(frames, { duration, fill: 'both' })
        animations.set(element, animation)
      }
      animation.play()
      animation.startTime = startTime
      return animation
    },
    /** Hold the element at rest, keeping its animation for the next motion. */
    park(element: HTMLElement) {
      const animation = animations.get(element)
      if (!animation) return
      effect(animation).setKeyframes(AT_REST)
      animation.pause()
    },
    release(element: HTMLElement) {
      animations.get(element)?.cancel()
      animations.delete(element)
    },
    releaseAll() {
      for (const animation of animations.values()) animation.cancel()
      animations.clear()
    },
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
