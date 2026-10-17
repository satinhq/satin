import { describe, expect, it } from 'vitest'
import { chooseSidebarInitialEntry } from './sidebarSelection.ts'

describe('sidebar launch destination', () => {
  const entries = [{ id: 'unavailable', disabled: true }, { id: 'general' }, { id: 'privacy' }]
  it('uses visible enabled order, including after an empty asynchronous list', () => {
    expect(chooseSidebarInitialEntry([])).toBeUndefined()
    expect(chooseSidebarInitialEntry(entries)).toBe(entries[1])
    expect(chooseSidebarInitialEntry([entries[2]!, entries[1]!])).toBe(entries[2])
  })
  it('honors an explicit destination or empty launch without inventing a fallback', () => {
    expect(chooseSidebarInitialEntry(entries, 'privacy')).toBe(entries[2])
    expect(chooseSidebarInitialEntry(entries, false)).toBeUndefined()
    expect(chooseSidebarInitialEntry(entries, 'missing')).toBeUndefined()
    expect(chooseSidebarInitialEntry(entries, 'unavailable')).toBeUndefined()
  })
})
