import {
  preparePresentationGlassMotion,
  disposePresentationGlassMotion,
  type PresentationGlassMotion,
} from './glassMotion.ts'
import { runPresentationMotion } from './presentationMotion.ts'
import { readDisplayCornerMetrics } from '../safe-area/displayCorners.ts'
import { animateElement } from '../motion/animate.ts'
import { holdPresentationForGlass } from './glassReady.ts'
import { lagMark, lagTraceEnabled } from '../glass/webgpu/lagTrace.ts'
import { glassNow } from '../glass/webgpu/profile.ts'
import { openModal, topModal } from '../modal/lifecycle.ts'
import { focusFromFramework } from '../focus/programmaticFocus.ts'
import { Glass } from '../glass/regions.ts'
import {
  alertDismissalFrames,
  ALERT_DISMISS_DURATION,
  CONFIRMATION_DISMISS_DURATION,
  confirmationDismissalFrames,
  COVER_PRESENT_DURATION,
  coverEntranceFrames,
  dialogEntranceFrames,
  sheetEntranceFrames,
  presentationDismissalFrames,
  presentationReturnFrames,
  presentationAnimationVelocity,
} from './motion.ts'
import { useAlertKeyboardMotion } from './useAlertKeyboardMotion.ts'
import { retainPresentation } from './activity.ts'
import {
  useContext,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
  type HTMLAttributes,
} from 'react'
import { GlassEffect, GlassLayer, PresentationGlassBoundary } from '../glass/GlassEffect.tsx'
import { MaterialEffectContext } from '../glass/liquidContext.ts'
import { reportGlassError } from '../glass/errors.ts'
import { useSafeAreaMetrics } from '../safe-area/useSafeAreaMetrics.ts'
import { editable, useKeyboardMetrics } from '../keyboard/adapter.ts'
import {
  alertRestingCenter,
  CONFIRMATION_POPOVER_WIDTH,
  confirmationPopoverFrame,
  sheetFrame,
  sheetCornerShape,
  type SheetPlacement,
} from './model.ts'
import { presentationSource } from './presentationSource.ts'

import { SOFTWARE_KEYBOARD_MIN_HEIGHT } from '../keyboard/expectedKeyboard.ts'

import type { PresentationProps } from './Presentation.tsx'

export type SurfaceProps = PresentationProps & {
  children: ReactNode
  kind: 'sheet' | 'cover' | 'alert' | 'confirmation'
  dismissDisabled?: boolean
  height?: number
  expansion?: number
  navigationChrome?: boolean
  /** Where a sheet sits (model.ts); a screen-filling one is drawn like a cover. */
  placement?: SheetPlacement
  skipDismissalAnimation?: boolean
  opaque?: boolean
  anchor?: RefObject<HTMLElement | null>
  sheetGestureHandlers?: HTMLAttributes<HTMLDivElement>
  sheetPanCanOwn?(target: Element, deltaY: number, heldMilliseconds: number): boolean
  /** A tap in the grabber's reach above the sheet's edge. */
  sheetGrabberAction?(): void
  sheetMotionGrab?: RefObject<(() => { offset: number; velocity: number } | null) | null>
  describedBy?: string
}
export { SOFTWARE_KEYBOARD_MIN_HEIGHT }
// Pointer travel after which a press on the dimmed area is a drag, not a tap.
const OUTSIDE_TAP_SLOP = 10

