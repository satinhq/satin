import type { Appearance } from './theme.ts'
export type TabSelectionMeasurement = Readonly<{
  appearance: Appearance
  backdrop: readonly [number, number, number]
  background: string
  bar: readonly [number, number, number]
  pill: readonly [number, number, number]
}>

// Historical native flat targets, retained only for test/evidence comparison.
// Runtime material coefficients never read this fixture.
export const TAB_SELECTION_MEASUREMENTS: readonly TabSelectionMeasurement[] = Object.freeze([
  {
    appearance: 'light',
    backdrop: [0, 0, 0],
    background: 'tint-black',
    bar: [18, 18, 18],
    pill: [52, 52, 52],
  },
  {
    appearance: 'light',
    backdrop: [32, 32, 32],
    background: 'tint-dark-grey',
    bar: [28, 28, 28],
    pill: [61, 61, 61],
  },
  {
    appearance: 'light',
    backdrop: [10, 132, 255],
    background: 'tint-saturated-blue',
    bar: [149, 207, 255],
    pill: [114, 184, 241],
  },
  {
    appearance: 'light',
    backdrop: [216, 216, 216],
    background: 'tint-light-grey',
    bar: [244, 244, 244],
    pill: [225, 225, 225],
  },
  {
    appearance: 'light',
    backdrop: [255, 255, 255],
    background: 'tint-white',
    bar: [253, 253, 253],
    pill: [235, 235, 235],
  },
  {
    appearance: 'dark',
    backdrop: [0, 0, 0],
    background: 'tint-black',
    bar: [19, 19, 19],
    pill: [53, 53, 53],
  },
  {
    appearance: 'dark',
    backdrop: [32, 32, 32],
    background: 'tint-dark-grey',
    bar: [28, 28, 28],
    pill: [61, 61, 61],
  },
  {
    appearance: 'dark',
    backdrop: [10, 132, 255],
    background: 'tint-saturated-blue',
    bar: [23, 93, 163],
    pill: [47, 125, 203],
  },
  {
    appearance: 'dark',
    backdrop: [216, 216, 216],
    background: 'tint-light-grey',
    bar: [107, 107, 107],
    pill: [137, 137, 137],
  },
  {
    appearance: 'dark',
    backdrop: [255, 255, 255],
    background: 'tint-white',
    bar: [253, 253, 253],
    pill: [235, 235, 235],
  },
])
