import { readDeviceIdiom } from '../layout/deviceIdiom.ts'
import { PadSearchDrawer } from './PadSearchDrawer.tsx'
import { NavigationSearchRow, navigationSearchRowOf } from '../navigation/NavigationSearchRow.tsx'
import { animateElement } from '../motion/animate.ts'
import { beginSearchBackdrop, endSearchBackdrop, refreshSearchBackdrop } from './searchBackdrop.ts'
import {
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react'
import { GlassBackground } from '../glass/GlassEffect.tsx'
import { MaterialEffectContext } from '../glass/liquidContext.ts'
import { SearchScopesBar } from './SearchScopesBar.tsx'
import { Pressable } from '../press/Pressable.tsx'
import {
  contactTarget,
  MENU_CONTACT_CLICK_WINDOW_MS,
  ownPhysicalContact,
} from '../press/contactReceipt.ts'
import { focusFromFramework } from '../focus/programmaticFocus.ts'
import { NavigatorContext, ScreenContext } from '../navigation/navigationContext.tsx'
import type { NavigatorStore } from '../navigation/store.ts'
import { SymbolImage } from '../symbols/Symbol.tsx'
import { TextField } from '../text-input/TextField.tsx'
import { validateSearchPresentation, type Searchable } from './searchable.ts'
import { useSearchPresentation } from './useSearchPresentation.ts'
import {
  SEARCH_FIELD_SPRING,
  SEARCH_SCOPES_IN_SPRING,
  SEARCH_TITLE_IN_SPRING,
  sampledKeyframes,
  searchSpring,
  springTrack,
  springVelocity,
  titleFadeOpacity,
  barItemsFadeOpacity,
  type SpringTrack,
} from './searchMotion.ts'
import type { MenuSpring } from '../glass/lens/menuSpring.ts'

/** Scroll distance over which a pinned field turns from its grey fill to glass, like the bar's
 * scroll edge (navigation/scrollEdge.ts). */
const PIN_RAMP_PX = 8

const TITLE_SELECTOR = ':scope > :is([data-satin-list-title], [data-satin-scroll-title])'

type Running = { animations: Animation[]; spring: MenuSpring; startedAt: number; travel: number }

/**
 * The navigation bar drawer of a screen's primary scroll view: the search field under the title,
 * its close button and scope bar, and the suggestions that stand in for the content.
 *
 * Every element keeps its place in the DOM in both states, so presenting or dismissing never
 * inserts or removes chrome. The two layouts are CSS states of the scroll view
 * (`data-satin-search-presented`), and the change between them is animated from the measured
 * visual state of each part (FLIP), on the native springs (searchMotion.ts). A retarget mid-way
 * starts from where everything is on screen, keeping the field's velocity.
 */
export function SearchDrawer(props: {
  configuration: Searchable
  scroller: RefObject<HTMLDivElement | null>
}) {
  return readDeviceIdiom() === 'pad' ? (
    <PadSearchDrawer {...props} />
  ) : (
    <PhoneSearchDrawer {...props} />
  )
}

function PhoneSearchDrawer({
  configuration,
  scroller,
}: {
  configuration: Searchable
  scroller: RefObject<HTMLDivElement | null>
}) {
  validateSearchPresentation(configuration)
  const liquid = useContext(MaterialEffectContext)
  const navigator = useContext(NavigatorContext)
  const screenKey = useContext(ScreenContext)?.key
  const stacked = useSyncExternalStore(navigator?.subscribe ?? subscribeNever, () =>
    stackedOver(navigator, screenKey, scroller.current),
  )
  const drawerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { presented, present, dismiss, change, submit, complete, suggestions } =
    useSearchPresentation(configuration, inputRef)
  const [animating, setAnimating] = useState(false)
  const running = useRef<Running | null>(null)
  const appliedPresented = useRef<boolean | null>(null)
  const liquidRef = useRef(liquid)
  useLayoutEffect(() => {
    liquidRef.current = liquid
  })

  useLayoutEffect(() => {
    const element = scroller.current
    const drawer = drawerRef.current
    if (!element || !drawer || appliedPresented.current === presented) return
    const animate = appliedPresented.current !== null
    appliedPresented.current = presented
    if (animate) {
      beginSearchBackdrop(element)
      element.setAttribute('data-satin-search-moving', '')
    }
    const result = transition(element, drawer, presented, animate, running.current)
    running.current = result
    if (!result) {
      endSearchBackdrop(element)
      element.removeAttribute('data-satin-search-moving')
      return
    }
    setAnimating(true)
    let frame = 0
    // The glass renderer follows CSS motion by itself; WAAPI motion needs its regions refreshed.
    const refresh = () => {
      refreshSearchBackdrop(element)
      element.dispatchEvent(new Event('satin:search-geometry'))
      liquidRef.current?.regions?.invalidate()
      frame = requestAnimationFrame(refresh)
    }
    frame = requestAnimationFrame(refresh)
    let cancelled = false
    void Promise.all(result.animations.map(animation => animation.finished)).then(
      () => {
        if (cancelled || running.current !== result) return
        running.current = null
        element.removeAttribute('data-satin-search-moving')
        cancelAnimationFrame(frame)
        endSearchBackdrop(element)
        element.dispatchEvent(new Event('satin:search-geometry'))
        liquidRef.current?.regions?.invalidate()
        setAnimating(false)
      },
      () => {},
    )
    return () => {
      cancelled = true
      endSearchBackdrop(element)
      element.removeAttribute('data-satin-search-moving')
      cancelAnimationFrame(frame)
    }
  }, [presented, scroller])

  // The bar's own title and items give way to the field while search is presented. The rest of
  // the shared bar (back control, scroll edge) gives way only while no screen is stacked over this
  // one: a screen pushed over it draws its bar from the push's first frame, and a pop keeps the
  // popped screen's bar until that screen is gone (native; owner recording 2026-10-09 04:18).
  useLayoutEffect(() => {
    const element = scroller.current
    if (!element) return
    const { header, edge } = navigationChromeOf(element)
    const parts = ownBarParts(header, screenKey)
    for (const part of parts) part.toggleAttribute('data-satin-search-presented', presented)
    for (const node of [header, edge]) {
      if (!node) continue
      node.toggleAttribute('data-satin-search-presented', presented && !stacked)
      if (node === header) node.inert = presented && !stacked
    }
    return () => {
      for (const part of parts) part.removeAttribute('data-satin-search-presented')
      header?.removeAttribute('data-satin-search-presented')
      edge?.removeAttribute('data-satin-search-presented')
      if (header) header.inert = false
    }
  }, [presented, scroller, screenKey, stacked])

  // Content scrolled under the pinned field draws its edge material. The field itself is glass
  // whenever it sits in the bar: from the start when the drawer is fixed under an inline title,
  // otherwise once it pins (fieldGlassProgress).
  const fixedDrawer = configuration.placement === 'navigationBarDrawer'
  useLayoutEffect(() => {
    const element = scroller.current
    const drawer = drawerRef.current
    if (!element || !drawer) return
    let appliedPin = -1
    let appliedGlass = -1
    const update = () => {
      if (running.current) return
      const pin = fixedDrawer || presented ? pinProgress(drawer) : 0
      const glass = fieldGlassProgress(element, pin, fixedDrawer)
      if (pin === appliedPin && glass === appliedGlass) return
      appliedPin = pin
      appliedGlass = glass
      drawer.toggleAttribute('data-satin-search-pinned', glass > 0)
      drawer.style.setProperty('--satin-search-pin', String(pin))
      drawer.style.setProperty('--satin-search-glass', String(glass))
      ;(drawer.nextElementSibling as HTMLElement | null)?.style.setProperty(
        '--satin-search-pin',
        String(pin),
      )
    }
    update()
    element.addEventListener('scroll', update, { passive: true })
    const resize = new ResizeObserver(update)
    resize.observe(element)
    return () => {
      drawer.removeAttribute('data-satin-search-pinned')
      element.removeEventListener('scroll', update)
      resize.disconnect()
    }
  }, [scroller, animating, fixedDrawer, presented])

  const prompt = configuration.prompt ?? 'Search'
  const scopes = configuration.scopes
  return (
    <>
      <div
        ref={drawerRef}
        role="search"
        data-satin-search=""
        data-satin-search-automatic={!fixedDrawer || undefined}
        data-satin-search-scoped={scopes ? 'true' : undefined}
      >
        <NavigationSearchRow>
          <div data-satin-search-field="">
            <span data-satin-search-fill="" aria-hidden="true" />
            {/* Prepare the material with the resting field. Focus changes its opacity,
                not its lifetime, so the entrance never waits for a new presenter. */}
            <GlassBackground shape="capsule" recipe="searchField" />
            <SymbolImage name="magnifyingglass" weight="medium" data-satin-search-magnifier="" />
            <TextField
              ref={inputRef}
              label={prompt}
              labelVisibility="hidden"
              variant="plain"
              placeholder={prompt}
              kind="search"
              submitLabel="search"
              value={configuration.text}
              onChange={change}
              onFocus={present}
              onSubmit={submit}
              onKeyDown={event => {
                if (event.key !== 'Escape' || event.nativeEvent.isComposing) return
                event.preventDefault()
                dismiss()
              }}
            />
            {configuration.text && (
              <Pressable
                iconOnly
                aria-label="Clear text"
                data-satin-search-clear=""
                onPress={() => {
                  change('')
                  if (inputRef.current) focusFromFramework(inputRef.current)
                }}
              >
                <SymbolImage name="xmark.circle.fill" />
              </Pressable>
            )}
          </div>
          <Pressable
            iconOnly
            aria-label="Close"
            data-satin-search-close=""
            data-satin-glass-press="true"
            disabled={!presented}
            onPress={() => {
              // The field widens under the finger as the button leaves. WebKit's synthesized
              // mouse events for this same touch would then focus the field and reopen search
              // (owner, Music, Oct 9): this touch ends here.
              ownPhysicalContact(contactTarget(), closeContactOwner, MENU_CONTACT_CLICK_WINDOW_MS, {
                suppressTouchEnd: true,
              })
              dismiss()
            }}
          >
            <GlassBackground shape="circle" interactive />
            <SymbolImage name="xmark" weight="medium" />
          </Pressable>
        </NavigationSearchRow>
        {scopes && <SearchScopesBar scopes={scopes} presented={presented} />}
      </div>
      {/* The scroll edge material under a pinned field: below pinned section headers, above rows. */}
      <div data-satin-search-edge="" aria-hidden="true" />
      <div
        data-satin-search-suggestions=""
        role="list"
        aria-label="Suggestions"
        hidden={suggestions.length === 0}
      >
        {suggestions.map(suggestion => (
          <Pressable
            key={suggestion.id}
            role="listitem"
            feedback="row"
            data-satin-search-suggestion=""
            onPress={() => complete(suggestion)}
          >
            {suggestion.label ?? suggestion.text}
          </Pressable>
        ))}
      </div>
    </>
  )
}

const closeContactOwner = {}

function navigationChromeOf(element: HTMLElement) {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const header = node.querySelector<HTMLElement>(':scope > [data-satin-navigation-chrome]')
    if (header) {
      const edge = node.querySelector<HTMLElement>(':scope > [data-satin-navigation-edge-host]')
      return { header, edge }
    }
  }
  return { header: null, edge: null }
}

