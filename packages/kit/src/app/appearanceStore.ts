/// <reference lib="dom" />
/** An appearance override for the whole app: `light`, `dark`, or `system` (or null) to follow the
 * system. */
export type PreferredColorScheme = 'light' | 'dark' | 'system' | null
export type AppearanceSnapshot = Readonly<{ dark: boolean; pending: boolean }>
/** One entry in the appearance diagnostics log: what happened and the appearance seen then. */
export type AppearanceEvent = Readonly<{
  at: number
  event: string
  state: string
  hidden: boolean
  queryDark: boolean
  eventDark?: boolean
  heldDark: boolean
}>
export type AppearanceStore = {
  setPreferredColorScheme(scheme: PreferredColorScheme): void
  getDiagnostics(): readonly AppearanceEvent[]
  getSnapshot(): AppearanceSnapshot
  subscribe(listener: () => void): () => void
}
declare global {
  interface Window {
    __SATIN_APPEARANCE__?: AppearanceStore
  }
}

/** Shared by the generated head and React. Restore the session appearance before
 * paint; defer only appearance reconciliation, never content or glass reveal. */
export function installAppearanceStore(key = 'satin-appearance:v1'): AppearanceStore {
  if (window.__SATIN_APPEARANCE__) return window.__SATIN_APPEARANCE__
  // CSS is useful for cold launch, but is NOT independent confirmation of a
  // media query on resume: both can expose the same stale WebKit trait.
  const media = matchMedia('(prefers-color-scheme: dark)')
  let dark = media.matches
  try {
    const rules =
      ':root{--satin-system-appearance:light}@media(prefers-color-scheme:dark){:root{--satin-system-appearance:dark}}'
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(rules)
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]
    const css = getComputedStyle(document.documentElement)
      .getPropertyValue('--satin-system-appearance')
      .trim()
    if (css === 'dark') dark = true
    else if (css === 'light') dark = false
  } catch {
    // A head-time CSS probe is optional; the retained query still works.
  }
  let restored = false
  try {
    const saved = sessionStorage.getItem(key)
    if (saved === 'dark' || saved === 'light') {
      dark = saved === 'dark'
      restored = true
    }
  } catch {
    // Storage denial must not prevent launch.
  }
  let systemDark = dark
  let stableDark = dark
  let preferred: PreferredColorScheme = 'system'
  let snapshot: AppearanceSnapshot = { dark, pending: false }
  const listeners = new Set<() => void>()
  // WebKit emitted false active events 199–554 ms before hiding. Publish visible
  // changes immediately, but keep the prior resume snapshot until the trait stays
  // visible for this measured window. This timer never delays page publication.
  const backgroundWindowMs = 750
  let activeConfirmation: ReturnType<typeof setTimeout> | undefined
  type ResumeState = 'active' | 'hidden' | 'holding' | 'confirming'
  let state: ResumeState = 'active'
  const events: AppearanceEvent[] = []
  const record = (event: string, eventDark?: boolean) => {
    events.push({
      at: performance.now(),
      event,
      state,
      hidden: document.hidden,
      queryDark: media.matches,
      eventDark,
      heldDark: snapshot.dark,
    })
    if (events.length > 256) events.shift()
  }
  let backgroundDark = dark
  // reference accepts a conservative hold as product policy, not native trait proof.
  // 11c measured stale foreground traits for up to 1,082 ms. The first read
  // at 1,600 ms adds 518 ms of margin; a matching read at least 300 ms later
  // makes the earliest switch 1,900 ms after visibility. Hide restarts both.
  const resumeGuardMs = 1600
  const confirmationMs = 300
  let reconciliation: ReturnType<typeof setTimeout> | undefined
  let latestEvent: { dark: boolean; query: boolean } | undefined
  const save = (value: boolean) => {
    try {
      sessionStorage.setItem(key, value ? 'dark' : 'light')
    } catch {
      // Optional session recovery.
    }
  }
  let hiddenPublication = false
  const publish = (traitDark: boolean, notify = true) => {
    const nextDark = preferred === 'dark' || (preferred !== 'light' && traitDark)
    document.documentElement.dataset.satinAppearance = nextDark ? 'dark' : 'light'
    document.documentElement.dataset.satinAppearancePending = 'false'
    document.documentElement.style.colorScheme = nextDark ? 'dark' : 'light'
    if (snapshot.dark === nextDark) return
    snapshot = { dark: nextDark, pending: false }
    if (notify) for (const listener of listeners) listener()
    else hiddenPublication = true
  }
  const observe = (nextDark: boolean) => {
    systemDark = nextDark
    stableDark = nextDark
    save(nextDark)
    publish(nextDark)
  }
  const cancelReconciliation = () => {
    if (reconciliation !== undefined) clearTimeout(reconciliation)
    reconciliation = undefined
  }
  const remember = () => {
    if (state !== 'hidden') {
      backgroundDark = stableDark
      systemDark = backgroundDark
      if (activeConfirmation !== undefined) clearTimeout(activeConfirmation)
      activeConfirmation = undefined
      cancelReconciliation()
      state = 'hidden'
      record('hide')
      publish(backgroundDark, false)
    }
    document.documentElement.dataset.satinAppearanceSession = 'true'
    save(backgroundDark)
  }
  const reading = () => {
    const query = media.matches
    // Capture event.matches even when WebKit has not updated the query object.
    // A subsequent silent query update supersedes that event's query snapshot.
    return { dark: latestEvent?.query === query ? latestEvent.dark : query, query }
  }
  const confirm = () => {
    state = 'confirming'
    record('confirm-start')
    const candidate = reading()
    reconciliation = setTimeout(() => {
      reconciliation = undefined
      if (document.hidden) {
        remember()
        return
      }
      const next = reading()
      if (next.dark !== candidate.dark || next.query !== candidate.query) {
        confirm()
        return
      }
      state = 'active'
      latestEvent = undefined
      observe(next.dark)
      record('confirmed')
      document.documentElement.dataset.satinAppearanceSession = 'false'
    }, confirmationMs)
  }
  const resume = () => {
    if (document.hidden) {
      remember()
      return
    }
    if (state !== 'hidden') return
    state = 'holding'
    record('resume')
    if (hiddenPublication) {
      hiddenPublication = false
      for (const listener of listeners) listener()
    }
    reconciliation = setTimeout(() => {
      reconciliation = undefined
      confirm()
    }, resumeGuardMs)
  }
  const store: AppearanceStore = {
    setPreferredColorScheme: scheme => {
      if (scheme !== null && scheme !== 'system' && scheme !== 'light' && scheme !== 'dark') {
        throw new Error('preferredColorScheme requires light, dark, system or null.')
      }
      preferred = scheme
      publish(systemDark)
      record('preferred-color-scheme')
    },
    getSnapshot: () => snapshot,
    getDiagnostics: () => events.map(event => ({ ...event })),
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
  window.__SATIN_APPEARANCE__ = store
  document.documentElement.dataset.satinAppearanceSession = String(restored)
  publish(dark)
  record('initial')
  media.addEventListener('change', event => {
    const matches = (event as MediaQueryListEvent | undefined)?.matches
    record('media', typeof matches === 'boolean' ? matches : media.matches)
    latestEvent = {
      dark: typeof matches === 'boolean' ? matches : media.matches,
      query: media.matches,
    }
    if (document.hidden || state === 'hidden') {
      remember()
      return
    }
    if (state === 'confirming') {
      cancelReconciliation()
      confirm()
      return
    }
    if (state !== 'active') return
    // A visible system change must reach the page in this notification. Resume
    // reconciliation remains separate because WebKit can expose stale traits there.
    systemDark = reading().dark
    publish(systemDark)
    latestEvent = undefined
    record('active-published')
    if (activeConfirmation !== undefined) clearTimeout(activeConfirmation)
    activeConfirmation = setTimeout(() => {
      activeConfirmation = undefined
      if (document.hidden || state !== 'active') return
      stableDark = systemDark
      save(stableDark)
      record('active-stable')
    }, backgroundWindowMs)
  })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) remember()
    else resume()
  })
  addEventListener('pagehide', remember)
  addEventListener('pageshow', resume)
  if (document.hidden || restored) {
    remember()
    resume()
  }
  return store
}
