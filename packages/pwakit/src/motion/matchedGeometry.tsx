import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { animateElement } from './animate.ts'
import { Animation } from './animationValue.ts'
import { commitAnimatedLayout } from './layoutTransaction.ts'
import {
  fadeSettleMs,
  runFrameTimes,
  sampleChannel,
  sampleProgress,
  type SpringChannel,
} from './springPath.ts'

/*
 * matchedGeometryEffect and withAnimation, the FLIP way:
 *
 * 1. Before the state change, read each matched view's presented frame (running motion
 *    included) and, for a view already moving, its velocity from the run's own spring.
 * 2. Commit the change synchronously (flushSync), so layout is final in the same task.
 * 3. Cancel the old runs, read each view's new layout frame once, and start one WAAPI run per
 *    element: transform and opacity only, sampled at 60 Hz from the spring, so WebKit's
 *    compositor plays it with no per-frame work in the document.
 *
 * A view whose id leaves and enters in the same change keeps its identity: the new view starts
 * from the old one's frame and fades in, and the old view stays on screen as a "ghost" (its own
 * detached DOM node, already decoded) that travels with it and fades out. That cross-fade is
 * SwiftUI's: a stock iOS 27 fixture shows both views on one frame, with opacities that sum to 1
 * on the animation's own spring (the measured reference, October 11).
 */

const namespaceBrand: unique symbol = Symbol('satin.namespace')

/** `Namespace.ID`: the scope `MatchedGeometryEffect` ids are matched within. */
export type NamespaceID = Readonly<{ [namespaceBrand]: true }>

type Entry = {
  namespace: NamespaceID
  id: string
  isSource: boolean
  wrapper: HTMLElement
}

const entries = new Set<Entry>()

/** `@Namespace`: a stable id scope for `MatchedGeometryEffect`, one per component. */
export function useNamespace(): NamespaceID {
  const [namespace] = useState<NamespaceID>(defineNamespace)
  return namespace
}

/**
 * A namespace declared once at module scope, for views that share no parent component: a
 * `MatchedTransitionSource` in one route and the screen it zooms into in another. Inside one
 * component, use `useNamespace()`.
 * @example
 * export const albumZoom = defineNamespace()
 * @experimental Shared by the zoom navigation transition.
 */
export function defineNamespace(): NamespaceID {
  return Object.freeze({ [namespaceBrand]: true as const })
}

/** Props of `MatchedGeometryEffect`. */
export type MatchedGeometryEffectProps = Readonly<{
  /** Views with the same id in the same namespace are one view in two places. */
  id: string
  in: NamespaceID
  /** Whether this view provides the frame its partners start from. Defaults to true. */
  isSource?: boolean
  /** One element. Its first element is the view that moves. */
  children: ReactNode
}>

/**
 * SwiftUI `matchedGeometryEffect(id:in:isSource:)`: when a `withAnimation` change removes this
 * view and inserts another with the same id, the new one moves from the old one's frame to its
 * own while the two cross-fade. A view that only moves or resizes
 * animates from where it was. A matched view with no partner fades in or out.
 *
 * Wrap one element that has no transform of its own. Changes made outside `withAnimation`
 * apply at once, as in SwiftUI.
 * @example
 * const art = useNamespace()
 * <MatchedGeometryEffect id="artwork" in={art}><Image src={cover} alt="" /></MatchedGeometryEffect>
 * @experimental Frame matching only (SwiftUI's default `properties: .frame`, `anchor: .center`).
 * A non-source view does not follow its source outside an animation.
 */
export function MatchedGeometryEffect({
  id,
  in: namespace,
  isSource = true,
  children,
}: MatchedGeometryEffectProps) {
  const wrapper = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const entry: Entry = { namespace, id, isSource, wrapper: wrapper.current! }
    entries.add(entry)
    return () => {
      entries.delete(entry)
    }
  }, [namespace, id, isSource])
  // display: contents keeps the wrapped element in its parent's flex or grid layout.
  return (
    <div ref={wrapper} data-satin-matched-geometry={id} style={{ display: 'contents' }}>
      {children}
    </div>
  )
}

/**
 * `withAnimation` applies the state changes in `update`, then animates the
 * `MatchedGeometryEffect` views they move, insert or remove. Call it from an event handler.
 * Keyed List rows also move to their new positions. Other views take their new layout at once.
 * Returns the callback result and propagates errors. Only synchronous updates participate.
 * Nested calls share the outer List transaction; per-update nested timing is not supported.
 * @example
 * <Button onPress={() => withAnimation(() => setShowQueue(!showQueue))}>Playing Next</Button>
 */
