import fit from './menuCornerFit.json'
import { recordedMotion } from './recordedMotion.ts'

/** Native keeps a round aperture through the middle of the morph. Its extra
 * rounding is measured independently of the width and height response. */
export const sampleMenuCorner = recordedMotion(['rounding'] as const, fit)
export type MenuCornerPose = { rounding: number }
