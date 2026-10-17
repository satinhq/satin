import { usePadSearchFieldMotion } from './usePadSearchFieldMotion.ts'
import {
  PadSearchPresentationContext,
  PadSearchTabContext,
} from './PadSearchPresentationContext.tsx'
import { useContext, useLayoutEffect, useRef, useSyncExternalStore, type RefObject } from 'react'
import { readDeviceIdiom } from '../layout/deviceIdiom.ts'
import { createPortal } from 'react-dom'
import { GlassBackground } from '../glass/GlassEffect.tsx'
import { MaterialEffectContext } from '../glass/liquidContext.ts'
import { NavigatorContext, ScreenContext } from '../navigation/navigationContext.tsx'
import { Pressable } from '../press/Pressable.tsx'
import {
  contactTarget,
  MENU_CONTACT_CLICK_WINDOW_MS,
  ownPhysicalContact,
} from '../press/contactReceipt.ts'
import { focusFromFramework } from '../focus/programmaticFocus.ts'
import { SymbolImage } from '../symbols/Symbol.tsx'
import { TextField } from '../text-input/TextField.tsx'
import { SearchSuggestionsPopover } from './SearchSuggestionsPopover.tsx'
import { SearchScopesBar } from './SearchScopesBar.tsx'
import type { Searchable } from './searchable.ts'
import { navigationChromeOf, ownBarParts, stackedOver, subscribeNever } from './searchChrome.ts'
import { useSearchPresentation } from './useSearchPresentation.ts'

/*
 * A `searchable` field in the bottom toolbar (iOS 27.0 native reference, iPhone 17 Pro Max):
 * - at rest, a 48 pt glass capsule in the bottom bar (28,880 384x48 alone; 324x48 beside a compose
 *   circle), the magnifier 12 pt in and the prompt 40.67 pt in;
 * - presented, the field rides 8 pt above the keyboard (8,551 364x48) with a 48 pt glass close
 *   circle 12 pt after it; the screen's title and bar items, including its other bottom items,
 *   give way, and the content starts at the safe area top.
 *
 * `host` is the screen's bottom toolbar slot, or the element a `DefaultToolbarItem kind="search"`
 * placed among the bottom items. Suggestions stand in for the scroll view's content, as in the
 * drawer. Presentation is not animated yet: native's motion is not measured (spec notes, reference).
 */
