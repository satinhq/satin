// The page side of a navigation transition: where the leading page, the revealed page, their
// bar titles and the dim layer are at a given progress (bindingFrame), how a binding is painted
// at rest and cleared, and the Web Animations tracks that move them.

import { searchRowIsLifted } from './NavigationSearchRow.tsx'
import { animateElement } from '../motion/animate.ts'
import { registerToolbarMotion } from './toolbarMotionOwner.ts'
import { swipeTraceEnabled, traceNavigationTracks } from '../motionProbe.ts'
import {
  NAVIGATION_DIM_OPACITY,
  NAVIGATION_EDGE_SHADOW_OPACITY,
  NAVIGATION_EDGE_SHADOW_WIDTH_PX,
  NAVIGATION_PARALLAX_FRACTION,
  clampProgress,
} from './motionTokens.ts'
import {
  clearChromeStyle,
  endChromeTails,
  isChromeAnimation,
  isHeldChrome,
  liftRearSearchRow,
  primaryPrincipal,
  rearSearchRow,
  renderChrome,
  restoreRearSearchRow,
  startChromeTracks,
} from './transitionChrome.ts'
import type { NavigationReleaseSample } from './releaseTrajectory.ts'
import type { TransitionBinding } from './types.ts'

// Consumed by the next binding on the same retained destination element.
const pushOrigins = new WeakMap<
  HTMLElement,
  { transform: string; opacity: string; clipPath: string }
>()

type PushOrigin = Readonly<{
  element: HTMLElement
  transform: string
  opacity: string
  clipPath: string
}>

/** Samples the revealed page's presented pose when a push interrupts a pop, so the push can
 * carry that page on from where it is rather than from its rest pose. */
export function samplePushOrigins(binding: TransitionBinding | undefined): PushOrigin[] {
  const destination = binding
    ? [binding.secondary, binding.secondaryTitle, binding.secondaryDim]
    : []
  return destination
    .filter((element): element is HTMLElement => Boolean(element))
    .map(element => {
      const style = getComputedStyle(element)
      return {
        element,
        transform: style.transform,
        opacity: style.opacity,
        clipPath: style.clipPath,
      }
    })
}

/** Pins each sampled element at its pose until the next binding on it consumes the origin. */
export function holdPushOrigins(
  binding: TransitionBinding | undefined,
  origins: readonly PushOrigin[],
) {
  for (const { element, transform, opacity, clipPath } of origins) {
    pushOrigins.set(element, { transform, opacity, clipPath })
    element.style.transform = transform
    element.style.opacity = opacity
    if (binding?.occludeSecondary && element === binding.secondary)
      element.style.clipPath = clipPath
  }
}

/** A completed push drops the origins its revealed page did not consume. */
export function releasePushOrigins(binding: TransitionBinding | undefined) {
  if (binding?.direction === 'push') {
    for (const element of [binding.secondary, binding.secondaryTitle, binding.secondaryDim]) {
      if (element) pushOrigins.delete(element)
    }
  }
}

/** The x offset WebKit presents for `element` now, scroll-driven and WAAPI tracks included. */
export function presentedTranslateX(element: HTMLElement) {
  const transform = getComputedStyle(element).transform
  return new DOMMatrixReadOnly(transform === 'none' ? undefined : transform).m41
}

/** Readies a new binding: ends the chrome tails it takes over, lifts the rear search row out of
 * its page, and gives the leading page its edge shadow. */
export function prepareBinding(binding: TransitionBinding) {
  endChromeTails(binding)
  liftRearSearchRow(binding)
  binding.primary.style.boxShadow = `${-NAVIGATION_EDGE_SHADOW_WIDTH_PX}px 0 ${NAVIGATION_EDGE_SHADOW_WIDTH_PX}px rgba(0, 0, 0, ${NAVIGATION_EDGE_SHADOW_OPACITY})`
}

type BindingFrame = Readonly<{
  dimOpacity: number
  primaryTransform: string
  /** The primary page's travel in pixels, for bar items narrower than the page. */
  primaryPixelTransform: string
  secondaryTransform: string
  secondaryClipPath: string
  /** The rear title's clipping box: its right edge follows the front page's left edge. */
  secondaryTitleClipTransform: string
  /** Counter-moves the rear title's text so it stays where its page is. */
  secondaryTitleContentTransform: string
  /** Counter-moves the rear screen's presented search field so it stays in place on screen. */
  secondarySearchRowTransform: string
}>

export type NavigationAnimationTiming = Readonly<{
  duration: number
  easing: string
  progressSamples?: readonly NavigationReleaseSample[]
  preparePaused?: boolean
}>

