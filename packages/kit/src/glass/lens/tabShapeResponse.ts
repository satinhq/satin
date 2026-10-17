// reference fit candidate from the recorded fast/slow arrival controls. Native travel
// flattens the lens; braking briefly contracts its width and raises its height.
// These are coarse visual-fit parameters, not a material UIKit physical model.
const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
export class TabShapeResponse {
  private speed = 0
  private brake = 0
  private strain = 0
  reset() {
    this.speed = 0
    this.brake = 0
    this.strain = 0
  }
  sample(velocity: number, dt: number) {
    if (dt <= 0) return this.strain
    // Long suspension gaps settle instead of injecting a large simulated step.
    if (dt > 0.1) {
      this.reset()
      return 0
    }
    const excitation = clamp01((Math.abs(velocity) - 300) / 1000)
    const previousSpeed = this.speed
    this.speed += (excitation - this.speed) * (1 - Math.exp(-dt / 0.035))
    this.brake = Math.min(
      1,
      this.brake * Math.exp(-dt / 0.16) + Math.max(0, previousSpeed - this.speed) * 2,
    )
    const target = 15 * this.speed - 12 * this.brake
    this.strain += (target - this.strain) * (1 - Math.exp(-dt / 0.035))
    return this.strain
  }
}