export function SearchToolbarField({
  configuration,
  scroller,
  host,
  navigation = false,
  drawer = false,
}: {
  configuration: Searchable
  scroller: RefObject<HTMLDivElement | null>
  host: HTMLElement
  navigation?: boolean
  drawer?: boolean
}) {
  const tabSearch = useContext(PadSearchPresentationContext)
  const searchTab = useContext(PadSearchTabContext)
  const setSearchOwner = tabSearch?.setOwner
  const liquid = useContext(MaterialEffectContext)
  const navigator = useContext(NavigatorContext)
  const screenKey = useContext(ScreenContext)?.key
  const stacked = useSyncExternalStore(navigator?.subscribe ?? subscribeNever, () =>
    stackedOver(navigator, screenKey, scroller.current),
  )
  const inputRef = useRef<HTMLInputElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const pad = navigation && readDeviceIdiom() === 'pad'
  const search = useSearchPresentation(configuration, inputRef, pad)
  const { presented } = search
  usePadSearchFieldMotion(rowRef, pad && !drawer, presented, searchTab !== null, liquid?.regions)
  useLayoutEffect(() => {
    if (!pad || !searchTab || !setSearchOwner || !presented || stacked) return
    setSearchOwner(searchTab)
    return () => setSearchOwner(null)
  }, [pad, searchTab, setSearchOwner, presented, stacked])

  // The bar's title and items give way while search is presented; its back control too, unless a
  // screen is stacked over this one (as the drawer, SearchDrawer.tsx).
  useLayoutEffect(() => {
    const element = scroller.current
    if (!element || (navigation && !drawer)) return
    element.toggleAttribute('data-satin-search-presented', presented)
    const { header } = navigationChromeOf(element)
    const parts = ownBarParts(header, screenKey)
    for (const part of parts) part.toggleAttribute('data-satin-search-presented', presented)
    const hidesBar = presented && !stacked
    if (header) {
      if (hidesBar) header.setAttribute('data-satin-search-presented', 'toolbar')
      else header.removeAttribute('data-satin-search-presented')
    }
    return () => {
      element.removeAttribute('data-satin-search-presented')
      for (const part of parts) part.removeAttribute('data-satin-search-presented')
      header?.removeAttribute('data-satin-search-presented')
    }
  }, [presented, scroller, screenKey, stacked, navigation, drawer])

  // The field moves with the keyboard on the keyboard's own curve (styles.css). Glass regions
  // follow a moving element only when told: refresh them while it moves.
  useLayoutEffect(() => {
    const row = rowRef.current?.closest<HTMLElement>('[data-satin-navigation-toolbar-slot]')
    if (!row || !liquid?.regions) return
    const regions = liquid.regions
    let frame = 0
    let moving = 0
    const tick = () => {
      regions.invalidate()
      frame = moving > 0 ? requestAnimationFrame(tick) : 0
    }
    const start = () => {
      moving++
      if (!frame) frame = requestAnimationFrame(tick)
    }
    const end = () => {
      moving = Math.max(0, moving - 1)
      regions.invalidate()
    }
    regions.invalidate()
    row.addEventListener('transitionrun', start)
    row.addEventListener('transitionend', end)
    row.addEventListener('transitioncancel', end)
    return () => {
      cancelAnimationFrame(frame)
      row.removeEventListener('transitionrun', start)
      row.removeEventListener('transitionend', end)
      row.removeEventListener('transitioncancel', end)
    }
  }, [liquid?.regions, presented])

  const prompt = configuration.prompt ?? 'Search'
  const ownsItem = !host.hasAttribute('data-satin-search-toolbar-host')
  const row = (
    <div
      ref={rowRef}
      role="search"
      data-satin-search-toolbar=""
      data-satin-search-navigation={navigation || undefined}
      data-satin-search-pad={pad || undefined}
      data-satin-search-toolbar-presented={presented || undefined}
    >
      <div data-satin-search-toolbar-field="">
        <GlassBackground shape="capsule" />
        <SymbolImage
          name="magnifyingglass"
          weight="medium"
          data-satin-search-toolbar-magnifier=""
        />
        <TextField
          ref={inputRef}
          label={prompt}
          labelVisibility="hidden"
          variant="plain"
          placeholder={prompt}
          kind="search"
          submitLabel="search"
          value={configuration.text}
          onChange={search.change}
          onFocus={search.present}
          onBlur={pad ? search.resign : undefined}
          onSubmit={search.submit}
          onKeyDown={event => {
            if (event.key !== 'Escape' || event.nativeEvent.isComposing) return
            event.preventDefault()
            search.dismiss()
          }}
        />
        {configuration.text && (
          <Pressable
            iconOnly
            aria-label="Clear text"
            data-satin-search-toolbar-clear=""
            onPress={() => {
              if (pad && searchTab) {
                search.dismiss()
                return
              }
              search.change('')
              if (inputRef.current) focusFromFramework(inputRef.current)
            }}
          >
            <SymbolImage name="xmark.circle.fill" />
          </Pressable>
        )}
      </div>
      {presented && !pad && (
        <Pressable
          iconOnly
          aria-label="Close"
          data-satin-search-toolbar-close=""
          data-satin-glass-press="true"
          onPress={() => {
            // The touch ends here: WebKit's synthesized mouse events must not refocus the field
            // that moves under the finger (as the drawer's close button).
            ownPhysicalContact(contactTarget(), closeContactOwner, MENU_CONTACT_CLICK_WINDOW_MS, {
              suppressTouchEnd: true,
            })
            search.dismiss()
          }}
        >
          <GlassBackground shape="circle" interactive />
          <SymbolImage name="xmark" weight="medium" />
        </Pressable>
      )}
    </div>
  )
  const suggestions = search.suggestions.map(suggestion => (
    <Pressable
      key={suggestion.id}
      role="listitem"
      feedback="row"
      data-satin-search-suggestion=""
      onPress={() => search.complete(suggestion)}
    >
      {suggestion.label ?? suggestion.text}
    </Pressable>
  ))
  return (
    <>
      {createPortal(
        ownsItem ? (
          <div
            data-satin-toolbar-item="search"
            data-satin-search-pad-item={pad || undefined}
            data-satin-search-expanded={(pad && presented) || undefined}
          >
            {row}
          </div>
        ) : (
          row
        ),
        host,
      )}
      {navigation && (!pad || drawer) && configuration.scopes && presented && (
        <div data-satin-search-navigation-scopes="" data-satin-search-presented="">
          <SearchScopesBar scopes={configuration.scopes} presented={presented} />
        </div>
      )}
      {/* Mounted only while shown: the content's first-child geometry rules stay intact. */}
      {search.suggestions.length > 0 &&
        (pad ? (
          <SearchSuggestionsPopover anchor={rowRef}>{suggestions}</SearchSuggestionsPopover>
        ) : (
          <div data-satin-search-suggestions="" role="list" aria-label="Suggestions">
            {suggestions}
          </div>
        ))}
    </>
  )
}

const closeContactOwner = {}
