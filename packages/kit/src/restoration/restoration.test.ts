import { describe, expect, it } from 'vitest'
import { createSceneRestoration, readSceneValue } from './scene.ts'
import {
  createNavigator,
  createInstantTransitionController,
  navigatorTransitionRuntime,
  navigatorScrollRuntime,
} from '../navigation/store.ts'
import { createRouteCodec } from '../navigation/routeCodec.ts'
import { createScreenRegistry, defineScreen } from '../navigation/registry.ts'
import { createScrollSurfaceRegistry } from '../scroll/registry.ts'
import { saveNavigation } from './navigation.ts'
import { prepareSceneRoutes } from './routes.ts'
import { encodePushRoute } from '../push/routes.ts'
const component = () => null
const root = defineScreen('root', {
  component,
  restoration: { version: 1, validate: (v): v is undefined => v === undefined },
})
const detail = (version = 1) =>
  defineScreen<'detail', { id: string }>('detail', {
    component,
    restoration: {
      version,
      pushParams: ['id'],
      validate: (v): v is { id: string } =>
        !!v &&
        typeof v === 'object' &&
        Object.keys(v).length === 1 &&
        'id' in v &&
        typeof v.id === 'string',
    },
  })
const registry = createScreenRegistry(root, detail())
function memory() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v)
    },
    removeItem: (k: string) => {
      map.delete(k)
    },
  }
}
function setup(storage = memory(), reg = registry) {
  const scene = createSceneRestoration({ id: 'test', storage })
  const navigator = createNavigator({
    registry: reg,
    initial: { id: 'root' },
    restoration: { scene, key: 'home' },
    transitionControllerFactory: createInstantTransitionController,
  })
  return { scene, navigator, storage }
}
describe('process reconstruction', () => {
  it('hydrates stacks, unique identities, independent drafts and every scroll surface before host mount', () => {
    const a = setup()
    a.navigator.push('detail', { id: 'one' })
    a.navigator.push('detail', { id: 'two' })
    const key = a.navigator.getState().entries.at(-1)!.key
    a.scene.write(`entry:home:${key}:draft`, { version: 1, value: 'half logged set' })
    const scroll = createScrollSurfaceRegistry({ development: false })
    scroll.register({
      axis: 'vertical',
      id: 'list',
      primary: true,
      element: { scrollTop: 512, scrollLeft: 0, scrollTo() {} },
    })
    // A bottom-anchored view saved at its bottom keeps that fact, not only its offset.
    scroll.register({
      axis: 'vertical',
      id: 'thread',
      primary: false,
      element: { scrollTop: 900, scrollLeft: 0, scrollTo() {} },
      followsEnd: () => true,
    })
    a.navigator[navigatorScrollRuntime].bind(key, scroll)
    a.navigator[navigatorScrollRuntime].capture([key])
    a.scene.flush()
    const b = setup(a.storage)
    expect(b.navigator.getState().entries.map(e => e.params)).toEqual([
      undefined,
      { id: 'one' },
      { id: 'two' },
    ])
    expect(b.navigator.getState().entries.at(-1)?.scrollSnapshot?.get('list')?.y).toBe(512)
    expect(b.navigator.getState().entries.at(-1)?.scrollSnapshot?.get('thread')).toEqual({
      x: 0,
      y: 900,
      atEnd: true,
    })
    expect(b.scene.read(`entry:home:${key}:draft`)).toEqual({
      version: 1,
      value: 'half logged set',
    })
    expect(b.navigator.getState().entries.every(e => e.transition.phase === 'settled')).toBe(true)
    b.navigator.push('detail', { id: 'three' })
    expect(new Set(b.navigator.getState().entries.map(e => e.key)).size).toBe(4)
  })
  it('degrades changed versions and malformed entries to the deepest valid ancestor', () => {
    const a = setup()
    a.navigator.push('detail', { id: 'one' })
    a.scene.flush()
    const b = setup(a.storage, createScreenRegistry(root, detail(2)))
    expect(b.navigator.getState().entries).toHaveLength(1)
    expect(
      createRouteCodec(registry).decodePath([
        { screen: 'root', version: 1 },
        { screen: 'missing', version: 1 },
        { screen: 'detail', version: 1, params: { id: 'ignored' } },
      ]),
    ).toHaveLength(1)
    expect(
      createRouteCodec(registry).decode({ screen: 'detail', version: 1, params: { id: 1 } }),
    ).toBeNull()
  })
  it('survives corruption, quota and denied storage; expiry is opt-in', () => {
    const storage = memory()
    storage.setItem('satin-scene:v1:test', '{broken')
    expect(setup(storage).navigator.getState().entries).toHaveLength(1)
    const scene = createSceneRestoration({ id: 'test', storage, now: () => 1 })
    scene.write('draft', 'keep')
    scene.flush()
    expect(createSceneRestoration({ id: 'test', storage, now: () => 1000000 }).read('draft')).toBe(
      'keep',
    )
    expect(
      createSceneRestoration({ id: 'test', storage, now: () => 1000000, maxAbsenceMs: 10 }).read(
        'draft',
      ),
    ).toBeUndefined()
    const denied = createSceneRestoration({
      id: 'denied',
      storage: {
        ...storage,
        setItem() {
          throw new Error('quota')
        },
      },
    })
    expect(denied.write('draft', 'usable')).toBe(true)
    expect(denied.flush()).toBe(false)
    expect(denied.read('draft')).toBe('usable')
    expect(denied.diagnostics.error).toBe('write-failed')
    expect(
      readSceneValue(scene, 'draft', {
        version: 2,
        initial: '',
        validate: (v): v is string => typeof v === 'string',
      }),
    ).toBe('')
  })
  it('flushes accepted pushes before animation ends and preserves a held or cancelling back gesture', () => {
    const { scene, storage } = setup()
    const navigator = createNavigator({
      registry,
      initial: { id: 'root' },
      restoration: { scene, key: 'home' },
      transitionControllerFactory: (completion, context) => ({
        progress: 0,
        interactionPhase: context.interactive ? 'held' : undefined,
        finish: completion.finish,
        cancel: completion.cancel,
        setProgress() {},
        completeInteractive: completion.finish,
        cancelInteractive: completion.cancel,
      }),
    })
    navigator.push('detail', { id: 'one' })
    scene.flush()
    expect(setup(storage).navigator.getState().entries).toHaveLength(2)
    navigator.getState().entries.at(-1)!.transition.controller.finish()
    const pop = navigator[navigatorTransitionRuntime].beginInteractivePop()!
    expect(navigator.activatePath([])).toBe(false)
    scene.flush()
    expect(setup(storage).navigator.getState().entries).toHaveLength(2)
    pop.cancel()
    scene.flush()
    expect(setup(storage).navigator.getState().entries).toHaveLength(2)
  })
  it('uses one versioned schema for launch URLs and cold notification intents, without duplicate entries after a kill', () => {
    const a = setup(),
      codec = createRouteCodec(registry),
      scope = 'https://app.test/'
    a.navigator.push('detail', { id: 'old' })
    const url = encodePushRoute(
      scope,
      { screen: 'detail', version: 1, params: { id: 'new' }, tab: 'home' },
      codec.pushRules(['home']),
      'tap-1',
    )
    prepareSceneRoutes({
      ...a,
      registry,
      navigators: { home: a.navigator },
      defaultTab: 'home',
      scope,
      url,
    })
    expect(a.navigator.getState().entries.at(-1)?.params).toEqual({ id: 'new' })
    a.scene.flush()
    const b = setup(a.storage)
    prepareSceneRoutes({
      ...b,
      registry,
      navigators: { home: b.navigator },
      defaultTab: 'home',
      scope,
      url,
    })
    expect(b.navigator.getState().entries).toHaveLength(3)
    const launch = codec.encodeURL(scope, [
      { screen: 'root', params: undefined },
      { screen: 'detail', params: { id: 'shortcut' } },
    ])
    prepareSceneRoutes({
      ...b,
      registry,
      navigators: { home: b.navigator },
      defaultTab: 'home',
      scope,
      url: launch,
    })
    expect(b.navigator.getState().entries).toHaveLength(2)
    expect(b.navigator.getState().entries.at(-1)?.params).toEqual({ id: 'shortcut' })
    expect(codec.decodeURL(launch, 'https://other.test/')).toBeNull()
  })
})

