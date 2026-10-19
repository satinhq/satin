import { afterEach, expect, it, vi } from 'vitest'
import { installAppearanceStore } from './appearanceStore.ts'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('publishes a visible change immediately while protecting the pre-hide resume snapshot', () => {
  const state = fixture(null, true)
  const visible: boolean[] = []
  state.store.subscribe(() => visible.push(state.store.getSnapshot().dark))
  state.change(false)
  state.expectAppearance(false)
  expect(visible).toEqual([false])
  state.hide()
  state.expectAppearance(true)
  state.show()
  expect(visible).toEqual([false, true])
})

function fixture(
  saved: string | null = null,
  query = true,
  css: string = query ? 'dark' : 'light',
) {
  vi.useFakeTimers()
  const media = Object.assign(new EventTarget(), { matches: query })
  const page = Object.assign(new EventTarget(), {
    hidden: false,
    documentElement: { dataset: {}, style: {} },
    adoptedStyleSheets: [],
    head: {
      appendChild() {
        throw Error('style-src blocked inline styles')
      },
    },
    createElement: () => ({ textContent: '' }),
  })
  const browser = new EventTarget()
  const storage = new Map(saved === null ? [] : [['test', saved]])
  vi.stubGlobal('window', browser)
  vi.stubGlobal('document', page)
  vi.stubGlobal(
    'CSSStyleSheet',
    class {
      replaceSync() {}
    },
  )
  vi.stubGlobal('matchMedia', () => media)
  vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => css }))
  vi.stubGlobal('addEventListener', browser.addEventListener.bind(browser))
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => storage.get(key),
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  })
  vi.stubGlobal('localStorage', {
    getItem: () => {
      throw Error('Long-lived storage forbidden')
    },
  })
  let now = 0
  vi.stubGlobal('performance', { now: () => now })
  const frames = vi.fn()
  vi.stubGlobal('requestAnimationFrame', frames)
  const advance = (milliseconds: number) => {
    now += milliseconds
    vi.advanceTimersByTime(milliseconds)
  }
  const store = installAppearanceStore('test')
  const hide = () => {
    page.hidden = true
    page.dispatchEvent(new Event('visibilitychange'))
  }
  const show = () => {
    page.hidden = false
    page.dispatchEvent(new Event('visibilitychange'))
  }
  const change = (dark: boolean, notify = true) => {
    css = dark ? 'dark' : 'light'
    media.matches = dark
    if (notify) media.dispatchEvent(new Event('change'))
  }
  const expectAppearance = (dark: boolean) => {
    expect(store.getSnapshot()).toEqual({ dark, pending: false })
    expect(page.documentElement.dataset).toMatchObject({
      satinAppearance: dark ? 'dark' : 'light',
      satinAppearancePending: 'false',
    })
    expect(page.documentElement.style).toMatchObject({ colorScheme: dark ? 'dark' : 'light' })
  }
  return {
    media,
    page,
    browser,
    storage,
    store,
    hide,
    show,
    change,
    advance,
    frames,
    expectAppearance,
  }
}

it.each([false, true])('paints cold launch %s immediately', dark => {
  fixture(null, dark).expectAppearance(dark)
})

it.each([false, true])('uses CSS for cold launch with a stale query %s', dark => {
  fixture(null, !dark, dark ? 'dark' : 'light').expectAppearance(dark)
})

it.each([false, true])('cold launch %s does not throw when the CSS probe is unavailable', dark => {
  fixture(null, dark, '').expectAppearance(dark)
})

it.each([false, true])('holds session %s when CSS and query agree on the wrong value', dark => {
  const fixtureState = fixture(dark ? 'dark' : 'light', !dark)
  fixtureState.expectAppearance(dark)
  fixtureState.advance(1082)
  fixtureState.change(dark)
  fixtureState.advance(818)
  fixtureState.expectAppearance(dark)
  expect(fixtureState.storage.get('test')).toBe(dark ? 'dark' : 'light')
})

