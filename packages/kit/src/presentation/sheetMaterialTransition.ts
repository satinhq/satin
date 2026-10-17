/** Native iOS 27 material fade: midpoint-triggered, with its own ~0.3 s timeline.
 * Slow-drag 10–90% backdrop-contrast change measured 183–208 ms on September 30.
 * Geometry remains position-driven. Retargeting preserves the currently painted material.
 */
export class SheetMaterialTransition {
  private value: number
  private from: number
  private destination: number
  private started = 0
  active = false

  constructor(initial: number) {
    this.value = this.from = this.destination = initial
  }

  target(destination: number, timestamp: number, immediate = false) {
    if (destination === this.destination && !immediate) return
    this.from = this.sample(timestamp)
    this.destination = destination
    this.started = timestamp
    this.active = !immediate && this.from !== destination
    if (immediate) this.value = destination
  }

  sample(timestamp: number) {
    if (!this.active) return this.value
    const progress = Math.min(1, Math.max(0, (timestamp - this.started) / 300))
    const eased = progress * progress * (3 - 2 * progress)
    this.value = this.from + (this.destination - this.from) * eased
    this.active = progress < 1
    return this.value
  }
}