export function withAnimation<Result>(update: () => Result): Result
export function withAnimation<Result>(animation: Animation, update: () => Result): Result
export function withAnimation<Result>(
  first: Animation | (() => Result),
  second?: () => Result,
): Result {
  const animation = typeof first === 'function' ? Animation.default : first
  const update = typeof first === 'function' ? first : second!
  const before = snapshotMatchedViews()
  let result!: Result
  commitAnimatedLayout(animation, () => {
    result = flushSync(update)
    animateTransaction(animation, before)
  })
  return result
}

/* ------------------------------------------------------------------ running motion */

type Rect = Readonly<{ x: number; y: number; width: number; height: number }>
type Point = Readonly<{ x: number; y: number }>
const RECT_KEYS = ['x', 'y', 'width', 'height'] as const

/** One element's motion: where it rests (its box), where it is going, and its spring. */
type Run = {
  element: HTMLElement
  key: string
  box: Rect
  target: Rect
  channels: Record<(typeof RECT_KEYS)[number], SpringChannel>
  animation: Animation
  opacity: { from: number; to: number }
  motion: ReturnType<Element['animate']>
  /** A ghost is a removed view's node, kept on screen until its run ends. */
  ghost: boolean
}

const runs = new Map<HTMLElement, Run>()

function runKey(namespace: NamespaceID, id: string) {
  return `${namespaceKeys.get(namespace) ?? registerNamespace(namespace)}\u0000${id}`
}
const namespaceKeys = new WeakMap<NamespaceID, number>()
let nextNamespace = 0
function registerNamespace(namespace: NamespaceID) {
  nextNamespace++
  namespaceKeys.set(namespace, nextNamespace)
  return nextNamespace
}

/** A matched view's presented state just before the change. */
type Presented = {
  key: string
  element: HTMLElement
  isSource: boolean
  rect: Rect
  velocity: Rect
  opacity: number
  ancestors: HTMLElement[]
  look: Partial<CSSStyleDeclaration>
}

function viewOf(entry: Entry) {
  const element = entry.wrapper.firstElementChild
  return element instanceof HTMLElement ? element : undefined
}

function snapshotMatchedViews(): Presented[] {
  const presented: Presented[] = []
  for (const entry of entries) {
    const element = viewOf(entry)
    if (!element) continue
    presented.push(present(element, runKey(entry.namespace, entry.id), entry.isSource))
  }
  // Ghosts still travelling from an earlier change are retargeted like any other view.
  // A ghost whose screen has since been removed has nothing left to animate.
  for (const run of runs.values()) {
    if (run.ghost && run.element.isConnected) presented.push(present(run.element, run.key, false))
  }
  return presented
}

function present(element: HTMLElement, key: string, isSource: boolean): Presented {
  const bounds = element.getBoundingClientRect()
  const style = getComputedStyle(element)
  return {
    key,
    element,
    isSource,
    rect: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
    velocity: runVelocity(element),
    opacity: opacityOf(style),
    ancestors: ancestorsOf(element),
    // What a ghost needs to look the same once it leaves the rules that styled it in place.
    look: {
      borderRadius: style.borderRadius,
      objectFit: style.objectFit,
      objectPosition: style.objectPosition,
      backgroundColor: style.backgroundColor,
      boxShadow: style.boxShadow,
      overflow: style.overflow,
    },
  }
}

function opacityOf(style: CSSStyleDeclaration) {
  const opacity = Number.parseFloat(style.opacity)
  return Number.isFinite(opacity) ? opacity : 1
}

function ancestorsOf(element: HTMLElement) {
  const ancestors: HTMLElement[] = []
  for (let node = element.parentElement; node; node = node.parentElement) ancestors.push(node)
  return ancestors
}

/** The frame velocity (points per second) of a running run, from its own spring. */
function runVelocity(element: HTMLElement): Rect {
  const run = runs.get(element)
  if (!run) return { x: 0, y: 0, width: 0, height: 0 }
  const elapsed = Number(run.motion.currentTime ?? 0)
  const velocity = (key: (typeof RECT_KEYS)[number]) =>
    sampleChannel(run.animation, run.channels[key], elapsed).velocity
  return {
    x: velocity('x'),
    y: velocity('y'),
    width: velocity('width'),
    height: velocity('height'),
  }
}

/* ------------------------------------------------------------------ the transaction */

