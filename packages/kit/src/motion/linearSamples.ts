/** Keep each corner of uniformly sampled, piecewise-linear motion. DOM animations
 * need the corners, not hundreds of redundant keyframes between them. The renderer
 * can retain its uniform samples while WAAPI interpolates the identical path. */
export function linearSampleIndices(samples: readonly (readonly number[])[]) {
  if (samples.length < 2) return samples.map((_, index) => index)
  const indices = [0]
  for (let index = 1; index < samples.length - 1; index++) {
    const before = samples[index - 1]!
    const current = samples[index]!
    const after = samples[index + 1]!
    // Only discard collinear samples, allowing floating-point arithmetic noise.
    if (current.some((value, axis) => Math.abs(after[axis]! - 2 * value + before[axis]!) > 1e-9))
      indices.push(index)
  }
  indices.push(samples.length - 1)
  return indices
}
