import { SymbolFlags } from 'typescript/unstable/sync'
import { openDeclarationProject, printDeclaration } from './native-api.mjs'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { publicDeclarationGraph } from './api-graph.mjs'
import {
  apiBehaviors,
  frameworkExtensions,
  unavailableExports,
  unavailableProperties,
} from './api-behaviors.mjs'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cell = value => value.replaceAll('|', '\\|').replaceAll('\n', ' ')
const identity = (module, name) => `${module}:${name}`

async function sourceFingerprint(root) {
  const hash = createHash('sha256')
  const sourceRoot = resolve(root, 'src')
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true }).catch(error => {
      if (error.code === 'ENOENT' && directory === sourceRoot) return []
      throw error
    })
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (/\.(?:ts|tsx|css)$/.test(path) && !/\.test\.tsx?$/.test(path)) {
        hash.update(relative(sourceRoot, path))
        hash.update('\0')
        hash.update(await readFile(path))
        hash.update('\0')
      }
    }
  }
  await visit(sourceRoot)
  return hash.digest('hex')
}

export async function referenceInventory(root = packageRoot) {
  const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
  const inventory = []
  const hashes = []
  for (const [path, config] of Object.entries(pkg.exports)) {
    if (!config.types || path.endsWith('.css')) continue
    const entry = resolve(root, config.types)
    const module = path === '.' ? pkg.name : `${pkg.name}/${path.slice(2)}`
    const project = openDeclarationProject(entry)
    try {
      const { program, checker, emitter } = project
      const file = program.getSourceFile(entry)
      if (!file) throw new Error(`Build before generating the reference: ${entry}`)
      const graph = publicDeclarationGraph(project, entry).replaceAll(`${root}/`, '')
      hashes.push(`${module}:${createHash('sha256').update(graph).digest('hex')}`)
      for (const symbol of checker.getExportsOfModule(checker.getSymbolAtLocation(file))) {
        const target = symbol.flags & SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol
        const declaration = target.declarations?.[0]?.resolve()
        if (!declaration) throw new Error(`Missing declaration for ${module}:${symbol.name}`)
        const value = !!(target.flags & SymbolFlags.Value)
        if (module === '@satinhq/kit' && unavailableProperties[symbol.name]) {
          const properties = checker
            .getPropertiesOfType(checker.getDeclaredTypeOfSymbol(target))
            .map(property => property.name)
          for (const property of unavailableProperties[symbol.name]) {
            if (properties.includes(property))
              throw new Error(
                `Review unavailable concept metadata: ${symbol.name}.${property} now exists`,
              )
          }
        }
        const documentation = printDeclaration(emitter, declaration).match(
          /^\/\*\*([\s\S]*?)\*\//,
        )?.[1]
        const summary = documentation
          ?.split('\n')
          .map(line => line.replace(/^\s*\* ?/, '').trim())
          .join('\n')
          .split(/(?:^|\n)@/)[0]
          .replace(/\s+/g, ' ')
          .trim()
        inventory.push({
          module,
          summary,
          name: symbol.name,
          kind: value ? 'Value' : 'Type',
          declaration: relative(resolve(root, 'dist/docs'), declaration.getSourceFile().fileName),
        })
      }
    } finally {
      project.close()
    }
  }
  inventory.sort((left, right) =>
    identity(left.module, left.name).localeCompare(identity(right.module, right.name)),
  )
  return { inventory, hashes, sourceHash: await sourceFingerprint(root) }
}

