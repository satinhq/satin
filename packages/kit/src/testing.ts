import { createPushRelayAdapter } from './push/notifications.ts'
/** Throws unless the visible screen in `container` is the route `screen`. For app tests. */
export function assertNavigation(container: ParentNode, screen: string) {
  const active = container.querySelector(
    '[data-satin-screen-container][data-satin-covered="false"]',
  )
  if (active?.getAttribute('data-satin-screen') !== screen)
    throw new Error(`Expected active route ${screen}`)
}

/** Sends a test notification through a push relay and returns how many devices accepted it. The
 * token is requested when called and never stored. */
export function sendTestNotification(relay: {
  url: string
  token: () => string | Promise<string>
}): Promise<{ accepted: number }> {
  return createPushRelayAdapter(relay).sendTest()
}
