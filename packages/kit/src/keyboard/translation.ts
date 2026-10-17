/** The exact rounded WAAPI translation stops, on the document/worker epoch clock.
 * This describes motion already submitted to the compositor, never predicted scroll. */
export type KeyboardTranslation = Readonly<{
  epoch: number
  duration: number
  /** Last changing stop. The remaining WAAPI duration holds the endpoint. */
  end: number
  offset: number
  stops: readonly (readonly [number, number])[]
}>

export function sampleKeyboardTranslation(motion: KeyboardTranslation, at: number) {
  const progress = Math.max(0, Math.min(1, (at - motion.epoch) / motion.duration))
  let previous = motion.stops[0]!
  for (let index = 1; index < motion.stops.length; index++) {
    const next = motion.stops[index]!
    if (progress <= next[0]) {
      const share = (progress - previous[0]) / (next[0] - previous[0])
      return motion.offset + previous[1] + (next[1] - previous[1]) * share
    }
    previous = next
  }
  return motion.offset + previous[1]
}

export function keyboardTranslationStops(frames: readonly Keyframe[]) {
  return frames.map(
    frame =>
      [
        Number(frame.offset),
        Number(/translateY\((-?[\d.]+)px\)/.exec(String(frame.transform))?.[1] ?? 0),
      ] as const,
  )
}
