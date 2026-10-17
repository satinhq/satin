import { access, readFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import type { DeploymentExpectation } from './deployment.ts'

/** Final check runs after all shell and public-page emission has completed. */
export async function validateBuiltDeployment(output: string, expected: DeploymentExpectation) {
  const root = resolve(output)
  const fileForUrl = (url: string) => {
    const path = new URL(url, 'https://satin.invalid').pathname
    if (!path.startsWith(expected.base)) {
      throw new Error(`Satin malformed package: ${url} is outside Vite base ${expected.base}.`)
    }
    const relative = path.slice(expected.base.length)
    const file = resolve(root, relative + (path.endsWith('/') ? 'index.html' : ''))
    if (!file.startsWith(root + sep))
      throw new Error(`Satin malformed package: invalid path ${url}.`)
    return file
  }
  const required = async (url: string) => {
    const file = fileForUrl(url)
    try {
      await access(file)
    } catch {
      throw new Error(`Satin malformed package: required file ${url} is missing from dist.`)
    }
    return file
  }
  for (const url of [
    ...expected.manifests,
    ...expected.icons,
    expected.start_url,
    expected.installRoute + '/',
    expected.scope + 'sw.js',
  ]) {
    await required(url)
  }
  for (const url of expected.manifests) {
    const manifest = JSON.parse(await readFile(fileForUrl(url), 'utf8'))
    const icons = manifest.icons
    if (
      !Array.isArray(icons) ||
      new Set(icons.map(icon => icon?.src)).size !== new Set(expected.icons).size ||
      !expected.icons.every(source => icons.some(icon => icon?.src === source))
    ) {
      throw new Error('Satin malformed package: manifest icons do not match this build.')
    }
    for (const field of ['id', 'start_url', 'scope'] as const) {
      if (manifest[field] !== expected[field]) {
        throw new Error(`Satin malformed package: manifest ${field} must equal ${expected[field]}.`)
      }
    }
  }
  const version = JSON.parse(
    await readFile(await required(expected.scope + 'satin-version.json'), 'utf8'),
  )
  const inventoryUrl = expected.base + `precache-manifest.${version.buildId}.json`
  const inventory = JSON.parse(await readFile(await required(inventoryUrl), 'utf8'))
  for (const entry of inventory.entries) await required(entry.url)
}
