import { readFile, readdir, realpath } from 'node:fs/promises'
import { dirname, join, parse } from 'node:path'
import { createHash } from 'node:crypto'
import bundled from './inventory.json' with { type: 'json' }
import { renderNotices, type LicenseNotice } from './inventory.ts'

/** Inspect modules surviving tree shaking, never package.json's development dependency list. */
export async function bundledLicenseNotices(
  moduleIds: readonly string[],
): Promise<readonly LicenseNotice[]> {
  const packages = new Map<string, { root: string; files: Set<string> }>()
  for (const id of moduleIds) {
    const path = id.split('?')[0]!
    if (!path.includes('/node_modules/') || path.startsWith('\0')) continue
    const source = await realpath(path)
    let directory = dirname(source)
    while (directory !== parse(directory).root) {
      const metadata = await readFile(join(directory, 'package.json'), 'utf8').catch(() => null)
      if (metadata) {
        const manifest = JSON.parse(metadata) as { name?: string; version?: string }
        if (manifest.name && manifest.version) {
          if (manifest.name !== '@satinhq/kit') {
            const entry = packages.get(directory) ?? { root: directory, files: new Set<string>() }
            entry.files.add(source.slice(directory.length + 1))
            packages.set(directory, entry)
          }
          break
        }
      }
      directory = dirname(directory)
    }
  }
  const notices: LicenseNotice[] = [...bundled]
  for (const { root, files } of packages.values()) {
    const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
    const names = (await readdir(root))
      .filter(name => /^(?:licen[cs]e|copying|notice)(?:[._-].*)?$/i.test(name))
      .sort()
    if (!names.some(name => /^(?:licen[cs]e|copying)/i.test(name)))
      throw new Error(
        `Satin bundled dependency ${manifest.name}@${manifest.version} has no license text. Supply and audit its notice before building.`,
      )
    const texts = await Promise.all(
      names.map(async name => `${name}\n\n${await readFile(join(root, name), 'utf8')}`),
    )
    const text = texts.join('\n\n')
    const repository =
      typeof manifest.repository === 'string' ? manifest.repository : manifest.repository?.url
    notices.push({
      name: manifest.name,
      version: manifest.version,
      license: typeof manifest.license === 'string' ? manifest.license : 'See license text',
      source: repository ?? manifest.homepage ?? `https://www.npmjs.com/package/${manifest.name}`,
      text,
      sha256: createHash('sha256').update(text).digest('hex'),
      bundledPaths: [...files].sort(),
      role: 'consumer emitted module graph',
    })
  }
  return [
    ...notices.slice(0, 1),
    ...notices.slice(1).sort((left, right) => left.name.localeCompare(right.name)),
  ]
}
export { renderNotices }
