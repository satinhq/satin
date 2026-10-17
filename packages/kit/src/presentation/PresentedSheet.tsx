import { cancelPointerPressForOwnedGesture } from '../press/gestureArbitration.ts'
import { SheetMaterialTransition } from './sheetMaterialTransition.ts'
import { MaterialEffectContext } from '../glass/liquidContext.ts'
import { TabRegistrationContext } from '../tabs/context.ts'
import { SystemScrollRegistryContext } from '../navigation/navigationContext.tsx'
import { ScreenContentContext } from '../public/chrome.tsx'
import { createScrollSurfaceRegistry } from '../scroll/registry.ts'
import { SheetChromeContext } from './sheetChromeContext.ts'
import { DismissContext, PresentationBoundary } from './dismiss.tsx'
import {
  NavigationLayoutContext,
  PresentationLayoutClassContext,
} from '../layout/navigationLayoutContext.ts'
import { createLayoutClassState } from '../layout/layoutClass.ts'
import {
  ownPhysicalContact,
  retirePhysicalContact,
  PRESS_CONTACT_CLICK_WINDOW_MS,
} from '../press/contactReceipt.ts'
import { sheetDetentPosition, sheetKeyboardPosition, sheetReleasePosition } from './motion.ts'
import {
  canReleaseSheetOnCompositor,
  startSheetReleaseMotion,
  type SheetReleaseMotion,
} from './sheetReleaseMotion.ts'
import { holdPresentationGlassMotion } from './glassMotion.ts'
import { useCallback, useContext, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useSafeAreaMetrics } from '../safe-area/useSafeAreaMetrics.ts'
import { readDisplayCornerMetrics } from '../safe-area/displayCorners.ts'
import { editable, useKeyboardMetrics } from '../keyboard/adapter.ts'
import {
  sheetExpansion,
  sheetFrame,
  sheetCornerShape,
  SHEET_MAX_WIDTH,
  usesExpandedSheetMaterial,
  detentHeight,
  releaseDetent,
  resolveDetents,
  sheetDragHeight,
  formSheetHeight,
  sheetPlacement,
  sheetTravel,
  type PresentationDetent,
} from './model.ts'

import type { SheetProps } from './Presentation.tsx'
import { SOFTWARE_KEYBOARD_MIN_HEIGHT, Surface } from './PresentationSurface.tsx'

const defaultDetents: readonly PresentationDetent[] = ['large']
// Native consumes the first ten points before the sheet begins following the finger.
const SHEET_PAN_TAKEOVER = 10
// Where WebKit would pan a list itself and only one direction is the sheet's, the claim waits
// this far: clear of finger-settle jitter, and well inside UIKit's 10 pt pan hysteresis.
const SHEET_PAN_CLAIM_SLOP = 4
// Text the system can select (the roles that restore user-select in styles.css).
const SHEET_PAN_SELECTABLE =
  '[data-satin-role="content"], [data-satin-role="text-input"], input, textarea, [contenteditable]:not([contenteditable="false"])'
// A press held this long on selectable text belongs to the selection loupe, not to the sheet.
const SHEET_PAN_HOLD_LIMIT_MS = 500
// Content that owns every drag that starts on it.
const SHEET_PAN_EXCLUDED =
  'input[type="range" i], [role="slider"], [data-satin-toggle], [data-satin-slider-thumb-hit], [role="menu"], [data-satin-role="zoomable"]'
