import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { TaskAction, TaskCommit } from '../tasks/useTask.ts'

/** One awaited refresh per visible scroll surface, cancelled with its owner. */
export function useRefreshAction(action: TaskAction | undefined, active: boolean) {
  const actionRef = useRef(action)
  const current = useRef<AbortController | null>(null)
  const [running, setRunning] = useState(false)
  const [failure, setFailure] = useState<{ error: unknown } | null>(null)
  useLayoutEffect(() => {
    actionRef.current = action
  })
  const enabled = action !== undefined && active
  useLayoutEffect(() => {
    if (!enabled) setRunning(false)
    return () => {
      current.current?.abort()
      current.current = null
    }
  }, [enabled])
  const run = useCallback(() => {
    if (!enabled || current.current || !actionRef.current) return
    const controller = new AbortController()
    current.current = controller
    setRunning(true)
    const commit: TaskCommit = update => {
      if (controller.signal.aborted || current.current !== controller) return false
      update()
      return true
    }
    const complete = (error?: { error: unknown }) => {
      if (current.current !== controller || controller.signal.aborted) return
      current.current = null
      setRunning(false)
      if (error) setFailure(error)
    }
    try {
      void Promise.resolve(actionRef.current(controller.signal, commit)).then(
        () => complete(),
        error => complete({ error }),
      )
    } catch (error) {
      complete({ error })
    }
  }, [enabled])
  if (failure) throw failure.error
  return { running, run }
}
