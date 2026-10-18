// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { frameworkStyleDeclarations } from '../../test/domStyles.ts'
import { Section } from '../list-form/ListForm.tsx'
import { ForEach } from '../list-form/editing.tsx'
import { Button, List } from '../public/controls.tsx'
import { HStack, VStack, Text } from '../content/content.tsx'

afterEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})

it.each(
  (['plain', 'insetGrouped'] as const).flatMap(listStyle =>
    [false, true].map(active => ({ listStyle, active })),
  ),
)(
  'keeps the complete generic $listStyle row box inside the moving face, active=$active',
  ({ listStyle, active }) => {
    const style = document.createElement('style')
    // Happy DOM drops multiline complex selectors; preserve their declarations
    // and selector meaning while normalizing whitespace, as list style tests do.
    style.textContent = frameworkStyleDeclarations().replaceAll('\n', ' ')
    document.head.append(style)
    document.body.innerHTML = renderToStaticMarkup(
      <List id="owner-shopping-row" listStyle={listStyle}>
        <Section>
          <ForEach data={[2, 3]} id={lines => lines} onDelete={() => {}}>
            {lines => (
              <Button buttonStyle="plain" onPress={() => {}}>
                <HStack spacing={12}>
                  <VStack alignment="leading" spacing={2}>
                    <Text>½ red onion, thinly sliced</Text>
                    <Text font="footnote">Greek Salad</Text>
                    {lines === 3 && <Text font="footnote">Serves 4</Text>}
                  </VStack>
                </HStack>
              </Button>
            )}
          </ForEach>
        </Section>
      </List>,
    )
    const items = document.querySelectorAll<HTMLElement>('[data-satin-section-item]')
    expect(items.length).toBe(2)
    for (const item of items) {
      const face = item.querySelector<HTMLElement>('[data-satin-row-action-content]')!
      const host = item.querySelector<HTMLElement>('[data-satin-row-actions]')!
      host.setAttribute('data-satin-swipe-active', String(active))
      const outer = getComputedStyle(item)
      const inner = getComputedStyle(face)
      // Padding outside this face is excluded from clipping, action placement
      // and ResizeObserver measurement. The row must own it before any gesture.
      expect(outer.paddingBlock).toBe('')
      expect(outer.paddingInline).toBe('')
      expect(inner.paddingBlock).toBe('15px 15px')
      expect(getComputedStyle(face.querySelector('[data-satin-button-style]')!).display).toBe('block')
      expect(inner.paddingInline).toContain('20px')
    }
  },
)

it.each([
  { margins: 'compact', expected: '16px' },
  { margins: 'wide', expected: '20px' },
])('keeps $margins List margins inside a regular-width screen', ({ margins, expected }) => {
  const style = document.createElement('style')
  style.textContent = frameworkStyleDeclarations().replaceAll('\n', ' ')
  document.head.append(style)
  document.body.innerHTML = `<div data-satin-layout-horizontal="regular">
    <div data-satin-list="insetGrouped" data-satin-list-margins="${margins}"></div>
  </div>`
  const list = document.querySelector<HTMLElement>('[data-satin-list]')!
  const computed = getComputedStyle(list)
  expect(computed.getPropertyValue('--satin-list-layout-margin')).toBe(expected)
  // An ancestor padding override would bypass the width-owned token entirely.
  expect(computed.paddingInline.replaceAll(/\s+/g, ' ')).toBe(
    `max(0px, ${expected}) max(0px, ${expected})`,
  )
})

it.each(['plain', 'insetGrouped', 'grouped'] as const)(
  'reserves an empty header only for grouped styles: %s',
  listStyle => {
    const style = document.createElement('style')
    style.textContent = frameworkStyleDeclarations().replaceAll('\n', ' ')
    document.head.append(style)
    document.body.innerHTML = `<div data-satin-list="${listStyle}" data-satin-list-navigation="inline">
      <div data-satin-scroll-content><section data-satin-list-section="true"></section></div>
    </div>`
    const section = document.querySelector<HTMLElement>('section')!
    expect(Number.parseFloat(getComputedStyle(section).marginTop) || 0).toBe(
      listStyle === 'plain' ? 0 : 35,
    )
  },
)

it('preserves arbitrary section-content insets independently of native Button rows', () => {
  const style = document.createElement('style')
  style.textContent = frameworkStyleDeclarations().replaceAll('\n', ' ')
  document.head.append(style)
  document.body.innerHTML = '<div data-satin-section-item><div data-satin-content="vstack">Album grid</div></div>'
  expect(getComputedStyle(document.querySelector('[data-satin-section-item]')!).paddingBlock).toBe('14px 14px')
})