function animateTransaction(animation: Animation, before: Presented[]) {
  // Stop the old runs first: the new layout frames must be read without their transforms.
  const oldGhosts = stopAllRuns()
  const after = new Map<string, HTMLElement[]>()
  const sourceAfter = new Map<string, HTMLElement>()
  for (const entry of entries) {
    const element = viewOf(entry)
    if (!element) continue
    const key = runKey(entry.namespace, entry.id)
    after.set(key, [...(after.get(key) ?? []), element])
    if (entry.isSource || !sourceAfter.has(key)) sourceAfter.set(key, element)
  }
  const sourceBefore = new Map<string, Presented>()
  for (const view of before) {
    if (view.isSource || !sourceBefore.has(view.key)) sourceBefore.set(view.key, view)
  }
  const layout = new Map<HTMLElement, Rect>()
  for (const elements of after.values()) {
    for (const element of elements) layout.set(element, layoutRect(element))
  }

  for (const [key, elements] of after) {
    for (const element of elements) {
      const previous = before.find(view => view.element === element)
      const partner = previous ?? sourceBefore.get(key)
      const box = layout.get(element)!
      if (partner) moveView(element, key, partner, box, animation)
      else fadeView(element, key, box, animation, { from: 0, to: 1 })
    }
  }
  for (const view of before) {
    if (view.element.isConnected && !oldGhosts.has(view.element)) continue
    const target = sourceAfter.get(view.key)
    const targetRect = target ? layout.get(target)! : view.rect
    leaveView(view, targetRect, animation, oldGhosts.has(view.element))
  }
}

function stopAllRuns() {
  const ghosts = new Set<HTMLElement>()
  for (const run of runs.values()) {
    run.motion.cancel()
    if (run.ghost && run.element.isConnected) ghosts.add(run.element)
    else if (run.ghost) run.element.remove()
  }
  runs.clear()
  return ghosts
}

function layoutRect(element: HTMLElement): Rect {
  const bounds = element.getBoundingClientRect()
  return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
}

/** A view that stays, or the partner of one that left, moves from where it was shown. */
function moveView(
  element: HTMLElement,
  key: string,
  from: Presented,
  box: Rect,
  animation: Animation,
) {
  const stayed = from.element === element
  startRun({
    element,
    key,
    box,
    ...ownTransformOf(element, box),
    start: from.rect,
    target: box,
    velocity: from.velocity,
    animation,
    // A new partner fades in (SwiftUI's default .opacity insertion); a view that stays carries
    // on from the opacity it is showing.
    opacity: { from: stayed ? from.opacity : 0, to: 1 },
    ghost: false,
  })
}

/** SwiftUI's default `.opacity` transition for a matched view with no partner. */
function fadeView(
  element: HTMLElement,
  key: string,
  box: Rect,
  animation: Animation,
  opacity: { from: number; to: number },
) {
  startRun({
    element,
    key,
    box,
    ...ownTransformOf(element, box),
    start: box,
    target: box,
    velocity: { x: 0, y: 0, width: 0, height: 0 },
    animation,
    opacity,
    ghost: false,
  })
}

/** A removed view stays on screen as a ghost, travels to its partner's frame and fades out. */
function leaveView(view: Presented, target: Rect, animation: Animation, wasGhost: boolean) {
  const ghost = view.element
  const box = wasGhost ? layoutRect(ghost) : placeGhost(view)
  if (!box) return
  startRun({
    element: ghost,
    key: view.key,
    box,
    // placeGhost sets the ghost's origin to its top left and clears its own transform.
    pivot: { x: box.x, y: box.y },
    ownTransform: '',
    start: view.rect,
    target,
    velocity: view.velocity,
    animation,
    opacity: { from: view.opacity, to: 0 },
    ghost: true,
  })
}

/** Ghosts are placed `position: fixed` at their old frame; their transform does the rest. */
function placeGhost(view: Presented): Rect | undefined {
  const host = view.ancestors.find(ancestor => ancestor.isConnected)
  if (!host) return undefined
  const ghost = view.element
  ghost.setAttribute('aria-hidden', 'true')
  ghost.inert = true
  Object.assign(ghost.style, view.look, {
    position: 'fixed',
    left: '0px',
    top: '0px',
    margin: '0px',
    boxSizing: 'border-box',
    width: `${view.rect.width}px`,
    height: `${view.rect.height}px`,
    pointerEvents: 'none',
    transform: 'none',
    transformOrigin: '0 0',
  })
  host.append(ghost)
  // A transformed or contained ancestor becomes the fixed containing block: correct for it.
  const placed = ghost.getBoundingClientRect()
  ghost.style.left = `${view.rect.x - placed.x}px`
  ghost.style.top = `${view.rect.y - placed.y}px`
  return view.rect
}

/* ------------------------------------------------------------------ one run */

type RunRequest = {
  element: HTMLElement
  key: string
  /** The element's frame at rest, its own transform included. */
  box: Rect
  /** The transform origin in viewport points, and the element's own transform. */
  pivot: Point
  ownTransform: string
  start: Rect
  target: Rect
  velocity: Rect
  animation: Animation
  opacity: { from: number; to: number }
  ghost: boolean
}

