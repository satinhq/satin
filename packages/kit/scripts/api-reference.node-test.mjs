import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { referenceInventory, renderReference } from './api-reference.mjs'

const scratch = process.env.SATIN_SCRATCH_ROOT ?? tmpdir()

test('emitted signature/export drift cannot leave a concept reference silently stale', async () => {
  await mkdir(scratch, { recursive: true })
  const root = await mkdtemp(resolve(scratch, 'reference-drift-'))
  const concepts = [
    {
      concept: 'sheet',
      exports: ['Sheet'],
      behavior: 'Bind visibility.',
      limitations: 'Cold launch closes it.',
    },
  ]
  try {
    await mkdir(resolve(root, 'dist'))
    await writeFile(
      resolve(root, 'package.json'),
      JSON.stringify({ name: '@satinhq/kit', exports: { '.': { types: './dist/index.d.ts' } } }),
    )
    await writeFile(
      resolve(root, 'dist/index.d.ts'),
      'export { Sheet, type SheetProps } from "./sheet.js"',
    )
    const declaration = type =>
      `export interface SheetProps { isPresented: ${type} }\nexport declare function Sheet(props: SheetProps): unknown;`
    await writeFile(resolve(root, 'dist/sheet.d.ts'), declaration('boolean'))
    const original = renderReference(await referenceInventory(root), concepts)
    await writeFile(resolve(root, 'dist/sheet.d.ts'), declaration('string'))
    assert.notEqual(
      renderReference(await referenceInventory(root), concepts),
      original,
      'Transitive public prop change must invalidate the generated reference',
    )
    await writeFile(
      resolve(root, 'dist/index.d.ts'),
      'export { type SheetProps } from "./sheet.js"',
    )
    const removed = await referenceInventory(root)
    assert.throws(() => renderReference(removed, concepts), {
      message: 'Concept sheet maps unavailable export @satinhq/kit:Sheet',
    })
    await writeFile(
      resolve(root, 'dist/index.d.ts'),
      'export { Sheet } from "./sheet.js"; export declare const NewControl: unknown;',
    )
    const added = await referenceInventory(root)
    assert.ok(added.inventory.some(entry => entry.name === 'NewControl' && entry.kind === 'Value'))
    assert.throws(
      () => renderReference(added, concepts),
      /Review new public API behavior and unavailable descriptions: NewControl/,
    )
    await writeFile(
      resolve(root, 'dist/index.d.ts'),
      'export { Sheet } from "./sheet.js"; export declare const PhotoFilePicker: unknown;',
    )
    const acquired = await referenceInventory(root)
    assert.throws(
      () => renderReference(acquired, concepts),
      /Review unavailable concept metadata: PhotoFilePicker now exists/,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('reference is keyed by exports and keeps behavior and limits without leaking metadata labels', () => {
  const inventory = [
    {
      module: '@satinhq/kit',
      name: 'Sheet',
      kind: 'Value',
      declaration: '../sheet.d.ts',
      summary: 'Present content above the current screen.',
    },
    { module: '@satinhq/kit', name: 'SheetProps', kind: 'Type', declaration: '../sheet.d.ts' },
  ]
  const reference = renderReference({ inventory, hashes: ['root:hash'], sourceHash: 'source' }, [
    {
      concept: 'old presentation comparison',
      exports: ['Sheet'],
      behavior: 'Bind visibility.',
      limitations: 'Cold launch closes it.',
    },
  ])
  assert.match(reference, /\| Satin export \| Behavior \| Limits \| Also known as \|/)
  assert.match(
    reference,
    /\| \[`Sheet`\]\(\.\.\/sheet.d.ts\) \| Present content above the current screen\. \| Cold launch closes it\. \| sheet; modal presentation; bottom sheet \|/,
  )
  assert.match(
    reference,
    /\| \[`SheetProps`\]\(\.\.\/sheet.d.ts\) \| Props for `Sheet`\. \|  \|  \|/,
  )
  assert.doesNotMatch(reference, /Defines the|Compile-time contract only/)
  assert.doesNotMatch(reference, /old presentation comparison|Mapped concepts|Native equivalent/)
})

test('summaries come from the JSDoc nearest each declaration, including const exports', async () => {
  await mkdir(scratch, { recursive: true })
  const root = await mkdtemp(resolve(scratch, 'reference-docs-'))
  try {
    await mkdir(resolve(root, 'dist'))
    await writeFile(
      resolve(root, 'package.json'),
      JSON.stringify({ name: '@satinhq/kit', exports: { '.': { types: './dist/index.d.ts' } } }),
    )
    await writeFile(
      resolve(root, 'dist/index.d.ts'),
      [
        '/** A file note, not an export description. */',
        '',
        '/** Opens a sheet. */',
        'export declare function Sheet(): unknown;',
        '/** Draws a button. */',
        'export declare const Button: () => unknown;',
        'export declare const Bare: unknown;',
      ].join('\n'),
    )
    const { inventory } = await referenceInventory(root)
    const summary = name => inventory.find(entry => entry.name === name)?.summary
    assert.equal(summary('Sheet'), 'Opens a sheet.')
    assert.equal(summary('Button'), 'Draws a button.')
    assert.equal(summary('Bare'), undefined)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
