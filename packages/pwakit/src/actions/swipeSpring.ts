export function swipeReleasePosition(
  from: number,
  to: number,
  velocity: number,
  seconds: number,
  fit: { stiffness: number; damping: number },
) {
  const decay = fit.damping / 2
  const discriminant = fit.stiffness - decay * decay
  const displacement = from - to
  if (Math.abs(discriminant) < 0.000001) {
    return (
      to + Math.exp(-decay * seconds) * (displacement + (velocity + decay * displacement) * seconds)
    )
  }
  if (discriminant < 0) {
    const spread = Math.sqrt(-discriminant)
    const slow = -decay + spread
    const fast = -decay - spread
    const coefficient = (velocity - fast * displacement) / (slow - fast)
    return (
      to +
      coefficient * Math.exp(slow * seconds) +
      (displacement - coefficient) * Math.exp(fast * seconds)
    )
  }
  const frequency = Math.sqrt(discriminant)
  return (
    to +
    Math.exp(-decay * seconds) *
      (displacement * Math.cos(frequency * seconds) +
        ((velocity + decay * displacement) / frequency) * Math.sin(frequency * seconds))
  )
}

/** Native E counter-retimed leading three-action takeover, 24 samples.
 * Entry RMS 0.00494, reversal RMS 0.04057 in normalized geometry. */
export const swipeTakeover = { stiffness: 3741.169, damping: 122.3302 } as const

export function takeoverSample(from: number, to: number, velocity: number, seconds: number) {
  const rate = swipeTakeover.damping / 2
  const displacement = from - to
  const coefficient = velocity + rate * displacement
  const decay = Math.exp(-rate * seconds)
  return {
    position: to + (displacement + coefficient * seconds) * decay,
    velocity: (velocity - rate * coefficient * seconds) * decay,
  }
}
