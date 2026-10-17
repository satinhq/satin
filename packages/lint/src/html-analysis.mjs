import { rules } from './rules.mjs'
import { analyzeCss } from './css-analysis.mjs'
import { analyzeTypeScript } from './typescript-analysis.mjs'

/** HTML inputs to a definition-owned build must leave head policy to the plugin. */
export function analyzeHtml(source) {
  const clean = source.replace(/<!--[\s\S]*?-->/g, match => ' '.repeat(match.length))
  const violations = []
  const tags = /<(link|meta|title)\b[^>]*>/gi
  for (const match of clean.matchAll(tags)) {
    const attrs = Object.fromEntries(
      [...match[0].matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(a => [
        a[1].toLowerCase(),
        (a[2] ?? a[3] ?? a[4]).toLowerCase(),
      ]),
    )
    if (
      match[1].toLowerCase() === 'title' ||
      ['manifest', 'apple-touch-icon', 'apple-touch-startup-image'].includes(attrs.rel) ||
      /^(theme-color|viewport|color-scheme|apple-mobile-web-app.*)$/.test(attrs.name ?? '')
    ) {
      const rule = rules['no-handwritten-app-head']
      violations.push({ ruleId: rule.id, message: rule.message, offset: match.index })
    }
  }
  const inlineBlocks = /<(script|style)\b((?:"[^"]*"|'[^']*'|[^'">])*)>([\s\S]*?)<\/\1\s*>/gi
  for (const match of clean.matchAll(inlineBlocks)) {
    const kind = match[1].toLowerCase()
    const attributes = new Map()
    const attributePattern = /([^\s=/'"<>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g
    for (const attribute of match[2].matchAll(attributePattern)) {
      const name = attribute[1].toLowerCase()
      if (!attributes.has(name))
        attributes.set(name, attribute[2] ?? attribute[3] ?? attribute[4] ?? '')
    }
    const mediaType = (attributes.get('type') ?? '').toLowerCase()
    if (kind === 'script' && attributes.has('src')) continue
    if (
      kind === 'script' &&
      !['', 'module', 'text/javascript', 'application/javascript'].includes(mediaType)
    )
      continue
    if (kind === 'style' && !['', 'text/css'].includes(mediaType)) continue
    const contentOffset = match.index + match[1].length + match[2].length + 2
    const found = kind === 'style' ? analyzeCss(match[3]) : analyzeTypeScript('inline.js', match[3])
    violations.push(...found.map(item => ({ ...item, offset: contentOffset + item.offset })))
  }
  return violations
}
