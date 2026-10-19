import { useCallback, useContext, useEffect, useSyncExternalStore } from 'react'
import { ScreenContext } from '../navigation/navigationContext.tsx'
import { TabActivityContext } from '../tabs/context.ts'
import type { Resource, ResourceSnapshot } from './resource.ts'

/** Retained content plus an explicit retry/pull-to-refresh action. */
export interface ResourceResult<Value> extends ResourceSnapshot<Value> {
  readonly refresh: () => Promise<Value>
}

/**
 * Read shared content synchronously; load missing or stale data when the screen shows.
 * Refresh errors preserve content and appear in error. Covering or popping a screen
 * never cancels a shared request. Use useTask for work that must stop with its screen.
 */
export function useResource<Key extends string | number, Value>(
  resource: Resource<Key, Value>,
  key: Key,
): ResourceResult<Value> {
  const screen = useContext(ScreenContext)
  const tabActive = useContext(TabActivityContext)
  const active = tabActive && !screen?.lifecycle.isCovered
  const subscribe = useCallback(
    (listener: () => void) => resource.subscribe(key, listener),
    [resource, key],
  )
  const getSnapshot = useCallback(() => resource.getSnapshot(key), [resource, key])
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const refresh = useCallback(() => resource.refresh(key), [resource, key])
  useEffect(() => {
    if (active) void resource.prefetch(key)
  }, [resource, key, active])
  return { ...snapshot, refresh }
}
