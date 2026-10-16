import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'
import {
  assertPublicDoc,
  checkShippedDocs,
  docsBaseUrl,
  prepareGuide,
} from '../scripts/agent-docs.mjs'

const scratch = process.env.PWAKIT_SCRATCH_ROOT
if (!scratch) throw new Error('Set PWAKIT_SCRATCH_ROOT for documentation tests.')

test('shipped prose rejects private delivery status, including links and comments', () => {
  for (const text of [
    ['Sheets are pending ', 'Phase', ' 12e.'].join(''),
    ['Waiting for ', 'phase', '-12v.'].join(''),
    ['<!-- ', 'Phase', ' 08a -->'].join(''),
    ['[phone checklist](specs/', 'phase', '-12w-notes.md)'].join(''),
    'This branch uses an adapter.',
    ['The renderer ', 'la', 'ne is still running.'].join(''),
    ['Merged', ' into ', 'previe', 'w-int.'].join(''),
    ['Use th', 'e code', 'x-12k ', 'worktr', 'ee.'].join(''),
    ['The ad', 'apter ', 'is awa', 'iting ', '12v.'].join(''),
    ['W', 19, 'd opt-in candidate.'].join(''),
    `The ${['co', 'ordinator'].join('')} reviews this screen.`,
    `Use ${['~', 'Code', 'private', 'workflow'].join('/')}.`,
  ])
    assert.throws(() => assertPublicDoc(text, 'guide'), /internal project status/)
  for (const text of [
    'TransitionPhase and MenuInteractionPhase are types.',
    'During the layout phase, restore the offset.',
    'Sheets are unavailable in this release.',
    'Test iOS 27 on the installed app.',
    'W3C standards and w3c-xmlserializer are public dependency names.',
  ]) {
    assert.doesNotThrow(() => assertPublicDoc(text, 'guide'))
  }
})

test('the guard discovers added Markdown files recursively, not just known guide names', async () => {
  const directory = await mkdtemp(resolve(scratch, 'public-docs-test-'))
  try {
    await mkdir(resolve(directory, 'guides'))
    await writeFile(resolve(directory, 'README.md'), 'Public setup instructions.')
    await writeFile(resolve(directory, 'guides/NEW.MD'), ['This ', 'la', 'ne is pending.'].join(''))
    await assert.rejects(checkShippedDocs(directory), /NEW.MD.*internal project status/)
    await writeFile(resolve(directory, 'guides/NEW.MD'), 'Use a pushed confirmation screen.')
    assert.equal(await checkShippedDocs(directory), 2)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('configurable versioned docs base resolves repository links and preserves external links', () => {
  const base = 'https://docs.example.com/satin/v27'
  const source =
    '[data](data.md#save) [package](../packages/pwakit/README.md) [source](https://github.com/satinhq/satin/blob/main/docs/install.md) [Apple](https://apple.com/) [here](#top)'
  assert.equal(
    prepareGuide(source, base),
    '[data](https://docs.example.com/satin/v27/docs/data.md#save) [package](https://docs.example.com/satin/v27/packages/pwakit/README.md) [source](https://docs.example.com/satin/v27/docs/install.md) [Apple](https://apple.com/) [here](#top)',
  )
  assert.match(prepareGuide('[data](data.md)'), /blob\/main\/docs\/data.md/)
  for (const value of [
    'file:///tmp/',
    'javascript:alert(1)',
    'https://user:secret@localhost/',
    'https://example.com/?q=1',
    'https://example.com/#top',
  ])
    assert.throws(() => docsBaseUrl(value))
})
