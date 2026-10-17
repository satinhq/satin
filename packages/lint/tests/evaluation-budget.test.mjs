import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const checker = fileURLToPath(new URL('../scripts/check-fidelity.mjs', import.meta.url))

test('audit 12: combinatorial evaluation stops with an explicit incomplete-analysis error', async () => {
  const root = await mkdtemp(join(tmpdir(), 'satin-budget-'))
  try {
    const path = join(root, 'entry.tsx')
    const substitution = '${flag ? "a" : "b"}'
    for (const value of [
      '`' + substitution.repeat(24) + '`',
      Array.from({ length: 24 }, () => '(flag ? "a" : "b")').join(' + '),
    ]) {
      await writeFile(path, '<div style={{ height: ' + value + ' }} />')
      const result = spawnSync(process.execPath, [checker, path], {
        encoding: 'utf8',
        timeout: 5000,
        maxBuffer: 128 * 1024,
      })
      assert.equal(result.error, undefined, result.error?.message)
      assert.equal(result.status, 2, result.stderr)
      assert.match(result.stderr, /static-evaluation-budget-exceeded/)
      assert.match(result.stderr, /analysis incomplete/)
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('audit 12: conditional alias resolution shares the evaluation budget', async () => {
  const root = await mkdtemp(join(tmpdir(), 'satin-alias-budget-'))
  try {
    const path = join(root, 'entry.tsx')
    const declarations = ['import { GlassEffect } from "@satinhq/kit";', 'const props0 = {};']
    for (let index = 1; index <= 24; index += 1) {
      declarations.push(`const props${index} = flag ? props${index - 1} : props${index - 1};`)
    }
    declarations.push('<GlassEffect {...props24} id="x" />')
    await writeFile(path, declarations.join('\n'))
    const result = spawnSync(process.execPath, [checker, path], {
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 128 * 1024,
    })
    assert.equal(result.error, undefined, result.error?.message)
    assert.equal(result.status, 2, result.stderr)
    assert.match(result.stderr, /static-evaluation-budget-exceeded/)
    assert.match(result.stderr, /analysis incomplete/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
