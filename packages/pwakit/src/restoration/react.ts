import { useCallback, useContext, useSyncExternalStore, type SetStateAction } from 'react'
import { NavigatorContext, ScreenContext } from '../navigation/navigationContext.tsx'
import {
  cloneSceneValue,
  readSceneValue,
  type SceneRestoration,
  type StateSchema,
} from './scene.ts'

/** Application/scene values such as the selected tab. Declare schemas outside render. */
export function useRestoredState<T>(
  scene: SceneRestoration,
  key: string,
  schema: StateSchema<T>,
): readonly [T, (next: SetStateAction<T>) => void] {
  const get = useCallback(() => readSceneValue(scene, key, schema), [scene, key, schema])
  const value = useSyncExternalStore(scene.subscribe, get, get)
  const set = useCallback(
    (next: SetStateAction<T>) => {
      const value = typeof next === 'function' ? (next as (previous: T) => T)(get()) : next
      const cloned = cloneSceneValue(value, schema)
      scene.write(key, { version: schema.version, value: cloned })
    },
    [scene, key, schema, get],
  )
  return [value, set]
}
/** Entry-scoped state: repeated pushes of the same screen keep independent drafts. */
export function useSceneStorage<T>(key: string, schema: StateSchema<T>) {
  const navigator = useContext(NavigatorContext),
    screen = useContext(ScreenContext)
  if (!navigator?.restoration || !screen)
    throw new Error('useSceneStorage requires a restoring NavigatorHost')
  return useRestoredState(
    navigator.restoration.scene,
    `entry:${navigator.restoration.key}:${screen.key}:${key}`,
    schema,
  )
}
