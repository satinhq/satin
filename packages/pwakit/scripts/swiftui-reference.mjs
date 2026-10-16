import { SymbolFlags } from 'typescript/unstable/sync'
import { openDeclarationProject } from './native-api.mjs'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { publicDeclarationGraph } from './api-graph.mjs'
import {
  swiftuiConcepts,
  frameworkExtensions,
  unavailableExports,
  unavailableProperties,
} from './swiftui-concepts.mjs'

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
      const { program, checker } = project
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
        inventory.push({
          module,
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
  concepts = [...swiftuiConcepts, ...frameworkExtensions],
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
  const mapped = concepts.filter(
    concept => concept.exports.length && concept.nativeEquivalent !== false,
  )
  const extensions = concepts.filter(concept => concept.nativeEquivalent === false)
  const unavailable = concepts.filter(concept => !concept.exports.length)
  const missing = inventory.filter(entry => !mappedExports.has(identity(entry.module, entry.name)))
  const declarationLink = name => {
    const entry = inventory.find(entry => entry.module === '@satinhq/kit' && entry.name === name)
    return `[\`${name}\`](${entry.declaration})`
  }
  return [
    '# Satin API reference',
    '',
    'Generated from public package declarations and reviewed behavior metadata. Run `pnpm --filter @satinhq/kit api:write` after building. The check rejects removed exports and stale generated output, including transitive signature changes and changes to framework TS/TSX/CSS sources. Source fingerprints require a visible reference regeneration; behavior descriptions still need human review.',
    '',
    'This finite index covers the concepts listed below. It lists the supported contracts and known gaps. A mapping describes the available React contract; it does not certify native pixels, motion, touch, lifecycle or installed-device fidelity. Internal and experimental modules are inventoried explicitly and are not stable app APIs.',
    '',
    `Coverage: ${mapped.length + unavailable.length} indexed API concepts; ${mapped.length} mapped; ${unavailable.length} explicitly unavailable; ${extensions.length} Satin-only extension entries. ${inventory.length} named exports across ${hashes.length} declaration entry points; ${mappedExports.size} unique exports mapped to concepts; ${missing.length} exports without a reviewed API description. Type-only and tooling exports remain in that missing inventory rather than receiving invented behavior. CSS is a stylesheet, not a named declaration export.`,
    '',
    '## Mapped concepts',
    '',
    '| API concept | Satin contract | Actual behavior | Limitations |',
    '| --- | --- | --- | --- |',
    ...mapped.map(
      concept =>
        `| ${cell(concept.concept)} | ${concept.exports.map(declarationLink).join(', ')} | ${cell(concept.behavior)} | ${cell(concept.limitations)} |`,
    ),
    '',
    '## Framework utilities',
    '',
    '| Satin extension | Public contract | Actual behavior | Limitations |',
    '| --- | --- | --- | --- |',
    ...extensions.map(
      concept =>
        `| ${cell(concept.concept)} | ${concept.exports.map(declarationLink).join(', ')} | ${cell(concept.behavior)} | ${cell(concept.limitations)} |`,
    ),
    '',
    '## Explicitly unavailable concepts',
    '',
    '| API concept | Supported alternative or blocked capability | Limitations |',
    '| --- | --- | --- |',
    ...unavailable.map(
      concept =>
        `| ${cell(concept.concept)} | ${cell(concept.behavior)} | ${cell(concept.limitations)} |`,
    ),
    '',
    'See [application recipes](app-recipes.md), [local data](data.md), [geometry tokens](tokens.md) and [messaging scroll](messaging-scroll.md) for the supported compositions and restrictions.',
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
    '## Exact public export inventory',
    '',
    '| Module | Export | Kind | Reviewed API description |',
    '| --- | --- | --- | --- |',
    ...inventory.map(
      entry =>
        `| \`${entry.module}\` | [\`${entry.name}\`](${entry.declaration}) | ${entry.kind} | ${cell(mappedExports.get(identity(entry.module, entry.name))?.join('; ') ?? 'No reviewed API description')} |`,
    ),
    '',
    '## Missing mapping inventory',
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
  const snapshot = resolve(root, 'api/swiftui-reference.md')
  if (write) {
    await mkdir(dirname(snapshot), { recursive: true })
    await writeFile(snapshot, content)
  } else if ((await readFile(snapshot, 'utf8').catch(() => '')) !== content) {
    throw new Error(
      'Satin API reference is stale. Build and run pnpm --filter @satinhq/kit api:write.',
    )
  }
  await mkdir(resolve(root, 'dist/docs'), { recursive: true })
  await writeFile(resolve(root, 'dist/docs/swiftui-reference.md'), content)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generateReference(process.argv.includes('--write'))
}
