import { createContext, useContext, useEffect, useMemo } from 'react'
import type { LayoutClass } from '../layout/layoutClass.ts'
import { useSafeAreaMetrics, type SafeAreaMetrics } from '../safe-area/useSafeAreaMetrics.ts'
import type { JustUpdated } from '../app/coldLaunchUpdate.ts'

export type SatinRuntime = {
  layoutClass: LayoutClass
  layoutClassRevision: number
  standalone: boolean
  coordinateSpacesReconcile: boolean
  metrics: SafeAreaMetrics
  /** Present only in the replacement document, then consumed once. */
  justUpdated: JustUpdated | null
  launchReady: boolean
  /** Prevent a long-background update from discarding app-managed unsaved state. */
  registerUnsavedChanges: (token: symbol) => () => void
}

export const RuntimeContext = createContext<SatinRuntime | undefined>(undefined)

/** Layout consumers must not subscribe to keyboard-only visual viewport samples. */
export function useSatinLayoutRuntime(): Omit<SatinRuntime, 'metrics'> & {
  metrics: Omit<SafeAreaMetrics, 'visualViewport'>
} {
  const runtime = useContext(RuntimeContext)

  if (!runtime) {
    throw new Error('useSatinRuntime must be called inside SatinRoot.')
  }

  return runtime
}

/** Diagnostic readers receive every live coordinate space, independently of root layout. */
export function useSatinRuntime(): SatinRuntime {
  const runtime = useSatinLayoutRuntime()
  const metrics = useSafeAreaMetrics()
  return useMemo(() => ({ ...runtime, metrics }), [runtime, metrics])
}

/** Classes follow the layout viewport; keyboard occlusion and zoom do not select panes. */
export function useLayoutClass(): LayoutClass {
  return useSatinLayoutRuntime().layoutClass
}

/** Register app-managed unsaved state while it exists. Native inputs are checked automatically. */
export function useUnsavedChanges(unsaved: boolean) {
  const { registerUnsavedChanges } = useSatinLayoutRuntime()
  useEffect(() => {
    if (!unsaved) return
    return registerUnsavedChanges(Symbol('satin-unsaved'))
  }, [unsaved, registerUnsavedChanges])
}
