import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const checker = join(packageRoot, 'scripts/check-fidelity.mjs')

function runChecker(argumentsList, cwd = packageRoot) {
  return spawnSync(process.execPath, [checker, ...argumentsList], {
    cwd,
    encoding: 'utf8',
  })
}

test('keeps the no-target CLI usage and exit code', () => {
  const result = runChecker([])
  assert.equal(result.status, 2)
  assert.equal(result.stdout, '')
  assert.equal(result.stderr, 'Usage: check-fidelity <source file or directory> [...]\n')
})

test('stays silent with exit 0 for a clean target', async context => {
  const directory = await mkdtemp(join(tmpdir(), 'satin-lint-clean-'))
  context.after(() => rm(directory, { recursive: true, force: true }))
  await writeFile(join(directory, 'clean.tsx'), '<Pressable onPress={save}>Save</Pressable>\n')

  const result = runChecker([directory])
  assert.equal(result.status, 0)
  assert.equal(result.stdout, '')
  assert.equal(result.stderr, '')
})

test('keeps file:line:column diagnostics, summary, and exit 1', async context => {
  const directory = await mkdtemp(join(tmpdir(), 'satin-lint-violation-'))
  context.after(() => rm(directory, { recursive: true, force: true }))
  const file = join(directory, 'violation.css')
  await writeFile(file, '.screen {\n  height: 100vh;\n}\n')

  const result = runChecker([file])
  assert.equal(result.status, 1)
  assert.equal(result.stdout, '')
  assert.equal(
    result.stderr,
    `${file}:2:11 Raw vh units bypass Satin geometry. Consume a --satin-* geometry token.\n` +
      'Satin fidelity check found 1 violation(s).\n',
  )
})

test('keeps recursive targets and skips dist and node_modules', async context => {
  const directory = await mkdtemp(join(tmpdir(), 'satin-lint-recursive-'))
  context.after(() => rm(directory, { recursive: true, force: true }))
  await mkdir(join(directory, 'src'))
  await mkdir(join(directory, 'dist'))
  await mkdir(join(directory, 'node_modules'))
  await writeFile(join(directory, 'src', 'clean.ts'), "const note = '100vh'\n")
  await writeFile(join(directory, 'dist', 'ignored.tsx'), '<button />\n')
  await writeFile(join(directory, 'node_modules', 'ignored.css'), '.x { height: 100vh; }\n')

  const result = runChecker([directory])
  assert.equal(result.status, 0)
  assert.equal(result.stderr, '')
})
