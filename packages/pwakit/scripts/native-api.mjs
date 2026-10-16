// Keep native compiler lifetime explicit. This is the pinned TS 7 snapshot API,
// not a JavaScript compiler fallback. A virtual config avoids mutable disk files.
import { API } from 'typescript/unstable/sync'
import { createScanner, SyntaxKind, getLeadingCommentRanges } from 'typescript/unstable/ast'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

export function openDeclarationProject(entryPath, { files, replace } = {}) {
  entryPath = resolve(entryPath)
  const config = resolve(dirname(entryPath), '.satin-api.tsconfig.json')
  const configText = JSON.stringify({
    compilerOptions: {
      target: 'esnext',
      module: 'esnext',
      moduleResolution: 'bundler',
      skipLibCheck: true,
    },
    files: [entryPath],
  })
  const api = new API({
    cwd: dirname(entryPath),
    fs: {
      fileExists: path => (path === config ? true : files ? path in files : undefined),
      directoryExists: path =>
        files ? Object.keys(files).some(file => file.startsWith(path + '/')) : undefined,
      readFile: path =>
        path === config
          ? configText
          : files
            ? (files[path] ?? null)
            : replace
              ? replace(readFileSync(path, 'utf8'), path)
              : undefined,
    },
  })
  let snapshot
  try {
    snapshot = api.updateSnapshot({ openProjects: [config] })
    const project = snapshot.getProject(config)
    if (!project?.program.getSourceFile(entryPath))
      throw new Error(`Missing declaration entry: ${entryPath}`)
    return {
      program: project.program,
      checker: project.checker,
      emitter: project.emitter,
      close() {
        snapshot.dispose()
        api.close()
      },
    }
  } catch (error) {
    snapshot?.dispose()
    api.close()
    throw error
  }
}

// The native emitter currently omits comments. Reattach them by scanner token
// identity, so nested documentation stays in the report without regex parsing.
export function printDeclaration(emitter, node) {
  const printed = emitter.printNode(node)
  const file = node.getSourceFile()
  const leading = (getLeadingCommentRanges(file.text, node.pos) ?? [])
    .map(range => {
      const indent = file.text.slice(file.text.lastIndexOf('\n', range.pos - 1) + 1, range.pos)
      return file.text
        .slice(range.pos, range.end)
        .split('\n')
        .map((line, i) =>
          i && indent.trim() === '' && line.startsWith(indent) ? line.slice(indent.length) : line,
        )
        .join('\n')
    })
    .join('\n')
  const source = node.getText()
  const scan = text => {
    const scanner = createScanner(false, undefined, text)
    const tokens = []
    const comments = []
    for (let kind = scanner.scan(); kind !== SyntaxKind.EndOfFile; kind = scanner.scan()) {
      if ([SyntaxKind.WhitespaceTrivia, SyntaxKind.NewLineTrivia].includes(kind)) continue
      const token = { kind, text: scanner.getTokenText(), start: scanner.getTokenStart() }
      if ([SyntaxKind.SingleLineCommentTrivia, SyntaxKind.MultiLineCommentTrivia].includes(kind))
        comments.push({ ...token, index: tokens.length })
      else tokens.push(token)
    }
    return { tokens, comments }
  }
  const original = scan(source)
  const output = scan(printed)
  if (original.comments.length) {
    if (
      original.tokens.length !== output.tokens.length ||
      original.tokens.some(
        (token, i) => token.kind !== output.tokens[i].kind || token.text !== output.tokens[i].text,
      )
    )
      throw new Error(`Native declaration token drift while preserving comments: ${file.fileName}`)
  }
  let result = printed
  for (const comment of original.comments.toReversed()) {
    if (
      output.comments.some(
        existing => existing.index === comment.index && existing.text === comment.text,
      )
    )
      continue
    const offset = output.tokens[comment.index]?.start ?? printed.length
    const line = printed.slice(printed.lastIndexOf('\n', offset - 1) + 1, offset)
    const indent = /^\s*$/.test(line) ? line : ''
    const originalLine = source.slice(
      source.lastIndexOf('\n', comment.start - 1) + 1,
      comment.start,
    )
    const dedented = comment.text
      .split('\n')
      .map((line, i) =>
        i && originalLine.trim() === '' && line.startsWith(originalLine)
          ? line.slice(originalLine.length)
          : line,
      )
    result =
      result.slice(0, offset) + dedented.join('\n' + indent) + '\n' + indent + result.slice(offset)
  }
  return (leading ? leading + '\n' : '') + result
}