export function PresentedSheet({
  detents = defaultDetents,
  selection,
  onSelectionChange,
  interactiveDismissDisabled = false,
  titleVisibility = 'visible',
  dragIndicator = 'automatic',
  children,
  ...props
}: SheetProps) {
  const liquid = useContext(MaterialEffectContext)
  const geometry = useSafeAreaMetrics()
  const keyboard = useKeyboardMetrics()
  const grabberRef = useRef<HTMLDivElement>(null)
  const retainedKeyboard = useRef(false)
  const ownsKeyboard =
    keyboard.presentation != null && keyboard.presentation === grabberRef.current?.closest('dialog')
  // A child alert's keyboard cannot expand the sheet behind it. Once this
  // sheet expands, retain that frame while a child temporarily owns editing.
  // Only a software keyboard expands the sheet. A hardware keyboard's accessory/shortcut bar (about
  // 55-70 pt on iPad) is a small occlusion, and native sheets keep their detent for it.
  const softwareKeyboard = keyboard.visible && keyboard.height >= SOFTWARE_KEYBOARD_MIN_HEIGHT
  const hasKeyboard = softwareKeyboard && (ownsKeyboard || retainedKeyboard.current)
  useLayoutEffect(() => {
    retainedKeyboard.current = hasKeyboard
  })
  const [navigatorCount, setNavigatorCount] = useState(0)
  const [scrollRegistry] = useState(() => createScrollSurfaceRegistry())
  const registerNavigator = useCallback(() => {
    setNavigatorCount(count => count + 1)
    return () => setNavigatorCount(count => count - 1)
  }, [])
  const viewport = geometry.layoutViewport
  const placement = sheetPlacement(
    viewport,
    geometry.insets.bottom,
    detents.every(detent => detent === 'large'),
    geometry.physicalInsets.top - geometry.insets.top,
  )
  const fillsScreen = placement.kind === 'fill'
  const edgeAvailable = Math.max(1, viewport.height - geometry.insets.top)
  // Native iPad: a form sheet keeps its own height; a detent sheet's large detent stands 8 pt
  // below the status bar and its bottom inset above the screen's edge.
  const available =
    placement.kind === 'fill'
      ? viewport.height
      : placement.kind === 'form'
        ? formSheetHeight(viewport.height)
        : placement.kind === 'floating'
          ? Math.max(1, edgeAvailable - 8 - placement.bottom)
          : edgeAvailable
  // The sheet owns a narrower coordinate space than its presenting window, with its own traits
  // (native: H compact / V regular in an iPad sheet, the window's in a screen-filling one).
  // Detent scaling changes its visual frame, not the navigation pane policy.
  const traits = createLayoutClassState({
    width: fillsScreen ? viewport.width : Math.min(viewport.width, SHEET_MAX_WIDTH),
    height: available,
  }).layoutClass
  const navigationClass = traits.horizontal
  // Native medium is a scaled floating card; this is the measured phone frame.
  const heightFor = (detent: PresentationDetent) =>
    fillsScreen || placement.kind === 'form'
      ? available
      : detent === 'medium'
        ? Math.min(available, edgeAvailable / 2 + geometry.insets.bottom + 16)
        : detentHeight(detent, available)
  resolveDetents(detents, available) // validate custom detents
  const heights = [...new Set(detents.map(heightFor))].sort((a, b) => a - b)
  const smallest = heights[0]!
  const [current, setCurrent] = useState<PresentationDetent>(selection ?? detents[0]!)
  const chosen = selection ?? current
  const selectedHeight = heights.includes(heightFor(chosen)) ? heightFor(chosen) : heights[0]!
  const resting = hasKeyboard ? available : selectedHeight
  const dragHeight = useRef<number | null>(null)
  const [, renderSettledFrame] = useState(0)
  const releaseFrame = useRef(0)
  const releaseMotion = useRef<SheetReleaseMotion | null>(null)
  const dragFrame = useRef(0)
  const materialFrame = useRef(0)
  const dragDismissed = useRef(false)
  const presented = useRef(props.isPresented)
  presented.current = props.isPresented
  useLayoutEffect(() => {
    if (props.isPresented) dragDismissed.current = false
  }, [props.isPresented])
  const materialOverride = useRef<boolean | null>(null)
  const materialTransition = useRef(new SheetMaterialTransition(resting >= available ? 1 : 0))
  const contactOwner = useRef({}).current
  useLayoutEffect(
    () => () => {
      cancelAnimationFrame(releaseFrame.current)
      releaseMotion.current?.cancel()
      cancelAnimationFrame(dragFrame.current)
      cancelAnimationFrame(materialFrame.current)
    },
    [],
  )
  const drag = useRef<{
    id: number
    target: Element
    x: number
    y: number
    height: number
    lastY: number
    time: number
    velocity: number
    moved: boolean
    heldMilliseconds?: number
  } | null>(null)
  // Motion flag on the dialog while the grabber drags or its release settles (see ProductionGlassRuntime).
  const moving = (element: Element, value: boolean) => {
    const dialog = element.closest('dialog')
    if (value) dialog?.setAttribute('data-satin-presentation-moving', 'drag')
    else if (dialog?.getAttribute('data-satin-presentation-moving') === 'drag')
      dialog.removeAttribute('data-satin-presentation-moving')
  }
  const select = (height: number) => {
    const detent = detents.find(value => heightFor(value) === height)!
    setCurrent(detent)
    onSelectionChange?.(detent)
  }
  const expanded = resting === heights.at(-1)
  const grabberValue =
    resting === available
      ? geometry.layoutViewport.width >= 768
        ? 'Expanded'
        : 'Full screen'
      : resting === heightFor('medium')
        ? 'Half screen'
        : `${Math.round((resting / available) * 100)}% screen`
  const expansionFor = (height: number) => sheetExpansion(height, heightFor('medium'), available)
  const metrics = () => ({
    geometry,
    display: readDisplayCornerMetrics(),
    keyboard,
    available,
    medium: heightFor('medium'),
    smallest,
    placement,
  })
  const frameMetrics = useRef(metrics())
  useLayoutEffect(() => {
    frameMetrics.current = metrics()
  })
  // The translation this sheet last wrote; a programmatic dismissal owns the transform otherwise.
  const writtenOffset = useRef(0)
  const writeMaterial = () => {
    const surface = grabberRef.current?.closest<HTMLElement>('.satin-presentation-surface')
    const transition = materialTransition.current
    const mix = String(transition.sample(performance.now()))
    // Material has its own clock. Geometry can settle before the fade ends,
    // and CSS changes alone do not invalidate either glass renderer. The same
    // mix rewritten on every drag frame is not a new scene.
    if (surface && surface.style.getPropertyValue('--satin-sheet-opaque-mix') !== mix) {
      surface.style.setProperty('--satin-sheet-opaque-mix', mix)
      liquid?.regions?.invalidate()
    }
    if (transition.active) materialFrame.current = requestAnimationFrame(writeMaterial)
    else materialFrame.current = 0
  }
  const targetMaterial = (opaque: boolean) => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    materialTransition.current.target(opaque ? 1 : 0, performance.now(), reduced)
    if (!materialFrame.current) writeMaterial()
  }
  const writeFrame = (height: number) => {
    const live = frameMetrics.current
    // Native re-lays out the content throughout a drag. Keep that layout, but
    // do not put React reconciliation between each input sample and its frame.
    const surface = grabberRef.current?.closest<HTMLElement>('.satin-presentation-surface')
    const layer = surface?.closest<HTMLElement>('[data-satin-glass-layer]')
    if (surface && layer) {
      const { size, offset } = sheetTravel(height, live.smallest)
      const expansion = sheetExpansion(size, live.medium, live.available)
      const frame = sheetFrame(live.geometry.layoutViewport.width, expansion, 0, live.placement)
      const shape = sheetCornerShape(
        frame,
        live.placement,
        live.geometry.layoutViewport,
        live.geometry.screen,
        live.display,
      )
      const bottomRadius = `${shape.bottomCornerRadius ?? shape.cornerRadius}px`
      if (surface.style.borderBottomLeftRadius !== bottomRadius) {
        surface.style.borderBottomLeftRadius = bottomRadius
        surface.style.borderBottomRightRadius = bottomRadius
        const regionId = surface.dataset.satinGlassRegionId
        if (regionId) liquid?.regions?.updateShape(regionId, shape)
      }
      targetMaterial(materialOverride.current ?? expansion >= 0.5)
      surface.style.height = `${size}px`
      surface.style.setProperty('--satin-sheet-content-scale', String(frame.contentScale))
      layer.style.width = `${frame.width}px`
      layer.style.left = `${frame.left}px`
      layer.style.bottom = `${frame.bottom}px`
      if (offset !== writtenOffset.current) {
        writtenOffset.current = offset
        layer.style.transform = offset ? `translateY(${offset}px)` : ''
        holdPresentationGlassMotion(layer, offset)
        // The dim fades with the sheet's travel towards the screen's bottom edge.
        const dim = offset ? String(Math.max(0, 1 - offset / (live.smallest + frame.bottom))) : ''
        layer.closest('dialog')?.style.setProperty('--satin-presentation-dim', dim)
        // A transform resizes nothing, so the shared glass sampler is told directly.
        liquid?.regions?.invalidate()
      }
    }
  }
  // React may compare equal resting styles after an imperative drag. Reassert
  // the committed frame even when those virtual style values did not change.
  useLayoutEffect(() => {
    writeFrame(dragHeight.current ?? resting)
  })
  const setDragHeight = (height: number | null) => {
    const before = dragHeight.current ?? resting
    const live = frameMetrics.current
    dragHeight.current = height
    if (height === null) {
      renderSettledFrame(value => value + 1)
      return
    }
    writeFrame(height)
    // Glass material is semantic state; only crossing its native threshold
    // needs a render. Selection and the final frame are committed separately.
    const sizeBefore = sheetTravel(before, live.smallest).size
    const sizeAfter = sheetTravel(height, live.smallest).size
    if (
      usesExpandedSheetMaterial(sizeBefore, live.medium, live.available) !==
      usesExpandedSheetMaterial(sizeAfter, live.medium, live.available)
    )
      renderSettledFrame(value => value + 1)
  }
  const acceptedHeight = useRef(resting)
  const acceptedKeyboard = useRef(hasKeyboard)
  const detentRequested = useRef(false)
  const releaseRequest = useRef<{ from: number; velocity: number } | null>(null)
  const moveToDetent = (next: number) => {
    detentRequested.current = true
    select(next)
    renderSettledFrame(value => value + 1)
  }
  useLayoutEffect(() => {
    // A pointer owns the painted frame until release. Keep the last settled
    // selection here so release can detect and apply a deferred owner update.
    if (drag.current) return
    const previous = acceptedHeight.current
    const keyboardChanging = hasKeyboard !== acceptedKeyboard.current
    acceptedKeyboard.current = hasKeyboard
    acceptedHeight.current = resting
    if (previous === resting && !detentRequested.current) return
    detentRequested.current = false
    const next = resting
    const release = releaseRequest.current
    releaseRequest.current = null
    cancelAnimationFrame(releaseFrame.current)
    releaseFrame.current = 0
    const from = release?.from ?? dragHeight.current ?? previous
    const grabber = grabberRef.current
    if (
      !grabber ||
      from === next ||
      // A sheet still held for its first glass has painted no frame to move from: it opens at its
      // detent (a detent animation there also flagged motion and deferred the glass source).
      grabber.closest('[data-satin-glass-hold]') ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setDragHeight(null)
      if (grabber) moving(grabber, false)
      return
    }
    // Only committed selection owns the destination. Delayed acceptance and
    // external changes retarget from the currently painted frame.
    materialOverride.current = release ? null : resting >= available
    setDragHeight(from)
    moving(grabber, true)
    const start = performance.now()
    const tick = (now: number) => {
      const seconds = (now - start) / 1000
      if (seconds >= 0.7) {
        materialOverride.current = null
        releaseFrame.current = 0
        setDragHeight(null)
        moving(grabber, false)
        return
      }
      setDragHeight(
        release
          ? sheetReleasePosition(
              from,
              next,
              release.velocity,
              seconds,
              from < smallest && next === smallest ? 'return' : next > from ? 'expand' : 'collapse',
            )
          : keyboardChanging
            ? sheetKeyboardPosition(from, next, seconds)
            : sheetDetentPosition(from, next, seconds),
      )
      releaseFrame.current = requestAnimationFrame(tick)
    }
    releaseFrame.current = requestAnimationFrame(tick)
  })
  const paintedDrag = (height: number) =>
    sheetDragHeight(height, smallest, heights.at(-1)!, interactiveDismissDisabled)
  const cancelDrag = (grabber: HTMLElement) => {
    cancelAnimationFrame(dragFrame.current)
    dragFrame.current = 0
    cancelAnimationFrame(releaseFrame.current)
    releaseFrame.current = 0
    releaseRequest.current = null
    detentRequested.current = false
    acceptedHeight.current = resting
    retirePhysicalContact(document, contactOwner)
    drag.current = null
    setDragHeight(null)
    moving(grabber, false)
  }
  // While the keyboard owns the frame the sheet is pinned full height; detent changes would silently
  // rewrite the stored selection that the keyboard's dismissal returns to.
  const activateGrabber = () => {
    if (heights.length > 1 && !hasKeyboard)
      moveToDetent(expanded ? heights[0]! : heights[heights.indexOf(resting) + 1]!)
  }
  // Native (iOS 27): a tap in the grabber's reach changes the detent as a tap on the grabber
  // does, and dismisses a sheet that has a single detent unless dismissal is disabled.
  const activateGrabberReach = () => {
    if (heights.length > 1) activateGrabber()
    else if (!interactiveDismissDisabled) props.onPresentedChange(false)
  }
  // Measured on the iPad: WebKit can leave the visual viewport at its keyboard height after the
  // keyboard has gone (581 of 1024 pt, nothing focused, no keyboard on screen). A keyboard that
  // owns the frame has a focused editor, so only then does it hold the sheet.
  const keyboardHoldsSheet = () => keyboard.visible && editable(document.activeElement)
  const canOwnPan = (target: Element, deltaY: number, heldMilliseconds: number) => {
    if (keyboardHoldsSheet()) return false
    // A sheet stacked on this one, an alert, a menu or any panel portaled out of it is not
    // this sheet's content, although its events reach these handlers.
    const dialog = grabberRef.current?.closest('dialog')
    if (!dialog || target.closest('dialog') !== dialog) return false
    if (target.closest(SHEET_PAN_EXCLUDED)) return false
    // Editing and selection belong to the system: a field that has focus (its caret can be
    // dragged with no software keyboard up), and a press-and-hold on selectable text.
    const selectable = target.closest(SHEET_PAN_SELECTABLE)
    if (
      selectable &&
      (selectable === document.activeElement || heldMilliseconds >= SHEET_PAN_HOLD_LIMIT_MS)
    )
      return false
    // Only a list that WebKit would pan itself needs an early claim. Everywhere else the sheet
    // takes the touch where its takeover begins, so a vertical lead cannot latch a sideways drag.
    const travel = Math.abs(deltaY)
    const pastTakeover = travel > SHEET_PAN_TAKEOVER
    let sideways = false
    let candidate: Element | null = target
    while (
      candidate &&
      candidate !== dialog &&
      !candidate.classList.contains('satin-presentation-surface')
    ) {
      if (candidate instanceof HTMLElement) {
        const scrollsX = candidate.scrollWidth > candidate.clientWidth + 1
        const scrollsY = candidate.scrollHeight > candidate.clientHeight + 1
        const style = scrollsX || scrollsY ? getComputedStyle(candidate) : null
        // Native gives a sideways scroller its pan after a vertical lead, and moves the sheet
        // on a vertical drag that starts there: the direction is judged at the full 10 pt.
        if (scrollsX && (style!.overflowX === 'auto' || style!.overflowX === 'scroll'))
          sideways = true
        if (scrollsY && (style!.overflowY === 'auto' || style!.overflowY === 'scroll')) {
          // The sheet expands before its list scrolls, and collapses from a list at its top.
          const ownsUp = resting < heights.at(-1)!
          const ownsDown = candidate.scrollTop <= 0
          if (!(deltaY < 0 ? ownsUp : ownsDown)) return false
          if (sideways) return pastTakeover
          // Where neither direction is the list's, the first vertical sample takes the touch:
          // a fast start can jump from under the slop to past 10 pt in one sample. Selectable
          // text waits for the slop, so the jitter of a press-and-hold is not claimed.
          return (ownsUp && ownsDown && !selectable) || travel >= SHEET_PAN_CLAIM_SLOP
        }
      }
      candidate = candidate.parentElement
    }
    return pastTakeover
  }
  const paintedSize = sheetTravel(dragHeight.current ?? resting, smallest).size
  return (
    <Surface
      {...props}
      kind="sheet"
      skipDismissalAnimation={dragDismissed.current}
      sheetPanCanOwn={canOwnPan}
      sheetGrabberAction={activateGrabberReach}
      sheetGestureHandlers={{
        onPointerDown: event => {
          if (!event.isPrimary || event.button !== 0 || keyboardHoldsSheet()) return
          if ((event.target as Element).closest(SHEET_PAN_EXCLUDED)) return
          materialOverride.current = null
          cancelAnimationFrame(releaseFrame.current)
          releaseFrame.current = 0
          if (releaseMotion.current) {
            dragHeight.current = releaseMotion.current.cancel()
            releaseMotion.current = null
          }
          drag.current = {
            id: event.pointerId,
            y: event.clientY,
            height: dragHeight.current ?? resting,
            lastY: event.clientY,
            time: event.timeStamp,
            velocity: 0,
            moved: false,
            target: event.target as Element,
            x: event.clientX,
          }
          // Freeze even an unmoved pointer's frame across owner renders.
          setDragHeight(drag.current.height)
        },
        onPointerMove: event => {
          const value = drag.current
          if (!value || value.id !== event.pointerId) return
          if (!value.moved) {
            const deltaY = event.clientY - value.y
            // The hold is judged where the touch claim is made, not at the 10 pt takeover.
            if (value.heldMilliseconds === undefined && Math.abs(deltaY) >= SHEET_PAN_CLAIM_SLOP)
              value.heldMilliseconds = event.timeStamp - value.time
            if (Math.abs(deltaY) <= SHEET_PAN_TAKEOVER) return
            if (
              Math.abs(deltaY) <= Math.abs(event.clientX - value.x) ||
              !canOwnPan(value.target, deltaY, value.heldMilliseconds ?? 0)
            ) {
              cancelDrag(event.currentTarget)
              return
            }
            value.moved = true
            value.y += Math.sign(deltaY) * SHEET_PAN_TAKEOVER
            cancelPointerPressForOwnedGesture(event.pointerId)
            const gestureOwner = event.currentTarget
            gestureOwner.setPointerCapture(event.pointerId)
            moving(gestureOwner, true)
          }
          const dt = event.timeStamp - value.time
          if (dt > 0) value.velocity = (event.clientY - value.lastY) / dt
          value.lastY = event.clientY
          value.time = event.timeStamp
          // Coalesce 120 Hz touch events into one direct layout update per frame.
          if (!dragFrame.current)
            dragFrame.current = requestAnimationFrame(() => {
              dragFrame.current = 0
              const latest = drag.current
              if (latest) setDragHeight(paintedDrag(latest.height + latest.y - latest.lastY))
            })
        },
        onPointerUp: event => {
          const value = drag.current
          if (!value || value.id !== event.pointerId) return
          drag.current = null
          cancelAnimationFrame(dragFrame.current)
          dragFrame.current = 0
          const grabber = event.currentTarget
          const acceptedDuringDrag = acceptedHeight.current !== resting
          if (!value.moved && !acceptedDuringDrag) {
            setDragHeight(null)
            moving(grabber, false)
            return
          }
          ownPhysicalContact(document, contactOwner, PRESS_CONTACT_CLICK_WINDOW_MS, {
            pointerId: event.pointerId,
          })
          const velocity = event.timeStamp - value.time > 100 ? 0 : value.velocity
          const next = releaseDetent(
            value.height + value.y - event.clientY,
            velocity,
            heights,
            interactiveDismissDisabled,
          )
          // The release starts where the sheet is painted, resistance included.
          const from = paintedDrag(value.height + value.y - event.clientY)
          if (acceptedDuringDrag) {
            // The owner already committed a destination during this gesture.
            // Settle there without replacing it with another selection request.
            releaseRequest.current = { from, velocity: -velocity * 1000 }
            detentRequested.current = true
            renderSettledFrame(value => value + 1)
            return
          }
          if (next !== 0) {
            releaseRequest.current = { from, velocity: -velocity * 1000 }
            moveToDetent(next)
            return
          }
          const complete = () => {
            releaseFrame.current = 0
            releaseMotion.current = null
            moving(grabber, false)
            // The off-screen frame stays painted until the presentation unmounts.
            dragDismissed.current = true
            // Publish the completed tail even when the owner defers its binding update.
            // Completion runs from WAAPI's promise, outside React's input flush.
            // Commit the skip flag and an immediate owner's acknowledgement before
            // the restoration rAF can mistake a pending render for a declined close.
            flushSync(() => {
              renderSettledFrame(value => value + 1)
              props.onPresentedChange(false)
            })
            // An owner that keeps the sheet presented gets it back at its detent.
            requestAnimationFrame(() => {
              if (!presented.current) return
              dragDismissed.current = false
              setDragHeight(null)
            })
          }
          // Each release tail has its own native fit.
          if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            complete()
            return
          }
          // The sheet slides at its smallest detent's size until its top edge meets the
          // screen's bottom edge (a floating card also clears its bottom gap).
          const live = frameMetrics.current
          const gap = sheetFrame(
            live.geometry.layoutViewport.width,
            sheetExpansion(smallest, live.medium, live.available),
            0,
            live.placement,
          ).bottom
          const offScreen = -gap
          const layer = grabber
            .closest('dialog')
            ?.querySelector<HTMLElement>('[data-satin-glass-layer]')
          if (layer && canReleaseSheetOnCompositor(layer, from, smallest, velocity)) {
            setDragHeight(from)
            releaseMotion.current = startSheetReleaseMotion(
              layer,
              from,
              smallest,
              gap,
              -velocity * 1000,
              () => liquid?.regions?.invalidate(),
              () => {
                dragHeight.current = offScreen
                complete()
              },
            )
            return
          }
          const start = performance.now()
          const tick = (now: number) => {
            const t = (now - start) / 1000
            const position = sheetReleasePosition(from, offScreen, -velocity * 1000, t, 'dismiss')
            if (t >= 0.7 || position <= offScreen + 0.5) {
              setDragHeight(offScreen)
              complete()
              return
            }
            setDragHeight(position)
            releaseFrame.current = requestAnimationFrame(tick)
          }
          releaseFrame.current = requestAnimationFrame(tick)
        },
        onPointerCancel: event => {
          if (drag.current?.id !== event.pointerId) return
          cancelDrag(event.currentTarget)
        },
        onLostPointerCapture: event => {
          // A touch pointer is implicitly captured by its down target. Moving that capture to
          // the sheet at takeover makes WebKit fire lostpointercapture on the down target, and
          // the event bubbles here. Only the sheet losing its own capture ends the drag.
          if (event.target !== event.currentTarget) return
          // Implicit capture loss after pointerup still precedes that pointer's
          // click. Capture lost during a drag ends without activation instead.
          if (drag.current?.id !== event.pointerId) return
          cancelDrag(event.currentTarget)
        },
      }}
      navigationChrome={navigatorCount > 0 || titleVisibility === 'hidden'}
      expansion={expansionFor(paintedSize)}
      opaque={usesExpandedSheetMaterial(paintedSize, heightFor('medium'), available)}
      dismissDisabled={interactiveDismissDisabled}
      placement={placement}
      height={paintedSize}
    >
      <div
        ref={grabberRef}
        className="satin-sheet-grabber"
        style={fillsScreen ? { display: 'none' } : undefined}
        role={heights.length > 1 ? 'button' : 'presentation'}
        tabIndex={heights.length > 1 ? 0 : undefined}
        aria-label={heights.length > 1 ? `Sheet Grabber, ${grabberValue}` : undefined}
        aria-description={
          heights.length > 1
            ? `Double tap to ${expanded ? 'collapse' : 'expand'} the sheet.`
            : undefined
        }
        onClick={activateGrabber}
        onKeyDown={event => {
          retirePhysicalContact(document, contactOwner)
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            activateGrabber()
            return
          }
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
          event.preventDefault()
          if (hasKeyboard) return
          const index = heights.indexOf(resting) + (event.key === 'ArrowUp' ? 1 : -1)
          moveToDetent(heights[Math.max(0, Math.min(heights.length - 1, index))]!)
        }}
      >
        <span
          style={
            dragIndicator === 'hidden' || (dragIndicator === 'automatic' && heights.length < 2)
              ? { visibility: 'hidden' }
              : undefined
          }
        />
      </div>
      <div className="satin-sheet-content">
        <div className="satin-sheet-content-scale" data-satin-presentation-content="true">
          <NavigationLayoutContext value={navigationClass}>
            <PresentationLayoutClassContext value={traits}>
              <SheetChromeContext value={registerNavigator}>
                {/* A sheet's scroll views belong to the sheet, never to the presenting screen. */}
                <SystemScrollRegistryContext value={scrollRegistry}>
                  <ScreenContentContext value={{}}>
                    <TabRegistrationContext value={null}>
                      <DismissContext value={() => props.onPresentedChange(false)}>
                        <PresentationBoundary>{children}</PresentationBoundary>
                      </DismissContext>
                    </TabRegistrationContext>
                  </ScreenContentContext>
                </SystemScrollRegistryContext>
              </SheetChromeContext>
            </PresentationLayoutClassContext>
          </NavigationLayoutContext>
        </div>
      </div>
    </Surface>
  )
}
