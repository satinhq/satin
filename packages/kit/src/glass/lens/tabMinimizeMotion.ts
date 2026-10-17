import samples from './tabMinimizeSamples.json'

export type MinimizeDirection = 'collapse' | 'restore'
export type MinimizePlacement = {
  x: number
  y: number
  width: number
  height: number
  progress: number
}

/** First native change was bracketed by offsets 60 and 70 pt in slow drags.
 * The midpoint is an estimate; native/PWA trigger residuals remain an explicit gate.
 * Upward travel restores at the content boundary in the recorded fixture.
 */
export const TAB_MINIMIZE_DISTANCE = 65
export const TAB_MINIMIZE_DURATION = 850
export function measuredMinimizeProgress(
  direction: MinimizeDirection,
  milliseconds: number,
  column = 1,
) {
  const curve = samples[direction]
  if (milliseconds <= 0) return 0
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1],
      b = curve[i]
    if (milliseconds <= b[0])
      return a[column] + ((b[column] - a[column]) * (milliseconds - a[0])) / (b[0] - a[0])
  }
  return 1
}
export function minimizePlacement(
  progress: number,
  width = 360,
  height = 62,
  offsetX = 7,
): MinimizePlacement {
  return {
    progress,
    x: offsetX * progress,
    y: 7 * progress,
    width: width + (48 - width) * progress,
    height: height + (48 - height) * progress,
  }
}

/** Event-level state. Bounce does not accumulate into the next downward run. */
export class TabMinimizeIntent {
  compact = false
  private anchor = 0
  private previous = 0
  private gesture = false
  private scrolledDuringGesture = false
  private restoredDuringGesture = false
  private collapsedDuringGesture = false
  beginGesture(offset = this.previous) {
    this.gesture = true
    this.scrolledDuringGesture = false
    this.previous = Math.max(0, offset)
    this.restoredDuringGesture = false
    this.collapsedDuringGesture = false
    this.anchor = this.previous
  }
  /** A tap cannot authorize a later restoration. WebKit cancels the pointer when it
   * takes over a pan, so momentum remains authorized until the scroller's scrollend. */
  endContact(offset = this.previous) {
    // WebKit can update the live offset before delivering the matching scroll event.
    if (offset !== this.previous) this.scrolledDuringGesture = true
    if (!this.scrolledDuringGesture) this.endGesture()
  }
  endGesture() {
    this.gesture = false
  }
  observe(
    raw: number,
    maximum: number,
    placement: 'bottom' | 'top' = 'bottom',
  ): MinimizeDirection | undefined {
    // The native floating iPad tab bar keeps its labels while content scrolls.
    if (placement === 'top') {
      const direction = this.compact ? 'restore' : undefined
      this.compact = false
      this.rebase(raw)
      return direction
    }
    const offset = Math.max(0, Math.min(maximum, raw))
    const delta = offset - this.previous
    this.previous = offset
    if (this.gesture && delta !== 0) this.scrolledDuringGesture = true
    if (raw <= 0 || raw > maximum) {
      this.anchor = offset
      if (this.compact && (raw <= 0 || !this.collapsedDuringGesture)) {
        this.compact = false
        return 'restore'
      }
      return
    }
    // Restoration, content reflow and tab activation can all emit trusted scroll events.
    // Only movement owned by a scroll gesture may collapse the tab bar.
    if (!this.gesture) {
      this.anchor = offset
      return
    }
    if (delta < 0) this.anchor = offset
    if (
      !this.restoredDuringGesture &&
      !this.compact &&
      offset - this.anchor >= TAB_MINIMIZE_DISTANCE
    ) {
      this.compact = true
      this.collapsedDuringGesture = true
      return 'collapse'
    }
  }
  restore(offset: number) {
    this.restoredDuringGesture = true
    this.compact = false
    this.anchor = Math.max(0, offset)
    this.previous = this.anchor
  }
  /** A different scroller now drives the intent (navigation retargeted the content): keep the
   * compact state, measure further scrolling from this scroller's offset. */
  rebase(offset: number) {
    this.endGesture()
    this.anchor = Math.max(0, offset)
    this.previous = this.anchor
  }
}