it('keeps every tab stack and uses explicit shortcut tab selection', () => {
  const { scene, navigator: home, storage } = setup()
  const history = createNavigator({
    registry,
    initial: { id: 'root' },
    restoration: { scene, key: 'history' },
    transitionControllerFactory: createInstantTransitionController,
  })
  home.push('detail', { id: 'home' })
  history.push('detail', { id: 'history' })
  const url = createRouteCodec(registry).encodeURL(
    'https://app.test/',
    [{ screen: 'detail', params: { id: 'shortcut' } }],
    'history',
  )
  prepareSceneRoutes({
    scene,
    registry,
    navigators: { home, history },
    defaultTab: 'home',
    scope: 'https://app.test/',
    url,
  })
  expect(home.getState().entries.at(-1)?.params).toEqual({ id: 'home' })
  expect(history.getState().entries.at(-1)?.params).toEqual({ id: 'shortcut' })
  scene.flush()
  const restored = setup(storage)
  expect(restored.scene.read('selected-tab')).toEqual({ version: 1, value: 'history' })
  expect(restored.navigator.getState().entries.at(-1)?.params).toEqual({ id: 'home' })
})
it('rejects lossy and oversized state while leaving the last disk checkpoint intact', () => {
  const storage = memory(),
    scene = createSceneRestoration({ id: 'test', storage, maxBytes: 1024 })
  expect(scene.write('draft', 'small')).toBe(true)
  expect(scene.flush()).toBe(true)
  expect(scene.write('draft', new Date())).toBe(false)
  expect(
    scene.write('draft', {
      get value() {
        throw new Error('bad getter')
      },
    }),
  ).toBe(false)
  expect(scene.write('draft', 'x'.repeat(1024))).toBe(true)
  expect(scene.flush()).toBe(false)
  expect(createSceneRestoration({ id: 'test', storage }).read('draft')).toBe('small')
  expect(scene.read('draft')).toHaveLength(1024)
})
it('garbage collects popped drafts without losing them during a cancellable transition', () => {
  const { scene } = setup()
  const navigator = createNavigator({
    registry,
    initial: { id: 'root' },
    restoration: { scene, key: 'home' },
    transitionControllerFactory: completion => ({
      progress: 0,
      finish: completion.finish,
      cancel: completion.cancel,
    }),
  })
  navigator.push('detail', { id: 'one' })
  navigator.getState().entries.at(-1)!.transition.controller.finish()
  const key = `entry:home:${navigator.getState().entries.at(-1)!.key}:draft`
  scene.write(key, 'retained')
  navigator.pop()
  expect(scene.read(key)).toBe('retained')
  navigator.getState().entries.at(-1)!.transition.controller.cancel()
  expect(scene.read(key)).toBe('retained')
  navigator.pop()
  navigator.getState().entries.at(-1)!.transition.controller.finish()
  expect(scene.read(key)).toBeUndefined()
})
it('malformed launch intent degrades to root and unknown routes never throw', () => {
  const codec = createRouteCodec(registry),
    scope = 'https://app.test/'
  expect(codec.decodeURL(scope + '?satin-route=%7Bbroken', scope)).toEqual([])
  expect(codec.decodePath([null, false])).toEqual([])
  const { scene, navigator } = setup()
  navigator.push('detail', { id: 'one' })
  prepareSceneRoutes({
    scene,
    registry,
    navigators: { home: navigator },
    defaultTab: 'home',
    scope,
    url: scope + '?satin-route=%7Bbroken',
  })
  expect(navigator.getState().entries).toHaveLength(1)
})

