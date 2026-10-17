import { describe, expect, it } from 'vitest'
import { SCENE_STYLE } from './Scene.tsx'
import {
  SETTINGS_DISCLOSURE_LIGHT_COLOR,
  SETTINGS_DISCLOSURE_OFFSET_X_PX,
} from '../../settings/tokens.ts'
describe('fixture token initialization', () => {
  it('resolves disclosure colors and fractional geometry before creating the style map', () => {
    expect(SCENE_STYLE['--settings-disclosure-light']).toBe(SETTINGS_DISCLOSURE_LIGHT_COLOR)
    expect(SCENE_STYLE['--settings-disclosure-offset-x']).toBe(
      `${SETTINGS_DISCLOSURE_OFFSET_X_PX}px`,
    )
    expect(
      Object.values(SCENE_STYLE).every(
        value => value !== undefined && !/undefined|NaN/.test(String(value)),
      ),
    ).toBe(true)
  })
})
