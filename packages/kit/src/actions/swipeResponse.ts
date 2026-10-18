/** Exact unit-mass response between observed input samples. The caller supplies
 * measured poles; this integrator owns neither swipe thresholds nor constants. */
export type SwipeResponse = { position: number; velocity: number }
export type SwipePoles = { stiffness: number; damping: number }

export function advanceSwipeResponse(
  state: SwipeResponse,
  target: number,
  seconds: number,
  poles: SwipePoles,
): SwipeResponse {
  if (seconds <= 0) return state
  const alpha = poles.damping / 2
  const displacement = state.position - target
  const discriminant = alpha * alpha - poles.stiffness
  let position: number
  let velocity: number
  if (Math.abs(discriminant) < 1e-8) {
    const coefficient = state.velocity + alpha * displacement
    const decay = Math.exp(-alpha * seconds)
    position = (displacement + coefficient * seconds) * decay
    velocity = (state.velocity - alpha * coefficient * seconds) * decay
  } else if (discriminant < 0) {
    const frequency = Math.sqrt(-discriminant)
    const sine = Math.sin(frequency * seconds)
    const cosine = Math.cos(frequency * seconds)
    const coefficient = (state.velocity + alpha * displacement) / frequency
    const decay = Math.exp(-alpha * seconds)
    position = decay * (displacement * cosine + coefficient * sine)
    velocity = decay * (state.velocity * cosine -
      (alpha * coefficient + displacement * frequency) * sine)
  } else {
    const spread = Math.sqrt(discriminant)
    const slow = -alpha + spread
    const fast = -alpha - spread
    const first = (state.velocity - fast * displacement) / (slow - fast)
    const second = displacement - first
    const slowDecay = Math.exp(slow * seconds)
    const fastDecay = Math.exp(fast * seconds)
    position = first * slowDecay + second * fastDecay
    velocity = slow * first * slowDecay + fast * second * fastDecay
  }
  return { position: target + position, velocity }
}

/** Exact response to a linearly changing target between delivered samples. */
export function advanceSwipeRampResponse(
  state: SwipeResponse, from: number, to: number, seconds: number, poles: SwipePoles,
): SwipeResponse {
  if (seconds <= 0) return state
  const speed = (to - from) / seconds
  const relative = advanceSwipeResponse(
    { position: state.position, velocity: state.velocity - speed },
    from - poles.damping * speed / poles.stiffness, seconds, poles,
  )
  return { position: relative.position + speed * seconds, velocity: relative.velocity + speed }
}
