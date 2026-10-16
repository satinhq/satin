/**
 * Input for an interactive glass surface (the menu trigger's press lift) can arrive before the
 * surface's source is installed: preparations wait out motion and scrolling, and a user can tap
 * the … button right after a launch or a navigation. That input is not an error:
 * - only a contact still in progress is held: its press and its latest drag position;
 * - a contact that ends (released, cancelled, or a 'rest') before the source arrives is dropped
 *   at once, with its timer: there is nothing left to show and nothing may fail for it;
 * - a held contact whose source never arrives within `waitMs` fails loudly (`onTimeout`).
 */
export type SurfaceInput = Readonly<{
  phase: 'pressed' | 'dragging' | 'releasing' | 'rest'
  at: number
  x?: number
}>

export class PendingSurfaceInput<T extends SurfaceInput> {
  private press: T | undefined
  private drag: T | undefined
  private timer: ReturnType<typeof setTimeout> | undefined
  private readonly waitMs: number
  private readonly onTimeout: (queued: readonly T[]) => void
  constructor(waitMs: number, onTimeout: (queued: readonly T[]) => void) {
    this.waitMs = waitMs
    this.onTimeout = onTimeout
  }
  get size() {
    return (this.press ? 1 : 0) + (this.drag ? 1 : 0)
  }
  /** Input while the source is not installed. */
  hold(input: T) {
    if (input.phase === 'releasing' || input.phase === 'rest') {
      this.clear()
      return
    }
    if (input.phase === 'pressed') {
      this.press = input
      this.drag = undefined
    } else if (this.press)
      this.drag = input // drags coalesce to the latest position
    else return // a drag without a press has no contact to continue
    this.timer ??= setTimeout(() => {
      this.timer = undefined
      const queued = this.take()
      if (queued.length) this.onTimeout(queued)
    }, this.waitMs)
  }
  /** The source is installed: the held contact (press, then its latest drag); the queue empties. */
  release(): readonly T[] {
    const queued = this.take()
    this.clear()
    return queued
  }
  clear() {
    this.press = undefined
    this.drag = undefined
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
  }
  private take(): T[] {
    return [this.press, this.drag].filter((input): input is T => input !== undefined)
  }
}
