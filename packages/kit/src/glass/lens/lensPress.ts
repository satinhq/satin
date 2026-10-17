import opticalSamples from './lensPressSamples.json'
import lightingSamples from './lensLightingSamples.json'
const samples = {
  light: [...opticalSamples.light, ...lightingSamples.light],
  dark: [...opticalSamples.dark, ...lightingSamples.dark],
}
export type LensLighting = readonly [number, number, number, number, number, number, number]

type Appearance = 'light' | 'dark'
type Field = readonly [number, number, number, number]
const endpoints = [-10.5, 7, 11.2, 3.68, 1, 1, 1, 1, 1, 1, 1]
function interpolate(rows: readonly number[][], at: number) {
  if (at <= 0) return rows[0][1]
  for (let i = 1; i < rows.length; i++)
    if (at <= rows[i][0]) {
      const a = rows[i - 1],
        b = rows[i]
      return a[1] + ((b[1] - a[1]) * (at - a[0])) / (b[0] - a[0])
    }
  return rows[rows.length - 1][1]
}
/** Independently sampled optical clocks. Geometry remains the frozen motion fit.
 * Samples are normalized observations, not a material continuous easing law.
 * A held contact extends the attack endpoint; release scales from the current
 * value so an interrupted press cannot jump to a fully raised lens.
 */
export class LensPress {
  private downAt = 0
  private upAt: number | undefined
  private starts: Record<Appearance, number[]> = {
    light: endpoints.map(() => 0),
    dark: endpoints.map(() => 0),
  }
  private releases: Record<Appearance, number[]> = {
    light: endpoints.map(() => 0),
    dark: endpoints.map(() => 0),
  }
  private active = false
  reset() {
    this.active = false
    this.upAt = undefined
  }
  down(at: number) {
    for (const mode of ['light', 'dark'] as const)
      this.starts[mode] = this.values(at, mode).map((v, i) => v / endpoints[i])
    this.downAt = at
    this.upAt = undefined
    this.active = true
  }
  up(at: number) {
    for (const mode of ['light', 'dark'] as const)
      this.releases[mode] = this.values(at, mode).map((v, i) => v / endpoints[i])
    this.upAt = at
  }
  sample(at: number, mode: Appearance): Field {
    return this.values(at, mode).slice(0, 4) as unknown as Field
  }
  lighting(at: number, mode: Appearance): LensLighting {
    return this.values(at, mode).slice(4) as unknown as LensLighting
  }
  private values(at: number, mode: Appearance): number[] {
    if (!this.active) return endpoints.map(() => 0)
    return samples[mode].map(
      (track, i) =>
        endpoints[i] *
        (this.upAt === undefined
          ? this.starts[mode][i] +
            (1 - this.starts[mode][i]) *
              ((interpolate(track.attack, at - this.downAt) - track.attack[0][1]) /
                (1 - track.attack[0][1]))
          : this.releases[mode][i] * interpolate(track.release, at - this.upAt)),
    )
  }
}
