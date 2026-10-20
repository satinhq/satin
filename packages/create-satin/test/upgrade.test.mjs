import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { changelogBetween, upgradeApp } from '../bin/upgrade.mjs'

const scratch = process.env.SATIN_SCRATCH_ROOT
if (!scratch) throw new Error('Set SATIN_SCRATCH_ROOT for upgrade tests.')

async function fixture(run) {
  const directory = await mkdtemp(join(scratch, 'upgrade-test-'))
  const app = join(directory, 'app')
  const cli = join(directory, 'cli')
  const files = [
    'AGENTS.md',
    'GETTING-STARTED.md',
    'IOS-DESIGN.md',
    '.oxlintrc.json',
    'README.md',
    'vite.config.ts',
  ]
  const baseline = new Map(files.map(path => [path, Buffer.from(`old ${path}\n`)]))
  try {
    await mkdir(app)
    await mkdir(join(cli, 'template'), { recursive: true })
    await writeFile(join(cli, 'package.json'), JSON.stringify({ version: '1.2.0-beta.6' }))
    await writeFile(
      join(cli, 'CHANGELOG.md'),
      '# Changelog\n\n## 1.2.0-beta.6\n\nNew search.\n\n## 1.2.0-beta.5\n\nOld.\n',
    )
    await writeFile(
      join(app, 'package.json'),
      JSON.stringify({
        dependencies: {
          '@satinhq/kit': '1.2.0-beta.5',
          '@satinhq/push': '^1.2.0-beta.4',
          react: '^19.0.0',
        },
        devDependencies: { '@satinhq/lint': '1.2.0-beta.5' },
      }),
    )
    await writeFile(join(app, 'pnpm-lock.yaml'), 'existing lock\n')
    for (const path of files) {
      await writeFile(join(app, path), baseline.get(path))
      await writeFile(join(cli, 'template', path), `new ${path}\n`)
    }
    const logs = []
    const options = {
      directory: app,
      packageRoot: cli,
      loadCurrentTemplate: async () => baseline,
      log: text => logs.push(text),
    }
    await run({ app, cli, options, logs, files, baseline })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

test('upgrade pins every scoped dependency and refreshes byte-identical starter files', () =>
  fixture(async ({ app, options, logs, files }) => {
    const result = await upgradeApp(options)
    assert.deepEqual(result.refreshed.sort(), files.sort())
    const pkg = JSON.parse(await readFile(join(app, 'package.json'), 'utf8'))
    assert.equal(pkg.dependencies['@satinhq/kit'], '1.2.0-beta.6')
    assert.equal(pkg.dependencies['@satinhq/push'], '1.2.0-beta.6')
    assert.equal(pkg.devDependencies['@satinhq/lint'], '1.2.0-beta.6')
    assert.equal(pkg.dependencies.react, '^19.0.0')
    assert.equal(await readFile(join(app, 'AGENTS.md'), 'utf8'), 'new AGENTS.md\n')
    assert.equal(await readFile(join(app, 'pnpm-lock.yaml'), 'utf8'), 'existing lock\n')
    assert.ok(logs.some(text => text.includes('New search.') && !text.includes('Old.')))
  }))

test('modified, missing and symlinked files are preserved and reported', () =>
  fixture(async ({ app, options }) => {
    await writeFile(join(app, 'AGENTS.md'), 'My rules\n')
    await rm(join(app, 'IOS-DESIGN.md'))
    await rm(join(app, 'README.md'))
    await symlink(join(app, 'GETTING-STARTED.md'), join(app, 'README.md'))
    const result = await upgradeApp(options)
    assert.equal(result.preserved.length, 3)
    assert.ok(result.preserved.includes('AGENTS.md (modified)'))
    assert.equal(await readFile(join(app, 'AGENTS.md'), 'utf8'), 'My rules\n')
    await assert.rejects(readFile(join(app, 'IOS-DESIGN.md')), { code: 'ENOENT' })
  }))

test('dry run reports the same plan and changes no app files', () =>
  fixture(async ({ app, options, files }) => {
    const before = await Promise.all(
      ['package.json', ...files].map(path => readFile(join(app, path))),
    )
    const result = await upgradeApp({ ...options, dryRun: true })
    assert.equal(result.refreshed.length, files.length)
    const after = await Promise.all(
      ['package.json', ...files].map(path => readFile(join(app, path))),
    )
    assert.deepEqual(after, before)
  }))

test('already-current app is a no-op and does not fetch an old template', () =>
  fixture(async ({ app, options, logs }) => {
    await upgradeApp(options)
    const before = await readFile(join(app, 'package.json'))
    const result = await upgradeApp({
      ...options,
      loadCurrentTemplate: () => {
        throw new Error('Unexpected fetch')
      },
    })
    assert.deepEqual(result.packageChanges, [])
    assert.deepEqual(await readFile(join(app, 'package.json')), before)
    assert.ok(logs.some(text => text.includes('already current')))
  }))

test('baseline failure leaves package and files unchanged', () =>
  fixture(async ({ app, options }) => {
    const before = await readFile(join(app, 'package.json'))
    await assert.rejects(
      upgradeApp({
        ...options,
        loadCurrentTemplate: () => {
          throw new Error('Offline')
        },
      }),
      /Offline/u,
    )
    assert.deepEqual(await readFile(join(app, 'package.json')), before)
    assert.equal(await readFile(join(app, 'AGENTS.md'), 'utf8'), 'old AGENTS.md\n')
  }))

test('changelog version comparison handles prerelease numbers and bounds', () => {
  const markdown = '## 1.2.0-beta.10\nTen\n## 1.2.0-beta.6\nSix\n## 1.2.0-beta.5\nFive\n'
  assert.equal(changelogBetween(markdown, '1.2.0-beta.5', '1.2.0-beta.6'), '## 1.2.0-beta.6\nSix')
})

test('CLI routes upgrade --dry-run to the already-current command without scaffolding', () =>
  fixture(async ({ app }) => {
    const version = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8'),
    ).version
    await writeFile(
      join(app, 'package.json'),
      JSON.stringify({ dependencies: { '@satinhq/kit': version } }),
    )
    const result = spawnSync(
      process.execPath,
      [new URL('../bin/create-satin.mjs', import.meta.url).pathname, 'upgrade', '--dry-run'],
      { cwd: app, encoding: 'utf8' },
    )
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /already current/u)
    assert.equal(await readFile(join(app, 'AGENTS.md'), 'utf8'), 'old AGENTS.md\n')
  }))

test('preserves application entry points when a newer starter introduces companion files', () =>
  fixture(async ({ app, cli, baseline, options }) => {
    const original = Buffer.from("import './app.js'\n")
    baseline.set('src/main.tsx', original)
    await mkdir(join(app, 'src'))
    await mkdir(join(cli, 'template/src'))
    await writeFile(join(app, 'src/main.tsx'), original)
    await writeFile(join(cli, 'template/src/main.tsx'), "import './routes.js'\n")
    await writeFile(join(cli, 'template/src/routes.tsx'), 'export const routes = {}\n')
    const result = await upgradeApp(options)
    assert.deepEqual(await readFile(join(app, 'src/main.tsx')), original)
    assert.ok(!result.refreshed.some(path => path.startsWith('src/')))
    await assert.rejects(readFile(join(app, 'src/routes.tsx')), { code: 'ENOENT' })
  }))
