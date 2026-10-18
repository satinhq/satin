import { resetSwipeFace, showSwipeFace, swipeGeometryAnimations } from './swipeFace.ts'
import { swipeContactResponse } from './swipeSpring.ts'
import { swipeRowLayout } from './swipeRowLayout.ts'
import { markRowSwipeRemoval } from '../list-form/rowMotion.ts'
import { cancelOnNativeScroll } from '../scroll/nativeScroll.ts'
import { SymbolImage } from '../symbols/Symbol.tsx'
import {
  createRowScrub,
  rowSwipeShouldClose,
  rowSwipeRaw,
  primaryParts,
  presentedTakeover,
  swipeActionTracks,
  swipeContentTrack,
  swipeOpenWidth,
  swipeWidths,
  updateRowCorners,
} from './rowScrub.ts'
import { createFullSwipeContact, type FullSwipeContact } from './fullSwipeContact.ts'
import { CONTEXT_HOLD_MS, CONTEXT_STILL_MS } from './contextMotion.ts'
import { contextPreviewSource } from './preview.ts'
import { listenForRowTouches } from './rowTouchDelegate.ts'
import { useMenuPresenter } from '../glass/menuPresenter.tsx'
import { advanceCommittedSwipe, settleSwipe } from './motion.ts'
import { withAnimation } from '../motion/matchedGeometry.tsx'
import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { ListItemContext, type RowActionsDelegation } from '../list-form/editing.tsx'
import {
  reduceGestureArena,
  type GestureArenaSession,
  type NormalizedPointerSample,
} from '../gestures/arena.ts'
import { cancelPointerPressForOwnedGesture } from '../press/gestureArbitration.ts'
import { armPointerClickSuppression } from '../press/activation.ts'
import { Pressable } from '../press/Pressable.tsx'
import { createRowArena, rowBlocksNativeBack, rowCanPop } from './recognizers.ts'
import {
  nativeScrubSourceLiveAt,
  releaseNativeScrubClamp,
  retireNativeScrubSource,
} from '../navigation/motion.ts'
import {
  swipeEdge,
  contextDefinition,
  type ActionItem,
  type SwipeActionItem,
  type RowActionsProps,
  type SwipeActionsConfiguration,
  type SwipeActions,
} from './types.ts'

// Native phone HID bounds: 35pt closes / 40pt opens; 300ms cancels / 400ms opens.
// Hold time is bounded by the native phone probe. Recognition/slop (10pt),
// rubber-banding and width-scaled full swipe are uncalibrated assumptions.
const calibration = { claimDistance: 10, holdMilliseconds: CONTEXT_HOLD_MS, holdSlop: 10 }
const openRows = new WeakMap<Document, () => void>()
/** Recentre the row's scroll source and stop UIKit's deceleration, exactly as the
 * navigation source is retired. Recentring alone lets momentum carry the source up
 * to its range edge (two row widths), where the next contact cannot scroll. */
function retireRowSource(source: HTMLElement | null) {
  if (source) retireNativeScrubSource(source, source.clientWidth * 2)
}
/** Pill takeover each tray presents when a new contact catches the row. */
function caughtTakeovers(element: HTMLElement, initial: number) {
  const caught = (side: 'leading' | 'trailing') => {
    const primary = element.querySelector<HTMLElement>(
      `[data-satin-swipe-tray="${side}"] > :first-child`,
    )
    return primary ? presentedTakeover(primary, initial) : 0
  }
  return { leading: caught('leading'), trailing: caught('trailing') }
}
type RowActionsEngineProps = RowActionsProps & {
  children: ReactNode
  disabled?: boolean
  content?: boolean
  controller?: RowActionsController
}

/** Lets a list item open its row's trailing actions, as tapping the editing delete control does. */
export type RowActionsController = { current?: { revealTrailing(): void } }

