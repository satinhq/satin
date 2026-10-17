// Checks the publishable agent skills in skills/ against the Agent Skills format
// (https://agentskills.io/specification) and the shipped-documentation rules.
//
//   node scripts/check-skills.mjs                          validate every skill
//   node scripts/check-skills.mjs --render satin --out D  also write a renamed copy to D
//
// The skills keep the `satin` placeholder until the product name is final. Validation
// renders them with a sample name first, because the placeholder itself is not a legal
// skill name. `--render` produces the copy a developer would install, for local trials.

import assert from 'node:assert/strict'
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertPublicDoc } from '../packages/create-satin/scripts/agent-docs.mjs'

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const skillsRoot = resolve(workspace, 'skills')
const placeholder = 'satin'
const frameworkPackage = JSON.parse(
  await readFile(resolve(workspace, 'packages/kit/package.json'), 'utf8'),
).name
const sampleName = 'example'

// Limits from the Agent Skills specification.
const maxNameLength = 64
const maxDescriptionLength = 1024
const maxSkillLines = 500

// Public entry points of the framework package, for the API-name check.
const publicEntryPoints = [
  'index.ts',
  'install.ts',
  'server.ts',
  'testing.ts',
  'unstable.ts',
  'diagnostics.ts',
  'sw/vite.ts',
]
const platformNames = new Set(['AbortSignal', 'useState'])
let publicSource

const options = parseArguments(process.argv.slice(2))
const skillDirectories = await listSkillDirectories()
assert.ok(skillDirectories.length > 0, 'skills/ must contain at least one skill')

for (const directory of skillDirectories) {
  await checkSkill(directory)
}
if (options.renderName) {
  await renderSkills(options.renderName, options.outDirectory)
}
console.log(`Checked ${skillDirectories.length} skills in ${relative(workspace, skillsRoot)}/`)

function parseArguments(argv) {
  const renderIndex = argv.indexOf('--render')
  const outIndex = argv.indexOf('--out')
  if (renderIndex === -1) return {}
  assert.ok(outIndex !== -1, '--render needs --out <directory>')
  return { renderName: argv[renderIndex + 1], outDirectory: resolve(argv[outIndex + 1]) }
}

async function listSkillDirectories() {
  const entries = await readdir(skillsRoot, { withFileTypes: true })
  const directories = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const skillFile = join(skillsRoot, entry.name, 'SKILL.md')
    if (await exists(skillFile)) directories.push(join(skillsRoot, entry.name))
  }
  return directories
}

async function checkSkill(directory) {
  const directoryName = rendered(relative(skillsRoot, directory), sampleName)
  const skillText = await readFile(join(directory, 'SKILL.md'), 'utf8')
  const { frontmatter, body } = splitFrontmatter(skillText, directoryName)

  const name = rendered(readField(frontmatter, 'name', directoryName), sampleName)
  const description = rendered(readField(frontmatter, 'description', directoryName), sampleName)
  assert.equal(name, directoryName, `${directoryName}: name must match its directory`)
  assert.ok(name.length <= maxNameLength, `${directoryName}: name is longer than ${maxNameLength}`)
  assert.match(
    name,
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/u,
    `${directoryName}: name must be lowercase words joined by single hyphens`,
  )
  assert.ok(
    description.length <= maxDescriptionLength,
    `${directoryName}: description is ${description.length} characters; the limit is ${maxDescriptionLength}`,
  )
  const lineCount = skillText.split('\n').length
  assert.ok(lineCount <= maxSkillLines, `${directoryName}: SKILL.md has ${lineCount} lines`)

  await checkMarkdownFiles(directory, directoryName)
  await checkRelativeLinks(directory, body, directoryName)
  await checkApiNames(directory, directoryName)
}

// Component, hook and definer names quoted in a skill must still be exported by a public
// entry point, so a framework rename fails here instead of teaching agents a dead API.
async function checkApiNames(directory, label) {
  publicSource ??= (
    await Promise.all(
      publicEntryPoints.map(file =>
        readFile(resolve(workspace, 'packages/kit/src', file), 'utf8'),
      ),
    )
  ).join('\n')
  for (const file of await listFiles(directory)) {
    if (!file.endsWith('.md')) continue
    const text = await readFile(file, 'utf8')
    for (const [, name] of text.matchAll(/`((?:[A-Z]|use[A-Z]|define[A-Z])[A-Za-z0-9]*)`/gu)) {
      if (platformNames.has(name)) continue
      assert.match(
        publicSource,
        new RegExp(`\\b${name}\\b`, 'u'),
        `${label}/${relative(directory, file)}: ${name} is not a public export`,
      )
    }
  }
}

function splitFrontmatter(text, label) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/u)
  assert.ok(match, `${label}: SKILL.md must start with YAML frontmatter`)
  return { frontmatter: match[1], body: match[2] }
}

// The frontmatter uses only single-line scalar fields, so a line match is enough.
function readField(frontmatter, field, label) {
  const match = frontmatter.match(new RegExp(`^${field}: (.+)$`, 'mu'))
  assert.ok(match, `${label}: frontmatter needs a ${field}`)
  return match[1].trim()
}

async function checkMarkdownFiles(directory, label) {
  for (const file of await listFiles(directory)) {
    if (!file.endsWith('.md')) continue
    const text = await readFile(file, 'utf8')
    assertPublicDoc(text, `${label}/${relative(directory, file)}`)
    const location = `${label}/${relative(directory, file)}`
    if (frameworkPackage !== placeholder) {
      for (const [, moduleName] of text.matchAll(/\b(?:from|declare module)\s+['"]([^'"]+)['"]/gu)) {
        assert.ok(
          moduleName !== placeholder && !moduleName.startsWith(`${placeholder}/`),
          `${location}: import ${moduleName} must use configured package ${frameworkPackage}`,
        )
      }
      assert.ok(
        !text.includes(`node_modules/${placeholder}/`),
        `${location}: installed paths must use node_modules/${frameworkPackage}/`,
      )
    }
  }
}

// Every relative link in SKILL.md must point at a file inside the skill.
async function checkRelativeLinks(directory, body, label) {
  for (const [, target] of body.matchAll(/\]\(([^)\s#]+)\)/gu)) {
    if (/^[a-z][a-z\d+.-]*:/iu.test(target)) continue
    const path = resolve(directory, target)
    assert.ok(path.startsWith(directory), `${label}: link ${target} leaves the skill`)
    assert.ok(await exists(path), `${label}: link ${target} does not exist`)
  }
}

async function renderSkills(name, outDirectory) {
  await rm(outDirectory, { recursive: true, force: true })
  await mkdir(outDirectory, { recursive: true })
  for (const directory of skillDirectories) {
    const target = join(outDirectory, rendered(relative(skillsRoot, directory), name))
    await cp(directory, target, { recursive: true })
    for (const file of await listFiles(target)) {
      const text = await readFile(file, 'utf8')
      await writeFile(file, rendered(text, name))
    }
  }
  console.log(`Rendered the skills as "${name}" into ${outDirectory}`)
}

function rendered(text, name) {
  return text.replaceAll(placeholder, name)
}

async function listFiles(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await listFiles(path)))
    else files.push(path)
  }
  return files
}

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}