it.each([false, true])('unchanged %s resume has no opposite page or glass snapshot', dark => {
  const fixtureState = fixture(null, dark)
  const glassSnapshots: boolean[] = []
  fixtureState.store.subscribe(() => glassSnapshots.push(fixtureState.store.getSnapshot().dark))
  fixtureState.hide()
  fixtureState.change(!dark)
  fixtureState.show()
  for (let elapsed = 0; elapsed < 1082; elapsed++) {
    fixtureState.advance(1)
    fixtureState.expectAppearance(dark)
  }
  fixtureState.change(dark)
  fixtureState.advance(818)
  fixtureState.expectAppearance(dark)
  expect(glassSnapshots).toEqual([])
  expect(fixtureState.frames).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it.each([false, true])(
  'applies hidden genuine change from %s at 1900 ms without another event',
  dark => {
    const fixtureState = fixture(null, dark)
    const glassSnapshots: boolean[] = []
    fixtureState.store.subscribe(() => {
      const nextDark = fixtureState.store.getSnapshot().dark
      fixtureState.expectAppearance(nextDark)
      glassSnapshots.push(nextDark)
    })
    fixtureState.hide()
    fixtureState.change(!dark)
    // A new query and CSS can remain stale independently of the retained query.
    vi.stubGlobal('matchMedia', () => ({ matches: dark }))
    vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => (dark ? 'dark' : 'light') }))
    fixtureState.show()
    fixtureState.advance(1599)
    fixtureState.expectAppearance(dark)
    fixtureState.advance(301)
    fixtureState.expectAppearance(!dark)
    expect(glassSnapshots).toEqual([!dark])
  },
)

it('re-reads a hidden query update with no change event', () => {
  const fixtureState = fixture()
  fixtureState.hide()
  fixtureState.change(false, false)
  fixtureState.show()
  fixtureState.advance(1900)
  fixtureState.expectAppearance(false)
})

it.each([false, true])(
  'publishes a visible change from %s before resume persistence settles',
  dark => {
    const fixtureState = fixture(null, dark)
    expect(installAppearanceStore('other')).toBe(fixtureState.store)
    fixtureState.change(!dark)
    fixtureState.expectAppearance(!dark)
    fixtureState.advance(750)
    fixtureState.expectAppearance(!dark)
    expect(vi.getTimerCount()).toBe(0)
  },
)

it('pageshow and duplicate visibility events neither bypass nor extend the guard', () => {
  const fixtureState = fixture()
  fixtureState.hide()
  fixtureState.change(false)
  fixtureState.show()
  fixtureState.advance(750)
  fixtureState.browser.dispatchEvent(new Event('pageshow'))
  fixtureState.show()
  fixtureState.expectAppearance(true)
  expect(vi.getTimerCount()).toBe(1)
  fixtureState.advance(1150)
  fixtureState.expectAppearance(false)
})

it('cancels reconciliation on re-hide and starts a full guard on the next resume', () => {
  const fixtureState = fixture()
  fixtureState.hide()
  fixtureState.change(false)
  fixtureState.show()
  fixtureState.advance(1000)
  fixtureState.hide()
  expect(vi.getTimerCount()).toBe(0)
  fixtureState.advance(5000)
  fixtureState.show()
  fixtureState.advance(1599)
  fixtureState.expectAppearance(true)
  fixtureState.advance(301)
  fixtureState.expectAppearance(false)
})

it('pagehide owns a persisted pageshow even without visibility events', () => {
  const fixtureState = fixture()
  fixtureState.browser.dispatchEvent(new Event('pagehide'))
  fixtureState.change(false)
  fixtureState.browser.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }))
  fixtureState.expectAppearance(true)
  fixtureState.advance(1900)
  fixtureState.expectAppearance(false)
})

it.each([199, 308, 554, 749])(
  'preserves steady-visible ownership for a %i ms pre-hide transient',
  milliseconds => {
    const fixtureState = fixture()
    fixtureState.advance(1000)
    fixtureState.change(false)
    fixtureState.advance(milliseconds)
    fixtureState.hide()
    expect(fixtureState.storage.get('test')).toBe('dark')
  },
)

it('persists a steady visible change', () => {
  const fixtureState = fixture()
  fixtureState.change(false)
  fixtureState.advance(751)
  fixtureState.hide()
  expect(fixtureState.storage.get('test')).toBe('light')
})

it('confirms the expiry reading before publishing or replacing the saved appearance', () => {
  const state = fixture('dark', false)
  state.advance(1600)
  state.expectAppearance(true)
  expect(state.storage.get('test')).toBe('dark')
  state.advance(50)
  state.change(true, false)
  state.advance(250)
  state.expectAppearance(true)
  state.advance(300)
  state.expectAppearance(true)
  expect(state.storage.get('test')).toBe('dark')
})

