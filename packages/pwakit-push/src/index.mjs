export { param, notificationRoutes } from './schema.js'
import webpush from 'web-push'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createServer } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { encodePushRoute } from './routes.js'

export const generateVAPIDKeys = () => webpush.generateVAPIDKeys()
export function buildPayload(input, config) {
  if (
    typeof input.title !== 'string' ||
    !input.title.trim() ||
    input.title.length > 120 ||
    typeof input.body !== 'string' ||
    input.body.length > 1000
  )
    throw new Error('Invalid title or body')
  if (input.badge !== undefined && (!Number.isSafeInteger(input.badge) || input.badge < 0))
    throw new Error('Invalid badge')
  const payload = {
    satin_push: 1,
    routeURL: encodePushRoute(config.appURL, input.route, config.routes, randomUUID()),
    notification: { title: input.title, body: input.body, silent: false },
  }
  if (input.badge !== undefined) payload.app_badge = String(input.badge)
  if (Buffer.byteLength(JSON.stringify(payload)) > 3000) throw new Error('Payload too large')
  return payload
}
export function validateSubscription(value, publicKey) {
  if (!value || typeof value.endpoint !== 'string' || value.endpoint.length > 2048)
    throw new Error('Invalid subscription')
  const url = new URL(value.endpoint)
  // This kit has one target: Apple Home Screen Web Push. Never send to caller-chosen hosts.
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'web.push.apple.com' ||
    url.port ||
    url.username ||
    url.password ||
    url.hash ||
    !url.pathname.startsWith('/Q')
  )
    throw new Error('Invalid push service')
  for (const [key, length] of [
    ['p256dh', 65],
    ['auth', 16],
    ['applicationServerKey', 65],
  ]) {
    if (
      typeof value[key] !== 'string' ||
      !/^[A-Za-z0-9_-]+$/.test(value[key]) ||
      Buffer.from(value[key], 'base64url').length !== length
    )
      throw new Error('Invalid subscription key')
  }
  if (value.applicationServerKey !== publicKey) throw new Error('VAPID key mismatch')
  return {
    endpoint: value.endpoint,
    p256dh: value.p256dh,
    auth: value.auth,
    applicationServerKey: value.applicationServerKey,
  }
}
/** One relay process owns this file. Atomic rename plus a serialized mutation queue. */
export class FileSubscriptionStore {
  constructor(path) {
    this.path = path
    this.queue = Promise.resolve()
  }
  async read() {
    try {
      return JSON.parse(await readFile(this.path, 'utf8'))
    } catch (error) {
      if (error.code === 'ENOENT') return []
      throw error
    }
  }
  mutate(change) {
    const operation = this.queue.then(async () => {
      const records = await this.read()
      const result = change(records)
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 })
      const temporary = `${this.path}.${randomUUID()}.tmp`
      await writeFile(temporary, JSON.stringify(records), { mode: 0o600 })
      await rename(temporary, this.path)
      return result
    })
    this.queue = operation.catch(() => {})
    return operation
  }
  upsert(owner, subscription, replacesEndpoint) {
    return this.mutate(records => {
      if (
        records.some(
          record =>
            record.subscription.endpoint === subscription.endpoint && record.owner !== owner,
        )
      )
        throw new Error('Endpoint already belongs to another owner')
      if (
        records.some(
          record =>
            record.owner === owner &&
            record.subscription.endpoint === subscription.endpoint &&
            record.invalid,
        )
      )
        throw Object.assign(new Error('Subscription expired'), { statusCode: 409 })
      const replacement = { owner, subscription, revision: randomUUID() }
      const retained = records.filter(
        record =>
          !(
            record.owner === owner &&
            !record.invalid &&
            [subscription.endpoint, replacesEndpoint].includes(record.subscription.endpoint)
          ),
      )
      if (retained.filter(record => record.owner === owner && !record.invalid).length >= 10)
        throw new Error('Subscription limit reached')
      records.splice(0, records.length, ...retained, replacement)
      return { revision: replacement.revision }
    })
  }
  invalidate(owner, endpoint) {
    return this.mutate(records => {
      const record = records.find(
        record => record.owner === owner && record.subscription.endpoint === endpoint,
      )
      const tombstone = {
        owner,
        subscription: { endpoint, p256dh: '', auth: '', applicationServerKey: '' },
        revision: randomUUID(),
        invalid: true,
      }
      // A 410 can arrive after replacement removed the live record. Remember it anyway.
      if (record) Object.assign(record, tombstone)
      else records.push(tombstone)
    })
  }
  remove(owner, endpoint) {
    return this.mutate(records => {
      for (let i = records.length - 1; i >= 0; i--)
        if (
          records[i].owner === owner &&
          !records[i].invalid &&
          records[i].subscription.endpoint === endpoint
        )
          records.splice(i, 1)
    })
  }
}
// Deliberately classic: declarative fallback can navigate a live document.
// Neither Content-Type nor the JSON body may opt into declarative delivery.
export function createPushRequest(subscription, payload, options) {
  const request = webpush.generateRequestDetails(subscription, payload, options)
  request.headers['Content-Type'] = 'application/octet-stream'
  return request
}
export function sendWebPush(subscription, payload, options) {
  const details = createPushRequest(subscription, payload, options)
  return new Promise((resolve, reject) => {
    const request = httpsRequest(
      details.endpoint,
      { method: details.method, headers: details.headers, timeout: 10000 },
      response => {
        response.resume()
        response.on('error', reject)
        response.on('end', () => {
          if (response.statusCode >= 200 && response.statusCode < 300)
            resolve({ statusCode: response.statusCode })
          else
            reject(
              Object.assign(new Error('Push service rejected request'), {
                statusCode: response.statusCode,
              }),
            )
        })
      },
    )
    request.on('timeout', () => request.destroy(new Error('Push service timeout')))
    request.on('error', reject)
    request.end(details.body)
  })
}
export async function sendNotification(config, store, owner, input, transport = sendWebPush) {
  const payload = JSON.stringify(buildPayload(input, config))
  const records = (await store.read()).filter(record => record.owner === owner && !record.invalid)
  let accepted = 0,
    expired = 0,
    failed = 0
  for (const { subscription } of records) {
    validateSubscription(subscription, config.vapid.publicKey)
    try {
      await transport(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        payload,
        {
          vapidDetails: config.vapid,
          TTL: 3600,
          urgency: 'normal',
          timeout: 10000,
          headers: { 'Content-Type': 'application/octet-stream' },
        },
      )
      accepted++
    } catch (error) {
      if ([404, 410].includes(error.statusCode)) {
        await store.invalidate(owner, subscription.endpoint)
        expired++
      } else failed++
    }
  }
  return { accepted, expired, failed } // Acceptance is not display confirmation.
}
function equalToken(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false
  const a = Buffer.from(left),
    b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}
