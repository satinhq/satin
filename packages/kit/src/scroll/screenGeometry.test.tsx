import { readFileSync } from 'node:fs'
// @vitest-environment happy-dom
import { act, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MaterialEffectContext } from '../glass/liquidContext.ts'
import { List, Section } from '../list-form/ListForm.tsx'
import { NavigatorHost } from '../navigation/NavigatorHost.tsx'
import { createScreenRegistry, defineScreen } from '../navigation/registry.ts'
import { createNavigator } from '../navigation/store.ts'
import {
  Screen,
  ScreenChromeContext,
  ToolbarItem,
  ToolbarItemGroup,
  ToolbarSpacer,
  createScreenChrome,
  screenNavigation,
} from '../public/chrome.tsx'
import { List as PublicList } from '../public/controls.tsx'
import { ScrollSurface } from './ScrollSurface.tsx'
import { observeListLayoutMargins } from './screenGeometry.ts'
import type { TransitionController } from '../navigation/types.ts'
import { SafeAreaInset } from '../safe-area/SafeAreaInset.tsx'
import {
  ContentMargins,
  IgnoresSafeArea,
  SafeAreaBar,
  SafeAreaPadding,
} from '../safe-area/modifiers.tsx'

vi.mock('../glass/GlassEffect.tsx', () => ({
  GlassBackground: () => null,
  ToolbarGroup: ({ children }: { children: ReactNode }) => children,
  ToolbarSpacer: () => null,
  GlassEffect: ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
    <div style={style}>{children}</div>
  ),
  GlassLayer: ({ children }: HTMLAttributes<HTMLDivElement>) => <div>{children}</div>,
}))
vi.mock('../root/runtimeContext.ts', () => ({
  useLayoutClass: () => ({ horizontal: 'compact' }),
  useSatinLayoutRuntime: () => ({
    layoutClass: { horizontal: 'compact' },
    metrics: { layoutViewport: { width: 440 }, screen: { width: 440, height: 956 } },
  }),
}))
vi.mock('../reachability/react.tsx', () => ({
  ReachabilityRoute: ({ children }: { children: ReactNode }) => children,
}))

let root: Root, element: HTMLDivElement
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  // happy-dom has no layout: text-bearing boxes occupy flow, as they do in WebKit.
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.textContent ? 20 : 0
  })
  element = document.createElement('div')
  document.body.append(element)
  root = createRoot(element)
})
afterEach(() => {
  act(() => root.unmount())
  element.remove()
  vi.restoreAllMocks()
})

function mount(component: () => ReactNode, navigation: Record<string, unknown>) {
  const registry = createScreenRegistry(
    defineScreen('screen', { component, navigation: { title: 'Library', ...navigation } }),
  )
  const navigator = createNavigator({ registry, initial: { id: 'screen' } })
  act(() =>
    root.render(
      <MaterialEffectContext value={{ ready: true, regions: { invalidate: () => {} } } as never}>
        <ScreenChromeContext value={createScreenChrome()}>
          <NavigatorHost navigator={navigator} />
        </ScreenChromeContext>
      </MaterialEffectContext>,
    ),
  )
  return (id: string) => element.querySelector<HTMLElement>(`[data-satin-scroll="${id}"]`)!
}

it('a ScrollView that starts the screen is primary and takes the large title and bar inset', () => {
  // reference: Postcards and Music fell back to a List because a ScrollView never got the title.
  const scroller = mount(
    () => (
      <Screen title="Library" titleDisplay="large">
        <ScrollSurface id="library" axis="vertical">
          <p>Chapter 1</p>
        </ScrollSurface>
      </Screen>
    ),
    { display: 'large' },
  )('library')
  expect(scroller.dataset.satinPrimary).toBe('true')
  expect(scroller.dataset.satinScrollNavigation).toBe('large')
  expect(scroller.querySelector('h1')?.textContent).toBe('Library')
})

it('a Form below a header keeps its own frame; the screen lays out under the bar', () => {
  // reference nested Form: native gives it no bar inset and puts the header in the safe area.
  const scroller = mount(
    () => (
      <Screen>
        <p>Header above the form</p>
        <List id="nested">First row</List>
      </Screen>
    ),
    { display: 'inline' },
  )('nested')
  expect(scroller.dataset.satinPrimary).toBe('false')
  expect(scroller.hasAttribute('data-satin-list-navigation')).toBe(false)
  const layer = element.querySelector<HTMLElement>('[data-satin-navigation-motion-layer]')
  expect(layer?.dataset.satinScreenScroll).toBe('none')
})

