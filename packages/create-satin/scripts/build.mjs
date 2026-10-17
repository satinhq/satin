import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { assertPublicDoc, checkShippedDocs, docsBaseUrl, prepareGuide } from './agent-docs.mjs'

const root = resolve(import.meta.dirname, '..')
// Validate before replacing the packed template.
const docsBase = docsBaseUrl(process.env.SATIN_DOCS_BASE_URL)
await rm(resolve(root, 'template'), { recursive: true, force: true })
await mkdir(resolve(root, 'template'), { recursive: true })
await cp(resolve(root, '../../templates/basic'), resolve(root, 'template'), {
  recursive: true,
  filter: source =>
    !/(?:^|[/\\])(?:node_modules|dist|package-lock\.json|pnpm-lock\.yaml)(?:[/\\]|$)/u.test(source),
})
// npm excludes .gitignore. Ship a regular file and restore its name at scaffold time.
await rename(resolve(root, 'template/.gitignore'), resolve(root, 'template/_gitignore'))

// Ship the full guide offline with each scaffold. Relative repository links
// become source links. AGENTS.md also points to the installed API examples.
const guide = prepareGuide(
  await readFile(resolve(root, '../../docs/getting-started.md'), 'utf8'),
  docsBase.href,
)
await writeFile(resolve(root, 'template/GETTING-STARTED.md'), guide)
await checkShippedDocs(resolve(root, 'template'))
for (const path of ['README.md', '../kit/README.md']) {
  assertPublicDoc(await readFile(resolve(root, path), 'utf8'), path)
}