export function renderReference(
  { inventory, hashes, sourceHash },
  concepts = [...apiBehaviors, ...frameworkExtensions],
) {
  const names = new Set(inventory.map(entry => identity(entry.module, entry.name)))
  for (const name of unavailableExports) {
    if (names.has(identity('@satinhq/kit', name)))
      throw new Error(`Review unavailable concept metadata: ${name} now exists`)
  }
  const seen = new Set()
  const mappedExports = new Map()
  for (const concept of concepts) {
    if (seen.has(concept.concept)) throw new Error(`Duplicate concept: ${concept.concept}`)
    seen.add(concept.concept)
    if (!concept.behavior || !concept.limitations)
      throw new Error(`Missing behavior or limitation: ${concept.concept}`)
    for (const name of concept.exports) {
      const key = identity('@satinhq/kit', name)
      if (!names.has(key))
        throw new Error(`Concept ${concept.concept} maps unavailable export ${key}`)
      const mappings = mappedExports.get(key) ?? []
      mappings.push(concept.concept)
      mappedExports.set(key, mappings)
    }
  }
  const unreviewed = inventory.filter(
    entry =>
      entry.module === '@satinhq/kit' &&
      entry.kind === 'Value' &&
      !mappedExports.has(identity(entry.module, entry.name)),
  )
  if (unreviewed.length)
    throw new Error(
      `Review new public API behavior and unavailable descriptions: ${unreviewed.map(entry => entry.name).join(', ')}`,
    )
  const missing = inventory.filter(entry => !mappedExports.has(identity(entry.module, entry.name)))
  const searchTerms = {
    NavigationStack: 'navigation stack',
    NavigationSplitView: 'sidebar and detail',
    ScrollView: 'scrolling; pull to refresh',
    List: 'list; rows; pull to refresh',
    Sheet: 'sheet; modal presentation',
    FullScreenCover: 'full screen presentation',
    SafeAreaInset: 'safe area; accessory',
    useTask: 'cancellable task',
    useAppStorage: 'persistent settings',
    useSceneStorage: 'restorable screen state',
    withAnimation: 'animated state update',
    GlassEffect: 'glass; refraction',
  }
  const moduleLimits = {
    '@satinhq/kit/sw':
      'Service worker and build integration only; follow the app build configuration.',
    '@satinhq/kit/vite': 'Vite build integration only; this module does not render a control.',
    '@satinhq/kit/unstable': 'Experimental API; its contract may change between beta releases.',
  }
  const description = entry => {
    const reviews = concepts.filter(
      concept => concept.exports.includes(entry.name) && entry.module === '@satinhq/kit',
    )
    if (reviews.length)
      return {
        behavior: entry.summary ?? [...new Set(reviews.map(review => review.behavior))].join(' '),
        limits: [...new Set(reviews.map(review => review.limitations))].join(' '),
      }
    if (entry.kind === 'Type')
      return {
        behavior:
          entry.summary ??
          (entry.name.endsWith('Props')
            ? `Defines the props accepted by \`${entry.name.slice(0, -5)}\`.`
            : `Defines the \`${entry.name}\` type in \`${entry.module}\`.`),
        limits:
          'Compile-time contract only. The linked declaration lists its fields, unions and constraints.',
      }
    return {
      behavior:
        entry.summary ??
        `Provides \`${entry.name}\` through the \`${entry.module}\` module. Read its linked declaration before use.`,
      limits:
        moduleLimits[entry.module] ??
        'Package integration API. It does not add a separately supported app control.',
    }
  }
  const modules = [...new Set(inventory.map(entry => entry.module))]
  const unavailable = concepts.filter(concept => !concept.exports.length)
  return [
    '# Satin API reference',
    '',
    'Search by Satin export name. Each entry describes its behavior and limits and links to its exact declaration. Plain-language search terms are included where they help find a control or capability.',
    '',
    'Generated from package declarations and reviewed behavior metadata. Run `pnpm --filter @satinhq/kit api:write` after building. Signature, export and source changes invalidate this reference; changes to behavior descriptions require review.',
    '',
    `Coverage: ${inventory.length} named exports across ${hashes.length} declaration entry points. ${mappedExports.size} exports have reviewed behavior metadata. ${missing.length} type and integration declarations are identified separately in the behavior review inventory. CSS is a stylesheet, not a named export.`,
    '',
    'An API description establishes the supported contract. It does not certify pixels, motion, touch or installed-app lifecycle behavior. Experimental entry points remain experimental.',
    '',
    ...modules.flatMap(module => [
      `## ${module === '@satinhq/kit' ? 'Core API' : module.replace('@satinhq/kit/', '').replaceAll('/', ' ') + ' API'}`,
      '',
      `Module: \`${module}\``,
      '',
      '| Satin export | Behavior | Limits | Also known as |',
      '| --- | --- | --- | --- |',
      ...inventory
        .filter(entry => entry.module === module)
        .map(entry => {
          const review = description(entry)
          return `| [\`${entry.name}\`](${entry.declaration}) | ${cell(review.behavior)} | ${cell(review.limits)} | ${searchTerms[entry.name] ?? ''} |`
        }),
      '',
    ]),
    '## Unsupported capabilities',
    '',
    'These capabilities have no public export. The listed alternatives describe supported compositions, not additional props or controls.',
    '',
    '| Capability | Supported alternative | Limits |',
    '| --- | --- | --- |',
    ...unavailable.map(
      concept =>
        `| ${cell(concept.concept)} | ${cell(concept.behavior)} | ${cell(concept.limitations)} |`,
    ),
    '',
    'See [application recipes](app-recipes.md), [local data](data.md), [geometry tokens](tokens.md) and [messaging scroll](messaging-scroll.md) for supported compositions.',
    '',
    '## Entry draft and editor visibility',
    '',
    'Render this component within a retained navigation screen. The draft checkpoints independently; the editor starts closed after relaunch.',
    '',
    '```tsx',
    "import { useState } from 'react'",
    "import { Button, Sheet, TextField, useSceneStorage } from '@satinhq/kit'",
    '',
    'export function DraftEditor() {',
    "  const [draft, setDraft] = useSceneStorage('draft', '')",
    '  const [open, setOpen] = useState(false)',
    '  return (',
    '    <>',
    '      <Button onPress={() => setOpen(true)}>Edit draft</Button>',
    '      <Sheet title="Draft" isPresented={open} onPresentedChange={setOpen}>',
    '        <TextField label="Draft" value={draft} onChange={setDraft} />',
    '      </Sheet>',
    '    </>',
    '  )',
    '}',
    '```',
    '',
    '## Behavior review inventory',
    '',
    'The declarations below have no dedicated reviewed behavior metadata. Type-only declarations are compile-time contracts; integration exports should be used with their module documentation. Adding a stable root value requires a reviewed behavior and limitation before generation can pass.',
    '',
    ...missing.map(entry => `- \`${identity(entry.module, entry.name)}\` (${entry.kind})`),
    '',
    '## Declaration graph fingerprints',
    '',
    ...hashes.map(hash => `- \`${hash}\``),
    '',
    '## Framework source fingerprint',
    '',
    `SHA-256 of sorted TS/TSX/CSS source paths and bytes, excluding tests: ${sourceHash}`,
    '',
  ].join('\n')
}

export async function generateReference(write = false, root = packageRoot) {
  const content = renderReference(await referenceInventory(root))
  const snapshot = resolve(root, 'api/reference.md')
  if (write) {
    await mkdir(dirname(snapshot), { recursive: true })
    await writeFile(snapshot, content)
  } else if ((await readFile(snapshot, 'utf8').catch(() => '')) !== content) {
    throw new Error(
      'Satin API reference is stale. Build and run pnpm --filter @satinhq/kit api:write.',
    )
  }
  await mkdir(resolve(root, 'dist/docs'), { recursive: true })
  await writeFile(resolve(root, 'dist/docs/reference.md'), content)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generateReference(process.argv.includes('--write'))
}