it('a bottomBar toolbar item insets the primary scroll view; a hidden bar reserves no row', () => {
  const scroller = mount(
    () => (
      <Screen
        toolbarVisibility="hidden"
        toolbar={
          <ToolbarItem placement="bottomBar">
            <button>Edit</button>
          </ToolbarItem>
        }
      >
        <ScrollSurface id="library" axis="vertical">
          <p>Chapter 1</p>
        </ScrollSurface>
      </Screen>
    ),
    { display: 'inline' },
  )('library')
  expect(scroller.dataset.satinBottomBar).toBe('true')
  expect(scroller.dataset.satinScrollNavigation).toBe('hidden')
  const header = element.querySelector<HTMLElement>('[data-satin-navigation-chrome]')
  expect(header?.dataset.satinNavigationBarHidden).toBe('true')
  // Content meets the status band: the band keeps its seam fade instead of a hard cut.
  const edgeHost = element.querySelector('[data-satin-navigation-edge-host]')
  expect(edgeHost?.hasAttribute('data-satin-edge-seam')).toBe(true)
})

it('restores the album top fade after pushing, popping and re-pushing from a scrolled root', () => {
  const stylesheet = document.createElement('style')
  stylesheet.textContent = readFileSync('src/styles.css', 'utf8')
  document.head.append(stylesheet)
  document.documentElement.dataset.satinViewportFit = 'auto'
  element.dataset.satinFullBleed = 'true'
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (
    this: HTMLElement,
  ) {
    return (this.closest('[hidden]')
      ? []
      : [this.getBoundingClientRect()]) as unknown as DOMRectList
  })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const scroll = this.closest<HTMLElement>('[data-satin-primary="true"]')
    const top = scroll?.dataset.satinScroll === 'home' ? 116 - scroll.scrollTop : 0
    return new DOMRect(0, top, 440, 100)
  })
  const controllers: TransitionController[] = []
  const registry = createScreenRegistry(
    defineScreen('home', {
      navigation: { title: 'Home', display: 'large' },
      component: () => (
        <ScrollSurface id="home" axis="vertical">
          <p>Albums</p>
        </ScrollSurface>
      ),
    }),
    defineScreen('album', {
      navigation: { title: 'Album', display: 'inline' },
      component: () => (
        <IgnoresSafeArea edges="top">
          <ScrollSurface id="album" axis="vertical">
            <p>Artwork</p>
          </ScrollSurface>
        </IgnoresSafeArea>
      ),
    }),
  )
  const navigator = createNavigator({
    registry,
    initial: { id: 'home' },
    transitionControllerFactory: completion => {
      const controller: TransitionController = {
        progress: 0,
        finish: () => completion.finish(),
        cancel: () => completion.cancel(),
      }
      controllers.push(controller)
      return controller
    },
  })
  try {
    act(() =>
      root.render(
        <MaterialEffectContext value={{ ready: true, regions: { invalidate: () => {} } } as never}>
          <ScreenChromeContext value={createScreenChrome()}>
            <NavigatorHost navigator={navigator} />
          </ScreenChromeContext>
        </MaterialEffectContext>,
      ),
    )
    const home = element.querySelector<HTMLElement>('[data-satin-scroll="home"]')!
    home.scrollTop = 500
    act(() => home.dispatchEvent(new Event('scroll')))
    for (let entry = 0; entry < 2; entry++) {
      act(() => navigator.push('album'))
      act(() => controllers.at(-1)!.finish())
      const seam = element.querySelector<HTMLElement>(
        '[data-satin-navigation-edge-host]:not([data-satin-transition-edge]) [data-satin-scroll-edge-seam]',
      )!
      expect(getComputedStyle(seam).display).toBe('block')
      act(() => navigator.pop())
      act(() => controllers.at(-1)!.finish())
    }
  } finally {
    stylesheet.remove()
    delete document.documentElement.dataset.satinViewportFit
  }
})

