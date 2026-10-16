// Native UIRefreshControl release, iPad iOS 27.0, reference native reference.
// 19 native samples: cosine fit RMSE 0.142 pt, max 0.261 pt over 60 pt.
// Fitting capture: skips 0.4065%, max 1, unreadable 0; source 58.696 Hz.
// This is a measured ease, not a spring. Painted PWA acceptance is pending.
export const refreshHeight = 60
export const refreshReleaseDuration = 300.171
export const refreshRelease = Array.from({ length: 31 }, (_, frame) => ({
  time: (frame / 30) * refreshReleaseDuration,
  height: (refreshHeight / 2) * (1 + Math.cos((Math.PI * frame) / 30)),
}))

/** Preserve the old height curve when native bottom clamping consumes part of the spacer.
 * The content stays pinned until the shrinking spacer reaches that consumed distance. */
export function refreshReleaseOffset(height: number, displacement: number) {
  return Math.max(0, height - (refreshHeight - displacement))
}
