import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, mkdtempSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { availableParallelism, tmpdir } from 'node:os'

const output = resolve(process.env.RELEASE_ARTIFACTS ?? 'release-artifacts')
mkdirSync(output, { recursive: true })
const timings = []
const environment = {
  ...process.env,
  VITEST_MAX_WORKERS: String(Math.min(6, availableParallelism())),
}
function run(stage, command, args, cwd = process.cwd()) {
  const started = performance.now()
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', env: environment })
  timings.push({ stage, seconds: (performance.now() - started) / 1000, exit: result.status })
  writeFileSync(join(output, 'timings.json'), JSON.stringify(timings, null, 2) + '\n')
  assert.equal(
    result.status,
    0,
    `${stage} failed: ${result.error ?? result.signal ?? result.status}`,
  )
}
run('checkout', 'git', ['rev-parse', '--verify', 'HEAD'])
run('metadata', 'node', ['scripts/check-release.mjs'])
run('install', 'pnpm', ['install', '--frozen-lockfile', '--ignore-scripts'])
run('kit-build', 'pnpm', ['--filter', './packages/kit', 'build'])
run('typecheck', 'pnpm', ['-r', 'typecheck'])
run('lint', 'pnpm', ['-r', 'lint'])
run('build', 'pnpm', ['build'])
run('tests', 'pnpm', ['-r', 'test'])
run('consumer', 'pnpm', ['run', 'test:consumer'])
// These three archives are the exact bytes installed by the consumer proof.
const packages = []
for (const directory of ['kit', 'lint', 'create-satin', 'push']) {
  const pkg = JSON.parse(readFileSync(`packages/${directory}/package.json`, 'utf8'))
  const file = `${pkg.name.replace(/^@/, '').replace('/', '-')}-${pkg.version}.tgz`
  if (directory === 'push') {
    run(
      'push-pack',
      'env',
      ['npm_config_ignore_scripts=true', 'pnpm', 'pack', '--pack-destination', output],
      'packages/push',
    )
    const consumer = mkdtempSync(join(tmpdir(), 'satin-push-consumer-'))
    writeFileSync(join(consumer, 'package.json'), '{"private":true,"type":"module"}\n')
    run(
      'push-install',
      'npm',
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        join(output, packages.find(pkg => pkg.name === '@satinhq/kit').file),
        join(output, file),
      ],
      consumer,
    )
    run(
      'push-imports',
      'node',
      [
        '--input-type=module',
        '-e',
        "const push = await import('@satinhq/push'); for (const name of ['generateVAPIDKeys', 'validateSubscription', 'buildPayload']) { if (typeof push[name] !== 'function') throw new Error(name) }",
      ],
      consumer,
    )
  } else {
    copyFileSync(resolve('fixtures/consumer/.artifacts', file), join(output, file))
  }
  const bytes = readFileSync(join(output, file))
  packages.push({
    name: pkg.name,
    version: pkg.version,
    file,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
  })
}
run('source-unchanged', 'git', ['diff', '--exit-code'])
const manifest = { schema: 1, commit: process.env.GITHUB_SHA, packages }
writeFileSync(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
const digest = createHash('sha256')
  .update(readFileSync(join(output, 'manifest.json')))
  .digest('hex')
if (process.env.GITHUB_OUTPUT)
  writeFileSync(process.env.GITHUB_OUTPUT, `manifest-sha256=${digest}\n`, { flag: 'a' })
if (process.env.GITHUB_STEP_SUMMARY) {
  writeFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `Commit: ${manifest.commit}\n\nManifest SHA-256: ${digest}\n\n` +
      packages.map(pkg => `${pkg.name}@${pkg.version}: ${pkg.sha256}\n`).join('\n'),
    { flag: 'a' },
  )
}
