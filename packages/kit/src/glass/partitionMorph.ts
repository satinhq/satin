import type { ShapeFrame } from './shapeTrack.ts'

export type MaterialPartition = 'split' | 'merge'

/** A new partition starts inside its parent at the closest point to its resting
 * centre. A removed partition retires when departure begins, before the survivor expands.
 * Proximity and the existing smooth-union field create the neck; callers supply
 * measured arrival/departure progress rather than a transition-specific bridge. */
export function partitionMaterialFrame(
  parent: ShapeFrame,
  branch: ShapeFrame,
  visibility: number,
  direction: MaterialPartition,
): ShapeFrame {
  // Native group-split pop removes the separate flag platter at its first
  // departure frame (r9 F876; completion F2944). It does not run split backward.
  // Keep the exact held endpoint; the caller owns when departure starts.
  const amount =
    direction === 'merge' ? (visibility >= 1 ? 1 : 0) : Math.max(0, Math.min(1, visibility))
  const branchX = branch.x + branch.width / 2
  const branchY = branch.y + branch.height / 2
  const seedX =
    direction === 'merge' ? branchX : Math.max(parent.x, Math.min(parent.x + parent.width, branchX))
  const seedY =
    direction === 'merge'
      ? branchY
      : Math.max(parent.y, Math.min(parent.y + parent.height, branchY))
  const width = branch.width * amount
  const height = branch.height * amount
  return {
    x: seedX + (branchX - seedX) * amount - width / 2,
    y: seedY + (branchY - seedY) * amount - height / 2,
    width,
    height,
  }
}
