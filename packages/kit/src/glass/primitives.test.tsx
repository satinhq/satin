import { describe, expect, it } from 'vitest'
import type { GlassBarProps } from './GlassBar.tsx'
import { type TabBarItem, type TabBarProps } from './TabBar.tsx'
import { resolveTabBarModel, intrinsicTabGeometry } from './tabBarModel.ts'

const items: readonly TabBarItem[] = [
  { icon: 'A', id: 'alpha', label: 'Alpha' },
  { icon: 'B', id: 'beta', label: 'Beta' },
  { icon: 'C', id: 'gamma', label: 'Gamma' },
]

describe('glass primitive props', () => {
  it('places the selection inside the native three-tab intrinsic platter', () => {
    // iOS 27 native reference: 274 pt platter, 86 pt centre spacing, 94 pt selected item.
    expect(intrinsicTabGeometry(274, 3)).toEqual({
      centres: [51, 137, 223],
      selectionWidth: 94,
    })
  })

  it('resolves a controlled tab selection without mutating item order', () => {
    expect(resolveTabBarModel(items, 'beta')).toEqual({ selectedIndex: 1 })
    expect(items.map(item => item.id)).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('rejects ambiguous or unregistered controlled tab props', () => {
    expect(() =>
      resolveTabBarModel([...items, { ...items[0]!, label: 'Duplicate' }], 'alpha'),
    ).toThrow('duplicated')
    expect(() => resolveTabBarModel(items, 'missing')).toThrow('not registered')
    expect(() => resolveTabBarModel(items.slice(0, 1), 'alpha')).toThrow('between two and five')
  })

  it('keeps material variants and controlled selection explicit in the type surface', () => {
    const bar: GlassBarProps = { title: 'Title', variant: 'clear' }
    const tabs: TabBarProps = {
      items,
      onSelect() {},
      selected: 'alpha',
      variant: 'regular',
    }
    const compileInvalidProps = () => {
      // @ts-expect-error GlassBar exposes only measured semantic variants.
      const invalidBar: GlassBarProps = { title: 'Title', variant: 'thick' }
      // @ts-expect-error TabBar is controlled and requires onSelect.
      const invalidTabs: TabBarProps = { items, selected: 'alpha' }
      return { invalidBar, invalidTabs }
    }

    expect(bar.variant).toBe('clear')
    expect(tabs.selected).toBe('alpha')
    expect(compileInvalidProps).toBeTypeOf('function')
  })
})
