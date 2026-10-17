import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildPayload,
  createPushRequest,
  createPushRelay,
  FileSubscriptionStore,
  sendNotification,
  validateSubscription,
  generateVAPIDKeys,
} from './index.mjs'
const keys = generateVAPIDKeys()
const config = {
  appURL: 'https://app.test/app/',
  routes: { detail: { params: ['title'] } },
  vapid: { ...keys, subject: 'https://example.com/contact' },
  senderToken: 's'.repeat(40),
  clients: [
    { owner: 'owner', token: 'c'.repeat(40) },
    { owner: 'other', token: 'o'.repeat(40) },
  ],
  testNotification: {
    title: 'Reminder',
    body: 'Open your app',
    route: { screen: 'detail', params: { title: 'Welcome' } },
    badge: 3,
  },
}
const subscription = {
  endpoint: 'https://web.push.apple.com/Qtest',
  p256dh: keys.publicKey,
  auth: Buffer.alloc(16, 1).toString('base64url'),
  applicationServerKey: keys.publicKey,
}
async function storeFixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'satin-push-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  return new FileSubscriptionStore(join(dir, 'subscriptions.json'))
}
test('payload is visible and never opts into OS-owned navigation', () => {
  const value = buildPayload(config.testNotification, config)
  assert.equal(value.satin_push, 1)
  assert.equal(value.web_push, undefined)
  assert.equal(value.notification.navigate, undefined)
  assert.equal(value.app_badge, '3')
  assert.equal(value.notification.app_badge, undefined)
  assert.equal(new URL(value.routeURL).pathname, '/app/')
  for (const changes of [
    { title: '' },
    { body: 'a'.repeat(1001) },
    { badge: -1 },
    { badge: 1.5 },
    { route: { screen: 'unknown' } },
  ])
    assert.throws(() => buildPayload({ ...config.testNotification, ...changes }, config))
})
test('subscription validation cannot direct outbound traffic to arbitrary hosts', () => {
  for (const endpoint of [
    'http://web.push.apple.com/Qx',
    'https://localhost/Qx',
    'https://web.push.apple.com.evil.test/Qx',
    'https://web.push.apple.com:8443/Qx',
    'https://user@localhost/Qx',
  ])
    assert.throws(() => validateSubscription({ ...subscription, endpoint }, keys.publicKey))
  assert.throws(() => validateSubscription({ ...subscription, auth: 'abc' }, keys.publicKey))
  assert.throws(() => validateSubscription(subscription, 'different'))
})
test('store serializes concurrent atomic rotations, isolates owners, restricts file permissions', async t => {
  const store = await storeFixture(t)
  await Promise.all([
    store.upsert('owner', subscription, null),
    store.upsert('owner', subscription, null),
  ])
  assert.equal((await store.read()).length, 1)
  await assert.rejects(store.upsert('other', subscription, null))
  await store.upsert(
    'owner',
    { ...subscription, endpoint: 'https://web.push.apple.com/Qnext' },
    subscription.endpoint,
  )
  await store.remove('other', 'https://web.push.apple.com/Qnext')
  assert.equal((await store.read()).length, 1)
  assert.equal((await stat(store.path)).mode & 0o777, 0o600)
})
test('sender prunes 404/410 but retains transient failures and returns receipt counts', async t => {
  const store = await storeFixture(t)
  await store.upsert('owner', subscription, null)
  let captured
  assert.deepEqual(
    await sendNotification(config, store, 'owner', config.testNotification, async (...args) => {
      captured = args
    }),
    { accepted: 1, expired: 0, failed: 0 },
  )
  assert.equal(captured[2].headers['Content-Type'], 'application/octet-stream')
  assert.deepEqual(
    await sendNotification(config, store, 'owner', config.testNotification, async () => {
      throw { statusCode: 503 }
    }),
    { accepted: 0, expired: 0, failed: 1 },
  )
  assert.equal((await store.read()).length, 1)
  assert.deepEqual(
    await sendNotification(config, store, 'owner', config.testNotification, async () => {
      throw { statusCode: 410 }
    }),
    { accepted: 0, expired: 1, failed: 0 },
  )
  assert.equal((await store.read())[0].invalid, true)
  await assert.rejects(store.upsert('owner', subscription, null), error => error.statusCode === 409)
})
test('relay auth, owner isolation, fixed tests, CORS and validation', async t => {
  const store = await storeFixture(t)
  const server = createPushRelay(config, store, async () => {})
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const base = `http://127.0.0.1:${server.address().port}`
  const post = (path, token, body = {}, origin = 'https://app.test') =>
    fetch(base + path, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Origin: origin,
      },
      body: JSON.stringify(body),
    })
  assert.equal((await post('/subscriptions', 'bad')).status, 401)
  assert.equal((await post('/send', config.clients[0].token, config.testNotification)).status, 403)
  assert.equal((await post('/subscriptions', config.senderToken)).status, 403)
  assert.equal(
    (
      await post(
        '/subscriptions',
        config.clients[0].token,
        { subscription, replacesEndpoint: null },
        'https://evil.test',
      )
    ).status,
    403,
  )
  assert.equal(
    (
      await post('/subscriptions', config.clients[0].token, {
        subscription,
        replacesEndpoint: null,
      })
    ).status,
    200,
  )
  assert.equal(
    (
      await post('/subscriptions', config.clients[1].token, {
        subscription,
        replacesEndpoint: null,
      })
    ).status,
    400,
  )
  assert.equal(
    (await post('/unsubscribe', config.clients[1].token, { endpoint: subscription.endpoint }))
      .status,
    200,
  )
  assert.equal((await store.read()).length, 1)
  assert.equal((await post('/test', config.clients[0].token)).status, 200)
  assert.equal((await post('/test', config.clients[0].token)).status, 429)
  assert.equal(
    (await post('/send', config.senderToken, { ...config.testNotification, owner: 'owner' }))
      .status,
    200,
  )
  assert.equal(
    (
      await post('/send', config.senderToken, {
        ...config.testNotification,
        owner: 'other',
        route: { screen: 'bad' },
      })
    ).status,
    400,
  )
})

