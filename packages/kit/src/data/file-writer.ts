const chunkSize = 1024 * 1024

interface Sink {
  write(bytes: Uint8Array): Promise<void>
  close(): Promise<void>
  abort(): Promise<void>
}

async function workerSink(path: string[]): Promise<Sink | undefined> {
  if (typeof Worker === 'undefined') return undefined
  let worker: Worker
  try {
    worker = new Worker(new URL('./file-writer.worker.ts', import.meta.url), { type: 'module' })
  } catch {
    return undefined
  }
  let rejectPending: ((error: Error) => void) | undefined
  const request = (message: unknown, transfer: Transferable[] = []) =>
    new Promise<{ unsupported?: boolean }>((resolve, reject) => {
      rejectPending = reject
      worker.onmessage = event => {
        const result = event.data
        if (result.error) reject(new DOMException(result.error.message, result.error.name))
        else resolve(result)
      }
      worker.onerror = event => reject(new Error(event.message || 'File worker failed'))
      worker.onmessageerror = () => reject(new Error('File worker message failed'))
      worker.postMessage(message, transfer)
    })
  try {
    if ((await request({ kind: 'open', path })).unsupported) {
      worker.terminate()
      return undefined
    }
  } catch {
    worker.terminate()
    // No input was consumed, so every worker-open failure can use the existing main-thread handle.
    return undefined
  }
  return {
    write: async bytes => {
      await request({ kind: 'write', bytes }, [bytes.buffer as ArrayBuffer])
    },
    close: async () => {
      try {
        await request({ kind: 'close' })
      } finally {
        worker.terminate()
      }
    },
    abort: async () => {
      rejectPending?.(new DOMException('File write aborted', 'AbortError'))
      worker.terminate()
    },
  }
}

async function openSink(handle: FileSystemFileHandle, path: string[]): Promise<Sink> {
  const worker = await workerSink(path)
  if (worker) return worker
  if (!handle.createWritable)
    throw new DOMException('Private file writes are unavailable', 'NotSupportedError')
  const writable = await handle.createWritable()
  return {
    write: async bytes => {
      await writable.write(bytes as Uint8Array<ArrayBuffer>)
    },
    close: () => writable.close(),
    abort: () => writable.abort(),
  }
}

/** Stage bytes before publishing metadata. Never retry a consumed stream after a backend failure. */
export async function writeFilePayload(
  handle: FileSystemFileHandle,
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
  path: string[] = [],
): Promise<number> {
  signal?.throwIfAborted()
  const sink = await openSink(handle, path)
  const reader = stream.getReader()
  let aborted = false
  const abort = () => {
    aborted = true
    void reader.cancel(signal?.reason).catch(() => {})
    void sink.abort().catch(() => {})
  }
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) abort()
  let size = 0
  try {
    while (true) {
      signal?.throwIfAborted()
      const next = await reader.read()
      signal?.throwIfAborted()
      if (next.done) break
      if (!(next.value instanceof Uint8Array)) throw new TypeError('Expected a byte stream')
      for (let start = 0; start < next.value.byteLength; start += chunkSize) {
        signal?.throwIfAborted()
        await sink.write(next.value.slice(start, start + chunkSize))
      }
      size += next.value.byteLength
      if (!Number.isSafeInteger(size)) throw new RangeError('File is too large')
    }
    await sink.close()
    signal?.throwIfAborted()
    return size
  } catch (error) {
    await reader.cancel(error).catch(() => {})
    await sink.abort().catch(() => {})
    if (aborted) signal?.throwIfAborted()
    throw error
  } finally {
    signal?.removeEventListener('abort', abort)
    reader.releaseLock()
  }
}
