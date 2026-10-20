#!/usr/bin/env node
import { cp, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { parseArgs } from 'node:util'
import { upgradeApp } from './upgrade.mjs'

const help = `Create a Satin app

  npm create satin@latest -- my-app --yes
  pnpm create satin@latest my-app --yes
  npx create-satin@latest upgrade [--dry-run]

Options:
  --name "My App"           Display name, default My Satin App
  --id my-app               Stable app identity, default <directory name>
  --background '#f2f2f7'     Light launch and app background
  --dark-background '#000000' Dark launch and app background
  --icon <file.png>         App icon, copied into the generated project
  --accent '#007aff'         App tint colour (appearance.tint); omit for the system blue
  --satin-package <spec>    Override dependency, e.g. /absolute/satin.tgz
  --yes                     Use defaults for omitted answers
  --dry-run                 Preview an upgrade without changing app files
  --help                    Show this help

The destination must be absent or empty. No packages are installed automatically.
`
const hex = /^#[\da-f]{6}$/iu
const jsString = value => JSON.stringify(value).replaceAll('<', '\\u003c')

function packageNameForDirectory(directory) {
  return (
    basename(resolve(directory))
      .toLowerCase()
      .replace(/[^a-z0-9-]+/gu, '-')
      .replace(/^-+|-+$/gu, '') || 'my-app'
  )
}

function appIdForDirectory(directory) {
  const name = packageNameForDirectory(directory)
  return /^[a-z]/u.test(name) ? name : `app-${name}`
}

function replaceRequired(source, search, replacement, flag, expectedMatches = 1) {
  const matches =
    typeof search === 'string' ? source.split(search).length - 1 : source.match(search) ? 1 : 0
  if (matches !== expectedMatches) {
    throw new Error(
      `Cannot apply --${flag}: bundled src/app.ts expected ${expectedMatches} match(es) for ${search}, found ${matches}.`,
    )
  }
  return typeof search === 'string'
    ? source.replaceAll(search, replacement)
    : source.replace(search, replacement)
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      name: { type: 'string' },
      id: { type: 'string' },
      background: { type: 'string', default: '#f2f2f7' },
      'dark-background': { type: 'string', default: '#000000' },
      icon: { type: 'string' },
      accent: { type: 'string' },
      'satin-package': { type: 'string' },
      yes: { type: 'boolean', short: 'y' },
      help: { type: 'boolean', short: 'h' },
      'dry-run': { type: 'boolean' },
    },
  })
  if (values.help) {
    console.log(help)
    return
  }
  if (positionals[0] === 'upgrade') {
    if (positionals.length !== 1)
      throw new Error('Run upgrade in the app directory, with no destination.')
    await upgradeApp({ dryRun: values['dry-run'] })
    return
  }
  if (values['dry-run']) throw new Error('--dry-run is available with upgrade.')
  if (positionals.length > 1) throw new Error('Provide one destination directory.')
  let destination = positionals[0]
  let name = values.name
  let id = values.id
  if (!values.yes && process.stdin.isTTY && process.stdout.isTTY) {
    const prompt = createInterface({ input: process.stdin, output: process.stdout })
    try {
      destination ??= (await prompt.question('Directory [my-app]: ')) || 'my-app'
      name ??= (await prompt.question('App name [My Satin App]: ')) || 'My Satin App'
      id ??= (await prompt.question(`App ID [${appIdForDirectory(destination)}]: `)) || undefined
    } finally {
      prompt.close()
    }
  }
  destination ??= 'my-app'
  const target = resolve(destination)
  const packageName = packageNameForDirectory(target)
  name ??= 'My Satin App'
  id ??= appIdForDirectory(destination)
  if (packageName.length > 214) {
    throw new Error('Package name derived from the directory must be at most 214 characters.')
  }
  if (
    !name.trim() ||
    name !== name.trim() ||
    name.length > 80 ||
    [...name].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  ) {
    throw new Error('App name must be 1–80 characters, without padding or control characters.')
  }
  if (!/^[a-z][a-z0-9-]*$/u.test(id))
    throw new Error('App ID must be a lowercase slug such as my-app.')
  for (const key of ['background', 'dark-background', 'accent']) {
    // Without --accent the app keeps the system blue, which differs between light and dark.
    if (key === 'accent' && values.accent === undefined) continue
    if (!hex.test(values[key])) throw new Error(`--${key} must be a six-digit hex colour.`)
  }
  let suppliedIcon
  if (values.icon) {
    const bytes = await readFile(resolve(values.icon))
    if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a')
      throw new Error('--icon must be a PNG file.')
    suppliedIcon = { bytes, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
    if (!suppliedIcon.width || suppliedIcon.width !== suppliedIcon.height)
      throw new Error('--icon must be square.')
  }
  if (values['satin-package'] !== undefined && !values['satin-package'].trim())
    throw new Error('--satin-package cannot be empty.')
  try {
    if ((await readdir(target)).length)
      throw new Error('Destination is not empty; no files were changed.')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  const template = resolve(import.meta.dirname, '../template')
  const read = path => readFile(resolve(template, path), 'utf8')
  const write = (path, text) => writeFile(resolve(target, path), text)
  const pkg = JSON.parse(await read('package.json'))
  pkg.name = packageName
  if (values['satin-package']) {
    if (!pkg.dependencies?.['@satinhq/kit']) {
      throw new Error('Cannot apply --satin-package: bundled package.json has no satin dependency.')
    }
    pkg.dependencies['@satinhq/kit'] = values['satin-package']
  }
  // Identity and both appearances have one definition. Encode literals safely.
  let definition = await read('src/app.ts')
  const replacements = [
    ["id: 'my-satin-app'", `id: ${jsString(id)}`, 'id', 1],
    ["'My Satin App'", jsString(name), 'name', 2],
    ["background: '#f2f2f7'", `background: ${jsString(values.background)}`, 'background', 1],
    [
      "background: '#000000'",
      `background: ${jsString(values['dark-background'])}`,
      'dark-background',
      1,
    ],
  ]
  if (values.accent !== undefined) {
    replacements.push([
      'appearance: {',
      `appearance: {\n    tint: ${jsString(values.accent)},`,
      'accent',
      1,
    ])
  }
  for (const [search, , flag, count] of replacements) {
    replaceRequired(definition, search, search, flag, count)
  }
  // Substitute in one pass so user text cannot become another template match.
  const replacementByToken = new Map(
    replacements.map(([search, replacement]) => [search, replacement]),
  )
  const tokenPattern = replacements
    .map(([search]) => search.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'))
    .join('|')
  definition = definition.replace(new RegExp(tokenPattern, 'gu'), token =>
    replacementByToken.get(token),
  )
  // Check every substitution before creating any destination files.
  await mkdir(target, { recursive: true })
  for (const entry of await readdir(template)) {
    await cp(resolve(template, entry), resolve(target, entry), {
      recursive: true,
      force: false,
      errorOnExist: true,
    })
  }
  await rename(resolve(target, '_gitignore'), resolve(target, '.gitignore'))
  await write('package.json', `${JSON.stringify(pkg, null, 2)}\n`)
  if (suppliedIcon) {
    await writeFile(resolve(target, 'public/icon-source.png'), suppliedIcon.bytes)
  }
  await write('src/app.ts', definition)
  console.log(
    `Created ${name} in ${target}.\n\nNext, in that directory:\n  npm install\n  npm run dev\n\nOpen the printed address at /app/ in iPhone or iPad Safari, or iOS Simulator Safari.\nFor a physical device, use a reachable trusted HTTPS address. See README.md for installed builds.`,
  )
}

main().catch(error => {
  console.error(`create-satin: ${error.message}`)
  process.exitCode = 1
})