export function createPushRelay(config, store, transport) {
  if (new URL(config.appURL).hostname.endsWith('.invalid'))
    throw new Error('Configure the actual Preview appURL before starting the relay')
  if (
    !config.senderToken ||
    config.senderToken.length < 32 ||
    !config.clients?.length ||
    config.clients.some(
      client => !client.owner || client.token.length < 32 || client.token === config.senderToken,
    )
  )
    throw new Error('Distinct strong sender and client tokens required')
  buildPayload(config.testNotification, config)
  const testTimes = new Map()
  return createServer(async (req, res) => {
    const respond = (code, body) => {
      res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      res.end(JSON.stringify(body))
    }
    const origin = req.headers.origin
    if (origin && origin !== new URL(config.appURL).origin) {
      respond(403, { error: 'Origin rejected' })
      return
    }
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Vary', 'Origin')
    }
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
      res.setHeader('Access-Control-Allow-Methods', 'POST')
      respond(204, {})
      return
    }
    const token = req.headers.authorization?.replace(/^Bearer /, '')
    const sender = equalToken(token, config.senderToken)
    const client = config.clients.find(entry => equalToken(token, entry.token))
    if (!sender && !client) {
      respond(401, { error: 'Unauthorized' })
      return
    }
    if (req.method !== 'POST') {
      respond(405, { error: 'POST required' })
      return
    }
    try {
      let raw = ''
      for await (const chunk of req) {
        raw += chunk
        if (Buffer.byteLength(raw) > 8192) {
          respond(413, { error: 'Body too large' })
          return
        }
      }
      const body = JSON.parse(raw)
      if (req.url === '/send') {
        if (!sender) {
          respond(403, { error: 'Sender token required' })
          return
        }
        if (!config.clients.some(entry => entry.owner === body.owner))
          throw new Error('Unknown owner')
        respond(200, await sendNotification(config, store, body.owner, body, transport))
        return
      }
      if (!client) {
        respond(403, { error: 'Client token required' })
        return
      }
      if (req.url === '/subscriptions') {
        const subscription = validateSubscription(body.subscription, config.vapid.publicKey)
        if (body.replacesEndpoint !== null && typeof body.replacesEndpoint !== 'string')
          throw new Error('Invalid replacement')
        respond(200, await store.upsert(client.owner, subscription, body.replacesEndpoint))
        return
      }
      if (req.url === '/unsubscribe') {
        if (typeof body.endpoint !== 'string') throw new Error('Invalid endpoint')
        await store.remove(client.owner, body.endpoint)
        respond(200, { removed: true })
        return
      }
      if (req.url === '/test') {
        const now = Date.now()
        if (now - (testTimes.get(client.owner) ?? 0) < 30000) {
          respond(429, { error: 'Wait 30 seconds between tests' })
          return
        }
        // Reserve synchronously, before sendNotification can yield.
        testTimes.set(client.owner, now)
        respond(
          200,
          await sendNotification(config, store, client.owner, config.testNotification, transport),
        )
        return
      }
      respond(404, { error: 'Not found' })
    } catch (error) {
      respond(error.statusCode === 409 ? 409 : 400, {
        error:
          error.statusCode === 409
            ? 'subscription-expired'
            : 'Invalid request or unavailable push service',
      })
    }
  })
}
