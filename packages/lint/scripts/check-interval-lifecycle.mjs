import { parseSync } from 'oxc-parser'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Recurring framework work must have an explicit foreground lifetime. */
export function intervalLifecycleViolations(source, filename) {
  if (
    ['lifecycle/visibleInterval.ts', 'app/launchReadiness.ts'].includes(filename) ||
    /\.(test|fixture)\./.test(filename)
  )
    return []
  const { program } = parseSync(filename, source, { lang: 'tsx', preserveParens: true })
  const violations = []
  function visit(node) {
    if (!node || typeof node !== 'object') return
    if (
      node.type === 'CallExpression' &&
      ((node.callee.type === 'Identifier' && node.callee.name === 'setInterval') ||
        (node.callee.type === 'MemberExpression' &&
          ((!node.callee.computed && node.callee.property.name === 'setInterval') ||
            (node.callee.computed && node.callee.property.value === 'setInterval'))))
    ) {
      const line = source.slice(0, node.start).split('\n').length
      violations.push(
        `${filename}:${line}: use visibleInterval for recurring work; bounded readiness polling owns its own visibility budget`,
      )
    }
    for (const child of Object.values(node)) {
      if (Array.isArray(child)) child.forEach(visit)
      else if (child && typeof child === 'object') visit(child)
    }
  }
  visit(program)
  return violations
}
async function check(directory, root = directory) {
  const violations = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) violations.push(...(await check(path, root)))
    else if (/\.tsx?$/.test(entry.name)) {
      violations.push(
        ...intervalLifecycleViolations(await readFile(path, 'utf8'), relative(root, path)),
      )
    }
  }
  return violations
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const violations = await check(process.argv[2])
  if (violations.length) {
    console.error(violations.join('\n'))
    process.exitCode = 1
  }
}