test('actual encrypted request retains classic content type', () => {
  const details = createPushRequest(
    {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    },
    JSON.stringify(buildPayload(config.testNotification, config)),
    { vapidDetails: config.vapid, TTL: 60 },
  )
  assert.equal(details.headers['Content-Type'], 'application/octet-stream')
  assert.equal(details.headers['Content-Encoding'], 'aes128gcm')
  assert.ok(details.body.length > 0)
})

test('expired endpoint tombstone survives replacement, removal, and process restart', async t => {
  let store = await storeFixture(t)
  await store.upsert('owner', subscription, null)
  await store.invalidate('owner', subscription.endpoint)
  const next = { ...subscription, endpoint: 'https://web.push.apple.com/Qreplacement' }
  await store.upsert('owner', next, subscription.endpoint)
  await store.remove('owner', subscription.endpoint)
  store = new FileSubscriptionStore(store.path)
  await assert.rejects(
    store.upsert('owner', subscription, next.endpoint),
    error => error.statusCode === 409,
  )
  assert.equal((await store.read()).filter(record => !record.invalid).length, 1)
  // Late delivery rejection can arrive after the live old record was retired.
  const late = { ...subscription, endpoint: 'https://web.push.apple.com/Qlate' }
  await store.upsert('owner', late, next.endpoint)
  await store.upsert('owner', next, late.endpoint)
  await store.invalidate('owner', late.endpoint)
  await assert.rejects(store.upsert('owner', late, null), error => error.statusCode === 409)
})

test('overlapping owner test requests reserve the rate limit before transport yields', async t => {
  const store = await storeFixture(t)
  await store.upsert('owner', subscription, null)
  let release, started
  const sending = new Promise(resolve => {
    started = resolve
  })
  const blocked = new Promise(resolve => {
    release = resolve
  })
  let sends = 0
  const server = createPushRelay(config, store, async () => {
    sends++
    started()
    await blocked
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => {
    release()
    return new Promise(resolve => server.close(resolve))
  })
  const post = () =>
    fetch(`http://127.0.0.1:${server.address().port}/test`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.clients[0].token}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    })
  const first = post()
  await sending
  const second = await post()
  assert.equal(second.status, 429)
  assert.equal(sends, 1)
  release()
  assert.equal((await first).status, 200)
})

test('CLI init emits the versioned detail route accepted by the starter', async t => {
  const { execFileSync } = await import('node:child_process')
  const { readFile } = await import('node:fs/promises')
  const directory = await mkdtemp(join(tmpdir(), 'satin-push-init-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const out = join(directory, 'push.json')
  execFileSync(process.execPath, [
    fileURLToPath(new URL('./cli.mjs', import.meta.url)),
    'init',
    '--out',
    out,
    '--app-url',
    'https://app.test/',
    '--relay-url',
    'https://relay.test/',
    '--subject',
    'https://example.com/contact',
  ])
  const generated = JSON.parse(await readFile(out, 'utf8'))
  assert.deepEqual(generated.routes.detail, { params: ['title'], version: 1 })
  const payload = buildPayload(generated.testNotification, generated)
  const route = JSON.parse(new URL(payload.routeURL).searchParams.get('satin-push'))
  assert.deepEqual(route, { screen: 'detail', params: { title: 'Welcome' }, version: 1 })
})