/** Native dialog top-layer owns background inertness, focus containment and stack order. */
export function Surface({
  sheetGestureHandlers,
  sheetPanCanOwn,
  sheetGrabberAction,
  sheetMotionGrab,
  isPresented,
  onPresentedChange,
  onDismiss,
  title,
  children,
  kind,
  dismissDisabled,
  height,
  expansion = 0,
  navigationChrome = false,
  placement,
  opaque,
  skipDismissalAnimation = false,
  anchor,
  describedBy,
}: SurfaceProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [retained, setRetained] = useState(isPresented)
  if (isPresented && !retained) setRetained(true)
  const present = isPresented || retained
  const panOwnership = useRef(sheetPanCanOwn)
  panOwnership.current = sheetPanCanOwn
  const outsidePress = useRef<{ x: number; y: number } | null>(null)
  useLayoutEffect(() => {
    const node = dialog.current?.querySelector<HTMLElement>('.satin-presentation-surface')
    if (kind !== 'sheet' || !node) return
    let origin: { x: number; y: number; time: number; target: Element; owned: boolean } | null =
      null
    const begin = (event: TouchEvent) => {
      const touch = event.touches[0]
      // A second finger makes the contact a pinch or a two-finger pan: never the sheet's.
      origin =
        touch && event.touches.length === 1 && event.target instanceof Element
          ? {
              x: touch.clientX,
              y: touch.clientY,
              time: event.timeStamp,
              target: event.target,
              owned: false,
            }
          : null
    }
    const move = (event: TouchEvent) => {
      const touch = event.touches[0]
      const canOwn = panOwnership.current
      if (!origin || !touch || !canOwn) return
      const deltaY = touch.clientY - origin.y
      // Measured with real touches: WebKit holds its own pan back for the first touchmove,
      // whatever its distance. After that the pan begins once a sample reaches 10 pt, and a
      // preventDefault sent on that sample loses the race (pointercancel, then the list
      // scrolls). The owner decides, per sample, whether it needs the touch yet.
      if (!origin.owned && Math.abs(deltaY) > Math.abs(touch.clientX - origin.x)) {
        origin.owned = canOwn(origin.target, deltaY, event.timeStamp - origin.time)
      }
      if (origin.owned && event.cancelable) event.preventDefault()
    }
    const end = () => {
      origin = null
    }
    node.addEventListener('touchstart', begin, { passive: true })
    node.addEventListener('touchmove', move, { passive: false })
    node.addEventListener('touchend', end)
    node.addEventListener('touchcancel', end)
    return () => {
      node.removeEventListener('touchstart', begin)
      node.removeEventListener('touchmove', move)
      node.removeEventListener('touchend', end)
      node.removeEventListener('touchcancel', end)
    }
  }, [kind, present])
  const entrance = useRef<Animation[]>([])
  const interruptedTravel = useRef<{ offset: number; opacity: number; velocity: number } | null>(
    null,
  )
  const travel = useRef<{ movement: Animation; cancel: () => void } | null>(null)
  const grabbedTravel = useRef(false)
  useLayoutEffect(() => {
    if (!sheetMotionGrab || !dialog.current) return
    sheetMotionGrab.current = () => {
      const node = dialog.current
      const layer = node?.querySelector<HTMLElement>('[data-satin-glass-layer]')
      const animation = travel.current?.movement ?? entrance.current[0]
      if (
        !layer ||
        !animation ||
        animation.playState !== 'running' ||
        !(Number(animation.currentTime) > 0)
      )
        return null
      const transform = getComputedStyle(layer).transform
      const offset = transform && transform !== 'none' ? new DOMMatrixReadOnly(transform).m42 : 0
      const velocity = presentationAnimationVelocity(animation)
      grabbedTravel.current = !isPresented
      travel.current?.cancel()
      travel.current = null
      entrance.current.forEach(value => value.cancel())
      entrance.current = []
      interruptedTravel.current = null
      node?.removeAttribute('data-satin-presentation-moving')
      if (!isPresented) callbacks.current.onPresentedChange(true)
      return { offset, velocity }
    }
    return () => {
      sheetMotionGrab.current = null
    }
  })
  const isPresentedRef = useRef(isPresented)
  isPresentedRef.current = isPresented
  const previouslyPresented = useRef(isPresented)
  const callbacks = useRef({ onPresentedChange, onDismiss })
  useLayoutEffect(() => {
    callbacks.current = { onPresentedChange, onDismiss }
  })
  const liquid = useContext(MaterialEffectContext)
  const geometry = useSafeAreaMetrics()
  const keyboard = useKeyboardMetrics()
  const wide = geometry.layoutViewport.width >= 768
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const [anchorInBar, setAnchorInBar] = useState(false)
  const [surfaceHeight, setSurfaceHeight] = useState(0)
  const viewportHeight = keyboard.visible ? keyboard.viewportHeight : geometry.layoutViewport.height
  const viewportCenter =
    (geometry.insets.top + viewportHeight - (keyboard.visible ? 0 : geometry.insets.bottom)) / 2
  // How far an alert's text field ends below the alert's centre (null: no field, or not laid out).
  const [fieldReach, setFieldReach] = useState<number | null>(null)
  const expectedKeyboardHeight = keyboard.expectedHeight ?? 0
  const liveCenter =
    kind === 'alert' && !keyboard.visible && fieldReach !== null
      ? alertRestingCenter(
          viewportCenter,
          fieldReach,
          geometry.layoutViewport.height,
          expectedKeyboardHeight,
          (geometry.insets.top + geometry.layoutViewport.height - expectedKeyboardHeight) / 2,
        )
      : viewportCenter
  const retainedCenter = useRef(liveCenter)
  if (isPresented) retainedCenter.current = liveCenter
  const center = kind === 'alert' && !isPresented ? retainedCenter.current : liveCenter
  useAlertKeyboardMotion(
    dialog,
    present && kind === 'alert',
    center,
    keyboard.visible,
    liquid?.regions,
    keyboard.visible && !keyboard.anticipated,
  )
  useLayoutEffect(() => {
    // Only an alert rests by its field; a sheet's renders stay free of layout reads.
    const alert = present && kind === 'alert' ? dialog.current : null
    const layer = alert?.querySelector<HTMLElement>('[data-satin-glass-layer]')
    const field = layer?.querySelector<HTMLElement>('input:not(:disabled), textarea:not(:disabled)')
    if (!layer || !field) {
      setFieldReach(null)
      return
    }
    // Layout distances, so the entrance's scale and the keyboard motion do not enter the measure.
    let fieldBottom = field.offsetHeight
    for (
      let node: HTMLElement | null = field;
      node && node !== layer;
      node = node.offsetParent instanceof HTMLElement ? node.offsetParent : null
    )
      fieldBottom += node.offsetTop
    const reach = fieldBottom - layer.offsetHeight / 2
    setFieldReach(previous =>
      previous !== null && Math.abs(previous - reach) < 0.5 ? previous : reach,
    )
  })
  useLayoutEffect(() => {
    const node = dialog.current
    if (!present || !node) return
    if (!liquid?.regions) {
      const error = new Error('Presentations require the Satin shared glass renderer.')
      reportGlassError('unsupported-configuration', error, 'presentation')
      throw error
    }
    const ancestor = node.parentElement?.closest('dialog')
    let releaseOpen: (() => void) | undefined
    const open = () => {
      if (lagTraceEnabled())
        lagMark({ stage: 'presentation-requested', at: glassNow(), values: { kind } })
      const initial =
        kind === 'alert'
          ? node.querySelector<HTMLElement>('input:not(:disabled)')
          : kind === 'cover' || kind === 'confirmation'
            ? node.querySelector<HTMLElement>('[data-satin-modal-heading]')
            : node.querySelector<HTMLElement>('.satin-sheet-grabber[role="button"]')
      const releaseModal = openModal(node, { initialFocus: initial })
      const release = retainPresentation()
      const panel = node.querySelector<HTMLElement>('[data-satin-glass-layer]')
      const animated =
        kind === 'sheet' || kind === 'cover'
          ? panel
          : panel?.querySelector<HTMLElement>('[data-satin-glass-effect]')
      const animation =
        animated && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? kind === 'cover'
            ? animateElement(
                animated,
                coverEntranceFrames(animated.getBoundingClientRect().height),
                {
                  duration: COVER_PRESENT_DURATION,
                  easing: 'linear',
                },
              )
            : animateElement(
                animated,
                kind === 'sheet'
                  ? // From just below the screen's bottom edge, wherever the sheet rests.
                    sheetEntranceFrames(
                      Math.max(
                        animated.getBoundingClientRect().height + 8,
                        node.getBoundingClientRect().bottom - animated.getBoundingClientRect().top,
                      ),
                    )
                  : dialogEntranceFrames(kind),
                { duration: 700, easing: 'linear' },
              )
          : undefined
      const dimmer = node.querySelector<HTMLElement>('[data-satin-presentation-dimmer]')
      const dimming =
        animation && dimmer && kind === 'alert'
          ? animateElement(
              dimmer,
              dialogEntranceFrames('alert').map(({ offset, opacity }) => ({ offset, opacity })),
              { duration: 700, easing: 'linear' },
            )
          : undefined
      entrance.current = [animation, dimming].filter((value): value is Animation => Boolean(value))
      if (dimming) void dimming.finished.catch(() => {})
      // WAAPI transforms do not trigger ResizeObserver or style mutations.
      // Keep the shared sampler aligned during motion and repaint at its final frame.
      let sampleFrame = 0
      let glassMotion: PresentationGlassMotion | undefined
      const prepareEntranceMotion = () => {
        // Source preparation settles the safe-area layout first. Sampling at mount
        // would freeze the pre-layout full-height box and retire on its first resize.
        glassMotion =
          kind === 'sheet' && panel && animation
            ? preparePresentationGlassMotion(panel, animation, { retain: true })
            : undefined
        return (
          glassMotion?.start() ??
          Promise.resolve(Number(document.timeline.currentTime ?? performance.now()))
        )
      }
      const startEntranceSampling = () => {
        if (!animation) return
        // Motion flag: backdrop captures wait for the entrance to settle (see ProductionGlassRuntime).
        node.setAttribute('data-satin-presentation-moving', 'entrance')
        const settled = () => {
          cancelAnimationFrame(sampleFrame)
          if (
            entrance.current.includes(animation) &&
            node.getAttribute('data-satin-presentation-moving') === 'entrance'
          )
            node.removeAttribute('data-satin-presentation-moving')
          // Keep the admitted entrance envelope for live contact and release.
        }
        const sample = () => {
          if (glassMotion?.admitted) {
            sampleFrame = 0
            return
          }
          liquid.regions!.invalidate()
          sampleFrame = requestAnimationFrame(sample)
        }
        sampleFrame = requestAnimationFrame(sample)
        void animation.finished.then(() => {
          settled()
          liquid.regions!.invalidate()
        }, settled)
      }
      let canReveal = true
      // An opaque cover with no glass of its own has no scene to wait for.
      const holdsGlass = panel?.querySelector('canvas[data-satin-glass-region-canvas]')
      if (panel && !holdsGlass) startEntranceSampling()
      const releaseGlass =
        panel && holdsGlass
          ? holdPresentationForGlass(
              panel,
              dimmer,
              entrance.current,
              () => liquid.regions!.invalidate(),
              startEntranceSampling,
              () => canReveal && isPresentedRef.current,
              { inert: true, revealStart: kind === 'sheet' ? prepareEntranceMotion : undefined },
            )
          : undefined
      node.dispatchEvent(new Event('satin:modal-open'))
      return () => {
        releaseModal(() => {
          canReveal = false
          releaseGlass?.()
          cancelAnimationFrame(sampleFrame)
          if (panel) disposePresentationGlassMotion(panel)
          animation?.cancel()
          dimming?.cancel()
          entrance.current = []
        })
        release()
        const dismissed = callbacks.current.onDismiss
        queueMicrotask(() => {
          if (!node.isConnected || !node.open) dismissed?.()
        })
      }
    }
    const show = () => {
      releaseOpen ??= open()
    }
    // React mounts child layout effects first. Wait for the parent to enter the
    // top layer before opening a nested dialog above it.
    if (ancestor && !ancestor.open)
      ancestor.addEventListener('satin:modal-open', show, { once: true })
    else show()
    return () => {
      ancestor?.removeEventListener('satin:modal-open', show)
      releaseOpen?.()
    }
  }, [present, liquid?.regions, kind])
  useLayoutEffect(() => {
    const reopening = isPresented && !previouslyPresented.current
    previouslyPresented.current = isPresented
    const node = dialog.current
    if (!reopening || kind !== 'alert' || !node?.open) return
    const target =
      node.querySelector<HTMLElement>('input:not(:disabled)') ??
      node.querySelector<HTMLElement>('[data-satin-modal-heading]')
    if (target && document.activeElement !== target)
      focusFromFramework(target, { preventScroll: true })
  }, [isPresented, kind])
  useLayoutEffect(() => {
    if (!dialog.current) return
    if (!present || (kind !== 'sheet' && kind !== 'cover')) return
    if (grabbedTravel.current && isPresented) {
      grabbedTravel.current = false
      interruptedTravel.current = null
      return
    }
    const interrupted = interruptedTravel.current
    const restoring = isPresented ? interrupted : null
    if (isPresented && !restoring) return
    const node = dialog.current
    const layer = node?.querySelector<HTMLElement>('[data-satin-glass-layer]')
    if (
      !node ||
      !layer ||
      skipDismissalAnimation ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      interruptedTravel.current = null
      if (!isPresented) setRetained(false)
      return
    }
    // Sample before cancelling: an early Done starts at the painted entrance,
    // and reopening starts at the painted dismissal instead of its endpoint.
    const painted = getComputedStyle(layer).transform
    const from =
      interrupted?.offset ??
      (painted && painted !== 'none' ? new DOMMatrixReadOnly(painted).m42 : 0)
    const distance = Math.max(
      1,
      node.getBoundingClientRect().bottom - layer.getBoundingClientRect().top,
    )
    const dimmer = node.querySelector<HTMLElement>('[data-satin-presentation-dimmer]')
    const usesDimmer = dimmer && getComputedStyle(dimmer).display !== 'none'
    const paintedOpacity = Number(
      usesDimmer ? getComputedStyle(dimmer).opacity : getComputedStyle(node, '::backdrop').opacity,
    )
    const opacity = interrupted?.opacity ?? (Number.isFinite(paintedOpacity) ? paintedOpacity : 1)
    const velocity = interrupted?.velocity ?? presentationAnimationVelocity(entrance.current[0])
    interruptedTravel.current = null
    for (const animation of entrance.current) animation.cancel()
    entrance.current = []
    const frames = restoring
      ? presentationReturnFrames(from, opacity, kind, velocity)
      : presentationDismissalFrames(
          distance,
          from,
          opacity,
          kind,
          distance + from > node.getBoundingClientRect().height * 0.75,
          velocity,
        )
    const options: KeyframeAnimationOptions = {
      duration: restoring ? (kind === 'cover' ? COVER_PRESENT_DURATION : 700) : 500,
      easing: 'linear',
      fill: 'both',
    }
    const movement = animateElement(layer, frames.transform, options)
    const dimming = usesDimmer
      ? animateElement(dimmer, frames.dim, options)
      : animateElement(node, frames.dim, { ...options, pseudoElement: '::backdrop' })
    const phase = restoring ? 'entrance' : 'dismissal'
    let completed = false
    let cancelled = false
    const retire = runPresentationMotion({
      layer,
      movement,
      dimming,
      tracksGlass: kind === 'sheet',
      phase,
      invalidate: () => liquid?.regions?.invalidate(),
      complete: () => {
        completed = true
        travel.current = null
        interruptedTravel.current = null
        if (restoring) {
          movement.cancel()
          dimming.cancel()
          node.removeAttribute('data-satin-presentation-moving')
          liquid?.regions?.invalidate()
        } else setRetained(false)
      },
    })
    const stop = () => {
      cancelled = true
      retire()
    }
    travel.current = { movement, cancel: stop }
    return () => {
      if (!completed && !cancelled && node.isConnected) {
        const transform = getComputedStyle(layer).transform
        const offset = transform && transform !== 'none' ? new DOMMatrixReadOnly(transform).m42 : 0
        interruptedTravel.current = {
          offset,
          velocity: presentationAnimationVelocity(movement),
          opacity: Number(
            usesDimmer
              ? getComputedStyle(dimmer).opacity
              : getComputedStyle(node, '::backdrop').opacity,
          ),
        }
      }
      stop()
      if (travel.current?.movement === movement) travel.current = null
      if (node.getAttribute('data-satin-presentation-moving') === phase)
        node.removeAttribute('data-satin-presentation-moving')
      liquid?.regions?.invalidate()
    }
  }, [isPresented, present, kind, liquid?.regions, skipDismissalAnimation])
  useLayoutEffect(() => {
    if (isPresented || !present || (kind !== 'alert' && kind !== 'confirmation')) return
    const node = dialog.current
    const editor = document.activeElement
    if (editable(editor) && node?.contains(editor)) editor.blur()
    const panel = node?.querySelector<HTMLElement>('[data-satin-glass-effect]')
    if (!node || !panel || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setRetained(false)
      return
    }
    // Freeze an interrupted entrance at its painted opacity before cancelling it.
    const paintedOpacity = parseFloat(getComputedStyle(panel).opacity)
    const opacity = Number.isFinite(paintedOpacity) ? paintedOpacity : 1
    // Native dismisses the keyboard alongside the fade, while the alert keeps
    // its last centre rather than following the expanding visual viewport.
    if (topModal(document) === node) focusFromFramework(node, { preventScroll: true })
    for (const animation of entrance.current) animation.cancel()
    entrance.current = []
    // A popover shrinks back into its arrow tip as it fades; an alert keeps its scale.
    const frames = (kind === 'alert' ? alertDismissalFrames() : confirmationDismissalFrames()).map(
      frame => ({
        ...frame,
        opacity: Number(frame.opacity) * opacity,
      }),
    )
    const dimmer =
      kind === 'alert' ? node.querySelector<HTMLElement>('[data-satin-presentation-dimmer]') : null
    const animations = [panel, dimmer]
      .filter((value): value is HTMLElement => Boolean(value))
      .map(target =>
        animateElement(target, frames, {
          duration: kind === 'alert' ? ALERT_DISMISS_DURATION : CONFIRMATION_DISMISS_DURATION,
          easing: 'linear',
          fill: 'both',
        }),
      )
    node.setAttribute('data-satin-presentation-moving', 'dismissal')
    let frame = 0
    let cancelled = false
    const sample = () => {
      liquid?.regions?.invalidate()
      frame = requestAnimationFrame(sample)
    }
    frame = requestAnimationFrame(sample)
    void Promise.all(animations.map(animation => animation.finished)).then(
      () => {
        if (!cancelled) setRetained(false)
      },
      () => {
        if (!cancelled) setRetained(false)
      },
    )
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      for (const animation of animations) animation.cancel()
      if (node.getAttribute('data-satin-presentation-moving') === 'dismissal')
        node.removeAttribute('data-satin-presentation-moving')
      liquid?.regions?.invalidate()
    }
  }, [isPresented, present, kind, liquid?.regions])
  useLayoutEffect(() => {
    if (!isPresented || kind !== 'confirmation') return
    // Resolved once per presentation: the press that opened it, unless the app names an anchor.
    const target = anchor?.current ?? presentationSource(document, performance.now())
    const update = () => {
      if (!target?.isConnected) {
        setAnchorRect(null)
        return
      }
      const rect = target.getBoundingClientRect()
      setAnchorRect(rect)
      setAnchorInBar(!!target.closest('[data-satin-toolbar-item]'))
    }
    const panel = dialog.current?.querySelector<HTMLElement>('[data-satin-glass-effect]')
    const measure = () => {
      if (panel) setSurfaceHeight(panel.offsetHeight)
    }
    const observer = new ResizeObserver(measure)
    if (panel) observer.observe(panel)
    measure()
    update()
    window.addEventListener('resize', update)
    document.addEventListener('scroll', update, true)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
      document.removeEventListener('scroll', update, true)
    }
  }, [isPresented, wide, kind, anchor])
  if (!present) return null
  const fillsScreen = placement?.kind === 'fill'
  const sheet = sheetFrame(geometry.layoutViewport.width, expansion, 0, placement)
  const plainSurface = kind === 'cover' || fillsScreen
  const popover =
    kind === 'confirmation'
      ? confirmationPopoverFrame(anchorRect, anchorInBar, surfaceHeight, {
          width: geometry.layoutViewport.width,
          top: geometry.insets.top,
          bottom: viewportHeight - (keyboard.visible ? 0 : geometry.insets.bottom),
        })
      : null
  const width =
    kind === 'cover'
      ? geometry.layoutViewport.width
      : kind === 'sheet'
        ? sheet.width
        : popover
          ? CONFIRMATION_POPOVER_WIDTH
          : Math.min(geometry.safeFrame.width - 32, 320)
  const left = popover ? popover.left : (geometry.layoutViewport.width - width) / 2
  const bottom = kind === 'cover' ? 0 : kind === 'sheet' ? sheet.bottom : undefined
  const Title = kind === 'alert' ? 'p' : 'h2'
  const heading = (
    <Title
      id={titleId}
      tabIndex={-1}
      style={kind === 'alert' ? { fontWeight: 'bold' } : undefined}
      data-satin-modal-heading="true"
      className="satin-presentation-title"
      data-satin-sheet-label-only={navigationChrome || kind === 'cover' ? true : undefined}
    >
      {title}
    </Title>
  )
  return (
    <dialog
      ref={dialog}
      tabIndex={-1}
      className="satin-presentation"
      style={
        {
          '--satin-status-band-frame-height': `${geometry.layoutViewport.height}px`,
          '--satin-presentation-dim-ramp': `${Math.max(0, geometry.physicalInsets.top - geometry.insets.top)}px`,
        } as CSSProperties
      }
      data-satin-presentation={kind}
      data-satin-presentation-fill={
        fillsScreen ? 'screen' : placement?.kind === 'form' ? 'form' : undefined
      }
      role={kind === 'alert' ? 'alertdialog' : 'dialog'}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={describedBy}
      onCancel={event => {
        event.stopPropagation()
        event.preventDefault()
        if (!dismissDisabled) callbacks.current.onPresentedChange(false)
      }}
      onPointerDown={event => {
        event.stopPropagation()
        outsidePress.current =
          event.target === event.currentTarget ? { x: event.clientX, y: event.clientY } : null
        // A sheet's dimmed area dismisses on a tap (onClick below), not on touch-down.
        if (outsidePress.current && kind === 'confirmation' && !dismissDisabled)
          callbacks.current.onPresentedChange(false)
      }}
      onClick={event => {
        // A finger that lands just above the sheet's edge and drags is not a tap: no dismissal.
        // Measured on the iPad: WebKit retargets the click of a tap that went down on the dimmed
        // area 3 pt outside the grabber reach onto the reach. The press decides, not the click.
        const onDimmedArea =
          event.target === event.currentTarget ||
          (event.target as Element).hasAttribute('data-satin-sheet-grabber-reach')
        const tappedOutside = outsidePress.current !== null && onDimmedArea
        outsidePress.current = null
        if (tappedOutside && kind === 'sheet' && !dismissDisabled)
          callbacks.current.onPresentedChange(false)
      }}
      onPointerMove={event => {
        event.stopPropagation()
        // A mouse, trackpad or pencil drag still ends in a click: travel makes it a drag.
        const press = outsidePress.current
        if (
          press &&
          Math.hypot(event.clientX - press.x, event.clientY - press.y) > OUTSIDE_TAP_SLOP
        )
          outsidePress.current = null
      }}
      onPointerUp={event => event.stopPropagation()}
      onPointerCancel={event => event.stopPropagation()}
    >
      {/* Confirmation dialogs are undimmed natively (12e); only sheets and alerts dim the clock band. */}
      {(kind === 'sheet' || kind === 'alert') && (
        <div role="presentation" data-satin-status-band-source="dimmer">
          <span data-satin-presentation-dimmer="true" />
        </div>
      )}
      <PresentationGlassBoundary>
        <GlassLayer
          attachment="fixed"
          depth={1000}
          style={{
            width,
            left,
            bottom,
            top: popover ? popover.top : bottom === undefined ? center : undefined,
            transform: bottom === undefined && !popover ? 'translateY(-50%)' : undefined,
          }}
        >
          {plainSurface ? (
            // A cover (and a sheet filling the screen) is the opaque system background with no
            // material of its own; nested glass still has its layer.
            <div
              {...sheetGestureHandlers}
              className="satin-presentation-surface"
              style={{ height: height ?? geometry.layoutViewport.height }}
            >
              {heading}
              {children}
            </div>
          ) : (
            <GlassEffect
              {...sheetGestureHandlers}
              glass={
                kind === 'sheet'
                  ? opaque
                    ? Glass.expandedSheet
                    : Glass.sheet
                  : kind === 'alert'
                    ? Glass.alert
                    : Glass.confirmation
              }
              shape={{
                kind: 'roundedRectangle',
                cornerRadius: 36,
                cornerStyle: 'continuous',
                ...(kind === 'sheet'
                  ? sheetCornerShape(
                      sheet,
                      placement,
                      geometry.layoutViewport,
                      geometry.screen,
                      readDisplayCornerMetrics(),
                    )
                  : {}),
              }}
              className="satin-presentation-surface"
              inert={kind === 'alert' && !isPresented}
              style={
                {
                  '--satin-sheet-content-scale': kind === 'sheet' ? sheet.contentScale : 1,
                  // Native grows the popover out of its arrow tip, or out of a toolbar button.
                  transformOrigin: popover?.origin
                    ? `${popover.origin.x}px ${popover.origin.y}px`
                    : undefined,
                  // The renderer draws the arrow in the body's own field (regionBridge).
                  '--satin-popover-arrow': popover?.arrow
                    ? `${popover.arrow.edge} ${popover.arrow.x}`
                    : undefined,
                  height,
                  maxHeight:
                    (kind === 'sheet' ? geometry.layoutViewport.height : viewportHeight) -
                    geometry.insets.top,
                } as CSSProperties
              }
            >
              {kind === 'confirmation' || kind === 'alert' ? (
                // Material canvases include a diffusion margin outside the card. Keep them out
                // of the content scrollport: otherwise even a short alert gains scrollable space
                // and scrolling moves the material along with its text.
                <div className="satin-presentation-scroll">
                  {heading}
                  {children}
                </div>
              ) : (
                <>
                  {heading}
                  {children}
                </>
              )}
            </GlassEffect>
          )}
          {kind === 'sheet' && !fillsScreen && sheetGestureHandlers && (
            // The native grabber's touch target reaches above the sheet's top edge (styles.css has
            // the measured size). A drag from there pans the sheet; a tap is the grabber's action.
            <div
              {...sheetGestureHandlers}
              aria-hidden="true"
              data-satin-sheet-grabber-reach="true"
              onClick={event => {
                // The gesture handlers cancel the click that ends a drag (onClickCapture). A press
                // that began on the dimmed area is the dialog's tap, wherever its click lands.
                if (!event.defaultPrevented && outsidePress.current === null) sheetGrabberAction?.()
              }}
            />
          )}
        </GlassLayer>
      </PresentationGlassBoundary>
    </dialog>
  )
}
