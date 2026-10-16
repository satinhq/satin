import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const script = new URL('../scripts/check-webgpu-worker.mjs', import.meta.url)

test('audit 8: every render function form requires the first-statement guard', async () => {
  const root = await mkdtemp(join(tmpdir(), 'satin-audit-worker-'))
  try {
    const path = join(root, 'entry.ts')
    for (const wrap of [
      body => `const render = () => { ${body} }`,
      body => `function render() { ${body} }`,
      body => `const render = function() { ${body} }`,
    ]) {
      for (const guarded of [false, true]) {
        const guard = guarded ? 'if (!visible || !submissionAllowed()) return;' : ''
        await writeFile(path, wrap(guard + 'draw()'))
        const result = spawnSync(process.execPath, [fileURLToPath(script), path], {
          encoding: 'utf8',
        })
        if (guarded) assert.equal(result.status, 0, result.stderr)
        else {
          assert.notEqual(result.status, 0)
          assert.match(result.stderr, /reject hidden frames/)
        }
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('review: render overload signatures defer to the implementation guard', async () => {
  const root = await mkdtemp(join(tmpdir(), 'satin-overload-worker-'))
  try {
    const path = join(root, 'entry.ts')
    for (const guarded of [false, true]) {
      const guard = guarded ? 'if (!visible || !submissionAllowed()) return;' : ''
      await writeFile(path, `function render(): void; function render() { ${guard} draw() }`)
      const result = spawnSync(process.execPath, [fileURLToPath(script), path], {
        encoding: 'utf8',
      })
      if (guarded) assert.equal(result.status, 0, result.stderr)
      else {
        assert.equal(result.status, 1, result.stderr)
        assert.match(result.stderr, /reject hidden frames/)
        assert.doesNotMatch(result.stderr, /TypeError/)
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
