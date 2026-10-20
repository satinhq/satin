import { execFile } from 'node:child_process'
import { lstat, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

const execute = promisify(execFile)
const exactVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u
const dependencyFields = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
]

// Read package contents without installing dependencies or running package scripts.
export async function publishedTemplate(version) {
  if (!exactVersion.test(version))
    throw new Error('The current Satin version must be an exact version.')
  const temporary = await mkdtemp(join(tmpdir(), 'satin-upgrade-'))
  try {
    const { stdout } = await execute(
      'npm',
      [
        'pack',
        `create-satin@${version}`,
        '--ignore-scripts',
        '--json',
        '--pack-destination',
        temporary,
      ],
      { timeout: 120_000 },
    )
    const [packed] = JSON.parse(stdout)
    const archive = join(temporary, packed.filename)
    const { stdout: listing } = await execute('tar', ['-tzf', archive])
    const paths = listing
      .split('\n')
      .filter(path => path.startsWith('package/template/') && !path.endsWith('/'))
    const files = new Map()
    for (const path of paths) {
      const relative = path.slice('package/template/'.length)
      if (relative.split('/').some(part => part === '..' || part === '.'))
        throw new Error('Invalid template path.')
      const { stdout: bytes } = await execute('tar', ['-xOzf', archive, path], {
        encoding: 'buffer',
        maxBuffer: 8 * 1024 * 1024,
      })
      files.set(relative === '_gitignore' ? '.gitignore' : relative, bytes)
    }
    if (!files.has('AGENTS.md'))
      throw new Error(`create-satin@${version} has no shipped agent template.`)
    return files
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

export async function readTemplate(directory, prefix = '') {
  const files = new Map()
  for (const entry of await readdir(join(directory, prefix), { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      for (const [path, bytes] of await readTemplate(directory, relative)) files.set(path, bytes)
    } else if (entry.isFile()) {
      files.set(
        relative === '_gitignore' ? '.gitignore' : relative,
        await readFile(join(directory, relative)),
      )
    }
  }
  return files
}

function compareVersions(left, right) {
  const parse = version => {
    const [release, ...suffix] = version.split('-')
    return { release: release.split('.').map(Number), prerelease: suffix.join('-').split('.') }
  }
  const a = parse(left)
  const b = parse(right)
  for (let index = 0; index < 3; index++) {
    if (a.release[index] !== b.release[index]) return a.release[index] - b.release[index]
  }
  if (!a.prerelease[0] || !b.prerelease[0])
    return Number(!a.prerelease[0]) - Number(!b.prerelease[0])
  for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index++) {
    const first = a.prerelease[index]
    const second = b.prerelease[index]
    if (first === second) continue
    if (first === undefined || second === undefined) return first === undefined ? -1 : 1
    const numericA = /^\d+$/u.test(first)
    const numericB = /^\d+$/u.test(second)
    if (numericA && numericB) return Number(first) - Number(second)
    if (numericA !== numericB) return numericA ? -1 : 1
    return first < second ? -1 : 1
  }
  return 0
}

export function changelogBetween(markdown, current, target) {
  return markdown
    .split(/(?=^## )/mu)
    .filter(section => {
      const version = section.match(/^## (\S+)/u)?.[1]
      return (
        version &&
        exactVersion.test(version) &&
        compareVersions(version, current) > 0 &&
        compareVersions(version, target) <= 0
      )
    })
    .join('')
    .trim()
}

// Do not follow an app's symlink into another project, even for a byte-identical file.
async function regularAppFile(root, path) {
  let cursor = root
  for (const part of path.split('/')) {
    cursor = join(cursor, part)
    try {
      const stat = await lstat(cursor)
      if (stat.isSymbolicLink()) return false
    } catch (error) {
      if (error.code === 'ENOENT') return false
      throw error
    }
  }
  return (await lstat(cursor)).isFile()
}

export async function upgradeApp({
  directory = process.cwd(),
  dryRun = false,
  packageRoot = resolve(import.meta.dirname, '..'),
  loadCurrentTemplate = publishedTemplate,
  log = console.log,
} = {}) {
  const root = resolve(directory)
  const packagePath = join(root, 'package.json')
  if (!(await regularAppFile(root, 'package.json')))
    throw new Error('Run upgrade in an app with a regular package.json.')
  const original = await readFile(packagePath, 'utf8')
  const app = JSON.parse(original)
  const cli = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
  const target = cli.version
  const kitPin = app.dependencies?.['@satinhq/kit'] ?? app.devDependencies?.['@satinhq/kit']
  if (!kitPin) throw new Error('This directory does not depend on @satinhq/kit.')
  if (!exactVersion.test(kitPin))
    throw new Error('Pin @satinhq/kit to its current exact version before upgrading.')
  const current = kitPin
  if (compareVersions(current, target) > 0)
    throw new Error(
      `Refusing to downgrade ${current} to ${target}. Run create-satin@${current} or newer.`,
    )
  const packageChanges = []
  for (const field of dependencyFields) {
    for (const [name, version] of Object.entries(app[field] ?? {})) {
      if (name.startsWith('@satinhq/') && version !== target) {
        packageChanges.push(`${name}: ${version} -> ${target}`)
        app[field][name] = target
      }
    }
  }
  if (current === target && packageChanges.length === 0) {
    log(`Satin is already current (${target}). No files changed.`)
    return { current, target, refreshed: [], preserved: [], packageChanges }
  }
  const baseline = await loadCurrentTemplate(current)
  const next = await readTemplate(join(packageRoot, 'template'))
  const refreshed = []
  const preserved = []
  const writes = []
  for (const [path, bytes] of next) {
    if (path === 'package.json') continue
    // A new entry point may depend on new files. Guidance/tooling can refresh
    // independently; application source, assets and entry HTML belong to the app.
    const managed =
      !path.includes('/') &&
      (/\.md$/iu.test(path) ||
        ['.oxlintrc.json', '.gitignore', 'tsconfig.json', 'vite.config.ts'].includes(path))
    if (!managed) continue
    if (!(await regularAppFile(root, path)) || !baseline.has(path)) {
      preserved.push(`${path} (missing, linked, or no previous template)`)
      continue
    }
    const existing = await readFile(join(root, path))
    if (!existing.equals(baseline.get(path))) {
      preserved.push(`${path} (modified)`)
    } else if (!existing.equals(bytes)) {
      writes.push([join(root, path), bytes])
      refreshed.push(path)
    }
  }
  const changelog = changelogBetween(
    await readFile(join(packageRoot, 'CHANGELOG.md'), 'utf8'),
    current,
    target,
  )
  // Finish reading and planning before changing any files. Never run an installer implicitly.
  if (!dryRun) {
    for (const [path, bytes] of writes) await writeFile(path, bytes)
    if (packageChanges.length) await writeFile(packagePath, `${JSON.stringify(app, null, 2)}\n`)
  }
  log(`${dryRun ? 'Dry run' : 'Upgrade'}: Satin ${current} -> ${target}`)
  for (const change of packageChanges) log(`${dryRun ? 'Would pin' : 'Pinned'} ${change}`)
  for (const path of refreshed) log(`${dryRun ? 'Would refresh' : 'Refreshed'} ${path}`)
  for (const path of preserved) log(`Preserved ${path}`)
  if (changelog) log(`\n${changelog}`)
  log(
    '\nNext: run your package manager install to update the lockfile, then typecheck, lint and build. Review preserved files against the new starter.',
  )
  return { current, target, refreshed, preserved, packageChanges }
}
