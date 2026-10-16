import type { NavigationDeclaration } from './structure.ts'
import { createContext, useContext } from 'react'
import type { AppDefinition } from '../app/definition.ts'
import type { NavigatorStore } from '../navigation/store.ts'
import type { SceneRestoration } from '../restoration/scene.ts'
import type { prepareSceneRoutes } from '../restoration/routes.ts'
import type { PushNotifications } from '../push/notifications.ts'
import type { Routes } from './routes.tsx'
export type AppRuntime = {
  app: AppDefinition
  routes: Routes
  structure: NavigationDeclaration<Routes>
  mountedStacks: Set<string>
  scene: SceneRestoration
  stacks: Map<string, NavigatorStore>
  sceneRoutes?: ReturnType<typeof prepareSceneRoutes>
  notifications: PushNotifications | null
}
export const AppContext = createContext<AppRuntime | null>(null)
export function useAppContext() {
  const context = useContext(AppContext)
  if (!context) throw new Error('This API requires runApp')
  return context
}
