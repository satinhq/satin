// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { afterEach, expect, it } from 'vitest'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Pressable } from '../press/Pressable.tsx'
import { HStack, VStack } from '../content/content.tsx'
import { ListRow, NavigationRow } from './ListForm.tsx'
import { Button } from '../public/controls.tsx'

// A semantic content wrapper must receive the same proposal as a div. Otherwise
// intrinsic album artwork shrink-wraps a header at 1000pt inside a 1194pt iPad row.
afterEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})
it.each([
  'header',
  'footer',
  'section',
  'article',
  'main',
  'aside',
  'nav',
  'figure',
  'ul',
  'ol',
  'dl',
  'blockquote',
])('stretches %s row content without changing the width of intrinsic controls', tag => {
  const style = document.createElement('style')
  style.textContent = readFileSync('src/styles.css', 'utf8').replaceAll('\n', ' ')
  document.head.append(style)
  for (const attribute of ['data-satin-section-item', 'data-satin-list-row-options']) {
    const row = document.createElement('div')
    row.setAttribute(attribute, 'true')
    const content = document.createElement(tag)
    content.innerHTML = '<img width="1000" height="1000" alt="">'
    const button = document.createElement('button')
    button.setAttribute('data-satin-row-intrinsic', 'true')
    button.textContent = 'Play'
    row.append(content, button)
    document.body.append(row)
    expect(getComputedStyle(content).width).toBe('100%')
    expect(getComputedStyle(content).minWidth).toBe('0')
    expect(getComputedStyle(button).width).not.toBe('100%')
  }
})

function CustomWrapper({ children }: { children: ReactNode }) {
  return createElement('album-content', null, children)
}

const authoredContent = [
  [
    'block span',
    <span style={{ display: 'block' }}>
      <img width="1000" height="1000" alt="" />
    </span>,
  ],
  [
    'custom component',
    <CustomWrapper>
      <img width="1000" height="1000" alt="" />
    </CustomWrapper>,
  ],
  [
    'Pressable with an explicit fill label',
    <Pressable onPress={() => {}}>
      <VStack frame={{ maxWidth: 'infinity' }}>
        <img width="1000" height="1000" alt="" />
      </VStack>
    </Pressable>,
  ],
] as const
for (const attribute of ['data-satin-section-item', 'data-satin-list-row-options']) {
  it.each(authoredContent)(`proposes the full width through %s in ${attribute}`, (_, sample) => {
    const style = document.createElement('style')
    style.textContent = readFileSync('src/styles.css', 'utf8').replaceAll('\n', ' ')
    document.head.append(style)
    const row = document.createElement('div')
    row.setAttribute(attribute, 'true')
    row.innerHTML = renderToStaticMarkup(sample)
    document.body.append(row)
    const content = row.firstElementChild!
    expect(getComputedStyle(content).width, content.tagName).toBe('100%')
    expect(getComputedStyle(content).minWidth, content.tagName).toBe('0')
  })
}

it('lets content decline the proposal and keeps replaced elements intrinsically sized', () => {
  const style = document.createElement('style')
  style.textContent = readFileSync('src/styles.css', 'utf8').replaceAll('\n', ' ')
  document.head.append(style)
  const row = document.createElement('div')
  row.setAttribute('data-satin-list-row-options', 'true')
  row.innerHTML =
    '<header style="width:240px;min-width:120px">Sized by content</header><img width="1000" height="1000" alt=""><video width="320"></video>'
  document.body.append(row)
  expect(getComputedStyle(row.children[0]).width).toBe('240px')
  expect(getComputedStyle(row.children[0]).minWidth).toBe('120px')
  for (const media of [...row.children].slice(1)) {
    expect(getComputedStyle(media).width).not.toBe('100%')
  }
})