it("a List's layout margins follow its own width: 16 pt up to 402 pt, 20 pt beyond", () => {
  // iOS 27 native reference: Forms framed 300-402 pt inset cards 16 pt; 403-440 pt inset them 20 pt.
  const observers: ResizeObserverCallback[] = []
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        observers.push(callback)
      }
      observe() {}
      disconnect() {}
    },
  )
  const list = document.createElement('div')
  vi.spyOn(list, 'getBoundingClientRect').mockReturnValue({ width: 402 } as DOMRect)
  observeListLayoutMargins(list)
  expect(list.dataset.satinListMargins).toBe('compact')
  const resize = (inlineSize: number) =>
    observers[0]!([{ borderBoxSize: [{ inlineSize }] } as never], {} as ResizeObserver)
  resize(403)
  expect(list.dataset.satinListMargins).toBe('wide')
  resize(320)
  expect(list.dataset.satinListMargins).toBe('compact')
  // reference padding-list: a 440 pt List inside 40 pt horizontal safe-area padding keeps 16 pt.
  const padded = document.createElement('div')
  vi.spyOn(padded, 'getBoundingClientRect').mockReturnValue({ width: 440 } as DOMRect)
  observeListLayoutMargins(padded, 80)
  expect(padded.dataset.satinListMargins).toBe('compact')
  vi.unstubAllGlobals()
})

it('empty navigation titles resolve to inline while named and explicitly hidden titles keep their mode', () => {
  expect(screenNavigation({ title: '', display: 'large' }, undefined)?.display).toBe('inline')
  expect(screenNavigation(undefined, { titleDisplay: 'large' })?.display).toBe('inline')
  expect(screenNavigation({ title: 'Route', display: 'large' }, { title: '' })?.display).toBe(
    'inline',
  )
  expect(screenNavigation({ title: 'Route', display: 'large' }, {})?.display).toBe('large')
  expect(screenNavigation({ title: '', display: 'none' }, undefined)?.display).toBe('none')
  expect(screenNavigation({ title: ' ', display: 'large' }, undefined)?.display).toBe('large')
  const dynamic = {
    title: (params: unknown) => (params as { title: string }).title,
    display: 'large' as const,
  }
  expect(screenNavigation(dynamic, undefined, { title: '' })?.display).toBe('inline')
  expect(screenNavigation(dynamic, undefined, { title: 'Named' })?.display).toBe('large')
})

it('empty titles retain a control-demand bar and omit the bare root bar', () => {
  const scroller = mount(
    () => (
      <Screen
        title=""
        titleDisplay="large"
        toolbar={
          <ToolbarItem placement="topBarTrailing">
            <button>Menu</button>
          </ToolbarItem>
        }
      >
        <PublicList id="untitled">First row</PublicList>
      </Screen>
    ),
    { title: 'Route', display: 'large' },
  )('untitled')
  expect(
    element.querySelector<HTMLElement>('[data-satin-navigation-motion-layer]')?.dataset
      .satinScreenTitleDisplay,
  ).toBe('inline')
  expect(
    element.querySelector<HTMLElement>('[data-satin-navigation-title-layer]')?.dataset
      .satinNavigationTitleDisplay,
  ).toBe('inline')
  expect(scroller.dataset.satinListNavigation).toBe('inline')
  expect(element.querySelector('[data-satin-screen-title], [data-satin-list-title]')).toBeNull()
  expect(
    element.querySelector('[data-satin-navigation-toolbar-slot="trailing"]')?.textContent,
  ).toBe('Menu')
  act(() => root.unmount())
  root = createRoot(element)
  const scroll = mount(
    () => (
      <Screen title="" titleDisplay="large">
        <ScrollSurface id="untitled-scroll" axis="vertical">
          <p>First row</p>
        </ScrollSurface>
      </Screen>
    ),
    { title: '', display: 'large' },
  )('untitled-scroll')
  expect(scroll.dataset.satinScrollNavigation).toBe('hidden')
  expect(scroll.querySelector('h1')).toBeNull()
  act(() => root.unmount())
  root = createRoot(element)
  const absent = mount(
    () => (
      <Screen titleDisplay="large">
        <PublicList id="absent">First row</PublicList>
      </Screen>
    ),
    { title: '', display: 'large' },
  )('absent')
  expect(absent.dataset.satinScrollNavigation).toBe('hidden')
  expect(element.querySelector('[data-satin-screen-title], [data-satin-list-title]')).toBeNull()
})

