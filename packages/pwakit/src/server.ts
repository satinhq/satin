import type { IncomingMessage, ServerResponse } from 'node:http'
import { constants } from 'node:fs'
import { open, realpath, stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { mediaTypes } from './app/mediaTypes.ts'

const mime: Readonly<Record<string, string>> = {
  ...mediaTypes,
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
}

// RFC 9110 §14: ignore unsupported/malformed/multiple ranges; 416 only for
// a valid unsatisfiable single range. BigInt prevents decimal overflow.
function singleRange(header: string | undefined, size: number) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header?.trim() ?? '')
  if (!match || (!match[1] && !match[2]) || !size) return undefined
  const length = BigInt(size)
  const first = match[1] ? BigInt(match[1]) : undefined
  const last = match[2] ? BigInt(match[2]) : undefined
  if (first !== undefined && last !== undefined && last < first) return undefined
  if (first === undefined) {
    if (last === 0n) return null
    return { start: Number(last! >= length ? 0n : length - last!), end: size - 1 }
  }
  if (first >= length) return null
  return {
    start: Number(first),
    end: Number(last === undefined || last >= length ? length - 1n : last),
  }
}

/** Node static adapter. Stream GET/HEAD with single byte ranges, no cache or
 * compression. A fallback is used only for missing extensionless routes.
 * Other methods are left to the caller. Root and every file must resolve
 * inside the same real directory, including symlink targets.
 */
export async function serveStaticFile(
  request: IncomingMessage,
  response: ServerResponse,
  root: string,
  fallback?: string,
): Promise<void> {
  const end = (status: number) => {
    response.writeHead(status, { 'content-length': '0' }).end()
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD')
    end(405)
    return
  }
  let handle: Awaited<ReturnType<typeof open>> | undefined
  try {
    const directory = await realpath(root)
    const inside = (path: string) => path === directory || path.startsWith(directory + sep)
    let pathname: string
    try {
      pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)
    } catch {
      end(400)
      return
    }
    if (pathname.includes('\0') || pathname.includes('\\')) {
      end(400)
      return
    }
    let file = resolve(directory, '.' + pathname)
    if (!inside(file)) {
      end(403)
      return
    }
    try {
      if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      if (!fallback || extname(file)) {
        end(404)
        return
      }
      file = resolve(directory, fallback)
    }
    file = await realpath(file)
    if (!inside(file)) {
      end(403)
      return
    }
    // Do not block opening a FIFO, or follow a last-moment leaf symlink.
    handle = await open(file, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW)
    const info = await handle.stat()
    if (!info.isFile()) {
      end(404)
      return
    }
    if (!Number.isSafeInteger(info.size)) {
      end(500)
      return
    }
    // No validators are emitted; If-Range therefore cannot match strongly.
    // HEAD must ignore Range entirely (RFC 9110 §14.2).
    const range =
      request.method === 'GET' && !request.headers['if-range']
        ? singleRange(request.headers.range, info.size)
        : undefined
    response.setHeader(
      'Content-Type',
      mime[extname(file).toLowerCase()] ?? 'application/octet-stream',
    )
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('Accept-Ranges', 'bytes')
    if (range === null) {
      response.setHeader('Content-Range', `bytes */${info.size}`)
      end(416)
      return
    }
    const length = range ? range.end - range.start + 1 : info.size
    response.setHeader('Content-Length', length)
    if (range) response.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${info.size}`)
    response.writeHead(range ? 206 : 200)
    if (request.method === 'HEAD' || !length) {
      response.end()
      return
    }
    await pipeline(handle.createReadStream({ ...range, autoClose: false }), response)
  } catch (error) {
    if (response.headersSent) response.destroy(error instanceof Error ? error : undefined)
    else
      end(['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '') ? 404 : 500)
  } finally {
    await handle?.close()
  }
}
