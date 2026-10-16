import {
  toolbarMaterialOwner,
  toolbarMenuTrigger,
  ToolbarMaterialPortal,
} from './toolbarMaterialContext.ts'
import { NavigatorContext, ScreenContext } from '../navigation/navigationContext.tsx'
import { TabActivityContext } from '../tabs/context.ts'
import { glassAperture } from './shapeTrackRegistry.ts'
import { snapshotMenuTrigger } from './menuTriggerSnapshot.ts'
import {
  contextContentScale,
  contextLiftBox,
  menuOpensUpward,
  menuPanelPlacement,
} from './menuPanelPlacement.ts'
import {
  menuTriggerGeometry,
  menuTriggerReturnGeometry,
  menuTriggerSource,
  menuTriggerContents,
  menuTriggerHasGlass,
  menuLabelTrigger,
  plainMenuSourceKind,
  contextMenuSeed,
  contextMenuReturnSeed,
} from './menuTriggerGeometry.ts'
import type { GlassAction, MenuEntry } from './menuTypes.ts'
import { createMenuContact, type MenuContactSample } from '../menu/menuContact.ts'
import {
  animateContentLift,
  animateContextBackdrop,
  animateContextDismissal,
  animateContextLift,
  animateContextPreview,
  animateContextPreviewDismissal,
  CONTEXT_CURVE_MS,
  contextHoldScale,
} from '../actions/contextMotion.ts'
import {
  decodePreviewImages,
  PREVIEW_DECODE_LIMIT_MS,
  promoteContextSource,
  type PromotedContextSource,
} from '../actions/preview.ts'
import { topModal } from '../modal/lifecycle.ts'
import { MenuSymbol } from './MenuSymbol.tsx'
import { holdPresentationForGlass } from '../presentation/glassReady.ts'
import { MenuStack } from './MenuStack.tsx'
import { VisibleDeadline } from './visibleDeadline.ts'
import { menuMorphDuration, menuMotionProfile } from './lens/menuMorphMotion.ts'
import type { Action, ActionItem } from '../actions/types.ts'
import { useObservedKeyboardMetrics } from '../keyboard/adapter.ts'
import {
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { type PressableProps } from '../press/Pressable.tsx'
import { observePointerPressCancellation } from '../press/gestureArbitration.ts'
import {
  refreshSafeAreaMetrics,
  useObservedSafeAreaMetrics,
} from '../safe-area/useSafeAreaMetrics.ts'
import { bindMenuOutside } from '../menu/menuOutside.ts'
import { focusFromFramework } from '../focus/programmaticFocus.ts'
import { GlassEffect, GlassLayer, type GlassEffectProps } from './GlassEffect.tsx'
import { MaterialEffectContext } from './liquidContext.ts'
import { GLASS_MENU_MORPH } from './lens/interactivePress.ts'
import { glassPressScale } from './pressHighlight.ts'
import { reportGlassError } from './errors.ts'
import { glassFailureCode } from './webgpu/errorCode.ts'
import { traceStage, traceStageStart } from './webgpu/profile.ts'
import { isPlainMenuSource, type GlassRegion, type MenuSourceKind } from './regions.ts'
export type MenuTriggerProps = Pick<
  PressableProps,
  'onPress' | 'disabled' | 'aria-expanded' | 'aria-haspopup' | 'aria-controls'
>
export type MenuProps = Readonly<{
  label: ReactNode
  disabled?: boolean
  actions: readonly MenuEntry[]
  /** @unstable Custom menu triggers may change. Forward every supplied trigger prop. */
  trigger?: (props: MenuTriggerProps) => ReactNode
}>
/** Viewport margins of a placed menu (points): the nearest a panel may come to the screen's
 * edges. A phone panel is placed from its trigger (menuPanelPlacement.ts): a stock toolbar Menu's
 * panel ends at its trigger's trailing edge, 20 pt from the screen edge, and starts at the
 * trigger's top (the safe-area top). Lifted context content, a custom preview and their menus
 * stop 20 pt from the screen edge on both idioms (CONTEXT_MARGIN). Other iPad menus keep 8 pt. */
const MENU_PHONE_MARGIN = { side: 20, top: 0, bottom: 8 }
const MENU_PAD_MARGIN = { side: 8, top: 8, bottom: 8 }
/** Lifted content and its menu stay 20 pt inside the safe area on every side (native menu measurements
 * tall-bubble stills: content and menu stop at 82 and 902 pt on a 440 x 956 pt iPhone with
 * 62 / 34 pt insets). iPad (native iPad recordings, 834 pt wide): a tall bubble settles at x 20
 * and a short one ends at 814, while its toolbar menu keeps 8 pt. The iPad top and bottom
 * values are unmeasured and follow iPhone. */
const CONTEXT_MARGIN = { side: 20, top: 20, bottom: 20 }
/** Resting corner radius: the phone panel's corner fits a 32 pt circle within 0.8 pt from
 * 1 pt deep (same recording). Paired iPad context, toolbar and Picker contours fit
 * 26.5 pt within the 2 pt raster-fit uncertainty (87 pt and 146 pt menu heights). */
const MENU_CORNER_RADIUS = { phone: 32, pad: 26.5 }
/** Longest wait for the renderer's open-settled ink hand-off before the live rows show anyway
 * (the phone open settles at 460 ms, the iPad open at 550 ms). */
const subscribeWithoutNavigator = () => () => {}
const navigationSettled = () => false
const MENU_INK_FALLBACK_MS = 1500
/** How long a closing plain glyph's return fade runs, from the close (styles.css). */
const MENU_GLYPH_RETURN_MS = 400
/** Safety margin past the close morph for the renderer's settle acknowledgement. */
const MENU_SETTLE_TIMEOUT_MS = 700
/** The order of a menu that opens upward: the first action nearest the trigger, so the list and
 * each section in it read bottom to top (stock SwiftUI Menu, iPhone, a trigger near the bottom of
 * the screen). A submenu's own rows open separately and keep their order. */
function nearestFirst<T extends MenuEntry>(actions: readonly T[]): T[] {
  return [...actions]
    .reverse()
    .map(action =>
      'section' in action ? ({ ...action, section: nearestFirst(action.section) } as T) : action,
    )
}
/** An entry as ActionMenu draws it, at every depth: a glass symbol takes the leading aperture
 * and `destructive` becomes the destructive role, inside sections and submenus as at the top. */
function menuAction(entry: MenuEntry): Action {
  if ('section' in entry) return { ...entry, section: entry.section.map(menuAction) }
  if ('submenu' in entry) {
    // A submenu row's symbol takes the same leading aperture as a leaf's (native: the More
    // options label starts 64 pt in, like its leaf siblings).
    // Leaves reach MenuSymbol through the same GlassAction view of their symbol (below).
    const symbol = 'symbol' in entry ? (entry.symbol as GlassAction['symbol']) : undefined
    return {
      id: entry.id,
      label: entry.label,
      disabled: entry.disabled,
      icon: symbol ? <MenuSymbol name={symbol} /> : entry.icon,
      submenu: entry.submenu.map(menuAction),
    }
  }
  const { symbol, destructive, ...action } = entry as GlassAction & ActionItem
  return {
    ...action,
    role: action.role ?? (destructive ? 'destructive' : undefined),
    icon: symbol ? (
      <MenuSymbol name={symbol} followsCheckmark={action.checked !== undefined} />
    ) : (
      action.icon
    ),
  }
}
/** Measure the final CSS box without registering glass or painting transient content. */
function MenuMeasurement({ children, style, id, role, ...props }: GlassEffectProps) {
  return (
    <div
      id={id}
      role={role}
      data-satin-general-menu="true"
      data-satin-menu-idiom={props['data-satin-menu-idiom' as keyof typeof props] as string}
      style={style}
    >
      {children}
    </div>
  )
}

/** Shared presentation and contact ownership for every menu source. */
export type MenuSource =
  | { kind: 'trigger'; element: HTMLElement; contact?: MenuContactSample }
  | { kind: 'context'; element: HTMLElement; contact?: MenuContactSample }

/** Box mapping, for a transform on `box`, that lands it on `onto`. */
function boxOnto(box: Rect, onto: Rect) {
  return {
    dx: onto.x + onto.width / 2 - (box.x + box.width / 2),
    dy: onto.y + onto.height / 2 - (box.y + box.height / 2),
    scaleX: onto.width / box.width,
    scaleY: onto.height / box.height,
  }
}
type Rect = Readonly<{ x: number; y: number; width: number; height: number }>

export function useMenuPresenter({
  label,
  actions,
  disabled = false,
  preview,
}: Omit<MenuProps, 'trigger'> & { preview?: ReactNode }) {
  const id = useId(),
    anchor = useRef<HTMLElement | null>(null),
    panel = useRef<HTMLDivElement>(null),
    topLayer = useRef<HTMLDivElement>(null),
    dimLayer = useRef<HTMLDivElement>(null)
  const source = useRef<MenuSource | null>(null)
  /** Ends a plain glyph's running return fade (see the close effects below). */
  const glyphReturn = useRef<() => void>(undefined)
  const contact = useRef(createMenuContact())
  useLayoutEffect(() => {
    const controller = contact.current
    return () => controller.cancel()
  }, [])
  const context = source.current?.kind === 'context'
  const [preparing, setPreparing] = useState(false)
  const [portalHost, setPortalHost] = useState<Element>()
  const preparingContact = useRef(false)
  const preparingPointerId = useRef<number | undefined>(undefined)
  const [open, setOpen] = useState(false),
    [position, setPosition] = useState({ left: 0, top: 0, maxHeight: 440, maxWidth: 320 })
  // On WebGPU the panel's glass emerges from the trigger's glass and returns into it on close
  // (GLASS_MENU_MORPH): the trigger hides while its glass is the menu, and the panel stays
  // mounted, inert, until the return morph ends.
  const liquid = useContext(MaterialEffectContext)
  const morphs = Boolean(liquid?.backend)
  const tabActive = useContext(TabActivityContext)
  const screen = useContext(ScreenContext)
  const navigatorStore = useContext(NavigatorContext)
  const [closing, setClosing] = useState(false)
  const presenting = open || closing || preparing
  const navigationBlocked = useSyncExternalStore(
    presenting && navigatorStore ? navigatorStore.subscribe : subscribeWithoutNavigator,
    navigatorStore
      ? () => navigatorStore.getState().entries.some(entry => entry.transition.phase !== 'settled')
      : navigationSettled,
    navigationSettled,
  )
  const ownerInactive =
    disabled ||
    !tabActive ||
    !!screen?.lifecycle.isCovered ||
    (!!screen && screen.lifecycle.phase !== 'settled')
  const ownerUnavailable = ownerInactive || navigationBlocked
  const [emergeFrom, setEmergeFrom] = useState<NonNullable<GlassRegion['emerge']>['from']>()
  const [sourceKind, setSourceKind] = useState<MenuSourceKind>()
  // Zero of the fitted opening curves; a hold sets it from the touch clock (CONTEXT_CURVE_MS).
  const recognitionEpoch = useRef<number | undefined>(undefined)
  const held = useRef(false)
  // A custom preview's images decode during the hold, so the lift moves real pixels.
  const previewDecode = useRef<{ root: HTMLElement; done: boolean; promise: Promise<void> }>(
    undefined,
  )
  const decodePreview = (root: HTMLElement) => {
    const pending = decodePreviewImages(root)
    const decode = { root, done: !pending, promise: pending ?? Promise.resolve() }
    void decode.promise.then(() => (decode.done = true))
    previewDecode.current = decode
    return decode
  }
  const promoted = useRef<PromotedContextSource | undefined>(undefined)
  /** Native lifts every press the same way, however soon after the last dismissal. A press that
   * starts while the previous lift is still returning lands that lift at once, so the new hold
   * measures and grows its source from the resting place. */
  const landContextLift = () => {
    const lifted = promoted.current
    if (!lifted) return
    for (const animation of lifted.element.getAnimations()) {
      // Only the lift's own motion; the app's CSS animations and transitions are left alone.
      if (!('animationName' in animation) && !('transitionProperty' in animation))
        animation.cancel()
    }
    lifted.restore()
  }
  const contextRestRect = useRef<DOMRect | undefined>(undefined)
  // Where lifted content or a custom preview settles; the menu is placed from it. Rows keep
  // their resting bounds.
  const liftBox = useRef<Rect | undefined>(undefined)
  const previewBox = useRef<HTMLDivElement>(null)
  const [fading, setFading] = useState(false)
  const closingRef = useRef(false)
  const sourceFocus = useRef<HTMLElement | null>(null)
  const editingSource = useRef<HTMLElement | null>(null)
  // One number per open/close transition: the renderer's settle report names it, so a late report
  // from an earlier close cannot end this one.
  const [transition, setTransition] = useState(0)
  // The trigger hides only once the panel's glass presents (at the trigger's rectangle), so no
  // frame shows neither.
  const [placed, setPlaced] = useState(false)
  const Surface = placed ? GlassEffect : MenuMeasurement
  const [prepared, setPrepared] = useState(false)
  const [presented, setPresented] = useState(false)
  // While the glass morphs, it draws the rows as ink inside the material (lensed by its rim);
  // the live rows take over when the renderer reports the open settled, and hand back when it
  // reports the close started.
  const [inkDom, setInkDom] = useState(false)
  const shown = !ownerUnavailable && (open || closing || preparing)
  const metrics = useObservedSafeAreaMetrics(shown)
  const keyboard = useObservedKeyboardMetrics(shown)
  const phone = typeof navigator !== 'undefined' && /iPhone|iPod/i.test(navigator.userAgent)
  const contentMenu = context && anchor.current?.matches('[data-satin-row]') === false
  const closeMorphMs = menuMorphDuration(
    'close',
    menuMotionProfile({ sourceKind, content: contentMenu, idiom: phone ? 'phone' : 'pad' }),
  )
  const [returnTo, setReturnTo] = useState<NonNullable<GlassRegion['emerge']>['from']>()
  const [sourceRegionId, setSourceRegionId] = useState<string>()
  const [sourceSnapshot, setSourceSnapshot] = useState<number>()
  useLayoutEffect(() => {
    const document = anchor.current?.ownerDocument
    if (!preparing || !document) return
    let retirement: ReturnType<typeof setTimeout> | undefined
    const retire = () => {
      if (!preparingContact.current) return
      preparingContact.current = false
      setPreparing(false)
      setEmergeFrom(undefined)
    }
    const stopObserving = context
      ? () => {}
      : observePointerPressCancellation(preparingPointerId.current!, retire)
    const end = (event: PointerEvent) => {
      if (event.pointerId !== preparingPointerId.current) return
      clearTimeout(retirement)
      // WebKit can release implicit capture away from the trigger. Wait a task,
      // not a capture-phase microtask, so accepted activation finishes first.
      retirement = setTimeout(() => {
        if (!preparingContact.current || event.pointerId !== preparingPointerId.current) return
        retire()
      }, 0)
    }
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
      document.addEventListener(type, end, true)
    }
    return () => {
      stopObserving()
      clearTimeout(retirement)
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
        document.removeEventListener(type, end, true)
      }
    }
  }, [preparing])
  // A z-index cannot rise above a modal sheet. A popover enters the browser top layer,
  // and staying inside the source dialog preserves its modal focus/input ownership.
  useLayoutEffect(() => {
    const host = topLayer.current
    if (!shown || !host) return
    const started = traceStageStart()
    // The dim enters first: a lifted context source enters between the dim and the menu.
    const dim = dimLayer.current
    dim?.showPopover?.()
    host.showPopover?.()
    traceStage('menu-top-layer', started)
    return () => {
      host.hidePopover?.()
      if (dim?.isConnected) dim.hidePopover?.()
    }
  }, [shown])
  const readAvailable = (content = false) => {
    const viewport = window.visualViewport
    const left = viewport?.offsetLeft ?? 0,
      top = viewport?.offsetTop ?? 0
    const width = viewport?.width ?? document.documentElement.clientWidth
    const height = keyboard.visible ? keyboard.viewportHeight : metrics.layoutViewport.height
    const margin = content ? CONTEXT_MARGIN : phone ? MENU_PHONE_MARGIN : MENU_PAD_MARGIN
    return {
      x: left + metrics.insets.left + margin.side,
      y: top + metrics.insets.top + margin.top,
      width: Math.max(44, width - metrics.insets.left - metrics.insets.right - 2 * margin.side),
      height: Math.max(
        44,
        height - metrics.insets.top - metrics.insets.bottom - margin.top - margin.bottom,
      ),
    }
  }
  useLayoutEffect(() => {
    const element = anchor.current
    const epoch = recognitionEpoch.current
    if (!context || !shown || !element || epoch === undefined) return
    const started = traceStageStart()
    if (preparing) {
      held.current = true
      if (previewBox.current) decodePreview(previewBox.current)
      const animation = animateContextLift(element, epoch, true)
      traceStage('menu-context-lift', started)
      return () => animation?.cancel()
    }
    // The preview leaves the scale the hold is showing, not a fixed start.
    const contactElapsed = performance.timeOrigin + performance.now() - epoch + CONTEXT_CURVE_MS
    const from = held.current ? contextHoldScale(contactElapsed) : 1
    held.current = false
    const rest = contextRestRect.current ?? element.getBoundingClientRect()
    const menuHeight = panel.current?.getBoundingClientRect().height ?? 0
    const custom = previewBox.current
    const settle = (box: Rect) => {
      liftBox.current = box
      if (morphs) setEmergeFrom(contextMenuSeed(DOMRect.fromRect(box)))
    }
    if (custom) {
      // A custom preview replaces the source: it grows out of the source's box into its own
      // size, centred on the source, while the source fades under it.
      // iPad's menu sits beside the preview, so the preview needs no room above or below.
      const box = contextLiftBox(
        rest,
        custom.getBoundingClientRect(),
        phone ? menuHeight : 0,
        readAvailable(true),
      )
      settle(box)
      let animations: Animation[] = []
      let cancelled = false
      // Decoded by recognition (the usual case), the preview lifts on the recognition clock
      // with the glass. Otherwise it waits, bounded, and lifts from when its pixels exist.
      const lift = (recognitionEpoch?: number) => {
        Object.assign(custom.style, {
          left: `${box.x}px`,
          top: `${box.y}px`,
          width: `${box.width}px`,
          height: `${box.height}px`,
          visibility: 'visible',
        })
        animations = animateContextPreview(custom, element, boxOnto(box, rest), {
          holdScale: from,
          recognitionEpoch,
        })
      }
      const decode =
        previewDecode.current?.root === custom ? previewDecode.current : decodePreview(custom)
      if (decode.done) lift(epoch)
      else {
        const limit = new Promise<void>(resolve => setTimeout(resolve, PREVIEW_DECODE_LIMIT_MS))
        void Promise.race([decode.promise, limit]).then(() => {
          if (!cancelled) lift()
        })
      }
      traceStage('menu-context-lift', started)
      return () => {
        cancelled = true
        previewDecode.current = undefined
        for (const animation of animations) animation.cancel()
        element.style.removeProperty('opacity')
        for (const property of ['left', 'top', 'width', 'height', 'visibility'])
          custom.style.removeProperty(property)
        liftBox.current = undefined
      }
    }
    const content = !element.matches('[data-satin-row]')
    const source = promoteContextSource(element)
    promoted.current = source
    // Native draws the menu over its lifted content when they overlap (a bubble taller than the
    // space beside it, iPhone 17 Pro Max native reference). The source just entered the top layer above
    // the menu's plane, so the plane re-enters above it; the dim keeps its own plane below.
    topLayer.current?.hidePopover?.()
    topLayer.current?.showPopover?.()
    let animation: Animation | undefined
    if (content) {
      const available = readAvailable(true)
      // Content already as wide as the screen allows does not grow past it; content taller
      // than the screen shrinks until all of it shows (native: a 1340 pt bubble settles 820 pt
      // tall, the whole available height).
      const scale = Math.min(
        Math.max(
          1,
          Math.min(contextContentScale(rest.width, rest.height), available.width / rest.width),
        ),
        available.height / rest.height,
      )
      const size = { width: rest.width * scale, height: rest.height * scale }
      const box = contextLiftBox(rest, size, menuHeight, available)
      settle(box)
      const { dx, dy } = boxOnto(rest, box)
      animation = animateContentLift(element, { scale, dx, dy }, from, source.shadow, epoch)
    } else animation = animateContextLift(element, epoch, false, from, source.shadow)
    traceStage('menu-context-lift', started)
    return () => {
      animation?.cancel()
      source.restore()
      liftBox.current = undefined
      if (promoted.current === source) promoted.current = undefined
    }
  }, [context, shown, preparing])
  // Dismissal, for any reason: the dim fades and the preview settles onto its source. The
  // preview never floats over moving content: once its source scrolls, it rejoins the layout.
  useLayoutEffect(() => {
    const epoch = recognitionEpoch.current
    if (!context || !closing || epoch === undefined) return
    const backdrop = dimLayer.current?.querySelector<HTMLElement>('[data-satin-context-backdrop]')
    const custom = previewBox.current
    const box = liftBox.current
    if (custom && box && anchor.current) {
      const dismissal = [
        ...animateContextDismissal(backdrop, null, epoch),
        ...animateContextPreviewDismissal(
          custom,
          anchor.current,
          boxOnto(box, anchor.current.getBoundingClientRect()),
        ),
      ]
      return () => {
        for (const animation of dismissal) animation.cancel()
      }
    }
    const animations = animateContextDismissal(
      backdrop,
      promoted.current ? anchor.current : null,
      epoch,
      promoted.current?.shadow,
    )
    const land = () => {
      if (promoted.current?.moved()) promoted.current.restore()
    }
    land()
    document.addEventListener('scroll', land, true)
    return () => {
      document.removeEventListener('scroll', land, true)
      for (const animation of animations) animation.cancel()
    }
  }, [context, closing])
  useLayoutEffect(() => {
    const backdrop = dimLayer.current?.querySelector<HTMLElement>('[data-satin-context-backdrop]')
    if (!backdrop || recognitionEpoch.current === undefined) return
    const animation = animateContextBackdrop(backdrop, recognitionEpoch.current)
    return () => animation?.cancel()
  }, [context, preparing, presented])
  useLayoutEffect(() => {
    if (!panel.current || !placed) return
    return contact.current.attach(panel.current, input => liquid?.regions?.interact(input))
  }, [shown, placed, liquid?.regions])
  // The pressed member locates the seed inside the complete shared capsule.
  const [memberCenter, setMemberCenter] = useState<{ x: number; y: number }>()
  // A phone menu that opens upward lists its rows from the trigger outward (native: the first
  // action sits nearest the trigger, at the bottom).
  const [upward, setUpward] = useState(false)
  // Focus returns after the source glass becomes visible and leaves its inert interval.
  const refocus = useRef(false),
    morphing = useRef(false)
  useLayoutEffect(() => {
    morphing.current = morphs && !!emergeFrom && presented
  }, [morphs, emergeFrom, presented])
  const focusFirstRow = () => {
    if (editingSource.current === document.activeElement) return
    const first = panel.current?.querySelector<HTMLButtonElement>(
      ':is([role="menuitem"], [role="menuitemradio"]):not(:disabled):not([aria-disabled="true"])',
    )
    if (first && !first.closest('[inert]') && getComputedStyle(first).visibility !== 'hidden')
      focusFromFramework(first, { preventScroll: true })
  }
  const readReturnTarget = useCallback((capture = false) => {
    const viewport = window.visualViewport
    if (source.current?.kind === 'context') {
      const element = source.current.element
      if (!element.isConnected) return undefined
      const rect = element.getBoundingClientRect()
      if (!rect.width || !rect.height || rect.bottom < 0 || rect.top > window.innerHeight)
        return undefined
      return {
        geometry: contextMenuReturnSeed(rect, panel.current?.getBoundingClientRect()),
        memberCenter: undefined,
        sourceSnapshot: undefined,
      }
    }
    const triggerSource = menuTriggerSource(anchor.current)
    const glass = toolbarMenuTrigger(triggerSource.glass)
    const snapshot = capture && glass ? snapshotMenuTrigger(glass) : undefined
    const geometry = menuTriggerReturnGeometry(
      anchor.current,
      {
        x: viewport?.offsetLeft ?? 0,
        y: viewport?.offsetTop ?? 0,
        width: viewport?.width ?? (document.documentElement.clientWidth || window.innerWidth),
        height: viewport?.height ?? (document.documentElement.clientHeight || window.innerHeight),
      },
      snapshot?.at,
    )
    if (!geometry) return undefined
    const member = triggerSource.member
    const memberRect =
      member &&
      (snapshot?.members
        .flatMap(item => [...item.geometry.rects])
        .find(([element]) => element === member)?.[1] ??
        member.getBoundingClientRect())
    return {
      geometry,
      sourceSnapshot: snapshot?.id,
      memberCenter: memberRect?.width
        ? { x: memberRect.x + memberRect.width / 2, y: memberRect.y + memberRect.height / 2 }
        : undefined,
    }
  }, [])
  const focusTrigger = () => {
    if (editingSource.current === document.activeElement) {
      editingSource.current = null
      return
    }
    editingSource.current = null
    const target = sourceFocus.current ?? anchor.current?.querySelector<HTMLButtonElement>('button')
    sourceFocus.current = null
    if (target?.isConnected && !target.closest('[inert]') && readReturnTarget()) {
      focusFromFramework(target, { preventScroll: true })
    }
  }
  const close = useCallback(() => {
    if (closingRef.current) return
    setOpen(false)
    if (morphing.current) {
      const target = readReturnTarget(true)
      if (target) {
        setReturnTo(target.geometry)
        setMemberCenter(target.memberCenter)
        setSourceSnapshot(target.sourceSnapshot)
      }
      setFading(!target)
      closingRef.current = true
      setClosing(true)
      setTransition(value => value + 1)
      refocus.current = true
    } else {
      setEmergeFrom(undefined)
      focusTrigger()
    }
  }, [readReturnTarget])
  // The panel is torn down when the renderer reports its return morph finished; the timeout only
  // tears it down if that acknowledgement never comes (the morph itself still ran or was not shown).
  const finishClose = useCallback(() => {
    preparingContact.current = false
    setPreparing(false)
    closingRef.current = false
    setFading(false)
    setClosing(false)
    setEmergeFrom(undefined)
  }, [])
  // Portals do not inherit their tab/screen visibility. Navigation removes the menu now;
  // a return morph would otherwise chase a trigger in a hidden or departing screen.
  useLayoutEffect(() => {
    if (!ownerUnavailable) return
    refocus.current = false
    sourceFocus.current = null
    setOpen(false)
    finishClose()
  }, [ownerUnavailable, finishClose])
  useLayoutEffect(() => {
    if ((!open && !preparing) || !placed || !panel.current || !liquid?.regions || presented) return
    if (prepared && (isPlainMenuSource(sourceKind) || context)) {
      if (open) setPresented(true)
      return
    }
    setPresented(false)
    return holdPresentationForGlass(
      context ? topLayer.current! : panel.current,
      null,
      [],
      () => liquid.regions!.invalidate(),
      () => {
        // The held plain-value source is transparent. Reveal that prepared canvas before
        // releasing its timeline; a second hidden readiness pass would consume the drop's
        // early frames. A toolbar still waits for its own first visible morph frame.
        if (!prepared && emergeFrom) {
          setPrepared(true)
          if (!isPlainMenuSource(sourceKind) && !context) return
        }
        if (open) setPresented(true)
        // A morphing menu's rows are glass ink until the renderer hands them back: focus moves
        // into the live rows then (below), never onto an invisible control.
        if (!emergeFrom) focusFirstRow()
      },
      () => !closingRef.current,
      {
        onFailure: () => {
          setOpen(false)
          finishClose()
          focusTrigger()
        },
      },
    )
  }, [open, preparing, placed, prepared, liquid?.regions])
  const rowsInGlass = !!emergeFrom && !inkDom
  useLayoutEffect(() => {
    if (open && !closing && emergeFrom && inkDom) focusFirstRow()
  }, [open, closing, emergeFrom, inkDom])
  // No failure may leave the rows invisible: if the renderer never reports the open settled (a
  // lost device, an ink capture error), the live rows appear anyway.
  useEffect(() => {
    if (!open || closing || !presented || !rowsInGlass) return
    const timer = setTimeout(() => setInkDom(true), MENU_INK_FALLBACK_MS)
    return () => clearTimeout(timer)
  }, [open, closing, presented, rowsInGlass])
  useEffect(() => {
    if (!closing) return
    if (fading) {
      const timer = setTimeout(finishClose, GLASS_MENU_MORPH.close.ms)
      return () => clearTimeout(timer)
    }
    // Bounded teardown: a close the renderer never reports is a glass failure, and says so.
    const deadline = new VisibleDeadline(closeMorphMs + MENU_SETTLE_TIMEOUT_MS, () => {
      const error = Error(
        `The renderer did not report the menu's close morph within ${closeMorphMs + MENU_SETTLE_TIMEOUT_MS} ms`,
      )
      reportGlassError(glassFailureCode('menu close', error), error, 'menu close')
      finishClose()
    })
    deadline.start()
    return () => deadline.cancel()
  }, [closing, fading, finishClose, closeMorphMs])
  useLayoutEffect(() => {
    if ((!open && !preparing) || !anchor.current || !panel.current) return
    const updatePlacement = () => {
      if (!anchor.current || !panel.current) return
      const started = traceStageStart()
      // A toolbar group's panel is placed from the group's glass, whichever member opened it.
      const anchorRect =
          (context ? (liftBox.current ?? contextRestRect.current) : undefined) ??
          (
            (context ? anchor.current : menuTriggerSource(anchor.current).glass) ?? anchor.current
          ).getBoundingClientRect(),
        panelRect = panel.current.getBoundingClientRect()
      const available = readAvailable(context && liftBox.current !== undefined)
      const firstRow = panel.current
        .querySelector<HTMLElement>(':is([role="menuitem"], [role="menuitemradio"])')
        ?.getBoundingClientRect()
      const next = {
        maxHeight: available.height,
        maxWidth: available.width,
        ...menuPanelPlacement(
          anchorRect,
          panelRect,
          firstRow,
          available,
          phone,
          !context
            ? 'trigger'
            : !liftBox.current
              ? 'context'
              : previewBox.current
                ? 'context-preview'
                : 'context-content',
        ),
      }
      setPlaced(true)
      setUpward(!context && phone && menuOpensUpward(anchorRect, panelRect, available))
      setPosition(previous =>
        previous.left === next.left &&
        previous.top === next.top &&
        previous.maxWidth === next.maxWidth &&
        previous.maxHeight === next.maxHeight
          ? previous
          : next,
      )
      traceStage('menu-placement', started, () => (context ? 'context' : 'trigger'))
    }
    updatePlacement()
    const observer = new ResizeObserver(updatePlacement)
    observer.observe(panel.current)
    const ink = panel.current.querySelector<HTMLElement>('[data-satin-menu-ink]')
    if (ink) observer.observe(ink)
    if (open && !preparing && placed && !liquid?.regions) focusFirstRow()
    return () => observer.disconnect()
  }, [
    actions,
    liquid?.regions,
    phone,
    open,
    preparing,
    placed,
    metrics.insets,
    metrics.layoutViewport.height,
    keyboard.visible,
    keyboard.viewportHeight,
  ])
  // Keep the contact owner alive across React's pointer-up dismissal. WebKit sends its
  // compatibility click afterward; removing this listener on close would activate the tab
  // underneath the menu. A fresh contact still goes through once the menu is closed.
  const openRef = useRef(open)
  openRef.current = open
  /** Leaves the top submenu, if one is open (Escape closes one level at a time). */
  const submenuBack = useRef<(() => boolean) | undefined>(undefined)
  useEffect(
    () =>
      bindMenuOutside({
        contains: node =>
          node instanceof Node &&
          Boolean(anchor.current?.contains(node) || panel.current?.contains(node)),
        isOpen: () => openRef.current,
        dismiss: close,
        back: () => submenuBack.current?.() ?? false,
      }),
    [close],
  )
  useEffect(() => {
    if (!open) return
    const viewport = window.visualViewport
    const scroll = (event: Event) => {
      if (contact.current.active) return
      // The navigator's native track projects its in-memory stack through scroll offsets.
      // Touch focus can settle that track after opening a menu without scrolling its content.
      // Navigation departure is handled by ownerUnavailable; List pans still dismiss below.
      if (
        event.target instanceof Element &&
        event.target.matches('[data-satin-native-scrub="true"]')
      )
        return
      if (
        event.target === document ||
        (event.target instanceof Element && anchor.current && event.target.contains(anchor.current))
      )
        close()
    }
    const initialWidth = viewport?.width ?? window.innerWidth
    const resized = () => {
      if (Math.abs((viewport?.width ?? window.innerWidth) - initialWidth) > 1) close()
    }
    // Keyboard dismissal changes height and offset while the menu opens. Placement follows
    // keyboard geometry; only a width change (rotation/window resize) invalidates this menu.
    viewport?.addEventListener('resize', resized)

    window.addEventListener('resize', resized)
    document.addEventListener('scroll', scroll, true)
    return () => {
      viewport?.removeEventListener('resize', resized)

      window.removeEventListener('resize', resized)
      document.removeEventListener('scroll', scroll, true)
    }
  }, [open, close])
  const toggle = (next?: MenuSource) => {
    if (next) {
      source.current = next
      anchor.current = next.element
    }
    if (
      ownerInactive ||
      navigatorStore?.getState().entries.some(entry => entry.transition.phase !== 'settled')
    )
      return
    if (open) {
      close()
      return
    }
    // Reversal keeps the source pair of the live aperture. A context menu is a new hold, not a
    // reversal: it lifts again (prepareOpening lands the previous lift).
    if (closing && emergeFrom && source.current?.kind !== 'context') {
      setFading(false)
      closingRef.current = false
      setClosing(false)
      setTransition(value => value + 1)
      setOpen(true)
      return
    }
    if (!preparingContact.current) {
      prepareOpening()
      held.current = false
      if (source.current?.kind === 'context')
        recognitionEpoch.current = performance.timeOrigin + performance.now()
    }
    if (source.current?.kind === 'context' && anchor.current) {
      // Keep the measured emergence body attached to the resting row bounds.
      // The animated opaque preview never becomes a glass member.
      setEmergeFrom(
        contextMenuSeed(contextRestRect.current ?? anchor.current.getBoundingClientRect()),
      )
    }
    preparingContact.current = false
    setPreparing(false)
    setOpen(true)
    if (source.current?.contact)
      contact.current.transfer(source.current.contact, source.current.element)
  }
  const prepareOpening = (next?: MenuSource) => {
    landContextLift()
    refreshSafeAreaMetrics()
    const started = traceStageStart()
    const active = document.activeElement
    editingSource.current =
      active instanceof HTMLElement && active.matches('input, textarea, [contenteditable="true"]')
        ? active
        : null
    if (next) {
      source.current = next
      anchor.current = next.element
    }
    // Selection may present another modal before the close morph finishes. Moving the
    // portal then remounts its glass and loses the renderer's outstanding close identity.
    setPortalHost(anchor.current?.closest('dialog') ?? topModal(document) ?? document.body)
    const isContext = source.current?.kind === 'context'
    const { glass: sourceGlass, member } = isContext
      ? { glass: anchor.current ?? undefined, member: anchor.current ?? undefined }
      : menuTriggerSource(anchor.current)
    const glass = isContext ? sourceGlass : (toolbarMenuTrigger(sourceGlass) ?? undefined)
    const snapshot = glass && !isContext ? snapshotMenuTrigger(glass) : undefined
    setSourceSnapshot(snapshot?.id)
    const aperture = snapshot?.aperture ?? (glass && !isContext ? glassAperture(glass) : undefined)
    const rect = aperture ? DOMRect.fromRect(aperture) : glass?.getBoundingClientRect()
    contextRestRect.current = isContext ? rect : undefined
    const grown = glass ? glassPressScale(glass) : 1
    const radius =
      aperture?.radius ?? (glass ? parseFloat(getComputedStyle(glass).borderTopLeftRadius) || 0 : 0)
    const from =
      rect &&
      (isContext
        ? contextMenuSeed(rect)
        : menuTriggerHasGlass(glass)
          ? menuTriggerGeometry(rect, radius, grown)
          : menuLabelTrigger(rect))
    const memberRect =
      member &&
      (snapshot?.members
        .flatMap(item => [...item.geometry.rects])
        .find(([element]) => element === member)?.[1] ??
        member.getBoundingClientRect())
    setSourceKind(
      isContext
        ? 'context'
        : menuTriggerHasGlass(glass) || !rect
          ? undefined
          : plainMenuSourceKind(rect),
    )
    setSourceRegionId(
      isContext ? undefined : (toolbarMaterialOwner(glass) ?? glass)?.dataset.satinGlassRegionId,
    )
    setEmergeFrom(morphs && from?.width ? from : undefined)
    setReturnTo(
      morphs && rect?.width
        ? isContext
          ? contextMenuSeed(rect)
          : menuTriggerHasGlass(glass)
            ? menuTriggerGeometry(rect, radius)
            : menuLabelTrigger(rect)
        : undefined,
    )
    setMemberCenter(
      memberRect?.width
        ? { x: memberRect.x + memberRect.width / 2, y: memberRect.y + memberRect.height / 2 }
        : undefined,
    )
    setPlaced(false)
    setPrepared(false)
    setPresented(false)
    setInkDom(false)
    closingRef.current = false
    setFading(false)
    setClosing(false)
    setTransition(value => value + 1)
    traceStage('menu-preparation', started, () => (isContext ? 'context' : 'trigger'))
  }
  const emerged = (!!emergeFrom || fading) && shown && presented
  // A toolbar group's one glass platter is the menu while it is open: the whole group hides
  // (its glass and every member's symbol), not only this menu's button.
  useLayoutEffect(() => {
    const source = menuTriggerSource(anchor.current)
    const glass = toolbarMenuTrigger(source.glass) ?? undefined
    const member = source.member
    if (context || !emerged || !glass) return
    const restore = menuTriggerContents(anchor.current).map(glass => {
      const previousInert = glass.getAttribute('inert')
      const previousEmerged = glass.getAttribute('data-satin-menu-emerged')
      const active = document.activeElement
      if (active instanceof HTMLElement && glass.contains(active)) {
        sourceFocus.current = active
        active.blur()
      }
      const trigger = member && glass.contains(member) ? member : glass
      const previousReturning = trigger.getAttribute('data-satin-menu-returning')
      const siblings = new Map<Element, string | null>()
      if (!closing || (member && !glass.contains(member))) glass.setAttribute('inert', '')
      else {
        // Inert cannot be overridden by a descendant. Lock each branch beside the
        // trigger, up to its platter, so only the trigger can reverse the close.
        for (
          let branch: Element = trigger;
          branch !== glass && branch.parentElement;
          branch = branch.parentElement
        ) {
          for (const sibling of branch.parentElement.children) {
            if (sibling === branch) continue
            siblings.set(sibling, sibling.getAttribute('inert'))
            sibling.setAttribute('inert', '')
          }
        }
        trigger.dataset.satinMenuReturning = 'true'
      }
      glass.dataset.satinMenuEmerged = 'true'
      return () => {
        for (const [sibling, previous] of siblings) {
          if (previous === null) sibling.removeAttribute('inert')
          else sibling.setAttribute('inert', previous)
        }
        if (previousReturning === null) delete trigger.dataset.satinMenuReturning
        else trigger.setAttribute('data-satin-menu-returning', previousReturning)
        if (previousInert === null) glass.removeAttribute('inert')
        else glass.setAttribute('inert', previousInert)
        if (previousEmerged === null) delete glass.dataset.satinMenuEmerged
        else glass.setAttribute('data-satin-menu-emerged', previousEmerged)
      }
    })
    return () => {
      for (const restoreContent of restore) restoreContent()
    }
  }, [emerged, closing])
  // A plain glyph comes back while its drop dissolves into it, on native's clock from the close
  // rather than on the renderer's settle report: it fades in from +240 ms and is whole by
  // +400 ms (styles.css satin-menu-glyph-return). The fade outlives the close, so it is
  // cleared on its own timer, or at once when the menu reopens.
  useLayoutEffect(() => {
    if (!closing || fading || sourceKind !== 'glyph') return
    const contents = menuTriggerContents(anchor.current)
    const clear = () => {
      for (const element of contents) delete element.dataset.satinMenuGlyphReturn
    }
    for (const element of contents) element.dataset.satinMenuGlyphReturn = 'true'
    const timer = setTimeout(clear, MENU_GLYPH_RETURN_MS)
    glyphReturn.current = () => {
      clearTimeout(timer)
      clear()
    }
  }, [closing, fading, sourceKind])
  useLayoutEffect(() => {
    if (open) glyphReturn.current?.()
  }, [open])
  useEffect(() => () => glyphReturn.current?.(), [])
  useLayoutEffect(() => {
    if (open || closing || !refocus.current) return
    refocus.current = false
    focusTrigger()
  }, [open, closing])
  useLayoutEffect(() => {
    if (!closing || fading) return
    let frame = 0
    const trackTarget = () => {
      const target = readReturnTarget()
      if (!target) {
        setFading(true)
        return
      }
      const geometry = target.geometry
      setMemberCenter(previous =>
        previous?.x === target.memberCenter?.x && previous?.y === target.memberCenter?.y
          ? previous
          : target.memberCenter,
      )
      setReturnTo(previous =>
        previous &&
        previous.x === geometry.x &&
        previous.y === geometry.y &&
        previous.width === geometry.width &&
        previous.height === geometry.height &&
        previous.radius === geometry.radius
          ? previous
          : geometry,
      )
      frame = requestAnimationFrame(trackTarget)
    }
    frame = requestAnimationFrame(trackTarget)
    return () => cancelAnimationFrame(frame)
  }, [closing, fading, readReturnTarget])
  const presentation = shown
    ? createPortal(
        <ToolbarMaterialPortal>
          {context && (
            <div ref={dimLayer} popover="manual" data-satin-menu-top-layer="true">
              {!preparing && presented && <div data-satin-context-backdrop="true" />}
            </div>
          )}
          <div
            ref={topLayer}
            popover="manual"
            data-satin-menu-top-layer="true"
            data-satin-context-backdrop-active={context || undefined}
          >
            {context && preview !== undefined && (
              <div
                ref={previewBox}
                data-satin-context-preview="true"
                aria-hidden="true"
                style={{ borderRadius: MENU_CORNER_RADIUS[phone ? 'phone' : 'pad'] }}
              >
                {preview}
              </div>
            )}
            <GlassLayer
              attachment="fixed"
              depth={1000}
              style={{
                left: position.left,
                top: position.top,
                pointerEvents: closing || preparing || !placed ? 'none' : 'auto',
                visibility: placed && !preparing && (!morphs || presented) ? undefined : 'hidden',
              }}
            >
              <div
                ref={panel}
                inert={closing || preparing || undefined}
                data-satin-menu-panel="true"
                data-satin-menu-fading={fading || undefined}
                style={fading ? { animationDuration: `${GLASS_MENU_MORPH.close.ms}ms` } : undefined}
                data-satin-menu-phase={
                  emergeFrom ? (closing ? 'closing' : presented ? 'open' : 'pending') : undefined
                }
                data-satin-menu-rows={
                  emergeFrom
                    ? inkDom || liquid?.backend === 'fallback'
                      ? 'dom'
                      : 'glass'
                    : undefined
                }
                onKeyDown={event => {
                  if (event.key === 'Tab') close()
                }}
              >
                <MenuStack
                  actions={(upward ? nearestFirst(actions) : actions).map(menuAction)}
                  select={action => {
                    close()
                    action.onPress?.()
                  }}
                  idiom={phone ? 'phone' : 'pad'}
                  closing={closing}
                  cornerRadius={MENU_CORNER_RADIUS[phone ? 'phone' : 'pad']}
                  readBounds={() => readAvailable()}
                  backRef={submenuBack}
                >
                  {rootRows => (
                    <Surface
                      touchLight
                      role="menu"
                      id={id}
                      aria-label={typeof label === 'string' ? label : 'Actions'}
                      shape={{
                        kind: 'roundedRectangle',
                        cornerRadius: MENU_CORNER_RADIUS[phone ? 'phone' : 'pad'],
                      }}
                      emerge={
                        emergeFrom && {
                          from: emergeFrom,
                          returnTo,
                          sourceRegionId,
                          sourceSnapshot,
                          sourceKind,
                          recognitionEpoch: context ? recognitionEpoch.current : undefined,
                          content: contentMenu || undefined,
                          anchor: memberCenter,
                          closing,
                          fading,
                          generation: transition,
                          ready: (prepared && open) || closing,
                          inkDom,
                          idiom: phone ? 'phone' : 'pad',
                        }
                      }
                      onEmergeSettled={finishClose}
                      onEmergeInk={phase => setInkDom(phase === 'open-settled')}
                      data-satin-general-menu="true"
                      data-satin-keep-keyboard="true"
                      data-satin-menu-idiom={phone ? 'phone' : 'pad'}
                      style={{ maxWidth: position.maxWidth }}
                    >
                      <div
                        data-satin-menu-scroll="true"
                        style={{ maxHeight: position.maxHeight - (phone ? 20 : 14) }}
                      >
                        {/* While the glass draws the rows they are not targets: native menu items
                        answer only once the menu has presented (UIKit animations disable
                        interaction by default), and focus/VoiceOver must not land on invisible
                        rows. */}
                        <div data-satin-menu-ink="true" inert={rowsInGlass || undefined}>
                          {rootRows}
                        </div>
                      </div>
                    </Surface>
                  )}
                </MenuStack>
              </div>
            </GlassLayer>
          </div>
        </ToolbarMaterialPortal>,
        portalHost ?? document.body,
      )
    : null
  return {
    id,
    open,
    presentation,
    close,
    ownsContact: () => contact.current.active,
    prepare(
      next: MenuSource,
      pointerId?: number,
      contactEpoch = performance.timeOrigin + performance.now(),
    ) {
      if (
        ownerInactive ||
        open ||
        // A held trigger waits out its close morph; a context hold during a dismissal is a new lift.
        (closing && next.kind !== 'context') ||
        navigatorStore?.getState().entries.some(entry => entry.transition.phase !== 'settled')
      )
        return
      prepareOpening(next)
      recognitionEpoch.current =
        next.kind === 'context' ? contactEpoch + CONTEXT_CURVE_MS : undefined
      preparingContact.current = true
      preparingPointerId.current = pointerId
      setPreparing(true)
    },
    show: toggle,
    cancelPreparation(pointerId?: number) {
      if (pointerId !== undefined && pointerId !== preparingPointerId.current) return
      if (!preparingContact.current) return
      preparingContact.current = false
      setPreparing(false)
      setEmergeFrom(undefined)
    },
  }
}
