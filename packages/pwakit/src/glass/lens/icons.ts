import { coreSymbolSvg } from '../../symbols/svg.ts'
import type { IconName } from './data.ts'
import { TAB_SETTINGS_SYMBOL } from './tabSettingsSymbol.ts'
import { TAB_NATIVE_SYMBOLS } from './tabNativeSymbols.ts'

// All fixture artwork shares the licensed catalogue; historical native exports are retired.
export const MENU_ICON_SVG = Object.freeze({
  info: coreSymbolSvg('info.circle'),
  share: coreSymbolSvg('square.and.arrow.up'),
  star: coreSymbolSvg('star'),
  trash: coreSymbolSvg('trash'),
})
export const TAB_ICON_SVG = Object.freeze([TAB_SETTINGS_SYMBOL, ...TAB_NATIVE_SYMBOLS])
export const ICON_SVG: Readonly<Record<IconName, string>> = Object.freeze({
  accessibility: coreSymbolSvg('person.crop.circle'),
  airdrop: coreSymbolSvg('dot.radiowaves.left.right'),
  apps: coreSymbolSvg('square.grid.2x2'),
  battery: coreSymbolSvg('battery.100'),
  book: coreSymbolSvg('book'),
  camera: coreSymbolSvg('camera'),
  car: coreSymbolSvg('car'),
  clock: coreSymbolSvg('clock'),
  device: coreSymbolSvg('device.phone.portrait'),
  gear: coreSymbolSvg('gearshape'),
  globe: coreSymbolSvg('globe'),
  info: coreSymbolSvg('info.circle'),
  keyboard: coreSymbolSvg('keyboard'),
  lock: coreSymbolSvg('lock'),
  moon: coreSymbolSvg('moon'),
  notifications: coreSymbolSvg('bell'),
  privacy: coreSymbolSvg('hand.raised'),
  search: coreSymbolSvg('magnifyingglass'),
  sparkles: coreSymbolSvg('sparkles'),
  text: coreSymbolSvg('textformat'),
  time: coreSymbolSvg('hourglass'),
})