it('a screen without a title keeps the inline bar geometry while it has bar items', () => {
  // iOS 27.0 native reference title-none: no title, a trailing Menu; content still insets 116 pt.
  const scroller = mount(
    () => (
      <Screen
        titleDisplay="none"
        toolbar={
          <ToolbarItem placement="topBarTrailing">
            <button>More</button>
          </ToolbarItem>
        }
      >
        <PublicList id="untitled">First row</PublicList>
      </Screen>
    ),
    { display: 'inline' },
  )('untitled')
  expect(scroller.dataset.satinListNavigation).toBe('inline')
  expect(element.querySelector('[data-satin-list-title]')).toBeNull()
})

it('draws navigationSubtitle under the inline title and under the large title', () => {
  mount(
    () => (
      <Screen title="Inbox" subtitle="12 unread" titleDisplay="large">
        <PublicList id="inbox">First row</PublicList>
      </Screen>
    ),
    { display: 'large' },
  )
  const bar = element.querySelector('[data-satin-navigation-title-content]')
  expect(bar?.querySelector('strong')?.textContent).toBe('Inbox')
  expect(bar?.querySelector('[data-satin-navigation-subtitle="true"]')?.textContent).toBe(
    '12 unread',
  )
  expect(
    element.querySelector('[data-satin-list-title] [data-satin-navigation-subtitle="large"]')
      ?.textContent,
  ).toBe('12 unread')
})

it('replaces expanded titles with intrinsic toolbar content and keeps the inline title', async () => {
  mount(
    () => (
      <Screen
        title="Messages"
        subtitle="Default subtitle"
        titleDisplay="large"
        toolbar={
          <>
            <ToolbarItem placement="largeTitle">
              <div>Avatar title</div>
            </ToolbarItem>
            <ToolbarItem placement="largeSubtitle">
              <div>Avatar subtitle</div>
            </ToolbarItem>
            <ToolbarItem placement="subtitle">
              <div>Inline subtitle</div>
            </ToolbarItem>
          </>
        }
      >
        <PublicList id="messages">First message</PublicList>
      </Screen>
    ),
    { display: 'large' },
  )
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0))
  })
  const expanded = element.querySelector('[data-satin-list-title]')!
  expect(expanded.textContent).toBe('Avatar titleAvatar subtitle')
  const inline = element.querySelector('[data-satin-navigation-title-content]')!
  expect(inline.textContent).toBe('MessagesInline subtitle')
})

it('reserves the measured inline subtitle stack and releases it when custom content is removed', async () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const height = this.textContent === 'Avatar' ? 82 : this.tagName === 'STRONG' ? 18.333333 : 0
    return {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 440,
      bottom: height,
      width: 440,
      height,
      toJSON: () => ({}),
    }
  })
  let showSubtitle = true
  const component = () => (
    <Screen
      title="Messages"
      titleDisplay="inline"
      toolbar={
        showSubtitle ? (
          <ToolbarItem placement="subtitle">
            <div>Avatar</div>
          </ToolbarItem>
        ) : undefined
      }
    >
      <PublicList id="conversation">First message</PublicList>
    </Screen>
  )
  mount(component, { display: 'inline' })
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0))
  })
  const screen = element.querySelector<HTMLElement>('[data-satin-screen-container]')!
  // The scroller inherits this measured size so its first message clears all title content.
  expect(screen.style.getPropertyValue('--satin-inline-title-content-height')).toBe('100.333333px')
  showSubtitle = false
  mount(component, { display: 'inline' })
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0))
  })
  expect(
    element
      .querySelector<HTMLElement>('[data-satin-screen-container]')!
      .style.getPropertyValue('--satin-inline-title-content-height'),
  ).toBe('0px')
})

