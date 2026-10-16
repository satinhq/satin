import {
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { ActionButton, ActionMenu, type SubmenuAction } from '../actions/ActionMenu.tsx'
import type { Action, ActionItem } from '../actions/types.ts'
import { focusFromFramework } from '../focus/programmaticFocus.ts'
import { holdPresentationForGlass } from '../presentation/glassReady.ts'
import { SymbolImage } from '../symbols/Symbol.tsx'
import { animateElement } from '../motion/animate.ts'
import { GlassEffect } from './GlassEffect.tsx'
import { MaterialEffectContext } from './liquidContext.ts'
import {
  ancestorScale,
  animateSubmenuFrame,
  chevronKeyframes,
  holdSubmenuFrame,
  padSubmenuFrame,
  phoneSubmenuFrame,
  springKeyframes,
  submenuContentPlace,
  submenuVisibleFrame,
  SUBMENU_GEOMETRY,
  SUBMENU_SPRINGS,
  titleOnRow,
  type Frame,
  type Point,
  type SubmenuParts,
} from './submenuMotion.ts'

/** An open submenu: the row that opened it, and where that row rested, in stack coordinates. */
type Level = Readonly<{
  key: number
  action: SubmenuAction
  /** Depth of the level whose row opened it (0 is the root menu). */
  parentDepth: number
  row: Frame
}>

/** What leaving a whole open menu looks like: the platters shrink toward the top of the menu and
 * fade out within a quarter second (native trace, dismissal from a submenu: opacity 0.78, 0.33,
 * 0.09, 0.01 at 35, 102, 168 and 235 ms; width 82, 47, 27, 21 % at the same times). */
const CHAIN_DISMISSAL: Keyframe[] = [
  { offset: 0, opacity: 1, transform: 'scale(1)' },
  { offset: 35 / 235, opacity: 0.78, transform: 'scale(0.82)' },
  { offset: 102 / 235, opacity: 0.33, transform: 'scale(0.47)' },
  { offset: 168 / 235, opacity: 0.09, transform: 'scale(0.27)' },
  { offset: 1, opacity: 0, transform: 'scale(0.21)' },
]
const CHAIN_DISMISSAL_MS = 235

let nextLevelKey = 0

/**
 * A menu and the submenus open above it, drawn as one stack. The root level is drawn inside the
 * menu's own glass (`children` receives its rows); each submenu is a platter of its own. On
 * iPhone a submenu covers its parent, which shrinks and dims behind it; its title row leads back.
 * On iPad submenus cascade beside their parents, which stay live: choosing the open row again
 * closes its submenu, and choosing another row of the parent replaces it.
 */
export function MenuStack({
  actions,
  select,
  idiom,
  closing,
  cornerRadius,
  readBounds,
  backRef,
  children,
}: {
  actions: readonly Action[]
  select: (action: ActionItem) => void
  idiom: 'phone' | 'pad'
  /** The whole menu is closing: every submenu leaves with it. */
  closing: boolean
  cornerRadius: number
  /** Where submenus may be placed, in viewport coordinates. */
  readBounds: () => Frame
  /** Leaves the top submenu (Escape); reports whether there was one to leave. */
  backRef: RefObject<(() => boolean) | undefined>
  children: (rootRows: ReactNode) => ReactNode
}) {
  const [levels, setLevels] = useState<readonly Level[]>([])
  const [leaving, setLeaving] = useState<readonly Level[]>([])
  const rootLevel = useRef<HTMLDivElement>(null)
  const platters = useRef(new Map<number, HTMLElement>())
  /** The row to focus once a back transition has re-rendered its level. */
  const returnFocus = useRef<{ depth: number; id: string } | undefined>(undefined)

  /** The stack's coordinate origin: the top-left corner of the root platter's layout box. */
  const origin = () => {
    const root = rootGlass()
    const rect = root?.getBoundingClientRect()
    if (!root || !rect) return { x: 0, y: 0 }
    // The root may be shrunk about its top edge while it is covered; its layout box is not.
    return { x: rect.left - (root.offsetWidth - rect.width) / 2, y: rect.top }
  }
  const rootGlass = () =>
    rootLevel.current?.closest<HTMLElement>('[data-satin-glass-effect]') ?? undefined
  const levelElement = (depth: number) =>
    depth === 0 ? rootGlass() : platters.current.get(levels[depth - 1]?.key ?? -1)

  const open = (parentDepth: number) => (action: SubmenuAction, row: HTMLButtonElement) => {
    const current = levels[parentDepth]
    if (current?.action.id === action.id) {
      // iPad: choosing the open row again closes its submenu.
      back(parentDepth)
      return
    }
    const start = origin()
    const rect = row.getBoundingClientRect()
    const level: Level = {
      key: ++nextLevelKey,
      action,
      parentDepth,
      row: {
        x: rect.left - start.x,
        y: rect.top - start.y,
        width: rect.width,
        height: rect.height,
      },
    }
    setLeaving(previous => [...previous, ...levels.slice(parentDepth)])
    setLevels([...levels.slice(0, parentDepth), level])
  }
  /** Close every submenu above `depth`, returning focus to the row that opened the first. */
  const back = (depth: number) => {
    const closed = levels.slice(depth)
    if (!closed.length) return
    returnFocus.current = { depth, id: closed[0]!.action.id }
    setLeaving(previous => [...previous, ...closed])
    setLevels(levels.slice(0, depth))
  }
  backRef.current = () => {
    if (!levels.length) return false
    back(levels.length - 1)
    return true
  }

  useLayoutEffect(() => {
    const target = returnFocus.current
    if (!target) return
    returnFocus.current = undefined
    const level = target.depth === 0 ? rootLevel.current : levelElement(target.depth)
    const row = [
      ...(level?.querySelectorAll<HTMLButtonElement>('[data-satin-action-id]') ?? []),
    ].find(element => element.dataset.satinActionId === target.id)
    if (row) focusFromFramework(row, { preventScroll: true })
  })

  // iPhone: every level below the top submenu shrinks and dims behind it.
  const covering = (depth: number) => (idiom === 'phone' ? levels.length - depth : 0)
  useAncestorPresentation(rootGlass, rootLevel, covering(0), closing)

  const frameOf = (depth: number, element: HTMLElement | undefined): Frame | undefined => {
    if (!element) return undefined
    if (depth === 0) return { x: 0, y: 0, width: element.offsetWidth, height: element.offsetHeight }
    const visible = submenuVisibleFrame(element)
    if (visible) return visible
    const style = element.style
    return {
      x: parseFloat(style.left),
      y: parseFloat(style.top),
      width: element.offsetWidth,
      height: element.offsetHeight,
    }
  }
  const settleFrame = (level: Level, size: { width: number; height: number; firstRow: number }) => {
    const parent = frameOf(level.parentDepth, levelElement(level.parentDepth))
    const start = origin()
    const viewport = readBounds()
    const bounds = { ...viewport, x: viewport.x - start.x, y: viewport.y - start.y }
    if (!parent) return { ...level.row, width: size.width, height: size.height }
    return idiom === 'phone'
      ? phoneSubmenuFrame(parent, level.row, ancestorScale(1), size, bounds)
      : padSubmenuFrame(parent, level.row, { ...size, firstRowOffset: size.firstRow }, bounds)
  }

  const rootRows = (
    <div
      ref={rootLevel}
      data-satin-menu-level="0"
      inert={(covering(0) > 0 && !closing) || undefined}
    >
      <ActionMenu
        actions={actions}
        select={select}
        openSubmenu={open(0)}
        expandedId={levels[0]?.action.id}
      />
    </div>
  )
  return (
    <>
      {children(rootRows)}
      {[
        ...levels.map((level, index) => ({ level, depth: index + 1 })),
        ...leaving.map(level => ({ level, depth: -1 })),
      ].map(({ level, depth }) => (
        <SubmenuPlatter
          key={level.key}
          level={level}
          idiom={idiom}
          cornerRadius={cornerRadius}
          covering={depth < 0 ? 0 : covering(depth)}
          leaving={depth < 0}
          closing={closing}
          register={element => {
            if (element) platters.current.set(level.key, element)
            else platters.current.delete(level.key)
          }}
          settleFrame={size => settleFrame(level, size)}
          select={select}
          openSubmenu={depth < 0 ? undefined : open(depth)}
          expandedId={depth < 0 ? undefined : levels[depth]?.action.id}
          onBack={() => back(depth - 1)}
          onFailure={() => {
            returnFocus.current = { depth: level.parentDepth, id: level.action.id }
            setLevels(previous => {
              const index = previous.findIndex(entry => entry.key === level.key)
              return index < 0 ? previous : previous.slice(0, index)
            })
          }}
          onLeft={() => setLeaving(previous => previous.filter(entry => entry !== level))}
        />
      ))}
    </>
  )
}

/** Shrink and dim a level while submenus cover it, on the measured springs; restore it after. */
function useAncestorPresentation(
  glass: () => HTMLElement | undefined,
  rows: RefObject<HTMLElement | null>,
  covering: number,
  closing: boolean,
) {
  const previous = useRef(0)
  useLayoutEffect(() => {
    const element = glass()
    const ink = rows.current
    const target = closing ? 0 : covering
    const from = previous.current
    previous.current = target
    if (!element || !ink || from === target) return
    const springs = target > from ? SUBMENU_SPRINGS.open : SUBMENU_SPRINGS.back
    const currentScale = readScale(element)
    const currentInk = Number.parseFloat(getComputedStyle(ink).opacity) || 1
    for (const animation of [...element.getAnimations(), ...ink.getAnimations()])
      if (animation.id === 'satin-submenu-ancestor') animation.cancel()
    const scale = ancestorScale(target)
    const opacity = target > 0 ? SUBMENU_GEOMETRY.parentInk : 1
    element.style.transformOrigin = '50% 0'
    const scaling = springKeyframes(springs.parentScale, progress => ({
      transform: `scale(${currentScale + (scale - currentScale) * progress})`,
    }))
    const dimming = springKeyframes(springs.parentInk, progress => ({
      opacity: currentInk + (opacity - currentInk) * progress,
    }))
    const delay = 'delay' in springs.parentInk ? springs.parentInk.delay : 0
    const scaleAnimation = animateElement(element, scaling.keyframes, {
      duration: scaling.duration,
      fill: 'forwards',
      id: 'satin-submenu-ancestor',
    })
    const inkAnimation = animateElement(ink, dimming.keyframes, {
      duration: dimming.duration,
      delay,
      fill: 'both',
      id: 'satin-submenu-ancestor',
    })
    if (target === 0) {
      // Restored levels drop their fills, so nothing outlives the transition.
      void scaleAnimation.finished.then(
        () => scaleAnimation.cancel(),
        () => {},
      )
      void inkAnimation.finished.then(
        () => inkAnimation.cancel(),
        () => {},
      )
    }
  })
}

function readScale(element: HTMLElement) {
  const transform = getComputedStyle(element).transform
  if (!transform || transform === 'none') return 1
  const matrix = new DOMMatrixReadOnly(transform)
  return Math.hypot(matrix.a, matrix.b)
}

/** One submenu: its own glass platter, which grows out of the row that opened it. */
function SubmenuPlatter({
  level,
  idiom,
  cornerRadius,
  covering,
  leaving,
  closing,
  register,
  settleFrame,
  select,
  openSubmenu,
  expandedId,
  onBack,
  onLeft,
  onFailure,
}: {
  level: Level
  idiom: 'phone' | 'pad'
  cornerRadius: number
  covering: number
  leaving: boolean
  closing: boolean
  register: (element: HTMLElement | null) => void
  settleFrame: (size: { width: number; height: number; firstRow: number }) => Frame
  select: (action: ActionItem) => void
  openSubmenu?: (action: SubmenuAction, row: HTMLButtonElement) => void
  expandedId?: string
  onBack: () => void
  onLeft: () => void
  onFailure: () => void
}) {
  const liquid = useContext(MaterialEffectContext)
  const frame = useRef<HTMLDivElement>(null)
  const clip = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const rows = useRef<HTMLDivElement>(null)
  const settled = useRef<Frame | undefined>(undefined)
  const [shown, setShown] = useState(false)
  const lifecycle = useRef({ leaving, closing, onFailure })
  lifecycle.current = { leaving, closing, onFailure }
  const retireEntrance = useRef(() => {})
  const glass = () =>
    frame.current?.querySelector<HTMLElement>('[data-satin-glass-effect]') ?? undefined
  useAncestorPresentation(glass, rows, covering, closing)
  const phone = idiom === 'phone'
  const movingParts = (): SubmenuParts | undefined => {
    const platter = frame.current
    const glassElement = glass()
    if (!platter || !glassElement || !clip.current || !content.current) return undefined
    return {
      platter,
      glass: glassElement,
      clip: clip.current,
      content: content.current,
      cornerRadius,
    }
  }
  /** Where the content must sit for its title row to cover the row that opened it. On iPad the
   * cascade has no title: its content starts where its glass does. */
  const contentAtRow = (): Point => {
    const measured = content.current
    const title = measured?.querySelector<HTMLElement>('[data-satin-submenu-title]')
    if (!phone || !measured || !title) return { x: level.row.x, y: level.row.y }
    const outer = measured.getBoundingClientRect()
    const inner = title.getBoundingClientRect()
    return titleOnRow(level.row, { x: inner.left - outer.left, y: inner.top - outer.top })
  }

  // Enter: measure the platter's own size, then grow out of the row once its glass is drawn.
  useLayoutEffect(() => {
    const element = frame.current
    const measured = content.current
    if (!element || !measured) return
    const firstRow = measured.querySelector<HTMLElement>('[data-satin-action-id]')
    const to = settleFrame({
      width: measured.offsetWidth,
      height: measured.offsetHeight,
      firstRow: firstRow?.offsetTop ?? 0,
    })
    settled.current = to
    const from = level.row
    const held = movingParts()
    if (held) holdSubmenuFrame(held, from, to, contentAtRow(), 'open')
    let retired = false
    let stop = () => {}
    const canReveal = () => !retired && !lifecycle.current.leaving && !lifecycle.current.closing
    const enter = () => {
      const moving = movingParts()
      if (!canReveal() || !moving) return
      setShown(true)
      crossfadeTitle(element, 'open')
      turnChevron(element, 'open')
      stop = animateSubmenuFrame(moving, from, to, contentAtRow(), to, 'open')
      const first = [...measured.querySelectorAll<HTMLElement>('[data-satin-action-id]')].find(
        row => !row.matches(':disabled, [aria-disabled="true"]'),
      )
      if (first) focusFromFramework(first, { preventScroll: true })
    }
    const regions = liquid?.regions
    const release = regions
      ? holdPresentationForGlass(element, null, [], () => regions.invalidate(), enter, canReveal, {
          onFailure: () => lifecycle.current.onFailure(),
        })
      : (enter(), () => {})
    const retire = () => {
      retired = true
      release()
      stop()
    }
    retireEntrance.current = retire
    return retire
    // The platter enters once, when it mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Back: collapse into the row that opened it while its rows fade, then leave.
  useLayoutEffect(() => {
    const element = frame.current
    const moving = movingParts()
    if (!leaving || closing || !element || !moving) return
    retireEntrance.current()
    const from = submenuVisibleFrame(element) ?? {
      x: parseFloat(element.style.left),
      y: parseFloat(element.style.top),
      width: element.offsetWidth,
      height: element.offsetHeight,
    }
    const contentFrom = submenuContentPlace(element) ?? from
    const fade = springKeyframes(SUBMENU_SPRINGS.back.fade, progress => ({
      opacity: 1 - progress,
    }))
    // Everything but the title fades: the title becomes the parent's row again.
    const parts = element.querySelectorAll<HTMLElement>(
      '[data-satin-action-menu] > :not([data-satin-submenu-title])',
    )
    const fading = [...parts].map(part =>
      animateElement(part, fade.keyframes, { duration: fade.duration, fill: 'forwards' }),
    )
    crossfadeTitle(element, 'back')
    turnChevron(element, 'back')
    const stop = animateSubmenuFrame(
      moving,
      from,
      level.row,
      contentFrom,
      contentAtRow(),
      'back',
      onLeft,
    )
    return () => {
      stop()
      for (const animation of fading) animation.cancel()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaving, closing])

  // The whole menu closing takes every platter with it.
  useLayoutEffect(() => {
    const element = frame.current
    if (!closing || !element) return
    retireEntrance.current()
    element.style.transformOrigin = '50% 0'
    const animation = animateElement(element, CHAIN_DISMISSAL, {
      duration: CHAIN_DISMISSAL_MS,
      easing: 'linear',
      fill: 'forwards',
    })
    return () => animation.cancel()
  }, [closing])

  const action = level.action
  const title = phone ? (
    <>
      <ActionButton
        role="menuitem"
        aria-expanded="true"
        aria-haspopup="menu"
        data-satin-submenu-title="true"
        onPress={onBack}
      >
        {action.icon ?? (action.symbol ? <SymbolImage name={action.symbol} /> : null)}
        <span data-satin-action-label="true" data-satin-submenu-title-label="true">
          <span data-satin-submenu-title-bold="true">{action.label}</span>
          <span data-satin-submenu-title-regular="true" aria-hidden="true">
            {action.label}
          </span>
        </span>
        <span role="presentation" data-satin-submenu-chevron="true">
          <SymbolImage name="chevron.down" />
        </span>
      </ActionButton>
      <div data-satin-submenu-separator="true" />
    </>
  ) : undefined
  return (
    <div
      ref={element => {
        frame.current = element
        register(element)
      }}
      data-satin-submenu-frame="true"
      data-satin-submenu-leaving={leaving || undefined}
      style={{ visibility: shown ? undefined : 'hidden' }}
      inert={leaving || covering > 0 || undefined}
    >
      <GlassEffect
        touchLight
        role="menu"
        aria-label={action.label}
        shape={{ kind: 'roundedRectangle', cornerRadius }}
        data-satin-general-menu="true"
        data-satin-submenu-platter="true"
        data-satin-keep-keyboard="true"
        data-satin-menu-idiom={idiom}
        style={{ position: 'absolute', inset: 0 }}
      >
        <div ref={clip} data-satin-submenu-clip="true" style={{ borderRadius: cornerRadius }}>
          <div ref={content} data-satin-submenu-content="true">
            <div ref={rows} data-satin-menu-level={level.parentDepth + 1}>
              <ActionMenu
                actions={action.submenu}
                select={select}
                openSubmenu={openSubmenu}
                expandedId={expandedId}
                onBack={onBack}
                header={title}
              />
            </div>
          </div>
        </div>
      </GlassEffect>
    </div>
  )
}

/** The title's label is bold while it heads its submenu and regular while it is the parent's row:
 * the two cross-fade as the platter grows out of the row and collapses back into it. */
function crossfadeTitle(platter: HTMLElement, direction: 'open' | 'back') {
  const bold = platter.querySelector<HTMLElement>('[data-satin-submenu-title-bold]')
  const regular = platter.querySelector<HTMLElement>('[data-satin-submenu-title-regular]')
  if (!bold || !regular) return
  const springs = direction === 'open' ? SUBMENU_SPRINGS.open.frame : SUBMENU_SPRINGS.back.fade
  const fade = (from: number, to: number) =>
    springKeyframes(springs, progress => ({ opacity: from + (to - from) * progress }))
  const showBold = direction === 'open'
  const boldFade = fade(showBold ? 0 : 1, showBold ? 1 : 0)
  const regularFade = fade(showBold ? 1 : 0, showBold ? 0 : 1)
  animateElement(bold, boldFade.keyframes, { duration: boldFade.duration, fill: 'forwards' })
  animateElement(regular, regularFade.keyframes, {
    duration: regularFade.duration,
    fill: 'forwards',
  })
}

/** Turn the title's chevron between forward (the parent row's) and down (the open title's), from
 * wherever an interrupted turn left it. */
function turnChevron(platter: HTMLElement, direction: 'open' | 'back') {
  const chevron = platter.querySelector<HTMLElement>('[data-satin-submenu-chevron]')
  if (!chevron) return
  const current = chevron.getAnimations().length ? readRotation(chevron) : undefined
  for (const animation of chevron.getAnimations()) animation.cancel()
  const turn = chevronKeyframes(direction, current)
  animateElement(chevron, turn.keyframes, { duration: turn.duration, fill: 'forwards' })
}

function readRotation(element: HTMLElement) {
  const transform = getComputedStyle(element).transform
  if (!transform || transform === 'none') return 0
  const matrix = new DOMMatrixReadOnly(transform)
  return (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI
}
