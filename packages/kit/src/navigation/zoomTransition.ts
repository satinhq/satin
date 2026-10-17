/*
 * Zoom navigation connects a MatchedTransitionSource to a screen configured with a zoom transition.
 *
 * A push whose screen asks for a zoom, and whose source is on screen in the screen it covers, grows
 * out of the source instead of sliding in. Its pop (the back button) and a downward drag on the
 * screen shrink it back into the source. Every other push and pop keeps the ordinary slide: the
 * choice is made per transition, when the transition first binds to its screens, and a transition
 * that is not a zoom runs the unchanged slide controller.
 *
 * The window's edges are transforms of two nested clipping boxes and everything else is opacity
 * and transform, sampled at 60 Hz from native-fitted springs into Web Animations, so WebKit's
 * compositor plays it; only the corner radius is a main-thread value. The geometry is in
 * zoomGeometry.ts and the measured values in zoomMotion.ts.
 */

import { announceAnimation } from '../motion/animate.ts'
import type { NamespaceID } from '../motion/matchedGeometry.tsx'
import { sampleChannel } from '../motion/springPath.ts'
import { prepareDestinationImages } from '../image/resource.ts'
import { prepareClonedImages, prepareRevealedImages } from '../motion/transitionImages.ts'
import { registerZoomGlass, type ZoomGlassPose } from './zoomGlass.ts'
import type {
  TransitionBinding,
  TransitionCompletion,
  TransitionController,
  TransitionControllerContext,
  TransitionControllerFactory,
} from './types.ts'
import { Animation as SpringAnimation } from '../motion/animationValue.ts'
import { chromeDissolve } from './chromeCurves.ts'
import { shouldCompleteInteractivePop } from './motionTokens.ts'
import {
  dragRect,
  edgeRect,
  openness,
  windowRadius,
  windowStyle,
  type ZoomRect,
  type ZoomWindow,
} from './zoomGeometry.ts'
import {
  ZOOM_DIM_OPACITY,
  ZOOM_DISMISS,
  ZOOM_DISMISS_DISTANCE,
  ZOOM_POP,
  ZOOM_POP_PAGE_ALPHA,
  ZOOM_POP_CHROME_FADE_MS,
  ZOOM_POP_SOURCE_FADE_MS,
  ZOOM_PUSH,
  ZOOM_PUSH_CHROME_FADE_MS,
  ZOOM_PUSH_SOURCE_FADE_MS,
  ZOOM_REAR_SCALE,
  ZOOM_RETURN,
  type ZoomSpring,
  type ZoomSprings,
} from './zoomMotion.ts'

/* ------------------------------------------------------------------ sources and requests */

type TransitionSource = Readonly<{ namespace: NamespaceID; id: string; wrapper: HTMLElement }>
type ZoomRequest = Readonly<{ namespace: NamespaceID; sourceID: string }>

const sources = new Set<TransitionSource>()
/** Zoom requests of mounted screens, by navigation entry key. */
const requests = new Map<string, ZoomRequest>()
/** A route keeps the exact source that opened it, even when the same album appears twice. */
const selectedSources = new Map<string, TransitionSource>()
const activationDocuments = new Map<
  Document,
  { count: number; target?: Element; record: EventListener }
>()
/** The entry whose screen a finger is dragging down, until its pop has bound. */
let draggedEntryKey: string | undefined

/** Registers a `MatchedTransitionSource`; returns its removal. */
export function registerTransitionSource(source: TransitionSource) {
  sources.add(source)
  const document = source.wrapper.ownerDocument
  let activation = activationDocuments.get(document)
  if (!activation) {
    const state: { count: number; target?: Element; record: EventListener } = {
      count: 0,
      record: event => {
        state.target =
          event.type !== 'pointercancel' && event.target instanceof Element
            ? event.target
            : undefined
      },
    }
    activation = state
    activationDocuments.set(document, state)
    for (const type of ['pointerdown', 'click', 'pointercancel'])
      document.addEventListener(type, state.record, true)
  }
  activation.count++
  return () => {
    sources.delete(source)
    if (--activation.count === 0) {
      for (const type of ['pointerdown', 'click', 'pointercancel'])
        document.removeEventListener(type, activation.record, true)
      activationDocuments.delete(document)
    }
  }
}

/** Registers a screen's `.navigationTransition(.zoom)`; returns its removal. */
export function registerZoomRequest(entryKey: string, request: ZoomRequest) {
  const previous = requests.get(entryKey)
  if (previous?.namespace !== request.namespace || previous.sourceID !== request.sourceID)
    selectedSources.delete(entryKey)
  requests.set(entryKey, request)
  return () => {
    if (requests.get(entryKey) === request) {
      requests.delete(entryKey)
      selectedSources.delete(entryKey)
    }
  }
}

function entryKeyOf(element: HTMLElement) {
  return element.closest<HTMLElement>('[data-satin-screen-key]')?.dataset.satinScreenKey
}

/**
 * The source view a zoom of `entryKey` starts from or returns to, if it is on screen inside `rear`
 * (and not inside `excluded`, the zoomed screen itself).
 */
