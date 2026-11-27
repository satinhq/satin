interface SyncHandle {
  write(bytes: Uint8Array, options: { at: number }): number
  flush(): void
  close(): void
}

const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent) => void
  postMessage(message: unknown): void
}
let access: SyncHandle | undefined
let offset = 0

scope.onmessage = async event => {
  try {
    const message = event.data
    if (message.kind === 'open') {
      const path = message.path as string[]
      let directory = await navigator.storage.getDirectory()
      for (const segment of path.slice(0, -1))
        directory = await directory.getDirectoryHandle(segment)
      const handle = (await directory.getFileHandle(
        path[path.length - 1],
      )) as FileSystemFileHandle & {
        createSyncAccessHandle?: () => Promise<SyncHandle>
      }
      if (!handle.createSyncAccessHandle) {
        scope.postMessage({ unsupported: true })
        return
      }
      access = await handle.createSyncAccessHandle()
    } else if (message.kind === 'write') {
      if (!access) throw new DOMException('File writer is closed', 'InvalidStateError')
      const bytes = message.bytes as Uint8Array
      let written = 0
      while (written < bytes.byteLength) {
        const count = access.write(bytes.subarray(written), { at: offset })
        if (count <= 0) throw new Error('File write made no progress')
        written += count
        offset += count
      }
    } else if (message.kind === 'close') {
      access?.flush()
      access?.close()
      access = undefined
    }
    scope.postMessage({ ok: true })
  } catch (error) {
    try {
      access?.close()
    } catch {
      // A close failure must not hide the write error or strand its caller.
    }
    access = undefined
    const failure = error as Error
    scope.postMessage({ error: { name: failure.name, message: failure.message } })
  }
}

export {}
