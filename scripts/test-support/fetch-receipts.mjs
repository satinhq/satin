// Server observations only. Clients sharing an address and UA share a receipt;
// cached launches with no network fetch cannot be observed here.
import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export function createFetchReceipts({
  port,
  dist,
  file,
  maxClients = 32,
  onError = console.error,
}) {
  const clients = new Map()
  const serverStartedAt = new Date().toISOString()
  try {
    if (statSync(file).size > 256 * 1024) throw Error('receipt file exceeds 256 KiB')
    const previous = JSON.parse(readFileSync(file, 'utf8'))
    if (previous.format === 1 && previous.port === port && Array.isArray(previous.clients))
      for (const client of previous.clients.slice(-maxClients))
        if (typeof client.clientId === 'string' && typeof client.userAgent === 'string')
          clients.set(client.clientId, client)
  } catch (error) {
    if (error.code !== 'ENOENT') onError('fetch receipts:', error.message)
  }
  let pending = Promise.resolve()
  function record(request, response) {
    if (request.method !== 'GET') return
    response.once('finish', () => {
      if (response.statusCode !== 200) return
      const url = new URL(request.url ?? '/', 'http://localhost')
      const destination = request.headers['sec-fetch-dest']
      const type = String(response.getHeader('content-type') ?? '')
      const kind =
        destination === 'serviceworker' || /(?:^|\/)sw\.js$/.test(url.pathname)
          ? 'serviceWorker'
          : ['worker', 'sharedworker'].includes(destination) ||
              /(?:^|[-.])worker[-.].*\.js$/.test(url.pathname)
            ? 'worker'
            : type.startsWith('text/html')
              ? 'entry'
              : undefined
      if (!kind) return
      const address = request.socket.remoteAddress ?? 'unavailable'
      const userAgent = String(request.headers['user-agent'] ?? 'unavailable').slice(0, 512)
      const clientId = createHash('sha256')
        .update(address + '\0' + userAgent)
        .digest('hex')
        .slice(0, 16)
      const client = clients.get(clientId) ?? { clientId, address, userAgent }
      client[kind] = {
        url: url.pathname.slice(0, 512),
        fetchedAt: new Date().toISOString(),
        dist,
        serverStartedAt,
      }
      clients.delete(clientId)
      clients.set(clientId, client)
      while (clients.size > maxClients) clients.delete(clients.keys().next().value)
      const data =
        JSON.stringify(
          {
            format: 1,
            port,
            dist,
            updatedAt: new Date().toISOString(),
            clients: [...clients.values()],
          },
          null,
          2,
        ) + '\n'
      pending = pending
        .then(async () => {
          await mkdir(dirname(file), { recursive: true })
          const temporary = `${file}.${process.pid}.tmp`
          await writeFile(temporary, data)
          await rename(temporary, file)
        })
        .catch(error => onError('fetch receipts:', error.message))
    })
  }
  return { record, flush: () => pending }
}
