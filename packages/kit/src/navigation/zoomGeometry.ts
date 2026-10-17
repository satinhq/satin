/*
 * Zoom navigation geometry, as pure functions of a rectangle.
 *
 * At every moment the pushed screen is shown inside a rounded "window" rectangle that moves between
 * the source view's frame and the full screen. As natively, the screen's content is scaled so its
 * width fills the window and is pinned to the window's top; whatever falls below the window's
 * bottom edge is cut off.
 *
 * The cut is made by two nested boxes that only move, so the compositor draws it with the content:
 * the screen container is scaled into place and shifted up until its bottom edge is the window's
 * bottom; the motion layer inside it is shifted back down by the same amount, so the content's top
 * stays at the window's top. Each box clips its overflow with the window's corner radius: the outer
 * one makes the bottom corners, the inner one the top corners.
 */

import {
  ZOOM_EDGE_SCALE_LOSS,
  ZOOM_EDGE_SLOP,
  ZOOM_DRAG_BOTTOM_RISE,
  ZOOM_DRAG_HEIGHT_LOSS_PER_POINT,
  ZOOM_DRAG_SLOP,
  ZOOM_DRAG_WIDTH_LOSS_PER_POINT,
} from './zoomMotion.ts'

export type ZoomRect = Readonly<{ x: number; y: number; width: number; height: number }>

/** The window the screen is shown in: a rectangle in viewport points and its corner radius. */
export type ZoomWindow = Readonly<{ rect: ZoomRect; radius: number }>

/** The styles of the two boxes that draw a screen inside a window. */
export type ZoomWindowStyle = Readonly<{
  /** The screen container: scaled into the window, shifted up so its bottom edge is the window's. */
  containerTransform: string
  /** The motion layer: shifted back down so the content's top is the window's top. */
  motionTransform: string
  /** The corner radius of both boxes, in their own (unscaled) points. */
  borderRadius: string
}>

/** The scale that makes the screen's width fill the window. */
export function contentScale(screen: ZoomRect, window: ZoomWindow) {
  return window.rect.width / screen.width
}

/**
 * The styles that draw a screen laid out at `screen` inside `window`. Both boxes need
 * `transform-origin: 0 0`, `overflow: hidden` and the screen's own layout frame.
 */
export function windowStyle(screen: ZoomRect, window: ZoomWindow): ZoomWindowStyle {
  const scale = contentScale(screen, window) || 1
  // The window's height in the content's own points, never taller than the content itself.
  const visibleHeight = Math.min(window.rect.height / scale, screen.height)
  const cut = screen.height - visibleHeight
  const x = window.rect.x - screen.x
  const y = window.rect.y - screen.y - cut * scale
  return {
    containerTransform: `translate(${round(x)}px, ${round(y)}px) scale(${round(scale, 5)})`,
    motionTransform: `translateY(${round(cut)}px)`,
    borderRadius: `${round(window.radius / scale)}px`,
  }
}

const lerp = (from: number, to: number, progress: number) => from + (to - from) * progress

/** The window `progress` of the way from `from` to `to`. Progress may overshoot 0…1 (springs). */
export function interpolateWindow(from: ZoomWindow, to: ZoomWindow, progress: number): ZoomWindow {
  return {
    rect: {
      x: lerp(from.rect.x, to.rect.x, progress),
      y: lerp(from.rect.y, to.rect.y, progress),
      width: Math.max(0, lerp(from.rect.width, to.rect.width, progress)),
      height: Math.max(0, lerp(from.rect.height, to.rect.height, progress)),
    },
    radius: Math.max(0, lerp(from.radius, to.radius, progress)),
  }
}

/** How open a window is: 0 at the source's width, 1 at the screen's. */
export function openness(screen: ZoomRect, source: ZoomRect, rect: ZoomRect) {
  const span = screen.width - source.width
  return span > 0 ? Math.min(1, Math.max(0, (rect.width - source.width) / span)) : 1
}

/** The window's corner radius at an openness: from the source to the full page's clip. */
export function windowRadius(open: number, sourceRadius: number, restingRadius: number) {
  return lerp(sourceRadius, restingRadius, open)
}

/**
 * The window under a dismissing finger, as natively measured: dragging down narrows it (centred on
 * the finger's sideways travel), shortens it faster still, and lifts its bottom edge with the
 * square of the drag. `translation` is the finger's travel since it went down.
 */
export function dragRect(
  screen: ZoomRect,
  translation: Readonly<{ x: number; y: number }>,
): ZoomRect {
  const pulled = Math.max(0, translation.y - ZOOM_DRAG_SLOP)
  const width = screen.width * Math.max(0.2, 1 - ZOOM_DRAG_WIDTH_LOSS_PER_POINT * pulled)
  const height = Math.max(width, screen.height * (1 - ZOOM_DRAG_HEIGHT_LOSS_PER_POINT * pulled))
  const bottom = screen.y + screen.height - ZOOM_DRAG_BOTTOM_RISE * pulled * pulled
  return {
    x: screen.x + (screen.width - width) / 2 + translation.x,
    y: bottom - height,
    width,
    height,
  }
}

/**
 * The window under the edge back swipe, as natively measured: it shrinks uniformly, its left edge
 * follows the finger (less the recognizer's 18 pt) and it shrinks toward the screen's middle
 * height. `progress` is the finger's travel over the screen's width.
 */
export function edgeRect(screen: ZoomRect, progress: number): ZoomRect {
  const pulled = Math.max(0, progress * screen.width - ZOOM_EDGE_SLOP)
  const scale = Math.max(0.2, 1 - (ZOOM_EDGE_SCALE_LOSS * pulled) / screen.width)
  return {
    x: screen.x + pulled,
    y: screen.y + (screen.height / 2) * (1 - scale),
    width: screen.width * scale,
    height: screen.height * scale,
  }
}

function round(value: number, digits = 3) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}
