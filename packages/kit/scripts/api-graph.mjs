import { SymbolFlags } from 'typescript/unstable/sync'
import { isIdentifier } from 'typescript/unstable/ast'
import { printDeclaration } from './native-api.mjs'
import { relative, dirname } from 'node:path'
/** Conservative closure over signature declarations, including heritage and utility-type arguments.
 * Dependency packages and TypeScript's libs are referenced by name, not vendored into the report.
 */
export function publicDeclarationGraph({ program, checker, emitter }, entryPath) {
  const entry = program.getSourceFile(entryPath)
  if (!entry) throw new Error(`Missing declaration entry: ${entryPath}`)
  const seen = new Set()
  const declarations = new Map()
  const visitSymbol = original => {
    const symbol =
      original.flags & SymbolFlags.Alias ? checker.getAliasedSymbol(original) : original
    if (seen.has(symbol)) return
    seen.add(symbol)
    for (const handle of symbol.declarations ?? []) {
      const node = handle.resolve()
      if (!node) throw new Error(`Unresolved declaration: ${symbol.name}`)
      const file = node.getSourceFile()
      if (
        !file.isDeclarationFile ||
        program.isSourceFileDefaultLibrary(file) ||
        program.isSourceFileFromExternalLibrary(file)
      )
        continue
      // Declaration names lead back here; type references lead to their definitions.
      const key = `${relative(dirname(entryPath), file.fileName).replaceAll('\\', '/')}#${node.pos}:${node.end}`
      declarations.set(key, {
        path: relative(dirname(entryPath), file.fileName).replaceAll('\\', '/'),
        name: symbol.name,
        text: printDeclaration(emitter, node),
      })
      const visit = child => {
        if (isIdentifier(child)) {
          const target = checker.getSymbolAtLocation(child)
          if (target) visitSymbol(target)
        }
        child.forEachChild(visit)
      }
      node.forEachChild(visit)
    }
  }
  for (const symbol of checker.getExportsOfModule(checker.getSymbolAtLocation(entry)))
    visitSymbol(symbol)
  return [...declarations.values()]
    .sort((a, b) => `${a.path}:${a.name}:${a.text}`.localeCompare(`${b.path}:${b.name}:${b.text}`))
    .map(item => `// ${item.path} :: ${item.name}\n${item.text}`)
    .join('\n\n')
}
export function assertApiSnapshot(actual, expected) {
  if (actual !== expected)
    throw new Error('Public declaration graph changed; review and regenerate the API report')
}
