import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

// Repository-root URL, including a revision when publishing versioned docs.
export const defaultDocsBaseUrl = 'https://github.com/satinhq/satin/blob/main/'

export function docsBaseUrl(value = defaultDocsBaseUrl) {
  const url = new URL(value)
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'SATIN_DOCS_BASE_URL must be an HTTP(S) repository-root URL without credentials, query or fragment.',
    )
  }
  if (!url.pathname.endsWith('/')) url.pathname += '/'
  return url
}

export function prepareGuide(markdown, base = defaultDocsBaseUrl) {
  const root = docsBaseUrl(base)
  return markdown.replace(/\]\(([^)\s]+)\)/g, (original, target) => {
    if (
      target.startsWith('#') ||
      (/^[a-z][a-z\d+.-]*:/i.test(target) && !target.startsWith(defaultDocsBaseUrl))
    )
      return original
    if (target.startsWith('//')) return original
    const destination = target.startsWith(defaultDocsBaseUrl)
      ? new URL(target.slice(defaultDocsBaseUrl.length), root)
      : new URL(target, new URL('docs/', root))
    return `](${destination.href})`
  })
}

export function assertPublicDoc(markdown, label) {
  const internal =
    /~\/Code\/|\bsatin-(?:scratch|int)\b|\bcoordinator\b|\bphase[\s_-]*\d+[a-z]?(?:\.\d+)?\b|\b(?:lanes?|worktrees?|branches|branch|preview-int)\b|\bcodex-\d+[a-z]?\b|\b(?:pending|awaiting)\s+\d+[a-z]\b/iu
  const match = markdown.match(internal) ?? markdown.match(/(?<![\w-])W\d+[a-z]?(?![\w-])/u)
  if (match)
    throw new Error(
      `${label}: shipped documentation contains internal project status (${match[0]}). Describe the available API or user-visible limitation instead.`,
    )
}

export async function checkShippedDocs(directory) {
  let count = 0
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', 'dist'].includes(entry.name)) continue
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) count += await checkShippedDocs(path)
    else if (/\.md$/i.test(entry.name)) {
      assertPublicDoc(await readFile(path, 'utf8'), path)
      count++
    }
  }
  return count
}
