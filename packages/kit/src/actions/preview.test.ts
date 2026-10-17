// @vitest-environment happy-dom
import { frameworkStyleDeclarations } from '../../test/domStyles.ts'
import { expect, it, vi } from 'vitest'
import { contextPreviewSource, promoteContextSource } from './preview.ts'

it('lifts the original interactive row and restores its place without replacing its content', () => {
  const host = document.createElement('div')
  const row = document.createElement('div')
  const input = document.createElement('input')
  input.value = 'unsaved draft'
  row.append(input)
  host.append(row)
  document.body.append(host)
  row.style.color = 'red'
  Object.defineProperties(row, { offsetWidth: { value: 280 }, offsetHeight: { value: 64 } })
  vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({
    left: 20,
    top: 200,
    width: 280,
    height: 64,
  } as DOMRect)
  const lifted = promoteContextSource(row)
  expect(host.querySelector('input')).toBe(input)
  expect(row.parentElement).toBe(host)
  expect(row.style.position).toBe('fixed')
  expect(row.style.width).toBe('280px')
  input.value = 'edited during presentation'
  lifted.restore()
  expect(host.children).toHaveLength(1)
  expect(host.firstElementChild).toBe(row)
  expect(input.value).toBe('edited during presentation')
  expect(row.style.position).toBe('')
  expect(row.style.color).toBe('red')
  host.remove()
})

it('lifts non-row content itself, with its own paint, never the framework wrapper', () => {
  const host = document.createElement('div')
  host.innerHTML =
    '<div data-satin-row-action-content><div class="tile" style="border-radius: 8px"><img alt="" style="border-radius: 8px">Tidewater</div></div>'
  document.body.append(host)
  const tile = host.querySelector<HTMLElement>('.tile')!
  const source = contextPreviewSource(host, tile)
  expect(source).toBe(tile)
  const image = tile.querySelector('img')!
  vi.spyOn(image, 'getBoundingClientRect').mockReturnValue({
    left: 20,
    top: 40,
    width: 120,
    height: 120,
  } as DOMRect)
  const styled = vi.spyOn(window, 'getComputedStyle')
  const lifted = promoteContextSource(source)
  expect(tile.dataset.satinContextLift).toBe('content')
  // The top layer's UA canvas paint must not show behind the content.
  expect(tile.style.backgroundColor).toBe(getComputedStyle(host).backgroundColor)
  // Paint is read from the live source. Nothing display:none is inserted to sample it.
  for (const [element] of styled.mock.calls)
    expect((element as HTMLElement).style.display).not.toBe('none')
  const plate = document.querySelector<HTMLElement>('[data-satin-context-shadow]')
  const paint = plate?.querySelector<HTMLElement>('[data-satin-context-shadow-paint]')
  expect(plate).not.toBeNull()
  expect(tile.contains(plate)).toBe(false)
  expect(tile.style.filter).toBe('')
  expect(paint?.querySelector('.tile')).not.toBeNull()
  expect(paint?.querySelector('.tile')).not.toBe(tile)
  expect(paint?.textContent).toBe('Tidewater')
  // The artwork blur is a shape layer. The glyph copy does not include the image's alpha.
  expect(paint?.querySelector('img')?.style.visibility).toBe('hidden')
  const shape = plate?.querySelector<HTMLElement>('[data-satin-context-shadow-shape]')
  expect(shape?.style.width).toBe('120px')
  expect(shape?.style.height).toBe('120px')
  expect(shape?.style.borderRadius).toBe('8px')
  const css = frameworkStyleDeclarations()
  expect(css).toMatch(
    /\[data-satin-context-shadow-paint\]\s*\{[^}]*filter:\s*drop-shadow\(0 5px 46px rgb\(0 0 0 \/ 40%\)\)/,
  )
  expect(css).toMatch(
    /\[data-satin-context-shadow-shape\]\s*\{[^}]*box-shadow:\s*0 5px 46px rgb\(0 0 0 \/ 40%\)/,
  )
  expect(css).not.toMatch(/\[data-satin-context-lift='content'\]\s*\{[^}]*drop-shadow/)
  lifted.restore()
  expect(tile.hasAttribute('data-satin-context-lift')).toBe(false)
  expect(document.querySelector('[data-satin-context-shadow]')).toBeNull()
  styled.mockRestore()
  host.remove()
})

