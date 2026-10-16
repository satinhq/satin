/** Reveal eligibility is relative to the destination, which may itself be hidden
 * or translated while preparing. A declared priority image participates offscreen. */
export function imageRequiredForReveal(root: HTMLElement, image: HTMLImageElement) {
  if (image.getAttribute('fetchpriority') === 'high') return true
  const rect = image.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return false
  const route = root.getBoundingClientRect()
  if (
    rect.right <= route.left ||
    rect.left >= route.right ||
    rect.bottom <= route.top ||
    rect.top >= route.bottom
  )
    return false
  const rootVisibility = getComputedStyle(root).visibility
  for (
    let parent: HTMLElement | null = image;
    parent && parent !== root;
    parent = parent.parentElement
  ) {
    if (
      parent.hidden ||
      parent.dataset.satinTabActive === 'false' ||
      getComputedStyle(parent).display === 'none'
    )
      return false
    // Pending artwork hides its own undecoded pixels. That deliberate guard is
    // distinct from a hidden ancestor or an author-hidden committed image.
    const pendingMarker = parent === image && image.hasAttribute('data-satin-content-pending')
    if (
      !pendingMarker &&
      (parent.style.visibility === 'hidden' ||
        (rootVisibility !== 'hidden' && getComputedStyle(parent).visibility === 'hidden'))
    )
      return false
  }
  return true
}

export function hasPendingContent(root: HTMLElement) {
  if (!root.querySelector('[data-satin-content-pending]')) return false
  return [...root.querySelectorAll<HTMLImageElement>('[data-satin-content-pending]')].some(image =>
    imageRequiredForReveal(root, image),
  )
}

/** First mounts have no displayed capture. Every reveal pass includes their
 * visible/priority markers, and the caller owns cancellation of this observer. */
export function prepareMountedContent(root: HTMLElement, signal?: AbortSignal) {
  if (signal?.aborted || !hasPendingContent(root)) return
  return new Promise<void>(resolve => {
    const finish = () => {
      observer.disconnect()
      signal?.removeEventListener('abort', finish)
      resolve()
    }
    const observer = new MutationObserver(() => {
      if (!hasPendingContent(root)) finish()
    })
    observer.observe(root, { childList: true, subtree: true, attributes: true })
    signal?.addEventListener('abort', finish, { once: true })
  })
}
