/**
 * Returns a new array: the elements at `fromOffsets` move,
 * in their original order, to just before the element that was at `toOffset`. Pass it exactly
 * what `ForEach`'s `onMove` reports.
 *
 * `toOffset` counts positions in the original array: moving the first of three
 * rows below the second reports `toOffset` 2, not 1. Use `items.length` to move to the end.
 *
 * @example
 * <ForEach
 *   data={todos}
 *   onMove={(from, to) => setTodos(todos => moving(todos, { fromOffsets: from, toOffset: to }))}
 * >
 */
export function moving<T>(
  items: readonly T[],
  { fromOffsets, toOffset }: { fromOffsets: readonly number[]; toOffset: number },
): T[] {
  const moved = new Set(fromOffsets)
  const kept = items.filter((_, offset) => !moved.has(offset))
  const movedItems = items.filter((_, offset) => moved.has(offset))
  // Every moved element that sat above the destination leaves a gap, so the destination shifts up.
  const movedAbove = [...moved].filter(offset => offset < toOffset).length
  kept.splice(toOffset - movedAbove, 0, ...movedItems)
  return kept
}

/**
 * Swift `remove(atOffsets:)`, returning a new array without the elements at `offsets`. Pass it
 * exactly what `ForEach`'s `onDelete` reports.
 *
 * @example
 * <ForEach data={todos} onDelete={offsets => setTodos(todos => removing(todos, offsets))}>
 */
export function removing<T>(items: readonly T[], offsets: readonly number[]): T[] {
  const removed = new Set(offsets)
  return items.filter((_, offset) => !removed.has(offset))
}
