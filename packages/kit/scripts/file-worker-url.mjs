export function rewriteFileWorker(source) {
  if (!source.includes('./file-writer.worker.ts'))
    throw new Error('File worker URL rewrite literal is missing')
  return source.replace('./file-writer.worker.ts', './file-writer.worker.js')
}