it('drops drafts owned by an incompatible root schema', () => {
  const a = setup(),
    key = a.navigator.getState().entries[0]!.key
  a.scene.write(`entry:home:${key}:draft`, { version: 1, value: 'old root' })
  const changedRoot = defineScreen('root', {
    component,
    restoration: { version: 2, validate: (v): v is undefined => v === undefined },
  })
  a.scene.flush()
  const b = setup(a.storage, createScreenRegistry(changedRoot, detail()))
  expect(b.scene.read(`entry:home:${key}:draft`)).toBeUndefined()
  expect(b.navigator.getState().entries).toHaveLength(1)
})

it('never collects live drafts when the saved path reaches its length limit', () => {
  const { scene, navigator } = setup()
  for (let i = 0; i < 64; i++) navigator.push('detail', { id: String(i) })
  const key = `entry:home:${navigator.getState().entries.at(-1)!.key}:draft`
  scene.write(key, 'live draft')
  saveNavigation({ scene, key: 'home' }, navigator.registry, navigator.getState())
  expect(scene.read(key)).toBe('live draft')
})
it.each(['missing', 'invalid'])(
  'never collects live drafts beyond a %s restoration schema',
  kind => {
    const middle = defineScreen('middle', {
      component,
      ...(kind === 'invalid'
        ? {
            restoration: {
              version: 1,
              validate: (v: unknown): v is undefined => v === 'impossible',
            },
          }
        : {}),
    })
    const scene = createSceneRestoration({ id: 'missing', storage: memory() })
    const navigator = createNavigator({
      registry: createScreenRegistry(root, detail(), middle),
      initial: { id: 'root' },
      restoration: { scene, key: 'home' },
      transitionControllerFactory: createInstantTransitionController,
    })
    navigator.push('middle')
    navigator.push('detail', { id: 'live' })
    const keys = navigator
      .getState()
      .entries.slice(1)
      .map(e => `entry:home:${e.key}:draft`)
    keys.forEach(key => scene.write(key, 'live draft'))
    saveNavigation({ scene, key: 'home' }, navigator.registry, navigator.getState())
    keys.forEach(key => expect(scene.read(key)).toBe('live draft'))
  },
)
it('reuses the newest repeated destination without truncating its draft', () => {
  const { scene, navigator } = setup()
  navigator.push('detail', { id: 'same' })
  navigator.push('detail', { id: 'same' })
  const key = navigator.getState().entries.at(-1)!.key
  scene.write(`entry:home:${key}:draft`, 'current draft')
  const routes = prepareSceneRoutes({
    scene,
    registry,
    navigators: { home: navigator },
    defaultTab: 'home',
    scope: 'https://app.test/',
  })
  expect(
    routes.openURL(
      encodePushRoute(
        'https://app.test/',
        { screen: 'detail', version: 1, params: { id: 'same' } },
        createRouteCodec(registry).pushRules(),
        'duplicate',
      ),
    ),
  ).toBe(true)
  expect(navigator.getState().entries).toHaveLength(3)
  expect(navigator.getState().entries.at(-1)!.key).toBe(key)
  expect(scene.read(`entry:home:${key}:draft`)).toBe('current draft')
})
it.each([false, true])(
  'keeps the entry and draft reused by a link during a pop, interactive=%s',
  interactive => {
    const scene = createSceneRestoration({ id: 'race', storage: memory() })
    const navigator = createNavigator({
      registry,
      initial: { id: 'root' },
      restoration: { scene, key: 'home' },
      transitionControllerFactory: (completion, context) => ({
        progress: 0,
        interactionPhase: context.interactive ? 'completing' : undefined,
        finish: completion.finish,
        cancel: completion.cancel,
        setProgress() {},
        completeInteractive: completion.finish,
        cancelInteractive: completion.cancel,
      }),
    })
    navigator.push('detail', { id: 'same' })
    navigator.getState().entries.at(-1)!.transition.controller.finish()
    const key = navigator.getState().entries.at(-1)!.key
    scene.write(`entry:home:${key}:draft`, 'outgoing draft')
    if (interactive) navigator[navigatorTransitionRuntime].beginInteractivePop()
    else navigator.pop()
    const routes = prepareSceneRoutes({
      scene,
      registry,
      navigators: { home: navigator },
      defaultTab: 'home',
      scope: 'https://app.test/',
    })
    expect(
      routes.openURL(
        encodePushRoute(
          'https://app.test/',
          { screen: 'detail', version: 1, params: { id: 'same' } },
          createRouteCodec(registry).pushRules(),
          'pop-race',
        ),
      ),
    ).toBe(true)
    expect(navigator.getState().entries.at(-1)!.key).toBe(key)
    expect(scene.read(`entry:home:${key}:draft`)).toBe('outgoing draft')
  },
)

