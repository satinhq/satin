/* Stock iOS 27 native reference bottom-flex, iPhone 17 Pro Max, both appearances.
 * A fitted WebKit viewport may report zero safe bottom. Floating phone chrome
 * still needs the native corner clearance; it is not a reconstruction of env(). */
export function bottomToolbarGeometry(phone: boolean, compact: boolean, safeBottom: number) {
  const height = phone && compact ? 44 : 48
  const gap = phone ? (compact ? 24 : Math.max(28, safeBottom - 6)) : Math.max(0, safeBottom - 6)
  return {
    height,
    gap,
    inlineInset: phone && compact ? 38 : 28,
    // Native List adjustedContentInset.bottom: 86 portrait, 78 landscape.
    contentInset: phone ? gap + height + 10 : safeBottom + 50.333333,
  }
}
