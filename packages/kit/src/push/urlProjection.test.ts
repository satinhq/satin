import { retainPresentation } from '../presentation/activity.ts'
import { afterEach, expect, it, vi } from 'vitest'
import { connectPushRoutes } from './urlProjection.ts'
import { encodePushRoute } from './routes.ts'
import { createNavigator, navigatorTransitionRuntime } from '../navigation/store.ts'
import { createScreenRegistry, defineScreen } from '../navigation/registry.ts'
import type { TransitionController } from '../navigation/types.ts'
afterEach(() => vi.unstubAllGlobals())
const routes = { detail: { params: ['id'] } },
  scope = 'https://app.test/app/'
const target = (id: string) =>
  encodePushRoute(scope, { screen: 'detail', params: { id } }, routes, id)
function browser(url = scope) {
  const controller = { postMessage: vi.fn() },
    listeners = new Map<string, Function>(),
    replaceState = vi.fn()
  const events = {
    addEventListener: (type: string, fn: Function) => listeners.set(type, fn),
    removeEventListener: vi.fn(),
  }
  vi.stubGlobal('location', { origin: 'https://app.test', href: url })
  vi.stubGlobal('navigator', { serviceWorker: { ...events, controller } })
  vi.stubGlobal('window', { ...events, history: { length: 1, state: null, replaceState } })
  vi.stubGlobal('document', events)
  return { controller, listeners, replaceState }
}
it('cold and warm activations consume once, reject unknown routes and only replace the cold URL', () => {
  const { controller, listeners, replaceState } = browser(target('cold'))
  const navigate = vi.fn(() => true),
    unsubscribe = vi.fn()
  const dispose = connectPushRoutes({
    scope,
    routes,
    navigate,
    subscribeNavigation: () => unsubscribe,
  })
  expect(navigate).toHaveBeenCalledTimes(1)
  expect(replaceState).toHaveBeenLastCalledWith(null, '', scope)
  listeners.get('pageshow')!()
  expect(navigate).toHaveBeenCalledTimes(1)
  const data = { type: 'SATIN_PUSH_ROUTE', id: 'warm', url: target('warm') }
  listeners.get('message')!({ source: {}, data })
  expect(navigate).toHaveBeenCalledTimes(1)
  listeners.get('message')!({ source: controller, data })
  expect(navigate).toHaveBeenCalledTimes(2)
  listeners.get('message')!({ source: controller, data })
  expect(navigate).toHaveBeenCalledTimes(2)
  listeners.get('message')!({ source: controller, data: { ...data, id: 'bad', url: scope } })
  expect(controller.postMessage).toHaveBeenLastCalledWith({
    type: 'SATIN_PUSH_ACK',
    id: 'bad',
    result: 'rejected',
  })
  dispose()
  expect(unsubscribe).toHaveBeenCalledOnce()
})
it.each(['held', 'cancelling'] as const)(
  'keeps the route pending until the real navigator finishes a %s back gesture',
  async phase => {
    const { controller, listeners } = browser()
    let active: TransitionController | undefined
    const navigation = createNavigator({
      registry: createScreenRegistry(
        defineScreen('home', { component: () => null }),
        defineScreen<'detail', { id: string }>('detail', { component: () => null }),
      ),
      initial: { id: 'home' },
      transitionControllerFactory: (completion, context) => {
        const value: TransitionController = {
          progress: 0,
          setProgress() {},
          completeInteractive() {
            completion.finish()
          },
          cancelInteractive() {
            completion.cancel()
          },
          interactionPhase: context.interactive ? phase : undefined,
          start() {
            if (!context.interactive) completion.finish()
          },
          finish() {
            completion.finish()
          },
          cancel() {
            completion.cancel()
          },
        }
        if (context.interactive) active = value
        return value
      },
    })
    navigation.push('detail', { id: 'existing' })
    expect(navigation[navigatorTransitionRuntime].beginInteractivePop()).toBeDefined()
    const dispose = connectPushRoutes({
      scope,
      routes,
      navigate: route => navigation.push('detail', { id: route.params!.id }),
      subscribeNavigation: navigation.subscribe,
    })
    listeners.get('message')!({
      source: controller,
      data: { type: 'SATIN_PUSH_ROUTE', id: 'deferred', url: target('deferred') },
    })
    expect(navigation.getState().entries.at(-1)?.params).toEqual({ id: 'existing' })
    expect(controller.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SATIN_PUSH_ACK' }),
    )
    active!.cancel()
    await Promise.resolve()
    expect(navigation.getState().entries.at(-1)?.params).toEqual({ id: 'deferred' })
    expect(controller.postMessage).toHaveBeenCalledWith({
      type: 'SATIN_PUSH_ACK',
      id: 'deferred',
      result: 'accepted',
    })
    listeners.get('visibilitychange')!()
    expect(
      navigation.getState().entries.filter(entry => entry.params?.id === 'deferred'),
    ).toHaveLength(1)
    dispose()
  },
)

