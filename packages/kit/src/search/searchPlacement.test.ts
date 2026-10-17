import { describe, expect, it } from 'vitest'
import { resolveSearchPlacement } from './searchPlacement.ts'

const screen = { compact: true, bottomBarItems: false, searchToolbarItem: false }

describe('search placement by device idiom', () => {
  it.each([true, false])('keeps iPad search in its toolbar at compact=%s', compact => {
    expect(
      resolveSearchPlacement(undefined, {
        ...screen,
        compact,
        idiom: 'pad',
        tabbed: true,
        scoped: true,
      }),
    ).toBe('navigationBarToolbar')
    expect(
      resolveSearchPlacement('toolbar', {
        ...screen,
        compact,
        idiom: 'pad',
        pane: 'sidebar',
        scoped: true,
      }),
    ).toBe('navigationBarToolbar')
  })
  it('places automatic sidebar search below the sidebar toolbar', () => {
    expect(resolveSearchPlacement(undefined, { ...screen, idiom: 'pad', pane: 'sidebar' })).toBe(
      'navigationBarDrawer',
    )
    expect(resolveSearchPlacement(undefined, { ...screen, idiom: 'pad', pane: 'detail' })).toBe(
      'navigationBarToolbar',
    )
    expect(resolveSearchPlacement('navigationBarDrawer', { ...screen, idiom: 'pad' })).toBe(
      'navigationBarDrawer',
    )
  })
  it.each(['phone', 'unknown', undefined] as const)(
    'preserves the existing routing for %s',
    idiom => {
      expect(resolveSearchPlacement(undefined, { ...screen, idiom })).toBe('toolbar')
      expect(resolveSearchPlacement(undefined, { ...screen, idiom, tabbed: true })).toBe(
        'navigationBarDrawer',
      )
      expect(resolveSearchPlacement('toolbar', { ...screen, idiom, scoped: true })).toBe(
        'navigationBarDrawer',
      )
      expect(resolveSearchPlacement(undefined, { ...screen, idiom, compact: false })).toBe(
        'navigationBarToolbar',
      )
    },
  )
})