/** Tracks that do not move a page (titles, clips, the search row, chrome curves). An automatic
 * transition waits only for its page tracks to be ready before it plays (playWhenPrepared). */
const auxiliaryAnimations = new WeakSet<Animation>()

export function isPageAnimation(animation: Animation) {
  return !auxiliaryAnimations.has(animation)
}

export function bindingFrame(
  binding: TransitionBinding,
  progress: number,
  bounded = true,
): BindingFrame {
  const boundedProgress = bounded ? clampProgress(progress) : progress
  const pushing = binding.direction === 'push'
  // A successor pop may inherit the rear page's still-negative parallax pose.
  const primaryTranslation = pushing ? (1 - boundedProgress) * 100 : boundedProgress * 100
  const revealProgress = pushing ? boundedProgress : 1 - boundedProgress

  return {
    dimOpacity: NAVIGATION_DIM_OPACITY * revealProgress,
    primaryTransform: `translate3d(${primaryTranslation}%, 0, 0)`,
    // Bar items narrower than the page move by the page's own width.
    primaryPixelTransform: `translate3d(${(primaryTranslation / 100) * binding.width}px, 0, 0)`,
    secondaryTransform: `translate3d(${-NAVIGATION_PARALLAX_FRACTION * revealProgress * 100}%, 0, 0)`,
    // The rear itself moves by parallax, so its local clipping edge includes
    // that displacement. This keeps transparent sheet pages from overlapping.
    secondaryClipPath: `inset(0 ${Math.max(0, (1 - NAVIGATION_PARALLAX_FRACTION) * revealProgress * 100)}% 0 0)`,
    // iOS 27: the rear page's bar title is covered by the front page. The titles share the header
    // above both pages, so the rear title is clipped where the front page begins: the box moves
    // left by the gap between the front page's edge and the rear page's, its text back right.
    secondaryTitleClipTransform: `translate3d(${-(1 - NAVIGATION_PARALLAX_FRACTION) * revealProgress * 100}%, 0, 0)`,
    secondaryTitleContentTransform: `translate3d(${(1 - NAVIGATION_PARALLAX_FRACTION) * revealProgress * 100}%, 0, 0)`,
    secondarySearchRowTransform: searchRowIsLifted(rearSearchRow(binding))
      ? 'none'
      : `translate3d(${NAVIGATION_PARALLAX_FRACTION * revealProgress * binding.width}px, 0, 0)`,
  }
}

export function renderBinding(binding: TransitionBinding, progress: number) {
  const frame = bindingFrame(binding, progress, progress >= 0)
  renderChrome(binding, progress >= 1)
  binding.primary.style.transform = frame.primaryTransform
  if (binding.primaryTitle) {
    binding.primaryTitle.style.transform = frame.primaryTransform
  }
  const principal = primaryPrincipal(binding)
  if (principal && binding.direction === 'pop')
    principal.style.transform = frame.primaryPixelTransform

  if (!binding.secondary) return
  binding.secondary.style.transform =
    pushOrigins.get(binding.secondary)?.transform ?? frame.secondaryTransform
  if (binding.occludeSecondary)
    binding.secondary.style.clipPath =
      pushOrigins.get(binding.secondary)?.clipPath ?? frame.secondaryClipPath
  if (binding.secondaryTitle) {
    binding.secondaryTitle.style.transform =
      pushOrigins.get(binding.secondaryTitle)?.transform ?? frame.secondaryTransform
  }
  if (binding.secondaryTitleClip)
    binding.secondaryTitleClip.style.transform = frame.secondaryTitleClipTransform
  if (binding.secondaryTitleContent)
    binding.secondaryTitleContent.style.transform = frame.secondaryTitleContentTransform
  const searchRow = rearSearchRow(binding)
  if (searchRow) searchRow.style.transform = frame.secondarySearchRowTransform
  if (binding.secondaryDim) {
    binding.secondaryDim.style.opacity =
      pushOrigins.get(binding.secondaryDim)?.opacity ?? String(frame.dimOpacity)
  }
}