const subscribeNever = () => () => {}

/** A screen entering, settled or leaving over this one in its pane (a split sidebar has none). */
function stackedOver(
  navigator: NavigatorStore | undefined,
  key: string | undefined,
  scroller: HTMLElement | null,
) {
  if (!navigator || !key) return false
  const pane = scroller?.closest<HTMLElement>('[data-satin-screen-container]')?.dataset.satinPane
  if (pane === 'sidebar') return false
  const entries = navigator.getState().entries
  const index = entries.findIndex(entry => entry.key === key)
  return index >= 0 && index < entries.length - 1
}

/** This screen's own title layer and toolbar in the shared bar. */
function ownBarParts(header: HTMLElement | null, key: string | undefined) {
  if (!header || !key) return []
  const parts = header.querySelectorAll<HTMLElement>(
    '[data-satin-navigation-title-key], [data-satin-entry-toolbar]',
  )
  return [...parts].filter(
    part => (part.dataset.satinNavigationTitleKey ?? part.dataset.satinEntryToolbar) === key,
  )
}

/** How far content has scrolled under the drawer, as 0 to 1 over PIN_RAMP_PX. */
function pinProgress(drawer: HTMLElement) {
  const content = contentElements(drawer)[0]
  if (!content) return 0
  const covered = drawer.getBoundingClientRect().bottom - content.getBoundingClientRect().top
  return Math.min(1, Math.max(0, covered / PIN_RAMP_PX))
}

