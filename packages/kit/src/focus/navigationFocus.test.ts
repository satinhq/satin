// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  canReceiveFocus,
  firstVisibleControl,
  firstVisibleContent,
  createNavigationFocusRuntime,
} from './navigationFocus.ts'
import { createNavigator, navigatorTransitionRuntime } from '../navigation/store.ts'
import { createScreenRegistry, defineScreen } from '../navigation/registry.ts'
import { navigatorFocusRuntime } from './navigationFocus.ts'
import type { TransitionController } from '../navigation/types.ts'

afterEach(() => document.body.replaceChildren())
function setup() {
  const controllers: TransitionController[] = []
  const navigator = createNavigator({
    registry: createScreenRegistry(
      defineScreen('home', { component: () => null }),
      defineScreen('detail', { component: () => null }),
    ),
    initial: { id: 'home' },
    transitionControllerFactory: completion => {
      const controller = {
        progress: 0,
        finish: completion.finish,
        cancel: completion.cancel,
        setProgress() {},
        completeInteractive: completion.finish,
        cancelInteractive: completion.cancel,
      }
      controllers.push(controller)
      return controller
    },
  })
  const runtime = navigator[navigatorFocusRuntime]
  function bind() {
    const key = navigator.getState().entries.at(-1)!.key
    const element = document.createElement('div'),
      heading = document.createElement('h1'),
      button = document.createElement('button')
    heading.tabIndex = -1
    heading.textContent = key
    button.textContent = 'Open'
    element.append(heading, button)
    document.body.append(element)
    runtime.bind(key, { element, heading, title: key })
    return { key, element, heading, button }
  }
  const flush = (key: string) => runtime.flush(navigator.getState(), key, true)
  return { navigator, runtime, controllers, bind, flush }
}
describe('shipping navigation focus', () => {
  it('captures before publication and restores after pop with preventScroll', () => {
    const { navigator, controllers, bind, flush } = setup()
    const home = bind()
    home.button.focus()
    navigator.subscribe(() => {
      home.element.inert = navigator.getState().entries.length > 1
    })
    navigator.push('detail')
    const detail = bind()
    flush(detail.key)
    expect(document.activeElement).toBe(home.button)
    controllers.at(-1)!.finish()
    flush(detail.key)
    expect(document.activeElement).toBe(detail.heading)
    navigator.pop()
    controllers.at(-1)!.finish()
    flush(home.key)
    expect(document.activeElement).toBe(home.button)
  })
  it('preserves an incoming editor focused during the push even before keyboard reveal', () => {
    const { navigator, controllers, bind, flush } = setup()
    bind()
    navigator.push('detail')
    const detail = bind()
    const editor = document.createElement('input')
    detail.element.append(editor)
    editor.focus()
    flush(detail.key)
    expect(document.activeElement).toBe(editor)
    controllers.at(-1)!.finish()
    flush(detail.key)
    expect(document.activeElement).toBe(editor)
    expect(document.title).toBe(detail.key)
  })

  it('never moves into the revealed screen during a cancelled interactive pop', () => {
    const { navigator, controllers, bind, flush } = setup()
    const home = bind()
    navigator.push('detail')
    const detail = bind()
    controllers.at(-1)!.finish()
    flush(detail.key)
    detail.button.focus()
    const controller = navigator[navigatorTransitionRuntime].beginInteractivePop()!
    flush(home.key)
    expect(document.activeElement).toBe(detail.button)
    controller.cancelInteractive(0)
    flush(detail.key)
    expect(document.activeElement).toBe(detail.button)
  })
  it.each([false, true])('waits for both overlapping pops, reverse completion=%s', reverse => {
    const { navigator, controllers, bind, flush } = setup()
    const home = bind()
    home.button.focus()
    navigator.push('detail')
    bind()
    controllers.at(-1)!.finish()
    navigator.push('detail')
    bind()
    controllers.at(-1)!.finish()
    navigator.pop()
    const first = controllers.at(-1)!
    navigator.pop()
    const second = controllers.at(-1)!
    const order = reverse ? [second, first] : [first, second]
    document.body.focus()
    order[0]!.finish()
    flush(home.key)
    order[1]!.finish()
    flush(home.key)
    expect(document.activeElement).toBe(home.button)
  })
  it('uses the heading when the saved element was removed, disabled or hidden', () => {
    for (const mutate of [
      (node: HTMLElement) => node.remove(),
      (node: HTMLElement) => node.setAttribute('disabled', ''),
      (node: HTMLElement) => node.setAttribute('hidden', ''),
    ]) {
      const { navigator, controllers, bind, flush } = setup()
      const home = bind()
      home.button.focus()
      navigator.push('detail')
      bind()
      controllers.at(-1)!.finish()
      mutate(home.button)
      navigator.pop()
      controllers.at(-1)!.finish()
      flush(home.key)
      expect(document.activeElement).toBe(home.heading)
    }
  })
  it('focuses replacement and selected detail, and holds an unmounted target', () => {
    const { navigator, controllers, bind, flush } = setup()
    bind()
    navigator.replace('detail')
    controllers.at(-1)!.finish()
    const key = navigator.getState().entries.at(-1)!.key
    flush(key)
    const detail = bind()
    flush(key)
    expect(document.activeElement).toBe(detail.heading)
    navigator.selectDetail('home')
    const selected = bind()
    flush(selected.key)
    expect(document.activeElement).toBe(detail.heading)
    expect(selected.element.contains(document.activeElement)).toBe(false)
  })
  it('does not steal focus from a modal or inactive tab', () => {
    const runtime = createNavigationFocusRuntime(),
      element = document.createElement('div'),
      heading = document.createElement('h1')
    heading.tabIndex = -1
    element.append(heading)
    document.body.append(element)
    runtime.bind('a', { element, heading, title: 'A' })
    runtime.request('a', 'push')
    const state = { entries: [] }
    runtime.flush(state, 'a', false)
    expect(document.activeElement).not.toBe(heading)
    const dialog = document.createElement('dialog')
    dialog.open = true
    document.body.append(dialog)
    runtime.flush(state, 'a', true)
    expect(document.activeElement).not.toBe(heading)
    dialog.remove()
    runtime.flush(state, 'a', true)
    expect(document.activeElement).toBe(heading)
  })
  it('rejects a saved target in a hidden or foreign scope', () => {
    const button = document.createElement('button'),
      scope = document.createElement('div')
    document.body.append(button, scope)
    expect(canReceiveFocus(button, scope)).toBe(false)
    scope.append(button)
    scope.setAttribute('aria-hidden', 'true')
    expect(canReceiveFocus(button, scope)).toBe(false)
  })
})

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    x: 10,
    y: 10,
    left: 10,
    top: 10,
    right: 210,
    bottom: 54,
    width: 200,
    height: 44,
    toJSON() {},
  }))
})
afterEach(() => vi.restoreAllMocks())