it('shares undefined parameter semantics with a parameterless notification destination', () => {
  const inbox = defineScreen('inbox', {
    component,
    restoration: { version: 1, pushParams: [], validate: (v): v is undefined => v === undefined },
  })
  const reg = createScreenRegistry(root, inbox),
    codec = createRouteCodec(reg),
    scope = 'https://app.test/'
  const scene = createSceneRestoration({ id: 'parameterless', storage: memory() })
  const navigator = createNavigator({
    registry: reg,
    initial: { id: 'root' },
    transitionControllerFactory: createInstantTransitionController,
  })
  const routes = prepareSceneRoutes({
    scene,
    registry: reg,
    navigators: { home: navigator },
    defaultTab: 'home',
    scope,
  })
  const url = encodePushRoute(scope, { screen: 'inbox', version: 1 }, codec.pushRules(), 'inbox')
  expect(routes.openURL(url)).toBe(true)
  expect(navigator.getState().entries.at(-1)?.screenId).toBe('inbox')
  expect(navigator.getState().entries.at(-1)?.params).toBeUndefined()
})

it('reuses a live route beyond the recovery cap and non-restorable ancestors', () => {
  const gap = defineScreen('gap', { component })
  const reg = createScreenRegistry(root, detail(), gap)
  const scene = createSceneRestoration({ id: 'live-route', storage: memory() })
  const navigator = createNavigator({
    registry: reg,
    initial: { id: 'root' },
    restoration: { scene, key: 'home' },
    transitionControllerFactory: completion => ({
      progress: 0,
      finish: completion.finish,
      cancel: completion.cancel,
    }),
  })
  navigator.push('gap')
  for (let i = 0; i < 64; i++) navigator.push('detail', { id: String(i) })
  navigator.getState().entries.at(-1)!.transition.controller.finish()
  const key = navigator.getState().entries.at(-1)!.key
  scene.write(`entry:home:${key}:draft`, 'past the serialized prefix')
  navigator.pop()
  const routes = prepareSceneRoutes({
    scene,
    registry: reg,
    navigators: { home: navigator },
    defaultTab: 'home',
    scope: 'https://app.test/',
  })
  expect(
    routes.openURL(
      encodePushRoute(
        'https://app.test/',
        { screen: 'detail', version: 1, params: { id: '63' } },
        createRouteCodec(reg).pushRules(),
        'live-only',
      ),
    ),
  ).toBe(true)
  expect(navigator.getState().entries).toHaveLength(66)
  expect(navigator.getState().entries.at(-1)!.key).toBe(key)
  expect(scene.read(`entry:home:${key}:draft`)).toBe('past the serialized prefix')
})

