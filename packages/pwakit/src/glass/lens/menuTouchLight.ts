import { sampleHighlightCurve } from './interactivePress.ts'
import type { GlassTouchLight } from '../renderSpecs.ts'
import type { GlassInteraction } from '../rendererContract.ts'

// Stock iOS 27 Menu over landscape.png, menu-light/native-fit.json, 2026-10-04.
// Source times are aligned to the 700 ms scheduled contact; onset uncertainty is one frame.
const RISE = {
  light: [
    [0, 220, 0],
    [18, 222, 0.0802],
    [35, 226, 0.1307],
    [53, 228, 0.1529],
    [70, 230, 0.1677],
    [105, 232, 0.171],
    [137, 230, 0.1754],
  ],
  dark: [
    [0, 220, 0],
    [15, 222, 0.1135],
    [33, 224, 0.1498],
    [48, 224, 0.1686],
    [65, 224, 0.1755],
    [100, 224, 0.1756],
    [145, 224, 0.1822],
  ],
} as const

// Stationary disabled-row release, iOS 27, menu-light2/release-fit.json, 2026-10-05.
// Relative radius and white mix; the late, near-uniform field has a weakly identified radius.
// Contact alignment is bracketed by the last resting and first changed source frames.
const RELEASE = {
  light: [
    [0, 1, 1],
    [10, 1.0261, 0.9974],
    [27, 1.0957, 0.9777],
    [43, 1.2174, 0.9321],
    [60, 1.4435, 0.8693],
    [80, 1.6174, 0.8115],
    [95, 1.8261, 0.747],
    [112, 1.8609, 0.7213],
    [127, 2.3304, 0.6026],
    [143, 2.6087, 0.5415],
    [162, 2.4696, 0.4665],
    [178, 3.3913, 0.4015],
    [197, 3.8435, 0.3721],
    [210, 2.3478, 0.3359],
    [230, 4.3478, 0.2641],
    [245, 4.0174, 0.2522],
    [262, 1.8609, 0.2312],
    [278, 2.0696, 0.1692],
    [295, 4.3478, 0.1311],
    [312, 3.9304, 0.1332],
    [328, 4.3478, 0.1265],
    [347, 4.2087, 0.1243],
    [362, 1.1304, 0.0827],
    [378, 0.9043, 0.0211],
    [398, 0.9043, 0],
  ],
  dark: [
    [0, 1, 1],
    [5, 1.0, 0.999],
    [17, 1.0, 0.9995],
    [33, 1.1607, 0.9349],
    [50, 1.1786, 0.9288],
    [68, 1.5536, 0.8067],
    [83, 1.8036, 0.7276],
    [100, 1.7857, 0.7265],
    [117, 2.1786, 0.5992],
    [135, 2.4643, 0.5105],
    [155, 2.4821, 0.4601],
    [167, 2.5714, 0.4004],
    [185, 2.6429, 0.3488],
    [205, 3.5893, 0.2823],
    [217, 3.6429, 0.251],
    [235, 3.3929, 0.2189],
    [252, 2.25, 0.2005],
    [268, 2.8036, 0.1629],
    [288, 2.9464, 0.1346],
    [302, 2.7857, 0.1233],
    [318, 3.0536, 0.0835],
    [335, 3.3393, 0.0815],
    [352, 1.3929, 0.0724],
    [368, 3.4821, 0.0418],
    [388, 3.5179, 0.0416],
    [402, 3.8214, 0.0414],
    [418, 4.4643, 0.0398],
    [437, 4.4643, 0.0394],
    [453, 0.875, 0.0226],
    [472, 0.875, 0],
  ],
} as const
const RELEASE_DURATION = Math.max(RELEASE.light.at(-1)![0], RELEASE.dark.at(-1)![0])

/** Input clock and field are independent of row selection and menu geometry. */
export class MenuTouchLight {
  private epoch = -Infinity
  private downAt?: number
  private upAt?: number
  private contact?: { x: number; y: number }
  private dirty = false

  input(input: GlassInteraction) {
    if (!Number.isFinite(input.epoch)) throw Error('Invalid glass light epoch')
    if (input.epoch < this.epoch) return
    if (input.contact && ![input.contact.x, input.contact.y].every(Number.isFinite))
      throw Error('Invalid glass light contact')
    this.epoch = input.epoch
    if (input.phase === 'rest') {
      this.downAt = undefined
      this.contact = undefined
    } else if (input.phase === 'pressed') {
      if (!input.contact) return
      this.downAt = input.epoch
      this.upAt = undefined
      this.contact = input.contact
    } else if (this.downAt !== undefined) {
      if (input.contact) this.contact = input.contact
      if (input.phase === 'releasing') this.upAt = input.epoch
    }
    this.dirty = true
  }

  needsFrame(at: number) {
    return (
      this.dirty ||
      (this.downAt !== undefined &&
        (this.upAt === undefined ? at < this.downAt + 160 : at < this.upAt + RELEASE_DURATION + 20))
    )
  }

  sample(appearance: 'light' | 'dark', at: number): GlassTouchLight | undefined {
    this.dirty = false
    if (!this.contact || this.downAt === undefined) return undefined
    const elapsed = Math.max(0, Math.min(this.upAt ?? at, at) - this.downAt)
    const points = RISE[appearance]
    let radius = sampleHighlightCurve(points, elapsed)
    let intensity = sampleHighlightCurve(points, elapsed, 2)
    if (this.upAt !== undefined && at > this.upAt) {
      const age = at - this.upAt
      radius *= sampleHighlightCurve(RELEASE[appearance], age)
      intensity *= sampleHighlightCurve(RELEASE[appearance], age, 2)
    }
    if (intensity <= 0 && this.upAt !== undefined) {
      this.downAt = undefined
      return undefined
    }
    return { ...this.contact, radius, intensity, colour: [1, 1, 1] }
  }
}