it('waits for chrome registration, then keeps the provisional compact Back policy', () => {
  const runtime = createNavigationFocusRuntime(),
    element = document.createElement('div'),
    hidden = document.createElement('h1')
  hidden.tabIndex = -1
  hidden.style.clipPath = 'inset(50%)'
  element.append(hidden)
  document.body.append(element)
  runtime.bind('detail', { element, title: 'Detail', heading: hidden, chromeExpected: true })
  runtime.request('detail', 'push')
  runtime.flush({ entries: [] }, 'detail', true)
  expect(document.activeElement).not.toBe(hidden)
  const header = document.createElement('header'),
    back = document.createElement('button'),
    title = document.createElement('strong')
  title.tabIndex = -1
  header.append(back, title)
  document.body.append(header)
  runtime.bindChrome('detail', { element: header, heading: title, back })
  runtime.flush({ entries: [] }, 'detail', true)
  expect(document.activeElement).toBe(back)
  // Chrome capture survives cancellation despite being outside the screen DOM.
  back.focus()
  runtime.capture(['detail'])
  runtime.request('detail', 'transition-cancel')
  title.focus()
  runtime.flush({ entries: [] }, 'detail', true)
  expect(document.activeElement).toBe(back)
})
it('selects the painted inline title for split detail without a Back button', () => {
  const runtime = createNavigationFocusRuntime(),
    element = document.createElement('div'),
    header = document.createElement('header'),
    heading = document.createElement('strong')
  heading.tabIndex = -1
  heading.setAttribute('role', 'heading')
  header.append(heading)
  document.body.append(element, header)
  runtime.bind('detail', { element, title: 'Detail' })
  runtime.bindChrome('detail', { element: header, heading, back: null })
  runtime.request('detail', 'push')
  runtime.flush({ entries: [] }, 'detail', true)
  expect(document.activeElement).toBe(heading)
})
it('holds a pending destination with no visible target instead of focusing an empty box', () => {
  const runtime = createNavigationFocusRuntime(),
    element = document.createElement('div'),
    heading = document.createElement('h1')
  heading.tabIndex = -1
  element.append(heading)
  document.body.append(element)
  const bounds = vi.spyOn(heading, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1, 1))
  runtime.bind('a', { element, heading, title: 'A' })
  runtime.request('a', 'push')
  runtime.flush({ entries: [] }, 'a', true)
  expect(document.activeElement).not.toBe(heading)
  bounds.mockReturnValue(new DOMRect(20, 80, 120, 41))
  runtime.flush({ entries: [] }, 'a', true)
  expect(document.activeElement).toBe(heading)
})
it('restores the invoker after completing an interactive pop', () => {
  const { navigator, controllers, bind, flush } = setup()
  const home = bind()
  home.button.focus()
  navigator.push('detail')
  const detail = bind()
  controllers.at(-1)!.finish()
  flush(detail.key)
  const controller = navigator[navigatorTransitionRuntime].beginInteractivePop()!
  flush(home.key)
  expect(document.activeElement).toBe(detail.heading)
  controller.completeInteractive(0)
  flush(home.key)
  expect(document.activeElement).toBe(home.button)
})

