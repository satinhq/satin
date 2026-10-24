// Navigation bar chrome during a push or pop: which bar items arrive and leave, the time-based
// curve tracks that fade them, and how an interrupted item is held where it is so the next
// transition can run it on from there.

import { liftNavigationSearchRow } from './NavigationSearchRow.tsx'
import {
  toolbarMaterialItems,
  toolbarMaterialRuns,
  toolbarSearchHidden,
} from '../glass/toolbarMaterialContext.ts'
import {
  NAVIGATION_CHROME_CURVES,
  NAVIGATION_SEARCH_FIELD_APPEAR,
  chromeDissolve,
  leadingSwapFrames,
  type ChromeCurve,
  type SwapPart,
} from './chromeCurves.ts'
import type { TransitionBinding } from './types.ts'
import { registerToolbarMotion } from './toolbarMotionOwner.ts'

const restoreSearchRows = new WeakMap<TransitionBinding, () => void>()
const searchRows = new WeakMap<TransitionBinding, HTMLElement | null>()

/** Presented search stays in the shared bar. An idle drawer travels with its page content. */
export function rearSearchRow(binding: TransitionBinding) {
  let row = searchRows.get(binding)
  if (row === undefined) {
    row =
      binding.secondary?.querySelector?.<HTMLElement>(
        '[data-satin-search][data-satin-search-presented] [data-satin-search-row]',
      ) ?? null
    searchRows.set(binding, row)
  }
  return row ?? undefined
}

/** Lifts the rear screen's search row out of its page for the transition (NavigationSearchRow). */
export function liftRearSearchRow(binding: TransitionBinding) {
  const restoreSearch = liftNavigationSearchRow(rearSearchRow(binding))
  if (restoreSearch) restoreSearchRows.set(binding, restoreSearch)
}

/** Returns a lifted rear search row to its page. */
export function restoreRearSearchRow(binding: TransitionBinding) {
  restoreSearchRows.get(binding)?.()
  restoreSearchRows.delete(binding)
}

function toolbarSlot(slots: readonly HTMLElement[] | undefined, placement: string) {
  return slots?.find(slot => slot.dataset?.satinNavigationToolbarSlot === placement)
}

/** The primary screen's principal item is never faded (native): a push shows it at once in place,
 * and a pop carries it off with its page (primaryPixelTransform). */
export function primaryPrincipal(binding: TransitionBinding) {
  return toolbarSlot(binding.primaryToolbar, 'principal')
}

/** Which toolbar enters: a push's primary (the destination), a pop's secondary. The primary
 * principal belongs to neither: it is not faded. */
function toolbarRoles(binding: TransitionBinding) {
  const principal = primaryPrincipal(binding)
  const primary = (binding.primaryToolbar ?? []).filter(slot => slot !== principal)
  return binding.direction === 'push'
    ? { incoming: primary, outgoing: binding.secondaryToolbar ?? [] }
    : { incoming: binding.secondaryToolbar ?? [], outgoing: primary }
}

function backControlChanges(binding: TransitionBinding) {
  return (
    binding.backButtonVisual !== undefined &&
    binding.backButtonFromVisible !== undefined &&
    binding.backButtonToVisible !== undefined &&
    binding.backButtonFromVisible !== binding.backButtonToVisible
  )
}

/** A back control that replaces (or is replaced by) a leading glass item sits on the same spot.
 * Native keeps ONE glass circle there and cross-fades only the symbols. The back control's glass
 * carries the circle for the whole transition (ToolbarGlass hides the leading region under a
 * visible back control), and only its chevron runs the back curve. */
function leadingGlassSwap(binding: TransitionBinding) {
  const leading = toolbarSlot(binding.secondaryToolbar, 'leading')
  return (
    backControlChanges(binding) &&
    leading !== undefined &&
    !toolbarSearchHidden(leading) &&
    toolbarMaterialItems(leading).length > 0
  )
}

/** The element the back curve fades: the chevron alone during a leading glass swap. */
function backTrackElement(binding: TransitionBinding) {
  const visual = binding.backButtonVisual!
  if (!leadingGlassSwap(binding)) return visual
  return visual.querySelector?.<HTMLElement>('[data-satin-navigation-back-ink]') ?? visual
}

type ChromeTrack = {
  element: HTMLElement
  /** Keyframes and duration, the curve run from `origin` (an interrupted item's opacity). */
  animation: (origin: number | undefined) => { frames: Keyframe[]; duration: number }
  /** The leading glass swap's circle: a scale alone, never held when interrupted. */
  swell?: boolean
  /** A bar slot's dissolve: the slot fades and blurs, and its items scale (itemScaleTracks). */
  slot?: boolean
}