export function visibleZoomSource(entryKey: string, rear: HTMLElement, excluded?: HTMLElement) {
  const request = requests.get(entryKey)
  if (!request) return undefined
  const selected = selectedSources.get(entryKey)
  const candidates: { source: TransitionSource; view: HTMLElement }[] = []
  for (const source of sources) {
    if (source.namespace !== request.namespace || source.id !== request.sourceID) continue
    const view = source.wrapper.firstElementChild
    if (!(view instanceof HTMLElement) || !rear.contains(view)) continue
    if (excluded?.contains(view)) continue
    if (isOnScreen(view)) candidates.push({ source, view })
  }
  // Once selected, losing that view falls back to a slide, never to another copy of the album.
  if (selected) return candidates.find(candidate => candidate.source === selected)?.view
  const activation = activationDocuments.get(rear.ownerDocument)
  const target = activation?.target
  const direct = candidates.find(candidate => target && candidate.source.wrapper.contains(target))
  // Keyboard clicks target an enclosing button rather than its artwork. Only adopt an
  // ancestor activation when it identifies a single source in this namespace and rear route.
  const control =
    target?.closest('button, [role="button"], a[href], [data-satin-pressable]') ?? target
  const enclosed = control ? candidates.filter(candidate => control.contains(candidate.view)) : []
  const chosen = direct ?? (enclosed.length === 1 ? enclosed[0] : undefined) ?? candidates[0]
  if (chosen) {
    selectedSources.set(entryKey, chosen.source)
    if (activation) activation.target = undefined
  }
  return chosen?.view
}

/** Zoom transitions require a visible source: at least part of it in the viewport. */
function isOnScreen(view: HTMLElement) {
  const bounds = view.getBoundingClientRect()
  if (!(bounds.width > 0 && bounds.height > 0)) return false
  return (
    bounds.bottom > 0 &&
    bounds.right > 0 &&
    bounds.top < window.innerHeight &&
    bounds.left < window.innerWidth
  )
}

/* ------------------------------------------------------------------ choosing the controller */

/** What a zoom-dismissing drag needs from its transition. */
export type ZoomDragHandle = Readonly<{
  /** Moves the screen with the finger: translation in points since the finger went down. */
  track(translation: Readonly<{ x: number; y: number }>): void
  /** Lets go: dismisses into the source or returns to full screen. Velocity in points/second. */
  release(velocity: Readonly<{ x: number; y: number }>): void
}>

const dragHandles = new WeakMap<TransitionController, ZoomDragHandle>()
const zoomDeciders = new WeakMap<TransitionController, (binding: TransitionBinding) => boolean>()

/**
 * Whether `controller` runs as a zoom once bound to `binding`. Deciding is idempotent and can
 * happen before the binding is handed over (the navigator prepares glass first).
 */
export function decideZoomTransition(controller: TransitionController, binding: TransitionBinding) {
  return zoomDeciders.get(controller)?.(binding) ?? false
}

/** The drag handle of an interactive pop that a zoom drag started, once the pop is a zoom. */
export function zoomDragHandleOf(controller: TransitionController | undefined) {
  return controller ? dragHandles.get(controller) : undefined
}

/**
 * Marks the next interactive pop of `entryKey` as a zoom drag (not the edge back swipe). The touch
 * position is where the finger went down, which stays under the finger as the screen shrinks.
 */
export function beginZoomDrag(entryKey: string, touchDown: Readonly<{ x: number; y: number }>) {
  draggedEntryKey = entryKey
  pendingTouchDown = touchDown
}
let pendingTouchDown: Readonly<{ x: number; y: number }> = { x: 0, y: 0 }

/**
 * Wraps the slide controller factory: each transition binds first, then runs as a zoom when its
 * screens asked for one, and as the unchanged slide otherwise.
 */
export function withZoomTransitions(
  createSlide: TransitionControllerFactory,
): TransitionControllerFactory {
  return (completion, context) => createZoomAwareController(completion, context, createSlide)
}

function createZoomAwareController(
  completion: TransitionCompletion,
  context: TransitionControllerContext,
  createSlide: TransitionControllerFactory,
): TransitionController {
  const slide = createSlide(completion, context)
  let zoom: TransitionController | undefined
  let decided = false
  let startRequested = false
  let slideStarted = false
  let zoomStarted = false
  /** Starts whichever controller runs this transition, once. */
  const startActive = () => {
    if (zoom) {
      if (zoomStarted) return
      zoomStarted = true
      zoom.start?.()
    } else if (!slideStarted) {
      slideStarted = true
      slide.start?.()
    }
  }
  const active = () => zoom ?? slide

  // A zoom drag marks its pop before beginning it; a plain back swipe never does.
  const dragTouchDown = context.interactive && draggedEntryKey ? pendingTouchDown : undefined
  draggedEntryKey = undefined

  const decide = (binding: TransitionBinding) => {
    if (decided) return
    decided = true
    const plan = zoomPlan(binding, context, dragTouchDown)
    if (!plan) return
    zoom = createZoomController(completion, context, plan, wrapper)
  }

  const forward = <Name extends keyof TransitionController>(name: Name) =>
    ((...args: unknown[]) =>
      (active()[name] as ((...values: unknown[]) => unknown) | undefined)?.(
        ...args,
      )) as NonNullable<TransitionController[Name]>
  const optional = <Name extends keyof TransitionController>(name: Name) =>
    active()[name] ? forward(name) : undefined

  const wrapper: TransitionController = {
    get progress() {
      return active().progress
    },
    get interactionPhase() {
      return active().interactionPhase
    },
    get finishForPush() {
      return optional('finishForPush')
    },
    get yieldForPop() {
      return optional('yieldForPop')
    },
    get resumeInteractive() {
      return optional('resumeInteractive')
    },
    get prepareForNextGesture() {
      return optional('prepareForNextGesture')
    },
    get scrubFromScroll() {
      return optional('scrubFromScroll')
    },
    get resolveInteractive() {
      return optional('resolveInteractive')
    },
    get presentedPose() {
      return optional('presentedPose')
    },
    setProgress: forward('setProgress'),
    completeInteractive: forward('completeInteractive'),
    cancelInteractive: forward('cancelInteractive'),
    start() {
      startRequested = true
      if (decided) {
        startActive()
        return
      }
      // Before the decision the slide starts as it always has: it waits for its binding itself,
      // and finishes at once under reduced motion. If a zoom is chosen, the slide is never bound
      // and does nothing. A zoom drag's pop never starts as a slide.
      if (!dragTouchDown || prefersReducedMotion()) {
        slideStarted = true
        slide.start?.()
      }
    },
    bind(binding) {
      decide(binding)
      const release = active().bind?.(binding) ?? (() => undefined)
      if (startRequested) startActive()
      return release
    },
    finish: forward('finish'),
    cancel: forward('cancel'),
  }
  zoomDeciders.set(wrapper, binding => {
    decide(binding)
    return zoom !== undefined
  })
  return wrapper
}