it('pushes to readable body content before Back or the navigation title', () => {
  const runtime = createNavigationFocusRuntime(),
    element = document.createElement('div')
  const body = document.createElement('p'),
    header = document.createElement('header'),
    back = document.createElement('button'),
    title = document.createElement('h1')
  body.textContent = 'Detail content'
  title.tabIndex = -1
  element.append(body)
  header.append(back, title)
  document.body.append(element, header)
  runtime.bind('detail', { element, title: 'Detail', chromeExpected: true, contentFirst: true })
  runtime.bindChrome('detail', { element: header, back, heading: title })
  runtime.request('detail', 'push')
  runtime.flush({ entries: [] }, 'detail', true)
  expect(document.activeElement).toBe(body)
  expect(body.tabIndex).toBe(-1)
})
it('retains the sidebar invoker on selection but focuses programmatic selection with no invoker', () => {
  const { navigator, bind, flush } = setup()
  const home = bind()
  home.button.focus()
  navigator.selectDetail('detail')
  const detail = bind()
  flush(detail.key)
  expect(document.activeElement).toBe(home.button)
  home.button.remove()
  navigator.selectDetail('detail')
  const replacement = bind()
  flush(replacement.key)
  expect(document.activeElement).toBe(replacement.heading)
})

it('skips decorative and nameless content without adding tabindex', () => {
  const scope = document.createElement('div')
  scope.innerHTML = `<img alt=""><img alt="   "><img alt="Decorative" role="presentation">
    <img alt="Decorative" role="none"><button></button><div role="button"></div>
    <p><span aria-hidden="true">Hidden name</span></p><p><span style="display:none">Hidden text</span></p>
    <button><img alt=""></button><p>Readable content</p>`
  document.body.append(scope)
  const content = scope.lastElementChild!
  expect(firstVisibleContent(scope)).toBe(content)
  for (const skipped of [...scope.children].slice(0, -1))
    expect(skipped.hasAttribute('tabindex')).toBe(false)
  expect(content.getAttribute('tabindex')).toBe('-1')
})
it.each([
  '<img alt="Trail map">',
  '<button aria-label="Open settings"></button>',
  '<button aria-labelledby="label"></button><span id="label">Open settings</span>',
  '<input id="field"><label for="field">Name</label>',
  '<button><span role="presentation">Save</span></button>',
])('accepts meaningfully named content: %s', html => {
  const scope = document.createElement('div')
  scope.innerHTML = html
  document.body.append(scope)
  expect(firstVisibleContent(scope)).toBe(scope.firstElementChild)
})
it.each([
  [false, 'push'],
  [undefined, 'push'],
  [true, 'select-detail'],
  [true, 'replace'],
  [true, 'pop'],
  [true, 'dismiss'],
  [true, 'transition-cancel'],
] as const)(
  'preserves heading-first fallback for contentFirst=%s, reason=%s',
  (contentFirst, reason) => {
    const runtime = createNavigationFocusRuntime(),
      element = document.createElement('div'),
      chrome = document.createElement('header')
    element.innerHTML = '<p>Introduction</p><h1 tabindex="-1">Content heading</h1>'
    chrome.innerHTML = '<h1 tabindex="-1">Navigation heading</h1>'
    document.body.append(element, chrome)
    runtime.bind('page', { element, title: 'Page', contentFirst })
    const heading = chrome.firstElementChild as HTMLElement
    const unbind = runtime.bindChrome('page', { element: chrome, heading, back: null })
    runtime.request('page', reason)
    runtime.flush({ entries: [] }, 'page', true)
    expect(document.activeElement).toBe(heading)
    expect(element.querySelector('p')!.hasAttribute('tabindex')).toBe(false)
    unbind()
    runtime.request('page', reason)
    runtime.flush({ entries: [] }, 'page', true)
    expect(document.activeElement).toBe(element.querySelector('h1'))
  },
)

it('keeps replacement fallback distinct from a measured push through the store', () => {
  const { navigator, controllers, bind, runtime, flush } = setup()
  bind()
  navigator.replace('detail')
  const detail = bind()
  const paragraph = document.createElement('p')
  paragraph.textContent = 'Introduction'
  detail.element.prepend(paragraph)
  runtime.bind(detail.key, { element: detail.element, title: 'Detail', contentFirst: true })
  controllers.at(-1)!.finish()
  flush(detail.key)
  expect(document.activeElement).toBe(detail.heading)
  expect(paragraph.hasAttribute('tabindex')).toBe(false)
})

it('skips a pinned resting search field for restoration while keeping user focus available', () => {
  const scope = document.createElement('div')
  scope.innerHTML =
    '<div data-satin-search><input type="search"></div><button>Conversation</button>'
  document.body.append(scope)
  const field = scope.querySelector('input')!
  expect(canReceiveFocus(field)).toBe(true)
  expect(firstVisibleControl(scope)).toBe(scope.querySelector('button'))
  field.parentElement!.setAttribute('data-satin-search-presented', '')
  expect(firstVisibleControl(scope)).toBe(field)
})
