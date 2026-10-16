/** Ordered destinations, not registry order, define a fresh sidebar's initial detail. */
export function chooseSidebarInitialEntry<Entry extends { id: string; disabled?: boolean }>(
  entries: readonly Entry[],
  initial: 'first' | false | string = 'first',
): Entry | undefined {
  if (initial === false) return undefined
  return initial === 'first'
    ? entries.find(entry => !entry.disabled)
    : entries.find(entry => entry.id === initial && !entry.disabled)
}
