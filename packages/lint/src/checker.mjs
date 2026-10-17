import { analyzeHtml } from './html-analysis.mjs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { extname, resolve } from 'node:path'

import { analyzeCss } from './css-analysis.mjs'
import { ruleManifest } from './rules.mjs'
import { analyzeTypeScript } from './typescript-analysis.mjs'

export const SOURCE_EXTENSIONS = new Set(['.html', '.css', '.js', '.jsx', '.mjs', '.ts', '.tsx'])

const ruleOrder = new Map(ruleManifest.map((rule, index) => [rule.id, index]))

function lineAndColumn(source, offset) {
  let line = 1
  let lineStart = 0
  for (let index = 0; index < offset; index += 1) {
    if (source[index] !== '\n') continue
    line += 1
    lineStart = index + 1
  }
  return { line, column: offset - lineStart + 1 }
}

export async function sourceFiles(target) {
  const metadata = await stat(target)
  if (metadata.isFile()) return SOURCE_EXTENSIONS.has(extname(target)) ? [target] : []

  const entries = await readdir(target, { withFileTypes: true })
  const nested = await Promise.all(
    entries
      .filter(entry => entry.name !== 'dist' && entry.name !== 'node_modules')
      .map(entry => sourceFiles(resolve(target, entry.name))),
  )
  return nested.flat()
}

export function analyzeSource(fileName, source) {
  const violations =
    extname(fileName) === '.html'
      ? analyzeHtml(source)
      : extname(fileName) === '.css'
        ? analyzeCss(source)
        : analyzeTypeScript(fileName, source)

  return violations.toSorted(
    (left, right) =>
      (ruleOrder.get(left.ruleId) ?? Number.MAX_SAFE_INTEGER) -
        (ruleOrder.get(right.ruleId) ?? Number.MAX_SAFE_INTEGER) || left.offset - right.offset,
  )
}

export async function analyzeFile(file) {
  const source = await readFile(file, 'utf8')
  return analyzeSource(file, source).map(violation => ({
    ...violation,
    file,
    ...lineAndColumn(source, violation.offset),
  }))
}

export async function checkTargets(targets, cwd = process.cwd()) {
  const files = (await Promise.all(targets.map(target => sourceFiles(resolve(cwd, target))))).flat()
  const diagnostics = []

  for (const file of files) diagnostics.push(...(await analyzeFile(file)))
  return diagnostics
}

export function formatDiagnostic(diagnostic) {
  return `${diagnostic.file}:${diagnostic.line}:${diagnostic.column} ${diagnostic.message}`
}