export function clearBinding(binding: TransitionBinding) {
  restoreRearSearchRow(binding)
  binding.primary.style.removeProperty('transform')
  binding.primary.style.removeProperty('box-shadow')
  binding.primaryTitle?.style.removeProperty('transform')
  if (binding.backButtonVisual && !isHeldChrome(binding.backButtonVisual))
    clearChromeStyle(binding.backButtonVisual)
  const backInk = binding.backButtonVisual?.querySelector?.<HTMLElement>(
    '[data-satin-navigation-back-ink]',
  )
  if (backInk && !isHeldChrome(backInk)) clearChromeStyle(backInk)
  primaryPrincipal(binding)?.style.removeProperty('transform')
  for (const element of [...(binding.primaryToolbar ?? []), ...(binding.secondaryToolbar ?? [])])
    if (!isHeldChrome(element)) clearChromeStyle(element)
  if (!binding.secondary) return
  binding.secondary.style.removeProperty('transform')
  if (binding.occludeSecondary) binding.secondary.style.removeProperty('clip-path')
  binding.secondaryTitle?.style.removeProperty('transform')
  binding.secondaryTitleClip?.style.removeProperty('transform')
  binding.secondaryTitleContent?.style.removeProperty('transform')
  binding.secondaryDim?.style.removeProperty('opacity')
  const searchRow = rearSearchRow(binding)
  searchRow?.style.removeProperty('transform')
  if (searchRow && !isHeldChrome(searchRow)) searchRow.style.removeProperty('opacity')
}

/** Swipe trace (diagnostic, off unless scripts/test-support/recorder.js installed its sink): name
 * each track by the binding element it moves so the recorder can sample it every frame. */
export function traceTracks(
  phase: string,
  binding: TransitionBinding,
  animations: readonly Animation[],
) {
  if (!swipeTraceEnabled()) return
  const roles = new Map<Element | null | undefined, string>([
    [binding.secondaryTitleContent, 'title-content'],
    [binding.secondaryTitleClip, 'title-clip'],
    [binding.secondaryDim, 'dim'],
    [binding.backButtonVisual, 'back-button'],
    [binding.secondaryTitle, 'secondary-title'],
    [binding.primaryTitle, 'primary-title'],
    [binding.secondary, 'secondary'],
    [binding.primary, 'primary'],
  ])
  for (const element of binding.primaryToolbar ?? []) roles.set(element, 'primary-toolbar')
  for (const element of binding.secondaryToolbar ?? []) roles.set(element, 'secondary-toolbar')
  traceNavigationTracks(
    `${binding.direction}-${phase}`,
    animations.map(animation => {
      const target = (animation.effect as KeyframeEffect | null)?.target
      const role = roles.get(target) ?? (isChromeAnimation(animation) ? 'chrome' : 'other')
      return { animation, role, width: binding.width }
    }),
  )
}

export function animateBinding(
  binding: TransitionBinding,
  fromProgress: number,
  toProgress: number,
  timing: NavigationAnimationTiming,
) {
  const animateTrack = (
    element: HTMLElement,
    frames: Keyframe[],
    options: KeyframeAnimationOptions,
  ) => {
    if (
      timing.preparePaused &&
      typeof Animation !== 'undefined' &&
      typeof KeyframeEffect !== 'undefined'
    ) {
      // Element.animate() immediately queues playback on WebKit. Pausing it
      // afterward can still submit that provisional pose to the compositor.
      const animation = new Animation(
        new KeyframeEffect(element, frames, options),
        document.timeline,
      )
      animation.currentTime = 0
      animation.pause()
      return animation
    }
    return animateElement(element, frames, options)
  }
  const from = bindingFrame(binding, fromProgress)
  const to = bindingFrame(binding, toProgress)
  // A custom linear(...) easing can run on WebKit's main thread. Keep the
  // exact measured spring samples, but lower them to property keyframes with
  // ordinary linear segment interpolation, which the compositor can own.
  const sampled = timing.progressSamples?.map(({ offset, value }) => ({
    offset,
    ...bindingFrame(binding, fromProgress + (toProgress - fromProgress) * value, false),
  }))
  const framesFor = (
    key:
      | 'primaryTransform'
      | 'primaryPixelTransform'
      | 'secondaryTransform'
      | 'secondaryClipPath'
      | 'secondaryTitleClipTransform'
      | 'secondaryTitleContentTransform'
      | 'secondarySearchRowTransform'
      | 'dimOpacity',
    property: 'transform' | 'opacity' | 'clipPath',
  ): Keyframe[] =>
    sampled
      ? sampled.map(frame => ({ offset: frame.offset, [property]: frame[key] }))
      : [{ [property]: from[key] }, { [property]: to[key] }]
  const options: KeyframeAnimationOptions = {
    duration: timing.duration,
    easing: sampled ? 'linear' : timing.easing,
    fill: 'both',
  }
  const animations: Animation[] = []
  const clipOrigin = binding.secondary ? pushOrigins.get(binding.secondary)?.clipPath : undefined
  const track = (
    element: HTMLElement | undefined,
    key:
      | 'primaryTransform'
      | 'primaryPixelTransform'
      | 'secondaryTransform'
      | 'secondaryTitleClipTransform'
      | 'secondaryTitleContentTransform'
      | 'secondarySearchRowTransform'
      | 'dimOpacity',
    property: 'transform' | 'opacity',
  ) => {
    if (element) {
      const frames = framesFor(key, property)
      const origin = binding.direction === 'push' ? pushOrigins.get(element) : undefined
      if (origin) {
        frames[0] = { [property]: origin[property] }
        pushOrigins.delete(element)
      }
      const animation = animateTrack(element, frames, options)
      if (element === primaryPrincipal(binding) && property === 'transform')
        registerToolbarMotion(element, 'transform', animation)
      if (
        element === binding.primaryTitle ||
        element === binding.secondaryTitle ||
        element === binding.secondaryTitleClip ||
        element === binding.secondaryTitleContent ||
        element === rearSearchRow(binding)
      )
        auxiliaryAnimations.add(animation)
      animations.push(animation)
    }
  }
  track(binding.primary, 'primaryTransform', 'transform')
  track(binding.primaryTitle, 'primaryTransform', 'transform')
  if (binding.direction === 'pop')
    track(primaryPrincipal(binding), 'primaryPixelTransform', 'transform')
  track(binding.secondary, 'secondaryTransform', 'transform')
  track(binding.secondaryTitle, 'secondaryTransform', 'transform')
  track(binding.secondaryTitleClip, 'secondaryTitleClipTransform', 'transform')
  track(binding.secondaryTitleContent, 'secondaryTitleContentTransform', 'transform')
  track(rearSearchRow(binding), 'secondarySearchRowTransform', 'transform')
  track(binding.secondaryDim, 'dimOpacity', 'opacity')
  if (binding.occludeSecondary && binding.secondary) {
    const frames = framesFor('secondaryClipPath', 'clipPath')
    if (binding.direction === 'push' && clipOrigin) frames[0] = { clipPath: clipOrigin }
    const animation = animateTrack(binding.secondary, frames, options)
    auxiliaryAnimations.add(animation)
    animations.push(animation)
  }
  // Chrome curves are time-based (NAVIGATION_CHROME_CURVES) and run only toward the end; a
  // cancelling release keeps the chrome of the start, which renderChrome already shows.
  if (toProgress >= 1)
    for (const animation of startChromeTracks(binding, animateTrack)) {
      auxiliaryAnimations.add(animation)
      animations.push(animation)
    }

  return animations
}