it.each(['plain', 'borderless', 'bordered', 'borderedProminent', 'glass'] as const)(
  'keeps the stock %s Button intrinsic while its label can request fill',
  buttonStyle => {
    const style = document.createElement('style')
    style.textContent = readFileSync('src/styles.css', 'utf8').replaceAll('\n', ' ')
    document.head.append(style)
    const row = document.createElement('div')
    row.setAttribute('data-satin-list-row-options', 'true')
    row.innerHTML = renderToStaticMarkup(
      <Button buttonStyle={buttonStyle} onPress={() => {}}>
        Play
      </Button>,
    )
    document.body.append(row)
    const control = row.firstElementChild!
    expect(control.getAttribute('data-satin-row-intrinsic')).toBe('true')
    expect(getComputedStyle(control).width).not.toBe('100%')
    row.innerHTML = renderToStaticMarkup(
      <Button buttonStyle={buttonStyle} onPress={() => {}}>
        <span data-satin-content-width="fill">Play</span>
      </Button>,
    )
    expect(getComputedStyle(row.firstElementChild!).width).toBe('100%')
  },
)

it('fills a composite list row through stacks while preserving the independent leading button', () => {
  const style = document.createElement('style')
  style.textContent = readFileSync('src/styles.css', 'utf8').replaceAll('\n', ' ')
  document.head.append(style)
  document.body.innerHTML = renderToStaticMarkup(
    <ListRow>
      <VStack alignment="leading">
        <HStack>
          <Button buttonStyle="plain" onPress={() => {}}>
            Complete
          </Button>
          <NavigationRow label="Read a book" onPress={() => {}} />
        </HStack>
      </VStack>
    </ListRow>,
  )
  for (const stack of document.querySelectorAll('[data-satin-content]')) {
    expect(getComputedStyle(stack).width).toBe('100%')
  }
  const row = document.querySelector('[data-satin-list-row-options]')!
  expect(getComputedStyle(row).paddingInline).toContain('20px')
  const [complete, link] = document.querySelectorAll('button')
  expect(getComputedStyle(complete!).width).not.toBe('100%')
  expect(getComputedStyle(link!).paddingInline).toBe('0')
  expect(getComputedStyle(link!).flexGrow).toBe('1')
  expect(getComputedStyle(link!).flexBasis).toBe('0%')
})

it('applies explicit composite insets once and keeps a single navigation row unchanged', () => {
  const style = document.createElement('style')
  style.textContent = readFileSync('src/styles.css', 'utf8').replaceAll('\n', ' ')
  document.head.append(style)
  document.body.innerHTML = renderToStaticMarkup(
    <>
      <ListRow listRowInsets={{ leading: 12, trailing: 16 }}>
        <HStack style={{ width: 240 }}>
          <Button buttonStyle="plain" onPress={() => {}}>
            Complete
          </Button>
          <NavigationRow label="Read a book" onPress={() => {}} />
        </HStack>
      </ListRow>
      <ListRow>
        <NavigationRow label="All tasks" onPress={() => {}} />
      </ListRow>
      <ListRow>
        <HStack>
          <div data-satin-list="insetGrouped">
            <NavigationRow label="Nested task" onPress={() => {}} />
          </div>
        </HStack>
      </ListRow>
    </>,
  )
  const [composite, single, nested] = document.querySelectorAll('[data-satin-list-row-options]')
  expect(getComputedStyle(composite!).paddingInline).toContain(
    'var(--satin-row-inset-leading, 20px)',
  )
  expect(getComputedStyle(composite!.firstElementChild!).width).toBe('240px')
  expect(getComputedStyle(composite!.querySelector('[data-satin-row]')!).paddingInline).toBe('0')
  expect(getComputedStyle(single!).paddingInline).toBe('')
  expect(getComputedStyle(single!.firstElementChild!).paddingInline).toContain('20px')
  expect(getComputedStyle(nested!.querySelector('[data-satin-row]')!).paddingInline).toContain(
    '20px',
  )
})

