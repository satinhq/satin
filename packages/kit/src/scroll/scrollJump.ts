/** Framework scrolls start on the tap. Glass preparation is advisory and never owns a
 * deferred scroll callback: completing a capture must not restart a scroll under a finger. */
export type ScrollJumpPreparer = (element: object, top: number) => Promise<void> | undefined

const preparers = new Set<ScrollJumpPreparer>()

/** Register a preparer (the glass runtime); returns its removal. */
export function onScrollJump(preparer: ScrollJumpPreparer) {
  preparers.add(preparer)
  return () => {
    preparers.delete(preparer)
  }
}

/** Announce the destination and start scrolling in the same turn. */
export function scrollAfterGlassPrepared(element: object, top: number, scroll: () => void) {
  scroll()
  for (const preparer of preparers) {
    // The runtime reports capture errors through its glass error channel.
    void preparer(element, top)?.catch(() => {})
  }
}
