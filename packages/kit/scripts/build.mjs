import { assertPublicDoc } from '../../create-satin/scripts/agent-docs.mjs'
import { cp, copyFile, readFile, readdir, rm, mkdir, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputDirectory = resolve(packageRoot, 'dist')
const typescriptModuleExtension = /(['"])(\.\.?\/[^'"]+)\.(?:cts|mts|ts|tsx)\1/gu

async function declarationFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(entry => {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) return declarationFiles(path)
      return path.endsWith('.d.ts') ? [path] : []
    }),
  )
  return files.flat()
}

async function rewriteDeclarationImports() {
  for (const path of await declarationFiles(outputDirectory)) {
    const declaration = await readFile(path, 'utf8')
    for (const comment of declaration.matchAll(/\/\*\*[\s\S]*?\*\//g)) {
      assertPublicDoc(comment[0], path)
    }
    const rewritten = declaration.replace(
      typescriptModuleExtension,
      (_match, quote, specifier) => `${quote}${specifier}.js${quote}`,
    )
    await writeFile(path, rewritten)
  }
}

await rm(outputDirectory, { force: true, recursive: true })

const compilation = spawnSync('tsc', ['-p', 'tsconfig.build.json', '--pretty', 'false'], {
  cwd: packageRoot,
  stdio: 'inherit',
})

if (compilation.error) throw compilation.error
if (compilation.status !== 0) process.exit(compilation.status ?? 1)

await copyFile(
  resolve(packageRoot, 'src/image/imports.d.ts'),
  resolve(outputDirectory, 'image/imports.d.ts'),
)
await rewriteDeclarationImports()
const imageTypesEntry = resolve(outputDirectory, 'index.d.ts')
await writeFile(
  imageTypesEntry,
  '/// <reference path="./image/imports.d.ts" />\n' + (await readFile(imageTypesEntry, 'utf8')),
)
// tsc rewrites imports but not literal worker URLs. Keep the packaged worker
// discoverable by a consumer Vite build as well as the source lab.
const workerClientPath = resolve(outputDirectory, 'glass/worker/client.js')
await writeFile(
  workerClientPath,
  (await readFile(workerClientPath, 'utf8')).replace(
    '../webgpu/entry.worker.ts',
    '../webgpu/entry.worker.js',
  ),
)
const gpuClientPath = resolve(outputDirectory, 'glass/webgpu/client.js')
await writeFile(
  gpuClientPath,
  (await readFile(gpuClientPath, 'utf8')).replace('./entry.worker.ts', './entry.worker.js'),
)
const sourcePixelsPath = resolve(outputDirectory, 'glass/webgpu/sourcePixels.js')
await writeFile(
  sourcePixelsPath,
  (await readFile(sourcePixelsPath, 'utf8')).replace(
    './sourcePixels.worker.ts',
    './sourcePixels.worker.js',
  ),
)
await copyFile(resolve(packageRoot, 'src/styles.css'), resolve(outputDirectory, 'styles.css'))
await copyFile(
  resolve(packageRoot, 'src/styles.css.d.ts'),
  resolve(outputDirectory, 'styles.css.d.ts'),
)

// Keep the README's offline guides in dist so prepack always ships current docs.
const guidesDirectory = resolve(outputDirectory, 'docs')
await mkdir(guidesDirectory, { recursive: true })
for (const guide of [
  'app-recipes.md',
  'data.md',
  'tokens.md',
  'networking.md',
  'content.md',
  'controls.md',
  'limitations.md',
  'components/photos-picker.md',
  'components/file-importer.md',
  'components/share-link.md',
  'components/paste-button.md',
]) {
  const content = await readFile(resolve(packageRoot, '../../docs', guide), 'utf8')
  const offline = content.replaceAll('../packages/push/README.md', 'push.md')
  const destination = resolve(guidesDirectory, guide)
  await mkdir(dirname(destination), { recursive: true })
  await writeFile(destination, offline)
}

await copyFile(resolve(packageRoot, '../push/README.md'), resolve(guidesDirectory, 'push.md'))

// Keep the available-name page tied to the glyphs in this exact package build.
const { renderSymbolCatalogue } = await import('./symbol-catalogue.mjs')
const { coreSymbols } = await import(new URL('../dist/symbols/catalogue.js', import.meta.url).href)
await writeFile(
  resolve(guidesDirectory, 'symbols.md'),
  renderSymbolCatalogue(Object.keys(coreSymbols)),
)

// Always render package reference from this build, even when the checked snapshot is stale.
const { referenceInventory, renderReference } = await import('./api-reference.mjs')
await writeFile(
  resolve(guidesDirectory, 'reference.md'),
  renderReference(await referenceInventory()),
)
await copyFile(
  resolve(packageRoot, '../../docs/messaging-scroll.md'),
  resolve(guidesDirectory, 'messaging-scroll.md'),
)
