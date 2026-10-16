import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { cp, mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import test from 'node:test'

test('packaged CLI runs from a directory with spaces and URL-special characters', async () => {
  const root = await mkdtemp(join(tmpdir(), 'satin CLI #%?-'))
  const packageRoot = new URL('../', import.meta.url)
  try {
    for (const directory of ['bin', 'dist']) {
      await cp(new URL(directory, packageRoot), join(root, directory), { recursive: true })
    }
    await cp(new URL('package.json', packageRoot), join(root, 'package.json'))
    await symlink(
      fileURLToPath(new URL('node_modules', packageRoot)),
      join(root, 'node_modules'),
      'dir',
    )
    await assert.rejects(
      promisify(execFile)(
        process.execPath,
        [join(root, 'bin/satin.mjs'), 'check', 'file:///tmp/'],
        {
          cwd: root,
        },
      ),
      error => {
        assert.equal(error.code, 1)
        assert.match(error.stderr, /FAIL HTTPS is required/)
        assert.doesNotMatch(error.stderr, /ERR_MODULE_NOT_FOUND|SyntaxError/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
