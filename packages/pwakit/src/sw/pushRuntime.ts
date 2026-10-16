/** Serialized into the one app-shell worker; no imports or build-scoped state. */
export function installPushHandlers(self: any, shellPath: string) {
  const shell = new URL(shellPath, self.location.origin)
  // Deliberately outside the revisioned app-shell cache prefix: updates retain taps.
  const inboxName = `satin-push-inbox-v1:${shell.pathname}`
  let operations = Promise.resolve()
  const serial = (run: () => Promise<void>) => {
    const next = operations.then(run)
    operations = next.catch(() => {})
    return next
  }
  const scoped = (input: string, descendants = false) => {
    try {
      const url = new URL(input)
      return (
        !url.username &&
        !url.password &&
        url.origin === shell.origin &&
        (descendants ? url.pathname.startsWith(shell.pathname) : url.pathname === shell.pathname)
      )
    } catch {
      return false
    }
  }
  const landing = (input: unknown) => {
    if (typeof input !== 'string' || !scoped(input)) return null
    try {
      const url = new URL(input)
      const id = url.searchParams.get('satin-delivery')
      const route = JSON.parse(url.searchParams.get('satin-push') ?? 'null')
      if (
        !id ||
        id.length > 128 ||
        !route ||
        typeof route.screen !== 'string' ||
        !route.screen ||
        (route.tab !== undefined && typeof route.tab !== 'string') ||
        (route.params !== undefined &&
          (!route.params ||
            typeof route.params !== 'object' ||
            Array.isArray(route.params) ||
            Object.values(route.params).some(
              value => typeof value !== 'string' || value.length > 256,
            )))
      )
        return null
      return { id, url: url.href }
    } catch {
      return null
    }
  }
  const key = (id: string) => new URL(`__satin_push_pending/${encodeURIComponent(id)}`, shell).href
  const windows = async () =>
    (await self.clients.matchAll({ type: 'window', includeUncontrolled: true })).filter(
      (client: any) => scoped(client.url, true),
    )
  const wake = (client: any) => {
    try {
      client.postMessage({ type: 'SATIN_PUSH_PENDING' })
    } catch {
      /* Inbox survives a suspended or disappearing client. */
    }
  }
  self.addEventListener('push', (event: any) => {
    // Legacy/external mutable declarative messages retain WebKit's visible fallback.
    // WebKit forbids re-showing them without navigate; this sender never emits them.
    if (event.notification) return
    event.waitUntil(
      (async () => {
        let payload
        try {
          payload = event.data?.json()
        } catch {
          payload = null
        }
        const notification =
          payload?.satin_push === 1 || payload?.web_push === 8030 ? payload.notification : null
        const valid =
          notification && typeof notification.title === 'string' && notification.title.trim()
        const target = landing(payload?.routeURL ?? notification?.navigate)
        await self.registration.showNotification(valid ? notification.title : 'New notification', {
          body:
            valid && typeof notification.body === 'string'
              ? notification.body
              : 'Open the app to see what is new.',
          data: { url: target?.url ?? null },
        })
        const badge = payload?.app_badge
        if (
          (typeof badge === 'string' || typeof badge === 'number') &&
          /^[0-9]+$/.test(String(badge)) &&
          Number.isSafeInteger(Number(badge))
        ) {
          try {
            if (Number(badge) === 0) await self.navigator.clearAppBadge?.()
            else await self.navigator.setAppBadge?.(Number(badge))
          } catch {
            /* Visibility remains platform-owned. */
          }
        }
      })(),
    )
  })
  self.addEventListener('notificationclick', (event: any) => {
    event.notification.close()
    event.waitUntil(
      serial(async () => {
        const target = landing(event.notification.data?.url)
        const clients = await windows()
        const client =
          clients.find((value: any) => value.focused) ??
          clients.find((value: any) => value.visibilityState === 'visible') ??
          clients[0]
        if (target) {
          const inbox = await caches.open(inboxName)
          await inbox.put(
            key(target.id),
            new Response(JSON.stringify({ ...target, clientId: client?.id ?? null })),
          )
        }
        if (client) {
          // Never navigate an existing document, even if focus/message/decoding fails.
          try {
            await client.focus()
          } catch {
            /* Keep the pending route for resume. */
          }
          if (target) wake(client)
        } else {
          await self.clients.openWindow(target?.url ?? shell.href)
        }
      }),
    )
  })
  self.addEventListener('message', (event: any) => {
    if (
      !['SATIN_PUSH_CLAIM', 'SATIN_PUSH_ACK'].includes(event.data?.type) ||
      !event.source?.id ||
      !scoped(event.source.url, true)
    )
      return
    event.waitUntil(
      serial(async () => {
        const inbox = await caches.open(inboxName)
        const clients = await windows()
        if (!clients.some((client: any) => client.id === event.source.id)) return
        if (event.data.type === 'SATIN_PUSH_ACK') {
          if (
            typeof event.data.id !== 'string' ||
            !['accepted', 'rejected'].includes(event.data.result)
          )
            return
          const request = key(event.data.id),
            response = await inbox.match(request)
          const record = response ? await response.json() : null
          // A cold URL can be consumed before its first claim.
          if (record && (record.clientId === null || record.clientId === event.source.id))
            await inbox.delete(request)
          return
        }
        for (const request of await inbox.keys()) {
          const response = await inbox.match(request)
          if (!response) continue
          const record = await response.json()
          if (
            record.clientId &&
            record.clientId !== event.source.id &&
            clients.some((client: any) => client.id === record.clientId)
          )
            continue
          record.clientId = event.source.id
          await inbox.put(request, new Response(JSON.stringify(record)))
          event.source.postMessage({ type: 'SATIN_PUSH_ROUTE', id: record.id, url: record.url })
        }
      }),
    )
  })
}
