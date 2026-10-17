/** A damped spring released `delay` ms after its start, from displacement 1 toward 0, with
 * initial `velocity` (units per second; negative moves toward 0), natural frequency `omega`
 * (rad/s) and damping ratio `zeta`. The phone menu morph runs on these, one per axis
 * (menuMorphPhoneFit.json): continuous position and velocity, overshoot only as the settle. */
export type MenuSpring = Readonly<{ delay: number; omega: number; zeta: number; velocity: number }>

/** Displacement from the target and its velocity (per second) at `ms`. */
export function menuSpring(spring: MenuSpring, ms: number) {
  const { delay, omega, zeta, velocity } = spring
  const t = Math.max(0, ms - delay) / 1000
  if (zeta < 1) {
    const damped = omega * Math.sqrt(1 - zeta * zeta)
    const sine = (velocity + zeta * omega) / damped
    const decay = Math.exp(-zeta * omega * t),
      cos = Math.cos(damped * t),
      sin = Math.sin(damped * t)
    const value = decay * (cos + sine * sin)
    return {
      value,
      velocity: ms < delay ? 0 : -zeta * omega * value + decay * damped * (sine * cos - sin),
    }
  }
  const decay = Math.exp(-omega * t),
    slope = velocity + omega
  return {
    value: decay * (1 + slope * t),
    velocity: ms < delay ? 0 : decay * (slope - omega * (1 + slope * t)),
  }
}

/** When the spring last leaves `tolerance` of its target (ms after start): 0.0015 of the travel
 * is about 0.3 pt for a 200 pt morph, below what a final snap to rest can show. */
export function menuSpringSettle(spring: MenuSpring, tolerance = 0.0015) {
  let settled = spring.delay
  for (let ms = spring.delay; ms <= spring.delay + 3000; ms += 2)
    if (Math.abs(menuSpring(spring, ms).value) > tolerance) settled = ms + 2
  return settled
}
