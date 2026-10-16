#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { isIP } from 'node:net'
import {
  generateVAPIDKeys,
  createPushRelay,
  FileSubscriptionStore,
  sendNotification,
} from './index.mjs'
const [command, ...args] = process.argv.slice(2)
const flags = Object.fromEntries(
  args.reduce(
    (pairs, value, i) =>
      value.startsWith('--') ? [...pairs, [value.slice(2), args[i + 1]]] : pairs,
    [],
  ),
)
try {
  if (command === 'init') {
    if (!flags.out || !flags['app-url'] || !flags['relay-url'] || !flags.subject)
      throw new Error(
        'Use init --out /private/push.json --app-url https://preview/app/ --relay-url https://relay.example.com/push/ --subject https://example.com/contact',
      )
    const appURL = new URL(flags['app-url']),
      relayURL = new URL(flags['relay-url'])
    if (
      appURL.protocol !== 'https:' ||
      !appURL.pathname.endsWith('/') ||
      relayURL.protocol !== 'https:'
    )
      throw new Error('Use HTTPS URLs and a trailing slash for the app scope')
    const directory = dirname(resolve(flags.out))
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const vapid = { ...generateVAPIDKeys(), subject: flags.subject }
    const token = randomBytes(32).toString('base64url')
    const config = {
      appURL: appURL.href,
      routes: { detail: { params: ['title'], version: 1 } },
      vapid,
      senderToken: randomBytes(32).toString('base64url'),
      clients: [{ owner: 'owner', token }],
      store: resolve(directory, 'subscriptions.json'),
      testNotification: {
        title: 'Your Satin reminder',
        body: 'Tap to open Welcome in your app.',
        route: { screen: 'detail', version: 1, params: { title: 'Welcome' } },
        badge: 3,
      },
    }
    await writeFile(flags.out, JSON.stringify(config, null, 2), { mode: 0o600, flag: 'wx' })
    await writeFile(resolve(directory, 'owner-token.txt'), token, { mode: 0o600, flag: 'wx' })
    await writeFile(
      resolve(directory, 'client.env'),
      `VITE_PUSH_PUBLIC_KEY=${vapid.publicKey}\nVITE_PUSH_RELAY_URL=${relayURL.href}\n`,
      { mode: 0o600, flag: 'wx' },
    )
    console.log(
      'Wrote private relay config, owner-token.txt, and public client.env beside the config.',
    )
  } else if (command === 'keys') {
    if (!flags.out) throw new Error('Use keys --out /private/path/vapid.json')
    await writeFile(flags.out, JSON.stringify(generateVAPIDKeys(), null, 2), {
      mode: 0o600,
      flag: 'wx',
    })
    console.log('Keys written. Keep the private key on the server.')
  } else {
    if (!flags.config) throw new Error('Use --config /private/path/push.json')
    const config = JSON.parse(await readFile(flags.config, 'utf8'))
    const store = new FileSubscriptionStore(config.store)
    if (command === 'relay') {
      const host = flags.host ?? '127.0.0.1'
      if (
        host !== '127.0.0.1' &&
        host !== '::1' &&
        !(isIP(host) === 4 && /^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host))
      )
        throw new Error('Bind to loopback or a Tailscale IP only')
      createPushRelay(config, store).listen(Number(flags.port ?? 5466), host, () =>
        console.log('Satin push relay ready'),
      )
    } else if (command === 'send') {
      const result = await sendNotification(config, store, flags.owner ?? 'owner', {
        title: flags.title,
        body: flags.body,
        route: JSON.parse(flags.route),
        ...(flags.badge !== undefined ? { badge: Number(flags.badge) } : {}),
      })
      console.log(JSON.stringify(result))
      if (!result.accepted || result.failed) process.exitCode = 1
    } else throw new Error('Commands: init, keys, relay, send')
  }
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
