import { mediaTypes } from './mediaTypes.ts'
import type { DeploymentFailure } from './deployment.ts'

/** CLI full-deployment check; not embedded into the lightweight install page. */
export async function checkMediaDeployment(
  inventory: Record<string, unknown>,
  entries: readonly { url: string; bytes?: number }[],
  pageUrl: string,
  timeoutMs: number,
  base: string,
) {
  const page = new URL(pageUrl)
  const mime = (url: string) =>
    mediaTypes['.' + new URL(url, page).pathname.split('.').at(-1)!.toLowerCase()]
  const entry = entries.find(entry => mime(entry.url))
  let probe = inventory.mediaProbe as
    { url: string; bytes: number; prefix: string; type: string } | null | undefined
  const failures: DeploymentFailure[] = []
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let url = page.href
  // Bound retained bytes, cancel ignored-range bodies without downloading them.
  const prefix = async (response: Response, exact: boolean) => {
    const reader = response.body?.getReader()
    if (!reader) throw new Error('missing range body')
    const bytes: number[] = []
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (exact && bytes.length + value.length > 2)
          throw new Error('range body exceeds two bytes')
        bytes.push(...value.subarray(0, 2 - bytes.length))
        if (!exact && bytes.length === 2) break
      }
    } finally {
      await reader.cancel()
      reader.releaseLock()
    }
    if (bytes.length !== 2) throw new Error('media probe needs two bytes')
    return bytes.map(value => value.toString(16).padStart(2, '0')).join('')
  }
  const request = (url: string, range = false) =>
    fetch(url, {
      headers: { 'Accept-Encoding': 'identity', ...(range ? { Range: 'bytes=0-1' } : {}) },
      signal: controller.signal,
      cache: 'no-store',
      redirect: 'manual',
    })
  try {
    // Legacy precache metadata lacks a prefix. Read two ordinary GET bytes,
    // then compare the range response; the existing precache check verifies the full asset.
    if (probe === undefined && entry) {
      url = new URL(entry.url, page).href
      const response = await request(url)
      try {
        if (response.status !== 200 || (response.url && response.url !== url))
          throw new Error('invalid legacy media response')
        const length = entry.bytes ?? Number(response.headers.get('content-length'))
        probe = {
          url: entry.url,
          bytes: length,
          prefix: await prefix(response, false),
          type: mime(entry.url)!,
        }
      } finally {
        await response.body?.cancel().catch(() => {})
      }
    }
    if (probe == null) return { applicable: false, failures }
    const target = new URL(probe.url, page)
    // The inventory is deployment data, never authority to request another origin.
    if (
      typeof probe.url !== 'string' ||
      !probe.url.startsWith(base) ||
      !target.pathname.startsWith(base) ||
      target.origin !== page.origin ||
      target.search ||
      target.hash ||
      target.username ||
      target.password ||
      !Number.isSafeInteger(probe.bytes) ||
      probe.bytes < 2 ||
      !/^[a-f0-9]{4}$/.test(probe.prefix) ||
      mime(probe.url) !== probe.type
    )
      throw new Error('invalid media probe metadata')
    url = target.href
    const response = await request(url, true)
    try {
      if (response.status !== 206)
        throw new Error(`expected HTTP 206, received HTTP ${response.status}`)
      if (response.url && response.url !== url) throw new Error('unexpected final URL')
      const type = (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
      const encoding = response.headers.get('content-encoding')
      if (
        response.headers.get('content-range') !== `bytes 0-1/${probe.bytes}` ||
        response.headers.get('content-length') !== '2' ||
        type !== probe.type ||
        (encoding && encoding !== 'identity')
      )
        throw new Error('incorrect range, length, MIME or encoding headers')
      if ((await prefix(response, true)) !== probe.prefix)
        throw new Error('range body differs from the built probe bytes')
    } finally {
      await response.body?.cancel().catch(() => {})
    }
  } catch (error) {
    const reason = controller.signal.aborted
      ? 'request timed out'
      : error instanceof Error
        ? error.message
        : String(error)
    failures.push({
      reason: `Media byte-range check failed: ${reason}`,
      url,
      check: 'Media transport',
      status: reason,
      transient: controller.signal.aborted,
      fix: 'Serve this media file with single byte ranges and its audio/video MIME type. Rebuild if its bytes changed.',
    })
  } finally {
    clearTimeout(timer)
  }
  return { applicable: true, failures }
}