it('defers notification navigation until every stacked presentation has closed', async () => {
  const { controller } = browser(target('modal'))
  const releaseSheet = retainPresentation(),
    releaseAlert = retainPresentation()
  const navigate = vi.fn(() => true)
  const dispose = connectPushRoutes({
    scope,
    routes,
    navigate,
    subscribeNavigation: () => () => {},
  })
  expect(navigate).not.toHaveBeenCalled()
  releaseAlert()
  await Promise.resolve()
  expect(navigate).not.toHaveBeenCalled()
  releaseSheet()
  await Promise.resolve()
  expect(navigate).toHaveBeenCalledOnce()
  expect(controller.postMessage).toHaveBeenCalledWith({
    type: 'SATIN_PUSH_ACK',
    id: 'modal',
    result: 'accepted',
  })
  releaseSheet()
  await Promise.resolve()
  expect(navigate).toHaveBeenCalledOnce()
  dispose()
})

it('uses one queue for direct scene URLs and worker delivery behind a presentation', async () => {
  const { createSceneRestoration } = await import('../restoration/scene.ts')
  const { prepareSceneRoutes } = await import('../restoration/routes.ts')
  const { createRouteCodec } = await import('../navigation/routeCodec.ts')
  const { createInstantTransitionController } = await import('../navigation/store.ts')
  const { controller, listeners } = browser()
  const registry = createScreenRegistry(
    defineScreen('home', {
      component: () => null,
      restoration: { version: 1, pushParams: [], validate: (v): v is undefined => v === undefined },
    }),
    defineScreen<'detail', { id: string }>('detail', {
      component: () => null,
      restoration: {
        version: 1,
        pushParams: ['id'],
        validate: (v): v is { id: string } =>
          !!v && typeof v === 'object' && 'id' in v && typeof v.id === 'string',
      },
    }),
  )
  const scene = createSceneRestoration({
    id: 'queue',
    storage: { getItem: () => null, setItem() {}, removeItem() {} },
  })
  const nav = createNavigator({
    registry,
    initial: { id: 'home' },
    restoration: { scene, key: 'home' },
    transitionControllerFactory: createInstantTransitionController,
  })
  const routes = prepareSceneRoutes({
    scene,
    registry,
    navigators: { home: nav },
    defaultTab: 'home',
    scope,
  })
  const disconnect = routes.connect(),
    release = retainPresentation(),
    codec = createRouteCodec(registry)
  const seen: unknown[] = []
  const unsubscribe = nav.subscribe(() => seen.push(nav.getState().entries.at(-1)?.params))
  expect(
    routes.openURL(codec.encodeURL(scope, [{ screen: 'detail', params: { id: 'direct' } }])),
  ).toBe(true)
  const url = encodePushRoute(
    scope,
    { screen: 'detail', version: 1, params: { id: 'worker' } },
    codec.pushRules(),
    'worker',
  )
  listeners.get('message')!({
    source: controller,
    data: { type: 'SATIN_PUSH_ROUTE', id: 'worker', url },
  })
  expect(seen).toEqual([])
  release()
  await Promise.resolve()
  expect(seen).toEqual([{ id: 'direct' }, { id: 'worker' }, { id: 'worker' }])
  expect(nav.getState().entries.map(e => e.params)).toEqual([
    undefined,
    { id: 'direct' },
    { id: 'worker' },
  ])
  expect(controller.postMessage).not.toHaveBeenCalledWith(
    expect.objectContaining({ type: 'SATIN_PUSH_ACK' }),
  )
  scene.flush()
  await Promise.resolve()
  expect(controller.postMessage).toHaveBeenCalledWith({
    type: 'SATIN_PUSH_ACK',
    id: 'worker',
    result: 'accepted',
  })
  unsubscribe()
  disconnect()
})
it.each(['held', 'cancelling'] as const)(
  'retains direct openURL intent during a %s gesture',
  async phase => {
    const { createSceneRestoration } = await import('../restoration/scene.ts')
    const { prepareSceneRoutes } = await import('../restoration/routes.ts')
    const { createRouteCodec } = await import('../navigation/routeCodec.ts')
    browser()
    const registry = createScreenRegistry(
      defineScreen('home', {
        component: () => null,
        restoration: { version: 1, validate: (v): v is undefined => v === undefined },
      }),
      defineScreen<'detail', { id: string }>('detail', {
        component: () => null,
        restoration: {
          version: 1,
          pushParams: ['id'],
          validate: (v): v is { id: string } =>
            !!v && typeof v === 'object' && 'id' in v && typeof v.id === 'string',
        },
      }),
    )
    const scene = createSceneRestoration({ id: 'gesture-queue' })
    const nav = createNavigator({
      registry,
      initial: { id: 'home' },
      transitionControllerFactory: (completion, context) => ({
        progress: 0,
        interactionPhase: context.interactive ? phase : undefined,
        finish: completion.finish,
        cancel: completion.cancel,
        start() {
          if (!context.interactive) completion.finish()
        },
        setProgress() {},
        completeInteractive: completion.finish,
        cancelInteractive: completion.cancel,
      }),
    })
    nav.push('detail', { id: 'old' })
    const pop = nav[navigatorTransitionRuntime].beginInteractivePop()!
    const routes = prepareSceneRoutes({
        scene,
        registry,
        navigators: { home: nav },
        defaultTab: 'home',
        scope,
      }),
      disconnect = routes.connect()
    const codec = createRouteCodec(registry)
    expect(
      routes.openURL(
        encodePushRoute(
          scope,
          { screen: 'detail', version: 1, params: { id: 'new' } },
          codec.pushRules(),
          'new',
        ),
      ),
    ).toBe(true)
    expect(nav.getState().entries.at(-1)?.params).toEqual({ id: 'old' })
    pop.cancel()
    await Promise.resolve()
    expect(nav.getState().entries.at(-1)?.params).toEqual({ id: 'new' })
    disconnect()
  },
)

