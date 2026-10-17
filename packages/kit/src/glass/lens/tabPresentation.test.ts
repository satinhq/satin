import { expect, it } from 'vitest'
import { STRIPE_BACKGROUND_MODES, TINT_BACKGROUND_MODES } from './referenceBackground.ts'
import { tabPresentation, tabProbeOverride } from './tabPresentation.ts'

it('keeps tabs across the default Settings-to-backdrop journey without capture flags', () => {
  const override = tabProbeOverride('')
  for (const page of [
    'settings',
    'shapes',
    'wallpaper',
    ...TINT_BACKGROUND_MODES,
    ...STRIPE_BACKGROUND_MODES,
    'settings',
  ] as const) {
    expect(tabPresentation(page, 'none', override).visible).toBe(true)
  }
})
it('keeps bare-glass captures explicit and drag/liquid specimens separate', () => {
  expect(tabPresentation('shapes', 'none', tabProbeOverride('?tabbar=0'))).toEqual({
    visible: false,
    reason: 'explicit-probe',
  })
  expect(tabPresentation('shapes', 'none', tabProbeOverride('?tabbar=1')).visible).toBe(true)
  expect(tabPresentation('settings', 'none', false).visible).toBe(true)
  expect(tabPresentation('drag', 'none').visible).toBe(false)
  for (const motion of ['press', 'merge', 'pill'] as const)
    expect(tabPresentation('shapes', motion, true).visible).toBe(false)
  expect(tabProbeOverride('?tabbar=bad')).toBeUndefined()
})
