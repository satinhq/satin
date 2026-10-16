// The animated transition controller: runs one push or pop, automatic or under a back swipe,
// from its start to `completion`. Page poses and tracks live in transitionPose.ts, bar chrome in
// transitionChrome.ts, measured values in motionTokens.ts and chromeCurves.ts, and the native
// back-swipe scroller in nativeScrubSource.ts.

import { announceAnimation } from '../motion/animate.ts'
import { announceToolbarMotion } from './toolbarMotionOwner.ts'
import { prepareDestinationImages } from '../image/resource.ts'
import { projectedNavigationCompletion, type NavigationReleaseDecision } from './releaseDecision.ts'
import { beginMotionProbe, recordMotionPreparation } from '../motionProbe.ts'
import type {
  TransitionBinding,
  TransitionCompletion,
  TransitionController,
  TransitionControllerContext,
} from './types.ts'
import { createNavigationReleaseTrajectory } from './releaseTrajectory.ts'
import {
  NAVIGATION_DURATION_MS,
  NAVIGATION_EASING_CSS,
  shouldCompleteInteractivePop,
} from './motionTokens.ts'
import {
  rearmNativeScrubSource,
  releaseNativeScrubClamp,
  retireNativeScrubSource,
} from './nativeScrubSource.ts'
import {
  holdInterruptedChrome,
  keepChromeTails,
  primaryPrincipal,
  settleHeldChrome,
} from './transitionChrome.ts'
import {
  animateBinding,
  clearBinding,
  createScrollScrubTracks,
  holdPushOrigins,
  isPageAnimation,
  prepareBinding,
  presentedTranslateX,
  releasePushOrigins,
  renderBinding,
  samplePushOrigins,
  traceTracks,
} from './transitionPose.ts'

// Re-exported so existing imports of navigation/motion.ts keep working.
export {
  NAVIGATION_DIM_OPACITY,
  NAVIGATION_DIRECTION_LOCK_PX,
  NAVIGATION_DURATION_MS,
  NAVIGATION_EASING,
  NAVIGATION_EASING_CSS,
  NAVIGATION_EDGE_SHADOW_OPACITY,
  NAVIGATION_EDGE_SHADOW_WIDTH_PX,
  NAVIGATION_HORIZONTAL_INTENT_PX,
  NAVIGATION_PARALLAX_FRACTION,
  NAVIGATION_POSITION_THRESHOLD,
  NAVIGATION_VELOCITY_THRESHOLD_PX_PER_SECOND,
  navigationMotionTokens,
  sampleNavigationCurve,
  shouldCompleteInteractivePop,
} from './motionTokens.ts'
export {
  NAVIGATION_CHROME_CURVES,
  NAVIGATION_CHROME_DISSOLVE,
  NAVIGATION_LEADING_SWAP,
  NAVIGATION_SEARCH_FIELD_APPEAR,
  chromeCurveOpacity,
  chromeDissolve,
  leadingSwapFrames,
} from './chromeCurves.ts'
export {
  NATIVE_SCRUB_REARM_COMMIT_MS,
  NATIVE_SCRUB_RETIRED_ATTRIBUTE,
  nativeScrubSourceLiveAt,
  rearmNativeScrubSource,
  releaseNativeScrubClamp,
  retireNativeScrubSource,
} from './nativeScrubSource.ts'

type AnimationTarget = 'cancel' | 'finish'

/** A controller is created with its transition, started once the transition is published, and
 * completed exactly once (finished or cancelled). Nothing runs after completion. */
type ControllerLifecycle = 'created' | 'started' | 'completed'

type InteractionPhase = NonNullable<TransitionController['interactionPhase']>

/** An attached native back-swipe scrub: the private scroller that drives the page tracks, and
 * the scroll position (`origin`, corrected by `adjustment`) at which the page is at rest. */
type NativeScrub = { source: HTMLElement; origin: number; adjustment: number; attachedX: number }

/** The page progress a native scrub's scroller describes now (unbounded). */
function scrubbedProgress(scrub: NativeScrub, width: number) {
  return (scrub.origin - scrub.source.scrollLeft + scrub.adjustment) / width
}

