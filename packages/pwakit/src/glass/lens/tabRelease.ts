// Optical height relaxation in the fresh reference fit light-flat held release.
// Coarse fit, not UIKit parameters. See the phase notes and release-fit.json.
export const TAB_RELEASE = Object.freeze({ stiffness: 381.47, damping: 29.55 })

// Unit-mass damped oscillator with arbitrary initial velocity. In particular,
// finger-up changes the target without zeroing the derivative of the output.
export function releaseValue(
  start: number,
  velocity: number,
  target: number,
  seconds: number,
  stiffness: number = TAB_RELEASE.stiffness,
  damping: number = TAB_RELEASE.damping,
) {
  const t = Math.max(0, seconds)
  const a = damping / 2
  const w = Math.sqrt(stiffness - a * a)
  const displacement = start - target
  return (
    target +
    Math.exp(-a * t) *
      (displacement * Math.cos(w * t) + ((velocity + a * displacement) / w) * Math.sin(w * t))
  )
}
