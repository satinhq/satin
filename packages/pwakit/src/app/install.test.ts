import { describe, expect, it } from 'vitest'
import { isIOSWebKit, type IOSWebKitSignals } from './install.ts'

const mobileUA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
const desktopUA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/27.0 Safari/605.1.15'
const webkit: IOSWebKitSignals = { touchCallout: true, gestureEvents: true, standalone: true }
const nonWebkit: IOSWebKitSignals = { touchCallout: false, gestureEvents: false, standalone: false }

// Knowledge-derived shapes, not browser captures. Device/Catalyst proof is pending.
describe('app platform policy', () => {
  it.each([
    ['iOS Safari', mobileUA, 'iPhone', 5, webkit, true],
    ['iOS Chrome using WebKit', mobileUA + ' CriOS/100', 'iPhone', 5, webkit, true],
    ['iOS Firefox using WebKit', mobileUA + ' FxiOS/100', 'iPhone', 5, webkit, true],
    ['installed web app', mobileUA, 'iPhone', 5, webkit, true],
    ['iPadOS desktop-class Safari', desktopUA, 'MacIntel', 5, webkit, true],
    ['WKWebView', mobileUA, 'iPhone', 5, { ...webkit, standalone: false }, true],
    [
      'Catalyst iOS-family WKWebView',
      mobileUA,
      'MacIntel',
      0,
      { ...webkit, standalone: false },
      true,
    ],
    ['desktop Safari', desktopUA, 'MacIntel', 0, webkit, false],
    ['desktop Chrome', desktopUA + ' Chrome/140', 'MacIntel', 0, nonWebkit, false],
    ['Chrome iPhone emulation', mobileUA, 'iPhone', 5, nonWebkit, false],
    ['Chrome iPad emulation', desktopUA, 'MacIntel', 5, nonWebkit, false],
    ['Firefox', 'Mozilla/5.0 Gecko/20100101 Firefox/140', 'MacIntel', 0, nonWebkit, false],
    ['Firefox spoofing iPhone', mobileUA, 'iPhone', 5, nonWebkit, false],
    [
      'Android Chrome',
      'Mozilla/5.0 Android AppleWebKit/537.36 Chrome/140',
      'Linux',
      5,
      nonWebkit,
      false,
    ],
  ] as const)('%s', (_name, userAgent, platform, touchPoints, signals, expected) => {
    expect(isIOSWebKit(userAgent, platform, touchPoints, signals)).toBe(expected)
  })

  it.each(['touchCallout', 'gestureEvents', 'standalone'] as const)(
    'preserves an explicit iOS identity with only %s available',
    signal => {
      expect(isIOSWebKit(mobileUA, 'iPhone', 5, { ...nonWebkit, [signal]: true })).toBe(true)
      expect(isIOSWebKit(desktopUA, 'MacIntel', 5, { ...nonWebkit, [signal]: true })).toBe(false)
    },
  )

  it('requires two independent signals for the touch Mac identity', () => {
    expect(isIOSWebKit(desktopUA, 'MacIntel', 5, { ...webkit, standalone: false })).toBe(true)
    expect(isIOSWebKit('Mozilla iPhone Gecko/123', 'iPhone', 5, webkit)).toBe(false)
    expect(isIOSWebKit(mobileUA + ' Android', 'iPhone', 5, webkit)).toBe(false)
  })
})