it('keeps an accepted ACK pending without blocking later navigation or acknowledging duplicates early', async () => {
  const { controller, listeners } = browser()
  let changed!: () => void,
    durable = false
  const navigate = vi.fn(() => true)
  const dispose = connectPushRoutes({
    scope,
    routes,
    navigate,
    canAcknowledge: () => durable,
    subscribeNavigation: listener => {
      changed = listener
      return () => {}
    },
  })
  for (const id of ['one', 'one', 'two'])
    listeners.get('message')!({
      source: controller,
      data: { type: 'SATIN_PUSH_ROUTE', id, url: target(id) },
    })
  expect(navigate).toHaveBeenCalledTimes(2)
  expect(controller.postMessage).not.toHaveBeenCalledWith(
    expect.objectContaining({ type: 'SATIN_PUSH_ACK' }),
  )
  durable = true
  // Resume also retries pending ACKs; no new navigation is necessary.
  listeners.get('pageshow')!()
  changed()
  await Promise.resolve()
  expect(controller.postMessage).toHaveBeenCalledWith({
    type: 'SATIN_PUSH_ACK',
    id: 'one',
    result: 'accepted',
  })
  expect(controller.postMessage).toHaveBeenCalledWith({
    type: 'SATIN_PUSH_ACK',
    id: 'two',
    result: 'accepted',
  })
  expect(navigate).toHaveBeenCalledTimes(2)
  dispose()
})
