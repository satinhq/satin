import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const manifest = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'))
const framework = await manifest('../packages/pwakit/package.json')
const scaffold = await manifest('../packages/create-pwakit/package.json')
const template = await manifest('../templates/basic/package.json')
const lint = await manifest('../packages/pwakit-lint/package.json')
const identity = await manifest('./rename/names.json')
const packages = identity.profiles[identity.packageProfile]
assert.equal(framework.name, packages.kit)
assert.equal(lint.name, packages.lint)
assert.equal(scaffold.name, identity.createPackage)
assert.equal(
  process.env.GITHUB_REF_NAME,
  `v${framework.version}`,
  'Tag must match framework version',
)
assert.equal(scaffold.version, framework.version, 'Scaffold version must match framework')
assert.equal(
  template.dependencies['@satinhq/kit'],
  framework.version,
  'Template must install the released framework',
)
for (const pkg of [framework, scaffold, lint]) {
  assert.equal(pkg.version, identity.version)
  assert.equal(pkg.publishConfig.tag, identity.distTag)
  assert.equal(pkg.private, undefined)
  assert.equal(pkg.publishConfig.access, 'public')
  assert.equal(
    pkg.repository.url,
    `git+https://github.com/${process.env.GITHUB_REPOSITORY}.git`,
    'Repository must match provenance identity',
  )
}
console.log(`Release metadata valid for ${framework.version}`)