it('guards a second load before the first load confirms its appearance', () => {
  const first = fixture('dark', false)
  first.advance(700)
  const second = fixture(first.storage.get('test') ?? null, false)
  second.expectAppearance(true)
  second.advance(1599)
  second.expectAppearance(true)
})

it('records the latest hidden and guarded change event while the query stays stale', () => {
  const state = fixture()
  state.hide()
  state.media.dispatchEvent(Object.assign(new Event('change'), { matches: false }))
  state.show()
  state.advance(1600)
  state.expectAppearance(true)
  state.advance(300)
  state.expectAppearance(false)
})

it('does not persist a transient accepted candidate when hidden during confirmation', () => {
  const state = fixture('dark', false)
  state.advance(1650)
  state.hide()
  expect(state.storage.get('test')).toBe('dark')
  expect(vi.getTimerCount()).toBe(0)
})

it('pageshow while hidden transitions to a guarded visible resume', () => {
  const state = fixture()
  state.page.hidden = true
  state.browser.dispatchEvent(new Event('pageshow'))
  state.change(false)
  state.show()
  state.expectAppearance(true)
  state.advance(1900)
  state.expectAppearance(false)
  state.change(true)
  state.advance(750)
  state.expectAppearance(true)
})

it('still launches when a head CSS probe throws', () => {
  vi.stubGlobal('getComputedStyle', () => {
    throw Error('No computed style yet')
  })
  fixture()
  delete window.__SATIN_APPEARANCE__
  vi.stubGlobal('getComputedStyle', () => {
    throw Error('No computed style yet')
  })
  expect(() => installAppearanceStore('test')).not.toThrow()
})

it('restarts confirmation when an in-guard change event arrives', () => {
  const fixtureState = fixture()
  fixtureState.hide()
  fixtureState.show()
  fixtureState.advance(1650)
  fixtureState.change(false)
  fixtureState.advance(50)
  fixtureState.expectAppearance(true)
  fixtureState.advance(250)
  fixtureState.expectAppearance(false)
})

it('records hidden flips and resume confirmation without exposing mutable log entries', () => {
  const state = fixture(null, true)
  state.hide()
  state.change(false)
  state.change(true)
  state.show()
  state.advance(1900)
  const events = state.store.getDiagnostics()
  expect(events.filter(event => event.event === 'media').map(event => event.queryDark)).toEqual([
    false,
    true,
  ])
  expect(events.find(event => event.event === 'resume')).toMatchObject({
    heldDark: true,
    hidden: false,
  })
  expect(events.at(-1)?.event).toBe('confirmed')
  ;(events[0] as { event: string }).event = 'corrupted'
  expect(state.store.getDiagnostics()[0]?.event).toBe('initial')
  for (let index = 0; index < 300; index++) state.change(index % 2 === 0)
  expect(state.store.getDiagnostics()).toHaveLength(256)
})

// This trace failed in reference: native stays dark while WebKit's light trait survives
// the old 1,600 ms publication deadline. Recovery precedes the second reference read.
it('holds a stale resume trait through 1600 ms and cancels it before publication', () => {
  const state = fixture(null, true)
  const published: boolean[] = []
  state.store.subscribe(() => published.push(state.store.getSnapshot().dark))
  state.hide()
  state.change(false)
  state.show()
  state.advance(1600)
  state.expectAppearance(true)
  state.advance(299)
  state.expectAppearance(true)
  state.change(true)
  state.advance(300)
  state.expectAppearance(true)
  expect(published).toEqual([])
  expect(state.storage.get('test')).toBe('dark')
})

it('an explicit scene scheme wins over system changes and background reconciliation', () => {
  const state = fixture(null, true)
  state.store.setPreferredColorScheme('light')
  state.expectAppearance(false)
  state.hide()
  state.show()
  state.advance(2200)
  state.expectAppearance(false)
  state.store.setPreferredColorScheme('system')
  state.expectAppearance(true)
})

it('returning to system uses the latest confirmed trait without saving the override', () => {
  const state = fixture(null, true)
  const savedSystem = state.storage.get('test')
  state.store.setPreferredColorScheme('dark')
  expect(state.storage.get('test')).toBe(savedSystem)
  state.change(false)
  state.advance(750)
  state.expectAppearance(true)
  expect(state.storage.get('test')).toBe('light')
  state.store.setPreferredColorScheme(null)
  state.expectAppearance(false)
})
