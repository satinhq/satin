import { retainPresentation } from '../presentation/activity.ts'
import { afterEach, expect, it, vi } from 'vitest'
import { worker } from '../../test/pushHarness.ts'
import { createNavigator, createInstantTransitionController } from '../navigation/store.ts'
import { createScreenRegistry, defineScreen } from '../navigation/registry.ts'
import { createSceneRestoration } from '../restoration/scene.ts'
import { prepareSceneRoutes } from '../restoration/routes.ts'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const sender = fileURLToPath(new URL('../../../push/src/index.mjs', import.meta.url))
const scope = 'https://app.test/app/'
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
it.each([
  'warm',
  'cold',
  'cold-shell',
  'legacy-rules',
  'page-version-mismatch',
  'presentation',
  'quota',
  'unrestorable',
  'no-restoration',
] as const)(
  'delivers a versioned classic notification through the real worker and page: %s',
  async mode => {
    vi.useFakeTimers()
    const warm = [
      'warm',
      'legacy-rules',
      'presentation',
      'quota',
      'unrestorable',
      'no-restoration',
    ].includes(mode)
    const sw = worker(),
      jobs: Promise<unknown>[] = [],
      listeners = new Map<string, Function>()
    const events = {
      addEventListener: (type: string, fn: Function) => listeners.set(type, fn),
      removeEventListener: vi.fn(),
    }
    const acceptedSnapshots: (string | undefined)[] = []
    const controller = {
      postMessage: vi.fn((data: any) => {
        if (data.type === 'SATIN_PUSH_ACK' && data.result === 'accepted')
          acceptedSnapshots.push(disk.get('satin-scene:v1:integration'))
        jobs.push(sw.dispatch('message', { source: client, data }))
      }),
    }
    const client = {
      id: 'installed',
      url: scope,
      focused: false,
      visibilityState: 'hidden',
      focus: vi.fn(),
      navigate: vi.fn(),
      postMessage: vi.fn((data: unknown) =>
        listeners.get('message')?.({ source: controller, data }),
      ),
    }
    const location = { origin: 'https://app.test', href: scope }
    vi.stubGlobal('location', location)
    vi.stubGlobal('navigator', { serviceWorker: { ...events, controller } })
    const replaceState = vi.fn((_state, _title, url) => {
      location.href = url
    })
    vi.stubGlobal('window', { ...events, history: { state: null, replaceState } })
    vi.stubGlobal('document', events)
    const registry = createScreenRegistry(
      defineScreen('home', {
        component: () => null,
        restoration: { version: 1, validate: (v): v is undefined => v === undefined },
      }),
      defineScreen<'detail', { title: string }>('detail', {
        component: () => null,
        restoration: {
          version: mode === 'page-version-mismatch' ? 2 : 1,
          pushParams: ['title'],
          validate: (v): v is { title: string } =>
            !!v &&
            typeof v === 'object' &&
            Object.keys(v).length === 1 &&
            'title' in v &&
            typeof v.title === 'string',
        },
      }),
    )
    const disk = new Map<string, string>()
    let denyStorage = mode === 'quota'
    const scene = createSceneRestoration({
      id: 'integration',
      storage: {
        getItem: k => disk.get(k) ?? null,
        setItem: (k, v) => {
          if (denyStorage) throw new Error('quota')
          disk.set(k, v)
        },
        removeItem: k => {
          disk.delete(k)
        },
      },
    })
    const nav = createNavigator({
      registry,
      initial: { id: 'home' },
      restoration: mode === 'no-restoration' ? undefined : { scene, key: 'home' },
      transitionControllerFactory: createInstantTransitionController,
    })
    if (mode === 'unrestorable')
      for (let i = 0; i < 64; i++) nav.push('detail', { title: String(i) })
    const drain = async () => {
      while (jobs.length) await Promise.all(jobs.splice(0))
    }
    const connect = () =>
      prepareSceneRoutes({
        scene,
        registry,
        navigators: { home: nav },
        defaultTab: 'home',
        scope,
      }).connect()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let release = mode === 'presentation' ? retainPresentation() : undefined
    let disconnect: (() => void) | undefined
    if (warm) {
      sw.clients.matchAll.mockResolvedValue([client])
      disconnect = connect()
      await drain()
    }
    // Exercise the shipped sender, including its exported codec dependency.
    const config = {
      appURL: scope,
      routes: {
        detail: {
          params: ['title'],
          ...(mode === 'legacy-rules' ? {} : { version: 1 }),
          tabs: ['home'],
        },
      },
    }
    const input = {
      title: 'Test',
      body: 'Tap',
      route: { screen: 'detail', version: 1, params: { title: 'Warm notification' }, tab: 'home' },
    }
    const payload = JSON.parse(
      execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `import { buildPayload } from ${JSON.stringify(sender)}; console.log(JSON.stringify(buildPayload(${JSON.stringify(input)}, ${JSON.stringify(config)})))`,
        ],
        { encoding: 'utf8' },
      ),
    )
    const { routeURL } = payload
    const id = new URL(routeURL).searchParams.get('satin-delivery')
    await sw.dispatch('push', { data: { json: () => payload } })
    const notification = structuredClone(sw.registration.showNotification.mock.calls[0]![1])
    expect(notification.data.url).toBe(routeURL)
    await sw.dispatch('notificationclick', { notification: { ...notification, close: vi.fn() } })
    if (!warm) {
      expect(sw.clients.openWindow).toHaveBeenCalledWith(routeURL)
      location.href = mode === 'cold' ? routeURL : scope
      sw.clients.matchAll.mockResolvedValue([client])
      disconnect = connect()
    }
    await drain()
    if (release) {
      expect(nav.getState().entries).toHaveLength(1)
      expect([...sw.caches.stores.values()].flatMap(store => [...store.keys()])).toHaveLength(1)
      expect(controller.postMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'SATIN_PUSH_ACK' }),
      )
      release()
      release = undefined
      await Promise.resolve()
      await drain()
    }
    if (mode === 'page-version-mismatch') {
      expect(nav.getState().entries).toHaveLength(1)
      expect(scene.read('route-deliveries')).toBeUndefined()
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Rejected delivery'))
      expect(controller.postMessage).toHaveBeenCalledWith({
        type: 'SATIN_PUSH_ACK',
        id,
        result: 'rejected',
      })
      expect([...sw.caches.stores.values()].flatMap(store => [...store.keys()])).toEqual([])
      disconnect!()
      warn.mockRestore()
      return
    }
    expect(nav.getState().entries.at(-1)?.params).toEqual({ title: 'Warm notification' })
    expect(scene.read('route-deliveries')).toEqual([id])
    expect(controller.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SATIN_PUSH_ACK', result: 'accepted' }),
    )
    expect([...sw.caches.stores.values()].flatMap(store => [...store.keys()])).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(101)
    await drain()
    if (['quota', 'unrestorable', 'no-restoration'].includes(mode)) {
      listeners.get('pageshow')!()
      await drain()
      expect(controller.postMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'SATIN_PUSH_ACK', result: 'accepted' }),
      )
      expect([...sw.caches.stores.values()].flatMap(store => [...store.keys()])).toHaveLength(1)
      expect(scene.readPersisted('route-deliveries') ?? []).toEqual([])
      if (mode !== 'quota') {
        disconnect!()
        warn.mockRestore()
        return
      }
      denyStorage = false
      scene.write('retry', true)
      await vi.advanceTimersByTimeAsync(101)
      await drain()
    }
    const restored = createSceneRestoration({
      id: 'integration',
      storage: { getItem: k => disk.get(k) ?? null, setItem() {}, removeItem() {} },
    })
    const material = createNavigator({
      registry,
      initial: { id: 'home' },
      restoration: { scene: restored, key: 'home' },
      transitionControllerFactory: createInstantTransitionController,
    })
    expect(material.getState().entries.at(-1)?.params).toEqual({ title: 'Warm notification' })
    expect(restored.read('route-deliveries')).toEqual([id])
    expect(acceptedSnapshots.length).toBeGreaterThan(0)
    for (const raw of acceptedSnapshots) {
      const checkpoint = JSON.parse(raw!).values
      expect(checkpoint['route-deliveries']).toContain(id)
      expect(checkpoint['navigation:home'].at(-1).params).toEqual({ title: 'Warm notification' })
    }
    expect([...sw.caches.stores.values()].flatMap(store => [...store.keys()])).toEqual([])
    listeners.get('pageshow')!()
    await drain()
    expect(nav.getState().entries).toHaveLength(2)
    expect(client.navigate).not.toHaveBeenCalled()
    disconnect!()
    warn.mockRestore()
  },
)