// A ListRow with several direct children is one row: the ListRow is the HStack.
// B3's habit row (check Button + NavigationLink) stacked them vertically before.
it('lays out several direct ListRow children as one HStack row with a filling link', () => {
  const style = document.createElement('style')
  style.textContent = readFileSync('src/styles.css', 'utf8').replaceAll('\n', ' ')
  document.head.append(style)
  document.body.innerHTML = renderToStaticMarkup(
    <ListRow>
      <Button buttonStyle="plain" onPress={() => {}}>
        Complete
      </Button>
      <NavigationRow label="Read a book" onPress={() => {}} />
    </ListRow>,
  )
  const row = document.querySelector<HTMLElement>('[data-satin-list-row-options]')!
  const rowStyle = getComputedStyle(row)
  expect(rowStyle.display).toBe('flex')
  expect(rowStyle.alignItems).toBe('center')
  expect(rowStyle.gap).toBe('8px')
  expect(rowStyle.paddingInline).toContain('var(--satin-row-inset-leading, 20px)')
  expect(rowStyle.paddingInline).toContain('var(--satin-row-inset-trailing, 20px)')
  const [complete, link] = row.children
  expect(getComputedStyle(complete!).width).not.toBe('100%')
  expect(getComputedStyle(link!).flexGrow).toBe('1')
  expect(getComputedStyle(link!).flexBasis).toBe('0%')
  expect(getComputedStyle(link!).paddingInline).toBe('0')
  // The disclosure closes the link, so a filling link puts it at the trailing inset.
  const trailing = link!.lastElementChild!
  expect(trailing.hasAttribute('data-satin-row-trailing')).toBe(true)
  expect(trailing.querySelector('[data-satin-settings-disclosure]')).not.toBeNull()
})

it('applies explicit insets once to direct children, like the HStack composition', () => {
  const style = document.createElement('style')
  style.textContent = readFileSync('src/styles.css', 'utf8').replaceAll('\n', ' ')
  document.head.append(style)
  document.body.innerHTML = renderToStaticMarkup(
    <ListRow listRowInsets={{ leading: 12, trailing: 16 }}>
      <Button buttonStyle="plain" onPress={() => {}}>
        Complete
      </Button>
      <NavigationRow label="Read a book" onPress={() => {}} />
    </ListRow>,
  )
  const row = document.querySelector<HTMLElement>('[data-satin-list-row-options]')!
  expect(row.style.getPropertyValue('--satin-row-inset-leading')).toBe('12px')
  expect(getComputedStyle(row).paddingInline).toContain('var(--satin-row-inset-leading, 20px)')
  expect(getComputedStyle(row.querySelector('[data-satin-row]')!).paddingInline).toBe('0')
})

it('keeps single-child, presentation-sibling and HStack ListRows on their existing layout', () => {
  const style = document.createElement('style')
  style.textContent = readFileSync('src/styles.css', 'utf8').replaceAll('\n', ' ')
  document.head.append(style)
  document.body.innerHTML = renderToStaticMarkup(
    <>
      <ListRow>
        <NavigationRow label="All tasks" onPress={() => {}} />
      </ListRow>
      <ListRow>
        <NavigationRow label="Details" onPress={() => {}} />
        <dialog />
        <div hidden />
      </ListRow>
      <ListRow>
        <HStack>
          <Button buttonStyle="plain" onPress={() => {}}>
            Complete
          </Button>
          <NavigationRow label="Read a book" onPress={() => {}} />
        </HStack>
      </ListRow>
    </>,
  )
  const [single, presenting, stacked] = document.querySelectorAll<HTMLElement>(
    '[data-satin-list-row-options]',
  )
  for (const row of [single!, presenting!]) {
    expect(getComputedStyle(row).display).not.toBe('flex')
    expect(getComputedStyle(row).paddingInline).toBe('')
    const link = row.querySelector('[data-satin-row]')!
    expect(getComputedStyle(link).paddingInline).toContain('20px')
    expect(getComputedStyle(link).flexGrow).not.toBe('1')
  }
  // The HStack, not the ListRow, is the stack: the ListRow keeps its block box.
  expect(getComputedStyle(stacked!).display).not.toBe('flex')
  expect(getComputedStyle(stacked!).gap).toBe('')
  expect(getComputedStyle(stacked!).paddingInline).toContain('20px')
  const link = stacked!.querySelector('[data-satin-row]')!
  expect(getComputedStyle(link).flexGrow).toBe('1')
  expect(getComputedStyle(link).paddingInline).toBe('0')
})