/** A chat bubble as a ContextMenu wraps it: the framework wrapper around one content element. */
function bubbleHost() {
  const host = document.createElement('div')
  host.dataset.satinRowActions = 'true'
  host.dataset.satinContextContent = 'true'
  host.innerHTML =
    '<div data-satin-row-action-content><span class="bubble-wrap"><span class="bubble">Good question.</span></span></div>'
  document.body.append(host)
  const wrap = host.querySelector<HTMLElement>('.bubble-wrap')!
  Object.defineProperties(wrap, { offsetWidth: { value: 300 }, offsetHeight: { value: 120 } })
  return { host, wrap, bubble: host.querySelector<HTMLElement>('.bubble')! }
}

it('resolves the same content for a press that starts while its previous lift is still up', () => {
  // Owner, Oct 13: back-to-back presses lifted the framework wrapper, whose cell paint showed as
  // white square corners behind the bubble. The previous lift's placeholder is not content.
  const { host, wrap, bubble } = bubbleHost()
  const lifted = promoteContextSource(wrap)
  expect(contextPreviewSource(host, bubble)).toBe(wrap)
  lifted.restore()
  expect(contextPreviewSource(host, bubble)).toBe(wrap)
  host.remove()
})

it('paints the shadow copy as its source paints in place, never as a list cell', () => {
  // The copy is mounted outside the source's ancestors. Content of several elements lifts the
  // wrapper, whose cell paint the content menu clears only in place.
  const { host, wrap } = bubbleHost()
  const style = document.createElement('style')
  style.textContent = `
    [data-satin-row-action-content] { background: #fff }
    [data-satin-context-content='true'] [data-satin-row-action-content] { background: none }
    [data-satin-row-actions] .bubble-wrap { padding-left: 6px }`
  document.head.append(style)
  const lifted = promoteContextSource(wrap)
  const copy = document.querySelector<HTMLElement>('[data-satin-context-shadow-paint] > *')!
  // Styles that depend on where the source sits (a bubble's tail padding) still apply to the copy.
  expect(getComputedStyle(copy).paddingLeft).toBe('6px')
  lifted.restore()
  const content = host.querySelector<HTMLElement>('[data-satin-row-action-content]')!
  content.append(document.createElement('span'))
  expect(contextPreviewSource(host, wrap)).toBe(content)
  const inPlace = getComputedStyle(content).backgroundColor
  const wrapper = promoteContextSource(content)
  const wrapperCopy = document.querySelector<HTMLElement>('[data-satin-context-shadow-paint] > *')!
  expect(getComputedStyle(wrapperCopy).backgroundColor).toBe(inPlace)
  expect(getComputedStyle(wrapperCopy).backgroundColor).not.toMatch(/255, 255, 255|#fff/)
  wrapper.restore()
  expect(document.querySelector('[data-satin-context-shadow]')).toBeNull()
  style.remove()
  host.remove()
})

it('measures the resting place once the source has left the layout', () => {
  // A bottom-anchored thread moves the placeholder while the source is briefly in flow beside it.
  // The lift must not read that as its scroller moving, which lands every dismissal at once.
  const { host, wrap } = bubbleHost()
  const original = HTMLElement.prototype.getBoundingClientRect
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this === wrap) return { left: 10, top: 400, width: 300, height: 120 } as DOMRect
    if (this.parentElement?.matches('[data-satin-row-action-content]')) {
      const inFlow = wrap.style.position !== 'fixed'
      return { left: 10, top: inFlow ? 280 : 400, width: 300, height: 120 } as DOMRect
    }
    return original.call(this)
  })
  const lifted = promoteContextSource(wrap)
  expect(lifted.moved()).toBe(false)
  lifted.restore()
  host.remove()
})
