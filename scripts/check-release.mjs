import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const manifest = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'))
const framework = await manifest('../packages/kit/package.json')
const scaffold = await manifest('../packages/create-satin/package.json')
const template = await manifest('../templates/basic/package.json')
const lint = await manifest('../packages/lint/package.json')
const push = await manifest('../packages/push/package.json')
const fixture = await manifest('../fixtures/consumer/package.json')
const notices = await manifest('../packages/kit/src/acknowledgements/inventory.json')
const identity = await manifest('./rename/names.json')
const packages = identity.profiles[identity.packageProfile]
assert.equal(framework.name, packages.kit)
assert.equal(lint.name, packages.lint)
assert.equal(push.name, packages.push)
assert.equal(scaffold.name, identity.createPackage)
assert.equal(
  process.env.GITHUB_REF_NAME,
  `v${framework.version}`,
  'Tag must match framework version',
)
assert.equal(scaffold.version, framework.version, 'Scaffold version must match framework')
assert.equal(
  template.dependencies[packages.kit],
  framework.version,
  'Template must install the released framework',
)
assert.equal(
  fixture.dependencies[packages.kit],
  `file:.artifacts/${packages.kit.replace(/^@/, '').replaceAll('/', '-')}-${identity.version}.tgz`,
  'Consumer fixture must use the released framework archive',
)
assert.equal(notices.find(notice => notice.role === 'framework')?.version, identity.version)
for (const path of ['../NOTICE', '../packages/kit/NOTICE']) {
  const notice = await readFile(new URL(path, import.meta.url), 'utf8')
  assert.ok(
    notice.includes(`## ${identity.brand} ${identity.version}\n`),
    `${path} must identify the released framework version`,
  )
}
for (const pkg of [framework, scaffold, lint, push]) {
  assert.equal(pkg.version, identity.version)
  assert.equal(pkg.homepage, `https://${identity.domain}`)
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
