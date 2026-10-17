import { createPushRelayAdapter } from './push/notifications.ts'
/** App-test assertion without exposing navigation engine objects. */
export function assertNavigation(container: ParentNode, screen: string) {
  const active = container.querySelector(
    '[data-satin-screen-container][data-satin-covered="false"]',
  )
  if (active?.getAttribute('data-satin-screen') !== screen)
    throw new Error(`Expected active route ${screen}`)
}

/** Explicit diagnostic action. The token is requested at call time and never persisted. */
export function sendTestNotification(relay: {
  url: string
  token: () => string | Promise<string>
}): Promise<{ accepted: number }> {
  return createPushRelayAdapter(relay).sendTest()
}