function RowActionsEngine({
  children,
  swipeActions,
  contextMenu,
  disabled = false,
  content = false,
  controller,
}: RowActionsEngineProps) {
  const host = useRef<HTMLDivElement>(null),
    body = useRef<HTMLDivElement>(null)
  const scrollSource = useRef<HTMLDivElement>(null)
  const scrub = useRef<ReturnType<typeof createRowScrub>>(undefined)
  const liftTarget = useRef<HTMLElement | null>(null)
  const preserveLift = useRef(false)
  const finishLift = useCallback(() => {
    liftTarget.current = null
  }, [])
  // Zero is the logical closed target, not a change of painted edge. Keep the
  // last side while its WAAPI close runs; otherwise a trailing tray disappears
  // at release (iPad swipe-parity r15, tap-close) instead of shrinking/fading.
  const [{ offset, paintedSide }, setSwipeState] = useState({
    offset: 0,
    paintedSide: 'leading' as 'leading' | 'trailing',
  })
  const setOffset = useCallback((next: number) => {
    // During a contact the scrub owns this attribute, including a reversal that
    // closes without ever reaching a settled, nonzero React offset.
    const side =
      next === 0 ? host.current?.dataset.satinSwipeSide : next > 0 ? 'leading' : 'trailing'
    setSwipeState(previous => {
      const paintedSide = side === 'leading' || side === 'trailing' ? side : previous.paintedSide
      return previous.offset === next && previous.paintedSide === paintedSide
        ? previous
        : { offset: next, paintedSide }
    })
  }, [])
  const definition = contextMenu ? contextDefinition(contextMenu) : undefined
  const presenter = useMenuPresenter({
    label: 'Actions',
    actions: definition?.actions ?? [],
    disabled,
    preview: definition?.preview,
  })
  const presenterRef = useRef(presenter)
  presenterRef.current = presenter
  const open = presenter.open
  useLayoutEffect(() => {
    if (!open) finishLift()
  }, [open, finishLift])
  const live = useRef({ offset: 0, open: false }),
    props = useRef({ swipeActions, contextMenu, disabled })
  useLayoutEffect(() => {
    props.current = { swipeActions, contextMenu, disabled }
    live.current.open = open
  }, [swipeActions, contextMenu, disabled, open])
  useLayoutEffect(() => {
    // Context-only rows have no swipe labels or scroll source to size. Reading
    // every message here interleaves layout flushes with the preceding row's
    // writes, and observing each bubble repeats that work as its text grows.
    if (
      !swipeEdge(swipeActions, 'leading').actions.length &&
      !swipeEdge(swipeActions, 'trailing').actions.length
    )
      return
    const element = host.current
    const content = body.current
    if (!element || !content) return
    const layout = () => {
      const bounds = content.getBoundingClientRect()
      updateRowCorners(content, bounds.width, bounds.height, swipeActions)
      // Single-line native List rows put the label inside the capsule. Taller
      // rows retain the measured icon capsule with its caption below.
      const { inline, capsuleHeight, minimumButtonWidth } = swipeRowLayout(bounds.height)
      element.dataset.satinSwipeLabelLayout = inline ? 'inline' : 'below'
      element.querySelectorAll<HTMLElement>('[data-satin-swipe-tray]').forEach(tray => {
        tray.style.setProperty('--satin-swipe-capsule-height', `${capsuleHeight}px`)
        let width = minimumButtonWidth
        if (inline) {
          tray.querySelectorAll<HTMLElement>('[data-satin-swipe-label]').forEach(label => {
            const parts = [...label.children] as HTMLElement[]
            // Layout widths exclude the reveal/full-swipe transform. A parent
            // rerender while an action is scaled must not shrink its next target.
            const ink = parts.reduce(
              (sum, part) => sum + (Number.parseFloat(getComputedStyle(part).width) || 0),
              0,
            )
            // iPad stock List, swipe-parity r17 static UIKit calibration:
            // inline content uses a 4pt gap and about 15pt capsule insets.
            const gap = Number.parseFloat(getComputedStyle(label).columnGap) || 0
            width = Math.max(width, Math.ceil(ink + Math.max(0, parts.length - 1) * gap + 30))
          })
        }
        tray.style.setProperty('--satin-swipe-button-width', `${width}px`)
      })
    }
    layout()
    const observer = new ResizeObserver(layout)
    observer.observe(content)
    element.querySelectorAll('[data-satin-swipe-label] > *').forEach(part => observer.observe(part))
    return () => observer.disconnect()
  }, [swipeActions])
  const performing = useRef(false)
  const close = useCallback(() => {
    if (performing.current) return
    scrub.current?.cancel()
    scrub.current = undefined
    if (host.current?.dataset.satinRowSwipe && scrollSource.current)
      scrollSource.current.scrollLeft = scrollSource.current.clientWidth * 2
    live.current.offset = 0
    if (live.current.open) presenterRef.current.close()
    live.current.open = false
    setOffset(0)
    if (host.current) {
      delete host.current.dataset.satinRowScrubbing
      resetSwipeFace(host.current)
      delete host.current.dataset.satinSwipeActive
      delete host.current.dataset.satinContextPending
    }
    if (!preserveLift.current) finishLift()
    if (body.current) {
      body.current.getAnimations?.().forEach(animation => animation.cancel())
      body.current.style.transform = ''
      body.current.style.borderRadius = ''
      body.current.style.clipPath = ''
    }
    host.current?.querySelectorAll<HTMLElement>('[data-satin-swipe-action]').forEach(button => {
      button.getAnimations?.().forEach(animation => animation.cancel())
      button.style.transform = ''
      button.style.opacity = ''
      primaryParts(button).forEach(part => {
        part.getAnimations?.().forEach(animation => animation.cancel())
        part.style.transform = ''
        part.style.opacity = ''
      })
    })
  }, [finishLift])
  const dismissSwipe = useCallback(
    (releasedAt = performance.now()) => {
      const element = host.current
      const content = body.current
      if (!element || !content || performing.current || live.current.open) return
      // Sample once at the boundary; WAAPI owns all subsequent close frames.
      const from = content.getBoundingClientRect().left - element.getBoundingClientRect().left
      scrub.current?.cancel()
      scrub.current = undefined
      // The swipe is no longer open while its paint returns. Outside contacts
      // must reach their own controls and must not restart this close animation.
      live.current.offset = 0
      setOffset(0)
      const side = from >= 0 ? 'leading' : 'trailing'
      const edge = swipeEdge(props.current.swipeActions, side)
      const animation = settleSwipe(
        content,
        from,
        0,
        0,
        element.querySelector<HTMLElement>(`[data-satin-swipe-tray="${side}"] > :first-child`) ??
          undefined,
        swipeOpenWidth(edge.actions.length, swipeWidths(element)[side]),
        true,
        element.getBoundingClientRect().width,
        edge.allowsFullSwipe,
        { time: releasedAt, kind: 'tap' },
      )
      if (animation) void animation.finished.then(close, () => {})
      else close()
    },
    [close],
  )
  const perform = useCallback(
    (
      action: SwipeActionItem,
      direction = live.current.offset,
      fullSwipe = false,
      releasedAt?: number,
    ) => {
      if (performing.current || props.current.disabled || action.disabled) return
      if (!direction && !fullSwipe) {
        // Accessible/menu actions can open another presentation. Dismiss the old
        // one before calling out, so cleanup cannot close the newly opened menu.
        close()
        withAnimation(() => action.onPress?.())
        return
      }
      const element = host.current
      const content = body.current
      if (!element || !content) return
      performing.current = true
      const width = element.getBoundingClientRect().width
      const side = direction >= 0 ? 'leading' : 'trailing'
      const edge = swipeEdge(props.current.swipeActions, side)
      const primary =
        element.querySelector<HTMLElement>(`[data-satin-swipe-tray="${side}"] > :first-child`) ??
        undefined
      // Call out synchronously in the committing input event, before settling.
      // WebKit may still deny media activation after a drag; never defer this
      // callback to an animation completion to try to manufacture activation.
      // The data change, not the action's tint/role, determines
      // whether List retains this cell as a departing paint layer.
      const clearRemoval = fullSwipe ? markRowSwipeRemoval(element) : undefined
      try {
        withAnimation(() => action.onPress?.())
      } catch (error) {
        performing.current = false
        close()
        throw error
      } finally {
        clearRemoval?.()
      }
      performing.current = false
      const removed = !element.isConnected || element.closest('[data-satin-row-exit]') !== null
      if (removed) {
        if (fullSwipe && element.isConnected) {
          advanceCommittedSwipe(content, direction, width, primary, edge.allowsFullSwipe)
        }
        return
      }
      if (!direction) {
        close()
        return
      }
      live.current.offset = 0
      setOffset(0)
      // A surviving row returns through the same measured release path as a
      // partial swipe. A new contact can cancel that run and catch its pose.
      const animation = settleSwipe(
        content,
        direction,
        0,
        0,
        primary,
        swipeOpenWidth(edge.actions.length, swipeWidths(element)[side]),
        true,
        width,
        edge.allowsFullSwipe,
        releasedAt === undefined ? undefined : { time: releasedAt, kind: 'commit' },
      )
      if (animation) void animation.finished.then(close, () => {})
      else close()
    },
    [close],
  )
  const claim = useCallback(() => {
    const document = host.current!.ownerDocument
    const previous = openRows.get(document)
    if (previous !== close) previous?.()
    openRows.set(document, close)
  }, [close])
  const show = useCallback(
    (target?: Element, contact?: NormalizedPointerSample & { touchId?: number }) => {
      if (!props.current.disabled && props.current.contextMenu) {
        const source = liftTarget.current || contextPreviewSource(host.current!, target)
        preserveLift.current = true
        close()
        preserveLift.current = false
        claim()
        live.current.open = true
        presenterRef.current.show({ kind: 'context', element: source, contact })
      }
    },
    [claim, close],
  )
  useLayoutEffect(() => {
    if (!controller) return
    controller.current = {
      // The settled open pose a released swipe reaches, entered from rest.
      revealTrailing() {
        const element = host.current
        const content = body.current
        if (!element || !content || performing.current) return
        const edge = swipeEdge(props.current.swipeActions, 'trailing')
        if (!edge.actions.length) return
        claim()
        const openWidth = swipeOpenWidth(edge.actions.length, swipeWidths(element).trailing)
        element.dataset.satinSwipeSide = 'trailing'
        element.dataset.satinSwipeActive = 'true'
        showSwipeFace(element, performance.now())
        live.current.offset = -openWidth
        setOffset(-openWidth)
        settleSwipe(
          content,
          0,
          -openWidth,
          0,
          element.querySelector<HTMLElement>('[data-satin-swipe-tray="trailing"] > :first-child') ??
            undefined,
          openWidth,
          true,
          element.getBoundingClientRect().width,
          edge.allowsFullSwipe,
        )
      },
    }
    return () => {
      controller.current = undefined
    }
  })
  useEffect(() => {
    if (!offset && !open) return
    const element = host.current!,
      document = element.ownerDocument
    // Revealed swipe actions are not a modal menu. Dismiss without consuming
    // the contact, so another row or toolbar control acts on this same tap.
    const outside = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0 || live.current.open || !live.current.offset)
        return
      if (event.target instanceof Node && element.contains(event.target)) return
      dismissSwipe()
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !live.current.open && live.current.offset) {
        event.preventDefault()
        dismissSwipe()
      }
    }
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('keydown', escape)
    const scroll = (event: Event) => {
      if (presenterRef.current.ownsContact()) return
      if (
        event.target instanceof Element &&
        event.target.matches('[data-satin-scroll]') &&
        event.target.contains(element)
      )
        close()
    }
    document.addEventListener('scroll', scroll, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('keydown', escape)
      document.removeEventListener('scroll', scroll, true)
      window.removeEventListener('resize', close)
    }
  }, [offset, open, close, dismissSwipe])
  useLayoutEffect(() => {
    const element = host.current!
    const scrollOwner = element.closest<HTMLElement>('[data-satin-scroll]')
    let releaseScrollCancellation: (() => void) | undefined
    const releaseScroll = () => {
      releaseScrollCancellation?.()
      releaseScrollCancellation = undefined
    }
    let arena: ReturnType<typeof createRowArena> | undefined,
      session: GestureArenaSession | undefined
    let preparationTimer: ReturnType<typeof setTimeout> | undefined
    let timer: ReturnType<typeof setTimeout> | undefined,
      pointerId: number | undefined,
      touchId: number | undefined
    let captureOwner: Element | undefined
    const capture = (target: Element, id: number) => {
      captureOwner = target
      target.setPointerCapture?.(id)
    }
    let navigationOwns = false
    // Native drags an open row from its action buttons too; their taps stay presses.
    let startedOnAction = false
    let rowWidth = 0,
      rowLeft = 0
    // One contact maps raw travel to the presented row for the scroll source and
    // for this touch fallback alike, including a destructive takeover's anchor.
    let contact: FullSwipeContact | undefined
    let cachedSide: 'leading' | 'trailing' = 'trailing'
    let cachedActions: ReturnType<typeof swipeActionTracks> = []
    let fallbackRaw = 0,
      fallbackFrame = 0
    const cancelFallbackFrame = () => {
      cancelAnimationFrame(fallbackFrame)
      fallbackFrame = 0
    }
    let contentFrame: ReturnType<typeof swipeContentTrack> | undefined
    let initial = 0,
      current = 0,
      owned = false,
      last: NormalizedPointerSample | undefined
    const clearTimer = () => {
      clearTimeout(preparationTimer)
      preparationTimer = undefined
      clearTimeout(timer)
      timer = undefined
      delete element.dataset.satinContextPending
    }
    /** Present the touch-fallback row and pills from one raw sample. A takeover's
     * jump keeps moving without input, so it presents further frames itself. */
    const paintFallback = (raw: number, now: number, evaluate: boolean) => {
      if (!contact) return current
      fallbackRaw = raw
      const position = contact.present(raw, now, evaluate)
      const takeover = contact.takeover(cachedSide, raw, now)
      for (const action of cachedActions)
        Object.assign(action.element.style, action.frame(position, raw, initial ? 1 : 0, takeover))
      if (body.current && contentFrame)
        Object.assign(body.current.style, contentFrame(position, initial ? 1 : 0))
      current = position
      live.current.offset = position
      if (evaluate && !fallbackFrame && contact.settling(now))
        fallbackFrame = requestAnimationFrame(time => {
          fallbackFrame = 0
          if (session && !scrub.current) paintFallback(fallbackRaw, time, true)
        })
      return position
    }
    const cancelPress = () => {
      if (pointerId !== undefined) cancelPointerPressForOwnedGesture(pointerId)
      armPointerClickSuppression(performance.now())
    }
    const consume = (sample: NormalizedPointerSample, event?: Event) => {
      if (!arena) return
      if (props.current.disabled) {
        clearTimer()
        arena = undefined
        session = undefined
        releaseScroll()
        close()
        return
      }
      const previous = last
      last = sample
      contact?.track(sample.x - rowLeft, sample.time, sample.phase === 'end')
      session = reduceGestureArena(arena, session, sample).session
      if (!session) return
      // Transfer capture before canceling the child Pressable, which releases its own capture.
      // A subsequent lostcapture from that old owner must not cancel this contact.
      if (
        captureOwner &&
        pointerId !== undefined &&
        captureOwner !== element &&
        (session.recognizers['row-swipe'].state === 'recognized' ||
          session.recognizers['context-hold'].state === 'recognized')
      )
        capture(element, pointerId)
      if (
        session.recognizers.press.state === 'failed' ||
        session.recognizers.press.state === 'canceled'
      )
        cancelPress()
      if (session.recognizers['interactive-pop'].state === 'recognized' && scrub.current) {
        navigationOwns = true
        scrub.current.cancel()
        scrub.current = undefined
        if (body.current) body.current.style.transform = `translate3d(${initial}px,0,0)`
      }
      const swipe = session.recognizers['row-swipe'].state === 'recognized'
      if (swipe) contact?.recognize()
      const hold = session.recognizers['context-hold'].state === 'recognized'
      if (
        !hold &&
        ['failed', 'canceled'].includes(session.recognizers['context-hold'].state) &&
        element.dataset.satinContextPending
      ) {
        clearTimer()
        finishLift()
        presenterRef.current.cancelPreparation()
        delete element.dataset.satinContextPending
      }
      if (swipe || hold) {
        if (!owned) {
          owned = true
          cancelPress()
          claim()
          if (hold) {
            clearTimer()
            show(undefined, { ...sample, touchId })
            arena = undefined
            session = undefined
            releaseScroll()
            touchId = undefined
            return
          } else {
            element.dataset.satinSwipeActive = 'true'
            if (scrub.current) element.dataset.satinRowScrubbing = 'true'
            element.dataset.satinSwipeSide = sample.x >= session.start.x ? 'leading' : 'trailing'
            const primary = element.querySelector<HTMLElement>(
              `[data-satin-swipe-tray="${element.dataset.satinSwipeSide}"] > :first-child`,
            )
            const side = element.dataset.satinSwipeSide === 'leading' ? 'leading' : 'trailing'
            const edge = swipeEdge(props.current.swipeActions, side)
            cachedSide = side
            cachedActions =
              primary && !scrub.current
                ? swipeActionTracks(primary, edge.actions.length, rowWidth, edge.allowsFullSwipe)
                : []
            if (event instanceof PointerEvent && !scrub.current) capture(element, event.pointerId)
          }
        }
        if (event?.cancelable && (!scrub.current || hold)) event.preventDefault()
        // Navigation receives start/end to clear its bookkeeping, but no row-owned moves.
        if (sample.phase === 'move') event?.stopPropagation()
        if (swipe) {
          const raw =
            rowSwipeRaw(initial, rowWidth, props.current.swipeActions, swipeWidths(element)) +
            sample.x -
            session.start.x
          // A lift-off sample is presented but never evaluated: release reads the
          // takeover already observed during contact.
          if (scrub.current) {
            if (sample.phase === 'move')
              contact?.observe(scrub.current.rawPosition(), performance.now())
            current = scrub.current.position()
            live.current.offset = current
          } else paintFallback(raw, sample.time, sample.phase === 'move')
          // The face fades in from pan recognition (25pt), not from WebKit
          // ownership (about 10pt): a slow stroke crosses them 125ms apart.
          const recognizedAt = contact?.recognizedAt()
          if (recognizedAt !== undefined) showSwipeFace(element, recognizedAt)
        }
      }
      if (sample.phase === 'end' && initial !== 0 && !owned && !startedOnAction) {
        cancelPress()
        dismissSwipe(sample.time)
      }
      if (sample.phase === 'end' || sample.phase === 'cancel') {
        clearTimer()
        cancelFallbackFrame()
        if (owned) cancelPress()
        if (swipe && sample.phase === 'end') {
          const released = scrub.current?.flush(performance.now(), false)
          const releaseRaw =
            released?.raw ??
            rowSwipeRaw(initial, rowWidth, props.current.swipeActions, swipeWidths(element)) +
              sample.x -
              session.start.x
          if (scrub.current) {
            current = released!.position
            scrub.current.cancel()
            scrub.current = undefined
            retireRowSource(scrollSource.current)
            if (body.current) body.current.style.transform = `translate3d(${current}px,0,0)`
          }
          delete element.dataset.satinRowScrubbing
          element.dataset.satinSwipeSide = current >= 0 ? 'leading' : 'trailing'
          const edge = swipeEdge(props.current.swipeActions, current >= 0 ? 'leading' : 'trailing')
          const actions = edge.actions
          const first = actions[0]
          // The same rule that drives the takeover while held: a distance threshold,
          // or a destructive takeover observed before lift-off. Native closes a
          // leading three-action row dragged back from 295pt.
          if (first && contact?.armed(releaseRaw)) perform(first, current, true, sample.time)
          else {
            const from = current
            // Native closes a destructive takeover that was reversed out of its zone.
            // That close starts far across the row, so its pills stay and shrink
            // with it, as when an open row is dismissed, until it reaches rest.
            const anchoredClose = !!contact?.anchored()
            const closes =
              anchoredClose || rowSwipeShouldClose(initial, current, sample.x - session.start.x)
            current = !closes
              ? Math.sign(current) *
                swipeOpenWidth(
                  actions.length,
                  swipeWidths(element)[current >= 0 ? 'leading' : 'trailing'],
                )
              : 0
            if (!anchoredClose) element.dataset.satinSwipeActive = String(current !== 0)
            live.current.offset = current
            setOffset(current)
            const settling =
              body.current &&
              settleSwipe(
                body.current,
                from,
                current,
                contact?.velocity() ??
                  (previous
                    ? (sample.x - previous.x) /
                      Math.max(0.001, (sample.time - previous.time) / 1000)
                    : 0),
                element.querySelector<HTMLElement>(
                  `[data-satin-swipe-tray="${from >= 0 ? 'leading' : 'trailing'}"] > :first-child`,
                ) ?? undefined,
                swipeOpenWidth(
                  actions.length,
                  swipeWidths(element)[current >= 0 ? 'leading' : 'trailing'],
                ),
                initial !== 0,
                rowWidth,
                edge.allowsFullSwipe,
                { time: sample.time, kind: 'drag' },
              )
            if (anchoredClose) {
              if (settling) void settling.finished.then(close, () => {})
              else close()
            }
          }
        } else if (sample.phase === 'cancel' && !hold && !navigationOwns) close()
        else if (!hold && !owned) {
          // An unclaimed contact (a tap, a vertical pan) also hands the source back retired.
          if (scrub.current) retireRowSource(scrollSource.current)
          scrub.current?.cancel()
          scrub.current = undefined
        }
        session = undefined
        releaseScroll()
        arena = undefined
        touchId = undefined
      }
    }
    const start = (
      id: number,
      x: number,
      y: number,
      time: number,
      target: Element,
      nativeTouch = false,
    ) => {
      if (props.current.disabled || performing.current) return
      const rect = element.getBoundingClientRect()
      rowWidth = rect.width
      rowLeft = rect.left
      cancelFallbackFrame()
      contentFrame = body.current ? swipeContentTrack(body.current) : undefined
      navigationOwns = false
      startedOnAction = !!target.closest('[data-satin-swipe-action]')
      const animations = body.current ? swipeGeometryAnimations(body.current) : []
      // A new contact takes over the presented pose, not the old spring's target.
      initial =
        animations.length && body.current
          ? body.current.getBoundingClientRect().left - rect.left
          : live.current.offset
      // Snapshot all presented action poses before canceling or writing any
      // effect. Interleaving those operations forces style resolution per part.
      const caughtParts = [
        ...element.querySelectorAll<HTMLElement>('[data-satin-swipe-action]'),
      ].flatMap(button =>
        [button, ...primaryParts(button)].flatMap(part => {
          const running = part.getAnimations?.() ?? []
          if (!running.length) return []
          const style = getComputedStyle(part)
          return [{ part, running, transform: style.transform, opacity: style.opacity }]
        }),
      )
      animations.forEach(animation => animation.cancel())
      for (const { part, running, transform, opacity } of caughtParts) {
        running.forEach(animation => animation.cancel())
        part.style.transform = transform
        part.style.opacity = opacity
      }
      if (body.current && animations.length)
        body.current.style.transform = `translate3d(${initial}px,0,0)`
      scrub.current?.cancel()
      // A new contact starts a new mapping: catching a settling row never inherits
      // the previous contact's anchor, only its presented pose and pill takeover.
      if (initial === 0) resetSwipeFace(element)
      contact = createFullSwipeContact({
        width: rowWidth,
        configuration: props.current.swipeActions,
        widths: swipeWidths(element),
        inline: element.dataset.satinSwipeLabelLayout === 'inline',
        caught: initial ? caughtTakeovers(element, initial) : undefined,
        reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
        now: performance.now(),
        trackingResponse: swipeContactResponse,
        presentedPosition: initial,
        origin: initial === 0 ? { finger: x - rowLeft, offset: 0, time } : undefined,
      })
      // A contact that touched down before the retired source re-armed cannot scroll
      // it; the touch path drives that contact while the clamp holds the source.
      const sourceLive =
        nativeTouch &&
        element.dataset.satinRowCompositor === 'true' &&
        !rowBlocksNativeBack(target) &&
        nativeScrubSourceLiveAt(scrollSource.current, time)
      if (sourceLive && scrollSource.current) releaseNativeScrubClamp(scrollSource.current)
      scrub.current =
        sourceLive && scrollSource.current && body.current
          ? createRowScrub(
              element,
              scrollSource.current,
              body.current,
              initial,
              rowWidth,
              props.current.swipeActions,
              contact,
            )
          : undefined
      live.current.offset = initial
      current = initial
      owned = false
      arena = createRowArena(rect, {
        canPop: rowCanPop(target, x),
        leading: !!swipeEdge(props.current.swipeActions, 'leading').actions.length || initial < 0,
        trailing: !!swipeEdge(props.current.swipeActions, 'trailing').actions.length || initial > 0,
        context: !!props.current.contextMenu && !startedOnAction,
        calibration,
      })
      consume({ kind: 'pointer', phase: 'start', pointerId: id, isPrimary: true, x, y, time })
      releaseScroll()
      if (scrollOwner && session?.status === 'active')
        releaseScrollCancellation = cancelOnNativeScroll(scrollOwner, nativeScroll)
      clearTimer()
      if (props.current.contextMenu && initial === 0 && body.current) {
        element.dataset.satinContextPending = 'true'
        // Preserve the original touch clock. A stationary hold prepares before
        // its measured lift begins; a directional gesture never mounts the menu.
        preparationTimer = setTimeout(() => {
          preparationTimer = undefined
          if (!session || session.status !== 'active' || props.current.disabled) return
          const source = contextPreviewSource(element, target)
          liftTarget.current = source
          presenterRef.current.prepare(
            { kind: 'context', element: source },
            pointerId,
            performance.timeOrigin + time,
          )
        }, CONTEXT_STILL_MS)
      }
      timer = setTimeout(() => {
        if (last && session?.status === 'active')
          consume({ ...last, phase: 'move', time: time + calibration.holdMilliseconds })
      }, calibration.holdMilliseconds)
    }
    const pointerDown = (event: PointerEvent) => {
      const target = event.target as Element
      if (!event.isPrimary || event.button !== 0 || target.closest('[data-satin-action-access]'))
        return
      const onAction = target.closest('[data-satin-swipe-action]')
      if (onAction && (event.pointerType !== 'touch' || !live.current.offset)) return
      pointerId = event.pointerId
      if (event.pointerType !== 'touch') {
        start(
          event.pointerId,
          event.clientX,
          event.clientY,
          event.timeStamp,
          event.target as Element,
        )
        if (session)
          capture(
            (event.target as Element).closest('[data-satin-pressable]') ?? element,
            event.pointerId,
          )
      }
    }
    const cancelContact = () => {
      if (last && session) consume({ ...last, phase: 'cancel' })
      clearTimer()
      presenterRef.current.cancelPreparation()
      arena = undefined
      session = undefined
      releaseScroll()
      touchId = undefined
    }
    const leave = (event: PointerEvent) => {
      // Touch Events own the contact through touchend. On iPad WebKit sends
      // pointerup -> pointerleave -> touchend; treating that leave as cancel
      // destroys a tap-close spring before its first frame (swipe-parity r22).
      if (event.pointerType === 'touch') return
      if (!owned && !scrub.current && !navigationOwns) cancelContact()
    }
    const lostCapture = (event: PointerEvent) => {
      if (
        event.pointerType !== 'touch' &&
        !owned &&
        !scrub.current &&
        !navigationOwns &&
        pointerId === event.pointerId &&
        event.target === captureOwner
      )
        cancelContact()
    }
    const pointer = (event: PointerEvent) => {
      if (pointerId === event.pointerId && event.type === 'pointercancel') {
        if (
          event.pointerType === 'touch' &&
          (scrub.current ||
            navigationOwns ||
            session?.recognizers['context-hold'].state === 'recognized')
        )
          return
        cancelContact()
        return
      }
      if (!owned && event.type === 'pointermove' && event.pointerType !== 'touch') {
        const bounds = element.getBoundingClientRect()
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        ) {
          cancelContact()
          return
        }
      }
      if (event.pointerType === 'touch' || pointerId !== event.pointerId) return
      consume(
        {
          kind: 'pointer',
          phase:
            event.type === 'pointermove' ? 'move' : event.type === 'pointerup' ? 'end' : 'cancel',
          pointerId: event.pointerId,
          isPrimary: true,
          x: event.clientX,
          y: event.clientY,
          time: event.timeStamp,
        },
        event,
      )
    }
    const touchStart = (event: TouchEvent) => {
      const target = event.target as Element
      if (target.closest('[data-satin-action-access]')) return
      if (target.closest('[data-satin-swipe-action]') && !live.current.offset) return
      if (event.touches.length !== 1) {
        if (last) consume({ ...last, phase: 'cancel' })
        return
      }
      const touch = event.changedTouches[0]
      touchId = touch.identifier
      start(
        touch.identifier,
        touch.clientX,
        touch.clientY,
        event.timeStamp,
        event.target as Element,
        true,
      )
    }
    const touch = (event: TouchEvent) => {
      const value = [...event.changedTouches].find(t => t.identifier === touchId)
      if (!value) return
      consume(
        {
          kind: 'pointer',
          phase: event.type === 'touchmove' ? 'move' : event.type === 'touchend' ? 'end' : 'cancel',
          pointerId: value.identifier,
          isPrimary: true,
          x: value.clientX,
          y: value.clientY,
          time: event.timeStamp,
        },
        event,
      )
    }
    const hasCompositor =
      typeof (window as unknown as { ScrollTimeline?: unknown }).ScrollTimeline === 'function' &&
      typeof CSS !== 'undefined' &&
      CSS.supports('animation-timeline: scroll()')
    if (hasCompositor && element.dataset.satinRowSwipe) element.dataset.satinRowCompositor = 'true'
    if (host.current?.dataset.satinRowSwipe && scrollSource.current)
      scrollSource.current.scrollLeft = scrollSource.current.clientWidth * 2
    const nativeScroll = () => {
      if (!arena || !session || session.status !== 'active') return
      session = reduceGestureArena(arena, session, {
        kind: 'external-recognition',
        pointerId: session.primaryPointerId,
        recognizerId: 'native-scroll',
        time: performance.now(),
      }).session
      clearTimer()
      cancelPress()
      arena = undefined
      session = undefined
      releaseScroll()
      close()
    }
    element.addEventListener('pointerdown', pointerDown, true)
    element.addEventListener('pointerleave', leave)
    element.addEventListener('lostpointercapture', lostCapture)
    for (const type of ['pointermove', 'pointerup', 'pointercancel'])
      element.addEventListener(type, pointer as EventListener, true)
    element.addEventListener('touchstart', touchStart, { passive: true })
    // Cancelable moves are delegated to the list: one WebKit touch region, not one per row.
    const stopListeningForTouches = listenForRowTouches(element, touch)
    return () => {
      element.removeEventListener('pointerleave', leave)
      element.removeEventListener('lostpointercapture', lostCapture)
      if (pointerId !== undefined && captureOwner?.hasPointerCapture?.(pointerId))
        captureOwner.releasePointerCapture(pointerId)
      scrub.current?.cancel()
      cancelFallbackFrame()
      delete element.dataset.satinRowCompositor
      finishLift()
      clearTimer()
      releaseScroll()
      element.removeEventListener('pointerdown', pointerDown, true)
      for (const type of ['pointermove', 'pointerup', 'pointercancel'])
        element.removeEventListener(type, pointer as EventListener, true)
      element.removeEventListener('touchstart', touchStart)
      stopListeningForTouches()
      if (openRows.get(element.ownerDocument) === close) openRows.delete(element.ownerDocument)
    }
  }, [claim, close, dismissSwipe, show, perform, finishLift])
  const select = (action: SwipeActionItem) => perform(action)
  const swipes =
    !!swipeEdge(swipeActions, 'leading').actions.length ||
    !!swipeEdge(swipeActions, 'trailing').actions.length
  const leadingDrag = !!swipeEdge(swipeActions, 'leading').actions.length || offset < 0
  const trailingDrag = !!swipeEdge(swipeActions, 'trailing').actions.length || offset > 0
  return (
    <div
      ref={host}
      data-satin-row-actions="true"
      data-satin-context-content={content || undefined}
      data-satin-horizontal-drag={
        disabled
          ? undefined
          : leadingDrag
            ? trailingDrag
              ? 'both'
              : 'right'
            : trailingDrag
              ? 'left'
              : undefined
      }
      data-satin-row-swipe={swipes || undefined}
      data-satin-swipe-side={paintedSide}
      onContextMenu={event => {
        if (contextMenu) {
          event.preventDefault()
          show(event.target as Element)
        }
      }}
      onKeyDown={event => {
        if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
          event.preventDefault()
          show(event.target as Element)
        }
        if (event.key === 'Escape' && !open) close()
      }}
    >
      <div ref={scrollSource} data-satin-row-scrub="true">
        <div data-satin-row-scrub-range="true">
          <div data-satin-row-scrub-sticky="true">
            {/* A row without swipe actions renders no trays: a long transcript of context-menu
                rows paid for 2400 empty positioned trays in every rendering update. A row whose
                actions were removed while open keeps them until it has closed. */}
            {(swipes || offset !== 0 ? (['leading', 'trailing'] as const) : []).map(side => (
              <div
                key={side}
                data-satin-swipe-tray={side}
                inert={
                  disabled || !offset || (offset > 0 ? side !== 'leading' : side !== 'trailing')
                }
              >
                {swipeEdge(swipeActions, side).actions.map(action => (
                  <Pressable
                    key={action.id}
                    disabled={disabled || action.disabled}
                    aria-label={action.accessibilityLabel ?? action.label}
                    onPress={() => select(action)}
                    data-satin-swipe-action="true"
                    data-satin-swipe-role={action.role}
                    data-satin-swipe-icon={Boolean(action.icon || action.symbol)}
                    data-satin-swipe-title={Boolean(action.label)}
                    style={
                      {
                        '--satin-swipe-tint':
                          action.tint ??
                          (action.role === 'destructive'
                            ? 'var(--satin-action-destructive)'
                            : 'var(--satin-system-blue)'),
                      } as import('react').CSSProperties
                    }
                  >
                    <span
                      data-satin-swipe-direction={side}
                      data-satin-swipe-fill="start"
                      aria-hidden="true"
                    />
                    <span
                      data-satin-swipe-direction={side}
                      data-satin-swipe-fill="middle"
                      aria-hidden="true"
                    />
                    <span
                      data-satin-swipe-direction={side}
                      data-satin-swipe-fill="end"
                      aria-hidden="true"
                    />
                    <span data-satin-swipe-direction={side} data-satin-swipe-label="true">
                      {action.icon ?? (action.symbol ? <SymbolImage name={action.symbol} /> : null)}
                      {action.label ? (
                        <span data-satin-swipe-caption="true">{action.label}</span>
                      ) : null}
                    </span>
                  </Pressable>
                ))}
              </div>
            ))}

            <div ref={body} data-satin-row-action-content="true">
              {children}
              {/* The swipe grey, faded in and out on the compositor (swipeFace.ts). */}
              {swipes ? <span data-satin-swipe-face-tint="true" aria-hidden="true" /> : null}
            </div>
          </div>
        </div>
      </div>
      <div data-satin-action-access="true">
        {contextMenu && (
          <Pressable disabled={disabled} aria-haspopup="menu" aria-expanded={open} onPress={show}>
            More actions
          </Pressable>
        )}
        {[
          ...swipeEdge(swipeActions, 'leading').actions,
          ...swipeEdge(swipeActions, 'trailing').actions,
        ].map((action, index) => (
          <Pressable
            key={`${action.id}-${index}`}
            disabled={disabled || action.disabled}
            onPress={() => select(action)}
          >
            {action.accessibilityLabel ?? action.label}
          </Pressable>
        ))}
      </div>
      {presenter.presentation}
    </div>
  )
}
/**
 * A row's swipe actions and context menu. Inside an editable `List` item, the item owns the row's
 * one gesture host (it adds swipe-to-delete), so the row hands its actions to the item instead of
 * hosting a second recognizer. Swipe actions are unavailable while the list is editing, as in
 * selection; the context menu stays.
 */
