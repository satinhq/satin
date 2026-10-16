import { spawnSync } from 'node:child_process'
import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readmePath = resolve(packageRoot, 'README.md')
const docsRoot = resolve(packageRoot, '../../docs')
const examplesDirectory = resolve(packageRoot, 'node_modules/.tmp/readme-examples')
const fence = /^```(ts|tsx)\s*\n([\s\S]*?)^```\s*$/gmu
// Complete, code-only recipes opt in without changing any live preview program.
const recipeFence = /^<!-- compile -->\s*\n```(ts|tsx)\s*\n([\s\S]*?)^```\s*$/gmu
const executableExtension = process.platform === 'win32' ? '.cmd' : ''
const tsc = resolve(packageRoot, `node_modules/.bin/tsc${executableExtension}`)
const oxlint = resolve(packageRoot, `node_modules/.bin/oxlint${executableExtension}`)

function run(command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, {
    cwd: packageRoot,
    stdio: 'inherit',
    ...options,
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

await access(resolve(packageRoot, 'dist/index.js'))
await access(resolve(packageRoot, 'dist/index.d.ts'))

const readme = await readFile(readmePath, 'utf8')
const examples = [...readme.matchAll(fence)].map((match, index) => ({
  extension: match[1],
  filename: `example-${index + 1}.${match[1]}`,
  source: match[2],
  label: `README.md block ${index + 1}`,
}))

if (examples.length === 0) {
  throw new Error('packages/pwakit/README.md contains no fenced ts/tsx examples.')
}
const readmeCount = examples.length
const docsPaths = (await readdir(docsRoot, { recursive: true }))
  .filter(path => path.endsWith('.md'))
  .sort()
for (const path of docsPaths) {
  const markdown = await readFile(resolve(docsRoot, path), 'utf8')
  const recipes = [...markdown.matchAll(recipeFence)]
  const markerCount = [...markdown.matchAll(/^<!-- compile -->$/gmu)].length
  if (recipes.length !== markerCount)
    throw new Error(`docs/${path}: every compile marker needs a complete ts/tsx fence.`)
  for (const [index, match] of recipes.entries()) {
    examples.push({
      extension: match[1],
      filename: `docs-${path.replace(/[^a-z0-9-]/giu, '-')}-${index + 1}.${match[1]}`,
      source: match[2],
      label: `docs/${path} recipe ${index + 1}`,
    })
  }
}

await rm(examplesDirectory, { force: true, recursive: true })
await mkdir(examplesDirectory, { recursive: true })

try {
  await Promise.all(
    examples.map(example =>
      writeFile(resolve(examplesDirectory, example.filename), example.source),
    ),
  )
  await writeFile(
    resolve(examplesDirectory, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          allowArbitraryExtensions: true,
          jsx: 'react-jsx',
          lib: ['ES2023', 'DOM'],
          module: 'esnext',
          moduleResolution: 'bundler',
          noEmit: true,
          noFallthroughCasesInSwitch: true,
          noUnusedLocals: true,
          noUnusedParameters: true,
          skipLibCheck: false,
          strict: true,
          target: 'es2023',
          verbatimModuleSyntax: true,
        },
        files: examples.map(example => example.filename),
      },
      null,
      2,
    )}\n`,
  )

  const examplePaths = examples.map(example => resolve(examplesDirectory, example.filename))
  for (const example of examples.slice(readmeCount))
    console.log(`Checking ${example.label}: ${example.filename}`)
  run(tsc, ['-p', resolve(examplesDirectory, 'tsconfig.json'), '--pretty', 'false'])
  run(oxlint, ['--config', resolve(packageRoot, '../pwakit-lint/oxlint.json'), ...examplePaths])
  run(process.execPath, [
    resolve(packageRoot, '../pwakit-lint/scripts/check-fidelity.mjs'),
    examplesDirectory,
  ])
  console.log(
    `README examples: ${readmeCount} blocks; docs recipes: ${examples.length - readmeCount} blocks compile against dist and pass satin-lint.`,
  )
} finally {
  await rm(examplesDirectory, { force: true, recursive: true })
}
