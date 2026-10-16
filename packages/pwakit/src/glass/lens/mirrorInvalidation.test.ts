import { expect, it } from 'vitest'
import { changesMirrorSource } from './mirrorInvalidation.ts'
it('keeps transient Pressable feedback out of scene invalidation without dropping content changes', () => {
  for (const attributeName of ['data-satin-press-state', 'data-satin-press-transition']) {
    expect(changesMirrorSource({ type: 'attributes', attributeName })).toBe(false)
  }
  for (const attributeName of ['style', 'class', 'hidden', 'aria-hidden', 'data-source-offset-y']) {
    expect(changesMirrorSource({ type: 'attributes', attributeName })).toBe(true)
  }
  expect(changesMirrorSource({ type: 'childList', attributeName: null })).toBe(true)
  expect(changesMirrorSource({ type: 'characterData', attributeName: null })).toBe(true)
})
