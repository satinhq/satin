import type { KeyboardTranslation } from '../../keyboard/translation.ts'
import {
  KEYBOARD_CARRIER_MOTION,
  keyboardCarrierPose,
} from '../../safe-area/keyboardCarrierGeometry.ts'
import { presentationGlassFollowing } from '../../presentation/glassMotion.ts'
import { accessoryGlassMotion } from './accessoryMorph.ts'
import type { GlassViewport } from '../rendererContract.ts'
import { atRest, presentationTravel } from '../presentationFrame.ts'
import { hasLayoutAnimation, observeAnimations } from '../../motion/animate.ts'
import { zoomRestRect } from '../../navigation/zoomGlass.ts'
import { navigationGlassState } from '../../navigation/glassTransition.ts'
import type { SampleRect } from './captureBands.ts'

/** A compositor transform moves a canvas without changing its layout or captured page.
 * Observe its ancestors, not the canvas attributes that the renderer itself writes.
 * Scripted gestures sample after their style writes; CSS motion samples until it ends.
 * At rest there is no animation-frame loop and no backdrop work. */
export function observePresenterViewport(
  canvas: HTMLCanvasElement,
  update: (viewport: GlassViewport, sampleRect: SampleRect, keyboard?: KeyboardTranslation) => void,
) {
  const ancestors: HTMLElement[] = []
  for (let node = canvas.parentElement; node; node = node.parentElement) ancestors.push(node)
  let disposed = false
  let frame = 0
  let previous = ''
  let queued = false
  let zoomOwned = false
  const navigator = canvas.closest<HTMLElement>('[data-satin-navigator-host]')
  const root = canvas.closest<HTMLElement>('[data-satin-root]')
  const rootOffset = () =>
    root?.dataset.satinKeyboard === 'visible'
      ? Number.parseFloat(root.style.getPropertyValue('--satin-keyboard-offset-top')) || 0
      : 0
  let stable:
    | {
        width: number
        height: number
        rect: Pick<DOMRect, 'x' | 'y' | 'width' | 'height'>
        owner: HTMLElement | undefined
        offsetY: number
        rootOffset: number
      }
    | undefined
  let sizeChanged = false
  const sample = () => {
    frame = 0
    if (
      disposed ||
      !canvas.isConnected ||
      document.hidden ||
      presentationGlassFollowing(canvas) ||
      (canvas.parentElement && accessoryGlassMotion(canvas.parentElement))
    )
      return
    const zoom = zoomRestRect(canvas)
    if (!zoom && zoomOwned && navigator) {
      const navigation = navigationGlassState(navigator)
      if (
        navigation?.active &&
        navigation.zoom &&
        navigation.routes.some(route => route.motion.contains(canvas))
      ) {
        // Controller cleanup precedes the settled DOM commit. Keep the accepted
        // route sample while CSS can still expose the slide's parked transform.
        frame = requestAnimationFrame(sample)
        return
      }
    }
    zoomOwned = !!zoom
    const pose = keyboardCarrierPose(canvas)
    const keyboardMoving = pose?.moving || root?.dataset.satinKeyboardMoving === 'true'
    const reuse =
      stable &&
      !zoom &&
      !sizeChanged &&
      keyboardMoving &&
      stable.owner === pose?.owner &&
      stable.rootOffset === rootOffset()
    let width: number
    let height: number
    let rect: Pick<DOMRect, 'x' | 'y' | 'width' | 'height'>
    if (reuse && stable) {
      width = stable.width
      height = stable.height
      rect = {
        x: stable.rect.x,
        y: stable.rect.y + (pose?.offsetY ?? 0) - stable.offsetY,
        width: stable.rect.width,
        height: stable.rect.height,
      }
    } else {
      const style = getComputedStyle(canvas)
      width = Number.parseFloat(style.width)
      height = Number.parseFloat(style.height)
      // Content glass selects its untransformed route atlas during a zoom. The
      // canvas still travels with that route in CSS; publishing its screen-space
      // box here would override the route-local sample and refract unrelated rows.
      // Travel belongs to the material owner, not its renderer canvas. The root
      // sheet's canvas is inside the sheet DOM but must sample the page at its
      // current position; genuinely nested materials stay in sheet coordinates.
      rect =
        zoom ??
        atRest(canvas.getBoundingClientRect(), presentationTravel(canvas.parentElement ?? canvas))
      stable = {
        width,
        height,
        rect,
        owner: pose?.owner,
        offsetY: pose?.offsetY ?? 0,
        rootOffset: rootOffset(),
      }
      sizeChanged = false
    }
    if (!(width > 0 && height > 0 && rect.width > 0 && rect.height > 0)) return
    const viewport = {
      x: rect.x,
      y: rect.y,
      scaleX: rect.width / width,
      scaleY: rect.height / height,
    }
    // The worker receives the same WAAPI curve as the DOM. Its base is this
    // canvas's resting screen position, including any concurrent layout change.
    const keyboard =
      !zoom && pose?.motion
        ? { ...pose.motion, offset: pose.motion.offset + (stable!.rect.y - stable!.offsetY) }
        : undefined
    const key = JSON.stringify([
      keyboard ? { ...viewport, y: 0 } : viewport,
      rect.width,
      rect.height,
      keyboard,
    ])
    if (key !== previous) {
      previous = key
      update(viewport, [rect.x, rect.y, rect.width, rect.height], keyboard)
    }
    if (
      keyboardMoving ||
      ancestors.some(
        node =>
          hasLayoutAnimation(node) ||
          node.getAnimations?.().some(animation => animation.playState === 'running'),
      )
    )
      frame = requestAnimationFrame(sample)
  }
  const sampleNow = () => {
    if (frame) cancelAnimationFrame(frame)
    sample()
  }
  const sampleLive = () => {
    stable = undefined
    sampleNow()
  }
  const changed = () => {
    if (queued || disposed) return
    queued = true
    // Coalesce notifications in this task's microtask checkpoint. Gesture writes still reach
    // glass before this frame paints; there is no extra animation-frame deferral.
    queueMicrotask(() => {
      queued = false
      if (frame) cancelAnimationFrame(frame)
      sample()
    })
  }
  const resize = new ResizeObserver(entries => {
    const box = entries[0]?.contentRect
    if (!box || !stable || box.width !== stable.width || box.height !== stable.height) {
      sizeChanged = true
      changed()
    }
  })
  resize.observe(canvas)
  const withoutKeyboardProperties = (style: string) =>
    style.replace(/--satin-keyboard-[\w-]+\s*:[^;]*(?:;|$)/g, '').replace(/\s/g, '')
  const observer = new MutationObserver(records => {
    // Reuse only keyboard-owned writes. A concurrent gesture or class change still measures
    // its new transform in this same frame, even while a keyboard carry is running.
    if (
      records.some(
        record =>
          record.attributeName !== 'style' ||
          withoutKeyboardProperties(record.oldValue ?? '') !==
            withoutKeyboardProperties((record.target as HTMLElement).style.cssText),
      )
    )
      stable = undefined
    changed()
  })
  const animationObservers: (() => void)[] = []
  for (const ancestor of ancestors) {
    observer.observe(ancestor, {
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ['style', 'class'],
    })
    ancestor.addEventListener('transitionrun', changed)
    ancestor.addEventListener('animationstart', changed)
    animationObservers.push(observeAnimations(ancestor, sampleLive))
  }
  // A newly mounted presenter may already be inside an entrance animation.
  window.addEventListener(KEYBOARD_CARRIER_MOTION, changed)
  window.addEventListener('satin-accessory-motion', sampleLive)
  window.addEventListener('satin-presentation-motion', sampleLive)
  queueMicrotask(changed)
  const dispose = () => {
    disposed = true
    window.removeEventListener(KEYBOARD_CARRIER_MOTION, changed)
    resize.disconnect()
    window.removeEventListener('satin-accessory-motion', sampleLive)
    window.removeEventListener('satin-presentation-motion', sampleLive)
    observer.disconnect()
    for (const dispose of animationObservers) dispose()
    cancelAnimationFrame(frame)
    for (const ancestor of ancestors) {
      ancestor.removeEventListener('transitionrun', changed)
      ancestor.removeEventListener('animationstart', changed)
    }
  }
  return { sample: sampleLive, dispose }
}