/** Scroll-driven tracks that follow the private native scroller during a back swipe. Held chrome
 * is constant (the start's, renderChrome), so no chrome follows the scroller. */
export function createScrollScrubTracks(
  binding: TransitionBinding,
  source: HTMLElement,
  origin: number,
  adjustment: number,
) {
  const Timeline = (
    window as unknown as {
      ScrollTimeline: new (options: { source: Element; axis: string }) => AnimationTimeline
    }
  ).ScrollTimeline
  const range = source.scrollWidth - source.clientWidth
  const points = [
    0,
    1,
    ...[0, 1].map(p => (origin + adjustment - p * binding.width) / range),
  ].filter(p => p >= 0 && p <= 1)
  const offsets = [...new Set(points)].sort((a, b) => a - b)
  const frames = offsets.map(offset => ({
    offset,
    ...bindingFrame(binding, (origin + adjustment - offset * range) / binding.width),
  }))
  const options: KeyframeAnimationOptions = {
    timeline: new Timeline({ source, axis: 'x' }),
    fill: 'both',
    easing: 'linear',
  }
  const animations: Animation[] = []
  const track = (
    element: HTMLElement | undefined,
    property: 'transform' | 'opacity' | 'clipPath',
    value: (frame: (typeof frames)[number]) => string | number,
  ) => {
    if (element)
      animations.push(
        animateElement(
          element,
          frames.map(f => ({ offset: f.offset, [property]: value(f) })),
          options,
        ),
      )
  }
  track(binding.primary, 'transform', f => f.primaryTransform)
  track(binding.primaryTitle, 'transform', f => f.primaryTransform)
  track(primaryPrincipal(binding), 'transform', f => f.primaryPixelTransform)
  track(binding.secondary, 'transform', f => f.secondaryTransform)
  track(binding.secondaryTitle, 'transform', f => f.secondaryTransform)
  track(binding.secondaryTitleClip, 'transform', f => f.secondaryTitleClipTransform)
  track(binding.secondaryTitleContent, 'transform', f => f.secondaryTitleContentTransform)
  track(rearSearchRow(binding), 'transform', f => f.secondarySearchRowTransform)
  track(binding.secondaryDim, 'opacity', f => f.dimOpacity)
  if (binding.occludeSecondary) track(binding.secondary, 'clipPath', f => f.secondaryClipPath)
  return animations
}
