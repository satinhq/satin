/** Periodic foreground work. Hidden and page-cached documents own no interval.
 * The callback is not called on resume; callers own any immediate refresh policy. */
export function visibleInterval(callback: () => void, delayMs: number): () => void {
  let timer: ReturnType<typeof setInterval> | undefined
  let pageHidden = false
  const stop = () => {
    clearInterval(timer)
    timer = undefined
  }
  const update = () => {
    stop()
    if (!document.hidden && !pageHidden) {
      timer = setInterval(() => {
        if (!document.hidden && !pageHidden) callback()
      }, delayMs)
    }
  }
  const hide = () => {
    pageHidden = true
    stop()
  }
  const show = () => {
    pageHidden = false
    update()
  }
  document.addEventListener('visibilitychange', update)
  window.addEventListener('pagehide', hide)
  window.addEventListener('pageshow', show)
  update()
  return () => {
    stop()
    document.removeEventListener('visibilitychange', update)
    window.removeEventListener('pagehide', hide)
    window.removeEventListener('pageshow', show)
  }
}