/** Native scales each bar item about its own centre as it dissolves (NAVIGATION_CHROME_DISSOLVE).
 * A slot can span the whole bar (the bottom bar spans the screen), so scaling the slot would carry
 * its items toward the bar's ends: a bottom plus 168 pt from the centre moved 17 pt at the
 * crossover, where native's stays put. The slot keeps opacity; blur belongs to the item so its aperture clips the blurred result.
 * each run of merged items (one glass capsule) scales about the capsule's centre. */
function slotScaleTargets(slot: HTMLElement) {
  const targets: { element: HTMLElement; origin?: string }[] = []
  for (const run of toolbarMaterialRuns(slot)) {
    if (run.length === 1) {
      targets.push({ element: run[0]! })
      continue
    }
    // Layout offsets ignore any scale still on the members, so the centre is the resting one.
    const left = Math.min(...run.map(member => member.offsetLeft))
    const right = Math.max(...run.map(member => member.offsetLeft + member.offsetWidth))
    const centre = (left + right) / 2
    for (const member of run)
      targets.push({ element: member, origin: `${centre - member.offsetLeft}px 50%` })
  }
  return targets
}

function withoutScale({ scale: _scale, filter: _filter, ...frame }: Keyframe) {
  return frame
}

/** Blur before the item's aperture clip; ancestor blur would spread clipped ink past the rim. */
function scaleFrames(frames: readonly Keyframe[], origin: string | undefined) {
  return frames.map(({ offset, scale, filter }) => ({
    offset,
    scale,
    filter,
    ...(origin ? { transformOrigin: origin } : {}),
  }))
}

/** A chrome curve's dissolve keyframes, run from `origin` toward its last value. */
function curveTrack(curve: ChromeCurve) {
  return (origin: number | undefined) => {
    const duration = curve.at(-1)![0]
    const endpoint = curve.at(-1)![1]
    const initial = curve[0]![1]
    const from = origin ?? initial
    return {
      duration,
      frames: curve.map(([time, opacity]) => ({
        offset: time / duration,
        ...chromeDissolve(
          endpoint + (from - endpoint) * ((opacity - endpoint) / (initial - endpoint)),
        ),
      })),
    }
  }
}

/** The rear screen's search field fade: out on a push, back in on a pop, from `origin`. */
function searchFieldFrames(direction: 'push' | 'pop', origin: number | undefined) {
  const curve = NAVIGATION_SEARCH_FIELD_APPEAR
  const duration = curve.at(-1)![0]
  const from = origin ?? (direction === 'push' ? 1 : 0)
  return {
    duration,
    frames: curve.map(([time, shown]) => ({
      offset: time / duration,
      opacity: direction === 'push' ? from * (1 - shown) : from + (1 - from) * shown,
    })),
  }
}

/** The chrome tracks a transition runs when its page is sent to the end. During a leading glass
 * swap the one circle swells and the leading symbols and the chevron shrink and grow inside it
 * (NAVIGATION_LEADING_SWAP). */
function chromeTracks(binding: TransitionBinding): ChromeTrack[] {
  const curves = NAVIGATION_CHROME_CURVES
  const roles = toolbarRoles(binding)
  const pushing = binding.direction === 'push'
  const swap = leadingGlassSwap(binding)
  const swapped = (element: HTMLElement) =>
    swap && element.dataset?.satinNavigationToolbarSlot === 'leading'
  // Empty slots need no track, except a push's destination: its screen can fill its slots after
  // the transition is bound (they stay transparent until the curve shows them).
  const filled = (element: HTMLElement) => element.childElementCount !== 0
  const incoming = pushing ? roles.incoming : roles.incoming.filter(filled)
  const leave = pushing ? curves.pushToolbarLeave : curves.popToolbarLeave
  const appear = pushing ? curves.pushToolbarAppear : curves.popToolbarAppear
  const track = (element: HTMLElement, curve: ChromeCurve, part: SwapPart): ChromeTrack =>
    swapped(element)
      ? { element, animation: origin => leadingSwapFrames(part, binding.direction, true, origin) }
      : { element, animation: curveTrack(curve), slot: true }
  const tracks = [
    ...roles.outgoing.filter(filled).map(element => track(element, leave, 'leaving')),
    ...incoming.map(element => track(element, appear, 'arriving')),
  ]
  if (backControlChanges(binding)) {
    const arriving = binding.backButtonToVisible === true
    tracks.push({
      element: backTrackElement(binding),
      animation: swap
        ? origin =>
            leadingSwapFrames(arriving ? 'arriving' : 'leaving', binding.direction, false, origin)
        : curveTrack(arriving ? curves.backAppear : curves.backLeave),
    })
    if (swap)
      tracks.push({
        element: binding.backButtonVisual!,
        animation: () => leadingSwapFrames('circle', binding.direction),
        swell: true,
      })
  }
  const searchRow = rearSearchRow(binding)
  if (searchRow)
    tracks.push({
      element: searchRow,
      animation: origin => searchFieldFrames(binding.direction, origin),
    })
  return tracks
}

