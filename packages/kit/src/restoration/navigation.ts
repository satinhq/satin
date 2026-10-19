import { createRouteCodec } from '../navigation/routeCodec.ts'
import type { ScreenRegistry } from '../navigation/registry.ts'
import type { NavigatorState, ScreenEntry } from '../navigation/types.ts'
import type { ScrollSnapshotOffset } from '../scroll/types.ts'
import type { SceneRestoration } from './scene.ts'

export interface NavigatorRestoration {
  scene: SceneRestoration
  key: string
}
export function readNavigation(
  restoration: NavigatorRestoration,
  registry: ScreenRegistry,
  root: string,
): ScreenEntry[] {
  const saved = restoration.scene.read(`navigation:${restoration.key}`)
  if (!Array.isArray(saved) || saved[0]?.screen !== root) return []
  const codec = createRouteCodec(registry),
    keys = new Set<string>(),
    entries: ScreenEntry[] = []
  for (const value of saved.slice(0, 64)) {
    const route = codec.decode(value)
    if (
      !route ||
      registry.resolve(route.screen)?.restoration?.persist === false ||
      typeof value.key !== 'string' ||
      !value.key ||
      value.key.length > 200 ||
      keys.has(value.key)
    )
      break
    keys.add(value.key)
    const scroll = new Map<string, ScrollSnapshotOffset>()
    if (Array.isArray(value.scroll))
      for (const item of value.scroll.slice(0, 64)) {
        if (
          Array.isArray(item) &&
          typeof item[0] === 'string' &&
          Number.isFinite(item[1]?.x) &&
          Number.isFinite(item[1]?.y)
        )
          scroll.set(
            item[0],
            item[1].atEnd === true
              ? { x: item[1].x, y: item[1].y, atEnd: true }
              : { x: item[1].x, y: item[1].y },
          )
      }
    entries.push({
      key: value.key,
      screenId: route.screen,
      params: route.params,
      presentation: 'push',
      scrollSnapshot: scroll,
      transition: { phase: 'settled', controller: { progress: 1, finish() {}, cancel() {} } },
    })
  }
  return entries
}
export function saveNavigation(
  restoration: NavigatorRestoration,
  registry: ScreenRegistry,
  state: NavigatorState,
) {
  // A flush includes accepted pushes. An unresolved interactive pop retains
  // its outgoing route; automatic exits project the accepted destination.
  const entries = state.entries.filter(
    entry =>
      entry.transition.phase !== 'exiting' ||
      ['held', 'cancelling'].includes(entry.transition.controller.interactionPhase ?? ''),
  )
  const codec = createRouteCodec(registry),
    saved = []
  for (const entry of entries.slice(0, 64)) {
    const route = codec.decode({
      screen: entry.screenId,
      params: entry.params,
      version: registry.resolve(entry.screenId)?.restoration?.version,
    })
    if (!route || registry.resolve(route.screen)?.restoration?.persist === false) break
    saved.push({ ...route, key: entry.key, scroll: [...(entry.scrollSnapshot ?? [])] })
  }
  restoration.scene.retainEntries(
    restoration.key,
    state.entries.map(entry => entry.key),
  )
  restoration.scene.write(`navigation:${restoration.key}`, saved)
}
