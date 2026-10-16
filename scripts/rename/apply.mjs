// Apply the public identity without tying source directories to npm coordinates.
import { isUtf8 } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const statePath = new URL('./applied.json', import.meta.url)
const config = JSON.parse(readFileSync(new URL('./names.json', import.meta.url), 'utf8'))
const previous = JSON.parse(readFileSync(statePath, 'utf8'))
const packages = config.profiles[config.packageProfile]
if (!packages) throw new Error(`Unknown package profile: ${config.packageProfile}`)
if (!/^[A-Za-z0-9][A-Za-z0-9 .-]*$/.test(config.brand)) throw new Error('Invalid brand')
if (!/^[a-z0-9.-]+$/.test(config.domain)) throw new Error('Invalid domain')
for (const name of [...Object.values(packages), config.createPackage]) {
  if (!/^(?:@[a-z0-9-]+\/)?[a-z0-9][a-z0-9._-]*$/.test(name))
    throw new Error(`Invalid package name: ${name}`)
}

if (!/^[A-Z][A-Za-z0-9]*$/.test(config.identifierPrefix))
  throw new Error('Invalid identifierPrefix')
if (!/^[a-z][a-z0-9]*$/.test(config.slug)) throw new Error('Invalid slug')
const current = {
  brand: config.brand,
  identifierPrefix: config.identifierPrefix,
  slug: config.slug,
  domain: config.domain,
  repository: config.repository,
  createPackage: config.createPackage,
  workspaceScope: config.workspaceScope,
  packages,
}
const replacements = new Map()
for (const key of [
  'brand',
  'identifierPrefix',
  'slug',
  'domain',
  'repository',
  'createPackage',
  'workspaceScope',
]) {
  replacements.set(previous[key], current[key])
}
replacements.set(previous.slug.toUpperCase(), current.slug.toUpperCase())
replacements.set(
  previous.repository.replace('https://github.com/', ''),
  current.repository.replace('https://github.com/', ''),
)
for (const profile of [previous.packages, ...Object.values(config.profiles)]) {
  for (const key of Object.keys(packages)) replacements.set(profile[key], packages[key])
}
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const pattern = new RegExp(
  [...replacements.keys()]
    .sort((a, b) => b.length - a.length)
    .map(escape)
    .join('|'),
  'g',
)
const rewrite = text =>
  text.replace(pattern, (match, offset) => {
    if (
      match === previous.identifierPrefix &&
      /[A-Za-z0-9]/.test(text[offset + match.length] ?? '')
    ) {
      return current.identifierPrefix
    }
    if (match === previous.brand) return current.brand
    return replacements.get(match)
  })
const excluded = file =>
  file.startsWith('scripts/rename/') ||
  file.startsWith('reference/') ||
  file.startsWith('apps/docs/public/previews/') ||
  file.includes('/comparisons/') ||
  /(?:^|\/)(?:HANDOFF|REPORT)\.md$/.test(file)
const extensions = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.yaml',
  '.yml',
  '.html',
  '.css',
  '.sh',
  '.txt',
  '.patch',
  '',
])
const files = new Set(
  execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], {
    cwd: root,
    maxBuffer: 32 * 1024 * 1024,
  })
    .toString()
    .split('\0')
    .filter(file => file && !excluded(file))
    .map(file => resolve(root, file)),
)
// Extra paths let maintainers update staged app patches and launch copy in the same run.
function addExtra(path) {
  if (!existsSync(path)) throw new Error(`Missing extra path: ${path}`)
  const entries = readdirSync(path, { withFileTypes: true })
  for (const entry of entries) {
    const child = join(path, entry.name)
    if (entry.isDirectory()) addExtra(child)
    else if (entry.isFile()) files.add(child)
  }
}
for (let index = 2; index < process.argv.length; index += 2) {
  const flag = process.argv[index]
  const path = process.argv[index + 1]
  if (!path) throw new Error(`${flag} needs a path`)
  if (flag === '--extra-file') files.add(resolve(path))
  else if (flag === '--extra-directory') addExtra(resolve(path))
  else throw new Error(`Unknown option: ${flag}`)
}
let changed = 0
for (const file of files) {
  if (!extensions.has(extname(file))) continue
  let original
  try {
    if (!lstatSync(file).isFile()) continue
    original = readFileSync(file)
  } catch {
    continue
  }
  if (original.includes(0) || !isUtf8(original)) continue
  const before = original.toString('utf8')
  const after = rewrite(before)
  if (after !== before) {
    writeFileSync(file, after)
    changed++
  }
}
// Public skill directories and branded source basenames follow the same prefix.
// Package source directory names are intentionally stable.
function renameChildren(directory, renameDirectories = false) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) renameChildren(path, renameDirectories)
    if (!entry.isFile() && !(renameDirectories && entry.isDirectory())) continue
    const name = rewrite(entry.name)
    if (name === entry.name) continue
    const target = join(directory, name)
    if (existsSync(target)) throw new Error(`Rename would overwrite ${target}`)
    renameSync(path, target)
  }
}
for (const directory of [
  'packages/pwakit/src',
  'packages/pwakit/api',
  'packages/pwakit/bin',
  'packages/create-pwakit/bin',
]) {
  renameChildren(resolve(root, directory))
}
renameChildren(resolve(root, 'skills'), true)
for (const [directory, name] of [
  ['pwakit', packages.kit],
  ['pwakit-lint', packages.lint],
  ['pwakit-push', packages.push],
  ['create-pwakit', config.createPackage],
]) {
  const path = resolve(root, 'packages', directory, 'package.json')
  const manifest = JSON.parse(readFileSync(path, 'utf8'))
  manifest.name = name
  manifest.version = config.version
  manifest.publishConfig = { ...manifest.publishConfig, access: 'public', tag: config.distTag }
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`)
}
const templatePath = resolve(root, 'templates/basic/package.json')
const template = JSON.parse(readFileSync(templatePath, 'utf8'))
template.dependencies[packages.kit] = config.version
writeFileSync(templatePath, `${JSON.stringify(template, null, 2)}\n`)
writeFileSync(statePath, `${JSON.stringify(current, null, 2)}\n`)
console.log(`Applied ${current.brand} (${config.packageProfile}) to ${changed} files.`)
