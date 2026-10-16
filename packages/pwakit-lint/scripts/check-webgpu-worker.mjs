import { readFile } from 'node:fs/promises'
import { resolve, dirname, extname } from 'node:path'
import { syntax as ts, parseSourceFile } from '../src/native-typescript.mjs'
// Follow runtime edges, including re-exports and dynamic imports. ImportType
// nodes and mixed `type` specifiers are erased and must not enter this graph.
const seen = new Set()
async function visit(path) {
  path = resolve(path)
  if (seen.has(path) || extname(path) === '.json') return
  seen.add(path)
  const source = await readFile(path, 'utf8')
  const ast = parseSourceFile(path, source).file
  const edges = []
  const property = node =>
    ts.isPropertyAccessExpression(node)
      ? node.name.text
      : ts.isElementAccessExpression(node) &&
          node.argumentExpression &&
          ts.isStringLiteral(node.argumentExpression)
        ? node.argumentExpression.text
        : undefined
  function inspect(node) {
    if (ts.isTypeNode(node)) return
    if (
      ts.isCallExpression(node) &&
      ['setTimeout', 'setInterval'].includes(node.expression.getText(ast)) &&
      node.arguments[0]?.getText(ast) === 'tick'
    )
      throw Error(`${path}: glass tick must use the capped page frame clock, never a timer`)

    const renderFunction =
      ts.isFunctionDeclaration(node) && node.name?.text === 'render'
        ? node
        : ts.isVariableDeclaration(node) &&
            ts.isIdentifier(node.name) &&
            node.name.text === 'render' &&
            node.initializer &&
            (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
          ? node.initializer
          : undefined
    if (renderFunction?.body) {
      const body = renderFunction.body
      const guard = ts.isBlock(body) ? body.statements[0] : undefined
      if (
        !guard ||
        !ts.isIfStatement(guard) ||
        !ts.isBinaryExpression(guard.expression) ||
        guard.expression.operatorToken.kind !== ts.SyntaxKind.BarBarToken ||
        guard.expression.left.getText(ast) !== '!visible' ||
        guard.expression.right.getText(ast) !== '!submissionAllowed()' ||
        !ts.isReturnStatement(guard.thenStatement) ||
        guard.thenStatement.expression
      ) {
        throw Error(
          `${path}: render must reject hidden frames and closed submission gates before GPU work`,
        )
      }
    }
    if (
      ts.isCaseClause(node) &&
      ts.isStringLiteral(node.expression) &&
      node.expression.text === 'init'
    ) {
      const guard = node.statements[0]
      const rejects = (expression, value) =>
        ts.isBinaryExpression(expression) &&
        expression.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken &&
        ts.isPropertyAccessExpression(expression.left) &&
        ts.isIdentifier(expression.left.expression) &&
        expression.left.expression.text === 'request' &&
        expression.left.name.text === 'appearance' &&
        ts.isStringLiteral(expression.right) &&
        expression.right.text === value
      const condition = guard && ts.isIfStatement(guard) ? guard.expression : undefined
      if (
        !condition ||
        !ts.isBinaryExpression(condition) ||
        condition.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken ||
        !rejects(condition.left, 'light') ||
        !rejects(condition.right, 'dark') ||
        !ts.isThrowStatement(guard.thenStatement)
      )
        throw Error(`${path}: WebGPU init must reject unknown appearance before drawing`)
    }
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause
      const bindings = clause?.namedBindings
      const erased =
        clause?.isTypeOnly ||
        (!clause?.name &&
          bindings &&
          ts.isNamedImports(bindings) &&
          bindings.elements.length > 0 &&
          bindings.elements.every(e => e.isTypeOnly))
      if (!erased) edges.push(node.moduleSpecifier.text)
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && !node.isTypeOnly) {
      const clause = node.exportClause
      if (!clause || !ts.isNamedExports(clause) || !clause.elements.every(e => e.isTypeOnly))
        edges.push(node.moduleSpecifier.text)
    }
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      if (
        (ts.isIdentifier(node.expression) &&
          ['window', 'document'].includes(node.expression.text)) ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === 'globalThis' &&
          ['window', 'document'].includes(property(node)))
      )
        throw Error(`${path}: DOM access in glass worker`)
    }
    if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        if (!ts.isStringLiteral(node.arguments[0]))
          throw Error(`${path}: nonliteral dynamic worker dependency`)
        edges.push(node.arguments[0].text)
      }
      const name = property(node.expression)
      if (name === 'requestDevice' && !path.endsWith('/webgpu/layers.ts'))
        throw Error(`${path}: only LayerDevice may request a GPU device`)
      if (name === 'createTexture' && !path.endsWith('/webgpu/frameGraph.ts'))
        throw Error(`${path}: only FrameGraph may allocate glass textures`)
      if (
        name === 'getContext' &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0]) &&
        node.arguments[0].text.startsWith('webgl')
      )
        throw Error(`${path}: WebGL context in WebGPU worker`)
    }
    ts.forEachChild(node, inspect)
  }
  inspect(ast)
  for (const specifier of edges) {
    if (specifier === 'pixi.js' || specifier.startsWith('pixi.js/'))
      throw Error(`${path}: Pixi dependency in WebGPU worker`)
    if (specifier.startsWith('.')) await visit(resolve(dirname(path), specifier))
    else throw Error(`${path}: external runtime worker dependency ${specifier}`)
  }
}
await visit(process.argv[2] ?? 'src/glass/webgpu/entry.worker.ts')
console.log(
  `WebGPU worker ownership: ${seen.size} modules checked; no Pixi/DOM, one device owner, one texture graph.`,
)
