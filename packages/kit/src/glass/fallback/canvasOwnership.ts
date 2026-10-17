/** Parking WebGPU retains its last pixels. CSS ownership must hide those pixels,
 * including lift/selection canvases, without destroying the renderer's reusable canvas. */
export class FallbackCanvasOwnership {
  private visibility = new Map<HTMLCanvasElement, string>()

  update(canvases: Iterable<HTMLCanvasElement>) {
    const live = new Set(canvases)
    for (const [canvas, visibility] of this.visibility) {
      if (live.has(canvas)) continue
      canvas.style.visibility = visibility
      this.visibility.delete(canvas)
    }
    for (const canvas of live) {
      if (this.visibility.has(canvas)) continue
      this.visibility.set(canvas, canvas.style.visibility)
      canvas.style.visibility = 'hidden'
    }
  }

  dispose() {
    this.update([])
  }
}