it('keeps inlineLarge topBarLeading actions in the trailing group after scrolling', () => {
  const scroller = mount(
    () => (
      <Screen
        title="Messages"
        titleDisplay="inlineLarge"
        toolbar={
          <>
            <ToolbarItem placement="topBarLeading">
              <button>Compose</button>
            </ToolbarItem>
            <ToolbarItem placement="topBarTrailing">
              <button>More</button>
            </ToolbarItem>
            <ToolbarItem placement="cancellationAction">
              <button>Cancel</button>
            </ToolbarItem>
          </>
        }
      >
        <PublicList id="messages">First message</PublicList>
      </Screen>
    ),
    { display: 'inlineLarge' },
  )('messages')
  const trailing = element.querySelector('[data-satin-navigation-toolbar-slot="trailing"]')!
  expect(trailing.textContent).toBe('ComposeMore')
  expect(element.querySelector('[data-satin-navigation-toolbar-slot="leading"]')?.textContent).toBe(
    'Cancel',
  )
  act(() => {
    scroller.scrollTop = 620
    scroller.dispatchEvent(new Event('scroll'))
  })
  expect(trailing.textContent).toBe('ComposeMore')
})

it('renders each ToolbarItemGroup item and a direct ToolbarSpacer in the placement slot', () => {
  mount(
    () => (
      <Screen
        title="Toolbar"
        toolbar={
          <>
            <ToolbarItemGroup placement="topBarTrailing">
              <button>Share</button>
              <button>Add</button>
            </ToolbarItemGroup>
            <ToolbarSpacer sizing="fixed" placement="topBarTrailing" />
            <ToolbarItem placement="topBarTrailing">
              <button>More</button>
            </ToolbarItem>
          </>
        }
      >
        <PublicList id="items">First row</PublicList>
      </Screen>
    ),
    { display: 'inline' },
  )
  const slot = element.querySelector('[data-satin-navigation-toolbar-slot="trailing"]')!
  expect(
    [...slot.children].map(child =>
      child.matches('[data-satin-toolbar-item="item"]')
        ? child.textContent
        : child.getAttribute('data-satin-toolbar-spacer'),
    ),
  ).toEqual(['Share', 'Add', 'fixed', 'More'])
})

it('a top safeAreaInset keeps its List primary and puts the accessory after it on the top edge', () => {
  // iOS 27 native reference inset-top: the List still spans the screen under the bar and the banner
  // (adjusted inset 168.33 = 116 + 44.33 + 8); the banner sits on the safe area's top edge.
  const list = mount(
    () => (
      <Screen title="Inset" titleDisplay="inline">
        <SafeAreaInset edge="top" content={<div>Banner</div>}>
          <PublicList id="rows">Row 1</PublicList>
        </SafeAreaInset>
      </Screen>
    ),
    { display: 'inline' },
  )('rows')
  expect(list.dataset.satinPrimary).toBe('true')
  expect(list.dataset.satinListNavigation).toBe('inline')
  const inset = list.closest<HTMLElement>('[data-satin-safe-area-inset]')!
  expect(inset.dataset.satinSafeAreaInset).toBe('top')
  expect(inset.style.getPropertyValue('--satin-inset-spacing')).toBe('8px')
  expect(inset.lastElementChild?.getAttribute('data-satin-inset-accessory')).toBe('top')
})

it('safeAreaPadding and contentMargins reach the next scroll view and stop at it', () => {
  // iOS 27 native reference padding / margins-list: `.safeAreaPadding(.horizontal, 40)` + `(.top, 20)` insets
  // the content 40 pt each side and 20 pt below the bar; a nested scroll view is inside the
  // padded content, so it gets none of it.
  const find = mount(
    () => (
      <Screen title="Padding" titleDisplay="inline">
        <SafeAreaPadding edges="top" length={20}>
          <SafeAreaPadding edges="horizontal" length={40}>
            <ContentMargins edges="leading" length={10}>
              <ScrollSurface id="cards" axis="vertical">
                <p>Card 1</p>
                <ScrollSurface id="carousel" axis="horizontal">
                  <p>Item</p>
                </ScrollSurface>
              </ScrollSurface>
            </ContentMargins>
          </SafeAreaPadding>
        </SafeAreaPadding>
      </Screen>
    ),
    { display: 'inline' },
  )
  const cards = find('cards')
  expect(cards.dataset.satinSafeAreaExtra).toBe('true')
  expect(cards.style.getPropertyValue('--satin-extra-top')).toBe('20px')
  expect(cards.style.getPropertyValue('--satin-extra-leading')).toBe('40px')
  expect(cards.style.getPropertyValue('--satin-extra-trailing')).toBe('40px')
  expect(cards.style.getPropertyValue('--satin-content-margin-leading')).toBe('10px')
  // contentMargins is an environment value: the nested scroll view keeps it, but no padding.
  const carousel = find('carousel')
  expect(carousel.style.getPropertyValue('--satin-extra-leading')).toBe('0px')
  expect(carousel.style.getPropertyValue('--satin-content-margin-leading')).toBe('10px')
})