/** Chrome at either end of a transition (`atEnd`): held positions show the start. */
export function renderChrome(binding: TransitionBinding, atEnd: boolean) {
  // A held (preserved) item keeps its dissolve; a settled one has none.
  const show = (element: HTMLElement, settled: number) => {
    const origin = chromeOrigins.get(element)
    if (origin === undefined) clearChromeStyle(element)
    element.style.opacity = String(origin ?? settled)
  }
  const roles = toolbarRoles(binding)
  for (const element of roles.incoming) show(element, atEnd ? 1 : 0)
  for (const element of roles.outgoing) show(element, atEnd ? 0 : 1)
  const principal = primaryPrincipal(binding)
  if (principal) principal.style.opacity = '1'
  // The rear screen's field: shown under a push's start or at a pop's end.
  const searchRow = rearSearchRow(binding)
  if (searchRow) show(searchRow, (binding.direction === 'push') !== atEnd ? 1 : 0)
  if (backControlChanges(binding)) {
    const visible = atEnd ? binding.backButtonToVisible : binding.backButtonFromVisible
    const element = backTrackElement(binding)
    if (element !== binding.backButtonVisual) binding.backButtonVisual!.style.opacity = '1'
    show(element, visible ? 1 : 0)
  }
}

// Interrupted chrome. A transition that ends early (a forced finish or cancel, or a successor
// taking over) leaves its bar items part-way through their curves. Each one is held at the
// opacity it reached, and the next transition that binds it runs its own curve on from there.

/** Chrome curves still running after their transition completed (a completing release ends
 * before its incoming items have faded in). The next transition that binds the element ends it. */
const chromeTails = new WeakMap<HTMLElement, Animation>()
/** Each chrome curve animation's element. */
const chromeAnimations = new WeakMap<Animation, HTMLElement>()
/** Leading glass swap circles: an interrupted one returns to rest rather than being held. */
const swellAnimations = new WeakSet<Animation>()
/** A held item's opacity, which the next curve on that item starts from. */
const chromeOrigins = new WeakMap<HTMLElement, number>()
/** Who holds an item: a successor that rebinds the item replaces the token, so a pending
 * settle (settleHeldChrome) can tell that it no longer owns the item. */
const chromeOriginOwners = new WeakMap<HTMLElement, object>()

/** Item scale tracks (slotScaleTargets): held at their scale when interrupted, without an origin
 * of their own (their slot's opacity is the origin the next curve runs on from). */
const itemScaleAnimations = new WeakSet<Animation>()

/** Holds an interrupted item's scale where it is. */
function preserveItemScale(element: HTMLElement) {
  const style = getComputedStyle(element)
  element.style.scale = style.scale || ''
  element.style.transformOrigin = style.transformOrigin || ''
  element.style.filter = style.filter || ''
}

/** Holds an interrupted chrome item where it is: its opacity and the dissolve that goes with it. */
function preserveChromeOpacity(element: HTMLElement) {
  const style = getComputedStyle(element)
  const opacity = Number(style.opacity)
  if (!Number.isFinite(opacity)) return
  chromeOrigins.set(element, opacity)
  chromeOriginOwners.set(element, {})
  element.style.opacity = String(opacity)
  element.style.scale = style.scale || ''
  element.style.filter = style.filter || ''
}

export function clearChromeStyle(element: HTMLElement) {
  element.style.removeProperty('opacity')
  element.style.removeProperty('scale')
  element.style.removeProperty('filter')
  if (!element.dataset?.satinNavigationToolbarSlot) return
  for (const item of toolbarMaterialItems(element)) {
    item.style.removeProperty('scale')
    item.style.removeProperty('filter')
    item.style.removeProperty('transform-origin')
  }
}

/** A tail or held hold on `element`, ended by the binding that takes it over. */
function endTail(element: HTMLElement) {
  const tail = chromeTails.get(element)
  if (tail) {
    if (itemScaleAnimations.has(tail)) preserveItemScale(element)
    else if (!swellAnimations.has(tail)) preserveChromeOpacity(element)
    tail.cancel()
  }
  chromeTails.delete(element)
  if (chromeOrigins.has(element)) chromeOriginOwners.set(element, {})
}

/** Whether `element` is held from an interrupted transition (its inline style is the hold). */
export function isHeldChrome(element: HTMLElement) {
  return chromeOrigins.has(element)
}

export function isChromeAnimation(animation: Animation) {
  return chromeAnimations.has(animation)
}

