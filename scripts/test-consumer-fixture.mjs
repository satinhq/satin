import assert from 'node:assert/strict'
import { execFile, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { promisify } from 'node:util'
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  realpath,
  writeFile,
} from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { assertPublicDoc, checkShippedDocs } from '../packages/create-satin/scripts/agent-docs.mjs'

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const evidence = resolve(
  workspace,
  process.env.SATIN_CONSUMER_EVIDENCE ?? 'fixtures/consumer/.artifacts/evidence',
)
const artifacts = resolve(workspace, 'fixtures/consumer/.artifacts')
const expectedFramework = JSON.parse(
  await readFile(resolve(workspace, 'packages/kit/package.json'), 'utf8'),
)
const scratch = process.env.SATIN_SCRATCH_ROOT
if (!scratch) throw new Error('Set SATIN_SCRATCH_ROOT to a directory outside the workspace.')
await mkdir(scratch, { recursive: true })
const scratchReal = await realpath(scratch)
const relativeScratch = relative(await realpath(workspace), scratchReal)
if (!relativeScratch.startsWith('..') && !isAbsolute(relativeScratch))
  throw new Error('Consumer proof must run outside the workspace.')
await mkdir(artifacts, { recursive: true })
await mkdir(evidence, { recursive: true })
const runRoot = await mkdtemp(resolve(scratchReal, 'consumer-'))
let transcript = ''
// A consumer runs npm directly, not inside pnpm. pnpm exports its own npm_config_* settings to the
// scripts it runs, and newer npm warns about the ones it doesn't know, so the proof drops them.
const consumerEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.toLowerCase().startsWith('npm_config_')),
)
function run(command, args, cwd, options = {}) {
  const line = `> ${command} ${args.join(' ')}\n`
  console.log(line)
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    ...options,
    env: options.env ?? consumerEnvironment,
  })
  transcript += line + (result.stdout ?? '') + (result.stderr ?? '')
  if (!args.includes('--json')) process.stdout.write(result.stdout ?? '')
  process.stderr.write(result.stderr ?? '')
  if (options.rejectWarnings) {
    assert.equal(result.stderr, '', 'Generated app build must have no stderr warnings')
    assert.doesNotMatch(result.stdout, /\(!\)|\bWARN\b|\b[1-9]\d* warnings\b/)
  }
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} exited ${result.status}`)
  return result.stdout
}

async function verifyPackage(app, rejectWarnings = true) {
  const installed = resolve(app, 'node_modules/@satinhq/kit')
  for (const path of [
    'dist/index.js',
    'dist/index.d.ts',
    'dist/styles.css',
    'dist/styles.css.d.ts',
    'dist/sw/vite.js',
    'dist/sw/vite.d.ts',
    'dist/server.js',
    'dist/server.d.ts',
    'LICENSE',
    'THIRD_PARTY_NOTICES.md',
  ])
    await access(resolve(installed, path))
  assert.ok(
    (await realpath(installed)).startsWith(runRoot),
    'Must resolve the installed tarball, not workspace source',
  )
  const pkg = JSON.parse(await readFile(resolve(installed, 'package.json'), 'utf8'))
  assertPublicDoc(await readFile(resolve(installed, 'README.md'), 'utf8'), 'installed satin README')
  assert.equal(pkg.version, expectedFramework.version)
  assert.equal(pkg.private, undefined)
  assert.deepEqual(Object.keys(pkg.exports).sort(), [
    '.',
    './diagnostics',
    './install',
    './internal',
    './internal/vite',
    './server',
    './styles.css',
    './testing',
    './unstable',
    './vite',
  ])
  // The tarball is the authority, including links and executable documentation.
  const guideDirectory = resolve(installed, 'dist/docs')
  const guides = [
    'README.md',
    ...(await readdir(guideDirectory))
      .filter(name => name.endsWith('.md'))
      .map(name => `dist/docs/${name}`),
  ]
  for (const guide of guides) {
    const markdown = await readFile(resolve(installed, guide), 'utf8')
    for (const [, target] of markdown.matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(target)) continue
      const destination = resolve(dirname(resolve(installed, guide)), target.split('#')[0])
      assert.ok(
        !relative(installed, destination).startsWith('..'),
        `Packaged link escapes package: ${guide} -> ${target}`,
      )
      await access(destination)
    }
  }
  const reference = await readFile(resolve(guideDirectory, 'reference.md'), 'utf8')
  assert.match(reference, /Behavior review inventory/)
  const snippets = [...reference.matchAll(/^```tsx\s*\n([\s\S]*?)^```/gm)]
  assert.ok(snippets.length > 0, 'native reference must ship a compiled public API example')
  for (const [index, snippet] of snippets.entries()) {
    await writeFile(resolve(app, `src/satin-reference-${index}.tsx`), snippet[1])
  }
  run('npm', ['run', 'typecheck'], app)
  for (const [index] of snippets.entries())
    await rm(resolve(app, `src/satin-reference-${index}.tsx`))
  run('npm', ['run', 'build'], app, { rejectWarnings })
  const output = resolve(app, 'dist')
  const cssFiles = (await readdir(output, { recursive: true })).filter(file =>
    file.endsWith('.css'),
  )
  const css = (
    await Promise.all(cssFiles.map(file => readFile(resolve(output, file), 'utf8')))
  ).join('\n')
  assert.equal(
    [...css.matchAll(/@layer\s+satin\s*\{/g)].length,
    1,
    'The packed plugin must emit framework CSS once, including with a legacy import',
  )
}

try {
  const packs = {}
  for (const [name, directory] of [
    ['@satinhq/kit', 'kit'],
    ['@satinhq/lint', 'lint'],
    ['create-satin', 'create-satin'],
  ]) {
    const cwd = resolve(workspace, 'packages', directory)
    // prepack runs normally; record the actual reviewed listing as well.
    const listing = JSON.parse(run('npm', ['pack', '--dry-run', '--json'], cwd))
    await writeFile(
      resolve(evidence, `${name.replaceAll('/', '-')}-pack-dry-run.json`),
      `${JSON.stringify(listing, null, 2)}\n`,
    )
    const packed = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', artifacts], cwd))
    packs[name] = resolve(artifacts, packed[0].filename)
  }
  const runner = resolve(runRoot, 'runner')
  await mkdir(runner)
  await writeFile(resolve(runner, 'package.json'), '{"private":true}\n')
  run('npm', ['install', '--no-audit', '--no-fund', packs['create-satin']], runner)
  const app = resolve(runRoot, 'my-app')
  run(
    'npm',
    [
      'exec',
      '--offline',
      '--',
      'create-satin',
      app,
      '--yes',
      '--name',
      'Satin Beta',
      '--id',
      'satin-beta-08a',
      '--satin-package',
      packs['@satinhq/kit'],
    ],
    runner,
  )
  run(
    process.execPath,
    [
      resolve(workspace, 'packages/lint/scripts/check-fidelity.mjs'),
      resolve(app, 'src'),
      resolve(app, 'index.html'),
    ],
    workspace,
  )
  assert.ok((await checkShippedDocs(app)) >= 4, 'Scaffold must ship all four consumer guides')
  for (const name of ['AGENTS.md', 'IOS-DESIGN.md', 'GETTING-STARTED.md']) {
    assert.ok(
      (await readFile(resolve(app, name), 'utf8')).length > 500,
      `Scaffold must ship ${name}`,
    )
  }
  for (const name of ['AGENTS.md', 'IOS-DESIGN.md']) {
    assert.equal(
      await readFile(resolve(app, name), 'utf8'),
      await readFile(resolve(workspace, 'templates/basic', name), 'utf8'),
      `${name} must match the reviewed template`,
    )
  }
  assert.ok(
    (await readFile(resolve(app, 'GETTING-STARTED.md'), 'utf8')).includes(
      '<!-- public-api:start -->',
    ),
  )
  const consumerPackagePath = resolve(app, 'package.json')
  const consumerPackage = JSON.parse(await readFile(consumerPackagePath, 'utf8'))
  consumerPackage.devDependencies['@satinhq/lint'] = packs['@satinhq/lint']
  await writeFile(consumerPackagePath, JSON.stringify(consumerPackage, null, 2) + '\n')
  run('npm', ['install', '--no-audit', '--no-fund'], app)
  const compiler = JSON.parse(
    await readFile(resolve(app, 'node_modules/typescript/package.json'), 'utf8'),
  )
  assert.match(compiler.version, /^7\./, 'Generated apps must use the TypeScript 7 compiler')
  console.log(`Consumer compiler: TypeScript ${compiler.version}`)
  await verifyPackage(app)
  await access(resolve(app, 'dist/sw.js'))
  const precacheName = (await readdir(resolve(app, 'dist'))).find(name =>
    name.startsWith('precache-manifest.'),
  )
  assert.ok(precacheName, 'Vite plugin must emit the generated precache manifest')
  const precache = JSON.parse(await readFile(resolve(app, 'dist', precacheName), 'utf8'))
  const noticeAssets = ['NOTICE.txt', 'licenses.json', 'acknowledgements.js']
  for (const asset of noticeAssets) {
    assert.ok(
      precache.entries.some(entry => entry.url.endsWith('/' + asset)),
      `${asset} must work offline`,
    )
  }
  const licenses = JSON.parse(await readFile(resolve(app, 'dist/app/licenses.json'), 'utf8'))
  for (const name of ['Satin', 'Framework7 Icons', 'react', 'react-dom']) {
    assert.ok(
      licenses.some(notice => notice.name === name && notice.text.length > 100),
      `${name} needs its complete notice`,
    )
  }
  await writeFile(
    resolve(evidence, 'template-licenses.json'),
    JSON.stringify(licenses, null, 2) + '\n',
  )

  await writeFile(
    resolve(evidence, 'template-precache.json'),
    `${JSON.stringify(precache, null, 2)}\n`,
  )

  // Build the same packed scaffold under a real deployment prefix.
  const subpathApp = resolve(runRoot, 'subpath-app')
  await cp(app, subpathApp, {
    recursive: true,
    filter: path => !/(?:^|[/\\])(?:node_modules|dist)(?:[/\\]|$)/u.test(path),
  })
  const configPath = resolve(subpathApp, 'vite.config.ts')
  await writeFile(
    configPath,
    (await readFile(configPath, 'utf8')).replace('defineConfig({', "defineConfig({ base: '/ios/',"),
  )
  run('npm', ['install', '--no-audit', '--no-fund'], subpathApp)
  await verifyPackage(subpathApp)
  const subpathDist = resolve(subpathApp, 'dist')
  const subpathManifestName = (await readdir(subpathDist)).find(name =>
    name.startsWith('precache-manifest.'),
  )
  const subpathPrecache = JSON.parse(
    await readFile(resolve(subpathDist, subpathManifestName), 'utf8'),
  )
  assert.equal(subpathPrecache.shellUrl, '/ios/')
  for (const entry of subpathPrecache.entries) {
    assert.ok(entry.url.startsWith('/ios/'), entry.url)
    const file = entry.url === '/ios/' ? 'index.html' : entry.url.slice('/ios/'.length)
    assert.equal((await readFile(resolve(subpathDist, file))).length, entry.bytes, entry.url)
  }
  const subpathHtml = await readFile(resolve(subpathDist, 'index.html'), 'utf8')
  const builtDefinition = JSON.parse(subpathHtml.match(/const fixtures = (\[[^\n]+\]);/)[1])[0].app
  assert.equal(
    builtDefinition.updateProfile,
    'release',
    'The scaffold must remain release by default',
  )
  assert.equal(
    builtDefinition.installRoute,
    '/ios/install',
    'Build and runtime must share the base-derived install URL',
  )
  assert.ok(
    subpathHtml.includes('satin-document-head'),
    'The deployment root must remain the app shell',
  )
  for (const file of ['install/index.html', 'unsupported.html']) {
    const html = await readFile(resolve(subpathDist, file), 'utf8')
    const manifestUrl = html.match(/rel="manifest" href="([^"]+)"/)[1]
    assert.ok(manifestUrl.startsWith('/ios/'))
    const manifest = JSON.parse(await readFile(resolve(subpathDist, manifestUrl.slice(5)), 'utf8'))
    assert.equal(manifest.scope, '/ios/')
    assert.equal(manifest.start_url, '/ios/')
    for (const icon of manifest.icons) await access(resolve(subpathDist, icon.src.slice(5)))
  }
  // Exercise the published checker against a server mounting dist at /ios/.
  const { serveStaticFile } = await import(
    pathToFileURL(resolve(subpathApp, 'node_modules/@satinhq/kit/dist/server.js')).href
  )
  const deploymentServer = createServer((request, response) => {
    if (!request.url?.startsWith('/ios/')) {
      response.writeHead(404).end('Outside deployment base')
      return
    }
    request.url = request.url?.replace(/^\/ios(?=\/|$)/, '') || '/'
    serveStaticFile(request, response, subpathDist, 'index.html').catch(error => {
      response.writeHead(500).end(String(error))
    })
  })
  await new Promise(resolveListening => deploymentServer.listen(0, '127.0.0.1', resolveListening))
  try {
    const address = deploymentServer.address()
    const result = await promisify(execFile)(
      process.execPath,
      [
        resolve(subpathApp, 'node_modules/@satinhq/kit/bin/satin.mjs'),
        'check',
        `http://127.0.0.1:${address.port}/ios/`,
      ],
      { timeout: 60000 },
    )
    assert.equal(result.stderr, '')
    console.log(result.stdout)
    await writeFile(resolve(evidence, 'subpath-check.txt'), result.stdout)
  } finally {
    await new Promise(resolveClosed => deploymentServer.close(resolveClosed))
  }
  await access(resolve(subpathDist, 'sw.js'))
  await writeFile(
    resolve(evidence, 'subpath-precache.json'),
    JSON.stringify(subpathPrecache, null, 2) + '\n',
  )

  // One declaration is sufficient for a built preview. No legacy env flag.
  const previewSourcePath = resolve(subpathApp, 'src/app.ts')
  const previewSource = await readFile(previewSourcePath, 'utf8')
  assert.ok(previewSource.includes('export const app = {'), 'Scaffold definition shape changed')
  await writeFile(
    previewSourcePath,
    previewSource.replace(
      'export const app = {',
      "export const app = {\n  advanced: { updateProfile: 'preview' },",
    ),
  )
  const previewEnvironment = { ...consumerEnvironment }
  delete previewEnvironment.SATIN_ENABLE_HOT_RELOAD
  run('npm', ['run', 'build'], subpathApp, { env: previewEnvironment })
  const previewHtml = await readFile(resolve(subpathDist, 'index.html'), 'utf8')
  const previewDefinition = JSON.parse(previewHtml.match(/const fixtures = (\[[^\n]+\]);/)[1])[0]
    .app
  assert.equal(previewDefinition.updateProfile, 'preview')
  assert.equal(previewDefinition.platforms, 'ios')
  assert.deepEqual(previewDefinition.appearance, builtDefinition.appearance)
  assert.equal(previewDefinition.viewportFit, builtDefinition.viewportFit)
  await writeFile(
    resolve(evidence, 'preview-profile.json'),
    JSON.stringify(
      {
        profile: previewDefinition.updateProfile,
        platforms: previewDefinition.platforms,
        legacyEnvFlag: false,
        releaseDefault: builtDefinition.updateProfile,
        geometryAndAppearanceUnchanged: true,
      },
      null,
      2,
    ) + '\n',
  )

  // Retain the broad existing API fixture, now with real registry dependencies.
  const fixture = resolve(runRoot, 'api-fixture')
  await cp(resolve(workspace, 'fixtures/consumer'), fixture, {
    recursive: true,
    filter: path =>
      !/(?:^|[/\\])(?:node_modules|dist|\.artifacts|\.pnpm-store)(?:[/\\]|$)/u.test(path),
  })
  const fixturePkg = JSON.parse(await readFile(resolve(fixture, 'package.json'), 'utf8'))
  fixturePkg.dependencies['@satinhq/kit'] = packs['@satinhq/kit']
  await writeFile(resolve(fixture, 'package.json'), `${JSON.stringify(fixturePkg, null, 2)}\n`)
  run('npm', ['install', '--no-audit', '--no-fund'], fixture)
  await verifyPackage(fixture, false)
  await writeFile(
    resolve(evidence, 'consumer-result.json'),
    `${JSON.stringify({ app, subpathApp, fixture, runner, packs, precacheName, node: process.version, verifiedAt: new Date().toISOString() }, null, 2)}\n`,
  )
  console.log(`Consumer proof passed. Production template retained at ${app}`)
} finally {
  await writeFile(resolve(evidence, 'consumer-output.txt'), transcript)
}
