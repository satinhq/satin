import { expect, it } from 'vitest'
import { inkForRevision, KeptGlyphs } from './keptGlyphs.ts'

it('keeps the ink a slot gives up and finds it again by signature', () => {
  const glyphs = new KeptGlyphs()
  expect(glyphs.find('dock', 'over-rows')).toBeUndefined()
  // The dock leaves the flat page for the rows: the flat ink is kept under its key.
  expect(glyphs.replace('dock', { signature: 'over-flat', key: 'glyph:1' }, ['glyph:2'])).toEqual({
    keep: ['glyph:1'],
    unkeep: [],
  })
  expect(glyphs.find('dock', 'over-flat')).toBe('glyph:1')
  // Another slot's ink with the same signature is not the dock's.
  expect(glyphs.find('right', 'over-flat')).toBeUndefined()
})

it('lets the least recently used ink go beyond its limit, never ink that is installed', () => {
  const glyphs = new KeptGlyphs(2)
  glyphs.replace('dock', { signature: 'a', key: 'glyph:1' }, [])
  glyphs.replace('dock', { signature: 'b', key: 'glyph:2' }, [])
  // `a` is installed again from its kept image: it is the most recently used.
  glyphs.used('dock', 'a')
  expect(glyphs.replace('dock', { signature: 'c', key: 'glyph:3' }, ['glyph:1'])).toEqual({
    keep: ['glyph:3'],
    unkeep: ['glyph:2'],
  })
  expect(glyphs.find('dock', 'b')).toBeUndefined()
  expect(glyphs.find('dock', 'a')).toBe('glyph:1')
  // Everything else is installed or just kept: nothing can be let go, the ledger grows by one.
  expect(
    glyphs.replace('dock', { signature: 'd', key: 'glyph:4' }, ['glyph:1', 'glyph:3']),
  ).toEqual({
    keep: ['glyph:4'],
    unkeep: [],
  })
})

it("after a reset reuses nothing and lets the renderer's images go with the next batch", () => {
  const glyphs = new KeptGlyphs()
  glyphs.replace('dock', { signature: 'a', key: 'glyph:1' }, [])
  glyphs.replace('dock', { signature: 'b', key: 'glyph:2' }, [])
  glyphs.reset()
  expect(glyphs.find('dock', 'a')).toBeUndefined()
  expect(glyphs.replace('dock', undefined, [])).toEqual({
    keep: [],
    unkeep: ['glyph:1', 'glyph:2'],
  })
  expect(glyphs.replace('dock', undefined, [])).toEqual({ keep: [], unkeep: [] })
})

const installed = { signature: 'over-flat', key: 'glyph:1' }

it('new ink that must be captured never holds a new backdrop back: it follows one revision later', () => {
  expect(
    inkForRevision({
      signature: 'over-rows',
      installed,
      kept: false,
      transformed: false,
      backdropChanges: true,
    }),
  ).toEqual({ signature: 'over-flat', deferred: true })
  // The following revision installs no plane: the ink is captured then.
  expect(
    inkForRevision({
      signature: 'over-rows',
      installed,
      kept: false,
      transformed: false,
      backdropChanges: false,
    }),
  ).toEqual({ signature: 'over-rows', deferred: false })
})

it('ink the renderer keeps is installed with the backdrop, in the same revision', () => {
  expect(
    inkForRevision({
      signature: 'over-rows',
      installed,
      kept: true,
      transformed: false,
      backdropChanges: true,
    }),
  ).toEqual({ signature: 'over-rows', deferred: false })
})

it('the first ink of a surface is captured with its first backdrop, and unchanged ink stays', () => {
  expect(
    inkForRevision({
      signature: 'over-rows',
      installed: undefined,
      kept: false,
      transformed: false,
      backdropChanges: true,
    }),
  ).toEqual({ signature: 'over-rows', deferred: false })
  expect(
    inkForRevision({
      signature: 'over-flat',
      installed,
      kept: false,
      transformed: false,
      backdropChanges: true,
    }),
  ).toEqual({ signature: 'over-flat', deferred: false })
})

it('transformed tab ink (the bar is minimizing) is never captured: the installed ink stays, with no follow-up', () => {
  expect(
    inkForRevision({
      signature: 'over-rows',
      installed,
      kept: false,
      transformed: true,
      backdropChanges: true,
    }),
  ).toEqual({ signature: 'over-flat', deferred: false })
})

it('ink deferred once is captured by the next revision even while the backdrop keeps changing', () => {
  // The list under the bar updates faster than preparations complete: every revision installs a
  // new plane. Deferring the ink each time would leave a changed label or badge unseen for as
  // long as that lasts.
  const first = inkForRevision({
    signature: 'badge-2',
    installed,
    kept: false,
    transformed: false,
    backdropChanges: true,
    deferredBefore: false,
  })
  expect(first).toEqual({ signature: 'over-flat', deferred: true })
  const second = inkForRevision({
    signature: 'badge-2',
    installed,
    kept: false,
    transformed: false,
    backdropChanges: true,
    deferredBefore: first.deferred,
  })
  expect(second).toEqual({ signature: 'badge-2', deferred: false })
})
