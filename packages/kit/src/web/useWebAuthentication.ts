import { useEffect, useSyncExternalStore } from 'react'
import type { WebAuthentication, WebAuthenticationState } from './authentication.ts'

/** Returns a sign-in flow's current state and re-renders when it changes. It checks for a finished
 * sign-in on launch and when the app returns to the foreground. */
export function useWebAuthentication(authentication: WebAuthentication): WebAuthenticationState {
  useEffect(() => authentication.connect(), [authentication])
  return useSyncExternalStore(
    authentication.subscribe,
    authentication.getSnapshot,
    authentication.getSnapshot,
  )
}
