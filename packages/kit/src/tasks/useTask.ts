import { useCallback, useContext, useLayoutEffect, useRef, useState } from 'react'
import { ScreenContext } from '../navigation/navigationContext.tsx'
import { TabActivityContext } from '../tabs/context.ts'

/** Publish synchronous state updates only while this invocation is current. */
export type TaskCommit = (update: () => void) => boolean
/** The work `useTask` runs: pass `signal` to fetches and publish state through `commit`. */
export type TaskAction = (signal: AbortSignal, commit: TaskCommit) => void | Promise<void>
/** Options for `useTask`. A change of `id` cancels the current run and starts a new one. */
export type TaskOptions = Readonly<{ id?: unknown }>
/** Cancels the current run and starts the task again; resolves when that run ends. */
export type TaskRunner = () => Promise<void>

/**
 * For shared remote data, use defineResource/useResource so revisits retain content.
 * Runs async work while its screen is showing. It cancels the run when the screen is covered,
 * its tab is hidden or the component unmounts, and starts again when it shows. Pass `signal` to
 * `fetch` and publish results through `commit`. An error the task throws reaches the nearest
 * error boundary. The returned runner cancels and replaces the current run.
 */
export function useTask(action: TaskAction, { id }: TaskOptions = {}): TaskRunner {
  const screen = useContext(ScreenContext)
  const tabActive = useContext(TabActivityContext)
  const active = tabActive && !screen?.lifecycle.isCovered
  const actionRef = useRef(action)
  const enabled = useRef(false)
  const current = useRef<AbortController | null>(null)
  const [failure, setFailure] = useState<{
    error: unknown
    id: unknown
    key: string | undefined
    controller: AbortController
  } | null>(null)
  useLayoutEffect(() => {
    actionRef.current = action
  })
  const run = useCallback(async () => {
    if (!enabled.current) return
    const previous = current.current
    const controller = new AbortController()
    current.current = controller
    previous?.abort()
    if (current.current !== controller || controller.signal.aborted || !enabled.current) return
    const commit: TaskCommit = update => {
      if (controller.signal.aborted || current.current !== controller) return false
      update()
      return true
    }
    try {
      await actionRef.current(controller.signal, commit)
    } catch (error) {
      if (!controller.signal.aborted) throw error
    }
  }, [])
  useLayoutEffect(() => {
    enabled.current = active
    if (active) {
      const pending = run()
      const controller = current.current!
      void pending.catch(error => {
        if (current.current === controller && !controller.signal.aborted)
          setFailure({ error, id, key: screen?.key, controller })
      })
    }
    return () => {
      enabled.current = false
      current.current?.abort()
      current.current = null
    }
  }, [active, id, screen?.key, run])
  if (
    failure &&
    active &&
    Object.is(failure.id, id) &&
    failure.key === screen?.key &&
    failure.controller === current.current &&
    !failure.controller.signal.aborted
  )
    throw failure.error
  return run
}
