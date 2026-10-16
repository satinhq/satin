import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

function declarations(css: string, selector: string) {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) return ''
  return css.slice(start, css.indexOf('}', start))
}

// reference item 4 (native header-styles scopes, iOS 27.0): with search presented, content under the
// drawer is washed 53% white down to ~75 pt and is clear again by ~165 pt (y = 62 + 103), so the
// tiles under the scope bar stay saturated. Satin washed 77% white flat to 210 pt.
it('fades the presented search edge out above the content under the scope bar', () => {
  const css = readFileSync('src/styles.css', 'utf8').replace(/\s+/g, ' ')
  const presented = declarations(
    css,
    ":where(html:not([data-satin-appearance='dark'])) [data-satin-search-presented] > [data-satin-search-edge]::before",
  )
  expect(presented).toContain('background: rgb(255 255 255 / 0.53)')
  const mask = declarations(css, '[data-satin-search-presented] > [data-satin-search-edge]::before')
  expect(mask).toContain('mask-image: linear-gradient(to bottom, #000 13px, transparent 103px)')
  const strip = declarations(css, '[data-satin-search][data-satin-search-presented]::before')
  expect(strip).toContain('background: rgb(255 255 255 / 0.53)')
})

// Automatic drawers leave with the list; explicitly fixed drawers still pin.
it('lets an automatic drawer scroll away and gives its first grouped card the native gap', () => {
  const css = readFileSync('src/styles.css', 'utf8').replace(/\s+/g, ' ')
  expect(
    declarations(
      css,
      '[data-satin-search][data-satin-search-automatic]:not([data-satin-search-presented])',
    ),
  ).toContain('position: relative')
  expect(
    declarations(
      css,
      "[data-satin-list='insetGrouped'][data-satin-searchable] > [data-satin-search-suggestions] + [data-satin-section-item]",
    ),
  ).toContain('margin-top: 0')
})