function prefersReducedMotion() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return true
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/** Whether every element the binding moves supports Web Animations (test doubles may not). */
function canAnimate(binding: TransitionBinding) {
  return !(
    typeof binding.primary.animate !== 'function' ||
    (binding.primaryTitle && typeof binding.primaryTitle.animate !== 'function') ||
    (binding.secondary && typeof binding.secondary.animate !== 'function') ||
    (binding.secondaryTitle && typeof binding.secondaryTitle.animate !== 'function') ||
    (binding.secondaryDim && typeof binding.secondaryDim.animate !== 'function') ||
    (binding.secondaryTitleClip && typeof binding.secondaryTitleClip.animate !== 'function') ||
    (binding.backButtonVisual && typeof binding.backButtonVisual.animate !== 'function')
  )
}

/** The pose further along the finger's direction of travel (velocity sign; ties keep `pose`). */
export function furtherAlong(pose: number, lift: number, velocityPointsPerSecond: number) {
  if (velocityPointsPerSecond > 0) return Math.max(pose, lift)
  if (velocityPointsPerSecond < 0) return Math.min(pose, lift)
  return pose
}

/**
 * State, besides the lifecycle:
 * - `interactionPhase` (interactive pops): 'held' while the finger owns the page, then
 *   'completing' or 'cancelling' once released. A cancelling pop can be caught again
 *   (resumeInteractive) and returns to 'held'.
 * - Who moves the page: a native scroll scrub (`scrollSource`, the private scroller drives
 *   scroll-timeline tracks), the frame loop (setProgress writes a pose), or the release and
 *   automatic tracks in `activeAnimations`.
 * - `binding`: the elements of the screens it moves, bound after React commits them. A release
 *   that arrives before the first binding waits in `pendingRelease`.
 */