export function RowActions(props: RowActionsEngineProps) {
  const item = useContext(ListItemContext)
  if (item?.delegateActions && !props.content)
    return <DelegatedRowActions {...props} delegate={item.delegateActions} />
  return (
    <RowActionsEngine {...props} swipeActions={item?.editing ? undefined : props.swipeActions} />
  )
}

function DelegatedRowActions({
  children,
  swipeActions,
  contextMenu,
  disabled,
  delegate,
}: RowActionsEngineProps & { delegate: (actions: RowActionsDelegation | undefined) => void }) {
  // Every render: the item keeps the latest callbacks and re-renders only when the actions change.
  useLayoutEffect(() => {
    delegate({ swipeActions, contextMenu, disabled })
  })
  useLayoutEffect(() => () => delegate(undefined), [delegate])
  return children
}

/**
 * The one gesture host of an editable `List` item. It hosts the row's own swipe actions and context
 * menu (handed over by the row, or declared on its `ListRow`) and adds the `onDelete` action as the
 * trailing swipe, unless the row declares its own trailing `swipeActions`
 * replace swipe-to-delete.
 */
export function ListItemActions({
  children,
  swipeActions,
  contextMenu,
  deleteAction,
  controller,
}: RowActionsProps & {
  children: ReactNode
  deleteAction?: ActionItem
  controller?: RowActionsController
}) {
  const item = useContext(ListItemContext)
  const [delegated, setDelegated] = useState<RowActionsDelegation>()
  // A row hands over its actions after each of its own renders. Only this host re-renders: its
  // children element is unchanged, so the row does not, and the hand-over cannot loop.
  const delegateActions = useCallback((next: RowActionsDelegation | undefined) => {
    setDelegated(next)
  }, [])
  const scope = useMemo(() => (item ? { ...item, delegateActions } : null), [item, delegateActions])
  const declared = delegated?.swipeActions ?? swipeActions
  const swipe = deleteAction ? withTrailingAction(declared, deleteAction) : declared
  return (
    <ListItemContext value={scope}>
      <RowActionsEngine
        swipeActions={item?.editing ? undefined : swipe}
        contextMenu={delegated?.contextMenu ?? contextMenu}
        disabled={delegated?.disabled}
        controller={controller}
      >
        {children}
      </RowActionsEngine>
    </ListItemContext>
  )
}

/** Adds `action` as the trailing edge unless the row already has trailing swipe actions. */
function withTrailingAction(swipeActions: SwipeActions | undefined, action: ActionItem) {
  if (swipeEdge(swipeActions, 'trailing').actions.length) return swipeActions
  const leading = swipeEdge(swipeActions, 'leading')
  const configurations: SwipeActionsConfiguration[] = [{ edge: 'trailing', actions: [action] }]
  if (leading.actions.length)
    configurations.push({
      edge: 'leading',
      actions: leading.actions,
      allowsFullSwipe: leading.allowsFullSwipe,
    })
  return configurations
}

/**
 * Opens a menu of actions when the user long-presses its content, with an optional custom
 * `preview`. Rows in a `List` take a `contextMenu` prop instead.
 */
export function ContextMenu({
  children,
  actions,
  preview,
}: {
  children: ReactNode
  actions: readonly import('./types.ts').Action[]
  preview?: ReactNode
}) {
  return (
    <RowActions contextMenu={{ actions, preview }} content>
      {children}
    </RowActions>
  )
}
