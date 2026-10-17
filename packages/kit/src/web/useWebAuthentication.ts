import { useEffect, useSyncExternalStore } from 'react'
import type { WebAuthentication, WebAuthenticationState } from './authentication.ts'

/** Subscribe to durable authentication state and reconcile on launch and resume. */
export function useWebAuthentication(authentication: WebAuthentication): WebAuthenticationState {
  useEffect(() => authentication.connect(), [authentication])
  return useSyncExternalStore(
    authentication.subscribe,
    authentication.getSnapshot,
    authentication.getSnapshot,
  )
}
