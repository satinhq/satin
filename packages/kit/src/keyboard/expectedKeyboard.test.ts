// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  defaultSoftwareKeyboardHeight,
  expectedKeyboardHeight,
  readMeasuredKeyboardHeight,
  rememberKeyboardHeight,
} from './expectedKeyboard.ts'

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPad')
})
afterEach(() => vi.restoreAllMocks())

it.each([
  {
    device: 'narrow iPad',
    userAgent: 'iPad',
    platform: 'iPad',
    touchPoints: 5,
    width: 440,
    height: 956,
    expected: 296,
  },
  {
    device: 'desktop-agent iPad',
    userAgent: 'Macintosh',
    platform: 'MacIntel',
    touchPoints: 5,
    width: 440,
    height: 956,
    expected: 296,
  },
  {
    device: 'wide phone',
    userAgent: 'iPhone',
    platform: 'iPhone',
    touchPoints: 5,
    width: 700,
    height: 800,
    expected: 391,
  },
  {
    device: 'wide phone landscape',
    userAgent: 'iPhone',
    platform: 'iPhone',
    touchPoints: 5,
    width: 800,
    height: 700,
    expected: 250,
  },
])(
  'keeps $device keyboard defaults independent of window class',
  ({ userAgent, platform, touchPoints, width, height, expected }) => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent)
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platform)
    vi.spyOn(navigator, 'maxTouchPoints', 'get').mockReturnValue(touchPoints)
    expect(defaultSoftwareKeyboardHeight(width, height)).toBe(expected)
    expect(expectedKeyboardHeight(width, height)).toBe(expected)
  },
)

it('starts from the measured device heights before any report', () => {
  // Installed iPad Pro 13-inch, landscape: 498 pt with the predictive bar.
  expect(defaultSoftwareKeyboardHeight(1366, 1024)).toBe(498)
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPhone')
  // iPhone 17 Pro Max: the native 347 pt keyboard plus the web form accessory bar.
  expect(defaultSoftwareKeyboardHeight(440, 894)).toBe(391)
  expect(defaultSoftwareKeyboardHeight(440, 956)).toBe(391)
  expect(defaultSoftwareKeyboardHeight(375, 667)).toBe(304)
  expect(defaultSoftwareKeyboardHeight(956, 440)).toBe(250)
})

it('prefers the tallest keyboard measured at this window size, across launches', () => {
  expect(readMeasuredKeyboardHeight(1366, 1024)).toBeNull()
  expect(expectedKeyboardHeight(1366, 1024)).toBe(498)
  rememberKeyboardHeight(1366, 1024, 512)
  expect(readMeasuredKeyboardHeight(1366, 1024)).toBe(512)
  expect(expectedKeyboardHeight(1366, 1024)).toBe(512)
  // Another window size (the other orientation) keeps its own measure.
  expect(expectedKeyboardHeight(1024, 1366)).toBe(defaultSoftwareKeyboardHeight(1024, 1366))
})

it('ignores a stored value that cannot be a software keyboard', () => {
  localStorage.setItem('satin-keyboard-height:1366x1024', '60')
  expect(readMeasuredKeyboardHeight(1366, 1024)).toBeNull()
  localStorage.setItem('satin-keyboard-height:1366x1024', '900')
  expect(readMeasuredKeyboardHeight(1366, 1024)).toBeNull()
  localStorage.setItem('satin-keyboard-height:1366x1024', 'tall')
  expect(readMeasuredKeyboardHeight(1366, 1024)).toBeNull()
})