it('IgnoresSafeArea runs a primary scroll view under the bar; safeAreaBar has no spacing', () => {
  const find = mount(
    () => (
      <Screen title="Bar" titleDisplay="inline">
        <SafeAreaBar edge="top" content={<div>Filter</div>}>
          <IgnoresSafeArea edges="top">
            <ScrollSurface id="photos" axis="vertical">
              <p>Photo 1</p>
            </ScrollSurface>
          </IgnoresSafeArea>
        </SafeAreaBar>
      </Screen>
    ),
    { display: 'inline' },
  )
  const photos = find('photos')
  expect(photos.dataset.satinScrollNavigation).toBe('ignored')
  const bar = photos.closest<HTMLElement>('[data-satin-safe-area-inset]')!
  expect(bar.dataset.satinSafeAreaBar).toBe('top')
  expect(bar.style.getPropertyValue('--satin-inset-spacing')).toBe('0px')
})

it('a standalone ScrollView defaults to vertical and can scroll back to its top', () => {
  const handle = { current: null } as {
    current: import('./ScrollSurface.tsx').ScrollSurfaceHandle | null
  }
  act(() =>
    root.render(
      <ScrollSurface id="onboarding" ref={handle}>
        <p>Welcome</p>
      </ScrollSurface>,
    ),
  )
  const scroller = element.querySelector<HTMLElement>('[data-satin-scroll="onboarding"]')!
  expect(scroller.textContent).toBe('Welcome')
  scroller.scrollTop = 120
  handle.current!.scrollToTop()
  expect(scroller.scrollTop).toBe(0)
})

it('a screen ScrollView defaults to vertical and displays its large navigation title', () => {
  const scroller = mount(
    () => (
      <Screen title="Library" titleDisplay="large">
        <ScrollSurface id="default-axis">
          <p>Content</p>
        </ScrollSurface>
      </Screen>
    ),
    {},
  )('default-axis')
  expect(scroller.querySelector('h1')?.textContent).toBe('Library')
})

it('List can reveal its parent background without removing row backgrounds', () => {
  const style = document.createElement('style')
  style.textContent = readFileSync('src/styles.css', 'utf8')
  document.head.append(style)
  try {
    const scroller = mount(
      () => (
        <PublicList id="transparent" scrollContentBackground="hidden">
          <Section>
            <p>Row</p>
          </Section>
        </PublicList>
      ),
      {},
    )('transparent')
    expect(['transparent', 'rgba(0, 0, 0, 0)']).toContain(
      getComputedStyle(scroller).backgroundColor,
    )
    const rows = scroller.querySelector<HTMLElement>('[data-satin-section-rows]')!
    expect(['#fff', '#ffffff', 'rgb(255, 255, 255)']).toContain(
      getComputedStyle(rows).backgroundColor,
    )
  } finally {
    style.remove()
  }
})

it('custom List section spacing changes adjacent gaps and retains the terminal inset', () => {
  const style = document.createElement('style')
  style.textContent = readFileSync('src/styles.css', 'utf8')
  document.head.append(style)
  try {
    const scroller = mount(
      () => (
        <Screen title="Library" titleDisplay="large">
          <PublicList id="spacing" listSectionSpacing={12}>
            <Section>
              <p>First</p>
            </Section>
            <Section>
              <p>Last</p>
            </Section>
          </PublicList>
        </Screen>
      ),
      {},
    )('spacing')
    const sections = scroller.querySelectorAll('section')
    expect(getComputedStyle(sections[0]!).marginBottom).toBe('12px')
    expect(getComputedStyle(sections[1]!).marginBottom).toBe('20px')
  } finally {
    style.remove()
  }
})