it.each(['incoming', 'outgoing'] as const)(
  'preserves the requested %s entry and draft during replacement',
  role => {
    const scene = createSceneRestoration({ id: 'replace', storage: memory() })
    const navigator = createNavigator({
      registry,
      initial: { id: 'root' },
      restoration: { scene, key: 'home' },
      transitionControllerFactory: completion => ({
        progress: 0,
        finish: completion.finish,
        cancel: completion.cancel,
      }),
    })
    navigator.push('detail', { id: 'A' })
    navigator.getState().entries.at(-1)!.transition.controller.finish()
    const a = navigator.getState().entries.at(-1)!
    navigator.replace('detail', { id: 'B' })
    const b = navigator.getState().entries.at(-1)!
    for (const entry of [a, b]) scene.write(`entry:home:${entry.key}:draft`, entry.params)
    const wanted = role === 'incoming' ? b : a
    const routes = prepareSceneRoutes({
      scene,
      registry,
      navigators: { home: navigator },
      defaultTab: 'home',
      scope: 'https://app.test/',
    })
    routes.openURL(
      encodePushRoute(
        'https://app.test/',
        { screen: 'detail', version: 1, params: wanted.params as { id: string } },
        createRouteCodec(registry).pushRules(),
        'replace-tap',
      ),
    )
    expect(navigator.getState().entries.map(e => e.key)).toEqual([
      navigator.getState().entries[0]!.key,
      wanted.key,
    ])
    expect(scene.read(`entry:home:${wanted.key}:draft`)).toEqual(wanted.params)
    expect(scene.read('route-deliveries')).toEqual(['replace-tap'])
  },
)

