export type TabIdentity<Id extends string = string> = Readonly<{ id: Id; disabled?: boolean }>

export function resolveTabSelection<Id extends string>(
  tabs: readonly TabIdentity<Id>[],
  requested?: Id,
): Id | undefined {
  const ids = new Set<string>()
  for (const tab of tabs) {
    if (!tab.id.trim() || ids.has(tab.id))
      throw new Error('Tab ids must be non-empty and unique within TabView.')
    ids.add(tab.id)
  }
  return (
    tabs.find(tab => tab.id === requested && !tab.disabled)?.id ??
    tabs.find(tab => !tab.disabled)?.id
  )
}

export function retainTabs<Id extends string>(
  visited: readonly Id[],
  tabs: readonly TabIdentity<Id>[],
  selection?: Id,
): readonly Id[] {
  const next = visited.filter(id => tabs.some(tab => tab.id === id))
  if (selection !== undefined && !next.includes(selection)) next.push(selection)
  return next.length === visited.length && next.every((id, i) => id === visited[i]) ? visited : next
}
