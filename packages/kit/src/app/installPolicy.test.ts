import { expect, it } from 'vitest'
import {
  classifyInstallSignals,
  installPolicy,
  installSteps,
  safariBarGeometry,
  safariToolbarCollapse,
  serializeInstallPolicy,
} from './installPolicy.ts'
import { classifyInstallBrowser, classifyInstallDevice, safariVersion } from './installContext.ts'
import { INSTALL_STRINGS } from './installStrings.ts'

const webkit = 'AppleWebKit/605.1.15'
const cases = [
  ['iPhone ' + webkit + ' Version/27.0 Safari/604.1', 'iPhone', 5, 'iphone', 'safari', 27],
  ['Macintosh ' + webkit + ' Version/27.0 Safari/605.1.15', 'MacIntel', 5, 'ipad', 'safari', 27],
  ['Macintosh ' + webkit + ' Version/27.0 Safari/605.1.15', 'MacIntel', 0, 'other', 'safari', 27],
  ['iPhone ' + webkit + ' CriOS/140.0', 'iPhone', 5, 'iphone', 'other', null],
  ['iPhone ' + webkit + ' FxiOS/140.0 Instagram', 'iPhone', 5, 'iphone', 'other', null],
  ['iPhone ' + webkit + ' Instagram', 'iPhone', 5, 'iphone', 'in-app', null],
  ['iPhone ' + webkit, 'iPhone', 5, 'iphone', 'in-app', null],
  ['Android ' + webkit + ' Chrome/140.0 Safari/537.36', 'Linux', 5, 'other', 'other', null],
] as const

it.each(cases)(
  'uses the same serialized and custom policy for %s',
  (ua, platform, touch, device, browser, version) => {
    const embedded = new Function(`return (${serializeInstallPolicy()})`)() as typeof installPolicy
    const expected = { device, browser, safariVersion: version }
    expect(embedded.classifyInstallSignals(ua, platform, touch)).toEqual(expected)
    expect(classifyInstallSignals(ua, platform, touch)).toEqual(expected)
    expect(classifyInstallDevice(ua, platform, touch)).toBe(device)
    expect(classifyInstallBrowser(ua)).toBe(browser)
    expect(safariVersion(ua)).toBe(version)
  },
)

it('keeps measured Safari thresholds and tip geometry identical in standalone serialization', () => {
  const embedded = new Function(`return (${serializeInstallPolicy()})`)() as typeof installPolicy
  expect(safariBarGeometry(27, 'ipad', 599, 1000, 100)).toBe('unknown')
  expect(safariBarGeometry(27, 'ipad', 600, 1000, 100)).toBe('top')
  expect(safariBarGeometry(27, 'iphone', 402, 714, 69)).toBe('compact')
  expect(safariBarGeometry(27, 'iphone', 402, 714, 70)).toBe('toolbar')
  expect(safariBarGeometry(26, 'iphone', 402, 714, 100)).toBe('unknown')
  expect(safariBarGeometry(null, 'iphone', 402, 714, 100)).toBe('unknown')
  for (const bar of ['compact', 'toolbar', 'top'] as const) {
    expect(embedded.tipPath(300, 42, bar)).toBe(installPolicy.tipPath(300, 42, bar))
  }
})

it('shares step order, control names and alternate-browser instructions', () => {
  expect(installSteps('safari', 'compact', INSTALL_STRINGS)[0]).toEqual({
    symbol: 'menu',
    action: INSTALL_STRINGS.rowMenu,
    where: '',
  })
  expect(installSteps('safari', 'toolbar', INSTALL_STRINGS)[0]).toEqual({
    symbol: 'share',
    action: INSTALL_STRINGS.rowShare,
    where: '',
  })
  expect(installSteps('other', 'unknown', INSTALL_STRINGS).map(row => row.where)).toEqual([
    INSTALL_STRINGS.rowShareBrowser,
    INSTALL_STRINGS.rowHomeBrowser,
    INSTALL_STRINGS.keepWebApp,
  ])
  expect(installSteps('safari', 'top', INSTALL_STRINGS).map(row => row.symbol)).toEqual([
    'share',
    'home',
    'put',
  ])
})

it('does not touch the DOM when Safari toolbar measurement cannot affect the layout', () => {
  expect(safariToolbarCollapse(null, 'other', 402, 714)).toBe(0)
  expect(safariToolbarCollapse(26, 'iphone', 402, 714)).toBe(0)
  expect(safariToolbarCollapse(27, 'ipad', 834, 1194)).toBe(0)
  expect(safariToolbarCollapse(27, 'iphone', 874, 402)).toBe(0)
})
