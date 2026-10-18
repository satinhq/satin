/**
 * Stock List, iPad swipe-parity r87 height sweep, with r71/r78 intrinsic rows.
 * See swipe-row-layout-calibration.json for the observed cells and capsules.
 * UIKit keeps captions inline below 60pt. Its compressed below-caption layout
 * uses integral row height (76 and 76.5pt both produce a 49.5pt capsule), then
 * switches from a 60pt-wide capsule to a 50pt circle at 77pt.
 */
export function swipeRowLayout(rowHeight: number) {
  const height = Math.max(0, Math.floor(rowHeight))
  const inline = height < 60
  const capsuleHeight = Math.max(0, Math.min(50, height - (inline ? 8 : 26.5)))
  return {
    inline,
    capsuleHeight,
    minimumButtonWidth: inline || capsuleHeight < 50 ? 60 : 50,
  }
}