it('preserves an incoming replacement linked from inside a held gesture', () => {
  const scene = createSceneRestoration({ id: 'held-replace', storage: memory() })
  const navigator = createNavigator({
    registry,
    initial: { id: 'root' },
    restoration: { scene, key: 'home' },
    transitionControllerFactory: (completion, context) => ({
      progress: 0,
      interactionPhase: context.interactive ? 'held' : undefined,
      finish: completion.finish,
      cancel: completion.cancel,
      setProgress() {},
      completeInteractive: completion.finish,
      cancelInteractive: completion.cancel,
    }),
  })
  navigator.push('detail', { id: 'A' })
  navigator.getState().entries.at(-1)!.transition.controller.finish()
  const held = navigator[navigatorTransitionRuntime].beginInteractivePop()!
  navigator.replace('detail', { id: 'B' })
  const b = navigator.getState().entries.at(-1)!
  scene.write(`entry:home:${b.key}:draft`, 'keep B')
  const routes = prepareSceneRoutes({
    scene,
    registry,
    navigators: { home: navigator },
    defaultTab: 'home',
    scope: 'https://app.test/',
  })
  routes.openURL(
    encodePushRoute(
      'https://app.test/',
      { screen: 'detail', version: 1, params: { id: 'B' } },
      createRouteCodec(registry).pushRules(),
      'held-replace',
    ),
  )
  held.cancel()
  held.finish()
  expect(navigator.getState().entries.at(-1)?.key).toBe(b.key)
  expect(scene.read(`entry:home:${b.key}:draft`)).toBe('keep B')
})

it('does not record success if controller resolution removes the requested entry', () => {
  const scene = createSceneRestoration({ id: 'resolution', storage: memory() })
  const navigator = createNavigator({
    registry,
    initial: { id: 'root' },
    restoration: { scene, key: 'home' },
    transitionControllerFactory: completion => ({
      progress: 0,
      finish: completion.cancel,
      cancel: completion.cancel,
    }),
  })
  navigator.push('detail', { id: 'lost' })
  const key = navigator.getState().entries.at(-1)!.key
  const routes = prepareSceneRoutes({
    scene,
    registry,
    navigators: { home: navigator },
    defaultTab: 'home',
    scope: 'https://app.test/',
  })
  routes.openURL(
    encodePushRoute(
      'https://app.test/',
      { screen: 'detail', version: 1, params: { id: 'lost' } },
      createRouteCodec(registry).pushRules(),
      'not-accepted',
    ),
  )
  expect(navigator.getState().entries.some(entry => entry.key === key)).toBe(false)
  expect(scene.read('route-deliveries')).toBeUndefined()
})