/* How far the resting field has turned from its grey fill to glass. The field is glass from
 * scroll 0 only when the drawer is fixed in the bar: an explicit `navigationBarDrawer` placement
 * with persistent visibility under an inline or inlineLarge title (native reference reference and reference
 * B/H, iOS 27.0: light 251 with a darker rim, dark 32 with a light rim). Under a large title the
 * field belongs to the content header, and an automatic placement's drawer scrolls away with the
 * content; both are a grey fill until content scrolls under the field (reference A/C/D/G: light 228-239,
 * dark 28). */
function fieldGlassProgress(scroller: HTMLElement, pin: number, fixedDrawer: boolean) {
  const navigation = scroller.dataset.satinListNavigation ?? scroller.dataset.satinScrollNavigation
  return fixedDrawer && navigation === 'inline' ? 1 : pin
}

/** The scroll view's content after the drawer: the suggestions, or the app's own content. */
function contentElements(drawer: HTMLElement) {
  const elements: HTMLElement[] = []
  for (let node = drawer.nextElementSibling; node; node = node.nextElementSibling) {
    if (node.hasAttribute('data-satin-search-edge')) continue
    if (node instanceof HTMLElement && node.getClientRects().length > 0) elements.push(node)
  }
  return elements
}

type Box = { top: number; left: number; width: number }
const box = (element: Element): Box => {
  const rect = element.getBoundingClientRect()
  return { top: rect.top, left: rect.left, width: rect.width }
}
const opacityOf = (element: Element) => Number(getComputedStyle(element).opacity)

