import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSync } from 'oxc-parser'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export function exportNames(source) {
  const { program } = parseSync('index.ts', source)
  const names = []
  for (const statement of program.body) {
    // A new export form must not silently bypass the inventory check.
    if (statement.type !== 'ExportNamedDeclaration' || statement.declaration) {
      throw new Error(
        'Unrecognized root export syntax; extend the documentation checker before adding it.',
      )
    }
    for (const entry of statement.specifiers) {
      names.push(entry.exported.name ?? entry.exported.value)
    }
  }
  return names
}

export function checkInventory(names, markdown, label) {
  const section = markdown.match(/<!-- public-api:start -->([\s\S]*?)<!-- public-api:end -->/)?.[1]
  if (!section) throw new Error(`${label}: missing public export reference`)
  const entries = new Map()
  for (const line of section.split('\n')) {
    const row = line.match(/^\| (.+) \| (App|Type|Diagnostic) \| (.+) \|$/)
    if (!row) continue
    if (row[3].trim().length < 30)
      throw new Error(`${label}: export descriptions must explain use or a boundary`)
    for (const match of row[1].matchAll(/`([A-Za-z_$][\w$]*)`/g)) {
      if (entries.has(match[1])) throw new Error(`${label}: duplicate entry ${match[1]}`)
      entries.set(match[1], row[2])
    }
  }
  const missing = names.filter(name => !entries.has(name))
  const stale = [...entries.keys()].filter(name => !names.includes(name))
  if (missing.length || stale.length)
    throw new Error(
      `${label}: undocumented exports: ${missing.join(', ') || 'none'}; stale entries: ${stale.join(', ') || 'none'}`,
    )
  return entries.size
}

async function main() {
  const names = exportNames(await readFile(resolve(root, 'src/index.ts'), 'utf8'))
  for (const path of ['README.md', '../../docs/getting-started.md']) {
    const markdown = await readFile(resolve(root, path), 'utf8')
    const section = markdown.match(
      /<!-- public-api:start -->([\s\S]*?)<!-- public-api:end -->/,
    )?.[1]
    if (!section) throw new Error(`${path}: missing grouped API index`)
    for (const [, name] of section.matchAll(/`([A-Za-z_$][\w$]*)`/g)) {
      if (!names.includes(name)) throw new Error(`${path}: unknown index export ${name}`)
    }
  }
  const report = await readFile(resolve(root, 'api/satin.api.md'), 'utf8')
  for (const name of names) {
    if (!report.includes(`## ${name}\n`)) throw new Error(`API report missing ${name}`)
  }
  const { rules } = await import('../../lint/src/rules.mjs')
  const contract = await readFile(resolve(root, '../../templates/basic/AGENTS.md'), 'utf8')
  for (const [, name] of contract.matchAll(/`((?:no-|require-)[a-z-]+)`/g)) {
    if (!rules[name]) throw new Error(`AGENTS.md names an unknown lint rule: ${name}`)
  }
  console.log(
    `Public API docs: ${names.length} exports covered by the API report; both guide indexes checked; contract lint rule names resolve.`,
  )
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
