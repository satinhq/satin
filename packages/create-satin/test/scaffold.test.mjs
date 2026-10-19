import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '..')
const scratch = process.env.SATIN_SCRATCH_ROOT
if (!scratch) throw new Error('Set SATIN_SCRATCH_ROOT for scaffold tests.')
const build = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: root, encoding: 'utf8' })
assert.equal(build.status, 0, build.stderr)
assert.equal(build.stdout, '', 'Build must keep stdout clean for npm pack --json')
const cli = (...args) =>
  spawnSync(process.execPath, [resolve(root, 'bin/create-satin.mjs'), ...args], {
    encoding: 'utf8',
  })

test('flags safely encode identity and keep appearance files aligned', async () => {
  const directory = await mkdtemp(resolve(scratch, 'scaffold-test-'))
  const target = resolve(directory, 'my app #%?')
  try {
    const name = 'Read "now" <script> & it\'s yours'
    const result = cli(
      target,
      '--yes',
      '--name',
      name,
      '--id',
      'read-now',
      '--background',
      '#123456',
      '--dark-background',
      '#102030',
      '--accent',
      '#abcdef',
      '--icon',
      resolve(root, '../../templates/basic/public/apple-touch-icon.png'),
    )
    assert.equal(result.status, 0, result.stderr)
    assert.equal(JSON.parse(await readFile(resolve(target, 'package.json'), 'utf8')).name, 'my-app')
    const definition = await readFile(resolve(target, 'src/app.ts'), 'utf8')
    assert.match(definition, /id: "read-now"/u)
    assert.match(definition, /source: '\/icon-source.png'/u)
    assert.match(definition, /#123456/u)
    assert.match(definition, /#102030/u)
    assert.match(definition, /\\u003cscript>/u)
    const html = await readFile(resolve(target, 'index.html'), 'utf8')
    assert.doesNotMatch(html, /manifest|theme-color|matchMedia/u)
    const source = await readFile(resolve(target, 'src/main.tsx'), 'utf8')
    assert.match(source, /runApp\(\{ app, routes, navigation, content: TabView \}\)/u)
    assert.doesNotMatch(source, /registerAppShell|useBackground|@satinhq\/kit\/styles\.css/u)
    assert.match(definition, /tint: "#abcdef"/u)
    assert.equal(
      await readFile(resolve(target, 'src/styles.css'), 'utf8'),
      await readFile(resolve(root, 'template/src/styles.css'), 'utf8'),
    )
    const pkg = JSON.parse(await readFile(resolve(target, 'package.json'), 'utf8'))
    assert.ok(pkg.devDependencies['@satinhq/lint'])
    assert.match(pkg.scripts.lint, /satin-lint src index\.html/u)
    assert.match(pkg.scripts.build, /npm run lint/u)
    assert.match(await readFile(resolve(target, '.oxlintrc.json'), 'utf8'), /@satinhq\/lint/u)
    assert.match(await readFile(resolve(target, 'vite.config.ts'), 'utf8'), /src\/app\.ts'/u)
    assert.match(await readFile(resolve(target, '.gitignore'), 'utf8'), /node_modules/u)
    await writeFile(resolve(target, 'sentinel'), 'keep')
    assert.notEqual(cli(target, '--yes').status, 0)
    assert.equal(await readFile(resolve(target, 'sentinel'), 'utf8'), 'keep')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('without --accent the starter keeps the system blue (no tint is written)', async () => {
  const directory = await mkdtemp(resolve(scratch, 'scaffold-default-'))
  const target = resolve(directory, 'My App #%?')
  try {
    const result = cli(target, '--yes')
    assert.equal(result.status, 0, result.stderr)
    assert.equal(JSON.parse(await readFile(resolve(target, 'package.json'), 'utf8')).name, 'my-app')
    assert.match(await readFile(resolve(target, 'src/app.ts'), 'utf8'), /id: "my-app"/u)
    assert.doesNotMatch(await readFile(resolve(target, 'src/app.ts'), 'utf8'), /tint/u)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('template drift rejects unsubstituted flags before writing a destination', async () => {
  const directory = await mkdtemp(resolve(scratch, 'scaffold-drift-'))
  try {
    const creator = resolve(directory, 'creator')
    await cp(resolve(root, 'bin'), resolve(creator, 'bin'), { recursive: true })
    await cp(resolve(root, 'template'), resolve(creator, 'template'), { recursive: true })
    const definitionPath = resolve(creator, 'template/src/app.ts')
    const original = await readFile(definitionPath, 'utf8')
    for (const [flag, token, value] of [
      ['accent', 'appearance: {', '#abcdef'],
      ['id', "id: 'my-satin-app'", 'custom-id'],
      ['name', "'My Satin App'", 'Custom App'],
      ['background', "background: '#f2f2f7'", '#123456'],
      ['dark-background', "background: '#000000'", '#102030'],
    ]) {
      await writeFile(definitionPath, original.replaceAll(token, 'missing-template-token'))
      const target = resolve(directory, `app-${flag}`)
      const result = spawnSync(
        process.execPath,
        [resolve(creator, 'bin/create-satin.mjs'), target, '--yes', `--${flag}`, value],
        { encoding: 'utf8' },
      )
      assert.notEqual(result.status, 0, flag)
      assert.ok(result.stderr.includes(`Cannot apply --${flag}: bundled src/app.ts`), result.stderr)
      await assert.rejects(readFile(resolve(target, 'package.json')), { code: 'ENOENT' })
    }
    await writeFile(definitionPath, original)
    const packagePath = resolve(creator, 'template/package.json')
    const pkg = JSON.parse(await readFile(packagePath, 'utf8'))
    delete pkg.dependencies['@satinhq/kit']
    await writeFile(packagePath, JSON.stringify(pkg))
    const target = resolve(directory, 'app-package')
    const result = spawnSync(
      process.execPath,
      [resolve(creator, 'bin/create-satin.mjs'), target, '--yes', '--satin-package', '/local.tgz'],
      { encoding: 'utf8' },
    )
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /Cannot apply --satin-package: bundled package.json/u)
    await assert.rejects(readFile(resolve(target, 'package.json')), { code: 'ENOENT' })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('template tokens in user text are encoded without further substitution', async () => {
  const directory = await mkdtemp(resolve(scratch, 'scaffold-tokens-'))
  try {
    const target = resolve(directory, 'my-app')
    const name = "Custom background: '#f2f2f7' tint: '#007aff'"
    const result = cli(
      target,
      '--yes',
      '--name',
      name,
      '--background',
      '#123456',
      '--accent',
      '#abcdef',
    )
    assert.equal(result.status, 0, result.stderr)
    const definition = await readFile(resolve(target, 'src/app.ts'), 'utf8')
    assert.ok(definition.includes(`name: ${JSON.stringify(name)}`))
    assert.match(definition, /background: "#123456"/u)
    assert.match(definition, /tint: "#abcdef"/u)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('invalid arguments fail before writing a destination', async () => {
  const directory = await mkdtemp(resolve(scratch, 'scaffold-invalid-'))
  try {
    for (const flags of [
      ['--background', 'red'],
      ['--id', '//evil.test'],
      ['--unknown'],
      ['--name', ' padded '],
    ]) {
      const target = resolve(directory, 'app')
      assert.notEqual(cli(target, '--yes', ...flags).status, 0)
      await assert.rejects(readFile(resolve(target, 'package.json')), { code: 'ENOENT' })
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
