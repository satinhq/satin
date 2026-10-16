// Static server for a built Satin app (the gate fixture or a Preview build): SPA fallback to
// app/index.html, no caching, 127.0.0.1 only. usage: node scripts/test-support/serve.mjs DIST PORT
// SATIN_TRACE_DIR=<dir>: a POST to /__trace/upload (scripts/test-support/recorder.js, optionally
// gzip with x-trace-encoding: gzip) is saved there as one JSON file per request. Every other POST
// is still accepted and discarded.
import { createFetchReceipts } from './fetch-receipts.mjs'
import { validateCatalystPort } from './measurement-guards.mjs'
import { createServer } from 'node:http'
import { appendFile, mkdir, writeFile } from 'node:fs/promises'
import { serveStaticFile } from '../../packages/pwakit/src/server.ts'
import { join, resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'

const [dist, port] = [resolve(process.argv[2]), Number(process.argv[3] ?? 5530)]
validateCatalystPort(port) // reject protected Preview ports before creating a listener
const appIndex = existsSync(join(dist, 'app/index.html')) ? 'app/index.html' : 'index.html'
const traceDir = process.env.SATIN_TRACE_DIR ? resolve(process.env.SATIN_TRACE_DIR) : undefined
const traceOrigins = new Set((process.env.SATIN_TRACE_ORIGINS ?? '').split(',').filter(Boolean))
const TRACE_LIMIT_BYTES = 32 * 1024 * 1024
let traceSequence = 0
const fetchReceipts = process.env.SATIN_FETCH_RECEIPTS
  ? createFetchReceipts({ port, dist, file: resolve(process.env.SATIN_FETCH_RECEIPTS) })
  : undefined

async function saveTrace(request, response) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > TRACE_LIMIT_BYTES) throw Error('trace too large')
    chunks.push(chunk)
  }
  let body = Buffer.concat(chunks)
  if (request.headers['x-trace-encoding'] === 'gzip')
    body = gunzipSync(body, { maxOutputLength: TRACE_LIMIT_BYTES })
  const trace = JSON.parse(body.toString('utf8'))
  await mkdir(traceDir, { recursive: true })
  const stamp = new Date().toISOString().replaceAll(':', '-')
  traceSequence += 1
  const name = `${stamp}-${String(traceSequence).padStart(3, '0')}-${String(trace.kind ?? 'trace').replace(/[^a-z0-9-]/gi, '_')}.json`
  await writeFile(join(traceDir, name), JSON.stringify(trace))
  console.log(JSON.stringify({ saved: name, bytes: body.length }))
  response
    .writeHead(200, { 'content-type': 'application/json' })
    .end(JSON.stringify({ saved: name }))
}

createServer(async (request, response) => {
  fetchReceipts?.record(request, response)
  const started = performance.now(),
    at = Date.now()
  let bytes = null,
    readMs = null
  if (process.env.SATIN_PERF_RESOURCE_LOG)
    response.once('finish', () => {
      void appendFile(
        process.env.SATIN_PERF_RESOURCE_LOG,
        JSON.stringify({
          at,
          path: new URL(request.url ?? '/', 'http://localhost').pathname,
          status: response.statusCode,
          bytes,
          readMs,
          responseMs: performance.now() - started,
        }) + '\n',
      ).catch(error => console.error('resource log:', error.message))
    })
  try {
    const url = new URL(request.url ?? '/', 'http://localhost')
    if (
      traceDir &&
      url.pathname === '/__trace/upload' &&
      traceOrigins.has(request.headers.origin)
    ) {
      response.setHeader('Access-Control-Allow-Origin', request.headers.origin)
      response.setHeader('Vary', 'Origin')
      response.setHeader('Access-Control-Allow-Headers', 'content-type,x-trace-encoding')
      response.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
      if (request.method === 'OPTIONS') {
        response.writeHead(204).end()
        return
      }
    }
    if (request.method === 'POST' && traceDir && url.pathname === '/__trace/upload') {
      await saveTrace(request, response)
      return
    }
    if (request.method === 'POST') {
      request.resume()
      response.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}')
      return
    }
    await serveStaticFile(request, response, dist, appIndex)
    bytes = Number(response.getHeader('content-length') ?? 0)
    readMs = null // Streaming no longer has a whole-file read phase.
  } catch (error) {
    response.writeHead(500).end(String(error))
  }
}).listen(port, '127.0.0.1', () => console.log(`serving ${dist} on 127.0.0.1:${port}`))