/** Ends the previous transition's chrome tails on the items this binding will animate, holding
 * each one where its tail had got to. */
export function endChromeTails(binding: TransitionBinding) {
  const slots = [...(binding.primaryToolbar ?? []), ...(binding.secondaryToolbar ?? [])]
  const elements = [
    ...slots,
    ...slots.flatMap(slot => toolbarMaterialItems(slot)),
    ...(binding.backButtonVisual ? [binding.backButtonVisual] : []),
    ...(backControlChanges(binding) ? [backTrackElement(binding)] : []),
  ]
  for (const element of elements) endTail(element)
}

/** Starts the chrome curves of a transition sent to its end. A held item's curve runs on from
 * the opacity it was held at. `animate` creates each track (paused while a push prepares). */
export function startChromeTracks(
  binding: TransitionBinding,
  animate: (
    element: HTMLElement,
    frames: Keyframe[],
    options: KeyframeAnimationOptions,
  ) => Animation,
) {
  const animations: Animation[] = []
  for (const { element, animation: track, swell, slot } of chromeTracks(binding)) {
    const origin = chromeOrigins.get(element)
    chromeOrigins.delete(element)
    chromeOriginOwners.delete(element)
    const { frames, duration } = track(origin)
    // Held at its last value until the transition ends (the page usually runs longer).
    const options: KeyframeAnimationOptions = { duration, easing: 'linear', fill: 'both' }
    const targets = slot ? slotScaleTargets(element) : []
    const slotFrames = targets.length
      ? frames.map(withoutScale)
      : frames.map(({ scale: _scale, ...frame }) => frame)
    const animation = animate(element, slot ? slotFrames : frames, options)
    chromeAnimations.set(animation, element)
    if (slot) registerToolbarMotion(element, 'opacity', animation)
    if (swell) swellAnimations.add(animation)
    animations.push(animation)
    if (!slot) continue
    for (const target of targets) {
      const scale = animate(target.element, scaleFrames(frames, target.origin), options)
      chromeAnimations.set(scale, target.element)
      registerToolbarMotion(target.element, 'scale', scale)
      itemScaleAnimations.add(scale)
      animations.push(scale)
    }
  }
  return animations
}

/** Called before `animation` is cancelled: a chrome curve's item is held where it is. */
export function holdInterruptedChrome(animation: Animation) {
  const element = chromeAnimations.get(animation)
  if (!element || swellAnimations.has(animation)) return
  if (itemScaleAnimations.has(animation)) preserveItemScale(element)
  else preserveChromeOpacity(element)
}

/** A completing transition's chrome curves that are still running outlive it (the incoming
 * items of a completing release fade in after the page arrives); finished ones are dropped.
 * Returns the animations that are not chrome curves. */
export function keepChromeTails(animations: readonly Animation[]) {
  const kept: Animation[] = []
  for (const animation of animations) {
    const element = chromeAnimations.get(animation)
    if (!element) kept.push(animation)
    else if (animation.playState === 'finished') animation.cancel()
    else {
      chromeTails.set(element, animation)
      animation.onfinish = () => {
        animation.cancel()
        if (chromeTails.get(element) === animation) chromeTails.delete(element)
      }
    }
  }
  return kept
}

/** After a forced finish or cancel, each held item moves to its endpoint (`finished`: the end,
 * otherwise the start) on the next frame, unless a successor transition has claimed it by then. */
export function settleHeldChrome(binding: TransitionBinding, finished: boolean) {
  const roles = toolbarRoles(binding)
  const endpoints: [HTMLElement, number][] = [
    ...roles.incoming.map(element => [element, finished ? 1 : 0] as [HTMLElement, number]),
    ...roles.outgoing.map(element => [element, finished ? 0 : 1] as [HTMLElement, number]),
  ]
  if (backControlChanges(binding)) {
    const visible = finished ? binding.backButtonToVisible : binding.backButtonFromVisible
    endpoints.push([binding.backButtonVisual!, visible ? 1 : 0])
  }
  const searchRow = rearSearchRow(binding)
  if (searchRow) endpoints.push([searchRow, (binding.direction === 'push') !== finished ? 1 : 0])
  for (const [element, opacity] of endpoints) {
    const owner = chromeOriginOwners.get(element)
    if (!owner) continue
    // An immediate successor claims the sampled opacity while binding, even if its start is deferred.
    window.requestAnimationFrame(() => {
      if (chromeOriginOwners.get(element) !== owner) return
      chromeOrigins.delete(element)
      chromeOriginOwners.delete(element)
      // The held blur and scale go with the held opacity: a settled item is sharp.
      clearChromeStyle(element)
      element.style.opacity = String(opacity)
    })
  }
}
