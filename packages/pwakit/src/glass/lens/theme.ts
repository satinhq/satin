import type { IconTone } from './data.ts'

export type Appearance = 'dark' | 'light'

export type SettingsPalette = Readonly<{
  background: number
  cell: number
  label: number
  secondaryLabel: number
  separator: number
  pressed: number
  searchFill: number
  searchPlaceholder: number
  chrome: number
  chromeStroke: number
  indicator: number
  tabSelection: number
}>

export const PALETTES: Readonly<Record<Appearance, SettingsPalette>> = Object.freeze({
  light: Object.freeze({
    background: 0xf2f2f7,
    cell: 0xffffff,
    label: 0x000000,
    secondaryLabel: 0x8e8e93,
    separator: 0xe8e8e8,
    pressed: 0xd1d1d6,
    searchFill: 0xe3e3e8,
    searchPlaceholder: 0x737378,
    chrome: 0xf7f7fa,
    chromeStroke: 0xffffff,
    indicator: 0x8e8e93,
    tabSelection: 0x0a84ff,
  }),
  dark: Object.freeze({
    background: 0x000000,
    cell: 0x1c1c1e,
    label: 0xffffff,
    secondaryLabel: 0x98989d,
    separator: 0x38383a,
    pressed: 0x3a3a3c,
    searchFill: 0x1c1c1e,
    searchPlaceholder: 0x98989d,
    chrome: 0x232326,
    chromeStroke: 0x4a4a4e,
    indicator: 0x98989d,
    tabSelection: 0x0a84ff,
  }),
})

export const ICON_GRADIENTS: Readonly<Record<IconTone, readonly [number, number]>> = Object.freeze({
  black: [0x3b3b3d, 0x050506],
  blue: [0x40b6ff, 0x0787ed],
  gray: [0xb9bbc0, 0x898b90],
  green: [0x5bd662, 0x24a938],
  orange: [0xffb13b, 0xf27912],
  pink: [0xff648c, 0xf13b71],
  purple: [0x9f7bff, 0x6753f1],
  red: [0xff6262, 0xe23434],
})
