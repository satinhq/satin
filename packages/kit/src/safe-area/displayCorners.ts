import { useLayoutEffect, useState } from 'react'

/** Display geometry in CSS points. Supply the physical screen, not the app window. */
export type DisplayGeometry = Readonly<{ width: number; height: number; scale: number }>
/** The screen's corner radius in points, with how sure Satin is of the model. */
export type DisplayCornerMetrics = Readonly<{
  /** Minimum measured radius when resolution cannot distinguish models. Unknown displays use zero. */
  radius: number
  range: readonly [minimum: number, maximum: number]
  source: 'exact' | 'ambiguous' | 'fallback'
}>

// Derived Xcode 27 device-profile display geometry, 2026-10-10. No private API ships.
// See the implementation contract for model collisions and measurement limits.
const displayRadii: Readonly<Record<string, readonly [number, number]>> = {
  '402x874@3': [62, 62],
  '440x956@3': [62, 62],
  '390x844@3': [47, 47.33333206],
  '420x912@3': [62, 62],
  '393x852@3': [55, 55],
  '430x932@3': [55, 55],
  '428x926@3': [53, 53.33333206],
  '360x780@3': [44, 44],
  '375x812@3': [39, 39],
  '414x896@3': [39, 39],
  '414x896@2': [41.5, 41.5],
  '1032x1376@2': [30, 30],
  '834x1210@2': [30, 30],
  '1024x1366@2': [0, 18],
  '820x1180@2': [18, 25],
  '744x1133@2': [21.5, 21.5],
  '834x1194@2': [18, 18],
  '810x1080@2': [0, 0],
  '834x1112@2': [0, 18],
  '768x1024@2': [0, 0],
}

/** Resolution is not a model identifier. Unknown and asymmetric displays use the scalar fallback. */
export function resolveDisplayCornerMetrics(display: DisplayGeometry): DisplayCornerMetrics {
  const width = Math.min(display.width, display.height)
  const height = Math.max(display.width, display.height)
  const range = displayRadii[`${width}x${height}@${display.scale}`]
  if (!range) return { radius: 0, range: [0, 0], source: 'fallback' }
  return {
    radius: range[0],
    range: [range[0], range[1]],
    source: range[0] === range[1] ? 'exact' : 'ambiguous',
  }
}

/** Framework token for the screen containing this app. Display Zoom and unknown models fall back to zero. */
export function readDisplayCornerMetrics(): DisplayCornerMetrics {
  return resolveDisplayCornerMetrics({
    width: window.screen.width,
    height: window.screen.height,
    scale: window.devicePixelRatio,
  })
}

/** The corner radius of the device screen in points, or 0 when the model is unknown. It updates
 * after rotation, window moves and pixel-ratio changes that fire a resize. */
export function useDisplayCornerRadius(): number {
  const [radius, setRadius] = useState(() => readDisplayCornerMetrics().radius)
  useLayoutEffect(() => {
    const update = () => setRadius(readDisplayCornerMetrics().radius)
    update()
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])
  return radius
}

/** The corner radius for a shape inset evenly inside a rounded container, so the two corners stay
 * concentric. The result never goes below 0; a negative or non-finite argument throws. */
export function concentricRadius(containerRadius: number, inset: number): number {
  if (
    !Number.isFinite(containerRadius) ||
    containerRadius < 0 ||
    !Number.isFinite(inset) ||
    inset < 0
  )
    throw new Error('Concentric corners require finite, nonnegative radius and inset.')
  return Math.max(0, containerRadius - inset)
}
