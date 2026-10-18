import { expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { TabBadge } from './TabBadge.tsx'

it.each([undefined, null, 0])('clears a badge with %s', value => {
  expect(renderToStaticMarkup(<TabBadge value={value} />)).toBe('')
})
it.each([1, 8, 12, 100])('renders count %i without truncating it', value => {
  expect(renderToStaticMarkup(<TabBadge value={value} />)).toBe(
    `<span data-satin-tab-badge="number">${value}</span>`,
  )
})
it('renders an attention dot without the word dot', () => {
  expect(renderToStaticMarkup(<TabBadge value="dot" />)).toBe(
    '<span data-satin-tab-badge="dot"></span>',
  )
})