function startRun(request: RunRequest) {
  const { element, box, target, animation, opacity } = request
  if (!(box.width > 0 && box.height > 0)) {
    if (request.ghost) element.remove()
    return
  }
  const channels = {
    x: { displacement: request.start.x - target.x, velocity: request.velocity.x },
    y: { displacement: request.start.y - target.y, velocity: request.velocity.y },
    width: { displacement: request.start.width - target.width, velocity: request.velocity.width },
    height: {
      displacement: request.start.height - target.height,
      velocity: request.velocity.height,
    },
  }
  const fades = opacity.from !== opacity.to
  const times = runFrameTimes(
    animation,
    Object.values(channels),
    fades ? fadeSettleMs(animation) : 0,
  )
  const moves = Object.values(channels).some(
    channel => channel.displacement !== 0 || channel.velocity !== 0,
  )
  if (!moves && !fades) {
    if (request.ghost) element.remove()
    return
  }
  const lastTime = times[times.length - 1]!
  const keyframes = times.map((ms, index) => {
    const frame: Keyframe = { offset: index / (times.length - 1) }
    const done = index === times.length - 1
    if (moves) frame.transform = transformAt(request, channels, done ? undefined : ms)
    if (fades) {
      const progress = done ? 1 : Math.min(Math.max(sampleProgress(animation, ms), 0), 1)
      frame.opacity = opacity.from + (opacity.to - opacity.from) * progress
    }
    return frame
  })
  const motion = animateElement(element, keyframes, {
    duration: lastTime,
    easing: 'linear',
    fill: request.ghost ? 'forwards' : 'none',
  })
  const run: Run = {
    element,
    key: request.key,
    box,
    target,
    channels,
    animation,
    opacity,
    motion,
    ghost: request.ghost,
  }
  runs.set(element, run)
  motion.finished.then(
    () => finishRun(run),
    () => {},
  )
}

function finishRun(run: Run) {
  if (runs.get(run.element) !== run) return
  runs.delete(run.element)
  if (run.ghost) run.element.remove()
}

/** The transform at `ms` into the run, or at rest when `ms` is undefined. */
function transformAt(
  request: RunRequest,
  channels: Record<(typeof RECT_KEYS)[number], SpringChannel>,
  ms: number | undefined,
) {
  const value = (key: (typeof RECT_KEYS)[number]) =>
    request.target[key] +
    (ms === undefined ? 0 : sampleChannel(request.animation, channels[key], ms).offset)
  const frame = {
    x: value('x'),
    y: value('y'),
    width: Math.max(value('width'), 0),
    height: Math.max(value('height'), 0),
  }
  return frameTransform(request.box, frame, request.pivot, request.ownTransform)
}

/**
 * The transform that draws an element resting at `box` at `frame` instead. It goes in front of
 * the element's own transform and scales about the element's own origin (`pivot`), so an app's
 * transform (Apple Music's paused artwork is scaled down) keeps working during and after the run.
 */
function frameTransform(box: Rect, frame: Rect, pivot: Point, ownTransform: string) {
  const scaleX = frame.width / box.width
  const scaleY = frame.height / box.height
  const translateX = frame.x - pivot.x - scaleX * (box.x - pivot.x)
  const translateY = frame.y - pivot.y - scaleY * (box.y - pivot.y)
  const own = ownTransform ? ` ${ownTransform}` : ''
  return `translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY})${own}`
}

/**
 * Where the element's transform origin sits in the viewport, and its own transform. Own
 * transforms are expected to be translations and scales, as rotation has no frame to match.
 */
function ownTransformOf(element: HTMLElement, rendered: Rect) {
  const style = getComputedStyle(element)
  const own = style.transform && style.transform !== 'none' ? style.transform : ''
  const matrix = own ? new DOMMatrix(own) : new DOMMatrix()
  const [originX, originY] = originOf(style.transformOrigin, element)
  // rendered.x = layoutX + originX + a·(0 − originX) + e, so the origin sits at:
  const pivot = {
    x: rendered.x + matrix.a * originX - matrix.e,
    y: rendered.y + matrix.d * originY - matrix.f,
  }
  return { pivot, ownTransform: own }
}

/** The computed transform-origin in points from the element's top left. */
function originOf(value: string, element: HTMLElement): [number, number] {
  const [x, y] = value.split(' ')
  const length = (part: string | undefined, size: number) => {
    if (part?.endsWith('px')) return Number.parseFloat(part)
    if (part?.endsWith('%')) return (Number.parseFloat(part) / 100) * size
    return size / 2
  }
  return [length(x, element.offsetWidth), length(y, element.offsetHeight)]
}
