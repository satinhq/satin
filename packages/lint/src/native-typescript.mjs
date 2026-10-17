// The pinned TS 7 native API owns parsing. Decoded ASTs remain usable after the
// snapshot/server closes; no compiler process or snapshot escapes this helper.
import * as ast from 'typescript/unstable/ast'
import { API } from 'typescript/unstable/sync'
import { createVirtualFileSystem } from 'typescript/unstable/fs'
import { basename } from 'node:path'

export const syntax = {
  ...ast,
  forEachChild: (node, visitor) => node.forEachChild(visitor),
  isTypeAssertionExpression: ast.isTypeAssertion,
  isParameter: ast.isParameterDeclaration,
  isStringLiteralLike: node =>
    ast.isStringLiteral(node) || ast.isNoSubstitutionTemplateLiteral(node),
  isFunctionLike: node =>
    [
      ast.SyntaxKind.FunctionDeclaration,
      ast.SyntaxKind.FunctionExpression,
      ast.SyntaxKind.ArrowFunction,
      ast.SyntaxKind.MethodDeclaration,
      ast.SyntaxKind.GetAccessor,
      ast.SyntaxKind.SetAccessor,
      ast.SyntaxKind.Constructor,
    ].includes(node.kind),
}

export function parseSourceFile(fileName, source) {
  const path = `/satin-syntax/${basename(fileName)}`
  const config = '/satin-syntax/tsconfig.json'
  const api = new API({
    cwd: '/satin-syntax',
    fs: createVirtualFileSystem({
      [config]: JSON.stringify({
        compilerOptions: {
          noLib: true,
          noResolve: true,
          allowJs: true,
          jsx: 'preserve',
          target: 'esnext',
        },
        files: [path],
      }),
      [path]: source,
    }),
  })
  let snapshot
  try {
    snapshot = api.updateSnapshot({ openProjects: [config] })
    const program = snapshot.getProject(config).program
    const file = program.getSourceFile(path)
    if (!file) throw new Error(`TS 7 could not parse ${fileName}`)
    // Preserve the caller's diagnostic identity, independent of the virtual path.
    Object.defineProperty(file, 'fileName', { value: fileName })
    return { file, diagnostics: program.getSyntacticDiagnostics(path) }
  } finally {
    snapshot?.dispose()
    api.close()
  }
}
