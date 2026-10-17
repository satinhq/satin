import { expect, it } from 'vitest'
import { bottomToolbarGeometry } from './bottomToolbarGeometry.ts'

it('keeps portrait phone buttons above the screen curve when fitted WebKit reports no safe bottom', () => {
  const fitted = bottomToolbarGeometry(true, false, 0)
  const covered = bottomToolbarGeometry(true, false, 34)
  expect(fitted).toEqual(covered)
  expect(fitted).toEqual({ height: 48, gap: 28, inlineInset: 28, contentInset: 86 })
})
