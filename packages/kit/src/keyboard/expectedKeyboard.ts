import { readDeviceIdiom } from '../layout/deviceIdiom.ts'

/** A viewport occlusion this tall is a software keyboard (the iPad hardware-keyboard bar is 55-70 pt). */
export const SOFTWARE_KEYBOARD_MIN_HEIGHT = 120

const STORAGE_PREFIX = 'satin-keyboard-height:'
/** Baseline upper share, with the existing short phone landscape allowance below. */
const MAX_KEYBOARD_SHARE = 0.7

/** Apply the same plausibility limit to live reports and remembered geometry. */
export function isPlausibleKeyboardHeight(
  width: number,
  layoutHeight: number,
  keyboardHeight: number,
): boolean {
  // The phone landscape default can exceed 70% in a short window. Preserve that
  // existing allowance instead of rejecting the geometry we already plan for.
  const maximum = Math.min(
    layoutHeight,
    Math.max(layoutHeight * MAX_KEYBOARD_SHARE, defaultSoftwareKeyboardHeight(width, layoutHeight)),
  )
  return Number.isFinite(keyboardHeight) && keyboardHeight >= 0 && keyboardHeight <= maximum
}

/*
 * The software keyboard's height before WebKit has ever reported one at this window size.
 *
 * It only has to be at least as tall as the real keyboard: presentations use it to keep a text
 * field clear of the keyboard that has not arrived yet, and the first report replaces it.
 * References: iPad Pro 13-inch landscape (1366 x 1024) reports 498 pt with the predictive bar
 * (installed, iOS 27.0); iPhone 17 Pro Max portrait raises a stock alert for a 347 pt keyboard
 * (measured-reference native recording), and a web text field adds the 44 pt form accessory bar.
 * The other classes are estimates until a device reports them.
 */
export function defaultSoftwareKeyboardHeight(width: number, height: number): number {
  const landscape = width > height
  if (readDeviceIdiom() === 'pad') return Math.round(height * (landscape ? 0.4865 : 0.31))
  if (landscape) return 250
  return height >= 800 ? 391 : 304
}

const storageKey = (width: number, height: number) => `${STORAGE_PREFIX}${width}x${height}`

/** The tallest software keyboard WebKit has reported at this window size, in an earlier launch too. */
export function readMeasuredKeyboardHeight(width: number, height: number): number | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const stored = Number(localStorage.getItem(storageKey(width, height)))
    const plausible =
      stored >= SOFTWARE_KEYBOARD_MIN_HEIGHT && isPlausibleKeyboardHeight(width, height, stored)
    return plausible ? stored : null
  } catch {
    // Storage can be unavailable (private mode, a test double): the default stands in.
    return null
  }
}

export function rememberKeyboardHeight(width: number, height: number, keyboardHeight: number) {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(storageKey(width, height), String(keyboardHeight))
  } catch {
    // A full or unavailable store only costs the next launch its measured height.
  }
}

/** The keyboard height to plan for: the tallest measured one, else the device default. */
export function expectedKeyboardHeight(width: number, height: number): number {
  return readMeasuredKeyboardHeight(width, height) ?? defaultSoftwareKeyboardHeight(width, height)
}
