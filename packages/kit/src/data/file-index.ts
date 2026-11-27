import type { FileMetadata } from './file-store.ts'
export const internalDatabasePrefix = '__satin_internal__:'
export interface StoredFile {
  id: string
  metadata: FileMetadata
  payload: string
}
export interface FileContext {
  directory: FileSystemDirectoryHandle
  database: IDBDatabase
  path: string[]
}
export function request<T>(operation: IDBRequest<T>, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      signal?.removeEventListener('abort', abort)
      try {
        const source = operation.source
        const transaction =
          source &&
          ('transaction' in source
            ? source.transaction
            : 'objectStore' in source
              ? source.objectStore.transaction
              : undefined)
        transaction?.abort()
      } catch {
        /* A completed request has no remaining transaction to cancel. */
      }
      reject(signal?.reason ?? new DOMException('Read aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', abort, { once: true })
    operation.onsuccess = () => {
      signal?.removeEventListener('abort', abort)
      resolve(operation.result)
    }
    operation.onerror = () => {
      signal?.removeEventListener('abort', abort)
      reject(operation.error ?? new Error('File index request failed'))
    }
    if (signal?.aborted) abort()
  })
}
const blockedIndexes = new Map<string, Error>()
export function openIndex(name: string): Promise<IDBDatabase> {
  if (blockedIndexes.has(name)) return Promise.reject(blockedIndexes.get(name))
  return new Promise((resolve, reject) => {
    const operation = indexedDB.open(`${internalDatabasePrefix}files:${name}`, 2)
    let refused = false
    operation.onblocked = () => {
      refused = true
      const error = new DOMException(
        'Another window is blocking the file index upgrade',
        'InvalidStateError',
      )
      blockedIndexes.set(name, error)
      reject(error)
    }
    operation.onupgradeneeded = event => {
      const database = operation.result
      if (refused) {
        operation.transaction?.abort()
        return
      }
      if (event.oldVersion < 1 && !database.objectStoreNames.contains('files'))
        database.createObjectStore('files', { keyPath: 'id' })
      if (event.oldVersion < 2 && !database.objectStoreNames.contains('settings'))
        database.createObjectStore('settings')
    }
    operation.onerror = () => {
      blockedIndexes.delete(name)
      reject(operation.error ?? new Error('File index open failed'))
    }
    operation.onsuccess = () => {
      blockedIndexes.delete(name)
      const database = operation.result
      database.onversionchange = () => database.close()
      if (refused) database.close()
      else resolve(database)
    }
  })
}
export async function rows(context: FileContext, signal?: AbortSignal): Promise<StoredFile[]> {
  return request(context.database.transaction('files').objectStore('files').getAll(), signal)
}
export function commit(
  context: FileContext,
  action: (files: IDBObjectStore, settings: IDBObjectStore) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let transaction: IDBTransaction
    try {
      transaction = context.database.transaction(['files', 'settings'], 'readwrite', {
        durability: 'strict',
      })
    } catch (error) {
      if (!(error instanceof TypeError) && (error as Error).name !== 'NotSupportedError') {
        reject(error)
        return
      }
      transaction = context.database.transaction(['files', 'settings'], 'readwrite')
    }
    let failure: unknown
    transaction.oncomplete = () => resolve()
    transaction.onerror = event => {
      failure ??= (event.target as IDBRequest)?.error ?? transaction.error
    }
    transaction.onabort = () =>
      reject(transaction.error ?? failure ?? new Error('File index commit aborted'))
    try {
      action(transaction.objectStore('files'), transaction.objectStore('settings'))
    } catch (error) {
      failure = error
      transaction.abort()
    }
  })
}