function transition(
  scroller: HTMLElement,
  drawer: HTMLElement,
  presented: boolean,
  animate: boolean,
  previous: Running | null,
): Running | null {
  if (!animate && !presented) return null
  const row = navigationSearchRowOf(drawer)!
  const field = row.querySelector<HTMLElement>('[data-satin-search-field]')!
  const fill = row.querySelector<HTMLElement>('[data-satin-search-fill]')!
  const material = field.querySelector<HTMLElement>('[data-satin-glass-region-canvas]')
  const close = row.querySelector<HTMLElement>('[data-satin-search-close]')!
  const scopes = drawer.querySelector<HTMLElement>('[data-satin-search-scopes]')
  const title = drawer.parentElement?.querySelector<HTMLElement>(TITLE_SELECTOR) ?? null
  const edge = drawer.nextElementSibling?.matches('[data-satin-search-edge]')
    ? drawer.nextElementSibling
    : null
  const { header } = navigationChromeOf(scroller)

  // 1. Where everything is on screen now, including any motion still running.
  const before = {
    drawer: box(drawer),
    edge: edge ? box(edge) : undefined,
    field: box(field),
    close: box(close),
    title: title ? box(title) : undefined,
    content: new Map(contentElements(drawer).map(element => [element, box(element).top])),
    opacity: {
      fill: opacityOf(fill),
      material: material ? opacityOf(material) : 0,
      close: opacityOf(close),
      scopes: scopes ? opacityOf(scopes) : 0,
      title: title ? opacityOf(title) : 0,
      header: header ? opacityOf(header) : 1,
    },
  }
  const pixelVelocity = previous ? fieldPixelVelocity(previous) : 0
  for (const animation of previous?.animations ?? []) animation.cancel()

  // 2. Switch layouts, keeping the content where it is unless the list rests at its top.
  const anchor = contentElements(drawer)[0]
  const anchorBefore = anchor ? box(anchor).top : 0
  const scrollBefore = scroller.scrollTop
  scroller.toggleAttribute('data-satin-search-presented', presented)
  drawer.toggleAttribute('data-satin-search-presented', presented)
  const anchorAfter = anchor?.isConnected ? box(anchor).top : anchorBefore
  const keepContent = presented || scrollBefore > 1
  scroller.scrollTop = keepContent ? Math.max(0, scrollBefore + anchorAfter - anchorBefore) : 0
  if (!animate) return null

  // 3. Animate every part from where it was to its new place.
  const after = { drawer: box(drawer), field: box(field), close: box(close) }
  const travel = before.drawer.top - after.drawer.top
  const spring = searchSpring(SEARCH_FIELD_SPRING, travel ? pixelVelocity / travel : 0)
  const track = springTrack(spring)
  const animations: Animation[] = []
  const run = (element: Element, keyframes: Keyframe[], duration = track.duration) =>
    animations.push(animateElement(element, keyframes, { duration, easing: 'linear' }))

  run(drawer, translateFrames(track, 0, travel))
  if (edge && before.edge) run(edge, translateFrames(track, 0, before.edge.top - box(edge).top))
  run(
    field,
    sampledKeyframes(track, progress => ({
      width: `${before.field.width + (after.field.width - before.field.width) * progress}px`,
    })),
  )
  const closeX = before.close.left - after.close.left
  const closeY = before.close.top - after.close.top - travel
  run(
    close,
    sampledKeyframes(track, progress => ({
      transform: `translate(${closeX * (1 - progress)}px, ${closeY * (1 - progress)}px)`,
      opacity: mix(before.opacity.close, presented ? 1 : 0, progress),
      visibility: 'inherit',
    })),
  )
  run(fill, fadeFrames(track, before.opacity.fill, opacityOf(fill)))
  if (material) run(material, fadeFrames(track, before.opacity.material, opacityOf(material)))

  for (const [element, top] of before.content) {
    if (!element.isConnected || element.getClientRects().length === 0) continue
    run(element, translateFrames(track, 0, top - box(element).top))
  }
  // Suggestions that appear with the change start where the content started.
  const firstBefore = [...before.content.values()][0]
  for (const element of contentElements(drawer)) {
    if (before.content.has(element) || firstBefore === undefined) continue
    run(element, translateFrames(track, 0, firstBefore - box(element).top))
  }

  if (presented) {
    // The title rides up with the field and fades with its travel; the bar's own title and items
    // fade with it, faster (native exp(-travel / 9.5 pt)).
    if (title && before.title) {
      const offset = before.title.top - box(title).top
      run(
        title,
        sampledKeyframes(track, progress => ({
          transform: `translateY(${offset - travel * progress}px)`,
          opacity: before.opacity.title * titleFadeOpacity(travel * progress),
        })),
      )
    }
    if (header) {
      run(
        header,
        sampledKeyframes(track, progress => ({
          opacity: before.opacity.header * barItemsFadeOpacity(travel * progress),
        })),
      )
    }
    if (scopes) {
      const scopesTrack = springTrack(searchSpring(SEARCH_SCOPES_IN_SPRING))
      run(
        scopes,
        sampledKeyframes(scopesTrack, progress => ({
          opacity: mix(before.opacity.scopes, 1, progress),
          visibility: 'inherit',
        })),
        scopesTrack.duration,
      )
    }
  } else {
    // The scope bar is gone on the first frame; the title rides down with the field and fades
    // in on its own delayed spring, as do the bar's items.
    const titleTrack = springTrack(searchSpring(SEARCH_TITLE_IN_SPRING))
    if (title) {
      const fade = sampledKeyframes(titleTrack, progress => ({
        opacity: mix(before.opacity.title, 1, progress),
      }))
      run(title, fade, titleTrack.duration)
      run(title, translateFrames(track, 0, travel), track.duration)
    }
    if (header) {
      run(
        header,
        sampledKeyframes(titleTrack, progress => ({
          opacity: mix(before.opacity.header, 1, progress),
        })),
        titleTrack.duration,
      )
    }
  }
  return { animations, spring, startedAt: performance.now(), travel }
}

/** The field's vertical velocity on screen (points per second) in a running transition. */
function fieldPixelVelocity(previous: Running) {
  const elapsed = performance.now() - previous.startedAt
  return previous.travel * springVelocity(previous.spring, elapsed)
}

function translateFrames(track: SpringTrack, from: number, delta: number) {
  return sampledKeyframes(track, progress => ({
    transform: `translateY(${from + delta * (1 - progress)}px)`,
  }))
}

function fadeFrames(track: SpringTrack, from: number, to: number) {
  return sampledKeyframes(track, progress => ({ opacity: mix(from, to, progress) }))
}

const mix = (from: number, to: number, progress: number) => from + (to - from) * progress