export function createAnimatedTransitionController(
  completion: TransitionCompletion,
  context: TransitionControllerContext = {
    interactive: false,
    operation: 'push',
  },
): TransitionController {
  let interactionPhase: InteractionPhase = context.interactive ? 'held' : 'completing'
  let phasePublicationPending = false
  const setInteractionPhase = (target: AnimationTarget, publish = true) => {
    const next = target === 'finish' ? 'completing' : 'cancelling'
    if (next !== interactionPhase) {
      interactionPhase = next
      phasePublicationPending = true
    }
    if (!publish || !phasePublicationPending) return
    phasePublicationPending = false
    completion.changed?.()
  }
  let lifecycle: ControllerLifecycle = 'created'
  let binding: TransitionBinding | undefined
  let bindingGeneration = 0
  let destinationTransferred = false
  let progress = 0
  let minimumProgress = 0
  const boundProgress = (value: number) => Math.min(1, Math.max(minimumProgress, value))
  let renderedBinding: TransitionBinding | undefined
  let renderedProgress: number | undefined
  let pendingRelease: { target: AnimationTarget; velocity: number; raw?: number } | undefined
  let activeAnimations: Animation[] = []
  let animationGeneration = 0
  let endProbe = () => {}
  let restoreScrollSource: (() => void) | undefined
  let retireHandoff: (() => void) | undefined
  let untransferredTracks: Animation[] = []
  let imagePreparation: AbortController | undefined
  let preparationFrame = 0
  let preparationOwner: HTMLElement | undefined
  const clearPreparation = () => {
    imagePreparation?.abort()
    imagePreparation = undefined
    if (preparationFrame) window.cancelAnimationFrame(preparationFrame)
    preparationFrame = 0
    preparationOwner?.removeAttribute('data-satin-push-playing')
    preparationOwner = undefined
  }
  let scrollSource: NativeScrub | undefined

  const cancelAnimations = () => {
    retireHandoff?.()
    retireHandoff = undefined
    for (const animation of untransferredTracks) {
      animation.cancel()
      animation.effect = null
    }
    untransferredTracks = []
    restoreScrollSource?.()
    restoreScrollSource = undefined
    clearPreparation()
    animationGeneration += 1
    for (const animation of activeAnimations) {
      holdInterruptedChrome(animation)
      animation.onfinish = null
      animation.cancel()
    }
    activeAnimations = []
  }

  /** Whether the animation run numbered `generation` was replaced or the transition completed. */
  const superseded = (generation: number) =>
    lifecycle === 'completed' || generation !== animationGeneration

  const render = () => {
    if (!binding || (renderedBinding === binding && renderedProgress === progress)) {
      return
    }
    renderBinding(binding, progress)
    renderedBinding = binding
    renderedProgress = progress
  }

  /** `arrived`: the page's own animation reached the end (not a forced finish or cancel). */
  const complete = (target: AnimationTarget, arrived = false, successorPush = false) => {
    if (lifecycle === 'completed') return
    lifecycle = 'completed'
    scrollSource = undefined
    pendingRelease = undefined
    endProbe()
    if (target === 'finish' && arrived) activeAnimations = keepChromeTails(activeAnimations)
    progress = target === 'finish' ? 1 : 0
    // Publish the endpoint underneath every retiring effect, including the
    // instant-endpoint path that never creates document-timeline tracks.
    render()
    cancelAnimations()
    releasePushOrigins(binding)
    render()
    if (!arrived && !successorPush && binding) settleHeldChrome(binding, target === 'finish')
    if (target === 'finish') completion.finish()
    else completion.cancel()
  }

  const animate = (
    target: AnimationTarget,
    velocityPointsPerSecond = 0,
    finalRawProgress?: number,
    inputVelocityPointsPerSecond = velocityPointsPerSecond,
  ) => {
    if (lifecycle === 'completed') return
    if (prefersReducedMotion() || typeof window === 'undefined') {
      complete(target)
      return
    }
    if (!binding) {
      if (context.interactive)
        pendingRelease = { target, velocity: velocityPointsPerSecond, raw: finalRawProgress }
      return
    }
    pendingRelease = undefined
    // The controller phase is available immediately to gesture arbitration.
    // Publish only after the release owns its effects and clock: external-store
    // subscribers can synchronously render the destination's content.
    setInteractionPhase(target, !context.interactive)

    const releasingNativeScroll = Boolean(scrollSource)
    const retained = releasingNativeScroll ? activeAnimations : []
    recordMotionPreparation(() => ({
      kind: 'navigation-release-handoff',
      at: performance.now(),
      finalRawProgress,
      velocityPointsPerSecond,
      inputVelocityPointsPerSecond,
      target,
      width: binding?.width,
      controllerProgress: progress,
      source: scrollSource
        ? {
            x: scrollSource.source.scrollLeft,
            origin: scrollSource.origin,
            adjustment: scrollSource.adjustment,
          }
        : undefined,
      tracks: retained.map(animation => ({
        time: String(animation.currentTime),
        start: String(animation.startTime),
        progress: animation.effect?.getComputedTiming().progress,
      })),
    }))
    if (releasingNativeScroll) {
      // Keep ownership until replacement: an exact-endpoint release can finish
      // below without creating a curve and must still cancel every old track.
      animationGeneration += 1
      activeAnimations = []
      untransferredTracks = retained
    } else cancelAnimations()
    const generation = animationGeneration
    if (scrollSource) {
      const { source, origin } = scrollSource
      // The source is an input device, not visible content. After ownership
      // transfers, native momentum must not rubber-band its sticky descendants.
      // Read its final position before disabling scrolling and recentering it.
      // Retirement re-arms after its native momentum reset commits. Completion
      // cannot shorten that reset or re-arm a later retirement.
      let retirement: number | undefined
      restoreScrollSource = () => {
        if (retirement !== undefined) rearmNativeScrubSource(source, retirement)
      }
      progress = boundProgress(finalRawProgress ?? scrubbedProgress(scrollSource, binding.width))
      retireHandoff = () => {
        retireHandoff = undefined
        retirement = retireNativeScrubSource(source, origin)
        recordMotionPreparation(() => ({
          kind: 'navigation-source-retired',
          at: performance.now(),
          sourceX: source.scrollLeft,
        }))
      }
      scrollSource = undefined
    }
    if (finalRawProgress !== undefined) progress = boundProgress(finalRawProgress)
    const from = progress
    const to = target === 'finish' ? 1 : 0
    if (context.interactive && (from === to || binding.width <= 0)) {
      recordMotionPreparation(() => ({
        kind: 'navigation-release-start',
        at: performance.now(),
        from,
        to,
        duration: 0,
        retained: releasingNativeScroll,
      }))
      complete(target)
      return
    }
    const releaseTrajectory = context.interactive
      ? createNavigationReleaseTrajectory(progress, to, velocityPointsPerSecond, binding.width)
      : undefined
    const duration = releaseTrajectory?.durationMs ?? NAVIGATION_DURATION_MS
    if (duration <= 0) {
      complete(target)
      return
    }

    render()
    if (!canAnimate(binding)) {
      complete(target)
      return
    }

    endProbe()
    endProbe = beginMotionProbe(
      context.interactive ? 'pop-release' : binding.direction === 'push' ? 'push' : 'pop',
      'WAAPI transform/opacity',
    )
    // Cancel while the effect still identifies its target. Clearing the effect
    // first leaves WebKit's accelerated ScrollTimeline presentation attached:
    // later native momentum can repaint the destination at its old scrub pose,
    // even though computed styles and getAnimations() report no active effect.
    // Detach only after cancellation, before constructing document effects.
    for (const animation of untransferredTracks) {
      animation.cancel()
      animation.effect = null
    }
    untransferredTracks = []
    // Retire the scrolling tree in the same update that replaces its effects.
    // Leaving asynchronous scrolling alive while the document clock advances
    // can keep its moving presentation visible until a later rendering update.
    retireHandoff?.()
    activeAnimations = animateBinding(binding, from, to, {
      duration,
      preparePaused: !context.interactive,
      easing: releaseTrajectory?.cssEasing ?? NAVIGATION_EASING_CSS,
      ...(releaseTrajectory ? { progressSamples: releaseTrajectory.samples } : {}),
    })
    traceTracks(context.interactive ? 'release' : 'animate', binding, activeAnimations)
    if (context.interactive) {
      // Touch-end may arrive between display callbacks. Resolve the document
      // timeline epoch now instead of waiting for each animation's pending play
      // task, which can retain the last native position for an extra frame.
      // DocumentTimeline.currentTime is the last rendering timestamp and can
      // be stale after route preparation. Starting there spends spring time
      // before this release exists. The default document timeline has origin 0.
      const releaseStart = performance.now()
      for (const animation of activeAnimations) {
        animation.startTime = releaseStart
        const target = (animation.effect as KeyframeEffect | null)?.target
        if (target) announceToolbarMotion(target)
      }
      recordMotionPreparation(() => ({
        kind: 'navigation-release-start',
        at: releaseStart,
        timelineTime: String(document.timeline?.currentTime),
        from,
        to,
        duration,
        retained: releasingNativeScroll,
        width: binding?.width,
        velocityPointsPerSecond,
        initialVelocity: releaseTrajectory?.initialVelocity,
        trajectory: releaseTrajectory?.samples,
      }))
    }
    activeAnimations[0]!.onfinish = () => {
      recordMotionPreparation(() => ({
        kind: 'navigation-animation-finish',
        at: performance.now(),
        interactive: context.interactive,
        from,
        to,
        duration,
        currentTime: String(activeAnimations[0]?.currentTime),
        playState: activeAnimations[0]?.playState,
      }))
      if (superseded(generation)) return
      progress = to
      complete(target, true)
    }
    if (context.interactive) setInteractionPhase(target)
    if (
      !context.interactive &&
      activeAnimations
        .filter(isPageAnimation)
        .every(
          animation =>
            typeof animation.pause === 'function' &&
            typeof animation.play === 'function' &&
            animation.ready instanceof Promise,
        )
    )
      playWhenPrepared(target, generation)
  }

  /** An automatic transition's tracks start paused and play together on one start time once
   * WebKit has its page tracks ready and a push has decoded images and current-source glass. */
  const playWhenPrepared = (target: AnimationTarget, generation: number) => {
    const preparedAnimations = activeAnimations
    const pageAnimations = preparedAnimations.filter(isPageAnimation)
    for (const animation of preparedAnimations) animation.pause()
    imagePreparation = new AbortController()
    const imageReady =
      binding?.direction === 'push'
        ? prepareDestinationImages(binding.primary, imagePreparation.signal)
        : Promise.resolve()
    void Promise.all([
      ...pageAnimations.map(animation => animation.ready),
      imageReady,
      binding?.direction === 'push' ? binding.glassReady : undefined,
    ]).then(
      () => {
        if (superseded(generation) || activeAnimations !== preparedAnimations) return
        const start = performance.now()
        for (const animation of preparedAnimations) {
          animation.currentTime = 0
          animation.play()
          const target = (animation.effect as KeyframeEffect | null)?.target
          if (target) announceAnimation(target)
          animation.startTime = start
          if (target) announceToolbarMotion(target)
        }
        // Assign one epoch after paused preparation. Never reset it when
        // pending play resolves: WebKit may already have presented frames.
        if (binding?.direction === 'push') markPushPlaying(pageAnimations, generation, start)
      },
      () => {
        if (!superseded(generation) && activeAnimations === preparedAnimations)
          complete(binding?.glassReady ? 'cancel' : target)
      },
    )
  }

  /** Diagnostic mark after playback begins. Source and glass admission already completed;
   * the navigation atlas remains their owner until settlement. The mark belongs to this push
   * and dies with its tracks (clearPreparation). */
  const markPushPlaying = (
    pageAnimations: readonly Animation[],
    generation: number,
    start: number,
  ) => {
    void Promise.all(pageAnimations.map(animation => animation.ready)).then(
      () => {
        if (superseded(generation)) return
        recordMotionPreparation(() => ({ kind: 'navigation-push-play', at: start }))
        preparationFrame = window.requestAnimationFrame(() => {
          preparationFrame = window.requestAnimationFrame(() => {
            preparationFrame = 0
            if (superseded(generation)) return
            preparationOwner =
              binding?.primary.closest<HTMLElement>('[data-satin-screen-key]') ?? undefined
            preparationOwner?.setAttribute('data-satin-push-playing', 'true')
          })
        })
      },
      () => {
        /* The normal finish/cancel path retains ownership. */
      },
    )
  }

  const releaseInteractive = (
    target: AnimationTarget | 'resolve',
    velocity: number,
    raw?: number,
    decision?: NavigationReleaseDecision,
    liftAt?: number,
  ) => {
    if (!context.interactive || lifecycle === 'completed') return
    const endpoint = (position: number): AnimationTarget =>
      target === 'resolve'
        ? (
            decision && binding
              ? projectedNavigationCompletion(position, binding.width, decision)
              : shouldCompleteInteractivePop(position, velocity)
          )
          ? 'finish'
          : 'cancel'
        : target
    setInteractionPhase(endpoint(raw ?? progress), false)
    // The recognizer velocity is already points/second, measured from the finger's own samples.
    // Do not apply the native controller's internal flick boost to Satin's visible tangent.
    const releaseVelocity = velocity
    if (!scrollSource || prefersReducedMotion()) {
      // Raw input can be delivered and released before the native scrub's
      // first frame attaches. It chooses the endpoint, not a pose we painted.
      // Starting the curve at that unpresented raw position skips the slide.
      recordMotionPreparation(() => ({
        kind: 'navigation-unattached-release',
        at: performance.now(),
        raw,
        renderedProgress: progress,
        velocity: releaseVelocity,
      }))
      animate(endpoint(raw ?? progress), releaseVelocity)
      return
    }
    recordMotionPreparation(() => ({
      kind: 'navigation-release-scheduled',
      at: performance.now(),
      liftAt,
      raw,
      velocity,
      target,
      decision,
    }))
    // Hand off now, in the touchend task. The lift reaches the page 16-25 ms after it happened
    // (owner's iPhone); waiting a further rendering update left the page on a native scroller
    // that had stopped with the finger, a visible dip before the release began. A completing or
    // resolving release starts from the further-along of the scroller's pose and the lift's own
    // touch position: the touchend coordinate can lag a scroller that is still moving, and the
    // main-thread scroller pose can lag the finger. Both describe the page as it is now (the
    // scroller does not carry it past the lift), so the clock starts now: starting it at the lift
    // added the delivery delay's travel a second time (owner, Oct 4: first release frames at up to
    // 2.07x the finger's speed). An explicit cancel (touchcancel) starts from the scroller's pose.
    const source = scrollSource
    const sourcePosition = sampleSourceProgress()
    const unmoved = source.source.scrollLeft === source.attachedX
    const position =
      target === 'cancel' || unmoved || raw === undefined
        ? sourcePosition
        : furtherAlong(sourcePosition, boundProgress(raw), releaseVelocity)
    recordMotionPreparation(() => ({
      kind: 'navigation-tracking-release',
      at: performance.now(),
      liftAt,
      position,
      sourcePosition,
      raw,
      unmoved,
      inputVelocity: velocity,
      trackingVelocity: releaseVelocity,
    }))
    animate(endpoint(position), releaseVelocity, position, velocity)
  }

  /** The leading page's pose as WebKit has it now (scroll-driven or WAAPI tracks included). */
  const presentedPose = () => {
    if (
      !binding ||
      binding.width <= 0 ||
      typeof getComputedStyle !== 'function' ||
      typeof DOMMatrixReadOnly === 'undefined'
    )
      return undefined
    return boundProgress(presentedTranslateX(binding.primary) / binding.width)
  }

  /** The outgoing page's pose as WebKit has it now (its scroll-driven track included). */
  const sampleSourceProgress = () => {
    if (
      binding &&
      typeof getComputedStyle === 'function' &&
      typeof DOMMatrixReadOnly !== 'undefined'
    ) {
      return boundProgress(presentedTranslateX(binding.primary) / binding.width)
    }
    return controller.progress
  }

  const controller: TransitionController = {
    presentedPose,
    resumeInteractive() {
      if (lifecycle === 'completed' || interactionPhase !== 'cancelling') return
      progress = presentedPose() ?? progress
      render()
      cancelAnimations()
      pendingRelease = undefined
      interactionPhase = 'held'
      phasePublicationPending = false
      completion.changed?.()
    },
    yieldForPop() {
      if (!binding?.secondary || destinationTransferred) return undefined
      const destination = binding.secondary
      const translateX = presentedTranslateX(destination)
      const pose = binding.width > 0 ? translateX / binding.width : 0
      const primary = binding.primary
      const primaryTitle = binding.primaryTitle
      const principal = primaryPrincipal(binding)
      // Keep the departing page on its existing spring. Only the exposed page
      // changes owners. No ancestor animation may keep moving the next finger's page.
      activeAnimations = activeAnimations.filter(animation => {
        const target = (animation.effect as KeyframeEffect | null)?.target
        if (target === primary || target === primaryTitle || target === principal) return true
        animation.onfinish = null
        animation.cancel()
        animation.effect = null
        return false
      })
      destination.style.removeProperty('transform')
      destination.style.removeProperty('clip-path')
      binding.secondaryTitle?.style.removeProperty('transform')
      binding.secondaryTitleClip?.style.removeProperty('transform')
      binding.secondaryTitleContent?.style.removeProperty('transform')
      binding.secondaryDim?.style.removeProperty('opacity')
      destinationTransferred = true
      binding = { direction: binding.direction, width: binding.width, primary, primaryTitle }
      return pose
    },
    get interactionPhase() {
      return interactionPhase
    },
    finishForPush() {
      if (
        prefersReducedMotion() ||
        (context.operation !== 'pop' && context.operation !== 'popToRoot')
      ) {
        complete('finish', false, true)
        return
      }
      const origins = samplePushOrigins(binding)
      recordMotionPreparation(() => ({
        kind: 'navigation-push-origin',
        at: performance.now(),
        tracks: origins.map(({ transform, opacity }) => ({ transform, opacity })),
      }))
      complete('finish', false, true)
      holdPushOrigins(binding, origins)
    },
    resolveInteractive(velocity, raw, cancelled, decision, liftAt) {
      releaseInteractive(cancelled ? 'cancel' : 'resolve', velocity, raw, decision, liftAt)
    },
    get progress() {
      if (scrollSource && binding)
        return boundProgress(scrubbedProgress(scrollSource, binding.width))
      return progress
    },
    bind(nextBinding) {
      if (lifecycle === 'completed') return () => undefined
      if (binding && binding !== nextBinding) clearBinding(binding)
      const generation = ++bindingGeneration
      binding = destinationTransferred
        ? {
            direction: nextBinding.direction,
            width: nextBinding.width,
            primary: nextBinding.primary,
            primaryTitle: nextBinding.primaryTitle,
          }
        : nextBinding
      renderedBinding = undefined
      renderedProgress = undefined
      prepareBinding(nextBinding)
      if (activeAnimations.length === 0) render()
      if (pendingRelease) {
        const release = pendingRelease
        animate(release.target, release.velocity, release.raw)
      } else if (lifecycle === 'started' && !context.interactive && activeAnimations.length === 0) {
        animate('finish')
      }

      return () => {
        if (bindingGeneration !== generation || !binding) return
        clearBinding(binding)
        binding = undefined
        renderedBinding = undefined
        renderedProgress = undefined
      }
    },
    start() {
      if (lifecycle !== 'created') return
      lifecycle = 'started'
      if (context.interactive)
        endProbe = beginMotionProbe('pop-scrub', 'rAF transform/opacity writes')
      if (prefersReducedMotion()) {
        complete('finish')
        return
      }
      if (!context.interactive) animate('finish')
    },
    scrubFromScroll(source, origin, adjustment) {
      if (!binding || !context.interactive || lifecycle === 'completed') return
      cancelAnimations()
      releaseNativeScrubClamp(source)
      scrollSource = { source, origin, adjustment, attachedX: source.scrollLeft }
      activeAnimations.push(...createScrollScrubTracks(binding, source, origin, adjustment))
      traceTracks('scrub', binding, activeAnimations)
      endProbe()
      endProbe = beginMotionProbe('pop-scrub', 'native scroll timeline transform/opacity')
    },
    setProgress(nextProgress) {
      scrollSource = undefined
      if (lifecycle === 'completed' || !context.interactive) return
      cancelAnimations()
      minimumProgress = Math.min(minimumProgress, nextProgress, 0)
      progress = boundProgress(nextProgress)
      render()
    },
    completeInteractive(velocityPointsPerSecond, finalRawProgress) {
      releaseInteractive('finish', velocityPointsPerSecond, finalRawProgress)
    },
    cancelInteractive(velocityPointsPerSecond, finalRawProgress) {
      releaseInteractive('cancel', velocityPointsPerSecond, finalRawProgress)
    },
    prepareForNextGesture() {
      if (interactionPhase !== 'completing') return
      retireHandoff?.()
      // Relinquish cleanup ownership before another controller uses this source.
      // Keep this pop's document-timeline tracks alive through their endpoint.
      restoreScrollSource?.()
      restoreScrollSource = undefined
    },
    finish() {
      complete('finish')
    },
    cancel() {
      complete('cancel')
    },
  }

  return Object.freeze(controller)
}

export function isInteractiveTransitionController(
  controller: TransitionController,
): controller is TransitionController &
  Required<
    Pick<TransitionController, 'cancelInteractive' | 'completeInteractive' | 'setProgress'>
  > {
  return (
    typeof controller.setProgress === 'function' &&
    typeof controller.completeInteractive === 'function' &&
    typeof controller.cancelInteractive === 'function'
  )
}
