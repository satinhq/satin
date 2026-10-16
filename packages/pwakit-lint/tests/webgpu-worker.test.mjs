import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
// A file path, not a URL pathname: a checkout under a directory with spaces must work.
const script = fileURLToPath(new URL('../scripts/check-webgpu-worker.mjs', import.meta.url))
test('render rejects hidden frames before GPU work', async () => {
  const guarded = await check(
    'const render = () => { if (!visible || !submissionAllowed()) return; draw() }',
  )
  assert.equal(guarded.status, 0, guarded.stderr)
  for (const source of [
    'const render = () => { if (!visible || appearanceRefreshPending) return; draw() }',
    'const render = () => { draw() }',
    'const render = () => { if (!visible) return; draw() }',
    'const render = () => { draw(); if (!visible) return }',
  ]) {
    const result = await check(source)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /reject hidden frames/)
  }
})
async function check(source) {
  const root = await mkdtemp(join(tmpdir(), 'satin-worker-'))
  try {
    const path = join(root, 'entry.ts')
    await writeFile(path, source)
    return spawnSync(process.execPath, [script, path], { encoding: 'utf8' })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}
test('erases ImportType and named type-only edges', async () => {
  const result = await check(
    "import {type Foo} from './not-runtime.ts';export type Bar=import('./not-runtime.ts').Bar;const x=1",
  )
  assert.equal(result.status, 0, result.stderr)
})
test('follows actual dynamic dependencies and rejects Pixi', async () => {
  const result = await check("void import('pixi.js')")
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Pixi dependency/)
})
test('rejects computed DOM and texture-allocation access', async () => {
  for (const source of ["document['createElement']('canvas')", "device['createTexture']({})"]) {
    const result = await check(source)
    assert.notEqual(result.status, 0)
  }
})

test('init rejects unknown appearance before any canvas work', async () => {
  const guard =
    "if(request.appearance!=='light'&&request.appearance!=='dark')throw Error('appearance');"
  const guarded = await check("switch(request.type){case 'init':" + guard + 'raster.init();break}')
  assert.equal(guarded.status, 0, guarded.stderr)
  for (const before of [
    '',
    'raster.init();',
    "if(!request.appearance)throw Error('appearance');",
  ]) {
    const result = await check(
      "switch(request.type){case 'init':" +
        before +
        (before === 'raster.init();' ? guard : '') +
        'raster.init();break}',
    )
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /reject unknown appearance/)
  }
})

test('glass shape ticks cannot use a free-running timer', async () => {
  for (const timer of ['setTimeout', 'setInterval']) {
    const result = await check(`${timer}(tick, 1000 / 120)`)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /capped page frame clock/)
  }
  const result = await check('clock.request(tick); setTimeout(prewarm, 1000)')
  assert.equal(result.status, 0, result.stderr)
})