function prefersReducedMotion() {
  if (typeof window === 'undefined') return true
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

type ZoomPlan = Readonly<{
  source: HTMLElement
  /** Where the finger went down, for a drag-started pop. */
  touchDown?: Readonly<{ x: number; y: number }>
  /** The pop is the edge back swipe: natively it zooms too, shrinking the screen under the finger. */
  edge?: boolean
}>

/** A transition is a zoom when its front screen asked for one and the source is visible behind. */
function zoomPlan(
  binding: TransitionBinding,
  context: TransitionControllerContext,
  touchDown: Readonly<{ x: number; y: number }> | undefined,
): ZoomPlan | undefined {
  if (prefersReducedMotion() || !binding.secondary) return undefined
  if (context.operation !== 'push' && context.operation !== 'pop') return undefined
  const entryKey = entryKeyOf(binding.primary)
  if (!entryKey) return undefined
  const source = visibleZoomSource(entryKey, binding.secondary)
  if (!source || typeof binding.primary.animate !== 'function') return undefined
  if (context.interactive && !touchDown) return { source, edge: true }
  return { source, ...(touchDown ? { touchDown } : {}) }
}

/* ------------------------------------------------------------------ the zoom controller */

type Lifecycle = 'created' | 'started' | 'completed'
type Target = 'finish' | 'cancel'
/** The four ways the window moves: push and pop (automatic), and a released drag's two endings. */
type RunKind = 'push' | 'pop' | 'dismiss' | 'return'

/** What a zoom moves: the front screen's two clipping boxes, the source tile drawn in the window,
 * the screen behind (scaled and dimmed) and the bar's items. */
type ZoomStage = Readonly<{
  container: HTMLElement
  motion: HTMLElement
  /** A sibling of the page, so its source stays opaque as the page fades out. */
  portal: HTMLElement
  ghost: HTMLElement
  screen: ZoomRect
  source: ZoomWindow
  /** The page's own clip, which remains when the temporary zoom boxes are cleared. */
  restingRadius: number
  cornerStyles: ReadonlyArray<Readonly<{ element: HTMLElement; value: string; priority: string }>>
  imagesReady?: Promise<void>
  sourceVisibility: string
  containerVisibility: string
  pageOpacity: number
  opacityStyle: string
  opacityPriority: string
  releaseGlass: () => void
}>

function createZoomController(
  completion: TransitionCompletion,
  context: TransitionControllerContext,
  plan: ZoomPlan,
  owner: TransitionController,
): TransitionController {
  let lifecycle: Lifecycle = 'created'
  let interactionPhase: 'held' | 'completing' | 'cancelling' = context.interactive
    ? 'held'
    : 'completing'
  let binding: TransitionBinding | undefined
  let stage: ZoomStage | undefined
  let shown: ZoomWindow | undefined
  let progress = 0
  let animations: Animation[] = []
  let generation = 0
  let preparation: AbortController | undefined
  let dragTranslation = { x: 0, y: 0 }
  let readyToMove = true
  let pendingRelease: (() => void) | undefined
  let glassFrames: readonly { ms: number; front: ZoomGlassPose; rear: ZoomGlassPose }[] = []

  const glassPose = (pose: ZoomWindow, receded: number) => {
    const screen = stage!.screen
    const scale = 1 - (1 - ZOOM_REAR_SCALE) * receded
    const rear = {
      x: screen.x + (screen.width * (1 - scale)) / 2,
      y: screen.y + (screen.height * (1 - scale)) / 2,
      width: screen.width * scale,
      height: screen.height * scale,
    }
    return {
      front: {
        origin: [screen.x, screen.y] as const,
        x: pose.rect.x,
        y: pose.rect.y,
        scale: pose.rect.width / screen.width,
        clip: [pose.rect.x, pose.rect.y, pose.rect.width, pose.rect.height] as const,
        radius: pose.radius,
      },
      rear: {
        origin: [screen.x, screen.y] as const,
        x: rear.x,
        y: rear.y,
        scale,
        clip: [rear.x, rear.y, rear.width, rear.height] as const,
        radius: 0,
      },
    }
  }

  const glassTrack = (side: 'front' | 'rear', at: number) => {
    const animation = animations[0]
    const running = animation?.playState === 'running' && typeof animation.startTime === 'number'
    const start = running ? Number(animation.startTime) : at - Number(animation?.currentTime ?? 0)
    const duration = glassFrames.at(-1)?.ms ?? 0
    return {
      end: running ? start + duration : at,
      sample: (time: number): ZoomGlassPose => {
        const elapsed = Math.max(0, Math.min(duration, (running ? time : at) - start))
        const index = glassFrames.findIndex(frame => frame.ms >= elapsed)
        const upper = glassFrames[Math.max(0, index)]!
        const lower = glassFrames[Math.max(0, index - 1)]!
        const fraction = upper.ms === lower.ms ? 0 : (elapsed - lower.ms) / (upper.ms - lower.ms)
        const from = lower[side],
          to = upper[side]
        const mix = (a: number, b: number) => a + (b - a) * fraction
        return {
          origin: from.origin,
          x: mix(from.x, to.x),
          y: mix(from.y, to.y),
          scale: mix(from.scale, to.scale),
          clip: from.clip.map((value, i) => mix(value, to.clip[i]!)) as [
            number,
            number,
            number,
            number,
          ],
          radius: mix(from.radius, to.radius),
        }
      },
    }
  }

  const fullWindow = (): ZoomWindow => ({ rect: stage!.screen, radius: stage!.restingRadius })
  /** Corners follow width openness, including the page's exact resting endpoint. */
  const windowAt = (rect: ZoomRect): ZoomWindow => ({
    rect,
    radius: windowRadius(openOf(rect), stage!.source.radius, stage!.restingRadius),
  })
  const openOf = (rect: ZoomRect) => openness(stage!.screen, stage!.source.rect, rect)

  /** The bar's items that arrive with the zoomed screen, and the rear screen's that leave. */
  const frontChrome = () =>
    binding
      ? [binding.primaryTitle, ...(binding.primaryToolbar ?? []), backVisualIfChanging()].filter(
          (element): element is HTMLElement => element !== undefined,
        )
      : []
  const rearChrome = () =>
    binding
      ? [binding.secondaryTitle, ...(binding.secondaryToolbar ?? [])].filter(
          (element): element is HTMLElement => element !== undefined,
        )
      : []
  const backVisualIfChanging = () =>
    binding?.backButtonVisual && binding.backButtonFromVisible !== binding.backButtonToVisible
      ? binding.backButtonVisual
      : undefined

  /** How far the screen behind has receded: 0 at rest, 1 scaled down and dimmed. */
  const rearStyle = (receded: number) => ({
    transform: `scale(${round(1 - (1 - ZOOM_REAR_SCALE) * receded, 5)})`,
    dim: ZOOM_DIM_OPACITY * receded,
  })

  /** Draws one moment at once (the first frame, and every finger move). */
  const render = (pose: ZoomWindow, receded: number, tileOpacity: number, chrome: number) => {
    if (!binding || !stage) return
    shown = pose
    glassFrames = [{ ms: 0, ...glassPose(pose, receded) }]
    const style = windowStyle(stage.screen, pose)
    stage.container.style.transform = style.containerTransform
    stage.motion.style.transform = style.motionTransform
    stage.portal.style.transform = style.motionTransform
    stage.container.style.borderRadius = style.borderRadius
    stage.motion.style.borderRadius = style.borderRadius
    stage.portal.style.borderRadius = style.borderRadius
    stage.ghost.style.opacity = String(tileOpacity)
    stage.motion.style.opacity = String(stage.pageOpacity)
    const rear = rearStyle(receded)
    if (binding.secondary) binding.secondary.style.transform = rear.transform
    if (binding.secondaryDim) binding.secondaryDim.style.opacity = String(rear.dim)
    for (const element of frontChrome()) Object.assign(element.style, chromeStyle(chrome))
    for (const element of rearChrome()) Object.assign(element.style, chromeStyle(1 - chrome))
  }

  const stopAnimations = () => {
    generation++
    preparation?.abort()
    preparation = undefined
    for (const animation of animations) {
      animation.onfinish = null
      animation.cancel()
    }
    animations = []
  }

  /** Hands every element back as it was: the zoom leaves no styles behind. */
  const clearStage = () => {
    if (!stage || !binding) return
    stage.releaseGlass()
    const boxStyles = ['transform', 'transform-origin', 'overflow', 'border-radius', 'position']
    for (const property of boxStyles) {
      stage.container.style.removeProperty(property)
      stage.motion.style.removeProperty(property)
    }
    for (const { element, value, priority } of stage.cornerStyles) {
      if (value) element.style.setProperty('border-radius', value, priority)
    }
    stage.portal.remove()
    if (stage.opacityStyle)
      stage.motion.style.setProperty('opacity', stage.opacityStyle, stage.opacityPriority)
    else stage.motion.style.removeProperty('opacity')
    binding.secondary?.style.removeProperty('transform')
    binding.secondary?.style.removeProperty('transform-origin')
    binding.secondaryDim?.style.removeProperty('opacity')
    for (const element of [...frontChrome(), ...rearChrome()]) {
      for (const property of ['opacity', 'scale', 'filter']) element.style.removeProperty(property)
    }
    plan.source.style.visibility = stage.sourceVisibility
    stage.container.style.visibility = stage.containerVisibility
  }

  const complete = (target: Target) => {
    if (lifecycle === 'completed') return
    lifecycle = 'completed'
    stopScrub()
    stopAnimations()
    clearStage()
    // React retires the outgoing route after this callback. Never repaint its restored
    // full-size page in the gap between retiring the portal and that DOM commit.
    if (target === 'finish' && context.operation === 'pop' && stage)
      stage.container.style.visibility = 'hidden'
    progress = target === 'finish' ? 1 : 0
    if (target === 'finish') completion.finish()
    else completion.cancel()
  }

  /**
   * Moves the window from `from` to `to` the way native does for `kind`: each frame of the
   * channel springs becomes the two boxes' transforms (compositor), their corner radius, the
   * tile's cross-fade, the screen behind and the bar's items. `receded` is how far the screen
   * behind has receded at the start.
   */
  const run = (
    kind: RunKind,
    target: Target,
    from: ZoomWindow,
    to: ZoomWindow,
    velocity: Readonly<{ x: number; y: number }>,
    receded: number,
  ) => {
    if (!binding || !stage) return
    stopAnimations()
    const runGeneration = generation
    const frames = windowKeyframes(from.rect, to.rect, springsFor(kind), velocity)
    const startOpen = Math.max(openOf(from.rect), 0.001)
    const recededAt = (rect: ZoomRect) => {
      if (kind === 'return') return receded
      if (kind === 'dismiss') return receded * Math.min(1, openOf(rect) / startOpen)
      return openOf(rect)
    }
    const duration = frames.at(-1)!.ms
    glassFrames = frames.map(frame => ({
      ms: frame.ms,
      ...glassPose(windowAt(frame.rect), recededAt(frame.rect)),
    }))
    const options: KeyframeAnimationOptions = { duration, easing: 'linear', fill: 'forwards' }
    const keyed = <Value>(value: (frame: WindowFrame) => Value) =>
      frames.map(frame => ({ offset: duration > 0 ? frame.ms / duration : 1, value: value(frame) }))
    const styles = keyed(frame => windowStyle(stage!.screen, windowAt(frame.rect)))
    const animate = (element: HTMLElement | undefined, keyframes: Keyframe[]) => {
      if (!element?.animate) return
      animations.push(element.animate(keyframes, options))
    }
    // The moving boxes first: their transforms stay on the compositor. The corner radius is a
    // separate effect, so a main-thread value never holds the edges back.
    animate(
      stage.container,
      styles.map(({ offset, value }) => ({ offset, transform: value.containerTransform })),
    )
    animate(
      stage.motion,
      styles.map(({ offset, value }) => ({ offset, transform: value.motionTransform })),
    )
    animate(
      stage.portal,
      styles.map(({ offset, value }) => ({ offset, transform: value.motionTransform })),
    )
    for (const box of [stage.container, stage.motion, stage.portal]) {
      animate(
        box,
        styles.map(({ offset, value }) => ({ offset, borderRadius: value.borderRadius })),
      )
    }
    animate(
      stage.ghost,
      keyed(frame => tileOpacity(kind, frame.ms)).map(({ offset, value }) => ({
        offset,
        opacity: value,
      })),
    )
    animate(
      stage.motion,
      keyed(frame => stage!.pageOpacity * pageOpacity(kind, frame.ms)).map(({ offset, value }) => ({
        offset,
        opacity: value,
      })),
    )
    const rear = keyed(frame => rearStyle(recededAt(frame.rect)))
    animate(
      binding.secondary,
      rear.map(({ offset, value }) => ({ offset, transform: value.transform })),
    )
    animate(
      binding.secondaryDim,
      rear.map(({ offset, value }) => ({ offset, opacity: value.dim })),
    )
    const chrome = keyed(frame => chromeOpacity(kind, frame.ms))
    for (const element of frontChrome())
      animate(
        element,
        chrome.map(({ offset, value }) => ({ offset, ...chromeDissolve(value) })),
      )
    for (const element of rearChrome())
      animate(
        element,
        chrome.map(({ offset, value }) => ({ offset, ...chromeDissolve(1 - value) })),
      )
    shown = to
    for (const animation of animations) {
      const element = (animation.effect as KeyframeEffect | null)?.target
      if (element) announceAnimation(element)
    }
    if (!animations.length) return
    animations[0]!.onfinish = () => {
      if (runGeneration !== generation) return
      complete(target)
    }
    if (kind === 'push' || kind === 'pop') playWhenPrepared(runGeneration)
  }

  /** Both directions revalidate the nodes they reveal, including the artwork copy. */
  const playWhenPrepared = (runGeneration: number) => {
    if (!binding) return
    const prepared = animations
    for (const animation of prepared) animation.pause()
    preparation = new AbortController()
    void Promise.all([
      ...prepared.map(animation => animation.ready),
      prepareDestinationImages(binding.primary, preparation.signal),
      binding.secondary ? prepareRevealedImages(binding.secondary) : undefined,
      stage?.imagesReady,
      binding.glassReady,
    ]).then(
      () => {
        if (runGeneration !== generation) return
        if (stage) {
          plan.source.style.visibility = 'hidden'
          stage.container.style.visibility = stage.containerVisibility
        }
        const start = performance.now()
        for (const animation of prepared) {
          animation.currentTime = 0
          animation.play()
          animation.startTime = start
          const element = (animation.effect as KeyframeEffect | null)?.target
          if (element) announceAnimation(element)
        }
      },
      () => {
        if (runGeneration === generation) complete(binding?.glassReady ? 'cancel' : 'finish')
      },
    )
  }

  const startAutomatic = () => {
    if (!binding || !stage || lifecycle !== 'started' || animations.length) return
    if (context.interactive) return
    if (context.operation === 'push')
      run('push', 'finish', stage.source, fullWindow(), NO_VELOCITY, 0)
    else run('pop', 'finish', shown ?? fullWindow(), stage.source, NO_VELOCITY, 1)
  }

  const release = (velocity: Readonly<{ x: number; y: number }>) => {
    if (!readyToMove) {
      pendingRelease = () => release(velocity)
      return
    }
    if (lifecycle === 'completed' || interactionPhase !== 'held' || !stage) return
    const dismiss = dragTranslation.y > ZOOM_DISMISS_DISTANCE
    interactionPhase = dismiss ? 'completing' : 'cancelling'
    completion.changed?.()
    const from = shown ?? fullWindow()
    if (dismiss) run('dismiss', 'finish', from, stage.source, velocity, 1)
    else run('return', 'cancel', from, fullWindow(), velocity, 1)
  }

  /** Sets up the boxes and the tile, measured at rest (the entering screen arrives parked off
   * screen by its own transform, which the zoom replaces). */
  const prepareStage = (next: TransitionBinding): ZoomStage | undefined => {
    const container = next.primary.parentElement
    if (!container) return undefined
    next.primary.style.transform = 'none'
    container.style.transform = 'none'
    const screen = rectOf(next.primary)
    const source: ZoomWindow = { rect: rectOf(plan.source), radius: cornerRadiusOf(plan.source) }
    // The display's physical mask is outside the page. Using its radius here would
    // hold rounded CSS corners until cleanup, then snap them to the page's own clip.
    const restingRadius = Math.max(cornerRadiusOf(container), cornerRadiusOf(next.primary))
    const cornerStyles = [container, next.primary].map(element => ({
      element,
      value: element.style.getPropertyValue('border-radius'),
      priority: element.style.getPropertyPriority('border-radius'),
    }))
    for (const box of [container, next.primary]) {
      box.style.transformOrigin = '0 0'
      box.style.overflow = 'hidden'
    }
    // The tile is placed against the motion layer's top left.
    if (getComputedStyle(next.primary).position === 'static')
      next.primary.style.position = 'relative'
    if (next.secondary) next.secondary.style.transformOrigin = '50% 50%'
    const sourceVisibility = plan.source.style.visibility
    const containerVisibility = container.style.visibility
    const ghost = tileGhost(plan.source, screen.width, source.rect)
    const portal = container.ownerDocument.createElement('div')
    portal.dataset.satinZoomSourcePortal = 'true'
    portal.setAttribute('aria-hidden', 'true')
    portal.inert = true
    Object.assign(portal.style, {
      position: 'absolute',
      inset: '0px',
      width: `${screen.width}px`,
      height: `${screen.height}px`,
      transformOrigin: '0 0',
      overflow: 'hidden',
      pointerEvents: 'none',
      zIndex: '1',
    })
    const opacityStyle = next.primary.style.getPropertyValue('opacity')
    const opacityPriority = next.primary.style.getPropertyPriority('opacity')
    const opacity = Number.parseFloat(getComputedStyle(next.primary).opacity)
    const imagesReady = prepareClonedImages(plan.source, ghost)
    // Do not cover the still-painted source with an undecoded image clone. The same
    // paused entrance is revealed only after both its images and glass are ready.
    if (imagesReady && context.operation === 'push') container.style.visibility = 'hidden'
    else plan.source.style.visibility = 'hidden'
    void imagesReady?.catch(() => {})
    portal.append(ghost)
    container.append(portal)
    return {
      container,
      motion: next.primary,
      portal,
      ghost,
      screen,
      source,
      restingRadius,
      cornerStyles,
      imagesReady,
      sourceVisibility,
      containerVisibility,
      pageOpacity: Number.isFinite(opacity) ? opacity : 1,
      opacityStyle,
      opacityPriority,
      releaseGlass: (() => {
        const releases = [
          registerZoomGlass(next.primary, {
            layout: screen,
            carriers: [container, next.primary],
            read: at => glassTrack('front', at),
          }),
        ]
        if (next.secondary)
          releases.push(
            registerZoomGlass(next.secondary, {
              layout: screen,
              carriers: [next.secondary],
              read: at => glassTrack('rear', at),
            }),
          )
        return () => releases.forEach(release => release())
      })(),
    }
  }

  let edgeProgress = 0
  let scrub: { frame: number } | undefined
  const dragPose = () =>
    windowAt(
      plan.edge ? edgeRect(stage!.screen, edgeProgress) : dragRect(stage!.screen, dragTranslation),
    )
  const stopScrub = () => {
    if (scrub) window.cancelAnimationFrame(scrub.frame)
    scrub = undefined
  }
  /** The edge swipe lets go: the slide's own rule decides, then native's springs finish it. */
  const releaseEdge = (velocity: number, raw: number | undefined, cancelled: boolean) => {
    if (!readyToMove) {
      pendingRelease = () => releaseEdge(velocity, raw, cancelled)
      return
    }
    if (lifecycle === 'completed' || interactionPhase !== 'held' || !stage) return
    stopScrub()
    if (raw !== undefined) edgeProgress = raw
    const dismiss = !cancelled && shouldCompleteInteractivePop(edgeProgress, velocity)
    interactionPhase = dismiss ? 'completing' : 'cancelling'
    completion.changed?.()
    const from = shown ?? fullWindow()
    const push = { x: velocity, y: 0 }
    if (dismiss) run('dismiss', 'finish', from, stage.source, push, 1)
    else run('return', 'cancel', from, fullWindow(), push, 1)
  }

  const controller: TransitionController = {
    get progress() {
      return progress
    },
    get interactionPhase() {
      return context.interactive ? interactionPhase : undefined
    },
    start() {
      if (lifecycle !== 'created') return
      lifecycle = 'started'
      startAutomatic()
    },
    bind(nextBinding) {
      if (lifecycle === 'completed') return () => undefined
      if (binding?.primary === nextBinding.primary) {
        binding = nextBinding
        return () => undefined
      }
      binding = nextBinding
      stage = prepareStage(nextBinding)
      if (!stage) {
        complete('finish')
        return () => undefined
      }
      // The first frame is already the transition's: never a full-screen flash before it runs.
      if (context.interactive) {
        readyToMove = !binding.glassReady && !stage.imagesReady
        render(fullWindow(), 1, 0, 1)
        if (!readyToMove) {
          const runGeneration = generation
          void Promise.all([
            binding.glassReady,
            stage.imagesReady,
            binding.secondary ? prepareRevealedImages(binding.secondary) : undefined,
          ]).then(
            () => {
              if (lifecycle === 'completed' || runGeneration !== generation) return
              readyToMove = true
              render(dragPose(), 1, 0, 1)
              const release = pendingRelease
              pendingRelease = undefined
              release?.()
            },
            () => complete('cancel'),
          )
        }
      } else if (context.operation === 'push') render(stage.source, 0, 1, 0)
      else render(fullWindow(), 1, 0, 1)
      startAutomatic()
      return () => {
        if (lifecycle === 'completed' && stage)
          stage.container.style.visibility = stage.containerVisibility
      }
    },
    setProgress(next) {
      // The edge swipe's frame loop: progress is the finger's travel over the screen's width.
      // A zoom drag moves in two dimensions through its drag handle instead.
      if (!plan.edge || lifecycle === 'completed' || interactionPhase !== 'held' || !stage) return
      stopScrub()
      edgeProgress = Math.max(0, next)
      if (readyToMove) render(dragPose(), 1, 0, 1)
    },
    scrubFromScroll(source, origin, adjustment) {
      // The native back-swipe scroller drives the swipe: follow it once per frame.
      if (!plan.edge || lifecycle === 'completed' || !stage) return
      stopScrub()
      const follow = () => {
        edgeProgress = Math.max(0, (origin - source.scrollLeft + adjustment) / stage!.screen.width)
        if (readyToMove) render(dragPose(), 1, 0, 1)
        scrub = { frame: window.requestAnimationFrame(follow) }
      }
      follow()
    },
    resolveInteractive(velocity, raw, cancelled) {
      if (plan.edge) releaseEdge(velocity, raw, cancelled)
    },
    completeInteractive(velocity) {
      if (interactionPhase !== 'held') return
      if (plan.edge) {
        releaseEdge(Math.max(velocity, 0), undefined, false)
        return
      }
      dragTranslation = {
        x: dragTranslation.x,
        y: Math.max(dragTranslation.y, ZOOM_DISMISS_DISTANCE + 1),
      }
      release(NO_VELOCITY)
    },
    cancelInteractive(velocity) {
      if (lifecycle === 'completed' || interactionPhase !== 'held') return
      if (plan.edge) {
        releaseEdge(velocity, undefined, true)
        return
      }
      dragTranslation = { x: 0, y: 0 }
      release(NO_VELOCITY)
    },
    finish() {
      complete('finish')
    },
    cancel() {
      complete('cancel')
    },
  }

  dragHandles.set(owner, {
    track(translation) {
      if (lifecycle === 'completed' || interactionPhase !== 'held' || !stage) return
      dragTranslation = { x: translation.x, y: translation.y }
      if (readyToMove) render(dragPose(), 1, 0, 1)
    },
    release,
  })
  return controller
}

const NO_VELOCITY = { x: 0, y: 0 } as const

function springsFor(kind: RunKind): ZoomSprings & { height?: ZoomSpring } {
  if (kind === 'push') return ZOOM_PUSH
  if (kind === 'pop') return ZOOM_POP
  if (kind === 'dismiss') return ZOOM_DISMISS
  return ZOOM_RETURN
}

/** The source tile's opacity over the window `ms` into a run: it fades out early in a push and in
 * early in a pop or a dismissal. */
function tileOpacity(kind: RunKind, ms: number) {
  if (kind === 'return') return 0
  const fade = kind === 'push' ? ZOOM_PUSH_SOURCE_FADE_MS : ZOOM_POP_SOURCE_FADE_MS
  const progress = clamp01((ms - fade.start) / (fade.end - fade.start))
  return kind === 'push' ? 1 - progress : progress
}

/** The native page and source have independent alpha channels. Cancelled gestures and
 * pushes retain their existing page presentation; only a return to the tile retires it. */
function pageOpacity(kind: RunKind, ms: number) {
  if (kind !== 'pop' && kind !== 'dismiss') return 1
  const index = ZOOM_POP_PAGE_ALPHA.findIndex(([time]) => time >= ms)
  if (index < 0) return 0
  const [end, to] = ZOOM_POP_PAGE_ALPHA[index]!
  const [start, from] = ZOOM_POP_PAGE_ALPHA[Math.max(0, index - 1)]!
  const fraction = end === start ? 0 : (ms - start) / (end - start)
  return from + (to - from) * fraction
}

/** The bar items' opacity `ms` into a run: in on a smoothstep over a push, out linearly over a pop. */
function chromeOpacity(kind: RunKind, ms: number) {
  if (kind === 'return') return 1
  if (kind === 'push') {
    const progress = clamp01(ms / ZOOM_PUSH_CHROME_FADE_MS)
    return progress * progress * (3 - 2 * progress)
  }
  const fade = ZOOM_POP_CHROME_FADE_MS
  return 1 - clamp01((ms - fade.start) / (fade.end - fade.start))
}

function chromeStyle(opacity: number) {
  const frame = chromeDissolve(opacity)
  return {
    opacity: String(frame.opacity),
    scale: String(frame.scale),
    filter: String(frame.filter),
  }
}

/**
 * A copy of the source view drawn over the window's top square, as natively (a portal of the tile
 * scaled to the window's width). Its separate portal uses the page's motion at screen width, so it scales
 * and clips with the window. Its image nodes are decoded separately before the window is shown.
 */
function tileGhost(source: HTMLElement, screenWidth: number, sourceRect: ZoomRect) {
  const ghost = source.cloneNode(true) as HTMLElement
  const look = getComputedStyle(source)
  ghost.removeAttribute('id')
  ghost.setAttribute('aria-hidden', 'true')
  ghost.inert = true
  const height = sourceRect.width > 0 ? (screenWidth * sourceRect.height) / sourceRect.width : 0
  Object.assign(ghost.style, {
    position: 'absolute',
    left: '0px',
    top: '0px',
    margin: '0px',
    zIndex: '2147483647',
    width: `${screenWidth}px`,
    height: `${height}px`,
    maxWidth: 'none',
    borderRadius: '0px',
    transform: 'none',
    pointerEvents: 'none',
    visibility: 'visible',
    backgroundColor: look.backgroundColor,
    backgroundImage: look.backgroundImage,
    backgroundSize: look.backgroundSize,
    backgroundPosition: look.backgroundPosition,
    objectFit: look.objectFit,
    objectPosition: look.objectPosition,
  })
  return ghost
}

const FRAME_MS = 1000 / 60
const LONGEST_RUN_MS = 2000
/** Below a third of a point the remaining travel is invisible at 3× on a phone. */
const REST_POINTS = 0.3

type WindowFrame = Readonly<{ ms: number; rect: ZoomRect }>

/**
 * The 60 Hz frames of one window run, as native moves it: the window's centre follows one spring
 * and its size another (a push moves the width with the centre and the height on its own spring).
 * The finger's velocity starts the centre moving.
 */
export function windowKeyframes(
  from: ZoomRect,
  to: ZoomRect,
  springs: ZoomSprings & { height?: ZoomSpring },
  velocity: Readonly<{ x: number; y: number }>,
): WindowFrame[] {
  const center = (rect: ZoomRect) => ({
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  })
  const start = center(from)
  const end = center(to)
  const channels = [
    { spring: springs.center, from: start.x, to: end.x, velocity: velocity.x },
    { spring: springs.center, from: start.y, to: end.y, velocity: velocity.y },
    { spring: springs.size, from: from.width, to: to.width, velocity: 0 },
    { spring: springs.height ?? springs.size, from: from.height, to: to.height, velocity: 0 },
  ].map(channel => ({
    ...channel,
    animation: animationOf(channel.spring),
    motion: { displacement: channel.from - channel.to, velocity: channel.velocity },
  }))
  const valueAt = (channel: (typeof channels)[number], ms: number) =>
    channel.to + sampleChannel(channel.animation, channel.motion, ms).offset
  const frames: WindowFrame[] = []
  for (let ms = 0; ms <= LONGEST_RUN_MS; ms += FRAME_MS) {
    const [x, y, width, height] = channels.map(channel => valueAt(channel, ms))
    frames.push({
      ms,
      rect: { x: x! - width! / 2, y: y! - height! / 2, width: width!, height: height! },
    })
    const moving = channels.some(
      channel => Math.abs(valueAt(channel, ms) - channel.to) > REST_POINTS,
    )
    if (!moving && ms > FRAME_MS * 3) break
  }
  frames.push({ ms: frames.at(-1)!.ms + FRAME_MS, rect: to })
  return frames
}

/** A measured Core Animation spring as Satin's `Animation` (the duration/bounce representation is
 * exact: omega = 2π / duration, damping ratio = 1 − bounce). */
function animationOf(spring: ZoomSpring) {
  return SpringAnimation.spring({
    durationMs: ((2 * Math.PI) / spring.omega) * 1000,
    bounce: 1 - spring.zeta,
  })
}

function rectOf(element: HTMLElement): ZoomRect {
  const bounds = element.getBoundingClientRect()
  return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
}

function cornerRadiusOf(element: HTMLElement) {
  const radius = Number.parseFloat(getComputedStyle(element).borderTopLeftRadius)
  return Number.isFinite(radius) ? radius : 0
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

function round(value: number, digits = 3) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}
