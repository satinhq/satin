import {
  connectPushRoutes,
  consumeSceneLaunchURL,
  createRouteIntentQueue,
} from '../push/urlProjection.ts'
import type { ScreenRegistry } from '../navigation/registry.ts'
import { navigatorTransitionRuntime, type NavigatorStore } from '../navigation/store.ts'
import { createRouteCodec, sameRouteParams } from '../navigation/routeCodec.ts'
import { decodePushRoute } from '../push/routes.ts'
import { readSceneValue, type SceneRestoration, type StateSchema } from './scene.ts'

export const tabSelectionSchema: StateSchema<string> = {
  version: 1,
  initial: '',
  validate: (value): value is string => typeof value === 'string',
}
/** Call before mount. Explicit launch intent wins over the checkpoint. */
export function prepareSceneRoutes(options: {
  scene: SceneRestoration
  scope: string
  navigators: Record<string, NavigatorStore>
  registry: ScreenRegistry
  defaultTab: string
  url?: string
}) {
  const { scene, navigators } = options
  const codec = createRouteCodec(options.registry)
  const tabKey = 'selected-tab'
  const rules = codec.pushRules(Object.keys(navigators))
  const current = () => {
    const saved = readSceneValue(scene, tabKey, tabSelectionSchema)
    return Object.hasOwn(navigators, saved) ? saved : options.defaultTab
  }
  const select = (tab: string) => scene.write(tabKey, { version: 1, value: tab })
  if (!Object.hasOwn(navigators, options.defaultTab)) throw new Error('Missing default navigator')
  const scope = new URL(
    options.scope,
    typeof location === 'undefined' ? 'https://satin.invalid' : location.origin,
  ).href
  const url = options.url ?? (typeof location === 'undefined' ? scope : location.href)
  const deliveryKey = 'route-deliveries'
  const pending = new Map<string, { navigator: NavigatorStore; key: string }>()
  const durable = () => {
    const ids = scene.readPersisted(deliveryKey)
    return Array.isArray(ids)
      ? ids.filter((id): id is string => typeof id === 'string').slice(-128)
      : []
  }
  const seen = () => [...new Set([...durable(), ...pending.keys()])].slice(-128)
  let accepted: { navigator: NavigatorStore; key: string } | undefined
  const record = (id: string) => {
    if (!accepted) return
    pending.set(id, accepted)
    scene.write(deliveryKey, seen())
    // Navigators register their preparations at construction, before this one.
    // Do not persist a ledger entry for a route omitted by a schema/cap or a
    // navigator that did not opt into this scene's restoration.
    scene.checkpoint(
      deliveryKey,
      () => {
        const ids = durable()
        for (const [id, target] of pending) {
          if (ids.includes(id)) pending.delete(id)
          else {
            if (target.navigator[navigatorTransitionRuntime].hasCheckpointEntry(scene, target.key))
              ids.push(id)
          }
        }
        scene.write(deliveryKey, ids.slice(-128))
      },
      () => false,
    )
  }
  const accept = (
    route: import('../push/routes.ts').PushRoute<Record<string, string | number | boolean>>,
    cold = false,
  ) => {
    accepted = undefined
    const tab = route.tab ?? current(),
      navigator = navigators[tab]
    if (!navigator) return false
    const target = codec.decode({
      screen: route.screen,
      version: route.version,
      params: route.params,
    })
    if (!target) return false
    const entries = navigator.getState().entries
    const previous = entries.findLastIndex(
      entry => entry.screenId === target.screen && sameRouteParams(entry.params, target.params),
    )
    if (previous >= 0) {
      if (!navigator[navigatorTransitionRuntime].activateEntry(entries[previous]!.key)) return false
      if (navigator.getState().entries.at(-1)?.key !== entries[previous]!.key) return false
      accepted = { navigator, key: entries[previous]!.key }
      select(tab)
      return true
    }
    const path = entries.map(entry => ({
      screen: entry.screenId,
      params: entry.params,
      version: options.registry.resolve(entry.screenId)?.restoration?.version ?? 0,
    }))
    if (
      !(cold
        ? navigator.activatePath([...path, target])
        : navigator.push(target.screen, target.params))
    )
      return false
    const entry = navigator.getState().entries.at(-1)
    if (!entry || entry.screenId !== target.screen || !sameRouteParams(entry.params, target.params))
      return false
    accepted = { navigator, key: entry.key }
    select(tab)
    return true
  }
  const openPath = (input: string) => {
    const path = codec.decodeURL(input, scope)
    if (path === null) return false
    const requested = new URL(input, scope).searchParams.get('satin-tab')
    const tab = requested && Object.hasOwn(navigators, requested) ? requested : current()
    if (!navigators[tab]!.activatePath(path)) return false
    select(tab)
    return true
  }
  const subscribeNavigation = (listener: () => void) => {
    const stops = [
      ...Object.values(navigators).map(navigator => navigator.subscribe(listener)),
      scene.subscribe(listener),
    ]
    return () => stops.forEach(stop => stop())
  }
  const queue = createRouteIntentQueue(subscribeNavigation)
  let nextPath = 0
  const cold = decodePushRoute(url, scope, rules)
  if (cold && !seen().includes(cold.id) && accept(cold.route, true)) record(cold.id)
  if (!cold) {
    if (openPath(url)) consumeSceneLaunchURL(url)
  }
  return {
    openURL(input: string) {
      const push = decodePushRoute(input, scope, rules)
      if (push) {
        queue.enqueue(`push:${push.id}`, () => {
          if (seen().includes(push.id)) return true
          if (!accept(push.route)) return false
          record(push.id)
          return true
        })
        return true
      }
      if (codec.decodeURL(input, scope) === null) return false
      queue.enqueue(`path:${++nextPath}`, () => openPath(input))
      return true
    },
    selectionKey: tabKey,
    selectionSchema: {
      ...tabSelectionSchema,
      initial: options.defaultTab,
      validate: (value: unknown): value is string =>
        typeof value === 'string' && Object.hasOwn(navigators, value),
    },
    connect() {
      const disconnectScene = scene.connect()
      const disconnectRoutes = connectPushRoutes({
        scope,
        routes: rules,
        navigate: accept,
        queue,
        hasAccepted: id => seen().includes(id),
        didAccept: record,
        canAcknowledge: id => durable().includes(id),
        subscribeNavigation,
      })
      return () => {
        disconnectRoutes()
        disconnectScene()
      }
    },
  }
}
