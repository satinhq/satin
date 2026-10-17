/** Device family is independent of window width and orientation. */
export type DeviceIdiom = 'phone' | 'pad' | 'unknown'
export function resolveDeviceIdiom(
  userAgent: string,
  platform: string,
  maxTouchPoints: number,
): DeviceIdiom {
  if (/iPhone|iPod/i.test(userAgent)) return 'phone'
  if (/iPad/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1)) return 'pad'
  return 'unknown'
}
export function readDeviceIdiom(): DeviceIdiom {
  return typeof navigator === 'undefined'
    ? 'unknown'
    : resolveDeviceIdiom(navigator.userAgent, navigator.platform, navigator.maxTouchPoints)
}
