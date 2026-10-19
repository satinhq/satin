import { visibleInterval } from '../lifecycle/visibleInterval.ts'
import { checkAppShellUpdate } from '../sw/updateCheck.ts'

interface EditableBaselines {
  readonly values: WeakMap<HTMLInputElement | HTMLTextAreaElement, string>
  readonly checked: WeakMap<HTMLInputElement, boolean>
  readonly selected: WeakMap<HTMLSelectElement, readonly boolean[]>
}

/** Suspension is a safe apply boundary when the app has no unsaved edits or active media. */
export const BACKGROUND_UPDATE_AFTER_MS = 0

export function hasUnsavedEditableState(root: ParentNode, baselines?: EditableBaselines): boolean {
  for (const element of root.querySelectorAll('input, textarea, select, [contenteditable]')) {
    if (element instanceof HTMLInputElement) {
      if (element.type === 'hidden' || element.disabled) continue
      if (
        element.type === 'file'
          ? Boolean(element.files?.length)
          : element.type === 'checkbox' || element.type === 'radio'
            ? element.checked !== (baselines?.checked.get(element) ?? element.defaultChecked)
            : element.value !== (baselines?.values.get(element) ?? element.defaultValue)
      )
        return true
    } else if (element instanceof HTMLTextAreaElement) {
      if (
        !element.disabled &&
        element.value !== (baselines?.values.get(element) ?? element.defaultValue)
      )
        return true
    } else if (element instanceof HTMLSelectElement) {
      if (
        !element.disabled &&
        [...element.options].some(
          (option, index) =>
            option.selected !==
            (baselines?.selected.get(element)?.[index] ?? option.defaultSelected),
        )
      )
        return true
    } else if (
      element instanceof HTMLElement &&
      element.isContentEditable &&
      element.textContent?.trim()
    )
      return true
  }
  return false
}

/** Keep a controlled input's clean value even if React synchronizes defaultValue. */
export function trackEditableState(root: HTMLElement) {
  const baselines: EditableBaselines = {
    values: new WeakMap(),
    checked: new WeakMap(),
    selected: new WeakMap(),
  }
  const remember = (event: Event) => {
    const element = event.target
    if (element instanceof HTMLInputElement && !baselines.checked.has(element))
      baselines.checked.set(element, element.defaultChecked)
    if (
      (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) &&
      !baselines.values.has(element)
    )
      baselines.values.set(element, element.defaultValue)
    if (element instanceof HTMLSelectElement && !baselines.selected.has(element))
      baselines.selected.set(
        element,
        [...element.options].map(option => option.defaultSelected),
      )
  }
  root.addEventListener('input', remember)
  root.addEventListener('change', remember)
  return {
    hasUnsavedChanges: () => hasUnsavedEditableState(root, baselines),
    dispose: () => {
      root.removeEventListener('input', remember)
      root.removeEventListener('change', remember)
    },
  }
}

export function mayApplyBackgroundUpdate(
  root: ParentNode,
  hasCustomUnsavedChanges: boolean,
  hiddenForMs: number,
  mediaActive = false,
) {
  return (
    document.hidden &&
    hiddenForMs >= BACKGROUND_UPDATE_AFTER_MS &&
    !mediaActive &&
    !hasCustomUnsavedChanges &&
    !hasUnsavedEditableState(root)
  )
}

/** Download while runnable; activation remains the caller's safe-boundary decision.
 * Launch, return to the foreground and reconnect each check at once; this interval only
 * covers a long visible session, so it is kept slow to spare network and battery. */
export const FOREGROUND_UPDATE_CHECK_MS = 5 * 60_000
const UPDATE_CHECK_BUDGET_MS = 10_000
export function watchBackgroundUpdates(scope: string, onInstalled: () => void): () => void {
  let disposed = false
  let checking = false
  let checkGeneration = 0
  let checkTimer: ReturnType<typeof setTimeout> | undefined
  let registration: ServiceWorkerRegistration | undefined
  let observed: ServiceWorker | null = null
  const inspect = () => {
    if (disposed || !registration) return
    const installing = registration.installing
    if (installing !== observed) {
      observed?.removeEventListener('statechange', inspect)
      observed = installing
      observed?.addEventListener('statechange', inspect)
    }
    if (registration.waiting) onInstalled()
  }
  const check = async (suspending = false) => {
    if (disposed || checking || !navigator.serviceWorker) return
    checking = true
    const generation = ++checkGeneration
    clearTimeout(checkTimer)
    // WebKit may leave an update promise unsettled. A later check can retry;
    // the old operation cannot overwrite a newer registration observation.
    if (!document.hidden && !suspending) {
      checkTimer = setTimeout(() => {
        if (generation === checkGeneration) checking = false
      }, UPDATE_CHECK_BUDGET_MS)
    }
    try {
      const found = await navigator.serviceWorker.getRegistration(scope)
      if (disposed || generation !== checkGeneration || !found) return
      if (found !== registration) {
        registration?.removeEventListener('updatefound', inspect)
        registration = found
        registration.addEventListener('updatefound', inspect)
      }
      inspect()
      if (!registration.waiting && navigator.onLine !== false)
        await checkAppShellUpdate(registration)
      if (generation === checkGeneration) inspect()
    } catch {
      // Offline and failed installs leave the cached version usable.
    } finally {
      if (generation === checkGeneration) {
        clearTimeout(checkTimer)
        checking = false
      }
    }
  }
  const visibilityChanged = () => {
    clearTimeout(checkTimer)
    checkTimer = undefined
    // Suspension is an existing update boundary. Preserve its single check,
    // without a background polling timer. A stalled hidden check can retry on return.
    if (!document.hidden) checking = false
    void check()
  }
  const pageHidden = () => {
    clearTimeout(checkTimer)
    checkTimer = undefined
    void check(true)
  }
  const online = () => {
    if (!document.hidden) void check()
  }
  document.addEventListener('visibilitychange', visibilityChanged)
  window.addEventListener('pagehide', pageHidden)
  const stopForegroundChecks = visibleInterval(() => {
    if (!document.hidden) void check()
  }, FOREGROUND_UPDATE_CHECK_MS)
  window.addEventListener('online', online)
  visibilityChanged()
  return () => {
    disposed = true
    clearTimeout(checkTimer)
    stopForegroundChecks()
    window.removeEventListener('online', online)
    document.removeEventListener('visibilitychange', visibilityChanged)
    window.removeEventListener('pagehide', pageHidden)
    registration?.removeEventListener('updatefound', inspect)
    observed?.removeEventListener('statechange', inspect)
  }
}
